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

    async NetworkQuery(params) {
        var result;

        try {
                result = await this.pool.query(`
                SELECT
                ROUND(AVG(value)) as value,
                date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM(total_per_day) AS value,
                        date
                    FROM fil_miners_data_view_country
                    WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY date
             ) q GROUP BY start_date ORDER BY start_date;
             `);
        } catch (e) {
            ERROR(`[SealedModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async MinerQuery(params) {
        var result;

        try {
                result = await this.pool.query(`
                SELECT
                value,
                timestamp AS start_date
                FROM (
                    SELECT
                        ROUND(AVG(total_per_day)) AS value,
                        date_trunc('${params.filter}', date::date) AS timestamp
                    FROM fil_miners_data_view_country
                    WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY timestamp
                    ORDER BY timestamp
             ) q;`);
        } catch (e) {
            ERROR(`[SealedModel] MinerQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async CountryQuery(params) {
        var result;

        try {
            result = await this.pool.query(`
                SELECT
                ROUND(AVG(value)) as value,
                date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM(total_per_day) AS value,
                        date
                    FROM fil_miners_data_view_country
                    WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY country, date
             ) q GROUP BY start_date ORDER BY start_date;
                `);
        } catch (e) {
            ERROR(`[CapacityModel] CountryQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async VariableSealed(params) {
        var result;

        if (params.miners) {
            result = await this.MinerQuery(params);
        } else if (params.country) {
            result = await this.CountryQuery(params);
        } else {
            result = await this.NetworkQuery(params);
        }

        return result;
    }

    async Query(id, params) {
        INFO(`Query[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        let result = {
            id : id,
            code_name: this.code_name,
            name : this.name,
            category : this.category,
            x : this.x,
            y : this.y,
            version : this.version,
            filter : params.filter,
            miner : params.miners,
            data : [] // [ {title: 'variable 1', data: []} , {title: 'variable 2', data: []} ]
        }

        // variable 1 - Sealed
        let sealedData = await this.VariableSealed(params);
        let sealedVariable = {
            title: 'Capacity per day',
            color: COLOR.green,
            data: sealedData,
        }

        result.data.push(sealedVariable);

        return result;
    }

    async Export(id, params) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
                let result;

                if (params.miners) {
                    fields = ['miner','sealed_GiB','timestamp'];
                    result = await this.pool.query(`SELECT miner,\
                    ROUND(AVG(total_per_day)) as \"sealed_GiB\",\
                    date_trunc('${params.filter}', date::date) AS timestamp \
                    FROM fil_miners_data_view_country \
                    WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date) \
                    GROUP BY miner,timestamp 
                    ORDER BY timestamp LIMIT ${params.limit} OFFSET ${params.offset}`);
                } else if (params.country) {
                    fields = ['country','sealed_GiB','timestamp'];
                    result = await this.pool.query(` SELECT
                    country,
                    ROUND(AVG(value)) as sealed_GiB,
                    date_trunc('${params.filter}', date::date) AS timestamp
                    FROM (
                        SELECT
                            country,
                            SUM(total_per_day) AS value,
                            date
                        FROM fil_miners_data_view_country
                        WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                        GROUP BY country, date
                   ) q GROUP BY country, timestamp
                    ORDER BY timestamp LIMIT ${params.limit} OFFSET ${params.offset}`);
                } else {
                    fields = ['sealed_GiB','timestamp'];
                    result = await this.pool.query(`SELECT
                    ROUND(AVG(value)) as sealed_GiB,
                    date_trunc('${params.filter}', date::date) AS timestamp
                    FROM (
                        SELECT
                            SUM(total_per_day) AS value,
                            date
                        FROM fil_miners_data_view_country
                        WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                        GROUP BY date
                 ) q GROUP BY timestamp
                    ORDER BY timestamp LIMIT ${params.limit} OFFSET ${params.offset}`);
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

    async ResearchExport(id, params) {
        let data = [];
        let fields;

        INFO(`ResearchExport[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
                let result;

                if (params.miners) {
                    fields = ['epoch','miner','sealed_this_epoch_GiB','timestamp'];
                    result = await this.pool.query(`SELECT epoch,miner,total_per_epoch as \"sealed_this_epoch_GiB\",timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner in ${params.miners}) AND (epoch >= ${get_epoch(params.start)}) AND (epoch <= ${get_epoch(params.end)}) \
                    ORDER BY epoch LIMIT ${params.limit} OFFSET ${params.offset}`);
                } else if (params.country) {

                } else {
                    fields = ['epoch','sealed_this_epoch_GiB','timestamp'];
                    result = await this.pool.query(`SELECT epoch,total_per_epoch as \"sealed_this_epoch_GiB\",timestamp \
                    FROM fil_network_view_epochs \
                    WHERE (epoch >= ${get_epoch(params.start)}) AND (epoch <= ${get_epoch(params.end)}) \
                    ORDER BY epoch LIMIT ${params.limit} OFFSET ${params.offset}`);
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
