'use strict';

const { LotusMethods } = require('./methods')
const axios = require('axios');

class Lotus {
    constructor(api, token) {
        this.id = 0
        this.api = api;
        this.token = token;
    }

    async LotusAPI(method, params, timeout = 30000) {
        let body = JSON.stringify({
            "jsonrpc": "2.0",
            "method": `Filecoin.${method}`,
            "params": params,
            "id": this.id++,
        });

        if (!LotusMethods[method]) {
            console.error(`Filecoin.${method} not found`);
            return undefined;
        }

        const response = await axios.post(this.api, body, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`
            },
            timeout: timeout
        });

        return response;
    }

    StateListMiners() {
        return this.LotusAPI("StateListMiners", [null]);
    }

    StateMinerPower(miner) {
        return this.LotusAPI("StateMinerPower", [miner, null]);
    }

    Version() {
        return this.LotusAPI("Version", []);
    }

    StateMinerInfo(miner) {
        return this.LotusAPI("StateMinerInfo", [miner, null]);
    }

    ClientQueryAsk(peerId, miner, timeout = 300000) {
        return this.LotusAPI("ClientQueryAsk", [peerId, miner], timeout);
    }

    NetFindPeer(peerId) {
        return this.LotusAPI("NetFindPeer", [peerId]);
    }

    StateGetActor(miner, tipSetKey) {
        return this.LotusAPI("StateGetActor", [miner, tipSetKey]);
    }

    ChainGetTipSetByHeight(chainEpoch, tipSetKey) {
        return this.LotusAPI("ChainGetTipSetByHeight", [chainEpoch, tipSetKey]);
    }

    ChainGetParentMessages(blockCid, timeout = 180000) {
        return this.LotusAPI("ChainGetParentMessages", [{"/":blockCid}], timeout);
    }

    ChainGetParentReceipts(blockCid, timeout = 180000) {
        return this.LotusAPI("ChainGetParentReceipts", [{"/":blockCid}], timeout);
    }

    ChainHead() {
        return this.LotusAPI("ChainHead", []);
    }

    StateMarketStorageDeal(dealID, tipSetKey, timeout = 180000) {
        return this.LotusAPI("StateMarketStorageDeal", [dealID, tipSetKey], timeout);
    }

}

module.exports = {
    Lotus
};