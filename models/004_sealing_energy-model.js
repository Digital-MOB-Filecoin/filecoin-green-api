'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class SealingEnergyModel {
    constructor(pool) {
        this.pool = pool;
        this.name = 'Energy used to seal sectors';
        this.category = CATEGORY.ENERGY; // see type.js
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.kW;
        this.version = VERSION.v0;
    }

    Name() {
        return this.name;
    }

    Category() {
        return this.category;
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
                        ${formula}                             AS value,
                        date_trunc('${filter}', date::date) AS timestamp
                        FROM fil_network_view_days
                        WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY timestamp
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
                        ${formula}                   AS value,
                        date_trunc('${filter}', date::date) AS timestamp
                    FROM fil_miner_view_days
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner,timestamp
                    ORDER BY timestamp
             ) q;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableSealingEnergy_perDay_min(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('ROUND(AVG(total_per_day))*0.00026882', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('ROUND(AVG(total_per_day))*0.00026882', start, end, filter);
        }

        return result;
    }

    async VariableSealingEnergy_perDay_estimate(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('ROUND(AVG(total_per_day))*0.00152847', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('ROUND(AVG(total_per_day))*0.00152847', start, end, filter);
        }

        return result;
    }

    async VariableSealingEnergy_perDay_upper(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('ROUND(AVG(total_per_day))*0.00250540', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('ROUND(AVG(total_per_day))*0.00250540', start, end, filter);
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

        // variable 1 - Lower bound on sealing energy, averaged over one day
        let sealingE_min = await this.VariableSealingEnergy_perDay_min(start, end, filter, miner);
        let sealingEVariable_min = {
            title: 'Lower bound',
            data: sealingE_min,
        }

        result.data.push(sealingEVariable_min);

        // variable 2 - Estimated sealing energy, averaged over one day
        let sealingE_est = await this.VariableSealingEnergy_perDay_estimate(start, end, filter, miner);
        let sealingEVariable_est = {
            title: 'Estimate',
            data: sealingE_est,
        }

        result.data.push(sealingEVariable_est);

        // variable 3 - Upper bound on sealing energy, averaged over one day
        let sealingE_max = await this.VariableSealingEnergy_perDay_upper(start, end, filter, miner);
        let sealingEVariable_max = {
            title: 'Upper bound',
            data: sealingE_max,
        }

        result.data.push(sealingEVariable_max);

        return result;
    }

    async Export(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['epoch','miner','sealing_energy_kW_lower','sealing_energy_kW_estimate', 'sealing_energy_kW_upper','timestamp'];
                    result = await this.pool.query(`SELECT epoch,miner,
                      total_per_epoch*0.77419505,
                      total_per_epoch*4.40199788,
                      total_per_epoch*7.21554506, timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['epoch','sealing_energy_kW_lower','sealing_energy_kW_estimate','sealing_energy_kW_upper','timestamp'];
                    result = await this.pool.query(`SELECT epoch,
                      total_per_epoch*0.036683315675136,
                      total_per_epoch*4.40199788,
                      total_per_epoch*7.21554506,timestamp \
                    FROM fil_network_view_epochs \
                    WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[StorageEnergyModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    SealingEnergyModel
};
