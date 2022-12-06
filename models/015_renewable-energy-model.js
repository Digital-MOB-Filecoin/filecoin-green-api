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

    async NetworkQuery(params) {
        var result;

        try {
                result = await this.pool.query(`
                with data as (SELECT
                    SUM(energyWh / 1000) OVER(ORDER BY date) AS value,
                    date_trunc('${params.filter}', date::date) AS timestamp
                    FROM fil_renewable_energy_view_v3
                    WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY timestamp, date, energywh
                    ORDER BY timestamp),
                    datapoints as (SELECT value, timestamp AS start_date FROM data)
                    SELECT DISTINCT start_date, value FROM datapoints ORDER BY start_date;
                    `);
        } catch (e) {
            ERROR(`[RenewableEnergyModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async MinerQuery(params) {
        var result;

        try {
                result = await this.pool.query(`
                SELECT
                value,
                timestamp AS start_date
                FROM (
                    SELECT
                         SUM(energyWh / 1000) OVER(ORDER BY date)                   AS value,
                        date_trunc('${params.filter}', date::date) AS timestamp
                    FROM fil_renewable_energy_view_v3
                    WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY timestamp,energywh, date
                    ORDER BY timestamp
             ) q;`);
        } catch (e) {
            ERROR(`[RenewableEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async CountryQuery(params) {
        var result;

        try {
                result = await this.pool.query(`
                SELECT
                ROUND(AVG(value)) as value,
                date_trunc('${params.filter}', date::date) AS start_date
                FROM (
                    SELECT
                        SUM(renewable_energy_kW / 1000) AS value,
                        date
                    FROM fil_miners_data_view_country
                    WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                    GROUP BY country, date
                    ORDER BY date
             ) q GROUP BY start_date ORDER BY start_date;`);
        } catch (e) {
            ERROR(`[RenewableEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async VariableRenewableEnergy(params) {
        var result;

        if (params.miners) {
            result = await this.MinerQuery(params);
        } else if (params.country) {
            result = await this.CountryQuery(params);
        } else {
            result = await this.NetworkQuery(params);
        }

        return result;
    }

    async Query(id, params) {
        INFO(`Query[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        let result = {
            id : id,
            code_name: this.code_name,
            name : this.name,
            category : this.category,
            x : this.x,
            y : this.y,
            version : this.version,
            filter : params.filter,
            miner : params.miners,
            data : [] // [ {title: 'variable 1', data: []} , {title: 'variable 2', data: []} ]
        }

        // variable 1 - Total Capacity
        let renewableEnergyData = await this.VariableRenewableEnergy(params);
        let renewableEnergyVariable = {
            title: 'REC',
            color: COLOR.green,
            data: renewableEnergyData,
        }

        result.data.push(renewableEnergyVariable);

        return result;
    }

    async Export(id, params) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
                let result;

                if (params.miners) {
                    fields = ['miner','energykWh','timestamp'];
                    result = await this.pool.query(`SELECT miner, date_trunc('${params.filter}', date::date) AS timestamp \
                    , SUM(energyWh / 1000) OVER(ORDER BY date) as \"energykWh\" \
                    FROM fil_renewable_energy_view_v3 \
                    WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date) \
                    ORDER BY timestamp LIMIT ${params.limit} OFFSET ${params.offset}`);

                } else {
                    fields = ['energykWh','timestamp'];
                    result = await this.pool.query(`
                    with data as (SELECT
                        SUM(energyWh / 1000) OVER(ORDER BY date) AS \"energykWh\",
                        date_trunc('${params.filter}', date::date) AS timestamp
                        FROM fil_renewable_energy_view_v3
                        WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                        GROUP BY timestamp, date, energyWh
                        ORDER BY timestamp),
                        datapoints as (SELECT \"energykWh\", timestamp FROM data)
                        SELECT DISTINCT timestamp, \"energykWh\" FROM datapoints ORDER BY timestamp
                        LIMIT ${params.limit} OFFSET ${params.offset}`);
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

    async ResearchExport(id, params) {
        let data = [];
        let fields;

        INFO(`ResearchExport[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
                let result;

                if (params.miners) {
                    fields = ['miner','energykWh','timestamp'];
                    result = await this.pool.query(`SELECT miner, date_trunc('day', date::date) AS timestamp \
                    , SUM(energyWh / 1000) OVER(ORDER BY date) as \"energykWh\" \
                    FROM fil_renewable_energy_view_v3 \
                    WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date) \
                    ORDER BY timestamp LIMIT ${params.limit} OFFSET ${params.offset}`);

                } else {
                    fields = ['energykWh','timestamp'];
                    result = await this.pool.query(`
                    with data as (SELECT
                        SUM(energyWh / 1000) OVER(ORDER BY date) AS \"energykWh\",
                        date_trunc('day', date::date) AS timestamp
                        FROM fil_renewable_energy_view_v3
                        WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                        GROUP BY timestamp, date, energyWh
                        ORDER BY timestamp),
                        datapoints as (SELECT \"energykWh\", timestamp FROM data)
                        SELECT DISTINCT timestamp, \"energykWh\" FROM datapoints ORDER BY timestamp
                        LIMIT ${params.limit} OFFSET ${params.offset}`);
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
