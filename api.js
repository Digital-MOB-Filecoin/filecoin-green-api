const config = require('./config');
const { Pool } = require("pg");
const { version } = require('./package.json');
const { INFO, ERROR, WARNING } = require('./logs');

var express = require("express");
var cors = require('cors');
var app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool(config.database);

app.get("/get_head", async function (req, res, next) {
    let code = 200;
    let msg = 'successful';

    try {
        const client = await pool.connect()
        var result = await client.query('SELECT MAX(Block) FROM fil_blocks ');
        client.release();

        res.json(result.rows);

    } catch (e) {
        code = 401;
        msg = 'Failed to get head';
        INFO(`FilGreen API get_head error: ${e}`);
        res.status(code).send(msg);
    }
});

app.get("/get_block", async function (req, res, next) {
    let code = 200;
    let msg = 'successful';

    //TODO : check if we have the block
    //SELECT using LIMIT 

    if (req.query?.block) {
        const block = req.query?.block;

        try {
            const client = await pool.connect()
            var result = await client.query(`SELECT * FROM fil_messages WHERE block=${block}`);
            client.release();

            res.json(result.rows);
            INFO(`FilGreen API get_block[${block}] ${result.rows.length} messages`);

        } catch (e) {
            code = 401;
            msg = 'Failed to get block';
            INFO(`FilGreen API get_block[${block}] error: ${e}`);
            res.status(code).send(msg);
        }

    }
});

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
        const client = await pool.connect();

        if (all == 'true') {
            limit = config.filgreen.limit;
            result = await client.query(`SELECT epoch,${fields},timestamp FROM fil_network_view_epochs WHERE (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
        } else {
            result = await client.query(`
            SELECT
            ${fields},
            timestamp AS date
            FROM (
                SELECT 
                    ROUND(AVG(commited))                AS commited,
                    ROUND(AVG(used))                    AS used,
                    ROUND(AVG(total))                   AS total,
                    ROUND(AVG(avg_total_per_epoch))     AS total_per_epoch,
                    (AVG(used) / AVG(total))            AS fraction,
                    date_trunc('${filter}', date::date) AS timestamp
                FROM fil_network_view_days
                WHERE (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                GROUP BY timestamp
                ORDER BY timestamp
         ) q;`);

        }
        
        client.release();

    } catch (e) {
        ERROR(`handle_network_request query:[${JSON.stringify(query)}], fields:${fields}, error:${e}`);
    }

    return result;
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

    INFO(`[HandleMinerRequest] select ${fields}, filter:${filter}, interval[${start},${end}] , interval in epochs[${get_epoch(start)},${get_epoch(end)}]`);

    try {
        const client = await pool.connect();

        if (all == 'true') {
            limit = config.filgreen.limit;
            result = await client.query(`SELECT epoch,miner,${fields},timestamp FROM fil_miner_view_epochs WHERE (miner = '${miner}') AND (epoch >= ${get_epoch(start)}) AND (epoch <= ${get_epoch(end)}) ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
        } else {
            result = await client.query(`
            SELECT
            miner,
            ${fields},
            timestamp AS date
            FROM (
                SELECT 
                    miner                               AS miner,
                    ROUND(AVG(commited))                AS commited,
                    ROUND(AVG(used))                    AS used,
                    ROUND(AVG(total))                   AS total,
                    ROUND(AVG(avg_total_per_epoch))     AS total_per_epoch,
                    (AVG(used) / AVG(total))            AS fraction,
                    date_trunc('${filter}', date::date) AS timestamp
                FROM fil_miner_view_days
                WHERE (miner='${miner}') AND (date::date >= '${start}'::date) AND (date::date <= '${end}'::date)
                GROUP BY miner,timestamp
                ORDER BY timestamp
         ) q;`);

        }
        
        client.release();

    } catch (e) {
        ERROR(`[HandleMinerRequest] query:[${JSON.stringify(query)}], fields:${fields}, error:${e}`);
    }

    return result;
}

app.get("/network/capacity", async function (req, res, next) {
    INFO(`GET[/network/capacity] query:${JSON.stringify(req.query)}`);

    try {
        var result = await handle_network_request('commited,used', req.query);
        if (result.rows) {
            INFO(`GET[/network/capacity] query:${JSON.stringify(req.query)} done, data points: ${result.rows?.length}`);
            res.json(result.rows);
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
        if (result.rows) {
            INFO(`GET[/network/fraction] query:${JSON.stringify(req.query)} done, data points: ${result.rows?.length}`);
            res.json(result.rows);
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
        let fields = '(total_per_epoch * 2880) as sealed';
        if (req.query?.all == 'true') {
            fields = 'total_per_epoch as sealed';
        }
        var result = await handle_network_request(fields, req.query);
        if (result.rows) {
            INFO(`GET[/network/sealed] query:${JSON.stringify(req.query)} done, data points: ${result.rows?.length}`);
            res.json(result.rows);
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
        var result = await handle_miner_request('commited,used', req.query);
        if (result.rows) {
            INFO(`GET[/miner/capacity] query:${JSON.stringify(req.query)} done, data points: ${result.rows?.length}`);
            res.json(result.rows);
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
        if (result.rows) {
            INFO(`GET[/miner/fraction] query:${JSON.stringify(req.query)} done, data points: ${result.rows?.length}`);
            res.json(result.rows);
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
        let fields = '(total_per_epoch * 2880) as sealed';
        if (req.query?.all == 'true') {
            fields = 'total_per_epoch as sealed';
        }

        var result = await handle_miner_request(fields, req.query);
        if (result.rows) {
            INFO(`GET[/miner/sealed] query:${JSON.stringify(req.query)} done, data points: ${result.rows?.length}`);
            res.json(result.rows);
        } else {
            ERROR(`GET[/miner/sealed] query:${JSON.stringify(req.query)}, empty response`);
            error_response(401, 'Failed to get miner sealed data', res);
        }

    } catch (e) {
        ERROR(`GET[/miner/sealed] query:${JSON.stringify(req.query)}, error:${e}`);
        error_response(402, 'Failed to get miner sealed data', res);
    }
});

app.listen(config.filgreen.api_port, () => {
    INFO("FilGreen API running on port: " + config.filgreen.api_port);
   });