'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')
const {v102PerGiB} = require("./energy_params/v-1-0-2-perGiB");

const consts = {
    sealing_kWh_GiB: v102PerGiB.max.sealing_kWh_GiB_base,
    storage_kW_GiB: v102PerGiB.max.storage_kW_GiB,
    pue: v102PerGiB.max.pue
  }

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
            with energy_use as(
              SELECT
                  SUM((ROUND(AVG(total)) * 24 * ${consts.storage_kW_GiB} + SUM(total_per_day) * ${consts.sealing_kWh_GiB}) * ${consts.pue}) OVER(ORDER BY date) AS energy_use_upper_bound,
                  date_trunc('${filter}', date::date) AS energy_use_timestamp,
                  date_trunc('${filter}', date::date) AS timestamp
                  FROM fil_network_view_days
                  WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                  GROUP BY timestamp, date, total_per_day
                  ORDER BY timestamp
            ),

            energy as(
                SELECT
                SUM(energyWh / 1000) OVER(ORDER BY date) AS energy,
                date_trunc('${filter}', date::date) AS energy_timestamp,
                date_trunc('${filter}', date::date) AS timestamp
                FROM fil_renewable_energy_view_v3
                WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                GROUP BY timestamp, date, energyWh
                ORDER BY timestamp
            ),

            total as (select energy_use.energy_use_upper_bound, 
                energy_use.energy_use_timestamp, 
                energy.energy_timestamp, 
                energy.energy
              from energy_use
            full outer join energy on energy_use.energy_use_timestamp = energy.energy_timestamp)

            SELECT
            COALESCE( ((energy) / NULLIF(energy_use_upper_bound, 0)), 0) as value,
            energy_use_timestamp AS start_date
            FROM total
          `);
        } catch (e) {
            ERROR(`[RenewableEnergyRatioModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async MinerQuery(formula, start, end, filter, miner) {
        var result;

        try {
            result = await this.pool.query(`
            with energy_use as(
              SELECT
                  SUM((ROUND(AVG(total)) * 24 * ${consts.storage_kW_GiB} + SUM(total_per_day) * ${consts.sealing_kWh_GiB}) * ${consts.pue}) OVER(ORDER BY date) AS energy_use_upper_bound,
                  date_trunc('${filter}', date::date) AS energy_use_timestamp,
                  date_trunc('${filter}', date::date) AS timestamp
                  FROM fil_miner_view_days_v4
                  WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                  GROUP BY miner,timestamp, date, total_per_day
                  ORDER BY timestamp
            ),

            energy as(
                SELECT
                SUM(energyWh / 1000) OVER(ORDER BY date) AS energy,
                date_trunc('${filter}', date::date) AS energy_timestamp,
                date_trunc('${filter}', date::date) AS timestamp
                FROM fil_renewable_energy_view_v3
                WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                GROUP BY miner,timestamp, date, energyWh
                ORDER BY timestamp
            ),

            total as (select energy_use.energy_use_upper_bound, 
                energy_use.energy_use_timestamp, 
                energy.energy_timestamp, 
                energy.energy
              from energy_use
            full outer join energy on energy_use.energy_use_timestamp = energy.energy_timestamp)

            SELECT
            COALESCE( ((energy) / NULLIF(energy_use_upper_bound, 0)), 0) as value,
            energy_use_timestamp AS start_date
            FROM total
          `);
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
