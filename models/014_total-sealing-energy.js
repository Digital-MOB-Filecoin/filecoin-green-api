'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

// Model parameters, in kWh/GiB
let sealing_kWh_per_GiB_block_min = '0.0064516254';
let sealing_kWh_per_GiB_block_est = '0.0366833157';
let sealing_kWh_per_GiB_block_max = '0.0601295421';

class TotalSealingEnergyModel {
    constructor(pool) {
        this.pool = pool;
        this.name = 'Cumulative amount of energy used to seal files in kWh (v1.0.1)';
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
        return `Cumulative amount of energy used to seal files in kWh (v1.0.1)`;
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
                        GROUP BY timestamp,date
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
                    GROUP BY miner,timestamp,date
                    ORDER BY timestamp
             ) q;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableTotalSealed(start, end, filter, sealingParam, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery(`(SUM(SUM(total_per_day)) OVER(ORDER BY date))*${sealingParam}`, start, end, filter, miner);
        } else {
            result = await this.NetworkQuery(`(SUM(SUM(total_per_day)) OVER(ORDER BY date))*${sealingParam}`, start, end, filter);
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

        // variable 1 - Minimum total sealing energy
        let variableTotalSealingEnergy_min = await this.VariableTotalSealed(start, end, filter, sealing_kWh_per_GiB_block_min, miner);
        let variableTotalSealingEnergy_min_data = {
            title: 'Sealing Energy Lower Bound (v1.0.1)',
            color: COLOR.green,
            data: variableTotalSealingEnergy_min,
        }
        result.data.push(variableTotalSealingEnergy_min_data);

        // variable 2 - Estimated total sealing energy
        let variableTotalSealingEnergy_est = await this.VariableTotalSealed(start, end, filter, sealing_kWh_per_GiB_block_est, miner);
        let variableTotalSealingEnergy_est_data = {
            title: 'Sealing Energy Estimate (v1.0.1)',
            color: COLOR.silver,
            data: variableTotalSealingEnergy_est,
        }
        result.data.push(variableTotalSealingEnergy_est_data);

        // variable 3 - Max total sealing energy
        let variableTotalSealingEnergy_max = await this.VariableTotalSealed(start, end, filter, sealing_kWh_per_GiB_block_max, miner);
        let variableTotalSealingEnergy_max_data = {
            title: 'Sealing Energy Upper Bound (v1.0.1)',
            color: COLOR.orange,
            data: variableTotalSealingEnergy_max,
        }
        result.data.push(variableTotalSealingEnergy_max_data);

        return result;
    }

    async Export(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['epoch','miner','sealing_energy_kWh_min','sealing_energy_kWh_est','sealing_energy_kWh_max','timestamp'];
                    result = await this.pool.query(`
                      with baseQuery as(
                        SELECT
                          epoch,
                          miner,
                          SUM(SUM(total_per_epoch)) OVER(ORDER BY epoch)as \"total_sealed_GiB\", \
                                                                         timestamp \
                      FROM fil_miner_view_epochs \
                      WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                      GROUP BY epoch,miner,timestamp,total_per_epoch ORDER BY epoch LIMIT ${limit} OFFSET ${offset})

                      SELECT
                        epoch as epoch,
                        miner as miner,
                        \"total_sealed_GiB\"*${sealing_kWh_per_GiB_block_min} as \"sealing_energy_kWh_min\",
                        \"total_sealed_GiB\"*${sealing_kWh_per_GiB_block_est} as \"sealing_energy_kWh_est\",
                        \"total_sealed_GiB\"*${sealing_kWh_per_GiB_block_max} as \"sealing_energy_kWh_max\",
                        timestamp as timestamp
                      FROM baseQuery`);

                } else {
                    fields = ['epoch','sealing_energy_kWh_min','sealing_energy_kWh_est','sealing_energy_kWh_max','timestamp'];
                    result = await this.pool.query(`
                      with baseQuery as(
                        SELECT
                          epoch,
                          SUM(SUM(total_per_epoch)) OVER(ORDER BY epoch)as \"total_sealed_GiB\", \
                                                                         timestamp \
                      FROM fil_network_view_epochs \
                      WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                      GROUP BY epoch,timestamp,total_per_epoch ORDER BY epoch LIMIT ${limit} OFFSET ${offset})

                      SELECT
                        epoch as epoch,
                        \"total_sealed_GiB\"*${sealing_kWh_per_GiB_block_min} as \"sealing_energy_kWh_min\",
                        \"total_sealed_GiB\"*${sealing_kWh_per_GiB_block_est} as \"sealing_energy_kWh_est\",
                        \"total_sealed_GiB\"*${sealing_kWh_per_GiB_block_max} as \"sealing_energy_kWh_max\",
                        timestamp as timestamp
                      FROM baseQuery`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[TotalSealingEnergyModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    TotalSealingEnergyModel
};
