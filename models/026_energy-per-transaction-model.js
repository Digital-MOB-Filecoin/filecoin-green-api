'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval } = require('./utils')



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
                       SUM("energy_kw_lower_per_messages") / COUNT(*) as "daily_energy_lower_per_transaction",
                       SUM("energy_kw_estimate_per_messages") / COUNT(*) as "daily_energy_estimate_per_transaction",
                       SUM("energy_kw_upper_per_messages") / COUNT(*) as "daily_energy_upper_per_transaction"
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

        return add_time_interval(params.start, params.end, params.filter, result?.rows || []);
    }

    async VariableEnergyPerTransaction(params) {
        const query_result = await this.NetworkQuery(params);

        let energyPerTxData_min = [];
        let energyPerTxData_est = [];
        let energyPerTxData_max = [];

        for (const item of query_result ) {
            energyPerTxData_min.push({
                value: item.daily_energy_lower_per_transaction,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            energyPerTxData_est.push({
                value: item.daily_energy_estimate_per_transaction,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            energyPerTxData_max.push({
                value: item.daily_energy_upper_per_transaction,
                start_date: item.start_date,
                end_date: item.end_date,
            });

        }

        return {
            energyPerTxData_min,
            energyPerTxData_est,
            energyPerTxData_max,
        };
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

        // variable 1 - energy per tx lower bound
        const { energyPerTxData_min, energyPerTxData_est, energyPerTxData_max} = await this.VariableEnergyPerTransaction(params);
        let energyPerTxVariable_min = {
            title: 'Lower bound',
            color: COLOR.green,
            data: energyPerTxData_min,
        }
        result.data.push(energyPerTxVariable_min);

        // variable 2 - energy per tx estimate
        let energyPerTxVariable_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: energyPerTxData_est,
        }

        result.data.push(energyPerTxVariable_est);

        // variable 3 - energy per tx upper bound
        let energyPerTxVariable_max = {
            title: 'Upper bound',
            color: COLOR.orange,
            data: energyPerTxData_max,
        }

        result.data.push(energyPerTxVariable_max);

        return result;
    }

    async Export(id, params) {
        let data = [];
        const fields = ['start_date','daily_energy_lower_per_transaction', 'daily_energy_estimate_per_transaction', 'daily_energy_upper_per_transaction'];

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
            data = await this.NetworkQuery(params);
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
