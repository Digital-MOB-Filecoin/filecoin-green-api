'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class RenewableEnergyModel {
    constructor(pool) {
        this.code_name = 'RenewableEnergyModel';
        this.pool = pool;
        this.name = 'Cumulative renewable energy purchases ';
        this.category = CATEGORY.ENERGY;
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.kWh;
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
        return `Cumulative renewable energy certificate (REC) purchases over time`;
    }

    async NetworkQuery(params) {
        var result;
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
                result = await this.pool.query(`
                with data as (SELECT
                    SUM(renewable_energy_kw) OVER(ORDER BY date) AS \"energykWh\",
                    date
                    FROM fil_miners_data_view_country_v3
                    WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY date, date, renewable_energy_kw
                    ORDER BY date ${padding}),
                    datapoints as (
                        SELECT 
                        ROUND(AVG(\"energykWh\")) as "energykWh\", 
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM data
                        GROUP BY date)
                    SELECT DISTINCT start_date, \"energykWh\" FROM datapoints ORDER BY start_date;
                    `);
        } catch (e) {
            ERROR(`[RenewableEnergyModel] NetworkQuery error:${e}`);
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
                with data as (SELECT
                    SUM(renewable_energy_kw) OVER(ORDER BY date) AS \"energykWh\",
                    date
                    FROM fil_miners_data_view_country_v3
                    WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY date, renewable_energy_kw
                    ORDER BY date ${padding}),
                    datapoints as (
                        SELECT 
                        ROUND(AVG(\"energykWh\")) as "energykWh\", 
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM data
                        GROUP BY date)
                    SELECT DISTINCT start_date, \"energykWh\" FROM datapoints ORDER BY start_date;
                `);
        } catch (e) {
            ERROR(`[RenewableEnergyModel] MinerQuery error:${e}`);
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
                with data as (SELECT
                    SUM(renewable_energy_kw) OVER(ORDER BY date) AS \"energykWh\",
                    date
                    FROM fil_miners_data_view_country_v3
                    WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY date, date, renewable_energy_kw
                    ORDER BY date ${padding}),
                    datapoints as (
                        SELECT 
                        ROUND(AVG(\"energykWh\")) as "energykWh\", 
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM data
                        GROUP BY date)
                    SELECT DISTINCT start_date, \"energykWh\" FROM datapoints ORDER BY start_date;
                    `);
        } catch (e) {
            ERROR(`[RenewableEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async VariableRenewableEnergy(params) {
        var query_result;

        if (params.miners) {
            query_result = await this.MinerQuery(params);
        } else if (params.country) {
            query_result = await this.CountryQuery(params);
        } else {
            query_result = await this.NetworkQuery(params);
        }

        let renewableEnergyData = [];
      
        for (const item of query_result ) {
            renewableEnergyData.push({
                value: item.energykWh,
                start_date: item.start_date,
                end_date: item.end_date,
            });
        }

        return renewableEnergyData;
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
        let renewableEnergyData = await this.VariableRenewableEnergy(params);
        let renewableEnergyVariable = {
            title: 'REC',
            color: COLOR.green,
            data: renewableEnergyData,
        }

        result.data.push(renewableEnergyVariable);

        return result;
    }

    async Export(id, params) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
            let query_result;

            if (params.miners) {
                fields = ['energykWh', 'start_date', 'end_date'];
                query_result = await this.MinerQuery(params);
            } else if (params.country) {
                fields = ['energykWh', 'start_date', 'end_date'];
                query_result = await this.CountryQuery(params);
            } else {
                fields = ['energykWh', 'start_date', 'end_date'];
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

}

module.exports = {
    RenewableEnergyModel
};
