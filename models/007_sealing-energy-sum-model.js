'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class SealingEnergySumModel {
    constructor(pool) {
        this.pool = pool;
        this.name = 'Energy used to seal data over time period shown (v1.0.0)';
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
        return `[Sealing](https://spec.filecoin.io/systems/filecoin_mining/sector/sealing/) is the process of generating SNARK proofs for a data sector which will allow an SP to prove that they are continuing to store that data over time, and is one of the components of energy use of the Filecoin network. Energy use due to sealing is estimated by multiplying the increase in storage capacity over a given time period by a constant value as described in the methodology. Bounds and estimate come from different values of this constant.

**Network view:** Total electrical energy used to seal data for the entire Filecoin network, over the given time period.

**Storage Provider (SP) view:** Electrical energy used by this SP to seal data, over the given time period.
`;
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
            result = await this.MinerQuery('ROUND(SUM(total_per_day))*0.0064516254', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('ROUND(SUM(total_per_day))*0.0064516254', start, end, filter);
        }

        return result;
    }

    async VariableSealingEnergy_perDay_estimate(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('ROUND(SUM(total_per_day))*0.0366833157', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('ROUND(SUM(total_per_day))*0.0366833157', start, end, filter);
        }

        return result;
    }

    async VariableSealingEnergy_perDay_upper(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('ROUND(SUM(total_per_day))*0.0601295421', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('ROUND(SUM(total_per_day))*0.0601295421', start, end, filter);
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
            color: COLOR.green,
            data: sealingE_min,
        }

        result.data.push(sealingEVariable_min);

        // variable 2 - Estimated sealing energy, averaged over one day
        let sealingE_est = await this.VariableSealingEnergy_perDay_estimate(start, end, filter, miner);
        let sealingEVariable_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: sealingE_est,
        }

        result.data.push(sealingEVariable_est);

        // variable 3 - Upper bound on sealing energy, averaged over one day
        let sealingE_max = await this.VariableSealingEnergy_perDay_upper(start, end, filter, miner);
        let sealingEVariable_max = {
            title: 'Upper bound',
            color: COLOR.orange,
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
                    result = await this.pool.query(`SELECT epoch, miner, SUM(total_per_epoch)*0.0064516254, SUM(total_per_epoch)*0.0366833157, SUM(total_per_epoch)*0.0601295421, timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['epoch','sealing_energy_kW_lower','sealing_energy_kW_estimate','sealing_energy_kW_upper','timestamp'];
                    result = await this.pool.query(`SELECT epoch, SUM(total_per_epoch)*0.0064516254, SUM(total_per_epoch)*0.0366833157, SUM(total_per_epoch)*0.0601295421, timestamp \
                    FROM fil_network_view_epochs \
                    WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[SealingEnergySumModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    SealingEnergySumModel
};
