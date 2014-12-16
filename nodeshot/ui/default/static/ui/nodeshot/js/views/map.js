'use strict';

var MapLayoutView = Backbone.Marionette.LayoutView.extend({
    id: 'map-container',
    template: '#map-layout-template',

    regions: {
        map: '#map-js',
        legend: '#legend-js',
        panels: '#map-panels',
        toolbar: '#map-toolbar',
        addNode: '#add-node-container'
    },

    onShow: function () {
        this.map.show(new MapContentView({}, this));
        this.toolbar.show(new MapToolbarView({}, this));
        this.showPanels();
        this.showLegend();
    },

    showPanels: function () {
        var layers = new LayerCollection(),
            self = this;
        layers.fetch().done(function () {
            self.panels.show(new MapPanelsView({collection: layers}, self));
            Nodeshot.layers = layers;
            self.trigger('map.layersReady', layers);
        });
    },

    showLegend: function () {
        var legend = new LegendCollection(),
            self = this;
        legend.fetch().done(function () {
            self.legend.show(new MapLegendView({collection: legend}, self));
            Nodeshot.legend = legend;
            self.trigger('map.legendReady', legend);
        });
    },

    /*
     * resets to view initial state
     */
    reset: function () {
        this.map.currentView.closeLeafletPopup();
    }

}, {  // static methods

    /*
     * Resize page elements so that the leaflet map
     * takes most of the available space in the window
     */
    setMapDimensions: function () {
        var overlayContainer = $('#map-overlay-container'),
            height,
            selector,
            map_toolbar = $('#map-toolbar'),
            add_node_container = $('#add-node-container'),
            width = $(window).width(),
            map = Nodeshot.body.currentView.map.currentView.map;

        // map
        if (!overlayContainer.length) {
            height = $(window).height() - $('body > header').height();
            selector = '#map-container, #map-toolbar';
        }
        // node details
        else {
            height = overlayContainer.height() + parseInt(overlayContainer.css('top'), 10);
            selector = '#map-container';
        }
        $(selector).height(height);

        // take in consideration #add-node-container if visible
        if (add_node_container.is(':visible')) {
            width = width - add_node_container.outerWidth();
        }
        // take in consideration map toolbar if visible
        else if (map_toolbar.is(':visible')) {
            width = width - map_toolbar.outerWidth();
        }
        // set width
        $('#map').width(width);

        if (map && map.invalidateSize) {
            map.invalidateSize();
        }
    }
});

var MapContentView = Backbone.Marionette.ItemView.extend({
    template: false,

    initialize: function (model, parent) {
        this.parent = parent;
        this.leafletGroups = [];  // this will be filled in loadMapData
        // bind to namespaced events
        $(window).on('beforeunload.map', _.bind(this.beforeunload, this));
        $(window).on('resize.map', _.bind(this.resize, this));

        this.collection = new GeoCollection();
        // populate map as items are added to collection
        this.listenTo(this.collection, 'add', this.addGeoModelToMap, this);
        // remove items from map when models are removed
        this.listenTo(this.collection, 'remove', this.removeGeoModelFromMap, this);

        // load GeoJSON data when layers and legend are ready
        var loadMapData = _.after(2, this.loadMapData);
        this.listenToOnce(parent, 'map.layersReady', loadMapData);
        this.listenToOnce(parent, 'map.legendReady', loadMapData);

        //this.resetDataContainers();
        //Nodeshot.onNodeClose = '#/map';
    },

    onShow: function () {
        this.initMap();
    },

    onDestroy: function (e) {
        // store current coordinates when changing view
        this.storeCoordinates();
        // unbind the namespaced events
        $(window).off('beforeunload.map');
        $(window).off('resize.map');
    },

    beforeunload: function () {
        // store current coordinates before leaving the page
        this.storeCoordinates();
    },

    /*
     * get current map coordinates (lat, lng, zoom)
     */
    getCoordinates: function () {
        return {
            lat: this.map.getCenter().lat,
            lng: this.map.getCenter().lng,
            zoom: this.map.getZoom()
        };
    },

    /*
     * store current map coordinates in localStorage
     */
    storeCoordinates: function () {
        var coords = this.getCoordinates();
        Nodeshot.preferences.mapLat = coords.lat;
        Nodeshot.preferences.mapLng = coords.lng;
        Nodeshot.preferences.mapZoom = coords.zoom;
    },

    /*
     * get latest stored coordinates or default ones
     */
    rememberCoordinates: function () {
        return {
            lat: Nodeshot.preferences.mapLat || Nodeshot.MAP_CENTER[0],
            lng: Nodeshot.preferences.mapLng || Nodeshot.MAP_CENTER[1],
            zoom: Nodeshot.preferences.mapZoom || Nodeshot.MAP_ZOOM
        };
    },

    /*
     * resize window event
     */
    resize: function () {
        MapLayoutView.setMapDimensions();
        // when narrowing the window to medium-small size
        if ($(window).width() <= 767) {
            // if any side-panel remains open
            var panels = $('.side-panel:visible');
            if (panels.length) {
                // trigger click on header to close it
                $('body>header').trigger('click');
            }
        }
    },

    /*
     * initialize leaflet map
     */
    initMap: function () {
        var coords = this.rememberCoordinates();
        // unload map if already initialized
        if (typeof (this.map) !== 'undefined') {
            // store current coordinates
            this.storeCoordinates();
            // unload map
            this.map.remove();
            // clear any HTML in map container
            $('#map-js').html('');
        }

        MapLayoutView.setMapDimensions();

        // init map
        this.map = this.loadDjangoLeafletMap();
        // remember latest coordinates
        this.map.setView([coords.lat, coords.lng], coords.zoom, {
            trackResize: true
        });

        // clusterize
        //this.clusterizeMarkers();
    },

    /*
     * Overridden by custom django-leaflet template in
     * {UI}/templates/leaflet/_lefalet_map.html
     */
    loadDjangoLeafletMap: function () {},

    /*
     * loads data from API
     */
    loadMapData: function () {
        var self = this,
            layers = Nodeshot.layers.pluck('slug'),
            // trigger collection ready after all sources have been fetched
            collectionReady = _.after(layers.length, function () {
                self.trigger('collection:ready', self.collection);
                // unbind event
                self.off('collection:merged');
            });
        this.on('collection:merged', collectionReady);
        // fetch data from API
        _.each(layers, function (slug) {
            self.collection.merge({ slug: slug }).done(function () {
                // fire event to notify data has been merged
                self.trigger('collection:merged');
            });
        });
        // toggle legend group from map when visible attribute changes
        this.listenTo(Nodeshot.legend, 'change:visible', this.toggleLegendGroup);
        // toggle layer data when visible attribute changes
        this.listenTo(Nodeshot.layers, 'change:visible', this.toggleLayerData);
    },

    /*
     * show / hide from map items of a legend group
     */
    toggleLegendGroup: function (legend, visible) {
        var method,
            self = this,
            // retrieve leaflet layers
            leafletLayers = this.collection.whereCollection({
                legend: legend
            }).pluck('leaflet');
        // show or hide from map accordingly
        if (visible) {
            method = 'addLayer';
        }
        else {
            method = 'removeLayer';
        }
        leafletLayers.forEach(function (leafletLayer) {
            self.map[method](leafletLayer);
        });
    },

    /*
    * show / hide from map items of a legend group
    */
    toggleLayerData: function (layer, visible) {
        var geo = this.collection,
            self = this;
        if (visible === false) {
            geo.remove(geo.where({ layer: layer.id }));
            this.trigger('collection:ready', geo);
        }
        else{
            geo.merge({ slug: layer.id }).done(function () {
                self.trigger('collection:ready', geo);
            });
        }
    },

    /*
     * Load markers on map using GeoJSON
     */
    addGeoModelToMap: function (model) {
        var self = this,
            navigate = Nodeshot.router.navigate,
            popUpTemplate = _.template($('#map-popup-template').html()),
            leafletLayer = model.get('leaflet'),
            data = model.toJSON();
        // bind leaflet popup
        leafletLayer.bindPopup(popUpTemplate(data));
        // when popup opens, change the URL fragment
        leafletLayer.on('popupopen', function () {
            navigate('map/' + data.slug);
        });
        // when popup closes (and no new popup opens)
        // URL fragment goes back to initial state
        leafletLayer.on('popupclose', function () {
            setTimeout(function () {
                if (self.map._popup === null) {
                    navigate('map');
                }
            }, 200);
        });
        // show it on map only if legend item is visible
        if (model.get('legend').get('visible')) {
            this.map.addLayer(leafletLayer);
        }
    },

    removeGeoModelFromMap: function (model) {
        this.map.removeLayer(model.get('leaflet'));
    },

    /*
     * Open leaflet popup of the specified element
     */
    openLeafletPopup: function (id) {
        var collection = this.collection,
            self = this;
        // open leaflet pop up if ready
        if (collection.length && typeof collection !== 'undefined') {
            try {
                this.collection.get(id).get('leaflet').openPopup();
            } catch (e) {
                $.createModal({
                    message: id + ' not found',  // TODO: i18n
                    onClose: function () {
                        Nodeshot.router.navigate('map');
                    }
                });
            }
        }
        // if not ready wait for map.collectionReady and call again
        else {
            this.once('collection:ready', function () {
                self.openLeafletPopup(id);
            });
        }
    },

    /*
     * Close leaflet popup if open
     */
    closeLeafletPopup: function () {
        var popup = $('#map-js .leaflet-popup-close-button');
        if (popup.length) {
            popup.get(0).click();
        }
    }
});

var MapLegendView = Backbone.Marionette.ItemView.extend({
    id: 'map-legend',
    className: 'overlay inverse',
    template: '#map-legend-template',

    ui: {
        'close': 'a.icon-close'
    },

    events: {
        'click @ui.close': 'toggleLegend',
        'click li a': 'toggleGroup'
    },

    initialize: function (options, parent) {
        var mapView = parent.map.currentView;
        this.parent = parent;
        this.legendButton = parent.toolbar.currentView.ui.legendButton;
        // display count in legend when GeoCollection is ready
        this.listenTo(mapView, 'collection:ready', this.count);
        // automatically render when toggleing group or recounting
        this.listenTo(this.collection, 'change:visible counted', this.render);
    },

    onRender: function () {
        // default is true
        if (localStorage.getObject('legendOpen') === false) {
            this.$el.hide();
        } else {
            this.legendButton.addClass('disabled');
        }
    },

    /*
     * calculate counts
     */
    count: function (geocollection) {
        var self = this,
            count;
        _.each(this.collection.models, function (legend) {
            count = geocollection.where({ 'status': legend.get('slug') }).length;
            legend.set('count', count);
        });
        // trigger once all legend items have been counted
        this.collection.trigger('counted');
    },

    /*
     * open or close legend
     */
    toggleLegend: function (e) {
        e.preventDefault();

        var legend = this.$el,
            button = this.legendButton,
            open;

        if (legend.is(':visible')) {
            legend.fadeOut(255);
            button.removeClass('disabled');
            button.tooltip('enable');
            open = false;
        } else {
            legend.fadeIn(255);
            button.addClass('disabled');
            button.tooltip('disable').tooltip('hide');
            open = true;
        }

        localStorage.setItem('legendOpen', open);
    },

    /*
     * enable or disable something on the map
     * by clicking on its related legend control
     */
    toggleGroup: function (e) {
        e.preventDefault();
        var status = $(e.currentTarget).attr('data-status'),
            item = this.collection.get(status);
        item.set('visible', !item.get('visible'));
    }
});

var MapToolbarView = Backbone.Marionette.ItemView.extend({
    template: '#map-toolbar-template',

    ui: {
        'buttons': 'a',
        'switchMapMode': '#btn-map-mode',
        'legendButton': '#btn-legend',
        'toolsButton': 'a.icon-tools',
        'prefButton': 'a.icon-config',
        'layersControl': 'a.icon-layer-2'
    },

    events: {
        'click #map-toolbar .icon-pin-add': 'addNode',
        'click #map-toolbar .icon-search': 'removeAddressFoundMarker',
        'click @ui.buttons': 'togglePanel',
        'click @ui.switchMapMode': 'switchMapMode',
        // siblings events
        'click @ui.legendButton': 'toggleLegend'
    },

    initialize: function (model, parent) {
        this.parent = parent;
    },

    onRender: function () {
        var self = this;
        // init tooltip
        this.ui.buttons.tooltip();

        // correction for map tools
        this.ui.toolsButton.click(function (e) {
            var button = $(this),
                prefButton = self.ui.prefButton;
            if (button.hasClass('active')) {
                prefButton.tooltip('disable');
            } else {
                prefButton.tooltip('enable');
            }
        });

        // correction for map-filter
        this.ui.layersControl.click(function (e) {
            var button = $(this),
                otherButtons = self.$el.find('a.icon-config, a.icon-3d, a.icon-tools');
            if (button.hasClass('active')) {
                otherButtons.tooltip('disable');
            } else {
                otherButtons.tooltip('enable');
            }
        });
    },

    /*
     * show / hide map toolbar on narrow screens
     */
    toggleToolbar: function (e) {
        e.preventDefault();
        // shortcut
        var toolbar = this.parent.toolbar.$el,
            target = $(e.currentTarget);
        // show toolbar
        if (toolbar.is(':hidden')) {
            // just add display:block
            // which overrides css media-query
            toolbar.show();
            // overimpose on toolbar
            target.css('right', '-60px');
        }
        // hide toolbar
        else {
            // instead of using jQuery.hide() which would hide the toolbar also
            // if the user enlarged the screen, we clear the style attribute
            // which will cause the toolbar to be hidden only on narrow screens
            toolbar.attr('style', '');
            // close any open panel
            if ($('.side-panel:visible').length) {
                $('.mask').trigger('click');
            }
            // eliminate negative margin correction
            target.css('right', '0');
        }
        MapLayoutView.setMapDimensions();
    },

    /*
     * redirects to MapPanelsView
     */
    toggleLegend: function (e) {
        this.parent.legend.currentView.toggleLegend(e);
    },

    /*
     * redirects to MapPanelsView
     */
    togglePanel: function (e) {
        this.parent.panels.currentView.togglePanel(e);
    },

    /*
     * toggle 3D or 2D map
     */
    switchMapMode: function (e) {
        e.preventDefault();
        $.createModal({message: 'not implemented yet'});
    },

    // TODO
    addNode: function () {},
    // TODO
    removeAddressFoundMarker: function () {}
});

var MapPanelsView = Backbone.Marionette.ItemView.extend({
    template: '#map-panels-template',

    ui: {
        'switches': 'input.switch',
        'scrollers': '.scroller',
        'selects': '.selectpicker',
        'tools': '.tool'
    },

    events: {
        'submit #fn-search-address form': 'searchAddress',
        'click #fn-map-tools .tool': 'toggleTool',
        'click #toggle-toolbar': 'toggleToolbar',
        'switch-change #fn-map-layers .toggle-layer-data': 'toggleLayer'
    },

    initialize: function (model, parent) {
        this.parent = parent;
        this.mapView = parent.map.currentView;
        this.toolbarView = parent.toolbar.currentView;
        this.toolbarButtons = this.toolbarView.ui.buttons;
    },

    onRender: function () {
        this.ui.tools.tooltip();
        // activate switch
        this.ui.switches.bootstrapSwitch();
        this.ui.switches.bootstrapSwitch('setSizeClass', 'switch-small');
        // activate scroller
        this.ui.scrollers.scroller({
            trackMargin: 6
        });
        // fancy selects
        this.ui.selects.selectpicker({
            style: 'btn-special'
        });
    },

    /*
     * show / hide toolbar panels
     */
    togglePanel: function (e) {
        e.preventDefault();

        var button = $(e.currentTarget),
            panelId = button.attr('data-panel'),
            panel = $('#' + panelId),
            self = this,
            // determine distance from top
            distanceFromTop = button.offset().top - $('body > header').eq(0).outerHeight(),
            preferencesHeight;

        // if no panel return here
        if (!panel.length) {
            return;
        }

        // hide any open tooltip
        $('#map-toolbar .tooltip').hide();
        panel.css('top', distanceFromTop);

        // adjust height of panel if marked as 'adjust-height'
        if (panel.hasClass('adjust-height')) {
            preferencesHeight = $('#map-toolbar').height() - distanceFromTop - 18;
            panel.height(preferencesHeight);
        }

        panel.fadeIn(25, function () {
            panel.find('.scroller').scroller('reset');
            button.addClass('active');
            button.tooltip('hide').tooltip('disable');
            // create a mask for easy closing
            $.mask(panel, function (e) {
                // close function
                if (panel.is(':visible')) {
                    panel.hide();
                    self.toolbarButtons.removeClass('active');
                    button.tooltip('enable');
                    // if clicking again on the same button avoid reopening the panel
                    if ($(e.target).attr('data-panel') === panelId) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                }
            });
        });
    },

    /*
     * toggle map tool
     */
    toggleTool: function (e) {
        e.preventDefault();
        $.createModal({ message: 'not implemented yet' });
        return false;
        //var button = $(e.currentTarget),
        //    active_buttons = $('#fn-map-tools .tool.active');
        //// if activating a tool
        //if (!button.hasClass('active')) {
        //    // deactivate any other
        //    active_buttons.removeClass('active');
        //    active_buttons.tooltip('enable');
        //    button.addClass('active');
        //    button.tooltip('hide');
        //    button.tooltip('disable');
        //// deactivate
        //} else {
        //    button.removeClass('active');
        //    button.tooltip('enable');
        //}
    },

    /*
     * proxy to MapToolbarView.toggleToolbar
     */
    toggleToolbar: function (e) {
        this.toolbarView.toggleToolbar(e);
    },

    /*
     * search for an address
     * put a marker on the map and zoom in
     */
    searchAddress: function (e) {
        e.preventDefault();
        this.removeAddressMarker();
        var self = this,
            searchString = $('#fn-search-address input').val(),
            url = '//nominatim.openstreetmap.org/search?format=json&q=' + searchString;
        $.ajax({
            url: url,
            dataType: 'json',
            success: function (response) {
                // not found
                if (_.isEmpty(response)) {
                    $.createModal({ message: 'Address not found' });
                }
                // found
                else {
                    // only the first result returned from OSM is displayed on map
                    var firstPlaceFound = (response[0]),
                        lat = parseFloat(firstPlaceFound.lat),
                        lng = parseFloat(firstPlaceFound.lon),
                        latlng = L.latLng(lat, lng),
                        map = self.mapView.map;
                    // put marker on the map
                    self.addressMarker = L.marker(latlng);
                    self.addressMarker.addTo(map);
                    // go to marker and zoom in
                    map.setView(latlng, 17);
                    // bind for removal
                    $('#fn-search-address-mask').one('click', function () {
                        self.removeAddressMarker(1500);  // add a fadeOut
                    });
                }
            }
        });
    },

    /*
     * remove the marker added in searchAddress
     */
    removeAddressMarker: function (speed) {
        // remove istantly by default
        speed = speed || 0;
        var marker = this.addressMarker,
            self = this;
        if (typeof(marker) !== 'undefined') {
            $([marker._icon, marker._shadow]).fadeOut(speed, function () {
                self.mapView.map.removeLayer(marker);
                delete(self.addressMarker);
            });
        }
    },

    /**
     * Hide / show layer data on map
     */
    toggleLayer: function (item, data) {
        var layer = this.collection.get(data.el.attr('data-slug'));
        layer.set('visible', data.value);
    }
});

var MapView = Backbone.Marionette.ItemView.extend({
    id: 'map-container',
    template: '#map-template',

    ui: {
        'toolbar': '#map-toolbar',
        'toolbarButtons': '#map-toolbar a',
        'legendTogglers': '#btn-legend, #map-legend a.icon-close',
        'switchMapMode': '#btn-map-mode',
        'legend': '#map-legend',
        'legendButton': '#btn-legend',
        'addNodeStep1': '#add-node-step1',
        'addNodeStep2': '#add-node-step2',
        'addNodeContainer': '#add-node-container',
        'addNodeForm': '#add-node-form'
    },

    events: {
        'click #map-toolbar .icon-pin-add': 'addNode',
        'click #map-toolbar .icon-search': 'removeAddressFoundMarker',
        'submit #fn-search-address form': 'searchAddress',
        //'click @ui.toolbarButtons': 'togglePanel',
        //'click @ui.legendTogglers': 'toggleLegend',
        //'click #map-legend li a': 'toggleLegendControl',
        //'click #fn-map-tools .tool': 'toggleTool',
        //'click #toggle-toolbar': 'toggleToolbar',
        //'click @ui.switchMapMode': 'switchMapMode',
        'click #add-node-form .btn-default': 'closeAddNode',
        'submit #add-node-form': 'submitAddNode',
        'switch-change #fn-map-layers .toggle-layer-data': 'toggleLayerData'
    },

    initialize: function () {
        // bind to namespaced events
        //$(window).on('beforeunload.map', _.bind(this.beforeunload, this));
        //$(window).on('resize.map', _.bind(this.resize, this));

        this.resetDataContainers();
        Nodeshot.onNodeClose = '#/map';
    },

    onDomRefresh: function () {
        $('#breadcrumb').removeClass('visible-xs').hide();

        // init tooltip
        $('#map-toolbar a').tooltip();

        this.initMap();

        // activate switch
        $('#map-container input.switch').bootstrapSwitch();
        $('#map-container input.switch').bootstrapSwitch('setSizeClass', 'switch-small');

        // activate scroller
        $('#map-container .scroller').scroller({
            trackMargin: 6
        });

        // correction for map tools
        $('#map-toolbar a.icon-tools').click(function (e) {
            var button = $(this),
                preferences_button = $('#map-toolbar a.icon-config');
            if (button.hasClass('active')) {
                preferences_button.tooltip('disable');
            } else {
                preferences_button.tooltip('enable');
            }
        });

        // correction for map-filter
        $('#map-toolbar a.icon-layer-2').click(function (e) {
            var button = $(this),
                other_buttons = $('a.icon-config, a.icon-3d, a.icon-tools', '#map-toolbar');
            if (button.hasClass('active')) {
                other_buttons.tooltip('disable');
            } else {
                other_buttons.tooltip('enable');
            }
        });

        $('.selectpicker').selectpicker({
            style: 'btn-special'
        });

        // if only 1 layer available
        // preselect it in the add node form
        var layer_options = $('#id_layer option[value]');
        if (layer_options.length === 1) {
            var value = layer_options.eq(0).val();
            $('#id_layer').selectpicker('val', value);
        }
    },

    //onDestroy: function (e) {
    //    // show breadcrumb on mobile
    //    $('#breadcrumb').addClass('visible-xs').show();
    //
    //    // store current coordinates when changing view
    //    this.storeCoordinates();
    //
    //    // unbind the namespaced events
    //    $(window).off('beforeunload.map');
    //    $(window).off('resize.map');
    //},

    /* --- Nodeshot methods --- */

    /*
     * set width and height of map
     */
    //setMapDimensions: function () {
    //    if (!$('#map-overlay-container').length) {
    //        var height = $(window).height() - $('body > header').height();
    //        $('#map-container, #map-toolbar').height(height);
    //    } else {
    //        var height = $('#map-overlay-container').height() + parseInt($('#map-overlay-container').css('top'));
    //        $('#map-container').height(height);
    //    }
    //
    //    var map_toolbar = $('#map-toolbar'),
    //        add_node_container = $('#add-node-container');
    //    width = $(window).width();
    //
    //    // take in consideration #add-node-container if visible
    //    if (add_node_container.is(':visible')) {
    //        width = width - add_node_container.outerWidth();
    //    }
    //    // take in consideration map toolbar if visible
    //    else if (map_toolbar.is(':visible')) {
    //        width = width - map_toolbar.outerWidth();
    //    }
    //    $('#map').width(width);
    //
    //    var map = Nodeshot.body.currentView.map;
    //    if (map && map.invalidateSize) {
    //        map.invalidateSize();
    //    }
    //},

    // reset containers with pointers to markers and other map objects
    resetDataContainers: function () {
        Nodeshot.nodes = [];
        Nodeshot.nodesNamed = [];
        Nodeshot.clusters = [];
        _.each(Nodeshot.statuses, function (status) {
            status.nodes = [];
        });
    },

    //resize: function () {
    //    MapLayoutView.setMapDimensions();
    //
    //    // when narrowing the window to medium-small size
    //    if ($(window).width() <= 767) {
    //        // if any side-panel remains open
    //        var panels = $('.side-panel:visible');
    //        if (panels.length) {
    //            // trigger click on header to close it
    //            $('body>header').trigger('click');
    //        }
    //    }
    //},
    //
    //beforeunload: function () {
    //    // store current coordinates before leaving the page
    //    this.storeCoordinates();
    //},
    //
    ///*
    // * get current map coordinates (lat, lng, zoom)
    // */
    //getCoordinates: function () {
    //    return {
    //        lat: this.map.getCenter().lat,
    //        lng: this.map.getCenter().lng,
    //        zoom: this.map.getZoom()
    //    }
    //},
    //
    ///*
    // * store current map coordinates in localStorage
    // */
    //storeCoordinates: function () {
    //    var coords = this.getCoordinates()
    //    Nodeshot.preferences.mapLat = coords.lat;
    //    Nodeshot.preferences.mapLng = coords.lng;
    //    Nodeshot.preferences.mapZoom = coords.zoom;
    //},
    //
    ///*
    // * get latest stored coordinates or default ones
    // */
    //rememberCoordinates: function () {
    //    return {
    //        lat: Nodeshot.preferences.mapLat || Nodeshot.MAP_CENTER[0],
    //        lng: Nodeshot.preferences.mapLng || Nodeshot.MAP_CENTER[1],
    //        zoom: Nodeshot.preferences.mapZoom || Nodeshot.MAP_ZOOM
    //    }
    //},

    /*
     * add node procedure
     */
    addNode: function (e) {
        var self = this,
            reopenLegend = false,
            dialog = this.ui.addNodeStep1,
            dialog_dimensions = dialog.getHiddenDimensions();

        if (!Nodeshot.currentUser.get('username')) {
            $('#signin-modal').modal('show');
            return;
        }

        // hide legend
        if (this.ui.legend.is(':visible')) {
            $('#map-legend').hide();
        }

        // hide toolbar and enlarge map
        this.ui.toolbar.hide();
        MapLayoutView.setMapDimensions();
        this.toggleMarkersOpacity('fade');

        // show step1
        dialog.css({
            width: dialog_dimensions.width,
            right: 0
        });
        dialog.fadeIn(255);

        // cancel
        $('#add-node-step1 button').one('click', function (e) {
            self.closeAddNode();
        });

        // on map click (only once)
        this.map.once('click', function (e) {
            // drop marker on cliked point
            var marker = L.marker([e.latlng.lat, e.latlng.lng], {
                draggable: true
            }).addTo(self.map);
            self.newNodeMarker = marker;

            self.getAddress(e.latlng);

            self.newNodeMarker.on('dragend', function (event) {
                var marker = event.target,
                    result = marker.getLatLng();
                self.getAddress(result);
            });
            self.map.panTo(e.latlng);

            // hide step1
            dialog.hide();

            // show step2
            dialog = self.ui.addNodeStep2,
            dialog_dimensions = dialog.getHiddenDimensions();
            dialog.css({
                width: dialog_dimensions.width,
                right: 0
            });
            dialog.fadeIn(255);

            // bind cancel button once
            $('#add-node-step2 .btn-default').one('click', function (e) {
                self.closeAddNode();
            });

            // add new node there
            $('#add-node-step2 .btn-success').one('click', function (e) {
                dialog.fadeOut(255);
                self.ui.addNodeContainer.show().animate({
                    width: '+70%'
                }, {
                    duration: 400,
                    progress: function () {
                        self.setMapDimensions();
                        self.map.panTo(marker._latlng);
                    },
                    complete: function () {
                        self.setMapDimensions();
                        self.map.panTo(marker._latlng);
                    }
                });
            });
        });
    },

    /*
     * submit new node
     */
    submitAddNode: function (e) {
        e.preventDefault();

        var self = this,
            form = this.ui.addNodeForm;
        geojson = JSON.stringify(this.newNodeMarker.toGeoJSON().geometry),
        url = form.attr('action'),
        errorList = form.find('.error-list');

        form.find('.error-msg').text('').hide();
        form.find('.error').removeClass('error');
        errorList.html('').hide();

        $('#id_geometry').val(geojson);

        var data = form.serialize();

        // TODO: refactor this to use backbone and automatic validation
        $.post(url, data).done(function () {
            // TODO: fire custom event here
            $.createModal({
                message: 'new node added'
            });
            self.closeAddNode(function () {
                // show added node
                // TODO: improve ugly code
                Nodeshot.loadEssentialData();
                self.resetDataContainers();
                self.loadMapData();
                self.clusterizeMarkers();
            });
        }).error(function (http) {
            var json = http.responseJSON;

            for (key in json) {
                var input = $('#id_' + key);
                if (input.length) {
                    input.addClass('error');

                    if (input.selectpicker) {
                        input.selectpicker('setStyle');
                    }

                    var errorContainer = input.parent().find('.error-msg');

                    if (!errorContainer.length) {
                        errorContainer = input.parent().parent().find('.error-msg');
                    }

                    errorContainer.text(json[key]).fadeIn(255);
                } else {
                    errorList.show();
                    errorList.append('<li>' + json[key] + '</li>');
                }
            }
        });
    },

    /*
     * cancel addNode operation
     * resets normal map functions
     */
    closeAddNode: function (callback) {
        var marker = this.newNodeMarker;
        // unbind click event
        this.map.off('click');

        var self = this,
            container = this.ui.addNodeContainer;

        if (container.is(':visible')) {
            container.animate({
                width: '0'
            }, {
                duration: 400,
                progress: function () {
                    self.setMapDimensions();
                    if (marker) {
                        self.map.panTo(marker._latlng);
                    }
                },
                complete: function () {
                    if (marker) {
                        self.map.panTo(marker._latlng);
                    }
                    container.hide();
                    self.setMapDimensions();

                    if (callback && typeof (callback) === 'function') {
                        callback();
                    }
                }
            });
        }

        // reopen legend if necessary
        if (localStorage.getObject(legendOpen) && this.ui.legend.is(':hidden')) {
            this.ui.legend.show();
        }

        // show toolbar and adapt map width
        this.ui.toolbar.show();
        MapLayoutView.setMapDimensions();
        this.toggleMarkersOpacity();

        // hide step1 if necessary
        if (this.ui.addNodeStep1.is(':visible')) {
            this.ui.addNodeStep1.fadeOut(255);
        }

        // hide step2 if necessary
        if (this.ui.addNodeStep2.is(':visible')) {
            this.ui.addNodeStep2.fadeOut(255);
        }

        // remove marker if necessary
        if (marker) {
            this.map.removeLayer(marker);
        }

        MapLayoutView.setMapDimensions();
    },

    /*
     * partially fade out or reset markers from the map
     * used when adding a node
     */
    toggleMarkersOpacity: function (action) {
        var tmpOpacity = 0.3;

        // loop over nodes
        for (var i = 0, len = Nodeshot.nodes.length; i < len; i++) {
            var node = Nodeshot.nodes[i];

            if (action === 'fade') {
                node.options.opacity = tmpOpacity;
                node.options.fillOpacity = tmpOpacity;
                node.setStyle(node.options);
            } else {
                node.setStyle(node.defaultOptions);
            }
        }
    },

    /*
     * hide or show markers from map
     * TODO: this is cumbersome and needs semplification
     */
    toggleMarkers: function (action, status) {
        // local vars / shortcuts
        var functionName,
            cluster = Nodeshot.statuses[status].cluster,
            markers = Nodeshot.statuses[status].nodes,
            visibleStatuses = Nodeshot.preferences.visibleStatuses.split(',');

        // mark each marker visibility depending on visible layers
        _.forEach(markers, function (marker) {
            marker.visible = action === 'show';
        });

        if (action === 'show') {
            // add layer to map
            this.map.addLayer(cluster);
            // show
            this.showVisibleClusters();
            // remember choice
            if (visibleStatuses.indexOf(status) < 0) {
                visibleStatuses.push(status);
            }
        }
        else if (action === 'hide') {
            this.map.removeLayer(cluster);
            // remember choice
            var index = visibleStatuses.indexOf(status);
            if (index > -1) {
                visibleStatuses.splice(index, 1);
            }
        }

        // remember choice
        Nodeshot.preferences.visibleStatuses = visibleStatuses;
    },

    /*
     * Initialize Map
     */
    initMap: function (mode) {
        var button = this.ui.switchMapMode,
            legend = this.ui.legend,
            buttonTitle = button.attr('data-original-title'),
            preferences = Nodeshot.preferences;

        // unload map if already initialized
        if (typeof (this.map) !== 'undefined') {
            // store current coordinates
            this.storeCoordinates();
            // unload map
            this.map.remove();
            // clear any HTML in map container
            $('#map-js').html('');
        }

        MapLayoutView.setMapDimensions();

        // init map
        this.map = this.loadDjangoLeafletMap();
        // remember latest coordinates
        var coords = this.rememberCoordinates();
        this.map.setView([coords.lat, coords.lng], coords.zoom, {
            trackResize: true
        });

        if (preferences.legendOpen === false || preferences.legendOpen === 'false') {
            legend.hide();
        } else {
            this.ui.legendButton.addClass('disabled');
        }

        // load data
        this.loadMapData();
        this.clusterizeMarkers();
        this.rememberVisibleStatuses();
    },

    /*
     * Overridden by custom django-leaflet template in
     * {UI}/templates/leaflet/_lefalet_map.html
     */
    //loadDjangoLeafletMap: function () {},

    /*
     * Loads Map Content
     */
    //loadMapData: function () {
    //    var options = {
    //        fill: true,
    //        lineCap: 'circle',
    //        radius: 6,
    //        opacity: 1,
    //        fillOpacity: 0.7
    //    },
    //        popUpTemplate = _.template($('#map-popup-template').html()),
    //        preferences = Nodeshot.preferences;
    //
    //    // visible statuses
    //    preferences.visibleStatuses = preferences.visibleStatuses || _.keys(Nodeshot.statuses)
    //    // visible layers
    //    preferences.visibleLayers = preferences.visibleLayers || Nodeshot.layersSlugs;
    //
    //    // loop over each layer
    //    for (var i = 0; i < Nodeshot.layers.length; i++) {
    //        var layer = Nodeshot.layers[i],
    //            visibleStatuses = Nodeshot.preferences.visibleStatuses.split(','),
    //            visibleLayers = Nodeshot.preferences.visibleLayers.split(',');
    //
    //        var leafletLayer = L.geoJson(layer.nodes_geojson, {
    //            style: function (feature) {
    //                var status = Nodeshot.statuses[feature.properties.status];
    //                options.fillColor = status.fill_color;
    //                options.stroke = status.stroke_width > 0;
    //                options.weight = status.stroke_width;
    //                options.color = status.stroke_color;
    //                options.className = 'marker-' + status.slug;
    //                return options
    //            },
    //            onEachFeature: function (feature, layer) {
    //                // add slug in properties
    //                feature.properties.slug = feature.id;
    //                // bind leaflet popup
    //                layer.bindPopup(popUpTemplate(feature.properties));
    //            },
    //            pointToLayer: function (feature, latlng) {
    //                var marker = L.circleMarker(latlng, options);
    //
    //                // marks as visible or not depending on preferences
    //                if (visibleStatuses.indexOf(feature.properties.status) >= 0 && visibleLayers.indexOf(feature.properties.layer) >= 0) {
    //                    marker.visible = true;
    //                }
    //                else {
    //                    marker.visible = false;
    //                }
    //
    //                marker.on('click', function (e) {
    //                    Nodeshot.router.navigate('#/map/' + feature.id);
    //                });
    //
    //                Nodeshot.statuses[feature.properties.status].nodes.push(marker);
    //                Nodeshot.nodes.push(marker);
    //                Nodeshot.nodesNamed[feature.id] = marker;
    //                return marker
    //            }
    //        });
    //    }
    //    this.countVisibleNodesByStatus();
    //},

    clusterizeMarkers: function () {
        // loop over each status
        for (var key in Nodeshot.statuses) {

            var status = Nodeshot.statuses[key],
                // group marker in layerGroup
                leafletLayer = L.layerGroup(status.nodes);

            // TODO: this is ugly!
            $('head').append('\
                <style type=\'text/css\'>\
                .marker-' + key + ' {\
                    background-color:' + status.fill_color + ';\
                    color:' + status.text_color + ';\
                    border: ' + status.stroke_width + 'px solid ' + status.stroke_color + ';\
                }\
                </style>\
            ');

            // group markers in clusters
            var group = new L.MarkerClusterGroup({
                iconCreateFunction: function (cluster) {

                    var count = cluster.getChildCount(),
                        // determine size with the last number of the exponential notation
                        // 0 for < 10, 1 for < 100, 2 for < 1000 and so on
                        size = count.toExponential().split('+')[1];

                    return L.divIcon({
                        html: count,
                        className: 'cluster cluster-size-' + size + ' marker-' + this.cssClass
                    });
                },
                polygonOptions: {
                    fillColor: status.fill_color,
                    stroke: status.stroke_width > 0,
                    weight: status.stroke_width,
                    color: status.stroke_color
                },
                chunkedLoading: true,
                showCoverageOnHover: true,
                zoomToBoundsOnClick: true,
                removeOutsideVisibleBounds: true,
                // TODO: make these configurable
                disableClusteringAtZoom: 12,
                maxClusterRadius: 90,
                singleMarkerMode: true,
                // custom option
                cssClass: key
            });

            group.status = key;

            // store for future reference
            status.cluster = group;
            Nodeshot.clusters.push(group);

            // show visible markers
            this.showVisibleMarkers(group, status.nodes);

            // Adds cluster to map
            this.map.addLayer(group);
        }
    },

    showVisibleMarkers: function (cluster, markers) {
        for (var i = 0, len = markers.length; i < len; i++) {
            var marker = markers[i];
            if (marker.visible) {
                cluster.addLayer(marker);
            }
        }
    },

    showVisibleClusters: function () {
        var self = this;
        _.each(Nodeshot.clusters, function (cluster) {
            cluster.clearLayers();
            // show visible markers
            self.showVisibleMarkers(cluster, Nodeshot.statuses[cluster.status].nodes);
        });
        this.countVisibleNodesByStatus();
    },

    /*
     * show or hide markers of a layer
     */
    toggleLayerData: function (e, data) {
        var input = $(e.currentTarget),
            slug = input.attr('data-slug'),
            visibleLayers = Nodeshot.preferences.visibleLayers.split(','),
            visibleStatuses = Nodeshot.preferences.visibleStatuses.split(',');

        // loop over nodes
        for (var i = 0, len = Nodeshot.nodes.length; i < len; i++) {
            var node = Nodeshot.nodes[i];

            // show marker if layer corresponds and status is visible
            if (node.feature.properties.layer === slug && _.contains(visibleStatuses, node.feature.properties.status)) {
                // mark appropiately
                node.visible = data.value;
            }
        }

        this.showVisibleClusters();

        // remember choice
        if (data.value) {
            if (visibleLayers.indexOf(slug) < 0) {
                visibleLayers.push(slug);
            }
        }
        else {
            var index = visibleLayers.indexOf(slug);
            if (index > -1) {
                visibleLayers.splice(index, 1);
            }
        }
        Nodeshot.preferences.visibleLayers = visibleLayers;
    },

    /*
     * Get Address using OSM Nominatim service
     */
    getAddress: function (latlng) {
        var arrayLatLng = latlng.toString().split(',');
        var lat = arrayLatLng[0].slice(7);
        var lng = arrayLatLng[1].slice(0, -1);
        var url = '//nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=18&addressdetails=0';
        $.ajax({
            url: url,
            dataType: 'json',
            success: function (response) {
                var address = response.display_name;
                $('#id_address').val(address);
            }
        });
    },

    //searchAddress: function (e) {
    //    e.preventDefault();
    //    this.removeAddressFoundMarker()
    //    var self = this
    //    var searchString = $('#fn-search-address input').val()
    //    var url = '//nominatim.openstreetmap.org/search?format=json&q=' + searchString
    //    $.ajax({
    //        url: url,
    //        dataType: 'json',
    //        success: function (response) {
    //            if (_.isEmpty(response)) {
    //                $.createModal({
    //                    message: 'Address not found'
    //                });
    //            } else {
    //                var firstPlaceFound = (response[0]); // first place returned from OSM is displayed on map
    //                var lat = parseFloat(firstPlaceFound.lat);
    //                var lng = parseFloat(firstPlaceFound.lon);
    //                var latlng = L.latLng(lat, lng);
    //                self.addressFoundMarker = L.marker(latlng)
    //                self.addressFoundMarker.addTo(self.map);
    //                self.map.setView(latlng, 16);
    //            }
    //        }
    //    });
    //},
    //
    //removeAddressFoundMarker: function () {
    //    if (typeof (this.addressFoundMarker) != 'undefined') {
    //        this.map.removeLayer(this.addressFoundMarker)
    //    }
    //},

    /*
     * remember hide/show nodes based on status choices
     */
    rememberVisibleStatuses: function () {
        var visibleStatuses = Nodeshot.preferences.visibleStatuses.split(',');

        // find out which statuses have to be disabled in the legend
        // use underscore array difference
        toDisable = _.difference(_.keys(Nodeshot.statuses), visibleStatuses)

        // add disabled class
        toDisable.forEach(function (status) {
            $('#map-legend a[data-status='+status+']').parents('li').addClass('disabled');
        });
    },

    /*
     * count nodes of a certain status
     * TODO this logic should probably be a separate view or something can be managed separately
     */
    countVisibleNodesByStatus: function () {
        // reset visibleNodes counter
        for(key in Nodeshot.statuses) {
            Nodeshot.statuses[key].visibleNodes = []
        }
        // determine how many visible nodes
        for (var i=0; i<Nodeshot.nodes.length; i++) {
            var node = Nodeshot.nodes[i];
            if (node.visible) {
                Nodeshot.statuses[node.feature.properties.status].visibleNodes.push(node);
            }
        }
        // update UI ... very ugly
        for(key in Nodeshot.statuses) {
            $('#legend-status-' + key + ' .stats').text(Nodeshot.statuses[key].visibleNodes.length)
        }
    }
});
