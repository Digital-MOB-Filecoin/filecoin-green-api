'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

const epoch_DOT = 120; // ( 1 hours (3600 sec) / 1 epoch (30 sec))

const energy_conts_v1p0p1 = require("./energy_params/v-1-0-1-perGiB.json")

class CumulativeEnergyModel_v_1_0_1 {
    constructor(pool) {
        this.code_name = 'CumulativeEnergyModel_v_1_0_1';
        this.pool = pool;
        this.name = 'Cumulative Energy Use (v1.0.1)';
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

    async NetworkQuery(formula, start, end, filter) {
        var result;

        try {
                result = await this.pool.query(`
                SELECT
                value,
                timestamp AS start_date
                FROM (
                    SELECT
                            date_trunc('${filter}', date::date) AS timestamp,
                            ${formula}                             AS value
                        FROM fil_network_view_days
                        WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY timestamp,date,total_per_day
                        ORDER BY timestamp
                ) q;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] NetworkQuery error:${e}`);
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
                        date_trunc('${filter}', date::date) AS timestamp,
                        ${formula} AS value
                    FROM fil_miner_view_days_v4
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner,timestamp,date,total_per_day
                    ORDER BY timestamp
             ) q;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableSealedStoredOverTime(start, end, filter, miner, consts) {
        var result;

        if (miner) {
            result = await this.MinerQuery(`SUM( (ROUND(AVG(total)) * 24 * ${consts.storage_kW_GiB} + SUM(total_per_day) * ${consts.sealing_kWh_GiB}) * ${consts.pue}) OVER(ORDER BY date)`, start, end, filter, miner);
        } else {
            result = await this.NetworkQuery(`SUM( (ROUND(AVG(total)) * 24 *${consts.storage_kW_GiB} + SUM(total_per_day)* ${consts.sealing_kWh_GiB}) * ${consts.pue}) OVER(ORDER BY date)`, start, end, filter);
        }

        return result;
    }

    async Query(id, start, end, filter, miner) {
        INFO(`Query[${this.name}] id: ${id}, start: ${start}, end: ${end}, filter: ${filter}, miner: ${miner}`);

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

        // Minimum cumulative energy use
        let cumulativeEnergyData_min = await this.VariableSealedStoredOverTime(start, end, filter, miner, energy_conts_v1p0p1.min);
        let cumulativeEnergy_min = {
            title: 'Lower Bound',
            color: COLOR.green,
            data: cumulativeEnergyData_min,
        }
        result.data.push(cumulativeEnergy_min);

        // Estimated cumulative energy use
        let cumulativeEnergyData_est = await this.VariableSealedStoredOverTime(start, end, filter, miner, energy_conts_v1p0p1.estimate);
        let cumulativeEnergy_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: cumulativeEnergyData_est,
        }
        result.data.push(cumulativeEnergy_est);

        // Maximum cumulative energy use
        let cumulativeEnergyData_max = await this.VariableSealedStoredOverTime(start, end, filter, miner, energy_conts_v1p0p1.max);
        let cumulativeEnergy_max = {
            title: 'Upper Bound',
            color: COLOR.orange,
            data: cumulativeEnergyData_max,
        }
        result.data.push(cumulativeEnergy_max);

        return result;
    }

    async Export(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['miner','energy_use_kW_lower','energy_use_kW_estimate', 'energy_use_kW_upper', 'timestamp'];
                    result = await this.pool.query(`SELECT miner, date_trunc('day', date::date) AS timestamp \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.min.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.min.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.min.pue}) OVER(ORDER BY date) as \"energy_use_kW_lower\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.estimate.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.estimate.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.estimate.pue}) OVER(ORDER BY date) as \"energy_use_kW_estimate\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.max.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.max.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.max.pue}) OVER(ORDER BY date) as \"energy_use_kW_upper\" \
                    FROM fil_miner_view_days_v4
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner,timestamp,date,total_per_day
                    ORDER BY timestamp \
                    LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['energy_use_kW_lower','energy_use_kW_estimate','energy_use_kW_upper','timestamp'];
                    result = await this.pool.query(`SELECT date_trunc('day', date::date) AS timestamp \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.min.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.min.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.min.pue}) OVER(ORDER BY date) as \"energy_use_kW_lower\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.estimate.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.estimate.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.estimate.pue}) OVER(ORDER BY date) as \"energy_use_kW_estimate\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.max.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.max.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.max.pue}) OVER(ORDER BY date) as \"energy_use_kW_upper\" \
                    FROM fil_network_view_days
                    WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY timestamp,date,total_per_day
                    ORDER BY timestamp \
                    LIMIT ${limit} OFFSET ${offset}`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[TotalSealedStoredOverTimeModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    CumulativeEnergyModel_v_1_0_1
};
