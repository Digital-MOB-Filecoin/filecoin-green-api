'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, add_missing_dates} = require('./utils')



class MinersLocationScoresModel {
    constructor(pool) {
        this.code_name = 'MinersLocationScoresModel';
        this.pool = pool;
        this.name = 'Location Score';
        this.category = CATEGORY.MINER_EMISSIONS;
        this.x = DATA_TYPE.TIME;
        this.y = DATA_TYPE.score0To1;
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
        return `**Location Score**`;
    }

    async MinerQuery(minerId, params) {
        let result;
        let padding = '';

        if (params.offset && params.limit) {
            padding = `LIMIT ${params.limit} OFFSET ${params.offset}`;
        }

        try {
            result = await this.pool.query(`
            SELECT date AS start_date, location_score as value from fil_miners_location_scores
            WHERE miner = '${minerId}' AND (date::date >= '${params.start}'::date) AND (date::date <= '${params.end}'::date)
            ORDER BY date ${padding};
         `);
        } catch (e) {
            ERROR(`[MinersLocationScoresModel] MinerQuery error:${e}`);
        }


        const rows = add_missing_dates(params.start, params.end, result?.rows || []);
        return add_time_interval(params.start, params.end, params.filter, rows);
    }


    async VariableMinerLocationScore(params) {
        const miners = params.minersArray;
        let result = [];

        if (miners && miners.length === 1) {
            result = await this.MinerQuery(miners[0], params);
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


        let variableMinerLocationScore = await this.VariableMinerLocationScore(params);
        let variableTotalSealed_Data = {
            title: 'Location Score',
            color: COLOR.green,
            data: variableMinerLocationScore,
        }

        result.data.push(variableTotalSealed_Data);

        return result;
    }

    async Export(id, params) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, params: ${JSON.stringify(params)}`);

        try {
                let result;
                const miners = params.minersArray;

                if (miners && miners.length === 1) {
                    fields = ['location_score','start_date', 'end_date'];
                    result = await this.MinerQuery(miners[0], params);
                }


                if (result) {
                    data = result;
                }
        } catch (e) {
            ERROR(`[MinersLocationScoresModel] Export error:${e}`);
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
    MinersLocationScoresModel
};
