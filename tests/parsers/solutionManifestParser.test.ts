import { describe, it, expect, vi, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { parseSolutionManifest } from '../../src/parsers/solutionManifestParser.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const SOLUTION = path.join(FIXTURES, 'solutions', 'ContosoDemo');

afterEach(() => vi.restoreAllMocks());

describe('parseSolutionManifest', () => {
  it('maps the manifest onto the IR', () => {
    expect(parseSolutionManifest(SOLUTION)).toEqual({
      uniqueName:  'ContosoDemo',
      displayName: 'Contoso Demo',
      version:     '1.2.3.4',
      isManaged:   false,
      publisher: {
        uniqueName:  'contosopublisher',
        displayName: 'Contoso Ltd',
        prefix:      'contoso',
      },
      tables: [],   // populated later by solutionParser, not here
    });
  });

  it('picks the English localised name over other languages', () => {
    // The fixture carries 1033 and 1036; language order in the XML must not decide this.
    expect(parseSolutionManifest(SOLUTION).displayName).toBe('Contoso Demo');
  });

  it('returns a minimal model, not a throw, when Solution.xml is absent', () => {
    // index.ts pre-flights this path and reports it properly; the parser's job is
    // only to avoid taking the rest of the pipeline down with it.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pad-manifest-'));

    try {
      expect(parseSolutionManifest(empty)).toEqual({
        uniqueName:  'Unknown',
        displayName: 'Unknown',
        version:     '0.0.0.0',
        isManaged:   false,
        publisher: { uniqueName: 'Unknown', displayName: 'Unknown', prefix: '' },
        tables: [],
      });
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('throws on XML that parses but carries no SolutionManifest', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pad-manifest-'));
    fs.mkdirSync(path.join(dir, 'Other'));
    fs.writeFileSync(path.join(dir, 'Other', 'Solution.xml'), '<ImportExportXml />');

    try {
      expect(() => parseSolutionManifest(dir)).toThrow(/no SolutionManifest/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
