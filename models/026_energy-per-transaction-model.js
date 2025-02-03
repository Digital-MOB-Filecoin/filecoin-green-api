'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, add_missing_dates} = require('./utils')



class EnergyPerTransactionModel {
    constructor(pool) {
        this.code_name = 'EnergyPerTransactionModel';
        this.pool = pool;
        this.name = 'Energy per transaction';
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
        return `**Total daily energy consumption per transaction (in kWh)**`;
    }

    async NetworkQuery(params) {
        let result;
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
            result = await this.pool.query(`
                SELECT DATE_TRUNC('${params.filter}', date) AS start_date,
                       SUM(SUM("energy_kw_lower_per_messages")) OVER (ORDER by date_trunc('${params.filter}', date)) / COUNT(*) as "daily_energy_lower_per_transaction",
                        SUM(SUM("energy_kw_estimate_per_messages")) OVER (ORDER by date_trunc('${params.filter}', date)) / COUNT(*) as "daily_energy_estimate_per_transaction",
                        SUM(SUM("energy_kw_upper_per_messages")) OVER (ORDER by date_trunc('${params.filter}', date)) / COUNT(*) as "daily_energy_upper_per_transaction"
                FROM fil_messages_stats
                WHERE
                    (date::date >= '${params.start}'::date)
                  AND (date::date <= '${params.end}'::date)
                GROUP BY start_date
                ORDER BY start_date ${padding};
         `);
        } catch (e) {
            ERROR(`[EnergyPerTransactionModel] NetworkQuery error:${e}`);
        }
        console.log(result);
        console.log(result.rows)


        const rows = add_missing_dates(params.start, params.end, result?.rows || []);
        return add_time_interval(params.start, params.end, params.filter, rows);
    }

    async Query(id, params) {
        INFO(`Query[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        const result = {
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

        result.data.push(await this.NetworkQuery(params));


        // push 3 sets, lower, estimate, upper
        // let variableTotalSealed_Data = {
        //     title: 'Green Score',
        //     color: COLOR.green,
        //     data: variableEnergyPerTransaction,
        // }
        //
        // result.data.push(variableTotalSealed_Data);

        return result;
    }

    async Export(id, params) {
        let data = [];
        const fields = ['start_date','daily_energy_lower_per_transaction', 'daily_energy_estimate_per_transaction', 'daily_energy_upper_per_transaction'];

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
            data = await this.NetworkQuery(params);
            // todo: make sure data contains lower,estimate,upper
        } catch (e) {
            ERROR(`[EnergyPerTransactionModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;
    }

    async ResearchExport(id, params) {
        return this.Export(id, params);
    }

    async ExportHeader(id, params) {
        let header = {
            ReportName: this.name,
            StorageProviderIDs: params.miners,
            Country: params.country,
            From: params.start,
            To: params.start,
            Resolution: params.filter,
        } 

        return header;
    }
}

module.exports = {
    EnergyPerTransactionModel
};
