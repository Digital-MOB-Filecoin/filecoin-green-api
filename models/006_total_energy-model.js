'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class TotalEnergyModel {
    constructor(pool) {
        this.pool = pool;
        this.name = 'Total electrical energy used including sealing, storage and infrastructure';
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

    async NetworkQuery(sealingCoeff, storageCoeff, pue, start, end, filter) {
        var result;

        try {
                result = await this.pool.query(`
                  with sealing as(
                    SELECT
                        ROUND(AVG(total_per_day))*${sealingCoeff} AS sealing_power_kW,
                        date_trunc('${filter}', date::date) AS sealing_timestamp
                        FROM fil_network_view_days
                        WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY timestamp
                        ORDER BY timestamp
                  ),

                  storage as(
                    SELECT
                        ROUND(AVG(total))*${storageCoeff} AS storage_power_kW,
                        date_trunc('${filter}', date::date) AS storage_timestamp
                        FROM fil_network_view_days
                        WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY timestamp
                        ORDER BY timestamp
                  ),

                  total_powers as (select storage.storage_power_kW, storage.storage_timestamp, sealing.sealing_timestamp, sealing.sealing_power_kW from storage
                  full outer join sealing on storage.storage_timestamp = sealing.sealing_timestamp)

                  SELECT
                    (storage_power_kW + sealing_power_kW) * ${pue} as value,
                    storage_timestamp AS start_date
                  FROM total_powers
                )`);
        } catch (e) {
            ERROR(`[StorageEnergyModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async MinerQuery(sealingCoeff, storageCoeff, pue, start, end, filter, miner) {
        var result;

        try {
                result = await this.pool.query(`
                  with sealing as(
                   SELECT
                       ROUND(AVG(total_per_day))*${sealingCoeff} AS sealing_power_kW,
                       date_trunc('${filter}', date::date) AS sealing_timestamp
                       FROM fil_miner_view_days
                       WHERE (miner='${miner}') AND date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                       GROUP BY timestamp
                       ORDER BY timestamp
                 ),

                 storage as(
                   SELECT
                       ROUND(AVG(total))*${storageCoeff} AS storage_power_kW,
                       date_trunc('${filter}', date::date) AS storage_timestamp
                       FROM fil_miner_view_days
                       WHERE (miner='${miner}') AND date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                       GROUP BY timestamp
                       ORDER BY timestamp
                 ),

                 total_powers as (select storage.storage_power_kW, storage.storage_timestamp, sealing.sealing_timestamp, sealing.sealing_power_kW from storage
                 full outer join sealing on storage.storage_timestamp = sealing.sealing_timestamp)

                 SELECT
                   (storage_power_kW + sealing_power_kW) * ${pue} as value,
                   storage_timestamp AS start_date
                 FROM total_powers
             )`);
        } catch (e) {
            ERROR(`[StorageEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableTotalEnergy_min(start, end, filter, miner) {
        var result;

        if (miner) {
            // MinerQuery(sealingCoeff, storageCoeff, pue, start, end, filter, miner)
            result = await this.MinerQuery('0.00026882', '0.0000009688', 1.18, start, end, filter, miner);
        } else {
            // NetworkQuery(sealingCoeff, storageCoeff, pue, start, end, filter)
            result = await this.NetworkQuery('0.00026882', '0.0000009688', 1.18, start, end, filter);
        }

        return result;
    }

    async VariableTotalEnergy_estimate(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('0.00152847', '0.0000032212', 1.57, start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('0.00152847', '0.0000032212', 1.57, start, end, filter);
        }

        return result;
    }

    async VariableTotalEnergy_max(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('0.00250540', '0.0000071583', 1.93, start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('0.00250540', '0.0000071583', 1.93, start, end, filter);
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

        // variable 1 - total energy lower bound
        let totalEnergyData_min = await this.VariableTotalEnergy_min(start, end, filter, miner);
        let totalEnergyVariable_min = {
            title: 'Lower bound',
            data: totalEnergyData_min,
        }

        result.data.push(totalEnergyVariable_min);

        return result;

        // variable 2 - total energy estimate
        let totalEnergyData_est = await this.VariableTotalEnergy_estimate(start, end, filter, miner);
        let totalEnergyVariable_est = {
            title: 'Estimate',
            data: totalEnergyData_est,
        }

        result.data.push(totalEnergyVariable_est);

        return result;

        // variable 3 - total energy upper bound
        let totalEnergyData_max = await this.VariableTotalEnergy_max(start, end, filter, miner);
        let totalEnergyVariable_max = {
            title: 'Upper bound',
            data: totalEnergyData_max,
        }

        result.data.push(totalEnergyVariable_max);

        return result;
    }

    async Export(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                sealing_kW_per_GiB_block_min = '.77419505'
                sealing_kW_per_GiB_block_est = '4.40199788'
                sealing_kW_per_GiB_block_max = '7.21554506'

                storage_kW_per_GiB_min = '0.0000009688'
                storage_kW_per_GiB_est = '0.0000032212'
                storage_kW_per_GiB_max = '0.0000071583'

                pue_min = 1.18
                pue_est = 1.57
                put_max = 1.93

                if (miner) {
                    fields = ['epoch','miner','total_energy_kW_lower','total_energy_kW_estimate','total_energy_kW_upper','timestamp'];
                    result = await this.pool.query(`SELECT epoch,miner,
                      total*0.0000009688,
                      total*0.0000032212,
                      total*0.0000071583,timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`

                    `with sealing as(
                      SELECT epoch as sealing_epoch, miner as sealing_miner, total_per_epoch AS sealing_added_GiB, timestamp as sealing_timestamp
                          FROM fil_network_view_epochs
                          WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)})
                          ORDER BY epoch LIMIT ${limit} OFFSET ${offset}
                    ),

                    storage as(
                      SELECT epoch as storage_epoch, miner as storage_miner, total AS stored_GiB, timestamp as storage_timestamp
                          FROM fil_network_view_epochs
                          WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)})
                          ORDER BY epoch LIMIT ${limit} OFFSET ${offset}
                    ),

                    total_metrics as (select storage.stored_GiB, storage.storage_epoch, storage.storage_timestamp, storage.storage_miner, sealing.sealing_added_GiB, sealing.sealing_epoch, sealing.sealing_timestamp, sealing.sealing_miner from storage
                    full outer join sealing on storage.storage_epoch = sealing.sealing_epoch)

                    SELECT
                      storage_epoch,
                      storage_miner,
                      (stored_GiB*${storage_kW_per_GiB_min} + sealing_added_GiB*${sealing_kW_per_GiB_block_min}) * ${pue_min},
                      (stored_GiB*${storage_kW_per_GiB_est} + sealing_added_GiB*${sealing_kW_per_GiB_block_est}) * ${pue_est},
                      (stored_GiB*${storage_kW_per_GiB_max} + sealing_added_GiB*${sealing_kW_per_GiB_block_max}) * ${pue_max},
                      storage_timestamp
                    FROM total_powers
                    )`);

                } else {
                    fields = ['epoch','total_energy_kW_lower','total_energy_kW_estimate','total_energy_kW_upper','timestamp'];
                    result = await this.pool.query(`with sealing as(
                      SELECT epoch as sealing_epoch, total_per_epoch AS sealing_added_GiB, timestamp as sealing_timestamp
                          FROM fil_network_view_epochs
                          WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)})
                          ORDER BY epoch LIMIT ${limit} OFFSET ${offset}
                    ),

                    storage as(
                      SELECT epoch as storage_epoch, total AS stored_GiB, timestamp as storage_timestamp
                          FROM fil_network_view_epochs
                          WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)})
                          ORDER BY epoch LIMIT ${limit} OFFSET ${offset}
                    ),

                    total_metrics as (select storage.stored_GiB, storage.storage_epoch, storage.storage_timestamp, sealing.sealing_added_GiB, sealing.sealing_epoch, sealing.sealing_timestamp from storage
                    full outer join sealing on storage.storage_epoch = sealing.sealing_epoch)

                    SELECT
                      storage_epoch,
                      (stored_GiB*${storage_kW_per_GiB_min} + sealing_added_GiB*${sealing_kW_per_GiB_block_min}) * ${pue_min},
                      (stored_GiB*${storage_kW_per_GiB_est} + sealing_added_GiB*${sealing_kW_per_GiB_block_est}) * ${pue_est},
                      (stored_GiB*${storage_kW_per_GiB_max} + sealing_added_GiB*${sealing_kW_per_GiB_block_max}) * ${pue_max},
                      storage_timestamp
                    FROM total_powers
                    )`);
                }


                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[TotalEnergyModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    TotalEnergyModel
};
