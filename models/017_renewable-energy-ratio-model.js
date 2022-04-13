'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class RenewableEnergyRatioModel {
    constructor(pool) {
        this.code_name = 'RenewableEnergyRatioModel';
        this.pool = pool;
        this.name = 'Renewable Energy Ratio';
        this.category = CATEGORY.ENERGY; // see type.js
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.PERCENTAGE;
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
        return `Renewable Energy Ratio`;
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
                        FROM fil_renewable_energy_ratio_network_view
                        WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY timestamp,date,ratio
                        ORDER BY timestamp
                ) q;`);
        } catch (e) {
            ERROR(`[RenewableEnergyRatioModel] NetworkQuery error:${e}`);
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
                    FROM fil_renewable_energy_ratio_miner_view
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner,timestamp,date,ratio
                    ORDER BY timestamp
             ) q;`);
        } catch (e) {
            ERROR(`[RenewableEnergyRatioModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableRenewableEnergyRatio(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery(`ratio`, start, end, filter, miner);
        } else {
            result = await this.NetworkQuery(`ratio`, start, end, filter);
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

        // Renewable Energy Ratio
        let renewableEnergyRatioData = await this.VariableRenewableEnergyRatio(start, end, filter, miner);
        let renewableEnergyRatio = {
            title: 'Renewable Energy Ratio',
            color: COLOR.green,
            data: renewableEnergyRatioData,
        }
        result.data.push(renewableEnergyRatio);

        return result;
    }

    async Export(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['miner','ratio', 'date'];
                    result = await this.pool.query(`SELECT miner, ratio, date \
                    FROM fil_renewable_energy_ratio_miner_view \
                    WHERE (miner = '${miner}') AND (date >= '${start}') AND (date <= '${end}') \
                    GROUP BY miner,ratio,date ORDER BY date LIMIT ${limit} OFFSET ${offset}`);
                } else {
                    fields = ['ratio', 'date'];
                    result = await this.pool.query(`SELECT ratio, date \
                    FROM fil_renewable_energy_ratio_network_view \
                    WHERE (date >= '${start}') AND (date <= '${end}') \
                    GROUP BY ratio,date ORDER BY date LIMIT ${limit} OFFSET ${offset}`);
                }


                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[RenewableEnergyRatioModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    RenewableEnergyRatioModel
};
