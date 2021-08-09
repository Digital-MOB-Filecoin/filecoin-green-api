const config = require('./config');
const { INFO, ERROR, WARNING } = require('./logs');
const { Pool } = require("pg");

const pool = new Pool(config.database);

function error_response(code, msg, res) {
    res.status(code).send(msg);
}

function add_params(have_params) {
    let result = '';
    if (have_params) {
        result = 'AND ';
    } 

    return result;
}

// GET
const filchain = async function (req, res, next) {
    let query = 'SELECT * FROM fil_messages WHERE ';
    let have_params = false;
    let limit = req.query?.limit;
    let offset = req.query?.offset;

    //CID, Block, From, To, Method
    let cid = req.query?.cid;
    let block = req.query?.block;
    let from = req.query?.from;
    let to = req.query?.to;
    let method = req.query?.method;

    if (!limit) {
        limit = 500;
    }

    if (!offset) {
        offset = 0;
    }

    if (cid) {
        query += `(\"CID\" = '${cid}') `;
        have_params = true;
    }

    if (block) {
        query += add_params(have_params);
        query += `(\"Block\" = '${block}') `;
        have_params = true;
    }

    if (from) {
        query += add_params(have_params);
        query += `(\"From\" = '${from}') `;
        have_params = true;
    }

    if (to) {
        query += add_params(have_params);
        query += `(\"To\" = '${to}') `;
        have_params = true;
    }

    if (method) {
        query += add_params(have_params);
        query += `(\"Method\" = '${method}') `;
        have_params = true;
    }

    query += `ORDER BY \"Block\" LIMIT ${limit} OFFSET ${offset};`;

    INFO(`GET[/filchain] query: [ ${query} ] run`);

    if (!have_params) {
        ERROR(`GET[/filchain] query:${JSON.stringify(req.query)}, no params`);
        error_response(403, 'Failed to get filchain data, no query params provided', res);
        return;
    }

    try {
        var result = await pool.query(query);

        if (result) {
            INFO(`GET[/filchain] query: [ ${query} ] done, data points: ${result?.rows?.length}`);
            res.json(result.rows);
        } else {
            ERROR(`GET[/filchain] query:${JSON.stringify(req.query)}, empty response`);
            error_response(401, 'Failed to get filchain data', res);
        }

    } catch (e) {
        ERROR(`GET[/filchain] query:${JSON.stringify(req.query)}, error:${e}`);
        error_response(402, 'Failed to get filchain data', res);
    }

}

module.exports = {
    filchain,
}