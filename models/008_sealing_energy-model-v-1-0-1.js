'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

const sealing_kW_per_GiB_block_min = '0.00026882';
const sealing_kW_per_GiB_block_est = '0.00152847';
const sealing_kW_per_GiB_block_max = '0.00250540';

class SealingEnergyModelv_1_0_1 {
    constructor(pool) {
        this.code_name = 'SealingEnergyModelv_1_0_1';
        this.pool = pool;
        this.name = 'Energy used to seal data (v1.0.1)';
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
        return `[Sealing](https://spec.filecoin.io/systems/filecoin_mining/sector/sealing/) is the process of generating SNARK proofs for a data sector which will allow an SP to prove that they are continuing to store that data over time, and is one of the components of energy use of the Filecoin network. Energy use due to sealing is estimated by multiplying the increase in storage capacity over a given time period by a constant value as described in the methodology. Bounds and estimate come from different values of this constant.

**Network view:** Total electrical power used to seal data for the entire Filecoin network.

**Storage Provider (SP) view:** Electrical power used by this SP to seal data.
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
                with sealing as(
                    SELECT
                        ROUND(AVG(cumulative_total_per_day)) AS total_per_day,
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                                date,
                                SUM(total_per_day) AS cumulative_total_per_day
                            FROM fil_miners_data_view_country_v3
                            WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY date) q1
                        GROUP BY date ORDER BY date ${padding})

                    SELECT
                            start_date,
                            total_per_day * ${sealing_kW_per_GiB_block_min} as \"sealing_energy_kW_lower\" ,
                            total_per_day * ${sealing_kW_per_GiB_block_est}  as \"sealing_energy_kW_estimate\" ,
                            total_per_day * ${sealing_kW_per_GiB_block_max}  as \"sealing_energy_kW_upper\" 
                        FROM sealing
                        GROUP BY start_date, total_per_day
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
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                                date,
                                SUM(total_per_day) AS cumulative_total_per_day
                            FROM fil_miners_data_view_country_v3
                            WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY date) q1
                        GROUP BY date ORDER BY date ${padding})

                    SELECT
                            start_date,
                            total_per_day * ${sealing_kW_per_GiB_block_min} as \"sealing_energy_kW_lower\" ,
                            total_per_day * ${sealing_kW_per_GiB_block_est}  as \"sealing_energy_kW_estimate\" ,
                            total_per_day * ${sealing_kW_per_GiB_block_max}  as \"sealing_energy_kW_upper\" 
                        FROM sealing
                        GROUP BY start_date, total_per_day
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
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                            country,
                                date,
                                SUM(total_per_day) AS cumulative_total_per_day
                            FROM fil_miners_data_view_country_v3
                            WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY country, date) q1
                        GROUP BY country, date ORDER BY date ${padding})

                    SELECT
                            country,
                            start_date,
                            total_per_day * ${sealing_kW_per_GiB_block_min} as \"sealing_energy_kW_lower\" ,
                            total_per_day * ${sealing_kW_per_GiB_block_est}  as \"sealing_energy_kW_estimate\" ,
                            total_per_day * ${sealing_kW_per_GiB_block_max}  as \"sealing_energy_kW_upper\" 
                        FROM sealing
                        GROUP BY country, start_date, total_per_day
                        ORDER BY start_date
                ;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] CountryQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async VariableSealingEnergy(params) {
        var query_result;

        if (params.miners) {
            query_result = await this.MinerQuery(params);
        } else if (params.country) {
            query_result = await this.CountryQuery(params);
        } else {
            query_result = await this.NetworkQuery(params);
        }

        let sealingEnergyData_min = [];
        let sealingEnergyData_est = [];
        let sealingEnergyData_max = [];

        for (const item of query_result ) {
            sealingEnergyData_min.push({
                value: item.sealing_energy_kW_lower,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            sealingEnergyData_est.push({
                value: item.sealing_energy_kW_estimate,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            sealingEnergyData_max.push({
                value: item.sealing_energy_kW_upper,
                start_date: item.start_date,
                end_date: item.end_date,
            });
        }

        return {
            sealingEnergyData_min: sealingEnergyData_min,
            sealingEnergyData_est: sealingEnergyData_est,
            sealingEnergyData_max: sealingEnergyData_max,
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
        let sealingEnergyData = await this.VariableSealingEnergy(params);
        let sealingEnergy_min = {
            title: 'Lower Bound',
            color: COLOR.green,
            data: sealingEnergyData.sealingEnergyData_min,
        }
        result.data.push(sealingEnergy_min);

        // Estimated cumulative energy use
        let sealingEnergy_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: sealingEnergyData.sealingEnergyData_est,
        }
        result.data.push(sealingEnergy_est);

        // Maximum cumulative energy use
        let sealingEnergy_max = {
            title: 'Upper Bound',
            color: COLOR.orange,
            data: sealingEnergyData.sealingEnergyData_max,
        }
        result.data.push(sealingEnergy_max);

        return result;
    }


    async Export(id, params) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
            let query_result;

            if (params.miners) {
                fields = ['sealing_energy_kW_lower', 'sealing_energy_kW_estimate', 'sealing_energy_kW_upper', 'start_date', 'end_date'];
                query_result = await this.MinerQuery(params);
            } else if (params.country) {
                fields = ['country', 'sealing_energy_kW_lower', 'sealing_energy_kW_estimate', 'sealing_energy_kW_upper', 'start_date', 'end_date'];
                query_result = await this.CountryQuery(params);
            } else {
                fields = ['sealing_energy_kW_lower', 'sealing_energy_kW_estimate', 'sealing_energy_kW_upper', 'start_date', 'end_date'];
                query_result = await this.NetworkQuery(params);
            }

            if (query_result) {
                data = query_result;
            }
        } catch (e) {
            ERROR(`[SealingEnergyModelv_1_0_1] Export error:${e}`);
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
    SealingEnergyModelv_1_0_1
};
