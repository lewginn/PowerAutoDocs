import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parsePowerPages } from '../../src/parsers/powerPagesParser.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoPortal',
);

const site = () => parsePowerPages(SOLUTION)[0];

describe('parsePowerPages', () => {
  it('parses one PowerPagesModel per site with its site-level fields', () => {
    const sites = parsePowerPages(SOLUTION);
    expect(sites).toHaveLength(1);
    const s = sites[0];
    expect(s.id).toBe('50000000-1000-4000-8000-000000000000');
    expect(s.name).toBe('Contoso Customer Portal');
    expect(s.dataModelVersion).toBe(2);
    // Site-level refs come from the site's own <content> JSON, not outer elements.
    expect(s.defaultLanguageId).toBe('40000000-1000-4000-8000-000000000001');
    expect(s.headerWebTemplateId).toBe('c0000000-0000-4000-8000-000000000004');
    expect(s.footerWebTemplateId).toBe('c0000000-0000-4000-8000-000000000004');
    expect(s.defaultBotConsumerId).toBe('c0000000-0000-4000-8000-000000000010');
    expect(s.websiteLanguageLcid).toBe(1033);
  });

  it('attaches the site language from powerpagesitelanguages.xml', () => {
    const langs = site().languages;
    expect(langs).toHaveLength(1);
    expect(langs[0]).toMatchObject({
      id: '40000000-1000-4000-8000-000000000001',
      displayName: 'English (United States)',
      languageCode: 'en-US',
      lcid: 1033,
    });
  });

  it('maps every supported component type onto its typed array', () => {
    const s = site();
    expect(s.webPages).toHaveLength(2);
    expect(s.publishingStates).toHaveLength(1);
    expect(s.webTemplates).toHaveLength(1);
    expect(s.contentSnippets).toHaveLength(1);
    expect(s.webRoles).toHaveLength(1);
    expect(s.pageAccessRules).toHaveLength(1);
    expect(s.siteMarkers).toHaveLength(1);
    expect(s.webLinkSets).toHaveLength(1);
    expect(s.webLinks).toHaveLength(1);
    expect(s.basicForms).toHaveLength(1);
    expect(s.lists).toHaveLength(1);
    expect(s.webFiles).toHaveLength(1);
    expect(s.botConsumers).toHaveLength(1);
  });

  it('builds the join data for the page parent/child tree via parentpageid', () => {
    // The renderer derives the tree; the parser must carry the self-referencing
    // parentpageid so it can. Home is the root (no parent); About Us points at it.
    const s = site();
    const home = s.webPages.find(p => p.name === 'Home')!;
    const about = s.webPages.find(p => p.name === 'About Us')!;
    expect(home.isRoot).toBe(true);
    expect(home.parentPageId).toBeNull();
    expect(about.parentPageId).toBe(home.id);
  });

  it('reads powerpagesiteid defensively — nested and flat forms both resolve to the site', () => {
    // Home carries the nested <powerpagesiteid><powerpagesiteid>… form; About Us
    // carries the flat <powerpagesiteid>…</powerpagesiteid> form. Both must land
    // on the same site rather than being dropped.
    const s = site();
    expect(s.webPages.map(p => p.name).sort()).toEqual(['About Us', 'Home']);
  });

  it('carries the role -> access-rule -> page join data', () => {
    const s = site();
    const rule = s.pageAccessRules[0];
    const about = s.webPages.find(p => p.name === 'About Us')!;
    const role = s.webRoles[0];
    expect(rule.webPageId).toBe(about.id);
    expect(rule.webRoleIds).toEqual([role.id]);
    expect(rule.right).toBe(2);
  });

  it('emits a Site Setting with no <content> as outer metadata only (value null)', () => {
    const s = site();
    const valueless = s.siteSettings.find(x => x.name === 'Header/TreeViewEnabled')!;
    expect(valueless).toBeDefined();
    expect(valueless.value).toBeNull();
    const withValue = s.siteSettings.find(x => x.name === 'Authentication/Registration/Enabled')!;
    expect(withValue.value).toBe('true');
  });

  it('stores large payloads as a length only — never the body (structural, D4)', () => {
    const s = site();
    // Web template source is entity-escaped HTML; it must be decoded then measured,
    // and the model must not carry the source itself.
    expect(s.webTemplates[0].sourceLength).toBe('<div>Header</div>'.length);
    expect(s.webTemplates[0]).not.toHaveProperty('source');
    expect(s.contentSnippets[0].valueLength).toBe('Welcome'.length);
    expect(s.contentSnippets[0]).not.toHaveProperty('value');
    // List settings/views blobs are stored as lengths, not the double-encoded JSON.
    expect(s.lists[0].settingsLength).toBe(2);
    expect(s.lists[0].viewsLength).toBe(2);
    expect(s.lists[0]).not.toHaveProperty('settings');
  });

  it('summarises a web file by mime type and size, not its bytes', () => {
    const f = site().webFiles[0];
    expect(f.mimeType).toBe('image/png');
    expect(f.fileSizeBytes).toBeGreaterThan(0);
    expect(f).not.toHaveProperty('filecontent');
  });

  it('counts an unknown/unmapped type code instead of throwing', () => {
    // The fixture has a type=99 component. It must not appear in any typed array,
    // and must not crash the sweep — it is counted as 'other'.
    expect(site().otherComponentCount).toBe(1);
  });

  it('skips a truncated component file without losing the rest (skip per file)', () => {
    // The fixture has a genuinely truncated powerpagecomponent.xml (no closing
    // tags, no type element). fast-xml-parser does not throw on it — the parser
    // must still skip it, keep every other component, and not miscount it as 'other'.
    const s = site();
    const total =
      s.webPages.length + s.publishingStates.length + s.webTemplates.length +
      s.contentSnippets.length + s.siteSettings.length + s.webRoles.length +
      s.pageAccessRules.length + s.siteMarkers.length + s.webLinkSets.length +
      s.webLinks.length + s.basicForms.length + s.lists.length +
      s.webFiles.length + s.botConsumers.length;
    expect(total).toBe(16);          // every valid component parsed
    expect(s.otherComponentCount).toBe(1); // only the type=99, not the truncated file
  });

  it('returns [] for a folder with no Power Pages site asset file', () => {
    // Every sweeping parser must tolerate an absent component source. The Assets
    // subfolder has the language file but no powerpagesites.xml to anchor to.
    expect(parsePowerPages(path.join(SOLUTION, 'Assets'))).toEqual([]);
    expect(parsePowerPages(path.join(SOLUTION, 'powerpagecomponents'))).toEqual([]);
  });
});
