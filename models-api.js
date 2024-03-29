
const { INFO, ERROR, WARNING } = require('./logs');
const { Models } = require('./models/models');
var mcache = require('memory-cache');

let models = new Models();

models.LoadModels();

function error_response(code, msg, res) {
    res.status(code).send(msg);
}

var Cache = (duration) => {
    return (req, res, next) => {
        let key = '__express__' + req.originalUrl || req.url
        let cachedBody = mcache.get(key)
        if (cachedBody) {
            res.send(cachedBody)
            return
        } else {
            res.sendResponse = res.send
            res.send = (body) => {
                mcache.put(key, body, duration * 1000);
                res.sendResponse(body)
            }
            next()
        }
    }
}

// GET
const List = async function (req, res, next) {
    try {
        var list = models.List();

        if (list.length > 0) {
            INFO(`GET[/models/list]: ${list.length}`);
            res.json(list);
        } else {
            ERROR(`GET[/models/list]: Failed to get models list, empty list`);
            error_response(402, 'Failed to get models list', res);
        }

    } catch (e) {
        ERROR(`GET[/models/list] error: ${e}`);
        error_response(401, 'Failed to get models list', res);
    }
};

// GET
const Model = async function (req, res, next) {
    let id = req.query?.id;
    let code_name = req.query?.code_name;

    if (!id && !code_name) {
        ERROR(`GET[/models/model] Failed to get model, no id or code_name param provided`);
        error_response(402, 'Failed to get model, no id or code_name param provided', res);
        return;
    }

    try {
        var result = await models.Query(id, code_name, req.query)
        res.json(result);

    } catch (e) {
        ERROR(`GET[/models/model] error: ${e}`);
        error_response(401, 'Failed to get model', res);
    }
};

// GET
const Export = async function (req, res, next) {
    let id = req.query?.id;
    let code_name = req.query?.code_name;

    if (!id && !code_name) {
        ERROR(`GET[/models/export] Failed to export model, no id or code_name param provided`);
        error_response(402, 'Failed to export model, no id or code_name param provided', res);
        return;
    }

    try {
        var result = await models.Export(id, code_name, req.query)
        res.json(result);

    } catch (e) {
        ERROR(`GET[/models/export] error: ${e}`);
        error_response(401, 'Failed to export model', res);
    }
};

// GET
const ExportHeader = async function (req, res, next) {
    let id = req.query?.id;
    let code_name = req.query?.code_name;

    if (!id && !code_name) {
        ERROR(`GET[/models/export/header] Failed to export model, no id or code_name param provided`);
        error_response(402, 'Failed to export model, no id or code_name param provided', res);
        return;
    }

    try {
        var result = await models.ExportHeader(id, code_name, req.query)
        res.json(result);

    } catch (e) {
        ERROR(`GET[/models/export/header] error: ${e}`);
        error_response(401, 'Failed to export model', res);
    }
};

// GET
const ResearchExport = async function (req, res, next) {
    let id = req.query?.id;
    let code_name = req.query?.code_name;

    if (!id && !code_name) {
        ERROR(`GET[/models/research_export] Failed to export model, no id or code_name param provided`);
        error_response(402, 'Failed to export model, no id or code_name param provided', res);
        return;
    }

    try {
        var result = await models.ResearchExport(id, code_name, req.query)
        res.json(result);

    } catch (e) {
        ERROR(`GET[/models/research_export] error: ${e}`);
        error_response(401, 'Failed to export model', res);
    }
};


module.exports = {
    List,
    Model,
    Export,
    ExportHeader,
    ResearchExport,
    Cache,
}
