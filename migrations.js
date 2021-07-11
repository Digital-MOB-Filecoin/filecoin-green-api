const { Pool } = require("pg");
const config = require('./config');

class Migrations {

    constructor(api, token) {
        this.pool = new Pool(config.database);
    }

    async create_fg_sectors_table() {
        const client = await this.pool.connect();

        //await client.query('DROP TABLE sectors');

        await client.query("\
        CREATE TABLE IF NOT EXISTS fg_sectors\
        (\
            sector bigint NOT NULL,\
            miner text NOT NULL,\
            type text NOT NULL,\
            size bigint NOT NULL,\
            start_epoch bigint NOT NULL,\
            end_epoch bigint NOT NULL\
        )");

        client.release()
    }

    async create_fg_processed_blocks_table() {
        const client = await this.pool.connect();

        await client.query("\
        CREATE TABLE IF NOT EXISTS fg_processed_blocks\
        (\
            Block bigint NOT NULL UNIQUE,\
            Created timestamp default now(),\
            PRIMARY KEY (Block) \
        )");

        client.release()
    }

    async create_fg_badblocks_table() {
        const client = await this.pool.connect();

        await client.query("\
        CREATE TABLE IF NOT EXISTS fg_badblocks\
        (\
            Block bigint NOT NULL,\
            Created timestamp default now(),\
            PRIMARY KEY (Block) \
        )");

        client.release()
    }

    async run() {
        await this.create_fg_processed_blocks_table();
        await this.create_fg_badblocks_table();
        await this.create_fg_sectors_table();
    }
}

module.exports = {
    Migrations
  }

