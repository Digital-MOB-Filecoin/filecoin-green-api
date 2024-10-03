const config = require('./../config');
const { Pool } = require("pg");
const { INFO, ERROR, WARNING } = require('./../logs');
const { ValidModel, Start, End, Filter, Offset, Limit, Miners, Country } = require('./utils');
const pool = new Pool(config.database);

const { CapacityModel } = require('./001_capacity-model');
// const { FractionModel } = require('./002_fraction-model');
const { SealedModel } = require('./003_sealed-model');
const { SealingEnergyModel } = require('./004_sealing_energy-model');
const { StorageEnergyModel } = require('./005_storage_energy-model');
const { TotalEnergyModel } = require('./006_total_energy-model');
const { SealingEnergySumModel } = require('./007_sealing-energy-sum-model');
const { SealingEnergyModelv_1_0_2 } = require('./008_sealing_energy-model-v-1-0-2');
const { StorageEnergyModelv_1_0_2 } = require('./009_storage_energy-model-v-1-0-2');
const { TotalEnergyModelv_1_0_2 } = require('./010_total_energy-model-v-1-0-2');
const { TotalSealedModel } = require('./011_total-sealed-model');
const { TotalStoredOverTimeModel } = require('./012_total-stored-over-time-model');
const { TotalSealedStoredOverTimeModel } = require('./013_total-sealed_plus_stored-over-time-model');
const { TotalSealingEnergyModel } = require('./014_total-sealing-energy');
const { RenewableEnergyModel } = require('./015_renewable-energy-model');
const { CumulativeEnergyModel_v_1_0_2 } = require('./016_cumulative-energy-use-model');
const { RenewableEnergyRatioModel } = require('./017_renewable-energy-ratio-model.js');
const { EnergyIntensityModel } = require('./018_energy-intensity-model.js');
const { TotalEmissionsModel } = require('./019_total-emissions-model.js');
const { TotalEmissionsWithRenewableModel } = require('./020_total-emissions-with-renewable-model.js');
const { TotalEmissionsWithRenewableFloorModel } = require('./021_total-emissions-with-renewable-floor-model.js');

let capacityModel = new CapacityModel(pool);
// let fractionModel = new FractionModel(pool);
let sealedModel = new SealedModel(pool);
let sealingEnergyModel = new SealingEnergyModel(pool);
let storageEnergyModel = new StorageEnergyModel(pool);
let totalEnergyModel = new TotalEnergyModel(pool);
let sealingEnergySumModel = new SealingEnergySumModel(pool);
let sealingEnergyModelv_1_0_2 = new SealingEnergyModelv_1_0_2(pool);
let storageEnergyModelv_1_0_2 = new StorageEnergyModelv_1_0_2(pool);
let totalEnergyModelv_1_0_2 = new TotalEnergyModelv_1_0_2(pool);
let totalSealedModel = new TotalSealedModel(pool);
let totalStoredOverTimeModel = new TotalStoredOverTimeModel(pool);
let totalSealedStoredOverTimeModel = new TotalSealedStoredOverTimeModel(pool);
let totalSealingEnergyModel = new TotalSealingEnergyModel(pool);
let renewableEnergyModel = new RenewableEnergyModel(pool);
let cumulativeEnergyModel_v_1_0_2 = new CumulativeEnergyModel_v_1_0_2(pool);
let renewableEnergyRatioModel = new RenewableEnergyRatioModel(pool);
let energyIntensityModel = new EnergyIntensityModel(pool);
let totalEmissionsModel = new TotalEmissionsModel(pool);
let totalEmissionsWithRenewableModel = new TotalEmissionsWithRenewableModel(pool);
let totalEmissionsWithRenewableFloorModel = new TotalEmissionsWithRenewableFloorModel(pool);


class Models {
    constructor() {
        this.models = [];
        this.models_list = [];
    }

    LoadModels() {
        //this.Register(renewableEnergyRatioModel);           //Renewable energy ratio
        this.Register(totalEnergyModelv_1_0_2);       //Energy consumption rate (v1.0.2)
        this.Register(sealingEnergyModelv_1_0_2);     //Energy used to seal data (v1.0.2)
        this.Register(storageEnergyModelv_1_0_2);     //Energy used to store data (v1.0.2)
        this.Register(cumulativeEnergyModel_v_1_0_2); //Cumulative Energy Use (v1.0.2)
        this.Register(renewableEnergyModel);          //Cumulative renewable energy purchases

        if (config.filgreen.experimental_models == 1) {
            this.Register(totalEmissionsModel);                   //Total emissions 
            this.Register(totalEmissionsWithRenewableFloorModel); //Total emissions with renewable (floor)
            // this.Register(totalEmissionsWithRenewableModel);      //Total emissions with renewable
        }

        // this.Register(energyIntensityModel);          //Energy Intensity
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
            this.models_list.push({id: id, name: model.Name(), code_name: model.CodeName(), category: model.Category(), details: model.Details()});

            INFO(`[Models] register model ${model.Name()} , id : ${id} code_name : ${model.CodeName()}`);
        } else {
            ERROR(`Unable to register model : ${model?.Name()} validation failed`);
        }
    }

    async Query(id, code_name, query) {
        let result = undefined;

        let params = {
            start: Start(query),
            end: End(query),
            filter: Filter(query),
            country: Country(query),
            miners: Miners(query),
        }

        if (id) {
            if (id >= 0 && id < this.models.length) {
                result = await this.models[id].Query(id, params);
            } else {
                ERROR(`Unable to query model with id: ${id}`);
            }
        } else if (code_name) {
            let found = false;
            id = 0;
            for (const model of this.models) {
                if (model.CodeName() === code_name) {
                    result = await model.Query(id.toString(), params);
                    found = true;
                }

                if (found) {
                    break;
                }

                id++;
            }

            if (!found) {
                ERROR(`Query model with code_name: ${code_name} not found`);
            }
        }

        return result;
    }

    async Export(id, code_name, query) {
        let result = undefined;

        let params = {
            start: Start(query),
            end: End(query),
            miners: Miners(query),
            offset: Offset(query),
            limit: Limit(query),
            filter: Filter(query),
            country: Country(query),
        }

        if (id) {
            if (id >= 0 && id < this.models.length) {
                result = await this.models[id].Export(id.toString(), params);
            } else {
                ERROR(`Unable to export model with id: ${id}`);
            }
        } else if (code_name) {
            let found = false;
            id = 0;
            for (const model of this.models) {
                if (model.CodeName() === code_name) {
                    result = await model.Export(id.toString(), params);
                    found = true;
                }

                if (found) {
                    break;
                }

                id++;
            }

            if (!found) {
                ERROR(`Export model with code_name: ${code_name} not found`);
            }
        }

        return result;
    }

    async ResearchExport(id, code_name, query) {
        let result = undefined;

        let params = {
            start: Start(query),
            end: End(query),
            miners: Miners(query),
            offset: Offset(query),
            limit: Limit(query),
            country: Country(query),
        }

        if (id) {
            if (id >= 0 && id < this.models.length) {
                result = await this.models[id].ResearchExport(id.toString(), params);
            } else {
                ERROR(`Unable to export model with id: ${id}`);
            }
        } else if (code_name) {
            let found = false;
            id = 0;
            for (const model of this.models) {
                if (model.CodeName() === code_name) {
                    result = await model.ResearchExport(id.toString(), params);
                    found = true;
                }

                if (found) {
                    break;
                }

                id++;
            }

            if (!found) {
                ERROR(`ResearchExport model with code_name: ${code_name} not found`);
            }
        }

        return result;
    }

    async ExportHeader(id, code_name, query) {
        let result = undefined;

        let params = {
            start: Start(query),
            end: End(query),
            miners: Miners(query),
            filter: Filter(query),
            country: Country(query),
        }

        if (id) {
            if (id >= 0 && id < this.models.length) {
                result = await this.models[id].ExportHeader(id.toString(), params);
            } else {
                ERROR(`ExportHeader unable to find model with id: ${id}`);
            }
        } else if (code_name) {
            let found = false;
            id = 0;
            for (const model of this.models) {
                if (model.CodeName() === code_name) {
                    result = await model.ExportHeader(id.toString(), params);
                    found = true;
                }

                if (found) {
                    break;
                }

                id++;
            }

            if (!found) {
                ERROR(`ExportHeader model with code_name: ${code_name} not found`);
            }
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
