'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval } = require('./utils')



class EmissionsPerTransactionModel {
    constructor(pool) {
        this.code_name = 'EmissionsPerTransactionModel';
        this.pool = pool;
        this.name = 'Emissions per transaction';
        this.category = CATEGORY.EMISSIONS;
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
        return `**Total daily emissions per transaction**`;
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
                       SUM("emissions_lower_per_messages") / COUNT(*) as "daily_emissions_lower_per_transaction",
                       SUM("emissions_estimate_per_messages") / COUNT(*) as "daily_emissions_estimate_per_transaction",
                       SUM("emissions_upper_per_messages") / COUNT(*) as "daily_emissions_upper_per_transaction"
                FROM fil_messages_stats
                WHERE
                    (date::date >= '${params.start}'::date)
                  AND (date::date <= '${params.end}'::date)
                GROUP BY start_date
                ORDER BY start_date ${padding};
         `);
        } catch (e) {
            ERROR(`[EmissionsPerTransactionModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result?.rows || []);
    }

    async VariableEmissionsPerTransaction(params) {
        const query_result = await this.NetworkQuery(params);

        let emissionsPerTxData_min = [];
        let emissionsPerTxData_est = [];
        let emissionsPerTxData_max = [];

        for (const item of query_result ) {
            emissionsPerTxData_min.push({
                value: item.daily_emissions_lower_per_transaction,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            emissionsPerTxData_est.push({
                value: item.daily_emissions_estimate_per_transaction,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            emissionsPerTxData_max.push({
                value: item.daily_emissions_upper_per_transaction,
                start_date: item.start_date,
                end_date: item.end_date,
            });

        }

        return {
            emissionsPerTxData_min,
            emissionsPerTxData_est,
            emissionsPerTxData_max,
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

        // variable 1 - emissions per tx lower bound
        const { emissionsPerTxData_min, emissionsPerTxData_est, emissionsPerTxData_max} = await this.VariableEmissionsPerTransaction(params);
        let emissionsPerTxVariable_min = {
            title: 'Lower bound',
            color: COLOR.green,
            data: emissionsPerTxData_min,
        }
        result.data.push(emissionsPerTxVariable_min);

        // variable 2 - emissions per tx estimate
        let emissionsPerTxVariable_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: emissionsPerTxData_est,
        }

        result.data.push(emissionsPerTxVariable_est);

        // variable 3 - emissions per tx upper bound
        let emissionsPerTxVariable_max = {
            title: 'Upper bound',
            color: COLOR.orange,
            data: emissionsPerTxData_max,
        }

        result.data.push(emissionsPerTxVariable_max);

        return result;
    }

    async Export(id, params) {
        let data = [];
        const fields = ['start_date','daily_emissions_lower_per_transaction', 'daily_emissions_estimate_per_transaction', 'daily_emissions_upper_per_transaction'];

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
            data = await this.NetworkQuery(params);
        } catch (e) {
            ERROR(`[EmissionsPerTransactionModel] Export error:${e}`);
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
    EmissionsPerTransactionModel
};
