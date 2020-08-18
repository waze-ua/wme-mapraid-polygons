// ==UserScript==
// @name         WME MapRaid Polygons
// @namespace    waze-ua
// @version      2020.08.17.001
// @description  Retrieves polygons from spreadsheet and display as borders on a map
// @author       madnut
// @include      https://*waze.com/*editor*
// @exclude      https://*waze.com/*user/editor*
// @connect      google.com
// @connect      script.googleusercontent.com
// @grant        GM_xmlhttpRequest
// @require      https://greasyfork.org/scripts/389117-apihelper/code/APIHelper.js
// @require      https://greasyfork.org/scripts/389577-apihelperui/code/APIHelperUI.js
// @require      https://greasyfork.org/scripts/389765-common-utils/code/CommonUtils.js
// @updateURL    https://github.com/waze-ua/wme-mapraid-polygons/raw/master/wme-mapraid-polygons.user.js
// @downloadURL  https://github.com/waze-ua/wme-mapraid-polygons/raw/master/wme-mapraid-polygons.user.js
// @supportURL   https://github.com/waze-ua/wme-mapraid-polygons/issues
// ==/UserScript==

/* jshint esversion: 6 */
/* global W */
/* global $ */
/* global I18n */
/* global OpenLayers */
/* global APIHelper */
/* global APIHelperUI */
/* global Settings */

(function () {
    'use strict';

    let tab, helper, bordersLayer, polygonsList;

    // Script name, used as unique identifier
    const NAME = 'MapRaid Polygons';

    const requestsTimeout = 10000; // in ms
    const requestHash = "AKfycbzxG8NJKkIUXaSIDGuSooG9dmNrQzHbgWMwx4kScv0b";

    // Translations
    const TRANSLATIONS = {
        'en': {
            title: NAME,
            polygons: 'Polygons list',
            settings: 'Settings',
            btnReload: 'Reload list',
            options: {
                showLayer: 'Show polygons layer',
                showPolygonName: 'Show polygon name',
                loadPolygonsOnStart: 'Load polygons on start',
                fillPolygons: 'Fill polygons with colors 🌈'
            }
        },
        'uk': {
            title: 'Полігони Мап-Рейду',
            polygons: 'Список полігонів',
            settings: 'Налаштування',
            btnReload: 'Перезавантажити список',
            options: {
                showLayer: 'Показувати шар з полігонами',
                showPolygonName: 'Показувати назву полігону',
                loadPolygonsOnStart: 'Завантажувати полігони при старті',
                fillPolygons: 'Заливати полігони кольором (красіво 🌈)'
            }
        },
        'ru': {
            title: 'Полигоны Мап-Рейда',
            polygons: 'Список полигонов',
            settings: 'Настройки',
            btnReload: 'Перезагрузить список',
            options: {
                showLayer: 'Показывать слой с полигонами',
                showPolygonName: 'Показывать название полигона',
                loadPolygonsOnStart: 'Загружать полигоны при старте',
                fillPolygons: 'Заливать полигоны цветом (красиво 🌈)'
            }
        }
    };

    const settings = {
        options: {
            showLayer: true,
            showPolygonName: true,
            loadPolygonsOnStart: true,
            fillPolygons: false
        }
    };

    Object.defineProperty(String.prototype, 'hashCode', {
        value: function () {
            var hash = 0, i, chr;
            for (i = 0; i < this.length; i++) {
                chr = this.charCodeAt(i);
                hash = ((hash << 5) - hash) + chr;
                hash |= 0; // Convert to 32bit integer
            }
            return hash;
        }
    });

    APIHelper.bootstrap();
    APIHelper.addTranslation(NAME, TRANSLATIONS);
    APIHelper.addStyle(
        '.mapraid-polygons legend { font-size: 14px; font-weight: bold; margin: 0px 0px 10px 0px; padding: 10px 0px 0px 0px; }'// +
    );

    let WMPSettings = new Settings(NAME, settings);

    const tabOptions = {
        showLayer: {
            title: I18n.t(NAME).options.showLayer,
            description: I18n.t(NAME).options.showLayer,
            callback: function (event) {
                WMPSettings.set(['options', 'showLayer'], event.target.checked);
                bordersLayer.setVisibility(event.target.checked);
                document.querySelector('#layer-switcher-item_mapraid_polygons').checked = event.target.checked;
            }
        },
        showPolygonName: {
            title: I18n.t(NAME).options.showPolygonName,
            description: I18n.t(NAME).options.showPolygonName,
            callback: function (event) {
                WMPSettings.set(['options', 'showPolygonName'], event.target.checked);
                drawBorders(polygonsList);
            }
        },
        loadPolygonsOnStart: {
            title: I18n.t(NAME).options.loadPolygonsOnStart,
            description: I18n.t(NAME).options.loadPolygonsOnStart,
            callback: function (event) {
                WMPSettings.set(['options', 'loadPolygonsOnStart'], event.target.checked);
            }
        },
        fillPolygons: {
            title: I18n.t(NAME).options.fillPolygons,
            description: I18n.t(NAME).options.fillPolygons,
            callback: function (event) {
                WMPSettings.set(['options', 'fillPolygons'], event.target.checked);
                drawBorders(polygonsList);
            }
        }
    };

    function log(message) {
        if (typeof message === 'string') {
            console.log(NAME + ': ' + message);
        } else {
            console.log(NAME + ': ', message);
        }
    }

    $(document)
        .on('init.apihelper', ready);

    $(window).on('beforeunload', () => WMPSettings.save());

    function ready() {
        addPolygonsLayer();
        addMenuSwitcher();
        addTab();
        if (WMPSettings.get('options', 'loadPolygonsOnStart')) {
            loadPolygons();
        }
    }

    function addPolygonsLayer() {
        bordersLayer = new OpenLayers.Layer.Vector(NAME, {
            displayInLayerSwitcher: true,
            uniqueName: "MapRaidPolygons",
            visibility: WMPSettings.get('options', 'showLayer')
        });
        W.map.addLayer(bordersLayer);
    }

    function addMenuSwitcher() {
        // add layer switcher to layers menu
        let $ul = $('.collapsible-GROUP_DISPLAY');
        let $li = document.createElement('li');
        let checkbox = document.createElement("wz-checkbox");
        checkbox.id = 'layer-switcher-item_mapraid_polygons';
        checkbox.type = 'checkbox';
        checkbox.className = "hydrated";
        checkbox.checked = bordersLayer.getVisibility();
        checkbox.appendChild(document.createTextNode(I18n.t(NAME).title));
        checkbox.onclick = function() {
            let newState = !bordersLayer.getVisibility();
            bordersLayer.setVisibility(newState);
            WMPSettings.set(['options', 'showLayer'], newState);
            document.querySelector('#mapraid-polygons-showLayer').checked = newState;
        };
        $li.append(checkbox);
        $ul.append($li);
    }

    function addTab() {
        helper = new APIHelperUI(NAME);
        tab = helper.createTab(I18n.t(NAME).title);
        tab.addText('txtVersion', 'v' + GM_info.script.version);
        tab.addButton('btnReload', I18n.t(NAME).btnReload, I18n.t(NAME).btnReload, function (event) {
            loadPolygons();
        });
        // Add container for polygons
        let fsPolygons = helper.createFieldset(I18n.t(NAME).polygons);
        tab.addElement(fsPolygons);

        // Add settings section
        let fsSettings = helper.createFieldset(I18n.t(NAME).settings);
        let options = WMPSettings.get('options');
        for (let item in options) {
            if (options.hasOwnProperty(item)) {
                fsSettings.addCheckbox(item, tabOptions[item].title, tabOptions[item].description, tabOptions[item].callback, WMPSettings.get('options', item));
            }
        }
        tab.addElement(fsSettings);

        tab.inject();
    }

    function populatePolygonsList(data) {
        let fsPolygons = helper.createFieldset(I18n.t(NAME).polygons);
        let oldFieldset = document.querySelector('fieldset.mapraid-polygons');
        let container = document.querySelector('#sidepanel-mapraid-polygons .button-toolbar');
        if (data) {
            data.forEach(function (item) {
                fsPolygons.addCheckbox(item.polygon.hashCode(), item.name, item.comments, function (event) {
                    let feature = bordersLayer.getFeatureByFid(event.target.name);
                    feature.style.display = event.target.checked ? '' : 'none';
                    bordersLayer.redraw();
                }, item.status == 'active');
            });
            let newFieldset = fsPolygons.toHTML();
            newFieldset.className = oldFieldset.className;
            container.replaceChild(newFieldset, oldFieldset);
            // colorize, separate loop for now
            data.forEach(function (item) {
                let chkLabel = document.querySelector('label[for="mapraid-polygons-' + item.polygon.hashCode() + '"]');
                chkLabel.style['background-color'] = item.color;
            });
        }
    }

    function drawBorders(data) {
        bordersLayer.destroyFeatures();
        if (data) {
            let parser = new OpenLayers.Format.WKT();
            parser.internalProjection = W.map.getProjectionObject();
            parser.externalProjection = new OpenLayers.Projection("EPSG:4326");

            data.forEach(function (item) {
                let feature = parser.read(item.polygon);

                if (feature) {
                    feature.fid = item.polygon.hashCode();
                    feature.style = new borderStyle(item.color, item.name, item.status == 'active' ? true : false);
                    bordersLayer.addFeatures(feature);
                }
            });
        }
    }

    function borderStyle(color, label, visible = true) {
        this.fill = WMPSettings.get('options', 'fillPolygons');
        this.fillColor = color; // #ee9900
        this.fillOpacity = 0.4;
        this.stroke = true;
        this.strokeColor = color;
        this.strokeOpacity = 1;
        this.strokeWidth = 3;
        this.strokeLinecap = "round"; // [butt | round | square]
        this.strokeDashstyle = "longdash"; // [dot | dash | dashdot | longdash | longdashdot | solid]
        this.label = WMPSettings.get('options', 'showPolygonName') ? label : null;
        this.labelOutlineColor = "black";
        this.labelOutlineWidth = 1;
        this.fontSize = 20;
        this.fontColor = color;
        this.fontOpacity = 1;
        this.fontWeight = "bold";
        this.display = visible ? '' : 'none';
    }

    function sendHTTPRequest(url, callback) {
        GM_xmlhttpRequest({
            url: url,
            method: 'GET',
            timeout: requestsTimeout,
            onload: function (res) {
                if (callback) {
                    callback(res);
                }
            },
            onreadystatechange: function (res) {
            },
            ontimeout: function (res) {
                alert(NAME + ": Sorry, request timeout!");
            },
            onerror: function (res) {
                alert(NAME + ": Sorry, request error!");
            }
        });
    }

    function validateHTTPResponse(res) {
        let result = false,
            displayError = true,
            errorMsg;
        if (res) {
            switch (res.status) {
                case 200:
                    displayError = false;
                    if (res.responseHeaders.match(/content-type: application\/json/i)) {
                        result = true;
                    } else if (res.responseHeaders.match(/content-type: text\/html/i)) {
                        displayHtmlPage(res);
                    }
                    break;
                default:
                    errorMsg = "Error: unsupported status code - " + res.status;
                    log(res.responseHeaders);
                    log(res.responseText);
                    break;
            }
        } else {
            errorMsg = "Error: Response is empty!";
        }

        if (displayError) {
            if (!errorMsg) {
                errorMsg = "Error processing request. Response: " + res.responseText;
            }
            alert(NAME + " " + errorMsg);
        }
        return result;
    }

    function displayHtmlPage(res) {
        if (res.responseText.match(/Authorization needed/) || res.responseText.match(/ServiceLogin/)) {
            alert(NAME + ":\n" +
                "Authorization is required for using this script. This is one time action.\n" +
                "Now you will be redirected to the authorization page, where you'll need to approve request.\n" +
                "After confirmation, please close the page and reload WME.");
        }
        let w = window.open();
        w.document.open();
        w.document.write(res.responseText);
        w.document.close();
        w.location = res.finalUrl;
    }

    function loadPolygons() {
        function requestCallback(res) {
            if (validateHTTPResponse(res)) {
                let out = JSON.parse(res.responseText);
                if (out.result == "success") {
                    polygonsList = out.data.polygons;
                    drawBorders(polygonsList);
                    populatePolygonsList(polygonsList);
                } else {
                    alert(NAME + ": Error getting polygons from spreadsheet!");
                }
            }
        }

        const url = 'https://script.google.com/macros/s/' + requestHash + '/exec?func=getAllPolygons';
        sendHTTPRequest(url, requestCallback);
    }
})();
