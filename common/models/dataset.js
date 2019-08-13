"use strict";

const kafka = require("kafka-node");

var config = require("../../server/config.local");
var p = require("../../package.json");
var utils = require("./utils");
var dsl = require("./dataset-lifecycle.json");
var ds = require("./dataset.json");
var dsr = require("./raw-dataset.json");
var dsd = require("./derived-dataset.json");
var own = require("./ownable.json");
const util = require('util')
// TODO Feature  Add delete functionality for dataset, which removes Dataset and all linked data:
// OrigDatablock and Datablock and DatasetAttachments

module.exports = function (Dataset) {
    var app = require("../../server/server");

    Dataset.appendToArrayField = function (id, fieldName, data, ctx, next) {
        const where = { pid: id };
        var $addToSet = {};
        // $each is necessary as data is an array of values
        // $addToSetis necessary to append to the field and not overwrite
        $addToSet[fieldName] = { $each: data };
        Dataset.update(where, { $addToSet });
        next();
    };

    Dataset.remoteMethod("appendToArrayField", {
        accepts: [{
                arg: "id",
                type: "string",
                required: true,
            },
            {
                arg: "fieldName",
                type: "string",
                required: true,
                description: "Name of field to append data to"
            },
            {
                arg: "data",
                type: "array",
                required: true,
                description: "An array of values to append"
            },
            {
                arg: 'options',
                type: 'object',
                http: {
                    source: 'context'
                }
            }
        ],
        http: {
            path: "/:id/appendToArrayField",
            verb: "post"
        },
        returns: {
            type: "Object",
            root: true
        },
        description: "updates a single record by appending data to the specified field"
    });

    Dataset.prototype.updateSize = function (id, sizeField, size, next) {
        // console.log("Updating size field:", id, sizeField, size)
        Dataset.findById(id, function (err, instance) {
            if (err) {
                return next(err);
            } else {
                // console.log("Before addition:",sizeField,instance[sizeField])
                var oldsize = 0;
                if (instance[sizeField]) {
                    oldsize = instance[sizeField];
                }
                instance[sizeField] = size + oldsize;
                // console.log("new size:",instance[sizeField])
                instance.save();
                return next();
            }
        });
    };

    Dataset.validatesUniquenessOf("pid");

    // put
    Dataset.beforeRemote("replaceOrCreate", function (ctx, instance, next) {
        // console.log("++++++++++++ PUT")
        utils.updateTimesToUTC(["creationTime"], ctx.args.data);
        utils.dropAutoGeneratedFields(ctx.args.data, next);
    });

    // patch
    Dataset.beforeRemote("patchOrCreate", function (ctx, instance, next) {
        // console.log("+++++++++++++++ PATCH")
        utils.updateTimesToUTC(["creationTime"], ctx.args.data);
        utils.dropAutoGeneratedFields(ctx.args.data, next);
    });

    // post
    Dataset.beforeRemote("create", function (ctx, unused, next) {
        // console.log("+++++++++++++++ POST")
        utils.updateTimesToUTC(["creationTime"], ctx.args.data);
        utils.dropAutoGeneratedFields(ctx.args.data, next);
    });

    function addDefaultPolicy(ownerGroup, accessGroups, ownerEmail, tapeRedundancy, ctx, next) {
        const Policy = app.models.Policy;

        Policy.findOne({
            where: {
                ownerGroup: ownerGroup
            }
        }, function (err, policyInstance) {

            if (err) {
                return next(err);
            }
            if (policyInstance) {
                return next();
            } else {
                console.log("Adding default policy")
                const Policy = app.models.Policy;
                var defaultPolicy = Object();
                defaultPolicy.ownerGroup = ownerGroup;
                defaultPolicy.accessGroups = accessGroups;
                if (config && !ownerEmail) {
                    defaultPolicy.manager = config.defaultManager;
                } else if (ownerEmail) {
                    defaultPolicy.manager = ownerEmail.split(",");
                } else {
                    defaultPolicy.manager = "";
                }
                if (tapeRedundancy) {
                    defaultPolicy.tapeRedundancy = tapeRedundancy;
                } else {
                    defaultPolicy.tapeRedundancy = "low"; // AV default low
                }
                defaultPolicy.autoArchive = false;
                defaultPolicy.autoArchiveDelay = 7;
                defaultPolicy.archiveEmailNotification = true;
                defaultPolicy.retrieveEmailNotification = true;
                defaultPolicy.archiveEmailsToBeNotified = [];
                defaultPolicy.retrieveEmailsToBeNotified = [];
                defaultPolicy.embargoPeriod = 3;
                Policy.create(defaultPolicy, ctx.options, function (err, instance) {
                    if (err) {
                        console.log("Error when creating default policy:", err);
                        return next(err);
                    }
                    utils.keepHistory(ctx, next)
                });
            }

        });

    }

    // required so that we can reference this function from other modules (policy)
    module.exports.addDefaultPolicy = addDefaultPolicy;

    // auto add pid
    Dataset.observe("before save", (ctx, next) => {
        // console.log("Inside before save, ctx.data",JSON.stringify(ctx.data,null,3))
        // console.log("Inside before save, ctx.instance",JSON.stringify(ctx.instance,null,3))
        // console.log("Inside before save, ctx.currentinstance",JSON.stringify(ctx.currentInstance,null,3))
        // prevent recursion on auto history creation
        if (ctx.data && ctx.data.history) {
            delete ctx.data.updatedAt;
            delete ctx.data.updatedBy;
            return next();
        }
        if (ctx.instance) {
            if (ctx.isNewInstance) {
                ctx.instance.pid = config.pidPrefix + "/" + ctx.instance.pid;
                console.log("      New pid:", ctx.instance.pid);
                /* fill default datasetlifecycle
                    warning: need to transfer datasetlifecycle to a normal object first,
                    otherwise key tests give wrong results due to some "wrapping" of 
                    the objects behind functions in loopback magic
                */
                var subblock = {};
                if (ctx.instance.datasetlifecycle) {
                    subblock = JSON.parse(JSON.stringify(ctx.instance.datasetlifecycle));
                } else {
                    ctx.instance.datasetlifecycle = {};
                }
                if (!("archivable" in subblock)) ctx.instance.datasetlifecycle.archivable = true;
                if (!("retrievable" in subblock)) ctx.instance.datasetlifecycle.retrievable = false;
                if (!("publishable" in subblock)) ctx.instance.datasetlifecycle.publishable = false;
                if (!("isOnCentralDisk" in subblock)) ctx.instance.datasetlifecycle.isOnCentralDisk = true;
                if (!("archiveStatusMessage" in subblock)) ctx.instance.datasetlifecycle.archiveStatusMessage = "datasetCreated";
                if (!("retrieveStatusMessage" in subblock)) ctx.instance.datasetlifecycle.retrieveStatusMessage = "";
                if (!("retrieveIntegrityCheck" in subblock)) ctx.instance.datasetlifecycle.retrieveIntegrityCheck = false;
                // auto fill retention and publishing time
                var now = new Date();
                if (!ctx.instance.datasetlifecycle.archiveRetentionTime) {
                    var retention = new Date(now.setFullYear(now.getFullYear() + config.policyRetentionShiftInYears));
                    ctx.instance.datasetlifecycle.archiveRetentionTime = retention.toISOString().substring(0, 10);
                }
                if (!ctx.instance.datasetlifecycle.dateOfPublishing) {
                    now = new Date(); // now was modified above
                    var pubDate = new Date(now.setFullYear(now.getFullYear() + config.policyPublicationShiftInYears));
                    ctx.instance.datasetlifecycle.dateOfPublishing = pubDate.toISOString().substring(0, 10);
                }
            } else {
                console.log("      Existing pid:", ctx.instance.pid);
            }
            ctx.instance.version = p.version;

            // sourceFolder handling
            if (ctx.instance.sourceFolder) {
                // remove trailing slashes
                ctx.instance.sourceFolder = ctx.instance.sourceFolder.replace(/\/$/, "");
                // autofill datasetName
                if (!ctx.instance.datasetName) {
                    var arr = ctx.instance.sourceFolder.split("/");
                    if (arr.length == 1) {
                        ctx.instance.datasetName = arr[0];
                    } else {
                        ctx.instance.datasetName = arr[arr.length - 2] + "/" + arr[arr.length - 1];
                    }
                }
            }

            // auto fill classification and add policy if missing

            var Policy = app.models.Policy;
            const filter = {
                where: {
                    ownerGroup: ctx.instance.ownerGroup
                }
            };
            Policy.findOne(filter, ctx.options, function (err, policyInstance) {
                if (err) {
                    var msg = "Error when looking for Policy of pgroup " + ctx.instance.ownerGroup + " " + err;
                    console.log(msg);
                    next(msg);
                } else if (policyInstance) {
                    if (!ctx.instance.classification) {
                        // Case 1: classification undefined but policy defined:, define classification via policy
                        var classification = "";
                        switch (policyInstance.tapeRedundancy) {
                            case "low":
                                classification = "IN=medium,AV=low,CO=low";
                                break;
                            case "medium":
                                classification = "IN=medium,AV=medium,CO=low";
                                break;
                            case "high":
                                classification = "IN=medium,AV=high,CO=low";
                                break;
                            default:
                                classification = "IN=medium,AV=low,CO=low";
                        }
                        ctx.instance.classification = classification;
                    }
                    // case 2: classification defined and policy defined: do nothing
                    utils.keepHistory(ctx, next);
                } else {
                    let tapeRedundancy = "low";
                    if (!ctx.instance.classification) {
                        // case 3: neither a policy nor a classification exist: define default classification and create default policy
                        ctx.instance.classification = "IN=medium,AV=low,CO=low";
                    } else {
                        // case 4: classification exists but no policy: create policy from classification
                        var classification = ctx.instance.classification;
                        if (classification.includes("AV=low")) {
                            tapeRedundancy = "low";
                        } else if (classification.includes("AV=medium")) {
                            tapeRedundancy = "medium";
                        } else if (classification.includes("AV=high")) {
                            tapeRedundancy = "high";
                        }
                    }
                    addDefaultPolicy(
                        ctx.instance.ownerGroup,
                        ctx.instance.accessGroups,
                        ctx.instance.ownerEmail,
                        tapeRedundancy,
                        ctx,
                        next
                    );
                }
            });
        } else {
            // update case
            utils.keepHistory(ctx, next);
        }
    });

    // clean up data connected to a dataset, e.g. if archiving failed
    // TODO can the additional findbyId calls be avoided ?

    Dataset.reset = function (id, options, next) {
        var Datablock = app.models.Datablock;
        Dataset.findById(id, options, function (err, l) {
            if (err) {
                next(err);
            } else {
                l.updateAttributes({
                        datasetlifecycle: {
                            archivable: true,
                            retrievable: false,
                            publishable: false,
                            archiveStatusMessage: "datasetCreated",
                            retrieveStatusMessage: "",
                            retrieveIntegrityCheck: false
                        },
                        packedSize: 0
                    },
                    options,
                    function (err, dsInstance) {
                        Datablock.destroyAll({
                                datasetId: id
                            },
                            options,
                            function (err, b) {
                                if (err) {
                                    next(err);
                                } else {
                                    next();
                                }
                            }
                        );
                    }
                );
            }
        });
    };

    function searchExpression(key, value) {
        let type = "string";
        if (key in ds.properties) {
            type = ds.properties[key].type;
        } else if (key in dsr.properties) {
            type = dsr.properties[key].type;
        } else if (key in dsd.properties) {
            type = dsd.properties[key].type;
        } else if (key in dsl.properties) {
            type = dsl.properties[key].type;
        } else if (key in own.properties) {
            type = own.properties[key].type;
        }
        if (key === "text") {
            return {
                $search: value,
                $language: "none"
            };
        } else if (type === "string") {
            if (value.constructor === Array) {
                if (value.length == 1) {
                    return value[0];
                } else {
                    return {
                        $in: value
                    };
                }
            } else {
                return value;
            }
        } else if (type === "date") {
            return {
                $gte: new Date(value.begin),
                $lte: new Date(value.end)
            };
        } else if (type === "boolean") {
            return {
                $eq: value
            };
        } else if (type.constructor === Array) {
            return {
                $in: value
            };
        }
    }

    Dataset.fullfacet = function (fields, facets = [], options, cb) {
        // keep the full aggregation pipeline definition
        let pipeline = [];
        let facetMatch = {};
        // add userGroups condition
        if (fields === undefined) {
            fields = {};
        }
        fields.userGroups = options.currentGroups;
        // console.log("++++++++++++ after filling fileds with usergroup:",fields)
        // construct match conditions from fields value, excluding facet material
        // i.e. fields is essentially split into match and facetMatch conditions
        // Since a match condition on usergroups is always prepended at the start
        // this effectively yields the intersection handling of the two sets (ownerGroup condition and userGroups)

        // first construct match conditions being applied before facet calculations

        // the fields array contains all the conditions which must be fulfilled

        // however all such conditions, which are treated as facets will be applied
        // only later within the different facet pipelines,
        // and therefore will be removed from the initial match conditions

        // the following fields must be part of the match clause
        // usergroup: limit to what the logged in user is allowed to see
        // text: fulltext search
        // mode: additional query expression

        Object.keys(fields).map(function (key) {
            // split in facet and non-facet conditions
            if (facets.indexOf(key) < 0) {
                if (key === "text") {
                    // unshift because text must be at start of array
                    pipeline.unshift({
                        $match: {
                            $or: [{
                                    $text: searchExpression(key, fields[key])
                                },
                                {
                                    sourceFolder: {
                                        $regex: fields[key],
                                        $options: "i"
                                    }
                                }
                            ]
                        }
                    });
                }
                // mode is not a field in dataset, just an object for containing a match clause
                else if (key === "mode") {
                    pipeline.push({
                        $match: fields[key]
                    });
                } else if (key === "userGroups") {
                    // no group conditions if global access role
                    if (fields["userGroups"].indexOf("globalaccess") < 0) {
                        pipeline.push({
                            $match: {
                                $or: [{
                                        ownerGroup: searchExpression("ownerGroup", fields["userGroups"])
                                    },
                                    {
                                        accessGroups: searchExpression("accessGroups", fields["userGroups"])
                                    }
                                ]
                            }
                        });
                    }
                } else {
                    let match = {};
                    match[key] = searchExpression(key, fields[key]);
                    pipeline.push({
                        $match: match
                    });
                }
            } else {
                facetMatch[key] = searchExpression(key, fields[key]);
            }
        });

        // append all facet pipelines
        let facetObject = {};
        facets.forEach(function (facet) {
            if (facet in ds.properties) {
                facetObject[facet] = utils.createNewFacetPipeline(facet, ds.properties[facet].type, facetMatch);
            } else if (facet in dsr.properties) {
                facetObject[facet] = utils.createNewFacetPipeline(facet, dsr.properties[facet].type, facetMatch);
            } else if (facet in dsd.properties) {
                facetObject[facet] = utils.createNewFacetPipeline(facet, dsd.properties[facet].type, facetMatch);
            } else if (facet in own.properties) {
                facetObject[facet] = utils.createNewFacetPipeline(facet, own.properties[facet].type, facetMatch);
            } else if (facet.startsWith("datasetlifecycle.")) {
                let lifcycleFacet = facet.split(".")[1];
                if (lifcycleFacet in dsl.properties) {
                    facetObject[lifcycleFacet] = utils.createNewFacetPipeline(
                        lifcycleFacet,
                        dsl.properties[lifcycleFacet].type,
                        facetMatch
                    );
                }
            } else {
                console.log("Warning: Facet not part of any dataset model:", facet);
            }
        });
        // add pipeline to count all documents
        facetObject["all"] = [{
                $match: facetMatch
            },
            {
                $count: "totalSets"
            }
        ];

        pipeline.push({
            $facet: facetObject
        });
        // console.log("Resulting aggregate query in fullfacet method:", JSON.stringify(pipeline, null, 3));
        Dataset.getDataSource().connector.connect(function (err, db) {
            var collection = db.collection("Dataset");
            var res = collection.aggregate(pipeline, function (err, cursor) {
                cursor.toArray(function (err, res) {
                    if (err) {
                        console.log("Facet err handling:", err);
                    }
                    cb(err, res);
                });
            });
        });
    };

    /* returns filtered set of datasets. Options:
       filter condition consists of
       - ownerGroup (automatically applied on server side)
       - text search
       - mode search: arbitrary additional condition (e.g. for and/or combinations, adding scientific metadata)
       - list of fields which are treated as filter condition (name,type,value triple)
     - paging of results
    */
    Dataset.fullquery = function (fields, limits, options, cb) {
        // keep the full aggregation pipeline definition
        let pipeline = [];
        if (fields === undefined) {
            fields = {};
        }
        // console.log("Inside fullquery:options",options)
        fields.userGroups = options.currentGroups;
        // console.log("++++++++++++ fullquery: after filling fields with usergroup:",fields)
        // let matchJoin = {}
        // construct match conditions from fields value
        Object.keys(fields).map(function (key) {
            if (fields[key] && fields[key] !== "null") {
                if (key === "text") {
                    // unshift because text must be at start of array
                    pipeline.unshift({
                        $match: {
                            $or: [{
                                    $text: searchExpression(key, fields[key])
                                },
                                {
                                    sourceFolder: {
                                        $regex: fields[key],
                                        $options: "i"
                                    }
                                }
                            ]
                        }
                    });
                }
                // mode is not a field in dataset, just an object for containing a match clause
                else if (key === "mode") {
                    pipeline.push({
                        $match: fields[key]
                    });
                } else if (key === "userGroups") {
                    if (fields["userGroups"].indexOf("globalaccess") < 0) {
                        pipeline.push({
                            $match: {
                                $or: [{
                                        ownerGroup: searchExpression("ownerGroup", fields["userGroups"])
                                    },
                                    {
                                        accessGroups: searchExpression("accessGroups", fields["userGroups"])
                                    }
                                ]
                            }
                        });
                    }
                } else {
                    let match = {};
                    match[key] = searchExpression(key, fields[key]);
                    pipeline.push({
                        $match: match
                    });
                }
            }
        });

        // }
        // final paging section ===========================================================
        if (limits) {
            if ("order" in limits) {
                // input format: "creationTime:desc,creationLocation:asc"
                const sortExpr = {};
                const sortFields = limits.order.split(",");
                sortFields.map(function (sortField) {
                    const parts = sortField.split(":");
                    const dir = parts[1] == "desc" ? -1 : 1;
                    sortExpr[parts[0]] = dir;
                });
                pipeline.push({
                    $sort: sortExpr
                    // e.g. { $sort : { creationLocation : -1, creationLoation: 1 } }
                });
            }

            if ("skip" in limits) {
                pipeline.push({
                    $skip: Number(limits.skip) < 1 ? 0 : Number(limits.skip)
                });
            }
            if ("limit" in limits) {
                pipeline.push({
                    $limit: Number(limits.limit) < 1 ? 1 : Number(limits.limit)
                });
            }
        }
        // console.log("Resulting aggregate query in fullquery method:", JSON.stringify(pipeline, null, 3));

        Dataset.getDataSource().connector.connect(function (err, db) {
            var collection = db.collection("Dataset");
            var res = collection.aggregate(pipeline, function (err, cursor) {
                cursor.toArray(function (err, res) {
                    if (err) {
                        console.log("Facet err handling:", err);
                    }
                    // rename _id to pid
                    res.map(ds => {
                        Object.defineProperty(ds, "pid", Object.getOwnPropertyDescriptor(ds, "_id"));
                        delete ds["_id"];
                    });
                    cb(err, res);
                });
            });
        });
    };

    Dataset.anonymousquery = function (fields, limits, options, cb) {
        // keep the full aggregation pipeline definition
        let pipeline = [];
        if (fields === undefined) {
            fields = {};
        }
        // console.log("Inside fullquery:options",options)
        fields.isPublished = true;
        // console.log("++++++++++++ fullquery: after filling fields with usergroup:",fields)
        // let matchJoin = {}
        // construct match conditions from fields value
        Object.keys(fields).map(function (key) {
            if (fields[key] && fields[key] !== "null") {
                if (key === "text") {
                    // unshift because text must be at start of array
                    pipeline.unshift({
                        $match: {
                            $or: [{
                                    $text: searchExpression(key, fields[key])
                                },
                                {
                                    sourceFolder: {
                                        $regex: fields[key],
                                        $options: "i"
                                    }
                                }
                            ]
                        }
                    });
                }
                // mode is not a field in dataset, just an object for containing a match clause
                else if (key === "mode") {
                    pipeline.push({
                        $match: fields[key]
                    });
                } else if (key === "userGroups") {
                    if (fields["userGroups"].indexOf("globalaccess") < 0) {
                        pipeline.push({
                            $match: {
                                $or: [{
                                        ownerGroup: searchExpression("ownerGroup", fields["userGroups"])
                                    },
                                    {
                                        accessGroups: searchExpression("accessGroups", fields["userGroups"])
                                    }
                                ]
                            }
                        });
                    }
                } else {
                    let match = {};
                    match[key] = searchExpression(key, fields[key]);
                    pipeline.push({
                        $match: match
                    });
                }
            }
        });

        // }
        // final paging section ===========================================================
        if (limits) {
            if ("order" in limits) {
                // input format: "creationTime:desc,creationLocation:asc"
                const sortExpr = {};
                const sortFields = limits.order.split(",");
                sortFields.map(function (sortField) {
                    const parts = sortField.split(":");
                    const dir = parts[1] == "desc" ? -1 : 1;
                    sortExpr[parts[0]] = dir;
                });
                pipeline.push({
                    $sort: sortExpr
                    // e.g. { $sort : { creationLocation : -1, creationLoation: 1 } }
                });
            }

            if ("skip" in limits) {
                pipeline.push({
                    $skip: Number(limits.skip) < 1 ? 0 : Number(limits.skip)
                });
            }
            if ("limit" in limits) {
                pipeline.push({
                    $limit: Number(limits.limit) < 1 ? 1 : Number(limits.limit)
                });
            }
        }
        // console.log("Resulting aggregate query in fullquery method:", JSON.stringify(pipeline, null, 3));

        Dataset.getDataSource().connector.connect(function (err, db) {
            var collection = db.collection("Dataset");
            var res = collection.aggregate(pipeline, function (err, cursor) {
                cursor.toArray(function (err, res) {
                    if (err) {
                        console.log("Facet err handling:", err);
                    }
                    // rename _id to pid
                    res.map(ds => {
                        Object.defineProperty(ds, "pid", Object.getOwnPropertyDescriptor(ds, "_id"));
                        delete ds["_id"];
                    });
                    cb(err, res);
                });
            });
        });
    };

    Dataset.isValid = function (dataset, next) {
        var ds = new Dataset(dataset);
        ds.isValid(function (valid) {
            if (!valid) {
                next(null, {
                    errors: ds.errors,
                    valid: false
                });
            } else {
                next(null, {
                    valid: true
                });
            }
        });
    };

    Dataset.thumbnail = async function(id) {
        const Attachment = app.models.Attachment;
        const filter = {
            where: {
                datasetId: id
            }
        };
        return Attachment.findOne(filter).then(instance => {
            const base64string_example =
                "data:image/png;base64,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";
            let base64string2 = "";
            if (instance && instance.__data) {
                if (instance.__data.thumbnail === undefined) {} else {
                    base64string2 = instance.__data.thumbnail;
                }
            } else {
                base64string2 = base64string_example;
            }
            return base64string2;
        });
    };

    Dataset.remoteMethod("thumbnail", {
        accepts: [{
            arg: "id",
            type: "string",
            required: true
        }],
        http: {
            path: "/:id/thumbnail",
            verb: "get"
        },
        returns: {
            type: "string",
            root: true
        }
    });

    /**
     * Produces a Kafka message for Dataset reduction in OpenWhisk, then consumes the response
     * @param {Dataset} dataset The Dataset to send for reduction
     * @returns {Object} The response from the OpenWhisk reduce action
     */

    Dataset.reduceDataset = function (dataset) {
        if (config.datasetReductionEnabled) {
            const Producer = kafka.Producer;
            const Consumer = kafka.Consumer;

            const client = new kafka.KafkaClient({
                kafkaHost: config.reductionKafkaBroker
            });
            const producer = new Producer(client);
            const consumer = new Consumer(client, [{
                topic: config.reductionKafkaOutputTopic,
                partition: 0
            }]);

            const payloads = [{
                topic: config.reductionKafkaInputTopic,
                messages: JSON.stringify({
                    datasetPid: dataset.pid
                }),
                partition: 0
            }];

            return new Promise((resolve, reject) => {
                producer
                    .on("ready", () => {
                        producer.send(payloads, (err, data) => {
                            if (!err) {
                                console.log("Produce to Kafka `{ topic: { partition: offset } }`: ", data);
                            } else {
                                console.error(err);
                                return resolve(err);
                            }
                        });
                    })
                    .on("error", err => {
                        console.error(err);
                    });

                consumer
                    .on("message", message => {
                        return resolve(JSON.parse(message.value));
                    })
                    .on("error", err => {
                        console.error(err);
                        return resolve(err);
                    });
            }).catch(err => {
                console.error(err);
            });
        }
    };

    Dataset.remoteMethod("reduceDataset", {
        accepts: [{
            arg: "dataset",
            type: "Dataset",
            required: true,
            description: "The Dataset to send for reduction",
            http: {
                source: "body"
            }
        }],
        returns: [{
            arg: "reduceDataset",
            type: "object",
            root: true,
            description: "The response from the OpenWhisk reduce action"
        }],
        description: "Sends a post request for Dataset reduction to OpenWhisk",
        http: [{
            path: "/reduce",
            verb: "post"
        }]
    });
};
