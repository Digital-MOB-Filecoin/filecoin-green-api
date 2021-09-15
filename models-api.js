
const { INFO, ERROR, WARNING } = require('./logs');
const { Models } = require('./models/models');

let models = new Models();

models.LoadModels();

function error_response(code, msg, res) {
    res.status(code).send(msg);
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

    if (!id) {
        ERROR(`GET[/models/model] Failed to get model, no id param provided`);
        error_response(402, 'Failed to get model, no id param provided', res);
        return;
    }

    try {
        var result = await models.Query(id, req.query)
        res.json(result);

    } catch (e) {
        ERROR(`GET[/models/model] error: ${e}`);
        error_response(401, 'Failed to get model', res);
    }
};

// GET
const Export = async function (req, res, next) {
    let id = req.query?.id;

    if (!id) {
        ERROR(`GET[/models/export] Failed to export model, no id param provided`);
        error_response(402, 'Failed to export model, no id param provided', res);
        return;
    }

    try {
        var result = await models.Export(id, req.query)
        res.json(result);

    } catch (e) {
        ERROR(`GET[/models/export] error: ${e}`);
        error_response(401, 'Failed to export model', res);
    }
};

module.exports = {
    List,
    Model,
    Export,
}