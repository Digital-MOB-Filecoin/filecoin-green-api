'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

const epoch_DOT = 120; // ( 1 hours (3600 sec) / 1 epoch (30 sec))

class TotalStoredOverTimeModel {
    constructor(pool) {
        this.pool = pool;
        this.name = 'Data stored over time in GiB*hours';
        this.category = CATEGORY.CAPACITY; // see type.js
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.GiB;
        this.version = VERSION.v0;
    }

    Name() {
        return this.name;
    }

    Category() {
        return this.category;
    }

    Details() {
        return `Data stored over time in GiB*hours`;
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
                    FROM fil_miner_view_days_v3
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner,timestamp,date,total_per_day
                    ORDER BY timestamp
             ) q;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableTotalStoredOverTime(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('SUM(ROUND(AVG(total)) * 24) OVER(ORDER BY date)', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('SUM(ROUND(AVG(total)) * 24) OVER(ORDER BY date)', start, end, filter);
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

        // variable 1 - Total sealed
        let variableTotalStoredOverTime = await this.VariableTotalStoredOverTime(start, end, filter, miner);
        let variableTotalStoredOverTime_Data = {
            title: 'Sealed',
            color: COLOR.silver,
            data: variableTotalStoredOverTime,
        }

        result.data.push(variableTotalStoredOverTime_Data);

        return result;
    }

    async Export(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['epoch','miner','total_data_over_time_GiB_h','timestamp'];
                    result = await this.pool.query(`SELECT epoch, miner, total / ${epoch_DOT} as \"total_data_over_time_GiB_h\", \
                                                                         timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    GROUP BY epoch,miner,timestamp,total ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['epoch','total_data_over_time_GiB_h','timestamp'];
                    result = await this.pool.query(`SELECT epoch, total / ${epoch_DOT} as \"total_data_over_time_GiB_h\", \
                                                                  timestamp \
                    FROM fil_network_view_epochs \
                    WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    GROUP BY epoch,timestamp,total ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[TotalStoredOverTimeModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    TotalStoredOverTimeModel
};
