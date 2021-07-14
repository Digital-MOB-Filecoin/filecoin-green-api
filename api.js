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

async function handle_network_request(fields, query) {
    var result;
    let code = 200;
    let msg = 'successful';
    let limit = 'ALL';
    let epochs_gap = config.filgreen.epochs_gap;
    let start = query?.start;
    let end = query?.end;
    let all = query?.all;
    let offset = query?.offset

    if (all == 'true') {
        epochs_gap = 1;
        limit = config.filgreen.limit;
    }

    if (!start) {
        start = 0;
    }

    if (!offset) {
        offset = 0;
    }

    try {
        const client = await pool.connect()

        
        if (!end) {
            result = await client.query(`SELECT ${fields} FROM fil_network WHERE (epoch >= ${start}) AND (epoch % ${epochs_gap} = 0) ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
        } else {
            result = await client.query(`SELECT ${fields} FROM fil_network WHERE (epoch >= ${start}) AND (epoch <= ${end}) AND (epoch % ${epochs_gap} = 0) ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
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
    let msg = 'successful';
    let limit = 'ALL';
    let epochs_gap = config.filgreen.epochs_gap;
    let miner = query?.miner;
    let start = query?.start;
    let end = query?.end;
    let all = query?.all;
    let offset = query?.offset

    if (all == 'true') {
        epochs_gap = 1;
        limit = config.filgreen.limit;
    }

    if (!start) {
        start = 0;
    }

    if (!offset) {
        offset = 0;
    }

    try {
        const client = await pool.connect()

        
        if (!end) {
            result = await client.query(`SELECT ${fields} FROM fil_miner_events WHERE (miner = '${miner}') AND ((epoch >= ${start}) AND (epoch % ${epochs_gap} = 0)) ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
        } else {
            result = await client.query(`SELECT ${fields} FROM fil_miner_events WHERE (miner = '${miner}') AND ((epoch >= ${start}) AND (epoch <= ${end}) AND (epoch % ${epochs_gap} = 0)) ORDER BY epoch LIMIT ${limit} OFFSET ${offset}`);
        }
        
        client.release();

    } catch (e) {
        ERROR(`handle_miner_request query:[${JSON.stringify(query)}], fields:${fields}, error:${e}`);
    }

    return result;
}

app.get("/network/capacity", async function (req, res, next) {
    INFO(`GET[/network/capacity] query:${JSON.stringify(req.query)}`);

    try {
        var result = await handle_network_request('epoch,commited,used', req.query);
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
        var result = await handle_network_request('epoch,fraction', req.query);
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
        var result = await handle_network_request('epoch,total', req.query);
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
        var result = await handle_miner_request('epoch,commited,used', req.query);
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
        var result = await handle_miner_request('epoch,fraction', req.query);
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
        var result = await handle_miner_request('epoch,total', req.query);
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