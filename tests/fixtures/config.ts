// tests/fixtures/config.ts
//
// A DocGenConfig factory for tests.
//
// This deliberately builds on the real CONFIG_DEFAULTS rather than duplicating a
// config literal: a hand-rolled copy would silently drift the moment someone adds
// a field to the schema, and the tests would then be asserting against a config
// shape no real run ever produces.

import { CONFIG_DEFAULTS } from '../../src/config/index.js';
import type { DocGenConfig } from '../../src/config/index.js';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K]
    : T[K] extends object ? DeepPartial<T[K]>
    : T[K];
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function deepMerge<T>(base: T, over: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(over as Record<string, unknown>)) {
    if (value === undefined) continue;
    const existing = out[key];
    out[key] = isPlainObject(value) && isPlainObject(existing)
      ? deepMerge(existing, value as DeepPartial<typeof existing>)
      : value;
  }
  return out as T;
}

/** A full, valid DocGenConfig — defaults unless a test overrides a specific field. */
export const aConfig = (over: DeepPartial<DocGenConfig> = {}): DocGenConfig =>
  deepMerge(structuredClone(CONFIG_DEFAULTS), over);
