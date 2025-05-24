// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// some of Firebase’s packages ship .cjs files
config.resolver.sourceExts.push('cjs');

module.exports = config;