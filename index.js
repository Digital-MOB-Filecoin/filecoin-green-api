const config = require('./config');
const { version } = require('./package.json');
const { INFO, ERROR, WARNING } = require('./logs');
const { create_filgeenprocessedblocks_table, create_filgeenbadblocks_table } = require('./migrations');
const { save_block, save_bad_block, get_start_block, get_bad_blocks, have_block } = require('./db');
const { FilScraperClient } = require('./filscraper-client');

const SCRAPE_LIMIT = 10
let stop = false;
let filScraperClient = new FilScraperClient(config.filgreen.filscraper_api);

const pause = (timeout) => new Promise(res => setTimeout(res, timeout * 1000));

async function get_head() {
    const response = await filScraperClient.GetHead();

    if (response.status != 200) {
        ERROR(`[GetHead] status : ${response.status}`);
        return undefined;
    }

    if (response?.data[0]?.max) {
        return response?.data[0]?.max;
    }

    ERROR(`[GetHead] invalid response : ${response.data}`);

    return undefined;
}

async function get_block(block) {
    const response = await filScraperClient.GetBlock(block);

    if (response.status != 200) {
        ERROR(`[GetBlock] status : ${response.status}`);
        return undefined;
    }

    return response?.data;
}

async function process_commit_messages(messages) {
    
}

async function scrape_block(block) {
    const found = await have_block(block)
    if (found) {
        INFO(`[ScrapeBlock] ${block} already scraped, skipping`);
        return;
    }

    INFO(`[ScrapeBlock] ${block}`);
    const messages = await get_block(block);

    if (messages && messages.length > 0) {
        INFO(`[ScrapeBlock] ${block}, ${messages.length} messages`);

        await save_block(block);
        await process_commit_messages(messages);

        INFO(`[ScrapeBlock] ${block} done`);
    } else {
        save_bad_block(block)
        WARNING(`[ScrapeBlock] ${block} mark as bad block`);
    }
}

async function scrape() {
    const start_block = await get_start_block();
    const end_block = await get_head();

    if (!start_block || !end_block || !(start_block < end_block)) {
        ERROR(`[Scrape] error start_block : ${start_block} , end_block : ${end_block}`);
        return;
    }

    INFO(`[Scrape] from ${start_block} to ${end_block}`);

    for (let block = start_block; block <= end_block; block++) {
        await scrape_block(block);
    }
}

async function rescrape() {
    let blocks;
    let i = 0;

    do {
        blocks = await get_bad_blocks(SCRAPE_LIMIT, i * SCRAPE_LIMIT);

        if (blocks) {
            if (blocks.length) {
                for (let idx = 0; idx < blocks.length; idx++) {
                    INFO(`[Rescrape] block ${blocks[idx]?.block}`);
                    await scrape_block(blocks[idx]?.block);
                }
            }
        }

        i++;
    } while (blocks?.length == SCRAPE_LIMIT);
}


async function filecoin_green_api_version() {
    INFO(`FilecoinGreen API version: ${version}`);
};

const mainLoop = async _ => {
    try {
        await filecoin_green_api_version();
        await create_filgeenprocessedblocks_table();
        await create_filgeenbadblocks_table();

        while (!stop) {

            await scrape();
            await rescrape();

            INFO(`Pause for 60 seconds`);
            await pause(60);
        }

    } catch (error) {
        ERROR(`[MainLoop] error :`);
        console.error(error);
        ERROR(`Shutting down`);
        process.exit(1);
    }

}

mainLoop();

function shutdown(exitCode = 0) {
    stop = true;
    setTimeout(() => {
        INFO(`Shutdown`);
        process.exit(exitCode);
    }, 3000);
}
//listen for TERM signal .e.g. kill
process.on('SIGTERM', shutdown);
// listen for INT signal e.g. Ctrl-C
process.on('SIGINT', shutdown);