'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

const EiB_to_GiB = 1073741824;
const MW_per_EiB_coeff = EiB_to_GiB / 1000;

const sealing_kW_per_GiB_block_min = '0.00026882';
const sealing_kW_per_GiB_block_est = '0.00152847';
const sealing_kW_per_GiB_block_max = '0.00250540';

const storage_kW_per_GiB_min = '0.0000009688';
const storage_kW_per_GiB_est = '0.0000032212';
const storage_kW_per_GiB_max = '0.0000086973';

const pue_min = 1.18;
const pue_est = 1.57;
const pue_max = 1.93;

class EnergyIntensityModel {
    constructor(pool) {
        this.code_name = 'EnergyIntensityModel';
        this.pool = pool;
        this.name = 'Energy Intensity';
        this.category = CATEGORY.ENERGY; // see type.js
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.MW_per_EiB;
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
        return `
             **Energy Intensity:** Total electrical power used by the Filecoin network 
             divided by data storage Capacity.
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
                with sealing as(
                    SELECT
                        ROUND(AVG(cumulative_total_per_day)) AS sealing_added_GiB,
                        ROUND(AVG(cumulative_capacity)) AS capacity,
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                                date,
                                SUM(total_per_day) AS cumulative_total_per_day,
                                SUM(total) AS  cumulative_capacity
                            FROM fil_miners_data_view_country_v6
                            WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY date) q1
                        GROUP BY date ORDER BY date ${padding}),
        
                  total_metrics as (
                      SELECT
                        capacity as stored_GiB,
                        coalesce(sealing_added_GiB,0) as sealing_added_GiB,
                        coalesce(capacity,0) as capacity,
                        start_date
                      FROM sealing )
        
                  SELECT
                  COALESCE(( ( (stored_GiB*${storage_kW_per_GiB_min} + sealing_added_GiB*${sealing_kW_per_GiB_block_min}) * ${pue_min} ) / NULLIF(capacity,0)),0) * ${MW_per_EiB_coeff} AS "total_energy_MW_per_EiB_lower",
                  COALESCE(( ( (stored_GiB*${storage_kW_per_GiB_est} + sealing_added_GiB*${sealing_kW_per_GiB_block_est}) * ${pue_est} ) / NULLIF(capacity,0)),0) * ${MW_per_EiB_coeff} AS "total_energy_MW_per_EiB_estimate",
                  COALESCE(( ( (stored_GiB*${storage_kW_per_GiB_max} + sealing_added_GiB*${sealing_kW_per_GiB_block_max}) * ${pue_max} ) / NULLIF(capacity,0)),0) * ${MW_per_EiB_coeff} AS "total_energy_MW_per_EiB_upper",
                    start_date
                  FROM total_metrics
             `);
        } catch (e) {
            ERROR(`[EnergyIntensityModel] NetworkQuery error:${e}`);
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
                  with sealing as(
                    SELECT
                        ROUND(AVG(cumulative_total_per_day)) AS sealing_added_GiB,
                        ROUND(AVG(cumulative_capacity)) AS capacity,
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                                date,
                                SUM(total_per_day) AS cumulative_total_per_day,
                                SUM(total) AS  cumulative_capacity
                            FROM fil_miners_data_view_country_v6
                            WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY date) q1
                        GROUP BY date ORDER BY date ${padding}),
        
                  total_metrics as (
                      SELECT
                        capacity as stored_GiB,
                        coalesce(sealing_added_GiB,0) as sealing_added_GiB,
                        coalesce(capacity,0) as capacity,
                        start_date
                      FROM sealing )
        
                  SELECT
                    COALESCE(( ( (stored_GiB*${storage_kW_per_GiB_min} + sealing_added_GiB*${sealing_kW_per_GiB_block_min}) * ${pue_min} ) / NULLIF(capacity,0)),0) * ${MW_per_EiB_coeff} AS "total_energy_MW_per_EiB_lower",
                    COALESCE(( ( (stored_GiB*${storage_kW_per_GiB_est} + sealing_added_GiB*${sealing_kW_per_GiB_block_est}) * ${pue_est} ) / NULLIF(capacity,0)),0) * ${MW_per_EiB_coeff} AS "total_energy_MW_per_EiB_estimate",
                    COALESCE(( ( (stored_GiB*${storage_kW_per_GiB_max} + sealing_added_GiB*${sealing_kW_per_GiB_block_max}) * ${pue_max} ) / NULLIF(capacity,0)),0) * ${MW_per_EiB_coeff} AS "total_energy_MW_per_EiB_upper",
                    start_date
                  FROM total_metrics
             `);
        } catch (e) {
            ERROR(`[EnergyIntensityModel] MinerQuery error:${e}`);
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
                  with sealing as(
                    SELECT
                        country,
                        ROUND(AVG(cumulative_total_per_day)) AS sealing_added_GiB,
                        ROUND(AVG(cumulative_capacity)) AS capacity,
                        date_trunc('${params.filter}', date::date) AS start_date
                        FROM (
                            SELECT
                                country,
                                date,
                                SUM(total_per_day) AS cumulative_total_per_day,
                                SUM(total) AS  cumulative_capacity
                            FROM fil_miners_data_view_country_v6
                            WHERE (country='${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                            GROUP BY country, date) q1
                        GROUP BY country, date ORDER BY date ${padding}),
        
                  total_metrics as (
                      SELECT
                        country,
                        capacity as stored_GiB,
                        coalesce(sealing_added_GiB,0) as sealing_added_GiB,
                        coalesce(capacity,0) as capacity,
                        start_date
                      FROM sealing )
        
                  SELECT
                    country,
                    COALESCE(( ( (stored_GiB*${storage_kW_per_GiB_min} + sealing_added_GiB*${sealing_kW_per_GiB_block_min}) * ${pue_min} ) / NULLIF(capacity,0)),0) * ${MW_per_EiB_coeff} AS "total_energy_MW_per_EiB_lower",
                    COALESCE(( ( (stored_GiB*${storage_kW_per_GiB_est} + sealing_added_GiB*${sealing_kW_per_GiB_block_est}) * ${pue_est} ) / NULLIF(capacity,0)),0) * ${MW_per_EiB_coeff} AS "total_energy_MW_per_EiB_estimate",
                    COALESCE(( ( (stored_GiB*${storage_kW_per_GiB_max} + sealing_added_GiB*${sealing_kW_per_GiB_block_max}) * ${pue_max} ) / NULLIF(capacity,0)),0) * ${MW_per_EiB_coeff} AS "total_energy_MW_per_EiB_upper",
                    start_date
                  FROM total_metrics

             `);
        } catch (e) {
            ERROR(`[EnergyIntensityModel] CountryQuery error:${e}`);
        }

        return add_time_interval(params.start, params.end, params.filter, result.rows);
    }

    async VariableEnergyIntensity(params) {
        var query_result;

        if (params.miners) {
            query_result = await this.MinerQuery(params);
        } else if (params.country) {
            query_result = await this.CountryQuery(params);
        } else {
            query_result = await this.NetworkQuery(params);
        }

        let energyIntensityData_min = [];
        let energyIntensityData_est = [];
        let energyIntensityData_max = [];

        for (const item of query_result ) {
            energyIntensityData_min.push({
                value: item.total_energy_MW_per_EiB_lower,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            energyIntensityData_est.push({
                value: item.total_energy_MW_per_EiB_estimate,
                start_date: item.start_date,
                end_date: item.end_date,
            });
            energyIntensityData_max.push({
                value: item.total_energy_MW_per_EiB_upper,
                start_date: item.start_date,
                end_date: item.end_date,
            });

        }

        return {
            energyIntensityData_min: energyIntensityData_min,
            energyIntensityData_est: energyIntensityData_est,
            energyIntensityData_max: energyIntensityData_max,
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

        // variable 1 - energy intensity lower bound
        let energyIntensityData = await this.VariableEnergyIntensity(params);
        let energyIntensityVariable_min = {
            title: 'Lower bound',
            color: COLOR.green,
            data: energyIntensityData.energyIntensityData_min,
        }

        result.data.push(energyIntensityVariable_min);

        // variable 2 - energy intensity estimate
        let energyIntensityVariable_est = {
            title: 'Estimate',
            color: COLOR.silver,
            data: energyIntensityData.energyIntensityData_est,
        }

        result.data.push(energyIntensityVariable_est);

        // variable 3 - energy intensity upper bound
        let energyIntensityVariable_max = {
            title: 'Upper bound',
            color: COLOR.orange,
            data: energyIntensityData.energyIntensityData_max,
        }

        result.data.push(energyIntensityVariable_max);

        return result;
    }

    async Export(id, params) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
                let query_result;

                if (params.miners) {
                    fields = ['total_energy_MW_per_EiB_lower','total_energy_MW_per_EiB_estimate','total_energy_MW_per_EiB_upper','start_date', 'end_date'];
                    query_result = await this.MinerQuery(params); 
                } else if (params.country) {
                    fields = ['country','total_energy_MW_per_EiB_lower','total_energy_MW_per_EiB_estimate','total_energy_MW_per_EiB_upper','start_date', 'end_date'];
                    query_result = await this.CountryQuery(params); 
                } else {
                    fields = ['total_energy_MW_per_EiB_lower','total_energy_MW_per_EiB_estimate','total_energy_MW_per_EiB_upper','start_date', 'end_date'];
                    query_result = await this.NetworkQuery(params); 
                }


                if (query_result) {
                    data = query_result;
                }
        } catch (e) {
            ERROR(`[EnergyIntensityModel] Export error:${e}`);
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
    EnergyIntensityModel
};
