import _ from "lodash";

export class GenericDatasource {

    constructor(instanceSettings, $q, backendSrv, templateSrv) {
        this.type = instanceSettings.type;
        this.url = instanceSettings.url + "/kapacitor/v1/tasks";
        this.name = instanceSettings.name;
        this.q = $q;
        this.backendSrv = backendSrv;
        this.templateSrv = templateSrv;
        this.withCredentials = instanceSettings.withCredentials;
        this.headers = {'Content-Type': 'application/json'};
        if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
            this.headers['Authorization'] = instanceSettings.basicAuth;
        }
        this.lodashLocal = require("lodash");
    }

    query(options) {
        var lodashLocal = require("lodash");
        var query = this.buildQueryParameters(options);
        query.targets = query.targets.filter(t => !t.hide);

        if (query.targets.length <= 0) {
            return this.q.when({data: []});
        }

        if (this.templateSrv.getAdhocFilters) {
            query.adhocFilters = this.templateSrv.getAdhocFilters(this.name);
        } else {
            query.adhocFilters = [];
        }

        console.log("query api called");
        console.log("The query data: " + JSON.stringify(query));

        return this.doRequest({
            url: this.url,
            method: 'GET'
        }).then(function (queryResult) {

            console.log(JSON.stringify(queryResult));

            if (queryResult == undefined || queryResult.data == undefined || queryResult.data.tasks == undefined) {
                return {data: []};
            }

            var stringToBeSearched = ""
            if (query != undefined && query.targets != undefined && query.targets[0] != undefined && query.targets[0].target != undefined) {
                stringToBeSearched = lodashLocal.lowerCase(query.targets[0].target);
            }


            var tasks = queryResult.data.tasks;

            console.log("The task data: " + JSON.stringify(tasks));

            var columns = [
                {"text": "S.No", "type": "number"},
                {"text": "created", "type": "time"},
                {"text": "dbrps", "type": "string"},
                {"text": "id", "type": "string"},
                {"text": "last-enabled", "type": "time"},
                {"text": "modified", "type": "time"},
                {"text": "status", "type": "string"},
                {"text": "type", "type": "string"},
                {"text": "script", "type": "string"},
            ];

            var rows = [];

            var snum = 1;
            for (var i = 0; i < tasks.length; i++) {
                var task = tasks[i];

                var toBeUsed = false;
                if (lodashLocal.startsWith(lodashLocal.lowerCase(task.id), stringToBeSearched)) {
                    toBeUsed = true;
                }

                var dbNames = "";

                if (!toBeUsed) {
                    var dbs = task.dbrps;

                    for (var j = 0; j < lodashLocal.size(dbs); j++) {
                        if (lodashLocal.startsWith(lodashLocal.lowerCase(dbs[j].db), stringToBeSearched)) {
                            toBeUsed = true;
                        }

                        dbNames += dbs[j].db + "." + dbs[j].rp + ", ";
                    }
                }

                if (toBeUsed) {
                    var row = []
                    row.push(snum);
                    row.push(task.created);
                    row.push(dbNames);
                    row.push(task.id);
                    row.push(task["last-enabled"]);
                    row.push(task.modified);
                    row.push(task.status);
                    row.push(task.type);
                    row.push(task.script);
                    rows.push(row);

                    snum++;
                }
            }

            var tableElement = {};

            tableElement["columns"] = columns;
            tableElement["rows"] = rows;
            tableElement["type"] = "table";

            var tableElements = [];
            tableElements.push(tableElement);

            console.log(tableElements)
            return {data: tableElements};
        });
    }

    testDatasource() {
        return this.doRequest({
            url: this.url,
            method: 'GET'
        }).then(function (response) {
            if (response.status === 200) {
                return {status: "success", message: "Kapacitor is reachable", title: "Success"};
            }
        });
    }

    annotationQuery(options) {
        var query = this.templateSrv.replace(options.annotation.query, {}, 'glob');
        var annotationQuery = {
            range: options.range,
            annotation: {
                name: options.annotation.name,
                datasource: options.annotation.datasource,
                enable: options.annotation.enable,
                iconColor: options.annotation.iconColor,
                query: query
            },
            rangeRaw: options.rangeRaw
        };

        var annotationResult = [];

        var today = new Date();
        var date = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate();
        var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
        var dateTime = date + ' ' + time;

        var annotationElement = {
            "annotation": "Paytm Alert Manager",
            "time": dateTime,
            "title": "Vertical Alerts List"
        };

        annotationResult.push(annotationElement);
        return annotationResult;

    }

    metricFindQuery(query) {
        var interpolated = {
            target: this.templateSrv.replace(query, null, 'regex')
        };

        return this.doRequest({
            url: this.url,
            method: 'GET'
        }).then(this.mapToTextValue);
    }

    mapToTextValue(result) {
        var lodashLocal = require("lodash");
        console.log(result)

        if (result == undefined || result.data == undefined || result.data.tasks == undefined) {
            return {data: {}}
        }

        var tasks = result.data.tasks;
        var verticalNames = [];

        for (var i = 0; i < lodashLocal.size(tasks); i++) {
            var task = tasks[i];
            var words = task.id.split("_");
            var firstWord = lodashLocal.lowerCase(words[0]);

            if (lodashLocal.startsWith(firstWord, "chronograf")) {
                var dbs = task.dbrps;

                if (dbs != undefined && lodashLocal.size(dbs) > 0) {

                    for (var j = 0; j < lodashLocal.size(dbs); j++) {
                        verticalNames.push(lodashLocal.lowerCase(dbs[j].db));
                    }
                }

            } else {
                verticalNames.push(lodashLocal.lowerCase(words[0]));
            }
        }

        verticalNames = lodashLocal.uniq(verticalNames);

        return lodashLocal.map(verticalNames, function (d, i) {
            return {text: d, value: d};
        });

    }

    doRequest(options) {
        options.withCredentials = this.withCredentials;
        options.headers = this.headers;

        return this.backendSrv.datasourceRequest(options);
    }

    buildQueryParameters(options) {
        options.targets = _.filter(options.targets, target => {
            return target.target !== 'select metric';
        });

        var targets = _.map(options.targets, target => {
            return {
                target: this.templateSrv.replace(target.target, options.scopedVars, 'regex'),
                refId: target.refId,
                hide: target.hide,
                type: target.type || 'timeserie'
            };
        });

        options.targets = targets;

        return options;
    }

    getTagKeys(options) {
        var tagKeys = [
            {"text": "created", "type": "time"},
            {"text": "dbrps", "type": "string"},
            {"text": "id", "type": "string"},
            {"text": "last-enabled", "type": "time"},
            {"text": "modified", "type": "time"},
            {"text": "status", "type": "string"},
            {"text": "type", "type": "string"},
            {"text": "script", "type": "string"},
        ];

        return tagKeys;

    }

    getTagValues(options) {
        var lodashLocal = require("lodash");
        var allTasks = this.doRequest({
            url: this.url,
            method: 'GET',
        });

        var tagValues = [];

        if (allTasks == undefined || allTasks.data == undefined || allTasks.data.tasks == undefined || options == undefined || options.key == undefined) {
            return tagValues;
        }

        var keyToBeSearched = options.key;

        var tasks = result.data.tasks;

        for (var i = 0; i < lodashLocal.size(tasks); i++) {
            var task = tasks[i];
            var value = task[keyToBeSearched];
            tagValues.push(value);
        }

        return tagValues;
    }

}
