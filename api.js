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

app.get("/network", async function (req, res, next) {
    let code = 200;
    let msg = 'successful';

    try {
        const client = await pool.connect()
        var result = await client.query(`SELECT * FROM fil_network`);
        client.release();

        res.json(result.rows);
    } catch (e) {
        code = 401;
        msg = 'Failed to get fil_network data';
        res.status(code).send(msg);
    }

});

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

app.listen(config.filgreen.api_port, () => {
    console.log("FilGreen API running on port " + config.filgreen.api_port);
   });