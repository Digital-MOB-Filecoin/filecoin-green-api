'use strict';

const { INFO, ERROR } = require('../logs');
const { CATEGORY, DATA_TYPE, VERSION, COLOR } = require('./type')
const { add_time_interval, get_epoch } = require('./utils')

class FractionModel {
    constructor(pool) {
        this.code_name = 'FractionModel';
        this.pool = pool;
        this.name = 'Fraction Used';
        this.category = CATEGORY.CAPACITY;
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
        return "**Fraction Used** model";
    }

    async NetworkQuery(formula, start, end, filter) {
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
                        FROM fil_network_view_days
                        WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                        GROUP BY timestamp
                        ORDER BY timestamp
                ) q;`);
        } catch (e) {
            ERROR(`[FractionModel] NetworkQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async MinerQuery(formula, start, end, filter, miner) {
        var result;

        try {
                result = await this.pool.query(`
                SELECT
                value,
                timestamp AS start_date
                FROM (
                    SELECT 
                        ${formula}                   AS value,
                        date_trunc('${filter}', date::date) AS timestamp
                    FROM fil_miner_view_days_v4
                    WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                    GROUP BY miner,timestamp
                    ORDER BY timestamp
             ) q;`);
        } catch (e) {
            ERROR(`[FractionModel] MinerQuery error:${e}`);
        }

        return add_time_interval(start, end, filter, result.rows);
    }

    async VariableFraction(start, end, filter, miner) {
        var result;

        if (miner) {
            result = await this.MinerQuery('(AVG(used) / AVG(total))', start, end, filter, miner);
        } else {
            result = await this.NetworkQuery('(AVG(used) / AVG(total))', start, end, filter);
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

        // variable 1 - Fraction
        let fractionData = await this.VariableFraction(start, end, filter, miner);
        let fractionVariable = {
            title: 'Used Capacity',
            color: COLOR.green,
            data: fractionData,
        }

        result.data.push(fractionVariable);

        return result;
    }

    async Export(id, start, end, miner, offset, limit) {
        let data = [];
        let fields;

        INFO(`Export[${this.name}] id: ${id}, start: ${start}, end: ${end}, miner: ${miner}, offset: ${offset}, limit: ${limit}`);

        try {
                let result;

                if (miner) {
                    fields = ['epoch','miner','fraction','timestamp'];
                    result = await this.pool.query(`SELECT epoch,miner,fraction_per_epoch as fraction,timestamp \
                    FROM fil_miner_view_epochs \
                    WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);

                } else {
                    fields = ['epoch','fraction','timestamp'];
                    result = await this.pool.query(`SELECT epoch,fraction_per_epoch as fraction,timestamp \
                    FROM fil_network_view_epochs \
                    WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) \
                    ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
                }
                 


                if (result?.rows) {
                    data = result?.rows;
                }
        } catch (e) {
            ERROR(`[FractionModel] Export error:${e}`);
        }

        let exportData = {
            fields: fields,
            data: data,
        }

        return exportData;

    }

}

module.exports = {
    FractionModel
};