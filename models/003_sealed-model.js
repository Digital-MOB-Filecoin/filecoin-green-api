'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class SealedModel {
    constructor(pool) {
        this.code_name = 'SealedModel';
        this.pool = pool;
        this.name = 'Data storage capacity added per day';
        this.category = CATEGORY.CAPACITY;
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.GiB;
        this.version = VERSION.v0;
    }

    Name() {
        return this.name;
    }

    CodeName() {
        return this.code_name;
    }

    Category() {
        return this.category;
    }

    Details() {
        return `**Network view:** New data storage capacity added to Filecoin’s decentralized storage network (sealed) per day.

**Storage Provider (SP) view:** The amount of new data storage contributed to the network (sealed) by this SP per day.
`;
    }

    async NetworkQuery(formula, start, end, filter) {
        var result;

        try {
                result = await this.pool.query(`
                SELECT
                value,
                timestamp AS start_date
                FROM (
                    SELECT
                        ${formula}                             AS value,
                        date_trunc('${filter}', date::date) AS timestamp
                        FROM fil_network_view_days
                        WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY timestamp
                        ORDER BY timestamp
                ) q;`);
        } catch (e) {
            ERROR(`[SealedModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async MinerQuery(formula, start, end, filter, miner) {
        var result;

        try {
                result = await this.pool.query(`
                SELECT
                value,
                timestamp AS start_date
                FROM (
                    SELECT
                        ${formula}                   AS value,
                        date_trunc('${filter}', date::date) AS timestamp
                    FROM fil_miner_view_days_v4
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner,timestamp
                    ORDER BY timestamp
             ) q;`);
        } catch (e) {
            ERROR(`[SealedModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async CountryQuery(formula, start, end, filter, country) {
        var result;

        try {
            result = await this.pool.query(`
                SELECT
                ROUND(AVG(value)) as value,
                date_trunc('${filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM(total_per_day) AS value,
                        date
                    FROM fil_miners_data_view_country
                    WHERE (country='${country}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY country, date
             ) q GROUP BY start_date ORDER BY start_date;
                `);
        } catch (e) {
            ERROR(`[CapacityModel] CountryQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableSealed(start, end, filter, miner, country) {
        var result;

        if (miner) {
            result = await this.MinerQuery('ROUND(AVG(total_per_day))', start, end, filter, miner);
        } else if (country) {
            result = await this.CountryQuery('', start, end, filter, country);
        } else {
            result = await this.NetworkQuery('ROUND(AVG(total_per_day))', start, end, filter);
        }

        return result;
    }

    async Query(id, start, end, filter, miner, country) {
        INFO(`Query[${this.name}] id: ${id}, start: ${start}, end: ${end}, filter: ${filter}, miner: ${miner}, country: ${country}`);

        let result = {
            id : id,
            code_name: this.code_name,
            name : this.name,
            category : this.category,
            x : this.x,
            y : this.y,
            version : this.version,
            filter : filter,
            miner : miner,
            data : [] // [ {title: 'variable 1', data: []} , {title: 'variable 2', data: []} ]
        }

        // variable 1 - Sealed
        let sealedData = await this.VariableSealed(start, end, filter, miner, country);
        let sealedVariable = {
            title: 'Capacity per day',
            color: COLOR.green,
            data: sealedData,
        }

        result.data.push(sealedVariable);

        return result;
    }

    async Export(id, start, end, miner, offset, limit, filter) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['miner','sealed_GiB','timestamp'];
                    result = await this.pool.query(`SELECT miner,\
                    ROUND(AVG(total_per_day)) as \"sealed_GiB\",\
                    date_trunc('${filter}', date::date) AS timestamp \
                    FROM fil_miner_view_days_v4 \
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date) \
                    GROUP BY miner, timestamp 
                    ORDER BY timestamp LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['sealed_GiB','timestamp'];
                    result = await this.pool.query(`SELECT \
                    ROUND(AVG(total_per_day)) as \"sealed_GiB\",\
                    date_trunc('${filter}', date::date) AS timestamp \
                    FROM fil_network_view_days \
                    WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date) \
                    GROUP BY timestamp 
                    ORDER BY timestamp LIMIT ${limit} OFFSET ${offset}`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[SealedModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

    async ResearchExport(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`ResearchExport[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['epoch','miner','sealed_this_epoch_GiB','timestamp'];
                    result = await this.pool.query(`SELECT epoch,miner,total_per_epoch as \"sealed_this_epoch_GiB\",timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['epoch','sealed_this_epoch_GiB','timestamp'];
                    result = await this.pool.query(`SELECT epoch,total_per_epoch as \"sealed_this_epoch_GiB\",timestamp \
                    FROM fil_network_view_epochs \
                    WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[SealedModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    SealedModel
};
