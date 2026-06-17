// scripts/electron-tsx-fix.mjs
// Makes tsx/esm compatible with Electron 41 / Node.js 24.
//
// Electron registers custom hooks to handle electron:… native modules
// (format "electron", source=null).  When tsx intercepts the load
// chain it receives null source and re-emits it, which Node.js 24
// rejects with ERR_INVALID_RETURN_PROPERTY_VALUE.
//
// This fix sits *inside* tsx (registered first = innermost).  For
// electron: modules it catches the null-source error from the default
// loader, then short-circuits with a valid empty source while
// preserving the "electron" format that Electron's translator needs.
//
// Usage:
//   node --import ./scripts/electron-tsx-fix.mjs --import tsx/esm ...

import { registerHooks } from 'node:module';

function isNullSource(err) {
  return err?.code === 'ERR_INVALID_RETURN_PROPERTY_VALUE';
}

function isElectronUrl(url) {
  return (typeof url === 'string' ? url : (url?.href ?? '')).startsWith('electron:');
}

registerHooks({
  load(url, context, nextLoad) {
    if (!isElectronUrl(url)) return nextLoad(url, context);

    try {
      return nextLoad(url, context);
    } catch (err) {
      if (isNullSource(err)) {
        // Preserve the original format so Electron's translator runs,
        // but provide a valid non-null source string.
        return {
          format: context.format || 'electron',
          source: '',
          shortCircuit: true,
        };
      }
      throw err;
    }
  },
});
