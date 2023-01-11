'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class CapacityModel {
    constructor(pool) {
        this.code_name = 'CapacityModel';
        this.pool = pool;
        this.name = 'Data storage capacity';
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
        return `**Network view:** The total amount of data storage capacity contributed to Filecoin’s decentralized storage network, based on on-chain proofs.

**Storage Provider (SP) view:** The amount of data storage contributed by this SP, based on on-chain proofs.
`;
    }

    async NetworkQuery(params) {
        var result;
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
            result = await this.pool.query(`
                SELECT
                ROUND(AVG(cumulative_capacity)) as \"capacity_GiB\",
                date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM(total) AS cumulative_capacity,
                        date
                    FROM fil_miners_data_view_country_v3
                    WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY date
             ) q GROUP BY start_date ORDER BY start_date  ${padding};
            `);
        } catch (e) {
            ERROR(`[CapacityModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async MinerQuery(params) {
        var result;
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
            result = await this.pool.query(`
                SELECT
                ROUND(AVG(cumulative_capacity)) as \"capacity_GiB\",
                date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM(total) AS cumulative_capacity,
                        date
                    FROM fil_miners_data_view_country_v3
                    WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY  date
             ) q GROUP BY start_date ORDER BY start_date  ${padding};
            `);
        } catch (e) {
            ERROR(`[CapacityModel] MinerQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async CountryQuery(params) {
        var result;
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
            result = await this.pool.query(`
                SELECT
                country,
                ROUND(AVG(cumulative_capacity)) as \"capacity_GiB\",
                date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                    country,
                        SUM(total) AS cumulative_capacity,
                        date
                    FROM fil_miners_data_view_country_v3
                    WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY  country, date
             ) q GROUP BY country, start_date ORDER BY start_date  ${padding};
            `);
        } catch (e) {
            ERROR(`[CapacityModel] CountryQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async VariableTotalCapacity(params) {
        var query_result;

        if (params.miners) {
            query_result = await this.MinerQuery(params);
        } else if (params.country) {
            query_result = await this.CountryQuery(params);
        } else {
            query_result = await this.NetworkQuery(params);
        }

        let capacityData = [];
      
        for (const item of query_result ) {
            capacityData.push({
                value: item.capacity_GiB,
                start_date: item.start_date,
                end_date: item.end_date,
            });
        }

        return capacityData;
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

        // variable 1 - Total Capacity
        let totalCapacityData = await this.VariableTotalCapacity(params);
        let totalCapacityVariable = {
            title: 'Data storage capacity',
            color: COLOR.green,
            data: totalCapacityData,
        }

        result.data.push(totalCapacityVariable);

        return result;
    }

    async Export(id, params) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
            let query_result;

            if (params.miners) {
                fields = ['capacity_GiB', 'start_date', 'end_date'];
                query_result = await this.MinerQuery(params);
            } else if (params.country) {
                fields = ['country', 'capacity_GiB', 'start_date', 'end_date'];
                query_result = await this.CountryQuery(params);
            } else {
                fields = ['capacity_GiB', 'start_date', 'end_date'];
                query_result = await this.NetworkQuery(params);
            }

            if (query_result) {
                data = query_result;
            }
        } catch (e) {
            ERROR(`[CapacityModel] Export error:${e}`);
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
                    fields = ['epoch','miner','capacity_GiB','timestamp'];
                    result = await this.pool.query(`SELECT epoch,miner,total as \"capacity_GiB\",timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner in ${params.miners}) AND (epoch >= ${get_epoch(params.start)}) AND (epoch <= ${get_epoch(params.end)}) \
                    ORDER BY epoch LIMIT ${params.limit} OFFSET ${params.offset}`);
                } else if (params.country) {
                    
                } else {
                    fields = ['epoch','capacity_GiB','timestamp'];
                    result = await this.pool.query(`SELECT epoch,total as \"capacity_GiB\",timestamp \
                    FROM fil_network_view_epochs \
                    WHERE (epoch >= ${get_epoch(params.start)}) AND (epoch <= ${get_epoch(params.end)}) \
                    ORDER BY epoch LIMIT ${params.limit} OFFSET ${params.offset}`);
                }


                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[CapacityModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    CapacityModel
};
