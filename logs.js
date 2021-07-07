const timestamp = require('time-stamp');

function INFO(msg) {
    console.log(timestamp.utc('YYYY/MM/DD-HH:mm:ss:ms'), '\x1b[32m', '[ INFO ] ', '\x1b[0m', msg);
}

function ERROR(msg) {
    console.log(timestamp.utc('YYYY/MM/DD-HH:mm:ss:ms'), '\x1b[31m', '[ ERROR ] ', '\x1b[0m', msg);
}

function WARNING(msg) {
    console.log(timestamp.utc('YYYY/MM/DD-HH:mm:ss:ms'), '\x1b[33m', '[ WARNING ] ', '\x1b[0m', msg);
}

module.exports = {
    INFO,
    ERROR,
    WARNING
};