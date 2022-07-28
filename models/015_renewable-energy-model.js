'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class RenewableEnergyModel {
    constructor(pool) {
        this.code_name = 'RenewableEnergyModel';
        this.pool = pool;
        this.name = 'Cumulative renewable energy purchases ';
        this.category = CATEGORY.ENERGY;
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
        return `Cumulative renewable energy certificate (REC) purchases over time`;
    }

    async NetworkQuery(formula, start, end, filter) {
        var result;

        try {
                result = await this.pool.query(`
                with data as (SELECT
                    ${formula} AS value,
                    date_trunc('${filter}', date::date) AS timestamp
                    FROM fil_renewable_energy_view_v3
                    WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY timestamp, date, energywh
                    ORDER BY timestamp),
                    datapoints as (SELECT value, timestamp AS start_date FROM data)
                    SELECT DISTINCT start_date, value FROM datapoints ORDER BY start_date;
                    `);
        } catch (e) {
            ERROR(`[RenewableEnergyModel] NetworkQuery error:${e}`);
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
                    FROM fil_renewable_energy_view_v3
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner,timestamp,energywh, date
                    ORDER BY timestamp
             ) q;`);
        } catch (e) {
            ERROR(`[RenewableEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableRenewableEnergy(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('SUM(energyWh / 1000) OVER(ORDER BY date)', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('SUM(energyWh / 1000) OVER(ORDER BY date)', start, end, filter);
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

        // variable 1 - Total Capacity
        let renewableEnergyData = await this.VariableRenewableEnergy(start, end, filter, miner);
        let renewableEnergyVariable = {
            title: 'REC',
            color: COLOR.green,
            data: renewableEnergyData,
        }

        result.data.push(renewableEnergyVariable);

        return result;
    }

    async Export(id, start, end, miner, offset, limit, filter) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['miner','energykWh','timestamp'];
                    result = await this.pool.query(`SELECT miner, date_trunc('${filter}', date::date) AS timestamp \
                    , SUM(energyWh / 1000) OVER(ORDER BY date) as \"energykWh\" \
                    FROM fil_renewable_energy_view_v3 \
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date) \
                    ORDER BY timestamp LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['energykWh','timestamp'];
                    result = await this.pool.query(`
                    with data as (SELECT
                        SUM(energyWh / 1000) OVER(ORDER BY date) AS \"energykWh\",
                        date_trunc('${filter}', date::date) AS timestamp
                        FROM fil_renewable_energy_view_v3
                        WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY timestamp, date, energyWh
                        ORDER BY timestamp),
                        datapoints as (SELECT \"energykWh\", timestamp FROM data)
                        SELECT DISTINCT timestamp, \"energykWh\" FROM datapoints ORDER BY timestamp
                        LIMIT ${limit} OFFSET ${offset}`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[RenewableEnergyModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

    async ResearchExport(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`ResearchExport[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['miner','energykWh','timestamp'];
                    result = await this.pool.query(`SELECT miner, date_trunc('day', date::date) AS timestamp \
                    , SUM(energyWh / 1000) OVER(ORDER BY date) as \"energykWh\" \
                    FROM fil_renewable_energy_view_v3 \
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date) \
                    ORDER BY timestamp LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['energykWh','timestamp'];
                    result = await this.pool.query(`
                    with data as (SELECT
                        SUM(energyWh / 1000) OVER(ORDER BY date) AS \"energykWh\",
                        date_trunc('day', date::date) AS timestamp
                        FROM fil_renewable_energy_view_v3
                        WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY timestamp, date, energyWh
                        ORDER BY timestamp),
                        datapoints as (SELECT \"energykWh\", timestamp FROM data)
                        SELECT DISTINCT timestamp, \"energykWh\" FROM datapoints ORDER BY timestamp
                        LIMIT ${limit} OFFSET ${offset}`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[RenewableEnergyModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    RenewableEnergyModel
};
