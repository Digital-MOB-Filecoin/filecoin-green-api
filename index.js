const cbor = require('borc');
const config = require('./config');
const { hdiff } = require('./utils');
const { version } = require('./package.json');
const { INFO, ERROR, WARNING } = require('./logs');
const { Migrations } = require('./migrations');
const { save_block, save_bad_block, get_start_block, get_bad_blocks, have_block, save_sector } = require('./db');
const { decodeRLE2 } = require('./rle');
const { FilScraperClient } = require('./filscraper-client');

const MethodsMiner = {
    Constructor: 1,
    ControlAddresses: 2,
    ChangeWorkerAddress: 3,
    ChangePeerID: 4,
    SubmitWindowedPoSt: 5,
    PreCommitSector: 6,
    ProveCommitSector: 7,
    ExtendSectorExpiration: 8,
    TerminateSectors: 9,
    DeclareFaults: 10,
    DeclareFaultsRecovered: 11,
    OnDeferredCronEvent: 12,
    CheckSectorProven: 13,
    ApplyRewards: 14,
    ReportConsensusFault: 15,
    WithdrawBalance: 16,
    ConfirmSectorProofsValid: 17,
    ChangeMultiaddrs: 18,
    CompactPartitions: 19,
    CompactSectorNumbers: 20,
    ConfirmUpdateWorkerKey: 21,
    RepayDebt: 22,
    ChangeOwnerAddress: 23,
};

const SCRAPE_LIMIT = 10
const RESCRAPE_INTERVAL = 1 // hours
let last_rescrape = Date.now();
let stop = false;
let filScraperClient = new FilScraperClient(config.filgreen.filscraper_api);
let migrations = new Migrations();

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

function decode_sectors(buffer) {
    let sectors = [];
    try {
        let decoded_rle = decodeRLE2(buffer);
        if (decoded_rle) {
            sectors = decoded_rle;
        }
    } catch (error) {
        ERROR(`[decodeRLE2] failed for params: ${buffer}`);
    }

    return sectors;
}

async function process_messages(messages) {
    var messagesSlice = messages;
    while (messagesSlice.length) {
        await Promise.all(messagesSlice.splice(0, 50).map(async (msg) => {
            //await pause(1);
            if (msg.exitcode == 0 && msg.params && msg.to.startsWith('f0')) {
                let miner = msg.to;
                let decoded_params = [];
                try {
                    decoded_params = cbor.decode(msg.params, 'base64');
                } catch (error) {
                    ERROR(`[ProcessMessages] error cbor.decode : ${error}`);
                }

                if (decoded_params.length > 0) {

                    switch (msg.method) {
                        case MethodsMiner.PreCommitSector: {
                            const preCommitSector = {
                                DealIDs: decoded_params[4],
                                Expiration: decoded_params[5],
                                ReplaceCapacity: decoded_params[6],
                                ReplaceSectorDeadline: decoded_params[7],
                                ReplaceSectorNumber: decoded_params[8],
                                ReplaceSectorPartition: decoded_params[9],
                                SealProof: decoded_params[0],
                                SealRandEpoch: decoded_params[3],
                                SealedCID: decoded_params[2],
                                SectorNumber: decoded_params[1]
                            }

                            //const minerInfo = await lotus.StateMinerInfo(miner.address);
                            //let sectorSize = minerInfo.result.SectorSize;
                            //TODO: sector size cache[miner]
                            const sector_size = 34359738368;

                            let sector_info = {
                                sector: preCommitSector.SectorNumber,
                                miner: miner,
                                type: 'commited', 
                                size: sector_size, 
                                start_epoch: msg.block, 
                                end_epoch: preCommitSector.Expiration,
                            }

                            if (preCommitSector.DealIDs?.length == 0) {
                                save_sector(sector_info);

                                // 'miners' TABLE -> lotus.StateMinerInfo
                                // miner
                                // sector_size

                                // 'sectors' TABLE ->
                                // miner
                                // sector
                                // size
                                // type  : used/commited
                                // start_epoch
                                // end_epoch

                                // 'deals' TABLE
                                // deal
                                // miner
                                // sector
                                // start_epoch
                                // end_epoch

                                // 'sectors_events' TABLE
                                // type : terminate/fault/recover
                                // miner :
                                // sector :
                                // epoch :

                                // 'network' TABLE
                                // epoch
                                // commited
                                // used

                                //commited capacity sector
                                INFO(`[PreCommitSector] Miner:${miner} SectorNumber: ${preCommitSector.SectorNumber}`);
                            } else {
                                //used sector
                                sector_info.type = 'used';
                                save_sector(sector_info);

                                INFO(`[PreCommitSector] Miner:${miner} SectorNumber: ${preCommitSector.SectorNumber} DealIDs: ${preCommitSector.DealIDs}`);
                            }
                        }
                            break;
                        case MethodsMiner.TerminateSectors: {
                            let sectors = decode_sectors(Buffer.from(decoded_params[0][0][2]));

                            INFO(`[TerminateSectors] Miner:${miner} sectors: ${sectors} sectors`);
                        }
                            break;
                        case MethodsMiner.DeclareFaults: {
                            let sectors = decode_sectors(Buffer.from(decoded_params[0][0][2]));

                            INFO(`[DeclareFaults] Miner:${miner} for ${sectors.length} sectors`);
                        }
                            break;
                        case MethodsMiner.DeclareFaultsRecovered: {
                            let sectors = decode_sectors(Buffer.from(decoded_params[0][0][2]));

                            INFO(`[DeclareFaultsRecovered] Miner:${miner} for ${sectors.length} sectors`);
                        }
                            break;
                        case MethodsMiner.ProveCommitSector: {
                            const commitedSectorProof = {
                                miner: msg.to,
                                sector: decoded_params[0],
                                epoch: msg.block,
                            }

                            INFO(`[ProveCommitSector] proof:${JSON.stringify(commitedSectorProof)}`);
                        }
                            break;

                        default:
                    }
                }
            }
        }))
    }
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
        ////TODO:: check if block exists in bad_blocks, and remove if from bad_blocks
        await process_messages(messages);

        INFO(`[ScrapeBlock] ${block} done`);
    } else {
        //TODO:: check if block already exists in bad_blocks
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
    if (hdiff(last_rescrape) < RESCRAPE_INTERVAL) {
        INFO('[Rescrape] skip');
        return;
    }

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
        await migrations.run();

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