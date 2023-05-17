'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class TotalEmissionsModel {
    constructor(pool) {
        this.code_name = 'TotalEmissionsModel';
        this.pool = pool;
        this.name = 'Location-Based Emissions (Ignoring Renewable Energy Purchases)';
        this.category = CATEGORY.EMISSIONS; // see type.js
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.co2;
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
        return `Total amount of emissions during a time period gCO2`;
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
                    ROUND(SUM(SUM(cumulative_emissions_lower)) over (ORDER by date_trunc('${params.filter}', date::date))) as \"emissions_lower\",
                    ROUND(SUM(SUM(cumulative_emissions_estimate)) over (ORDER by date_trunc('${params.filter}', date::date)))  as \"emissions_estimate\",
                    ROUND(SUM(SUM(cumulative_emissions_upper)) over (ORDER by date_trunc('${params.filter}', date::date))) as \"emissions_upper\",
                    date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM(energy_use_kW_lower * COALESCE(avg_wt_value, avg_un_value, 0)) as cumulative_emissions_lower,
                        SUM(energy_use_kW_estimate * COALESCE(avg_wt_value, avg_un_value, 0)) as cumulative_emissions_estimate,
                        SUM(energy_use_kW_upper * COALESCE(avg_wt_value, avg_un_value, 0)) as cumulative_emissions_upper,
                        date
                    FROM fil_miners_data_view_country_v4
                    WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY date
             ) q GROUP BY start_date ORDER BY start_date  ${padding};
                `);
        } catch (e) {
            ERROR(`[TotalEmissionsModel] NetworkQuery error:${e}`);
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
                ROUND(SUM(SUM(cumulative_emissions_lower)) over (ORDER by date_trunc('${params.filter}', date::date))) as \"emissions_lower\",
                ROUND(SUM(SUM(cumulative_emissions_estimate)) over (ORDER by date_trunc('${params.filter}', date::date)))  as \"emissions_estimate\",
                ROUND(SUM(SUM(cumulative_emissions_upper)) over (ORDER by date_trunc('${params.filter}', date::date))) as \"emissions_upper\",
                date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        country,
                        SUM(energy_use_kW_lower * COALESCE(avg_wt_value, avg_un_value, 0)) as cumulative_emissions_lower,
                        SUM(energy_use_kW_estimate * COALESCE(avg_wt_value, avg_un_value, 0)) as cumulative_emissions_estimate,
                        SUM(energy_use_kW_upper * COALESCE(avg_wt_value, avg_un_value, 0)) as cumulative_emissions_upper,
                        date
                    FROM fil_miners_data_view_country_v4
                    WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY country, date
             ) q GROUP BY country, start_date ORDER BY start_date  ${padding};
            `);
        } catch (e) {
            ERROR(`[TotalEmissionsModel] CountryQuery error:${e}`);
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
                ROUND(SUM(SUM(cumulative_emissions_lower)) over (ORDER by date_trunc('${params.filter}', date::date))) as \"emissions_lower\",
                ROUND(SUM(SUM(cumulative_emissions_estimate)) over (ORDER by date_trunc('${params.filter}', date::date)))  as \"emissions_estimate\",
                ROUND(SUM(SUM(cumulative_emissions_upper)) over (ORDER by date_trunc('${params.filter}', date::date))) as \"emissions_upper\",
                date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM(energy_use_kW_lower * COALESCE(avg_wt_value, avg_un_value, 0)) as cumulative_emissions_lower,
                        SUM(energy_use_kW_estimate * COALESCE(avg_wt_value, avg_un_value, 0)) as cumulative_emissions_estimate,
                        SUM(energy_use_kW_upper * COALESCE(avg_wt_value, avg_un_value, 0)) as cumulative_emissions_upper,
                        date
                    FROM fil_miners_data_view_country_v4
                    WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY  date
             ) q GROUP BY start_date ORDER BY start_date  ${padding};
            `);
        } catch (e) {
            ERROR(`[TotalEmissionsModel] MinerQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async VariableEmissions(params) {
        var query_result;

        if (params.miners) {
            query_result = await this.MinerQuery(params);
        } else if (params.country) {
            query_result = await this.CountryQuery(params);
        } else {
            query_result = await this.NetworkQuery(params);
        }

        let cumulativeEnergyData_min = [];
        let cumulativeEnergyData_est = [];
        let cumulativeEnergyData_max = [];

        for (const item of query_result ) {
            cumulativeEnergyData_min.push({
                value: item.emissions_lower,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            cumulativeEnergyData_est.push({
                value: item.emissions_estimate,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            cumulativeEnergyData_max.push({
                value: item.emissions_upper,
                start_date: item.start_date,
                end_date: item.end_date,
            });
        }

        return {
            cumulativeEnergyData_min: cumulativeEnergyData_min,
            cumulativeEnergyData_est: cumulativeEnergyData_est,
            cumulativeEnergyData_max: cumulativeEnergyData_max,
        };
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

        // Minimum cumulative energy use
        let cumulativeEnergyData = await this.VariableEmissions(params);
        let cumulativeEnergy_min = {
            title: 'Lower Bound',
            color: COLOR.green,
            data: cumulativeEnergyData.cumulativeEnergyData_min,
        }
        result.data.push(cumulativeEnergy_min);

        // Estimated cumulative energy use
        let cumulativeEnergy_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: cumulativeEnergyData.cumulativeEnergyData_est,
        }
        result.data.push(cumulativeEnergy_est);

        // Maximum cumulative energy use
        let cumulativeEnergy_max = {
            title: 'Upper Bound',
            color: COLOR.orange,
            data: cumulativeEnergyData.cumulativeEnergyData_max,
        }
        result.data.push(cumulativeEnergy_max);

        return result;
    }

    async Export(id, params) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
            let query_result;

            if (params.miners) {
                fields = ['emissions_lower', 'emissions_estimate', 'emissions_upper', 'start_date', 'end_date'];
                query_result = await this.MinerQuery(params);
            } else if (params.country) {
                fields = ['country', 'emissions_lower', 'emissions_estimate', 'emissions_upper', 'start_date', 'end_date'];
                query_result = await this.CountryQuery(params);
            } else {
                fields = ['emissions_lower', 'emissions_estimate', 'emissions_upper', 'start_date', 'end_date'];
                query_result = await this.NetworkQuery(params);
            }

            if (query_result) {
                data = query_result;
            }
        } catch (e) {
            ERROR(`[TotalEmissionsModel] Export error:${e}`);
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
    TotalEmissionsModel
};
