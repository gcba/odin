"use strict";

/**
 * DatasetController
 * @description :: Server-side logic for ...
 */

const actionUtil = require('sails/lib/hooks/blueprints/actionUtil');
const _ = require('lodash');
const Response = require('../services/ResponseBuilderService');
const RSS = require('rss');
const SkipperDisk = require('skipper-disk');
const slug = require('slug');

module.exports = {
    publish: function(req, res) {
        const pk = actionUtil.requirePk(req);
        return PublishService.publishModel(Dataset, pk, 'publishedStatus', res)
    },
    unpublish: function(req, res) {
        const pk = actionUtil.requirePk(req);
        return PublishService.publishModel(Dataset, pk, 'unpublishedStatus', res)
    },

    download: function(req, res) {
        const pk = actionUtil.requirePk(req);

        Dataset.findOne(pk).then(function(dataset) {

            var path = sails.config.odin.datasetZipFolder + '/' + slug(dataset.name, {
                lower: true
            }) + '.zip';

            var fileAdapter = SkipperDisk();

            res.set('Content-Type', 'application/zip');
            res.set('Content-Disposition', 'attachment; filename=' + dataset.name + '.zip');

            fileAdapter.read(path).on('error', function(err) {
                return res.serverError(err);
            }).pipe(res);
        })
    },
    feedRss: function(req, res) {
        var feedOptions = {
            title: 'Datasets',
            description: 'Feed de datasets',
            generator: 'ODIN',
            feed_url: sails.config.odin.baseUrl + '/datasets'
                // site_url: '',
                // image_url: '',
                // docs: '',
                // managingEditor: '',
                // webMaster: '',
                // copyright: '',
                // categories: '',
                // pubDate: '',
                // ttl: '',
                // hub: '',
                // custom_namespaces: '',
                // custom_elements: '',
        };
        var feed = new RSS(feedOptions);
        var builder = new Response.ResponseGET(req, res, false);

        // const modelName = pluralize(buiilder._model.adapter.identity);

        builder.getDataForFeedQuery().then(function(records) {
            _.forEach(records, function(record) {

                var itemOption = {
                    title: record.name,
                    description: record.description,
                    url: sails.config.odin.baseUrl + '/' + builder.modelName + '/' + record.id,
                    // guid: '',
                    // categories: '',
                    // author: '',
                    date: record.createdAt
                        // lat: '',
                        // long: '',
                        // custom_elements: '',
                        // enclosure: '',
                };

                feed.item(itemOption);
            });

            var xml = feed.xml();

            res.set({
                'Content-Type': 'application/rss+xml'
            });

            return res.send(xml);
        });
    }
};
