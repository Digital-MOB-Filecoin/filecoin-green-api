const config = require('./../config');
const { Pool } = require("pg");
const { INFO, ERROR, WARNING } = require('./../logs');
const { ValidModel, Start, End, Filter, Offset, Limit, Miner } = require('./utils');
const pool = new Pool(config.database);

const { CapacityModel } = require('./001_capacity-model');
// const { FractionModel } = require('./002_fraction-model');
const { SealedModel } = require('./003_sealed-model');
const { SealingEnergyModel } = require('./004_sealing_energy-model');
const { StorageEnergyModel } = require('./005_storage_energy-model');
const { TotalEnergyModel } = require('./006_total_energy-model');
const { SealingEnergySumModel } = require('./007_sealing-energy-sum-model');
const { SealingEnergyModelv_1_0_1 } = require('./008_sealing_energy-model-v-1-0-1');
const { StorageEnergyModelv_1_0_1 } = require('./009_storage_energy-model-v-1-0-1');
const { TotalEnergyModelv_1_0_1 } = require('./010_total_energy-model-v-1-0-1');

let capacityModel = new CapacityModel(pool);
// let fractionModel = new FractionModel(pool);
let sealedModel = new SealedModel(pool);
let sealingEnergyModel = new SealingEnergyModel(pool);
let storageEnergyModel = new StorageEnergyModel(pool);
let totalEnergyModel = new TotalEnergyModel(pool);
let sealingEnergySumModel = new SealingEnergySumModel(pool);
let sealingEnergyModelv_1_0_1 = new SealingEnergyModelv_1_0_1(pool);
let storageEnergyModelv_1_0_1 = new StorageEnergyModelv_1_0_1(pool);
let totalEnergyModelv_1_0_1 = new TotalEnergyModelv_1_0_1(pool);


class Models {
    constructor() {
        this.models = [];
        this.models_list = [];
    }

    LoadModels() {
        this.Register(totalEnergyModelv_1_0_1);
        this.Register(storageEnergyModelv_1_0_1);
        this.Register(sealingEnergyModelv_1_0_1);
        this.Register(capacityModel);
        // this.Register(fractionModel);
        this.Register(sealedModel);
        // this.Register(sealingEnergyModel);
        // this.Register(storageEnergyModel);
        // this.Register(totalEnergyModel);
        //this.Register(sealingEnergySumModel);



    }

    Register(model) {
        let id = this.models.length;
        if (ValidModel(model)) {
            this.models.push(model)
            this.models_list.push({id: id, name: model.Name(), category: model.Category(), details: model.Details()});

            INFO(`[Models] register model ${model.Name()} , id : ${id}`);
        } else {
            ERROR(`Unable to register model : ${model?.Name()} validation failed`);
        }
    }

    async Query(id, query) {
        let result = undefined;

        if (id >=0 && id < this.models.length) {
            let start = Start(query);
            let end = End(query);
            let filter = Filter(query);
            let miner = Miner(query);

            result = await this.models[id].Query(id, start, end, filter, miner);
        }  else {
            ERROR(`Unable to query model with id: ${id}`);
        }

        return result;
    }

    async Export(id, query) {
        let result = undefined;

        if (id >=0 && id < this.models.length) {
            let start = Start(query);
            let end = End(query);
            let miner = Miner(query);
            let offset = Offset(query);
            let limit = Limit(query);

            result = await this.models[id].Export(id, start, end, miner, offset, limit);
        }  else {
            ERROR(`Unable to export model with id: ${id}`);
        }

        return result;
    }

    List() {
        return this.models_list;
    }
}

module.exports = {
    Models
};
