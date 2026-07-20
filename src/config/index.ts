export type { DocGenConfig, WordThemeConfig } from './schema.js';
export { loadConfig, CONFIG_DEFAULTS, DEFAULT_CACHE_DIR, resolveCacheDir } from './loader.js';
export type { WikiConfig } from './schema.js';

// Keep these exports for any code that references them directly
// They will be removed in a future cleanup once all callers use DocGenConfig
export * from './defaults.js';
export * from './renderOptions.js';
