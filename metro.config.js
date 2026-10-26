const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver?.resolveRequest;

config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (
      moduleName === 'react-native-web/dist/exports/AssetRegistry' ||
      moduleName === 'react-native-web/dist/cjs/exports/AssetRegistry'
    ) {
      return {
        filePath: require.resolve('react-native-web/dist/modules/AssetRegistry'),
        type: 'sourceFile',
      };
    }
    if (defaultResolveRequest) {
      return defaultResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
