"use strict";

const { INFO, ERROR } = require("../logs");
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require("./type");
const { add_time_interval } = require("./utils");

class MinersEnergyReShareModel {
  constructor(pool) {
    this.code_name = "MinersEnergyReShareModel";
    this.pool = pool;
    this.name = "Renewable Energy Share of Total Energy";
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
    return `Renewable Energy Share of Total Energy`;
  }

  async NetworkQuery(params) {
    var result;
    let padding = "";

    if (params.offset && params.limit) {
      padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
    }

    try {
      result = await this.pool.query(`
                  SELECT
                      day as start_date,
                      SUM("total_energy_kW_estimate_re_share") / NULLIF(SUM("total_energy_kW_estimate"), 0) * 100 as value
                  FROM miner_energy_calculations_with_re_share
                  WHERE (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                  GROUP BY start_date ORDER BY start_date ${padding};
                ;`);
    } catch (e) {
      ERROR(`[MinersEnergyReShareModel] NetworkQuery error:${e}`);
    }

    return add_time_interval(
      params.start,
      params.end,
      params.filter,
      result.rows,
    );
  }

  async MinerQuery(params) {
    var result;
    let padding = "";

    if (params.offset && params.limit) {
      padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
    }

    try {
      result = await this.pool.query(`
                  SELECT
                      day as start_date,
                      SUM("total_energy_kW_estimate_re_share") / NULLIF(SUM("total_energy_kW_estimate"), 0) * 100 as value
                  FROM miner_energy_calculations_with_re_share
                  WHERE (miner in ${params.miners}) AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                  GROUP BY start_date, miner ORDER BY start_date ${padding};
                ;`);
    } catch (e) {
      ERROR(`[MinersEnergyReShareModel] MinerQuery error:${e}`);
    }

    return add_time_interval(
      params.start,
      params.end,
      params.filter,
      result.rows,
    );
  }

  async CountryQuery(params) {
    var result;
    let padding = "";

    if (params.offset && params.limit) {
      padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
    }

    try {
      result = await this.pool.query(`
                  SELECT
                      day as start_date,
                      SUM("total_energy_kW_estimate_re_share") / NULLIF(SUM("total_energy_kW_estimate"), 0) * 100 as value
                  FROM miner_energy_calculations_with_re_share
                  WHERE (country = '${params.country}') AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
                  GROUP BY start_date, miner ORDER BY start_date ${padding};
                ;`);
    } catch (e) {
      ERROR(`[MinersEnergyReShareModel] CountryQuery error:${e}`);
    }

    return add_time_interval(
      params.start,
      params.end,
      params.filter,
      result.rows,
    );
  }

  async VariableEnergyReShare(params) {
    var query_result;

    if (params.miners) {
      query_result = await this.MinerQuery(params);
    } else if (params.country) {
      query_result = await this.CountryQuery(params);
    } else {
      query_result = await this.NetworkQuery(params);
    }

    return query_result;
  }

  async Query(id, params) {
    INFO(`Query[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

    let result = {
      id: id,
      code_name: this.code_name,
      name: this.name,
      category: this.category,
      x: this.x,
      y: this.y,
      version: this.version,
      filter: params.filter,
      miner: params.miners,
      data: [], // [ {title: 'variable 1', data: []} , {title: 'variable 2', data: []} ]
    };

    let energyReShareData = await this.VariableEnergyReShare(params);
    let energyReShareVariable = {
      title: "Renewable Energy Share (%)",
      color: COLOR.green,
      data: energyReShareData,
    };

    result.data.push(energyReShareVariable);

    return result;
  }

  async Export(id, params) {
    let data = [];
    let fields;

    INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

    try {
      let query_result;

      if (params.miners) {
        fields = ["value", "start_date", "end_date"];
        query_result = await this.MinerQuery(params);
      } else if (params.country) {
        fields = ["country", "value", "start_date", "end_date"];
        query_result = await this.CountryQuery(params);
      } else {
        fields = ["value", "start_date", "end_date"];
        query_result = await this.NetworkQuery(params);
      }

      if (query_result) {
        data = query_result;
      }
    } catch (e) {
      ERROR(`[MinersEnergyReShareModel] Export error:${e}`);
    }

    let exportData = {
      fields: fields,
      data: data,
    };

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
    };

    return header;
  }
}

module.exports = {
  MinersEnergyReShareModel,
};
