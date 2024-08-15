'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')
const {v102PerGiB} = require("./energy_params/v-1-0-2-perGiB");

const storage_kW_per_GiB_min = v102PerGiB.min.storage_kW_GiB;
const storage_kW_per_GiB_est = v102PerGiB.estimate.storage_kW_GiB;
const storage_kW_per_GiB_max = v102PerGiB.max.storage_kW_GiB;

class StorageEnergyModelv_1_0_2 {
    constructor(pool) {
        this.code_name = 'StorageEnergyModelv_1_0_2';
        this.pool = pool;
        this.name = 'Energy used to store data (v1.0.2)';
        this.category = CATEGORY.ENERGY; // see type.js
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.kW;
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
        return `The energy used to store data over time, which is a component of the energy used by the Filecoin network. Storage energy use is estimated by multiplying storage capacity by a constant value. Bounds and estimate come from different values of this constant.

**Network view:** Total electrical power used to store all data on the Filecoin network.

**Storage Provider (SP) view:** Electrical power used by this SP to store data.
`;
    }

    async NetworkQuery(params) {
        var result;
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
                result = await this.pool.query(`
                with storage as(
                    SELECT
                        ROUND(AVG(cumulative_capacity)) AS total,
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                                date,
                                SUM(total) AS  cumulative_capacity
                            FROM fil_miners_data_view_country_v9
                            WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY date) q1
                        GROUP BY date ORDER BY date ${padding})

                    SELECT
                            start_date,
                            total * ${storage_kW_per_GiB_min} as \"storage_energy_kW_lower\" ,
                            total * ${storage_kW_per_GiB_est}  as \"storage_energy_kW_estimate\" ,
                            total * ${storage_kW_per_GiB_max}  as \"storage_energy_kW_upper\" 
                        FROM storage
                        GROUP BY start_date, total
                        ORDER BY start_date
                ;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async MinerQuery(params) {
        var result;
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
                result = await this.pool.query(`
                with storage as(
                    SELECT
                        ROUND(AVG(cumulative_capacity)) AS total,
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                                date,
                                SUM(total) AS  cumulative_capacity
                            FROM fil_miners_data_view_country_v9
                            WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY date) q1
                        GROUP BY date ORDER BY date ${padding})

                    SELECT
                            start_date,
                            total * ${storage_kW_per_GiB_min} as \"storage_energy_kW_lower\" ,
                            total * ${storage_kW_per_GiB_est}  as \"storage_energy_kW_estimate\" ,
                            total * ${storage_kW_per_GiB_max}  as \"storage_energy_kW_upper\" 
                        FROM storage
                        GROUP BY start_date, total
                        ORDER BY start_date
                ;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] MinerQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async CountryQuery(params) {
        var result;
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
                result = await this.pool.query(`
                with storage as(
                    SELECT
                        country,
                        ROUND(AVG(cumulative_capacity)) AS total,
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                                country,
                                date,
                                SUM(total) AS  cumulative_capacity
                            FROM fil_miners_data_view_country_v9
                            WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY country, date) q1
                        GROUP BY country, date ORDER BY date ${padding})

                    SELECT
                            country,
                            start_date,
                            total * ${storage_kW_per_GiB_min} as \"storage_energy_kW_lower\" ,
                            total * ${storage_kW_per_GiB_est}  as \"storage_energy_kW_estimate\" ,
                            total * ${storage_kW_per_GiB_max}  as \"storage_energy_kW_upper\" 
                        FROM storage
                        GROUP BY country, start_date, total
                        ORDER BY start_date
                ;`);
        } catch (e) {
            ERROR(`[SealingEnergyModel] CountryQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async VariableStorageEnergy(params) {
        var query_result;

        if (params.miners) {
            query_result = await this.MinerQuery(params);
        } else if (params.country) {
            query_result = await this.CountryQuery(params);
        } else {
            query_result = await this.NetworkQuery(params);
        }

        let storageEnergyData_min = [];
        let storageEnergyData_est = [];
        let storageEnergyData_max = [];

        for (const item of query_result ) {
            storageEnergyData_min.push({
                value: item.storage_energy_kW_lower,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            storageEnergyData_est.push({
                value: item.storage_energy_kW_estimate,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            storageEnergyData_max.push({
                value: item.storage_energy_kW_upper,
                start_date: item.start_date,
                end_date: item.end_date,
            });
        }

        return {
            storageEnergyData_min: storageEnergyData_min,
            storageEnergyData_est: storageEnergyData_est,
            storageEnergyData_max: storageEnergyData_max,
        };
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

        // Minimum cumulative energy use
        let storageEnergyData = await this.VariableStorageEnergy(params);
        let storageEnergy_min = {
            title: 'Lower Bound',
            color: COLOR.green,
            data: storageEnergyData.storageEnergyData_min,
        }
        result.data.push(storageEnergy_min);

        // Estimated cumulative energy use
        let storageEnergy_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: storageEnergyData.storageEnergyData_est,
        }
        result.data.push(storageEnergy_est);

        // Maximum cumulative energy use
        let storageEnergy_max = {
            title: 'Upper Bound',
            color: COLOR.orange,
            data: storageEnergyData.storageEnergyData_max,
        }
        result.data.push(storageEnergy_max);

        return result;
    }

    async Export(id, params) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
            let query_result;

            if (params.miners) {
                fields = ['storage_energy_kW_lower', 'storage_energy_kW_estimate', 'storage_energy_kW_upper', 'start_date', 'end_date'];
                query_result = await this.MinerQuery(params);
            } else if (params.country) {
                fields = ['country', 'storage_energy_kW_lower', 'storage_energy_kW_estimate', 'storage_energy_kW_upper', 'start_date', 'end_date'];
                query_result = await this.CountryQuery(params);
            } else {
                fields = ['storage_energy_kW_lower', 'storage_energy_kW_estimate', 'storage_energy_kW_upper', 'start_date', 'end_date'];
                query_result = await this.NetworkQuery(params);
            }

            if (query_result) {
                data = query_result;
            }
        } catch (e) {
            ERROR(`[StorageEnergyModelv_1_0_2] Export error:${e}`);
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
    StorageEnergyModelv_1_0_2
};
