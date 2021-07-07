const { Pool } = require("pg");
const config = require('./config');
const { INFO, ERROR, WARNING } = require('./logs');

const pool = new Pool(config.database);

/*const save_messages = async function (msgs) {
    const client = await pool.connect();

    for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        try {
            const { '/': msgCid } = msg.CID;

            await client.query(`\
        INSERT INTO filmessages (CID, Block, \"from\", \"to\", Nonce, Value, GasLimit, GasFeeCap, GasPremium, Method, Params, ExitCode, Return, GasUsed, Version) \
        VALUES ('${msgCid}', \
        '${msg.block}', \
        '${msg.From}', \
        '${msg.To}', \
        '${msg.Nonce}', \
        '${msg.Value}', \
        '${msg.GasLimit}', \
        '${msg.GasFeeCap}', \
        '${msg.GasPremium}', \
        '${msg.Method}', \
        '${msg.Params}', \
        '${msg.receipt.ExitCode}', \
        '${msg.receipt.Return}', \
        '${msg.receipt.GasUsed}', \
        '${msg.Version}') \
`);

        } catch (err) {
            WARNING(`[SaveMessages] ${err?.detail}`)
        }

    }

    client.release();
}*/

const save_block = async function (block) {
    const client = await pool.connect();
    try {
        await client.query(`\
           INSERT INTO FilGeenProcessedBlocks (Block) \
           VALUES ('${block}') `);


    } catch (err) {
        WARNING(`[SaveBlock] ${err}`)
    }
    client.release()
}

const save_bad_block = async function (block) {
    const client = await pool.connect();
    try {
        await client.query(`\
           INSERT INTO FilGeenBadBlocks (Block) \
           VALUES ('${block}') `);


    } catch (err) {
        WARNING(`[SaveBadBlock] ${err?.detail}`)
    }
    client.release()
}

const get_start_block = async function () {
    const client = await pool.connect();
    let block = config.filgreen.start;
    try {
        const result = await client.query(`\
        SELECT MAX(Block) \
        FROM FilGeenProcessedBlocks `);

        if (result?.rows[0]?.max) {
            block = result?.rows[0]?.max;
        }
    } catch (err) {
        WARNING(`[GetMaxBlock] ${err?.detail}`)
    }
    client.release()

    return block;
}

const get_bad_blocks = async function (limit, offset) {
    const client = await pool.connect();
    let rows = undefined;
    try {
        const result = await client.query(`\
        SELECT block FROM FilGeenBadBlocks ORDER BY block LIMIT ${limit} OFFSET ${offset}`);

        if (result?.rows) {
            rows = result?.rows;
        }
    } catch (err) {
        WARNING(`[GetBadBlocks] ${err?.detail}`)
    }
    client.release()

    return rows;
}

const have_block = async function (block) {
    const client = await pool.connect();
    let found = false;

    try {
        const result = await client.query(`\
        SELECT EXISTS(SELECT 1 FROM FilGeenProcessedBlocks WHERE Block = ${block})`);

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
    save_block,
    save_bad_block,
    get_start_block,
    get_bad_blocks,
    have_block
  }

