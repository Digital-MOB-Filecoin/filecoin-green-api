
const config = require('./config');
const { INFO, ERROR, WARNING } = require('./logs');
const { Pool } = require("pg");

const pool = new Pool(config.database);

function error_response(code, msg, res) {
    res.status(code).send(msg);
}

// GET
const MapList = async function (req, res, next) {
    try {
        var result = await pool.query('SELECT country, count(miner) as storage_providers FROM fil_location_view GROUP BY country ORDER BY storage_providers DESC;');

        if (result.rows.length > 0) {
            INFO(`GET[/map/list]: ${JSON.stringify(result.rows.length)} datapoints`);
            res.json(result.rows);
        } else {
            ERROR(`GET[/map/list]: Failed to get map list, result: ${JSON.stringify(result.rows)}`);
            error_response(402, 'Failed to get map list', res);
        }

    } catch (e) {
        ERROR(`GET[/map/list] error: ${e}`);
        error_response(401, 'Failed to get  map list', res);
    }
};

// GET
const MapListCountry = async function (req, res, next) {
    let country = req.query?.country;
    let limit = req.query?.limit;
    let offset = req.query?.offset;

    if (!limit) {
        limit = 500;
    }

    if (!offset) {
        offset = 0;
    }

    if (!country) {
        ERROR(`GET[/map/list/country] Failed to get country map list, no country param provided`);
        error_response(402, 'Failed to get country map list, no country param provided', res);
        return;
    }

    try {
        var result = await pool.query(`
        with miners_data as (SELECT miner, country, city, lat, long FROM fil_location_view WHERE country = '${country}'),
             power_data as (SELECT miner, power FROM fil_miners_view_v3)
             SELECT
                miners_data.miner, country, city, lat, long, power
             FROM miners_data
             LEFT JOIN power_data ON miners_data.miner = power_data.miner
             LIMIT ${limit} OFFSET ${offset};
        `);

        if (result.rows.length > 0) {
            INFO(`GET[/map/list/country]: ${JSON.stringify(result.rows.length)} datapoints`);
            res.json(result.rows);
        } else {
            ERROR(`GET[/map/list/country]: Failed to get country map list, result: ${JSON.stringify(result.rows)}`);
            error_response(402, 'Failed to get country map list', res);
        }

    } catch (e) {
        ERROR(`GET[/map/list] error: ${e}`);
        error_response(401, 'Failed to get  map list', res);
    }
};

// GET
const MapListMiner = async function (req, res, next) {
    let miner = req.query?.miner;

    if (!miner) {
        ERROR(`GET[/map/list/miner] Failed to get miner map list, no miner param provided`);
        error_response(402, 'Failed to get miner map list, no miner param provided', res);
        return;
    }

    try {
        let miners = miner.split(',');
        let query = `With miners_data as (SELECT miner, country, city, lat, long FROM fil_location_view WHERE miner = '${miners[0]}'`;
        for (let i = 1; i < miners.length; i++) {
            query += ` OR miner = '${miners[i]}'`;
        }

        query += `),
            power_data as (SELECT miner, power FROM fil_miners_view_v3)
            SELECT
                miners_data.miner, country, city, lat, long, power
            FROM miners_data
            LEFT JOIN power_data ON miners_data.miner = power_data.miner
        `;

        var result = await pool.query(`${query};`);

        if (result.rows.length > 0) {
            INFO(`GET[/map/list/miner]: ${JSON.stringify(result.rows.length)} datapoints`);
            res.json(result.rows);
        } else {
            ERROR(`GET[/map/list/miner]: Failed to get miner map list, result: ${JSON.stringify(result.rows)}`);
            error_response(402, 'Failed to get miner map list', res);
        }

    } catch (e) {
        ERROR(`GET[/map/list] error: ${e}`);
        error_response(401, 'Failed to get  map list', res);
    }
};

module.exports = {
    MapList,
    MapListCountry,
    MapListMiner,
}
