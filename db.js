const { Pool } = require("pg");
const config = require('./config');
const { INFO, ERROR, WARNING } = require('./logs');

const pool = new Pool(config.database);

const have_block = async function (block) {
    const client = await pool.connect();
    let found = false;

    try {
        const result = await client.query(`\
        SELECT EXISTS(SELECT 1 FROM fg_processed_blocks WHERE Block = ${block})`);

        if (result?.rows[0]?.exists) {
            found = true;
        }
   
    } catch (err) {
        WARNING(`[HaveBlock] ${err}`)
    }
    client.release()

    return found;
}

module.exports = {
    have_block
  }

