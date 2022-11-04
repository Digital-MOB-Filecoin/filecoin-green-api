'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class TotalEmissionsWithRenewableModel {
    constructor(pool) {
        this.code_name = 'TotalEmissionsWithRenewableModel';
        this.pool = pool;
        this.name = 'Emissions Including Renewable Energy Purchases (No Floor)';
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

    async NetworkQuery(start, end, filter, formula) {
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
                        FROM fil_miners_data_view
                        WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY timestamp
                        ORDER BY timestamp
                ) q;
                `);
        } catch (e) {
            ERROR(`[SealingEnergyModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async MinerQuery(start, end, filter, miner, formula) {
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
                        FROM fil_miners_data_view
                        WHERE (miner = '${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY miner, timestamp
                        ORDER BY timestamp
                ) q;
         `);
        } catch (e) {
            ERROR(`[SealingEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableEmissions(start, end, filter, miner, field) {
        var result;

        if (miner) {
            result = await this.MinerQuery(start, end, filter, miner, `ROUND(SUM(SUM((${field} - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date)))`);
        } else {
            result = await this.NetworkQuery(start, end, filter, `ROUND(SUM(SUM((${field} - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date)))`);
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
        let cumulativeEnergyData_min = await this.VariableEmissions(start, end, filter, miner, 'energy_use_kW_lower');
        let cumulativeEnergy_min = {
            title: 'Lower Bound',
            color: COLOR.green,
            data: cumulativeEnergyData_min,
        }
        result.data.push(cumulativeEnergy_min);

        // Estimated cumulative energy use
        let cumulativeEnergyData_est = await this.VariableEmissions(start, end, filter, miner, 'energy_use_kW_estimate');
        let cumulativeEnergy_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: cumulativeEnergyData_est,
        }
        result.data.push(cumulativeEnergy_est);

        // Maximum cumulative energy use
        let cumulativeEnergyData_max = await this.VariableEmissions(start, end, filter, miner, 'energy_use_kW_upper');
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
                    fields = ['miner','emissions_lower','emissions_estimate', 'emissions_upper', 'timestamp'];
                    result = await this.pool.query(`SELECT miner, date_trunc('${filter}', date::date) AS timestamp \
                    , ROUND(SUM(SUM((energy_use_kW_lower - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_lower\" \
                    , ROUND(SUM(SUM((energy_use_kW_estimate - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_estimate\" \
                    , ROUND(SUM(SUM((energy_use_kW_upper - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_upper\" \
                    FROM fil_miners_data_view
                    WHERE (miner = '${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner, timestamp
                    ORDER BY timestamp
                    LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['emissions_lower','emissions_estimate', 'emissions_upper', 'timestamp'];
                    result = await this.pool.query(`SELECT date_trunc('${filter}', date::date) AS timestamp \
                    , ROUND(SUM(SUM((energy_use_kW_lower - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_lower\" \
                    , ROUND(SUM(SUM((energy_use_kW_estimate - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_estimate\" \
                    , ROUND(SUM(SUM((energy_use_kW_upper - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_upper\" \
                    FROM fil_miners_data_view
                    WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY timestamp
                    ORDER BY timestamp
                    LIMIT ${limit} OFFSET ${offset}`);
                }

                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[TotalEmissionsWithRenewableModel] Export error:${e}`);
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
        let filter = 'day';

        INFO(`ResearchExport[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['miner','emissions_lower','emissions_estimate', 'emissions_upper', 'timestamp'];
                    result = await this.pool.query(`SELECT miner, date_trunc('${filter}', date::date) AS timestamp \
                    , ROUND(SUM(SUM((energy_use_kW_lower - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_lower\" \
                    , ROUND(SUM(SUM((energy_use_kW_estimate - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_estimate\" \
                    , ROUND(SUM(SUM((energy_use_kW_upper - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_upper\" \
                    FROM fil_miners_data_view
                    WHERE (miner = '${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner, timestamp
                    ORDER BY timestamp
                    LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['emissions_lower','emissions_estimate', 'emissions_upper', 'timestamp'];
                    result = await this.pool.query(`SELECT date_trunc('${filter}', date::date) AS timestamp \
                    , ROUND(SUM(SUM((energy_use_kW_lower - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_lower\" \
                    , ROUND(SUM(SUM((energy_use_kW_estimate - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_estimate\" \
                    , ROUND(SUM(SUM((energy_use_kW_upper - renewable_energy_kW) * COALESCE(avg_wt_value, avg_un_value, 0))) over (ORDER by date_trunc('${filter}', date::date))) as \"emissions_upper\" \
                    FROM fil_miners_data_view
                    WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY timestamp
                    ORDER BY timestamp
                    LIMIT ${limit} OFFSET ${offset}`);
                }

                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[TotalEmissionsWithRenewableModel] Export error:${e}`);
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
