import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseAllWebResources } from '../../src/parsers/webResourceParser.js';
import type { WebResourceModel, WebResourceFunction } from '../../src/ir/index.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

const resources = (): WebResourceModel[] => parseAllWebResources(SOLUTION);

const byName = (name: string): WebResourceModel =>
  resources().find(r => r.name === name)!;

const fn = (name: string): WebResourceFunction =>
  byName('contoso_/Scripts/contoso_widgetform.js').functions!.find(f => f.name === name)!;

describe('parseAllWebResources', () => {
  it('walks nested folders and picks up every .data.xml', () => {
    // pac unpack scatters resources into Scripts/, Styles/, Images/ … — a flat readdir
    // of WebResources/ would find nothing at all.
    expect(resources().map(r => r.name)).toEqual(
      expect.arrayContaining([
        'contoso_/Scripts/contoso_widgetform.js',
        'contoso_/Styles/contoso_theme.css',
        'contoso_/Images/contoso_logo.png',
      ]),
    );
  });

  it('maps WebResourceType codes to labels and unknown codes to Unknown', () => {
    expect(byName('contoso_/Scripts/contoso_widgetform.js').resourceType).toBe('JavaScript'); // 3
    expect(byName('contoso_/Styles/contoso_theme.css').resourceType).toBe('CSS');             // 2
    expect(byName('contoso_/Images/contoso_logo.png').resourceType).toBe('PNG');              // 5
    expect(byName('contoso_/Other/contoso_mystery.txt').resourceType).toBe('Unknown');        // 99
  });

  it('maps the metadata onto the IR, stripping braces off the id', () => {
    expect(byName('contoso_/Styles/contoso_theme.css')).toEqual({
      // The braces CRM wraps around GUIDs must go, or ids never match cross-references.
      id: 'e3333333-3333-4333-8333-333333333333',
      name: 'contoso_/Styles/contoso_theme.css',
      displayName: 'Contoso Theme',
      resourceType: 'CSS',
      introducedVersion: '1.0.0.0',
      dependencies: [],
      fileName: '/WebResources/Styles/contoso_theme.css',
    });
  });

  it('falls back to the logical name when a resource has no DisplayName', () => {
    expect(byName('contoso_/Images/contoso_logo.png').displayName)
      .toBe('contoso_/Images/contoso_logo.png');
  });

  it('defaults IntroducedVersion and keeps it a string', () => {
    // '1.0' would otherwise arrive as the number 1 and render as "1".
    const mystery = byName('contoso_/Other/contoso_mystery.txt');
    expect(mystery.introducedVersion).toBe('1.0');
    expect(typeof byName('contoso_/Scripts/contoso_widgetform.js').introducedVersion).toBe('string');
  });

  it('decodes the entity-encoded DependencyXml into library names', () => {
    expect(byName('contoso_/Scripts/contoso_widgetform.js').dependencies)
      .toEqual(['contoso_/Scripts/contoso_common.js', 'contoso_/Styles/contoso_theme.css']);
  });

  it('gives a resource with no DependencyXml an empty dependency list', () => {
    expect(byName('contoso_/Images/contoso_logo.png').dependencies).toEqual([]);
    expect(byName('contoso_/Scripts/contoso_missing.js').dependencies).toEqual([]);
  });

  it('detects the JS namespace from the object-literal assignment', () => {
    // `var Contoso = Contoso || {};` precedes it and must not win — only a dotted
    // name assigned an object literal counts.
    expect(byName('contoso_/Scripts/contoso_widgetform.js').namespace).toBe('Contoso.WidgetForm');
  });

  it('extracts every function shape the parser claims to handle, in source order per pattern', () => {
    expect(byName('contoso_/Scripts/contoso_widgetform.js').functions!.map(f => f.name))
      .toEqual([
        // object-literal methods first …
        'onLoad', 'refreshGadgets', 'onSave',
        // … then standalone declarations …
        'formatWidgetCode',
        // … then arrow assignments.
        'buildGadgetUrl', 'toTitleCase',
      ]);
  });

  it('flags async functions across all three declaration shapes', () => {
    expect(fn('refreshGadgets').isAsync).toBe(true);   // Name: async function ()
    expect(fn('buildGadgetUrl').isAsync).toBe(true);   // const Name = async () =>
    expect(fn('onLoad').isAsync).toBe(false);
    expect(fn('formatWidgetCode').isAsync).toBe(false);
    expect(fn('toTitleCase').isAsync).toBe(false);
  });

  it('extracts parameter names, stripping defaults and the rest operator', () => {
    expect(fn('onSave').params).toEqual(['executionContext', 'saveArgs']);
    // `separator = "-"` must document as `separator`, not `separator = "-"`.
    expect(fn('formatWidgetCode').params).toEqual(['code', 'separator']);
    // `...gadgetIds` must lose the spread so it reads as a parameter name.
    expect(fn('refreshGadgets').params).toEqual(['formContext', 'gadgetIds']);
    // A parenthesis-less arrow parameter still counts.
    expect(fn('toTitleCase').params).toEqual(['value']);
  });

  it('reads the @description tag out of the preceding JSDoc block', () => {
    expect(fn('onLoad').jsDoc).toBe('Wires up the widget form handlers on load.');
    expect(fn('formatWidgetCode').jsDoc).toBe('Formats a widget code for display.');
  });

  it('leaves jsDoc undefined for a function with no leading block comment', () => {
    expect(fn('onSave').jsDoc).toBeUndefined();
    expect(fn('buildGadgetUrl').jsDoc).toBeUndefined();
  });

  it('does not attach functions or a namespace to non-JavaScript resources', () => {
    // Running the JS regexes over a PNG or a stylesheet would be nonsense; the IR
    // documents `functions` as JS-only and renderers branch on its presence.
    for (const name of [
      'contoso_/Styles/contoso_theme.css',
      'contoso_/Images/contoso_logo.png',
      'contoso_/Other/contoso_mystery.txt',
    ]) {
      expect(byName(name).functions).toBeUndefined();
      expect(byName(name).namespace).toBeUndefined();
    }
  });

  it('keeps a JavaScript resource whose source file is missing, without functions', () => {
    // Only the .data.xml is in the solution — the model must still describe the
    // resource rather than vanish or throw.
    const missing = byName('contoso_/Scripts/contoso_missing.js');
    expect(missing.resourceType).toBe('JavaScript');
    expect(missing.functions).toBeUndefined();
    expect(missing.namespace).toBeUndefined();
  });

  it('sorts JavaScript first, then by name', () => {
    const types = resources().map(r => r.resourceType);
    const lastJs = types.lastIndexOf('JavaScript');
    expect(types.indexOf('JavaScript')).toBe(0);
    expect(types.slice(0, lastJs + 1).every(t => t === 'JavaScript')).toBe(true);

    const js = resources().filter(r => r.resourceType === 'JavaScript').map(r => r.name);
    expect(js).toEqual(['contoso_/Scripts/contoso_missing.js', 'contoso_/Scripts/contoso_widgetform.js']);
  });

  it('returns empty for a solution with no WebResources folder', () => {
    // Every sweeping parser must tolerate an absent component folder — most real
    // solutions contain only a few component types.
    expect(parseAllWebResources(path.join(SOLUTION, 'Other'))).toEqual([]);
  });

  it('keeps every well-formed resource when one .data.xml is malformed', () => {
    expect(resources().filter(r => r.name !== '').map(r => r.name)).toHaveLength(5);
  });

  // ---------------------------------------------------------------------------
  // KNOWN BUG — pinned so the fix is a deliberate, visible change.
  //
  // WebResources/Scripts/contoso_broken.js.data.xml is truncated mid-document. Rather
  // than being skipped, fast-xml-parser hands back a truthy object, so `parsed?.WebResource`
  // passes the guard and an entirely empty resource — no id, no name, type Unknown — is
  // published into the docs. The `if (!wr) return null` guard needs to check that a name
  // or id actually came back.
  // ---------------------------------------------------------------------------
  it('BUG: a truncated .data.xml yields a nameless ghost resource instead of being skipped', () => {
    const ghosts = resources().filter(r => r.name === '');
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toMatchObject({ id: '', displayName: '', resourceType: 'Unknown' });
  });

  // ---------------------------------------------------------------------------
  // KNOWN BUG — pinned so the fix is a deliberate, visible change.
  //
  // When a JSDoc block has no @description tag, extractJsDocBefore falls back to "the
  // first substantive line". Its line cleaner strips a leading `*`, but the block's own
  // opening line is `/**`, which the cleaner does not strip and the filter does not drop
  // — so the fallback always returns the literal "/**" instead of the description text.
  // Most hand-written Power Platform JSDoc omits @description, so this hits the common case.
  // ---------------------------------------------------------------------------
  it('BUG: JSDoc without an @description tag yields "/**" rather than the summary line', () => {
    expect(fn('refreshGadgets').jsDoc).toBe('/**');
    // Should be: 'Refreshes the gadget subgrid from the Contoso service.'
  });
});
