const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// macOS: when Watchman hits FSEventStreamStart / FSEvents errors, Metro can crash.
// Node crawler avoids fb-watchman; set METRO_USE_WATCHMAN=1 to re-enable if Watchman is healthy.
if (process.env.METRO_USE_WATCHMAN !== '1') {
  config.resolver.useWatchman = false;
}

const projectRoot = __dirname;
const originalResolveRequest = config.resolver.resolveRequest;
const webShimPath = path.resolve(projectRoot, 'react-native-web-shim.js');
const rnwRoot = path.resolve(projectRoot, 'node_modules', 'react-native-web');

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
  // react-native-web 可能没有 dist/（依赖期望 dist/exports/*），映射到 src/exports/*（不依赖 platform，因 babel 改写后可能未传 web）
  if (moduleName.startsWith('react-native-web/dist/exports/')) {
    const sub = moduleName.slice('react-native-web/dist/exports/'.length);
    const base = path.join(rnwRoot, 'src', 'exports', sub);
    // 只返回文件路径，不返回目录（Metro 需要可计算 SHA 的文件）
    const toTry = [
      path.join(base, 'index.js'),
      path.join(base, 'index.ts'),
      base + '.js',
      base + '.ts',
      base,
    ];
    for (const p of toTry) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return { type: 'sourceFile', filePath: path.resolve(p) };
    }
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
