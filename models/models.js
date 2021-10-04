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

let capacityModel = new CapacityModel(pool);
// let fractionModel = new FractionModel(pool);
let sealedModel = new SealedModel(pool);
let sealingEnergyModel = new SealingEnergyModel(pool);
let storageEnergyModel = new StorageEnergyModel(pool);
let totalEnergyModel = new TotalEnergyModel(pool);

class Models {
    constructor() {
        this.models = [];
        this.models_list = [];
    }

    LoadModels() {
        this.Register(capacityModel);
        // this.Register(fractionModel);
        this.Register(sealedModel);
        this.Register(sealingEnergyModel);
        this.Register(storageEnergyModel);
        this.Register(totalEnergyModel);
    }

    Register(model) {
        let id = this.models.length;
        if (ValidModel(model)) {
            this.models.push(model)
            this.models_list.push({id: id, name: model.Name(), category: model.Category()});

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
