"use strict";


/**
 * This is a class that builds a response. It takes in the metadata and data that should go in the response and
 * outputs a properly structured response body (as an object).
 *
 * Can be extended to support setting the response headers and returning the whole response object instead of just the
 * body, thus turning it into a proper response builder (rather than a mere response body builder, like it is now).
 *
 * This class is not meant to be instantiated as is; it's an abstract class. A subclass should provide the missing inputs
 * and configurations needed for a specific use case (ie, a response to a GET request may be nothing like a response to a
 * DELETE request), in order to build an automatically customized response body. The subclass is the one that should be
 * made available for use, via the module.exports object.
 *
 * See also lodash documentation: https://lodash.com/docs
 *
 */
const pluralize = require('pluralize');
const _actionUtil = require('sails/lib/hooks/blueprints/actionUtil');

class ResponseBuilder {
    constructor(req, res) {
        this.req = req;
        this.res = res;

        // this.status;
        // this.headers = {};
        this.meta = {
            status: '',
            message: ''
        };
        this.data = [];
        this.links = {};
        this.error = {};

        this._emptyMeta = _.cloneDeep(this.meta);
        this._takeAlias = _.partial(_.map, _, item => item.alias);
        this._populateAlias = (model, alias) => model.populate(alias);

        this._addValue = function (value, target) {
            if (value && _.isArray(value) && typeof value[0] === 'string') { // Setter only
                if (!_.isPlainObject(target)) new Error('Target is not an object.');
                target[value[0]] = value[1];
            }
        }
    }

    /**
     * Builds the response body. The subclasses must provide the custom building blocks (meta, error/data, links).
     */
    build() {
        let body;
        let elements = {
            meta: this.meta,
            error: this.error,
            data: this.data,
            links: this.links
        };

        /**
         * Guard clauses
         */

        // if (!_.isInteger(this.status)) new Error('Status must be an integer.');
        // if (!_.isPlainObject(this.headers)) new Error('Headers is not an object.');
        if (!_.isPlainObject(this.meta)) new Error('Meta is not an object.');
        if (!_.isPlainObject(this.links)) new Error('Links is not an object.');
        if (_.isEqual(this.meta, _emptyMeta)) new Error('Meta is empty.');
        // if (_.isEmpty(this.links)) new Error('Links is empty.');

        // this.res.set(this.headers);

        /**
         * The actual body building
         */

        if (_.isEmpty(error)) {
            if (!_.isPlainObject(this.data) && !_.isArray(this.data)) new Error('Data is not an object or an array.');
            body = _.omit(elements, 'error');
        } else {
            if (!_.isPlainObject(this.error)) new Error('Error is not an object.');
            body = _.omit(elements, 'data');
        }
        ;

        return body;
    }

    /**
     * Getters/Setters
     */

    /*
     addHeader(value) {
     _addValue(value, this.headers);
     return this; // Allows chaining
     }
     */

    /**
     * Add one key/value pair to the meta object. To set the entire object at once, do it directly: builder.meta = meta
     */
    addMeta(value) {
        _addValue(value, this.meta);
        return this; // Allows chaining
    }

    /**
     * Add one key/value pair to the links object. To set the entire object at once, do it directly: builder.links = link
     */
    addLink(value) {
        _addValue(value, this.links);
        return this; // Allows chaining
    }
}


/**
 * A class that builds a response to a GET request. Subclasses ResponseBuilder, providing its own meta and links objects.
 * Data will be set externally (ie, builder.data = data) in the corresponding response file (ie, responses/ok.js).
 */

class ResponseGET extends ResponseBuilder {
    constructor(req, res, many) {
        super(req, res);

        var _query = '';

        const _model = _actionUtil.parseModel(this.req);
        const _fields = this.req.param('fields') ? this.req.param('fields').replace(/ /g, '').split(',') : [];
        const _populate = this.req.param('populate') ? this.req.param('populate').replace(/ /g, '').split(',') : [];
        this._many = many;

        // Don't forget to set 'many' in blueprints/find.js (ie, new Response.ResponseGET(req, res, true);

        if (this._many) {
            const _where = _actionUtil.parseCriteria(this.req);
            const _limit = _actionUtil.parseLimit(this.req);
            const _skip = this.req.param('page') * _limit || _actionUtil.parseSkip(this.req);
            const _sort = _actionUtil.parseSort(this.req);
            _query = _model.find(null, _fields.length > 0 ? {
                select: _fields
            } : null).where(_where).limit(_limit).skip(_skip).sort(_sort);


            this.meta = _.assign(this.meta, {
                // criteria: _where,
                limit: _limit,
                start: _skip,
                end: _skip + _limit,
                page: Math.floor(_skip / _limit)
            });

            //If no criteria
            if (JSON.stringify(_where) != '{}') {
                this.meta = _.assign(this.meta, {
                    criteria: _where
                });
            }
            //Delete the skip query parameter
            var requestQuery = req.query;
            delete requestQuery.skip;

            _model.count(requestQuery).exec(function count(err, cant) {
                    //    check if no parameters given
                    var params = (JSON.stringify(requestQuery) != '{}');
                    // If we have &skip or ?skip, we delete it from the url
                    var url = req.url.replace(/.skip=\d+/g, "");

                    var linkToModel = req.host + ':' + req.port + url + (params ? '&' : '?') + 'skip=';

                    this.links = {
                        next: (_skip + _limit < cant ? linkToModel + (_skip + _limit) : ''),
                        last: ( _skip - _limit > -1 ) ? linkToModel + _skip - _limit : '',
                    };
                }.bind(this)
            );
        } else {
            const _pk = _actionUtil.requirePk(this.req);
            const model = pluralize(_model.adapter.identity);
            _query = _model.find(_pk, _fields.length > 0 ? {
                select: _fields
            } : null);

            // TODO: Add links (just like meta was added) ---> then uncomment the empty links check in ResponseBuilder
            this.links = {
                all:  req.host + ':' + req.port + '/'+ model
            };
        }
        this.findQuery = _.reduce(_.intersection(_populate, this._takeAlias(_model.associations)), this._populateAlias, _query);

    }

    addData(value) {
        if (this._many) {
            if (_.isPlainObject(this.data)) this.data = [];
            else if (_.isArray(this.data)) this.data = _.concat(this.data, value);
            else new Error('Data is not an array. It should be, since many is true.');
        } else {
            if (_.isArray(this.data)) this.data = {};
            else if (_.isPlainObject(this.data)) _addValue(value, this.data);
            else new Error('Data is not an object. It should be, since many is false.');
        }

        return this; // Allows chaining
    }

}

class ResponsePOST extends ResponseBuilder {
    constructor(req, res) {
        super(req, res);

    }
}

class ResponsePATCH extends ResponseBuilder {
    constructor(req, res) {
        super(req, res);
    }
}

class ResponseDELETE extends ResponseBuilder {
    constructor(req, res) {
        super(req, res);
    }
}

class ResponseHEAD extends ResponseBuilder {
    constructor(req, res) {
        super(req, res);
    }
}

class ResponseOPTIONS extends ResponseBuilder {
    constructor(req, res) {
        super(req, res);
    }
}

module.exports = {
    ResponseGET,
    ResponsePOST,
    ResponsePATCH,
    ResponseDELETE,
    ResponseHEAD,
    ResponseOPTIONS
}
