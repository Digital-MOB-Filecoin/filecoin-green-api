const config = require('./../config');
const { INFO, ERROR, WARNING } = require('./../logs');
const { format, endOfWeek, endOfMonth, endOfDay } = require('date-fns');

var implementsMethods = function(obj /*, method list as strings */){
    var i = 1, methodName;
    while((methodName = arguments[i++])){
        if(typeof obj[methodName] != 'function') {
            return false;
        }
    }
    return true;
}

function get_date_now() {
    var today = new Date();
    var date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
    return date;
}

function get_epoch(date) {
    return ((Date.parse(date) / 1000 - 1598281200) / 30);
}

function endOfTheDay(date) {
    return endOfDay(new Date(date));
}

function endOfTheWeek(date) {
    return endOfWeek(new Date(date), {weekStartsOn: 1});
}

function endOfTheMonth(date) {
    return endOfMonth(new Date(date));
}

function add_time_interval(start, end, filter, rows) {
    let result = [];

    if (!rows?.length) {
        return result;
    }

    INFO(`[TimeInterval] datapoints: ${rows.length}, start: ${start}, end: ${end}`);

    if (rows.length == 1) {
        let item = {...rows[0]};
        item.start_date = new Date(start);
        item.end_date = endOfTheDay(new Date(end));
        result.push(item);
    } else if (filter == 'week') {
        let start_item = {...rows[0]};

        INFO(`[TimeInterval] week startItemInitial: ${JSON.stringify(start_item)}`);
        start_item.start_date = new Date(start);
        start_item.end_date = endOfTheDay(endOfTheWeek(rows[0].start_date));

        INFO(`[TimeInterval] week startItem: ${JSON.stringify(start_item)}`);

        result.push(start_item);

        for (let i = 1; i < rows.length - 1; i++) {
            let item = {...rows[i]};
            item.end_date = endOfTheDay(endOfTheWeek(rows[i].start_date));

            result.push(item);
        }

        let end_item = {...rows[rows.length-1]};

        INFO(`[TimeInterval] week endItemInitial: ${JSON.stringify(end_item)}`);
        end_item.start_date = rows[rows.length-1].start_date;
        end_item.end_date = endOfTheDay(new Date(end));

        INFO(`[TimeInterval] week endItemInitial: ${JSON.stringify(end_item)}`);

        result.push(end_item);
    } else if (filter == 'month') {
        let start_item = {...rows[0]};
        INFO(`[TimeInterval] month startItemInitial: ${JSON.stringify(start_item)}`);
        start_item.start_date = new Date(start);
        start_item.end_date = endOfTheDay(endOfTheMonth(rows[0].start_date));

        INFO(`[TimeInterval] month startItem: ${JSON.stringify(start_item)}`);

        result.push(start_item);

        for (let i = 1; i < rows.length - 1; i++) {
            let item = {...rows[i]};
            item.end_date = endOfTheDay(endOfTheMonth(rows[i].start_date));

            result.push(item);
        }

        let end_item = {...rows[rows.length-1]};
        INFO(`[TimeInterval] month endItemInitial: ${JSON.stringify(end_item)}`);

        end_item.start_date = rows[rows.length-1].start_date;
        end_item.end_date = endOfTheDay(new Date(end));

        INFO(`[TimeInterval] month endItem: ${JSON.stringify(end_item)}`);

        result.push(end_item);
    } else {
        rows.forEach(item => {
            let updated_item = {...item}
            updated_item.end_date = endOfTheDay(item.start_date);
            result.push(updated_item);
        });
    }

    return result;
}

function ValidModel(obj) {
    return implementsMethods(obj, 'Name', 'CodeName', 'Category','Query', 'Export', 'Details', 'ResearchExport');
}

function Start(query) {
    let start = query?.start;

    if (!start) {
        start = '2020-08-25';
    }

    return start;
}

function End(query) {
    let end = query?.end;

    if (!end) {
        end = get_date_now();
    }
    
    return end;
}

function Offset(query) {
    let offset = query?.offset;

    if (!offset) {
        offset = 0;
    }

    return offset;
}

function Limit(query) {
    let limit = query?.limit;
    
    if (!limit) {
        limit = config.filgreen.limit;
    } else if (limit > config.filgreen.max_limit) {
        limit = config.filgreen.max_limit;
    }

    return limit;
}

function Filter(query) {
    let filter = 'day';
    
    if ((query?.filter == 'week') || (query?.filter == 'month')) {
        filter = query.filter;
    }

    return filter;
}

function Miners(query) {
    let result = undefined;
    let miners = [];
    
    if (query?.miners?.length > 0) {
        miners = query.miners.split(',');
    }

    if (miners.length > 0) {
        result = '(';
        for (const m of miners ) {
            result += `'${m}',` ;
        }
        result = result.substring(0, result.length-1) + ')';
    } else if (query?.miner) {
        result = `('${query.miner}')`;
    }

    return result;
}

function Country(query) {
    let country = undefined;
    
    if (query?.country) {
        country = query.country;
    }

    return country;
}

module.exports = {
    ValidModel,
    Start,
    End,
    Filter,
    Offset,
    Limit,
    Miners,
    Country,
    add_time_interval,
    get_epoch
}