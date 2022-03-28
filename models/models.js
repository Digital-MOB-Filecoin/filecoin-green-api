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
const { TotalSealedModel } = require('./011_total-sealed-model');
const { TotalStoredOverTimeModel } = require('./012_total-stored-over-time-model');
const { TotalSealedStoredOverTimeModel } = require('./013_total-sealed_plus_stored-over-time-model');
const { TotalSealingEnergyModel } = require('./014_total-sealing-energy');
const { RenewableEnergyModel } = require('./015_renewable-energy-model');
const { CumulativeEnergyModel_v_1_0_1 } = require('./016_cumulative-energy-use-model');

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
let totalSealedModel = new TotalSealedModel(pool);
let totalStoredOverTimeModel = new TotalStoredOverTimeModel(pool);
let totalSealedStoredOverTimeModel = new TotalSealedStoredOverTimeModel(pool);
let totalSealingEnergyModel = new TotalSealingEnergyModel(pool);
let renewableEnergyModel = new RenewableEnergyModel(pool);
let cumulativeEnergyModel_v_1_0_1 = new CumulativeEnergyModel_v_1_0_1(pool);


class Models {
    constructor() {
        this.models = [];
        this.models_list = [];
    }

    LoadModels() {
        this.Register(totalEnergyModelv_1_0_1);       //Energy consumption rate (v1.0.1)
        this.Register(sealingEnergyModelv_1_0_1);     //Energy used to seal data (v1.0.1)
        this.Register(storageEnergyModelv_1_0_1);     //Energy used to store data (v1.0.1)
        this.Register(cumulativeEnergyModel_v_1_0_1); //Cumulative Energy Use (v1.0.1)
        this.Register(renewableEnergyModel);          //Cumulative renewable energy purchases
        this.Register(sealedModel);                   //Data storage capacity added per day
        this.Register(capacityModel);                 //Data storage capacity
        
        // this.Register(fractionModel);
        // this.Register(sealingEnergyModel);
        // this.Register(storageEnergyModel);
        // this.Register(totalEnergyModel);

        //Dev Models:
        /*
        this.Register(sealingEnergySumModel);
        this.Register(totalSealedModel);
        this.Register(totalStoredOverTimeModel);
        this.Register(totalSealedStoredOverTimeModel);
        this.Register(totalSealingEnergyModel);
        */
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
