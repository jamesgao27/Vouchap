const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const originalResolveRequest = config.resolver.resolveRequest;
const webShimPath = path.resolve(__dirname, 'react-native-web-shim.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'react-native' || moduleName === 'react-native-web')) {
    return { type: 'sourceFile', filePath: webShimPath };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
