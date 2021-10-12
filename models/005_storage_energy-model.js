'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class StorageEnergyModel {
    constructor(pool) {
        this.pool = pool;
        this.name = 'Energy used to store sectors';
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

    Details() {
        return "**Energy used to store sectors** model";
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
            ERROR(`[StorageEnergyModel] NetworkQuery error:${e}`);
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
            ERROR(`[StorageEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableStorageEnergy_min(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('ROUND(AVG(total))*0.0000009688', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('ROUND(AVG(total))*0.0000009688', start, end, filter);
        }

        return result;
    }

    async VariableStorageEnergy_estimate(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('ROUND(AVG(total))*0.0000032212', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('ROUND(AVG(total))*0.0000032212', start, end, filter);
        }

        return result;
    }

    async VariableStorageEnergy_max(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('ROUND(AVG(total))*0.0000071583', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('ROUND(AVG(total))*0.0000071583', start, end, filter);
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

        // variable 1 - storage energy lower bound
        let storageEnergyData_min = await this.VariableStorageEnergy_min(start, end, filter, miner);
        let storageEnergyVariable_min = {
            title: 'Lower bound',
            data: storageEnergyData_min,
        }

        result.data.push(storageEnergyVariable_min);

        // variable 3 - storage energy upper bound
        let storageEnergyData_max = await this.VariableStorageEnergy_max(start, end, filter, miner);
        let storageEnergyVariable_max = {
            title: 'Upper bound',
            data: storageEnergyData_max,
        }

        result.data.push(storageEnergyVariable_max);

        // variable 2 - storage energy estimate
        let storageEnergyData_est = await this.VariableStorageEnergy_estimate(start, end, filter, miner);
        let storageEnergyVariable_est = {
            title: 'Estimate',
            data: storageEnergyData_est,
        }
        
        result.data.push(storageEnergyVariable_est);

        return result;
    }

    async Export(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['epoch','miner','storage_energy_kW_lower','storage_energy_kW_estimate','storage_energy_kW_upper','timestamp'];
                    result = await this.pool.query(`SELECT epoch,miner,
                      total*0.0000009688,
                      total*0.0000032212,
                      total*0.0000071583,timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['epoch','storage_energy_kW_lower','storage_energy_kW_estimate','storage_energy_kW_upper','timestamp'];
                    result = await this.pool.query(`SELECT epoch,
                      total*0.0000009688,
                      total*0.0000032212,
                      total*0.0000071583,timestamp \
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
    StorageEnergyModel
};
