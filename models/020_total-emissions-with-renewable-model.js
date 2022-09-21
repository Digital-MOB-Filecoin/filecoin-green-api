'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

const epoch_DOT = 120; // ( 1 hours (3600 sec) / 1 epoch (30 sec))

const energy_conts_v1p0p1 = require("./energy_params/v-1-0-1-perGiB.json")

class TotalEmissionsWithRenewableModel {
    constructor(pool) {
        this.code_name = 'TotalEmissionsWithRenewableModel';
        this.pool = pool;
        this.name = 'Calculate emissions given renewable energy purchases';
        this.category = CATEGORY.EMISSIONS; // see type.js
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.co2;
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
        return `Total amount of emissions during a time period gCO2`;
    }

    async NetworkQuery(start, end, filter, consts) {
        var result;

        try {
                result = await this.pool.query(`
                with datapoints as (
                    SELECT
                        fil_emissions_view.miner,
                        fil_emissions_view.total,
                        fil_emissions_view.total_per_day,
                        fil_emissions_view.avg_un_value,
                        fil_emissions_view.avg_wt_value,
                        fil_renewable_energy_view_v3.energywh as renewableEnergyWh,
                        fil_emissions_view.date
                    FROM fil_emissions_view
                    left join fil_renewable_energy_view_v3 ON fil_renewable_energy_view_v3.miner = fil_emissions_view.miner and fil_renewable_energy_view_v3.date = fil_emissions_view.date
                ),
                     emissions_data as (SELECT
                          value,
                          miner,
                          timestamp AS start_date
                          FROM (
                              SELECT
                                  date_trunc('${filter}', date::date) AS timestamp,
                                  miner,
                                SUM( (
                                    ( (ROUND(AVG(total)) * 24 * ${consts.storage_kW_GiB} + SUM(total_per_day) * ${consts.sealing_kWh_GiB}) * ${consts.pue} -  COALESCE(renewableEnergyWh, 0 )) * COALESCE(avg_wt_value, avg_un_value, 0) ) ) OVER(ORDER BY date) AS value
                              FROM datapoints
                              WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                              GROUP BY miner,date,timestamp, total_per_day, avg_wt_value, avg_un_value, renewableEnergyWh
                              ORDER BY timestamp
                       ) q)
                SELECT DISTINCT ON (start_date) start_date, value FROM emissions_data;
                `);
        } catch (e) {
            ERROR(`[SealingEnergyModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async MinerQuery(start, end, filter, miner, consts) {
        var result;

        try {
            result = await this.pool.query(`
            with emissions_data as (
                SELECT
                    date_trunc('${filter}', date::date) AS timestamp,
                        ( ROUND(AVG(total)) * 24 * ${consts.storage_kW_GiB} + SUM(total_per_day) * ${consts.sealing_kWh_GiB} ) * ${consts.pue} AS energyWh,
                        COALESCE(avg_wt_value, avg_un_value, 0) as emmisions_coeff
                FROM fil_emissions_view
                WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                GROUP BY miner, timestamp, date, total_per_day, avg_wt_value, avg_un_value
                ORDER BY timestamp
         ),
         renewable_data as (
            SELECT
                     SUM(energyWh / 1000) OVER(ORDER BY date) AS renewableEnergyWh,
                     date_trunc('${filter}', date::date) AS timestamp
            FROM fil_renewable_energy_view_v3
            WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
            GROUP BY miner,timestamp,energywh, date
            ORDER BY timestamp
         )
         SELECT
            emissions_data.timestamp AS start_date,
            SUM((energyWh - COALESCE(renewableEnergyWh, 0)) * emmisions_coeff) OVER(ORDER BY emissions_data.timestamp) AS value
        FROM emissions_data
        full outer join renewable_data on emissions_data.timestamp = renewable_data.timestamp;

         `);
        } catch (e) {
            ERROR(`[SealingEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableEmissions(start, end, filter, miner, consts) {
        var result;

        if (miner) {
            result = await this.MinerQuery(start, end, filter, miner, consts);
        } else {
            result = await this.NetworkQuery(start, end, filter, consts);
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

        // Minimum cumulative energy use
        let cumulativeEnergyData_min = await this.VariableEmissions(start, end, filter, miner, energy_conts_v1p0p1.min);
        let cumulativeEnergy_min = {
            title: 'Lower Bound',
            color: COLOR.green,
            data: cumulativeEnergyData_min,
        }
        result.data.push(cumulativeEnergy_min);

        // Estimated cumulative energy use
        let cumulativeEnergyData_est = await this.VariableEmissions(start, end, filter, miner, energy_conts_v1p0p1.estimate);
        let cumulativeEnergy_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: cumulativeEnergyData_est,
        }
        result.data.push(cumulativeEnergy_est);

        // Maximum cumulative energy use
        let cumulativeEnergyData_max = await this.VariableEmissions(start, end, filter, miner, energy_conts_v1p0p1.max);
        let cumulativeEnergy_max = {
            title: 'Upper Bound',
            color: COLOR.orange,
            data: cumulativeEnergyData_max,
        }
        result.data.push(cumulativeEnergy_max);

        return result;
    }

    async Export(id, start, end, miner, offset, limit, filter) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['miner','energy_use_kW_lower','energy_use_kW_estimate', 'energy_use_kW_upper', 'timestamp'];
                    result = await this.pool.query(`SELECT miner, date_trunc('${filter}', date::date) AS timestamp \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.min.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.min.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.min.pue}) OVER(ORDER BY date) as \"energy_use_kW_lower\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.estimate.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.estimate.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.estimate.pue}) OVER(ORDER BY date) as \"energy_use_kW_estimate\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.max.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.max.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.max.pue}) OVER(ORDER BY date) as \"energy_use_kW_upper\" \
                    FROM fil_emissions_view
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner,timestamp,date,total_per_day
                    ORDER BY timestamp \
                    LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['energy_use_kW_lower','energy_use_kW_estimate','energy_use_kW_upper','timestamp'];
                    result = await this.pool.query(`SELECT date_trunc('${filter}', date::date) AS timestamp \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.min.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.min.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.min.pue}) OVER(ORDER BY date) as \"energy_use_kW_lower\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.estimate.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.estimate.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.estimate.pue}) OVER(ORDER BY date) as \"energy_use_kW_estimate\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.max.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.max.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.max.pue}) OVER(ORDER BY date) as \"energy_use_kW_upper\" \
                    FROM fil_emissions_view
                    WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY timestamp,date,total_per_day
                    ORDER BY timestamp \
                    LIMIT ${limit} OFFSET ${offset}`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[TotalEmissions] Export error:${e}`);
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
                    fields = ['miner','energy_use_kW_lower','energy_use_kW_estimate', 'energy_use_kW_upper', 'timestamp'];
                    result = await this.pool.query(`SELECT miner, date_trunc('day', date::date) AS timestamp \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.min.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.min.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.min.pue}) OVER(ORDER BY date) as \"energy_use_kW_lower\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.estimate.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.estimate.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.estimate.pue}) OVER(ORDER BY date) as \"energy_use_kW_estimate\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.max.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.max.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.max.pue}) OVER(ORDER BY date) as \"energy_use_kW_upper\" \
                    FROM fil_emissions_view
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner,timestamp,date,total_per_day
                    ORDER BY timestamp \
                    LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['energy_use_kW_lower','energy_use_kW_estimate','energy_use_kW_upper','timestamp'];
                    result = await this.pool.query(`SELECT date_trunc('day', date::date) AS timestamp \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.min.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.min.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.min.pue}) OVER(ORDER BY date) as \"energy_use_kW_lower\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.estimate.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.estimate.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.estimate.pue}) OVER(ORDER BY date) as \"energy_use_kW_estimate\" \
                    , SUM( (ROUND(AVG(total)) * 24 * ${energy_conts_v1p0p1.max.storage_kW_GiB} + SUM(total_per_day) * ${energy_conts_v1p0p1.max.sealing_kWh_GiB}) * ${energy_conts_v1p0p1.max.pue}) OVER(ORDER BY date) as \"energy_use_kW_upper\" \
                    FROM fil_emissions_view
                    WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY timestamp,date,total_per_day
                    ORDER BY timestamp \
                    LIMIT ${limit} OFFSET ${offset}`);
                }



                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[TotalEmissions] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    TotalEmissionsWithRenewableModel
};