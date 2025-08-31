// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ensure .md files are treated as bundled assets
if (!config.resolver.assetExts.includes('md')) {
  config.resolver.assetExts.push('md');
}

// Just in case, make sure .md is NOT in sourceExts
config.resolver.sourceExts = config.resolver.sourceExts.filter(ext => ext !== 'md');

module.exports = config;
