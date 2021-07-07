'use strict';

const axios = require('axios');

class FilScraperClient {
    constructor(api) {
        this.api = api;
    }

    async Get(route, params, timeout = 30000) {
        const response = await axios.get(this.api+route, params);
        return response;
    }

    GetHead() {
        return this.Get('/get_head');
    }

    GetBlock(block) {
        return this.Get('/get_block', { params: { block: block } });
    }
}

module.exports = {
    FilScraperClient
};

/*(async () => {

    let filScraperClient = new FilScraperClient(
        "http://localhost:3000"
    );

    const head = await filScraperClient.GetHead();
    console.log(head?.data[0]?.max);

    const res = await filScraperClient.GetBlock(head?.data[0]?.max);
    console.log(res.data[0]);
}

)();*/