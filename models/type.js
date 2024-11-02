var CATEGORY  = {
    CAPACITY  : 'capacity',
    ENERGY     : 'energy',
    EMISSIONS  : 'emissions',
    MINER_EMISSIONS : 'How clean is this node relative to the rest of the network?',
    MINER_CONFIDENCE : 'confidence',
    // DEPRECATED : 'deprecated'
};

var DATA_TYPE  = {
    TIME  : 'time',
    GiB     : 'GiB',
    kWh     : 'kWh',
    kW     : 'kW',
    PERCENTAGE : 'percentage',
    MW_per_EiB : 'MW_per_EiB',
    co2 : 'co2',
    score0To1: 'score0To1',
};

var COLOR = {
    green : 'green',
    orange : 'orange',
    silver : 'silver'
}

var VERSION  = {
    v0  : 0
};

module.exports = {
    CATEGORY,
    DATA_TYPE,
    VERSION,
    COLOR
}
