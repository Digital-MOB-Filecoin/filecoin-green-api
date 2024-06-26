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
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
            result = await this.pool.query(`
                SELECT
                    ROUND(AVG(cumulative_total_per_day)) as \"sealed_GiB\",
                    date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM("sealed_GiB") AS cumulative_total_per_day,
                        date
                    FROM fil_sealed_capacity_view_v2
                    WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY date
                ) q 
                GROUP BY start_date ORDER BY start_date  ${padding};
        `);
        } catch (e) {
            ERROR(`[SealedModel] NetworkQuery error:${e}`);
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
                    ROUND(AVG(cumulative_total_per_day)) as \"sealed_GiB\",
                    date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM("sealed_GiB") AS cumulative_total_per_day,
                        date
                    FROM fil_sealed_capacity_view_v2
                    WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY date
                ) q 
                GROUP BY start_date ORDER BY start_date  ${padding};
        `);
        } catch (e) {
            ERROR(`[SealedModel] MinerQuery error:${e}`);
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
                WITH minerLocationFilter as (
                    select DISTINCT(miner)
                    from fil_miners_location
                    where country = '${params.country}'
                )
                SELECT
                    ROUND(AVG(cumulative_total_per_day)) as \"sealed_GiB\",
                    date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM("sealed_GiB") AS cumulative_total_per_day,
                        date
                    FROM fil_sealed_capacity_view_v2
                    WHERE miner in (select * from minerLocationFilter) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY date
                    ) q 
                GROUP BY start_date ORDER BY start_date  ${padding};
        `);
        } catch (e) {
            ERROR(`[CapacityModel] CountryQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async VariableSealed(params) {
        var query_result;

        if (params.miners) {
            query_result = await this.MinerQuery(params);
        } else if (params.country) {
            query_result = await this.CountryQuery(params);
        } else {
            query_result = await this.NetworkQuery(params);
        }

        let sealedData = [];
      
        for (const item of query_result ) {
            sealedData.push({
                value: item.sealed_GiB,
                start_date: item.start_date,
                end_date: item.end_date,
            });
        }

        return sealedData;
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
            let query_result;

            if (params.miners) {
                fields = ['sealed_GiB', 'start_date', 'end_date'];
                query_result = await this.MinerQuery(params);
            } else if (params.country) {
                fields = ['country', 'sealed_GiB', 'start_date', 'end_date'];
                query_result = await this.CountryQuery(params);
            } else {
                fields = ['sealed_GiB', 'start_date', 'end_date'];
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
        return this.Export(id, params);
    }

    async ExportHeader(id, params) {
        let header = {
            ReportName: this.name,
            StorageProviderIDs: params.miners,
            Country: params.country,
            From: params.start,
            To: params.start,
            Resolution: params.filter,
        } 

        return header;
    }
}

module.exports = {
    SealedModel
};
