'use strict';

const getLogger = require('webpack-log');
const log = getLogger({ name: 'webpack-batman' });
var path = require('path');
var ExtractTextPlugin = require('sgmf-scripts')['extract-text-webpack-plugin'];
var sgmfScripts = require('sgmf-scripts');
log.info('path..........');
module.exports = [{
    mode: 'none',
    name: 'js',
    entry: sgmfScripts.createJsPath(),
    output: {
        path: path.resolve('./cartridges/plugin_newrelic_browser/cartridge/static'),
        filename: '[name].js'
    }
}];
