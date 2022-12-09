'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

const sealing_kW_per_GiB_block_min = '0.00026882';
const sealing_kW_per_GiB_block_est = '0.00152847';
const sealing_kW_per_GiB_block_max = '0.00250540';

const storage_kW_per_GiB_min = '0.0000009688';
const storage_kW_per_GiB_est = '0.0000032212';
const storage_kW_per_GiB_max = '0.0000086973';

const pue_min = 1.18;
const pue_est = 1.57;
const pue_max = 1.93;

class TotalEnergyModelv_1_0_1 {
    constructor(pool) {
        this.code_name = 'TotalEnergyModelv_1_0_1';
        this.pool = pool;
        this.name = 'Energy consumption rate (v1.0.1)';
        this.category = CATEGORY.ENERGY; // see type.js
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.kW;
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
        return `The total rate of electrical energy use. This is the sum of sealing and storage energy use, multiplied by a [Power Usage Effectiveness](https://en.wikipedia.org/wiki/Power_usage_effectiveness) (PUE) representing overhead energy costs such as cooling and power conversion. Bounds and estimate come from combining the bounds and estimates of sealing and storage energy, as well as different values of estimated PUE.

**Network view:** Total electrical power used by the Filecoin network.

**Storage Provider (SP) view:** Electrical power used by this SP.
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
                with storage as(
                    SELECT
                        ROUND(AVG(cumulative_total_per_day)) AS total_per_day,
                        ROUND(AVG(cumulative_capacity)) AS total,
                        date_trunc('${params.filter}', date::date) AS timestamp
                        FROM (
                            SELECT
                                date,
                                SUM(total) AS cumulative_capacity,
                                SUM(total_per_day) AS cumulative_total_per_day
                            FROM fil_miners_data_view_country_v2
                            WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY date) q1
                        GROUP BY date ORDER BY date ${padding})

                    SELECT
                            timestamp,
                            (total * ${storage_kW_per_GiB_min} + total_per_day * ${sealing_kW_per_GiB_block_min}) * ${pue_min} as \"total_energy_kW_lower\" ,
                            (total * ${storage_kW_per_GiB_est} + total_per_day * ${sealing_kW_per_GiB_block_est}) * ${pue_est} as \"total_energy_kW_estimate\" ,
                            (total * ${storage_kW_per_GiB_max} + total_per_day * ${sealing_kW_per_GiB_block_max}) * ${pue_max} as \"total_energy_kW_upper\"
                        FROM storage
                        GROUP BY timestamp, total, total_per_day
                        ORDER BY timestamp
                ;`);
        } catch (e) {
            ERROR(`[totalEnergyModel] NetworkQuery error:${e}`);
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
                with storage as(
                    SELECT
                        ROUND(AVG(cumulative_total_per_day)) AS total_per_day,
                        ROUND(AVG(cumulative_capacity)) AS total,
                        date_trunc('${params.filter}', date::date) AS timestamp
                        FROM (
                            SELECT
                                date,
                                SUM(total) AS cumulative_capacity,
                                SUM(total_per_day) AS cumulative_total_per_day
                            FROM fil_miners_data_view_country_v2
                            WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY date) q1
                        GROUP BY date ORDER BY date ${padding})

                    SELECT
                            timestamp,
                            (total * ${storage_kW_per_GiB_min} + total_per_day * ${sealing_kW_per_GiB_block_min}) * ${pue_min} as \"total_energy_kW_lower\" ,
                            (total * ${storage_kW_per_GiB_est} + total_per_day * ${sealing_kW_per_GiB_block_est}) * ${pue_est} as \"total_energy_kW_estimate\" ,
                            (total * ${storage_kW_per_GiB_max} + total_per_day * ${sealing_kW_per_GiB_block_max}) * ${pue_max} as \"total_energy_kW_upper\"
                        FROM storage
                        GROUP BY timestamp, total, total_per_day
                        ORDER BY timestamp
                ;`);
        } catch (e) {
            ERROR(`[totalEnergyModel] MinerQuery error:${e}`);
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
                with storage as(
                    SELECT
                        country,
                        ROUND(AVG(cumulative_total_per_day)) AS total_per_day,
                        ROUND(AVG(cumulative_capacity)) AS total,
                        date_trunc('${params.filter}', date::date) AS timestamp
                        FROM (
                            SELECT
                            country,
                                date,
                                SUM(total) AS cumulative_capacity,
                                SUM(total_per_day) AS cumulative_total_per_day
                            FROM fil_miners_data_view_country_v2
                            WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY  country, date) q1
                        GROUP BY  country, date ORDER BY date ${padding})

                    SELECT
                            country,
                            timestamp,
                            (total * ${storage_kW_per_GiB_min} + total_per_day * ${sealing_kW_per_GiB_block_min}) * ${pue_min} as \"total_energy_kW_lower\" ,
                            (total * ${storage_kW_per_GiB_est} + total_per_day * ${sealing_kW_per_GiB_block_est}) * ${pue_est} as \"total_energy_kW_estimate\" ,
                            (total * ${storage_kW_per_GiB_max} + total_per_day * ${sealing_kW_per_GiB_block_max}) * ${pue_max} as \"total_energy_kW_upper\"
                        FROM storage
                        GROUP BY country, timestamp, total, total_per_day
                        ORDER BY timestamp
                ;`);
        } catch (e) {
            ERROR(`[totalEnergyModel] CountryQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }
    
    async VariableTotalEnergy(params) {
        var query_result;

        if (params.miners) {
            query_result = await this.MinerQuery(params);
        } else if (params.country) {
            query_result = await this.CountryQuery(params);
        } else {
            query_result = await this.NetworkQuery(params);
        }

        let totalEnergyData_min = [];
        let totalEnergyData_est = [];
        let totalEnergyData_max = [];

        for (const item of query_result ) {
            totalEnergyData_min.push({
                value: item.total_energy_kW_lower,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            totalEnergyData_est.push({
                value: item.total_energy_kW_estimate,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            totalEnergyData_max.push({
                value: item.total_energy_kW_upper,
                start_date: item.start_date,
                end_date: item.end_date,
            });
        }

        return {
            totalEnergyData_min: totalEnergyData_min,
            totalEnergyData_est: totalEnergyData_est,
            totalEnergyData_max: totalEnergyData_max,
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
        let totalEnergyData = await this.VariableTotalEnergy(params);
        let totalEnergy_min = {
            title: 'Lower Bound',
            color: COLOR.green,
            data: totalEnergyData.totalEnergyData_min,
        }
        result.data.push(totalEnergy_min);

        // Estimated cumulative energy use
        let totalEnergy_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: totalEnergyData.totalEnergyData_est,
        }
        result.data.push(totalEnergy_est);

        // Maximum cumulative energy use
        let totalEnergy_max = {
            title: 'Upper Bound',
            color: COLOR.orange,
            data: totalEnergyData.totalEnergyData_max,
        }
        result.data.push(totalEnergy_max);

        return result;
    }

    async Export(id, params) {

        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
            let query_result;

            if (params.miners) {
                fields = ['total_energy_kW_lower', 'total_energy_kW_estimate', 'total_energy_kW_upper', 'start_date', 'end_date'];
                query_result = await this.MinerQuery(params);
            } else if (params.country) {
                fields = ['country', 'total_energy_kW_lower', 'total_energy_kW_estimate', 'total_energy_kW_upper', 'start_date', 'end_date'];
                query_result = await this.CountryQuery(params);
            } else {
                fields = ['total_energy_kW_lower', 'total_energy_kW_estimate', 'total_energy_kW_upper', 'start_date', 'end_date'];
                query_result = await this.NetworkQuery(params);
            }

            if (query_result) {
                data = query_result;
            }
        } catch (e) {
            ERROR(`[TotalEnergyModelv_1_0_1] Export error:${e}`);
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
    TotalEnergyModelv_1_0_1
};
