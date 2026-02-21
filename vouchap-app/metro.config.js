const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const projectRoot = __dirname;
const originalResolveRequest = config.resolver.resolveRequest;
const webShimPath = path.resolve(projectRoot, 'react-native-web-shim.js');

function resolveAlias(moduleName) {
  if (moduleName.startsWith('@/lib/')) {
    const sub = moduleName.slice('@/lib/'.length);
    const base = path.join(projectRoot, 'src', 'shared-logic', sub);
    const exts = ['', '.ts', '.tsx', '.js', '.jsx'];
    for (const ext of exts) {
      const p = base + ext;
      if (fs.existsSync(p)) return path.resolve(p);
    }
    return path.resolve(base);
  }
  if (moduleName.startsWith('@/components/')) {
    const sub = moduleName.slice('@/components/'.length);
    const base = path.join(projectRoot, 'src', 'mobile-ui', 'components', sub);
    const exts = ['', '.ts', '.tsx', '.js', '.jsx'];
    for (const ext of exts) {
      const p = base + ext;
      if (fs.existsSync(p)) return path.resolve(p);
    }
    return path.resolve(base);
  }
  if (moduleName === '@/types' || moduleName.startsWith('@/types/')) {
    const sub = moduleName === '@/types' ? 'index' : moduleName.slice('@/types/'.length);
    const basePath = path.join(projectRoot, 'src', 'shared-logic', 'types', sub);
    const exts = ['.ts', '.tsx', '.js', '.jsx', ''];
    for (const ext of exts) {
      const p = basePath + (ext || '');
      if (fs.existsSync(p)) return path.resolve(p);
    }
    return path.resolve(basePath);
  }
  return null;
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && (moduleName === 'react-native' || moduleName === 'react-native-web')) {
    return { type: 'sourceFile', filePath: webShimPath };
  }
  const aliasPath = resolveAlias(moduleName);
  if (aliasPath) {
    return { type: 'sourceFile', filePath: aliasPath };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
