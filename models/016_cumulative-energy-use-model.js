'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')
const {v102PerGiB} = require("./energy_params/v-1-0-2-perGiB");

const sealing_kW_per_GiB_block_min = v102PerGiB.min.sealing_kWh_GiB_base;
const sealing_kW_per_GiB_block_est = v102PerGiB.estimate.sealing_kWh_GiB_base;
const sealing_kW_per_GiB_block_max = v102PerGiB.max.sealing_kWh_GiB_base;

const storage_kW_per_GiB_min = v102PerGiB.min.storage_kW_GiB;
const storage_kW_per_GiB_est = v102PerGiB.estimate.storage_kW_GiB;
const storage_kW_per_GiB_max = v102PerGiB.max.storage_kW_GiB;

const pue_min = v102PerGiB.min.pue;
const pue_est = v102PerGiB.estimate.pue;
const pue_max = v102PerGiB.max.pue;

class CumulativeEnergyModel_v_1_0_2 {
    constructor(pool) {
        this.code_name = 'CumulativeEnergyModel_v_1_0_2';
        this.pool = pool;
        this.name = 'Cumulative Energy Use (v1.0.2)';
        this.category = CATEGORY.ENERGY; // see type.js
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
        return `Total amount of energy used during a time period in kWh`;
    }

    async NetworkQuery(params) {
        var result;
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
                result = await this.pool.query(`
                with sealing as(
                    SELECT
                        ROUND(AVG(cumulative_total_per_day)) AS total_per_day,
                        ROUND(AVG(cumulative_capacity)) AS total,
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                                date,
                                SUM(total_per_day) AS cumulative_total_per_day,
                                SUM(total) AS  cumulative_capacity
                            FROM fil_miners_data_view_country_v9
                            WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY date) q1
                        GROUP BY date ORDER BY date ${padding})

                    SELECT
                            start_date,
                            SUM( ( total * 24 * ${storage_kW_per_GiB_min} + SUM(total_per_day) * ${sealing_kW_per_GiB_block_min}) * ${pue_min}) OVER(ORDER BY start_date) as \"energy_use_kW_lower\" ,
                            SUM( ( total * 24 * ${storage_kW_per_GiB_est} + SUM(total_per_day) * ${sealing_kW_per_GiB_block_est}) * ${pue_est}) OVER(ORDER BY start_date) as \"energy_use_kW_estimate\" ,
                            SUM( ( total * 24 * ${storage_kW_per_GiB_max} + SUM(total_per_day) * ${sealing_kW_per_GiB_block_max}) * ${pue_max}) OVER(ORDER BY start_date) as \"energy_use_kW_upper\" 
                        FROM sealing
                        GROUP BY start_date, total, total_per_day
                        ORDER BY start_date
                ;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] NetworkQuery error:${e}`);
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
                with sealing as(
                    SELECT
                        ROUND(AVG(cumulative_total_per_day)) AS total_per_day,
                        ROUND(AVG(cumulative_capacity)) AS total,
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                                date,
                                SUM(total_per_day) AS cumulative_total_per_day,
                                SUM(total) AS  cumulative_capacity
                            FROM fil_miners_data_view_country_v9
                            WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY date) q1
                        GROUP BY date ORDER BY date ${padding})

                    SELECT
                            start_date,
                            SUM( ( total * 24 * ${storage_kW_per_GiB_min} + SUM(total_per_day) * ${sealing_kW_per_GiB_block_min}) * ${pue_min}) OVER(ORDER BY start_date) as \"energy_use_kW_lower\" ,
                            SUM( ( total * 24 * ${storage_kW_per_GiB_est} + SUM(total_per_day) * ${sealing_kW_per_GiB_block_est}) * ${pue_est}) OVER(ORDER BY start_date) as \"energy_use_kW_estimate\" ,
                            SUM( ( total * 24 * ${storage_kW_per_GiB_max} + SUM(total_per_day) * ${sealing_kW_per_GiB_block_max}) * ${pue_max}) OVER(ORDER BY start_date) as \"energy_use_kW_upper\" 
                        FROM sealing
                        GROUP BY start_date, total, total_per_day
                        ORDER BY start_date
                ;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] MinerQuery error:${e}`);
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
                with sealing as(
                    SELECT
                        country,
                        ROUND(AVG(cumulative_total_per_day)) AS total_per_day,
                        ROUND(AVG(cumulative_capacity)) AS total,
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                            country,
                                date,
                                SUM(total_per_day) AS cumulative_total_per_day,
                                SUM(total) AS  cumulative_capacity
                            FROM fil_miners_data_view_country_v9
                            WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY country,date) q1
                        GROUP BY country,date ORDER BY date ${padding})

                    SELECT
                            country,
                            start_date,
                            SUM( ( total * 24 * ${storage_kW_per_GiB_min} + SUM(total_per_day) * ${sealing_kW_per_GiB_block_min}) * ${pue_min}) OVER(ORDER BY start_date) as \"energy_use_kW_lower\" ,
                            SUM( ( total * 24 * ${storage_kW_per_GiB_est} + SUM(total_per_day) * ${sealing_kW_per_GiB_block_est}) * ${pue_est}) OVER(ORDER BY start_date) as \"energy_use_kW_estimate\" ,
                            SUM( ( total * 24 * ${storage_kW_per_GiB_max} + SUM(total_per_day) * ${sealing_kW_per_GiB_block_max}) * ${pue_max}) OVER(ORDER BY start_date) as \"energy_use_kW_upper\" 
                        FROM sealing
                        GROUP BY country, start_date, total, total_per_day
                        ORDER BY start_date
                ;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] CountryQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async VariableSealedStoredOverTime(params) {
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
                value: item.energy_use_kW_lower,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            cumulativeEnergyData_est.push({
                value: item.energy_use_kW_estimate,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            cumulativeEnergyData_max.push({
                value: item.energy_use_kW_upper,
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
        let cumulativeEnergyData = await this.VariableSealedStoredOverTime(params);
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
                fields = ['energy_use_kW_lower', 'energy_use_kW_estimate', 'energy_use_kW_upper', 'start_date', 'end_date'];
                query_result = await this.MinerQuery(params);
            } else if (params.country) {
                fields = ['country', 'energy_use_kW_lower', 'energy_use_kW_estimate', 'energy_use_kW_upper', 'start_date', 'end_date'];
                query_result = await this.CountryQuery(params);
            } else {
                fields = ['energy_use_kW_lower', 'energy_use_kW_estimate', 'energy_use_kW_upper', 'start_date', 'end_date'];
                query_result = await this.NetworkQuery(params);
            }

            if (query_result) {
                data = query_result;
            }
        } catch (e) {
            ERROR(`[CumulativeEnergyModel_v_1_0_2] Export error:${e}`);
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
    CumulativeEnergyModel_v_1_0_2
};
