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
    expect(s.pageTemplates).toHaveLength(1);
    expect(s.webTemplates).toHaveLength(1);
    expect(s.contentSnippets).toHaveLength(1);
    expect(s.webRoles).toHaveLength(1);
    expect(s.pageAccessRules).toHaveLength(1);
    expect(s.websiteAccess).toHaveLength(1);
    expect(s.siteMarkers).toHaveLength(1);
    expect(s.webLinkSets).toHaveLength(1);
    expect(s.webLinks).toHaveLength(1);
    expect(s.basicForms).toHaveLength(1);
    expect(s.lists).toHaveLength(1);
    expect(s.webFiles).toHaveLength(1);
    expect(s.botConsumers).toHaveLength(1);
  });

  it('maps a Page Template and closes the page -> template -> web template chain', () => {
    // Type 6 has a dedicated mapping branch; without a fixture record its XML->IR
    // key mapping is untested, so a key typo (webtemplateid/entityname) would ship
    // silently. The Home page's pagetemplateid resolves to this record, and its
    // webTemplateId in turn resolves to the Header web template (D5's chain).
    const s = site();
    const home = s.webPages.find(p => p.name === 'Home')!;
    const tmpl = s.pageTemplates.find(t => t.id === home.pageTemplateId)!;
    expect(tmpl).toBeDefined();
    expect(tmpl.name).toBe('Standard Page');
    expect(tmpl.isDefault).toBe(true);
    expect(tmpl.usesWebsiteHeaderAndFooter).toBe(true);
    expect(tmpl.webTemplateId).toBe(s.webTemplates[0].id);
    expect(tmpl.entityName).toBe('contoso_case');
    expect(tmpl.rewriteUrl).toBeNull();
  });

  it('maps Website Access with its permission flags and web-role join', () => {
    // Type 12 also has a dedicated branch whose XML->IR mapping (four boolean
    // permission flags + the adx_websiteaccess_webrole array) was otherwise
    // unexercised by any fixture record.
    const s = site();
    const access = s.websiteAccess[0];
    expect(access.manageContentSnippets).toBe(true);
    expect(access.manageSiteMarkers).toBe(false);
    expect(access.manageWebLinkSets).toBe(true);
    expect(access.previewUnpublishedEntities).toBe(true);
    expect(access.webRoleIds).toEqual([s.webRoles[0].id]);
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

  it('carries the full web template source (decoded) and content snippet value', () => {
    const s = site();
    // Source arrives entity-escaped inside <content>; it must be decoded, not measured.
    expect(s.webTemplates[0].source).toBe('<div>Header</div>');
    expect(s.contentSnippets[0].value).toBe('Welcome');
  });

  it('names every view a list includes, via cached label or saved-query, never a GUID', () => {
    // The list's `views` field is double-encoded JSON holding two views. The first
    // carries a cached label ('Active Cases'); the second's cached label is empty (the
    // common real-export case), so its name must be resolved from the saved-query file
    // Entities/contoso_case/SavedQueries/{…000002}.xml ('Resolved Cases'). A list can
    // carry more than one view, and no GUID may leak through.
    const list = site().lists[0];
    expect(list.viewNames).toEqual(['Active Cases', 'Resolved Cases']);
    expect(list.viewNames.join(' ')).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('reads the basic form mode as its raw option-set value (renderer maps the label)', () => {
    // 100000001 = Edit in the mspp_entityform.mspp_mode option set.
    expect(site().basicForms[0].mode).toBe(100000001);
  });

  it('summarises a web file by mime type and publishing state, never its bytes', () => {
    const f = site().webFiles[0];
    expect(f.mimeType).toBe('image/png');
    expect(f.publishingStateId).toBe('c0000000-0000-4000-8000-000000000001');
    expect(f).not.toHaveProperty('fileSizeBytes');
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
      s.webPages.length + s.publishingStates.length + s.pageTemplates.length +
      s.webTemplates.length + s.contentSnippets.length + s.siteSettings.length +
      s.webRoles.length + s.pageAccessRules.length + s.websiteAccess.length +
      s.siteMarkers.length + s.webLinkSets.length + s.webLinks.length +
      s.basicForms.length + s.lists.length + s.webFiles.length +
      s.botConsumers.length;
    expect(total).toBe(18);          // every valid component parsed
    expect(s.otherComponentCount).toBe(1); // only the type=99, not the truncated file
  });

  it('returns [] for a folder with no Power Pages site asset file', () => {
    // Every sweeping parser must tolerate an absent component source. The Assets
    // subfolder has the language file but no powerpagesites.xml to anchor to.
    expect(parsePowerPages(path.join(SOLUTION, 'Assets'))).toEqual([]);
    expect(parsePowerPages(path.join(SOLUTION, 'powerpagecomponents'))).toEqual([]);
  });
});
