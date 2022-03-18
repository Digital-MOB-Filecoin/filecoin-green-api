'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

const epoch_DOT = 120; // ( 1 hours (3600 sec) / 1 epoch (30 sec))

const energy_conts_v1p0p1 = require("./energy_params/v-1-0-1-perGiB.json")

class CumulativeEnergyModel_v_1_0_1 {
    constructor(pool) {
        this.pool = pool;
        this.name = 'Cumulative Energy Use';
        this.category = CATEGORY.ENERGY; // see type.js
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.kWh;
        this.version = VERSION.v0;
    }

    Name() {
        return this.name;
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
                    fields = ['epoch','miner','total_data_over_time_GiB_h','total_sealed_GiB','timestamp'];
                    result = await this.pool.query(`SELECT epoch, miner, total / ${epoch_DOT} as \"total_data_over_time_GiB_h\", \
                                                                            total_per_epoch as \"total_sealed_GiB\", \
                                                                            timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    GROUP BY epoch,miner,timestamp,total,total_per_epoch ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['epoch','total_data_over_time_GiB_h','total_sealed_GiB','timestamp'];
                    result = await this.pool.query(`SELECT epoch, total / ${epoch_DOT} as \"total_data_over_time_GiB_h\", \
                                                                    total_per_epoch as \"total_sealed_GiB\", \
                                                                    timestamp \
                    FROM fil_network_view_epochs \
                    WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    GROUP BY epoch,timestamp,total,total_per_epoch ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
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
