const { Pool } = require("pg");
const config = require('./config');
const pool = new Pool(config.database);

/*const create_filmessages_table = async function () {
    const client = await pool.connect();

    //await client.query('DROP TABLE filmessages');

    await client.query("\
        CREATE TABLE IF NOT EXISTS FilMessages\
        (\
            CID text NOT NULL,\
            Block bigint NOT NULL,\
            \"from\" text NOT NULL,\
            \"to\" text NOT NULL,\
            Nonce bigint NOT NULL,\
            Value text NOT NULL,\
            GasLimit bigint NOT NULL,\
            GasFeeCap text NOT NULL,\
            GasPremium text NOT NULL,\
            Method integer NOT NULL,\
            Params text NOT NULL,\
            ExitCode integer,\
            Return text,\
            GasUsed bigint,\
            Version integer NOT NULL\
        )");

    client.release()
}*/

const create_filgeenprocessedblocks_table = async function () {
    const client = await pool.connect();

    await client.query("\
        CREATE TABLE IF NOT EXISTS FilGeenProcessedBlocks\
        (\
            Block bigint NOT NULL UNIQUE,\
            Created timestamp default now(),\
            PRIMARY KEY (Block) \
        )");

    client.release()
}

const create_filgeenbadblocks_table = async function () {
    const client = await pool.connect();

    await client.query("\
        CREATE TABLE IF NOT EXISTS FilGeenBadBlocks\
        (\
            Block bigint NOT NULL,\
            Created timestamp default now(),\
            PRIMARY KEY (Block) \
        )");

    client.release()
}

module.exports = {
    create_filgeenprocessedblocks_table,
    create_filgeenbadblocks_table
  }

