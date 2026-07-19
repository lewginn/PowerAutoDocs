import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import type {
  PowerPagesModel, PowerPagesLanguageModel, PublishingStateModel,
  WebPageModel, PageTemplateModel, WebTemplateModel, ContentSnippetModel,
  SiteSettingModel, WebRoleModel, PageAccessRuleModel, WebsiteAccessModel,
  SiteMarkerModel, WebLinkSetModel, WebLinkModel, BasicFormModel, ListModel,
  WebFileModel,
} from '../ir/powerPages.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

// Power Pages component type codes. Kept internal to the parser — the IR arrays,
// not the raw codes, are the public contract.
const TYPE = {
  PUBLISHING_STATE: 1,
  WEB_PAGE: 2,
  WEB_FILE: 3,
  WEB_LINK_SET: 4,
  WEB_LINK: 5,
  PAGE_TEMPLATE: 6,
  CONTENT_SNIPPET: 7,
  WEB_TEMPLATE: 8,
  SITE_SETTING: 9,
  PAGE_ACCESS_RULE: 10,
  WEB_ROLE: 11,
  WEBSITE_ACCESS: 12,
  SITE_MARKER: 13,
  BASIC_FORM: 15,
  LIST: 17,
  BOT_CONSUMER: 27,
} as const;

// ── Small readers (all defensive; fast-xml-parser never throws on bad XML) ──

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** fast-xml-parser coerces 0/1 to numbers; treat 'true'/1 as true. */
function bool(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true';
}

/**
 * The site id appears in two shapes across component clusters:
 *   nested:  <powerpagesiteid><powerpagesiteid>GUID</…></…>  → { powerpagesiteid: { powerpagesiteid: GUID } }
 *   flat:    <powerpagesiteid>GUID</powerpagesiteid>          → { powerpagesiteid: GUID }
 * Read both.
 */
function readNestedId(node: any, key: string): string | null {
  const v = node?.[key];
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    const inner = v[key];
    return inner === undefined ? null : str(inner) || null;
  }
  return str(v) || null;
}

/** Component id is a root attribute on every observed record; tolerate a flat/nested fallback. */
function readComponentId(node: any): string {
  return str(node?.['@_powerpagecomponentid'] ?? node?.powerpagecomponentid) ;
}

const HTML_ENTITIES: [RegExp, string][] = [
  [/&lt;/g, '<'], [/&gt;/g, '>'], [/&quot;/g, '"'], [/&#39;/g, "'"],
  [/&apos;/g, "'"], [/&amp;/g, '&'],
];

function htmlDecode(s: string): string {
  let out = s;
  for (const [re, ch] of HTML_ENTITIES) out = out.replace(re, ch);
  return out;
}

/**
 * <content> is a JSON string (JSON.parse DOES throw — unlike fast-xml-parser).
 * Missing content is legal (some Site Settings omit it). Returns a plain object,
 * or null when absent or unparseable — the caller then emits outer metadata only.
 */
function parseContent(raw: unknown): Record<string, any> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw as Record<string, any>; // already-decoded (rare)
  const s = String(raw);
  if (s.trim() === '') return null;
  try {
    return JSON.parse(s);
  } catch {
    // Some content (e.g. content snippets) can arrive HTML-escaped — decode and retry once.
    try {
      return JSON.parse(htmlDecode(s));
    } catch {
      return null;
    }
  }
}

/** Normalise a content field that may be a single GUID string or an array of GUIDs. */
function idArray(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  const s = str(v);
  return s ? [s] : [];
}

const asArray = (v: unknown): any[] => (v === null || v === undefined ? [] : Array.isArray(v) ? v : [v]);

const stripBraces = (g: string): string => g.replace(/[{}]/g, '').toLowerCase();

/** LocalizedNames → the 1033 description, else the first available. */
function localizedName(node: any): string {
  const names = asArray(node?.LocalizedNames?.LocalizedName);
  const english = names.find(n => String(n?.['@_languagecode']) === '1033');
  return str((english ?? names[0])?.['@_description']);
}

/**
 * Builds a viewId → display-name map from the solution's saved queries
 * (Entities/<table>/SavedQueries/<guid>.xml). A Power Pages List references its
 * views by saved-query GUID, and the List's own cached labels are frequently
 * empty in an export — so the authoritative label is the saved query's name.
 * Fully defensive: a missing folder or bad file is skipped, never thrown.
 */
function buildSavedQueryNames(solutionRoot: string): Map<string, string> {
  const map = new Map<string, string>();
  const entitiesDir = path.join(solutionRoot, 'Entities');
  let entities: fs.Dirent[];
  try {
    entities = fs.readdirSync(entitiesDir, { withFileTypes: true });
  } catch {
    return map;
  }
  for (const ent of entities) {
    if (!ent.isDirectory()) continue;
    const sqDir = path.join(entitiesDir, ent.name, 'SavedQueries');
    let files: string[];
    try {
      files = fs.readdirSync(sqDir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.xml')) continue;
      let doc: any;
      try {
        doc = xmlParser.parse(fs.readFileSync(path.join(sqDir, f), 'utf-8'));
      } catch {
        continue;
      }
      for (const sq of asArray(doc?.savedqueries?.savedquery)) {
        const id = stripBraces(str(sq?.savedqueryid));
        if (!id) continue;
        const name = localizedName(sq);
        if (name) map.set(id, name);
      }
    }
  }
  return map;
}

/**
 * A List's `view` field is the primary saved-query GUID and its `views` field is a
 * JSON-in-string blob { "Views": [ { "ViewId": GUID, "DisplayName": [ { LCID, Value } ] } ] }.
 * A list can include several views. Resolve each to a display label — preferring the
 * blob's cached label, falling back to the saved-query name — and never emit a GUID.
 * Fully defensive: any shape surprise contributes nothing rather than throwing.
 */
function resolveListViewNames(
  topView: unknown,
  viewsRaw: unknown,
  savedQueryNames: Map<string, string>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (guid: unknown, cachedLabel: string): void => {
    const g = stripBraces(str(guid));
    const label = cachedLabel.trim() || (g ? savedQueryNames.get(g) ?? '' : '');
    if (label && !seen.has(label)) {
      seen.add(label);
      out.push(label);
    }
  };

  let blob: any;
  try {
    blob = typeof viewsRaw === 'string' ? JSON.parse(viewsRaw) : viewsRaw;
  } catch {
    blob = null;
  }
  for (const v of asArray(blob?.Views)) {
    const names = asArray(v?.DisplayName);
    const english = names.find(n => Number(n?.LCID) === 1033);
    add(v?.ViewId, str((english ?? names[0])?.Value));
  }
  // The primary `view` GUID, in case it isn't among the blob's Views.
  add(topView, '');
  return out;
}

// ── Site-level asset files ──

interface SiteSeed {
  model: PowerPagesModel;
}

function newSiteModel(id: string, name: string): PowerPagesModel {
  return {
    id, name,
    dataModelVersion: null,
    defaultLanguageId: null,
    websiteLanguageLcid: null,
    headerWebTemplateId: null,
    footerWebTemplateId: null,
    defaultBotConsumerId: null,
    languages: [],
    publishingStates: [],
    webPages: [],
    pageTemplates: [],
    webTemplates: [],
    contentSnippets: [],
    siteSettings: [],
    webRoles: [],
    pageAccessRules: [],
    websiteAccess: [],
    siteMarkers: [],
    webLinkSets: [],
    webLinks: [],
    basicForms: [],
    lists: [],
    webFiles: [],
    otherComponentCount: 0,
  };
}

function parseSites(assetsDir: string): PowerPagesModel[] {
  const file = path.join(assetsDir, 'powerpagesites.xml');
  if (!fs.existsSync(file)) return [];
  let doc: any;
  try {
    doc = xmlParser.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return [];
  }
  const wrapper = doc?.powerpagesites?.powerpagesite;
  if (!wrapper) return [];
  const records = Array.isArray(wrapper) ? wrapper : [wrapper];

  const models: PowerPagesModel[] = [];
  for (const rec of records) {
    const id = str(rec?.['@_powerpagesiteid'] ?? rec?.powerpagesiteid);
    if (!id) continue; // nothing to anchor components to
    const model = newSiteModel(id, str(rec?.name) || 'Power Pages Site');
    model.dataModelVersion = num(rec?.datamodelversion);
    const content = parseContent(rec?.content);
    if (content) {
      model.defaultLanguageId = str(content.defaultlanguage) || null;
      model.headerWebTemplateId = str(content.headerwebtemplateid) || null;
      model.footerWebTemplateId = str(content.footerwebtemplateid) || null;
      model.defaultBotConsumerId = str(content.defaultbotconsumerid) || null;
      model.websiteLanguageLcid = num(content.website_language);
    }
    models.push(model);
  }
  return models;
}

function attachLanguages(assetsDir: string, sites: Map<string, SiteSeed>): void {
  const file = path.join(assetsDir, 'powerpagesitelanguages.xml');
  if (!fs.existsSync(file)) return;
  let doc: any;
  try {
    doc = xmlParser.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return;
  }
  const wrapper = doc?.powerpagesitelanguages?.powerpagesitelanguage;
  if (!wrapper) return;
  const records = Array.isArray(wrapper) ? wrapper : [wrapper];

  for (const rec of records) {
    const siteId = readNestedId(rec, 'powerpagesiteid');
    const seed = resolveSite(sites, siteId);
    if (!seed) continue;
    const lang: PowerPagesLanguageModel = {
      id: str(rec?.['@_powerpagesitelanguageid'] ?? rec?.powerpagesitelanguageid),
      name: str(rec?.name),
      displayName: str(rec?.displayname),
      languageCode: str(rec?.languagecode),
      lcid: num(rec?.lcid),
    };
    seed.model.languages.push(lang);
  }
}

/**
 * Resolve a component's site. When the referenced id matches a known site, use it.
 * When it doesn't (or is absent) but exactly one site exists, attach to that one —
 * a single-site solution is by far the common case and this keeps a stray/legacy
 * id from silently dropping a whole component.
 */
function resolveSite(sites: Map<string, SiteSeed>, siteId: string | null): SiteSeed | null {
  if (siteId && sites.has(siteId)) return sites.get(siteId)!;
  if (sites.size === 1) return sites.values().next().value ?? null;
  return null;
}

// ── Per-component mapping ──

function mapComponent(inner: any, seed: SiteSeed, savedQueryNames: Map<string, string>): void {
  const type = num(inner?.powerpagecomponenttype);
  // No usable type code — a truncated/partial record fast-xml-parser returned as a
  // truthy-but-empty object. Skip it (an unmapped-but-numeric type is handled by the
  // switch default below and counted as 'other'; this is a different, malformed case).
  if (type === null) return;
  const id = readComponentId(inner);
  const name = str(inner?.name);
  const content = parseContent(inner?.content);
  const c = content ?? {};
  const m = seed.model;

  switch (type) {
    case TYPE.PUBLISHING_STATE: {
      const rec: PublishingStateModel = {
        id, name,
        displayOrder: num(c.displayorder),
        isDefault: bool(c.isdefault),
        isVisible: bool(c.isvisible),
      };
      m.publishingStates.push(rec);
      break;
    }
    case TYPE.WEB_PAGE: {
      const rec: WebPageModel = {
        id, name,
        partialUrl: str(c.partialurl),
        isRoot: bool(c.isroot),
        parentPageId: str(c.parentpageid) || null,
        rootWebPageId: str(c.rootwebpageid) || null,
        pageTemplateId: str(c.pagetemplateid) || null,
        publishingStateId: str(c.publishingstateid) || null,
        languageId: readNestedId(inner, 'powerpagesitelanguageid'),
        displayOrder: num(c.displayorder),
      };
      m.webPages.push(rec);
      break;
    }
    case TYPE.WEB_FILE: {
      const rec: WebFileModel = {
        id, name,
        partialUrl: str(c.partialurl),
        parentPageId: str(c.parentpageid) || null,
        publishingStateId: str(c.publishingstateid) || null,
        displayOrder: num(c.displayorder),
        mimeType: str(inner?.filecontent?.['@_mimetype']) || null,
      };
      m.webFiles.push(rec);
      break;
    }
    case TYPE.WEB_LINK_SET: {
      const rec: WebLinkSetModel = {
        id, name,
        displayName: str(c.display_name),
        publishingStateId: str(c.publishingstateid) || null,
        languageId: readNestedId(inner, 'powerpagesitelanguageid'),
      };
      m.webLinkSets.push(rec);
      break;
    }
    case TYPE.WEB_LINK: {
      const rec: WebLinkModel = {
        id, name,
        webLinkSetId: str(c.weblinksetid) || null,
        pageId: str(c.pageid) || null,
        displayOrder: num(c.displayorder),
        openInNewWindow: bool(c.openinnewwindow),
      };
      m.webLinks.push(rec);
      break;
    }
    case TYPE.PAGE_TEMPLATE: {
      const rec: PageTemplateModel = {
        id, name,
        isDefault: bool(c.isdefault),
        usesWebsiteHeaderAndFooter: bool(c.usewebsiteheaderandfooter),
        webTemplateId: str(c.webtemplateid) || null,
        rewriteUrl: str(c.rewriteurl) || null,
        entityName: str(c.entityname) || null,
      };
      m.pageTemplates.push(rec);
      break;
    }
    case TYPE.CONTENT_SNIPPET: {
      const rec: ContentSnippetModel = {
        id, name,
        displayName: str(c.display_name),
        snippetType: num(c.type),
        value: str(c.value),
        languageId: readNestedId(inner, 'powerpagesitelanguageid'),
      };
      m.contentSnippets.push(rec);
      break;
    }
    case TYPE.WEB_TEMPLATE: {
      const rec: WebTemplateModel = {
        id, name,
        source: str(c.source),
      };
      m.webTemplates.push(rec);
      break;
    }
    case TYPE.SITE_SETTING: {
      // value/description are both optional; some records omit <content> entirely.
      const rec: SiteSettingModel = {
        id, name,
        value: content && c.value !== undefined ? str(c.value) : null,
        description: content && c.description !== undefined ? str(c.description) : null,
      };
      m.siteSettings.push(rec);
      break;
    }
    case TYPE.PAGE_ACCESS_RULE: {
      const rec: PageAccessRuleModel = {
        id, name,
        right: num(c.right),
        webPageId: str(c.webpageid) || null,
        webRoleIds: idArray(c.adx_webpageaccesscontrolrule_webrole),
      };
      m.pageAccessRules.push(rec);
      break;
    }
    case TYPE.WEB_ROLE: {
      const rec: WebRoleModel = {
        id, name,
        anonymousUsersRole: bool(c.anonymoususersrole),
        authenticatedUsersRole: bool(c.authenticatedusersrole),
      };
      m.webRoles.push(rec);
      break;
    }
    case TYPE.WEBSITE_ACCESS: {
      const rec: WebsiteAccessModel = {
        id, name,
        manageContentSnippets: bool(c.managecontentsnippets),
        manageSiteMarkers: bool(c.managesitemarkers),
        manageWebLinkSets: bool(c.manageweblinksets),
        previewUnpublishedEntities: bool(c.previewunpublishedentities),
        webRoleIds: idArray(c.adx_websiteaccess_webrole),
      };
      m.websiteAccess.push(rec);
      break;
    }
    case TYPE.SITE_MARKER: {
      const rec: SiteMarkerModel = {
        id, name,
        pageId: str(c.pageid) || null,
      };
      m.siteMarkers.push(rec);
      break;
    }
    case TYPE.BASIC_FORM: {
      const rec: BasicFormModel = {
        id, name,
        formName: str(c.formname),
        entityName: str(c.entityname),
        tabName: str(c.tabname),
        mode: num(c.mode),
      };
      m.basicForms.push(rec);
      break;
    }
    case TYPE.LIST: {
      const rec: ListModel = {
        id, name,
        entityName: str(c.entityname),
        pageSize: num(c.pagesize),
        viewNames: resolveListViewNames(c.view, c.views, savedQueryNames),
      };
      m.lists.push(rec);
      break;
    }
    case TYPE.BOT_CONSUMER:
      // Bot Consumers are intentionally not documented (omitted on review, 2026-07-19).
      // Recognised and skipped here so they are not counted as an unsupported type.
      break;
    default:
      // Unknown/unmapped type code (enum gaps: 14, 16, 18–26, …) — count, never throw.
      m.otherComponentCount++;
  }
}

function attachComponents(
  componentsDir: string,
  sites: Map<string, SiteSeed>,
  savedQueryNames: Map<string, string>,
): void {
  if (!fs.existsSync(componentsDir)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(componentsDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(componentsDir, entry.name, 'powerpagecomponent.xml');
    if (!fs.existsSync(file)) continue;

    // Skip-and-continue PER FILE: one malformed/truncated component must not throw
    // out of the sweep and cost the site every other component.
    let doc: any;
    try {
      doc = xmlParser.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      continue;
    }
    const inner = doc?.powerpagecomponent;
    if (!inner || typeof inner !== 'object') continue; // truncated file → truthy-but-empty or missing root

    const siteId = readNestedId(inner, 'powerpagesiteid');
    const seed = resolveSite(sites, siteId);
    if (!seed) continue;

    try {
      mapComponent(inner, seed, savedQueryNames);
    } catch {
      // Guard per record too — a surprising content shape skips just this component.
      continue;
    }
  }
}

/**
 * Parse every Power Pages site in an unpacked solution.
 *
 * Reads Assets/powerpagesites.xml (+ powerpagesitelanguages.xml) and every
 * powerpagecomponents/<guid>/powerpagecomponent.xml, grouping components onto
 * their site by powerpagesiteid. Emits flat IR only (decision D5). No publisher
 * prefix (decision D3): Power Pages components are site content, not schema.
 *
 * Returns [] when the site asset file is absent — there is then nothing to anchor
 * components to.
 */
export function parsePowerPages(solutionRoot: string): PowerPagesModel[] {
  const assetsDir = path.join(solutionRoot, 'Assets');
  const models = parseSites(assetsDir);
  if (models.length === 0) return [];

  const sites = new Map<string, SiteSeed>();
  for (const model of models) sites.set(model.id, { model });

  attachLanguages(assetsDir, sites);
  // A List names its views by saved-query GUID; resolve those to display names.
  const savedQueryNames = buildSavedQueryNames(solutionRoot);
  attachComponents(path.join(solutionRoot, 'powerpagecomponents'), sites, savedQueryNames);

  // Stable, presentation-friendly ordering inside each site.
  for (const model of models) {
    model.webPages.sort((a, b) => a.name.localeCompare(b.name));
    model.webTemplates.sort((a, b) => a.name.localeCompare(b.name));
    model.contentSnippets.sort((a, b) => a.name.localeCompare(b.name));
    model.siteSettings.sort((a, b) => a.name.localeCompare(b.name));
    model.webRoles.sort((a, b) => a.name.localeCompare(b.name));
    model.pageTemplates.sort((a, b) => a.name.localeCompare(b.name));
    model.siteMarkers.sort((a, b) => a.name.localeCompare(b.name));
    model.basicForms.sort((a, b) => a.name.localeCompare(b.name));
    model.lists.sort((a, b) => a.name.localeCompare(b.name));
    model.webFiles.sort((a, b) => a.name.localeCompare(b.name));
  }

  return models.sort((a, b) => a.name.localeCompare(b.name));
}
