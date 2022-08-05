const config = require('./config');
const { Pool } = require("pg");
const { version } = require('./package.json');
const { INFO, ERROR, WARNING } = require('./logs');
const { format, endOfWeek, endOfMonth, endOfDay } = require('date-fns');
const { head, block, miners, filchain } = require('./filchain-api');
const { List, Model, Export, ResearchExport } = require('./models-api');

const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger.yaml');
const swaggerUi = require('swagger-ui-express');

var express = require("express");
var cors = require('cors');
var app = express();

app.use(cors());
app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const pool = new Pool(config.database);

function error_response(code, msg, res) {
    res.status(code).send(msg);
}

function get_date_now() {
    var today = new Date();
    var date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    return date;
}

function get_epoch(date) {
    return ((Date.parse(date) / 1000 - 1598281200) / 30);
}

function endOfTheDay(date) {
    return endOfDay(new Date(date));
}

function endOfTheWeek(date) {
    return endOfWeek(new Date(date), {weekStartsOn: 1});
}

function endOfTheMonth(date) {
    return endOfMonth(new Date(date));
}

function add_timeinterval(query, rows) {
    let result = [];
    let start = query?.start;
    let end = query?.end;
    let all = query?.all;

    if (!rows?.length) {
        return result;
    }

    if (all == 'true') {
        return rows;
    }

    if (!start) {
        start = '2020-08-25';
    }

    if (!end) {
        end = get_date_now();
    }

    INFO(`[TimeInterval] datapoints: ${rows.length}, start: ${start}, end: ${end}`);

    if (rows.length == 1) {
        let item = {...rows[0]};
        item.start_date = new Date(start);
        item.end_date = endOfTheDay(new Date(end));
        result.push(item);
    } else if (query?.filter == 'week') {
        let start_item = {...rows[0]};

        INFO(`[TimeInterval] week startItemInitial: ${JSON.stringify(start_item)}`);
        start_item.start_date = new Date(start);
        start_item.end_date = endOfTheDay(endOfTheWeek(rows[0].start_date));

        INFO(`[TimeInterval] week startItem: ${JSON.stringify(start_item)}`);

        result.push(start_item);

        for (let i = 1; i < rows.length - 1; i++) {
            let item = {...rows[i]};
            item.end_date = endOfTheDay(endOfTheWeek(rows[i].start_date));

            result.push(item);
        }

        let end_item = {...rows[rows.length-1]};

        INFO(`[TimeInterval] week endItemInitial: ${JSON.stringify(end_item)}`);
        end_item.start_date = rows[rows.length-1].start_date;
        end_item.end_date = endOfTheDay(new Date(end));

        INFO(`[TimeInterval] week endItemInitial: ${JSON.stringify(end_item)}`);

        result.push(end_item);
    } else if (query?.filter == 'month') {
        let start_item = {...rows[0]};
        INFO(`[TimeInterval] month startItemInitial: ${JSON.stringify(start_item)}`);
        start_item.start_date = new Date(start);
        start_item.end_date = endOfTheDay(endOfTheMonth(rows[0].start_date));

        INFO(`[TimeInterval] month startItem: ${JSON.stringify(start_item)}`);

        result.push(start_item);

        for (let i = 1; i < rows.length - 1; i++) {
            let item = {...rows[i]};
            item.end_date = endOfTheDay(endOfTheMonth(rows[i].start_date));

            result.push(item);
        }

        let end_item = {...rows[rows.length-1]};
        INFO(`[TimeInterval] month endItemInitial: ${JSON.stringify(end_item)}`);

        end_item.start_date = rows[rows.length-1].start_date;
        end_item.end_date = endOfTheDay(new Date(end));

        INFO(`[TimeInterval] month endItem: ${JSON.stringify(end_item)}`);

        result.push(end_item);
    } else {
        rows.forEach(item => {
            let updated_item = {...item}
            updated_item.end_date = endOfTheDay(item.start_date);
            result.push(updated_item);
        });
    }

    return result;
}

async function handle_network_request(fields, query) {
    var result;
    let code = 200;
    let filter = 'day';
    let msg = 'successful';
    let limit = 'ALL';
    let start = query?.start;
    let end = query?.end;
    let all = query?.all;
    let offset = query?.offset

    if ((query?.filter == 'week') || (query?.filter == 'month')) {
        filter = query.filter;
    }

    if (!start) {
        start = '2020-08-25';
    }

    if (!end) {
        end = get_date_now();
    }

    if (!offset) {
        offset = 0;
    }

    INFO(`[HandleNetworkRequest] select ${fields}, filter:${filter}, interval[${start},${end}] , interval in epochs[${get_epoch(start)},${get_epoch(end)}]`);

    try {
        if (all == 'true') {
            limit = config.filgreen.limit;
            result = await pool.query(`SELECT epoch,${fields},timestamp FROM fil_network_view_epochs WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
        } else {
            result = await pool.query(`
            SELECT
            ${fields},
            timestamp AS start_date
            FROM (
                SELECT 
                    ROUND(AVG(commited))                AS commited,
                    ROUND(AVG(used))                    AS used,
                    ROUND(AVG(total))                   AS total,
                    ROUND(AVG(total_per_day))           AS total_per_day,
                    (AVG(used) / AVG(total))            AS fraction,
                    date_trunc('${filter}', date::date) AS timestamp
                FROM fil_network_view_days
                WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                GROUP BY timestamp
                ORDER BY timestamp
         ) q;`);

        }
    } catch (e) {
        ERROR(`handle_network_request query:[${JSON.stringify(query)}], fields:${fields}, error:${e}`);
    }

    return add_timeinterval(query, result.rows);
}

async function handle_miner_request(fields, query) {
    var result;
    let code = 200;
    let filter = 'day';
    let msg = 'successful';
    let limit = 'ALL';
    let miner = query?.miner;
    let start = query?.start;
    let end = query?.end;
    let all = query?.all;
    let offset = query?.offset;

    if ((query?.filter == 'week') || (query?.filter == 'month')) {
        filter = query.filter;
    }

    if (!start) {
        start = '2020-08-25';
    }

    if (!end) {
        end = get_date_now();
    }

    if (!offset) {
        offset = 0;
    }

    INFO(`[HandleMinerRequest] select ${fields}, filter:${filter}, interval[${start},${end}] , interval in epochs[${get_epoch(start)},${get_epoch(end)}]`);

    try {
        if (all == 'true') {
            limit = config.filgreen.limit;
            result = await pool.query(`SELECT epoch,miner,${fields},timestamp FROM fil_miner_view_epochs WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
        } else {
            result = await pool.query(`
            SELECT
            ${fields},
            timestamp AS start_date
            FROM (
                SELECT 
                    miner                               AS miner,
                    ROUND(AVG(commited))                AS commited,
                    ROUND(AVG(used))                    AS used,
                    ROUND(AVG(total))                   AS total,
                    ROUND(AVG(total_per_day))           AS total_per_day,
                    (AVG(used) / AVG(total))            AS fraction,
                    date_trunc('${filter}', date::date) AS timestamp
                FROM fil_miner_view_days_v4
                WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                GROUP BY miner,timestamp
                ORDER BY timestamp
         ) q;`);

        }
    } catch (e) {
        ERROR(`[HandleMinerRequest] query:[${JSON.stringify(query)}], fields:${fields}, error:${e}`);
    }

    return add_timeinterval(query, result.rows);
}

async function handle_miners_list(query) {
    var result = {
        pagination: {

        },
        miners: []
    };
    let code = 200;
    let limit = query?.limit;
    let offset = query?.offset;
    let order = 'DESC';
    let sortBy = 'used';

    if (!limit) {
        limit = 10;
    }

    if (!offset) {
        offset = 0;
    }

    if (query?.sortBy && (query?.sortBy != 'power')) {
        sortBy = 'used';
    }

    if (query?.order && (query?.order != 'desc')) {
        order = 'ASC';
    }

    INFO(`[HandleMinersList] limit:${limit}, offset:${offset}`);

    try {
        let count_result = await pool.query(`SELECT COUNT(miner) FROM fil_miners_view_v3;`);
        let miners_result = await pool.query(`SELECT * FROM fil_miners_view_v3 ORDER BY ${sortBy} ${order} LIMIT ${limit} OFFSET ${offset} ;`);
        result.pagination.total = count_result.rows[0]?.count;
        result.pagination.limit = limit;
        result.pagination.offset = offset;
        result.miners = miners_result.rows;
    } catch (e) {
        ERROR(`[HandleMinersList] query:[${JSON.stringify(query)}], error:${e}`);
    }

    return result;
}

app.get("/network/capacity", async function (req, res, next) {
    INFO(`GET[/network/capacity] query:${JSON.stringify(req.query)}`);

    try {
        var result = await handle_network_request('commited,used,total', req.query);
        if (result) {
            INFO(`GET[/network/capacity] query:${JSON.stringify(req.query)} done, data points: ${result?.length}`);
            res.json(result);
        } else {
            ERROR(`GET[/network/capacity] query:${JSON.stringify(req.query)}, empty response`);
            error_response(401, 'Failed to get network capacity data', res);
        }

    } catch (e) {
        ERROR(`GET[/network/capacity] query:${JSON.stringify(req.query)}, error:${e}`);
        error_response(402, 'Failed to get network capacity data', res);
    }

});

app.get("/network/fraction", async function (req, res, next) {
    INFO(`GET[/network/fraction] query:${JSON.stringify(req.query)}`);

    try {
        let fields = 'fraction';
        if (req.query?.all == 'true') {
            fields = 'fraction_per_epoch as fraction';
        }
        var result = await handle_network_request(fields, req.query);
        if (result) {
            INFO(`GET[/network/fraction] query:${JSON.stringify(req.query)} done, data points: ${result?.length}`);
            res.json(result);
        } else {
            ERROR(`GET[/network/fraction] query:${JSON.stringify(req.query)}, empty response`);
            error_response(401, 'Failed to get network fraction data', res);
        }

    } catch (e) {
        ERROR(`GET[/network/fraction] query:${JSON.stringify(req.query)}, error:${e}`);
        error_response(402, 'Failed to get network fraction data', res);
    }

});

app.get("/network/sealed", async function (req, res, next) {
    INFO(`GET[/network/sealed] query:${JSON.stringify(req.query)}`);

    try {
        let fields = 'total_per_day as sealed';
        if (req.query?.all == 'true') {
            fields = 'total_per_epoch as sealed';
        }
        var result = await handle_network_request(fields, req.query);
        if (result) {
            INFO(`GET[/network/sealed] query:${JSON.stringify(req.query)} done, data points: ${result?.length}`);
            res.json(result);
        } else {
            ERROR(`GET[/network/sealed] query:${JSON.stringify(req.query)}, empty response`);
            error_response(401, 'Failed to get network sealed data', res);
        }

    } catch (e) {
        ERROR(`GET[/network/sealed] query:${JSON.stringify(req.query)}, error:${e}`);
        error_response(402, 'Failed to get network sealed data', res);
    }

});

app.get("/miner/capacity", async function (req, res, next) {
    INFO(`GET[/miner/capacity] query:${JSON.stringify(req.query)}`);

    if (!req.query?.miner) {
        ERROR(`GET[/miner/capacity] query:${JSON.stringify(req.query)} parameter miner is required`);
        error_response(403, 'Failed to get miner capacity data', res);
    }

    try {
        var result = await handle_miner_request('commited,used,total', req.query);
        if (result) {
            INFO(`GET[/miner/capacity] query:${JSON.stringify(req.query)} done, data points: ${result?.length}`);
            res.json(result);
        } else {
            ERROR(`GET[/miner/capacity] query:${JSON.stringify(req.query)}, empty response`);
            error_response(401, 'Failed to get miner capacity data', res);
        }

    } catch (e) {
        ERROR(`GET[/miner/capacity] query:${JSON.stringify(req.query)}, error:${e}`);
        error_response(402, 'Failed to get miner capacity data', res);
    }
});

app.get("/miner/fraction", async function (req, res, next) {
    INFO(`GET[/miner/fraction] query:${JSON.stringify(req.query)}`);

    if (!req.query?.miner) {
        ERROR(`GET[/miner/fraction] query:${JSON.stringify(req.query)} parameter miner is required`);
        error_response(403, 'Failed to get miner fraction data', res);
    }

    try {
        let fields = 'fraction';
        if (req.query?.all == 'true') {
            fields = 'fraction_per_epoch as fraction';
        }
        var result = await handle_miner_request(fields, req.query);
        if (result) {
            INFO(`GET[/miner/fraction] query:${JSON.stringify(req.query)} done, data points: ${result?.length}`);
            res.json(result);
        } else {
            ERROR(`GET[/miner/fraction] query:${JSON.stringify(req.query)}, empty response`);
            error_response(401, 'Failed to get miner fraction data', res);
        }

    } catch (e) {
        ERROR(`GET[/miner/fraction] query:${JSON.stringify(req.query)}, error:${e}`);
        error_response(402, 'Failed to get miner fraction data', res);
    }
});

app.get("/miner/sealed", async function (req, res, next) {
    INFO(`GET[/miner/sealed] query:${JSON.stringify(req.query)}`);

    if (!req.query?.miner) {
        ERROR(`GET[/miner/sealed] query:${JSON.stringify(req.query)} parameter miner is required`);
        error_response(403, 'Failed to get miner sealed data', res);
    }

    try {
        let fields = 'total_per_day as sealed';
        if (req.query?.all == 'true') {
            fields = 'total_per_epoch as sealed';
        }

        var result = await handle_miner_request(fields, req.query);
        if (result) {
            INFO(`GET[/miner/sealed] query:${JSON.stringify(req.query)} done, data points: ${result?.length}`);
            res.json(result);
        } else {
            ERROR(`GET[/miner/sealed] query:${JSON.stringify(req.query)}, empty response`);
            error_response(401, 'Failed to get miner sealed data', res);
        }

    } catch (e) {
        ERROR(`GET[/miner/sealed] query:${JSON.stringify(req.query)}, error:${e}`);
        error_response(402, 'Failed to get miner sealed data', res);
    }
});

app.get("/miners", async function (req, res, next) {
    INFO(`GET[/miners] query:${JSON.stringify(req.query)}`);

    try {
        var result = await handle_miners_list(req.query);
        if (result) {
            INFO(`GET[/miners] query:${JSON.stringify(req.query)} done`);
            res.json(result);
        } else {
            ERROR(`GET[/miners] query:${JSON.stringify(req.query)}, empty response`);
            error_response(401, 'Failed to get miners data', res);
        }

    } catch (e) {
        ERROR(`GET[/miners] query:${JSON.stringify(req.query)}, error:${e}`);
        error_response(402, 'Failed to get miners data', res);
    }
});

app.get("/filchain/head", head);
app.get("/filchain/block", block);
app.get("/filchain/miners", miners);
app.get("/filchain", filchain);

app.get("/models/list", List);
app.get("/models/model", Model);
app.get("/models/export", Export);
app.get("/models/research_export", ResearchExport);

app.listen(config.filgreen.api_port, () => {
    INFO("FilGreen API running on port: " + config.filgreen.api_port);
   });