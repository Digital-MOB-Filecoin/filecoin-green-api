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

    async VariableStorageEnergy(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('ROUND(AVG(total))*0.000003221225472', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('ROUND(AVG(total))*0.000003221225472', start, end, filter);
        }

        return result;
    }

    // async VariableUsedCapacity(start, end, filter, miner) {
    //     var result;
    //
    //     if (miner) {
    //         result = await this.MinerQuery('ROUND(AVG(used))', start, end, filter, miner);
    //     } else {
    //         result = await this.NetworkQuery('ROUND(AVG(used))', start, end, filter);
    //     }
    //
    //     return result;
    // }

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

        // variable 1 - Total Capacity
        let storageEnergyData = await this.VariableStorageEnergy(start, end, filter, miner);
        let storageEnergyVariable = {
            title: 'Storage Energy',
            data: storageEnergyData,
        }

        result.data.push(storageEnergyVariable);

        // // variable 2 - Used Capacity
        // let usedCapacityData = await this.VariableUsedCapacity(start, end, filter, miner);
        // let usedCapacityVariable = {
        //     title: 'Used Capacity',
        //     data: usedCapacityData,
        // }

        // result.data.push(usedCapacityVariable);

        return result;
    }

    async Export(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['epoch','miner','storage_energy_kW','timestamp'];
                    result = await this.pool.query(`SELECT epoch,miner,total*0.000003221225472,timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['epoch','storage_energy_kW','timestamp'];
                    result = await this.pool.query(`SELECT epoch,total*0.000003221225472,timestamp \
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
