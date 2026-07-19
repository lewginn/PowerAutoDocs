// renderers/powerPagesRenderer.ts
//
// Renders Power Pages sites. Structural only (decision D4): sizes and metadata,
// never the web-template source, content-snippet value, web-file bytes or the
// double-encoded List/Bot blobs. Cross-reference joins (page tree, role→rule→page,
// template chain, marker/link targets) are derived here from the flat IR (D5).
//
// Two top-level renderers: renderPowerPagesIndex (one row per site) and
// renderPowerPagesSitePage (the full structural breakdown of one site). Every
// subsection is an internal helper composed into the site page — mirroring the
// index-page + detail-page shape of modelDrivenAppRenderer.ts.

import type {
  PowerPagesModel, WebPageModel, PublishingStateModel,
} from '../ir/powerPages.js';
import type { DocNode, InlineNode } from '../docmodel/nodes.js';
import { h, p, pt, t, c, lnk, table, ct, cc, cell, bulletList, bullet, codeBlock } from '../docmodel/nodes.js';
import type { BulletItem } from '../docmodel/nodes.js';
import { encodePageSegment } from './rendererUtils.js';

// ── Small helpers ──

const yesNo = (v: boolean): string => (v ? 'Yes' : 'No');

const labelOr = (map: Record<number, string>, code: number | null): string =>
  code === null ? '—' : (map[code] ?? String(code));

const RIGHT_LABELS: Record<number, string> = { 1: 'Grant Change', 2: 'Restrict Read' };
// mspp_entityform.mspp_mode option set (verified against Microsoft docs).
const FORM_MODE_LABELS: Record<number, string> = {
  100000000: 'Insert', 100000001: 'Edit', 100000002: 'Read Only',
};

/** Length of an opaque payload expressed as characters (structural — D4). */
const chars = (n: number): string => `${n.toLocaleString()} chars`;

// ── Index page ──

export function renderPowerPagesIndex(
  sites: PowerPagesModel[],
  basePath: string,
): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, 'Power Pages'));
  nodes.push(pt('Power Pages (Portal) sites defined in this solution. Web template source and content snippet values are documented in full; uploaded file contents are not reproduced.'));

  if (sites.length === 0) {
    nodes.push(pt('No Power Pages sites found in this solution.'));
    return nodes;
  }

  nodes.push(table(
    ['Site', 'Pages', 'Templates', 'Web Roles', 'Forms', 'Lists'],
    sites.map(site => [
      cell(lnk(site.name, `${basePath}/${encodePageSegment(site.name)}`)),
      ct(String(site.webPages.length)),
      ct(String(site.webTemplates.length + site.pageTemplates.length)),
      ct(String(site.webRoles.length)),
      ct(String(site.basicForms.length)),
      ct(String(site.lists.length)),
    ]),
  ));

  return nodes;
}

// ── Site page ──

export function renderPowerPagesSitePage(site: PowerPagesModel): DocNode[] {
  const nodes: DocNode[] = [];

  nodes.push(h(1, site.name));

  // Lookups used by the derived joins below.
  const templateName = new Map<string, string>(site.webTemplates.map(w => [w.id, w.name]));
  const pageName = new Map<string, string>(site.webPages.map(w => [w.id, w.name]));
  const roleName = new Map<string, string>(site.webRoles.map(r => [r.id, r.name]));
  const stateName = new Map<string, string>(site.publishingStates.map(s => [s.id, s.name]));

  const langName = (id: string | null): string => {
    if (!id) return '—';
    const lang = site.languages.find(l => l.id === id);
    return lang ? (lang.displayName || lang.name || id) : id;
  };

  // ---- Overview ----
  const meta: InlineNode[][][] = [];
  if (site.languages.length > 0) {
    meta.push([ct('Languages'), ct(site.languages.map(l => l.displayName || l.name).join(', '))]);
  }
  if (site.defaultLanguageId) meta.push([ct('Default Language'), ct(langName(site.defaultLanguageId))]);
  if (site.headerWebTemplateId) meta.push([ct('Header Template'), cell(...refToInline(site.headerWebTemplateId, templateName))]);
  if (site.footerWebTemplateId) meta.push([ct('Footer Template'), cell(...refToInline(site.footerWebTemplateId, templateName))]);
  if (site.dataModelVersion !== null) meta.push([ct('Data Model Version'), ct(String(site.dataModelVersion))]);
  if (meta.length > 0) nodes.push(table(['Property', 'Value'], meta));

  // Contents summary — quick component census for the site.
  nodes.push(table(
    ['Component', 'Count'],
    ([
      ['Web Pages', site.webPages.length],
      ['Page Templates', site.pageTemplates.length],
      ['Web Templates', site.webTemplates.length],
      ['Content Snippets', site.contentSnippets.length],
      ['Site Settings', site.siteSettings.length],
      ['Web Roles', site.webRoles.length],
      ['Page Access Rules', site.pageAccessRules.length],
      ['Website Access Grants', site.websiteAccess.length],
      ['Site Markers', site.siteMarkers.length],
      ['Web Link Sets', site.webLinkSets.length],
      ['Web Links', site.webLinks.length],
      ['Basic Forms', site.basicForms.length],
      ['Lists', site.lists.length],
      ['Web Files', site.webFiles.length],
      ['Bot Consumers', site.botConsumers.length],
      ['Publishing States', site.publishingStates.length],
      ['Other / unsupported', site.otherComponentCount],
    ] as [string, number][])
      .filter(([, n]) => n > 0)
      .map(([label, n]) => [ct(label), ct(String(n))]),
  ));

  // ---- Sections ----
  nodes.push(...renderPages(site));
  nodes.push(...renderPageTemplates(site, templateName));
  nodes.push(...renderWebTemplates(site));
  nodes.push(...renderContentSnippets(site, langName));
  nodes.push(...renderNavigation(site, pageName));
  nodes.push(...renderSiteMarkers(site, pageName));
  nodes.push(...renderSiteSettings(site));
  nodes.push(...renderSecurity(site, pageName, roleName));
  nodes.push(...renderFormsAndLists(site));
  nodes.push(...renderWebFiles(site, stateName));
  nodes.push(...renderBotConsumers(site));
  nodes.push(...renderPublishingStates(site.publishingStates));

  return nodes;
}

// A reference cell: resolved name (code inline) when known, else the raw id.
function refToInline(id: string | null, names: Map<string, string>): InlineNode[] {
  if (!id) return [t('—')];
  const name = names.get(id);
  return name ? [c(name)] : [t(id)];
}

// ── Pages (derived tree via parentpageid — D5) ──
//
// Each logical page exists as TWO records: a root/master page (isRoot=true,
// carrying the structural definition — URL, template, parent) and one or more
// language-specific content pages (isRoot=false, linked back via rootWebPageId).
// Rendering both duplicates every page, so the tree is built over the master
// pages only; content pages fold into their master as localised versions.

function renderPages(site: PowerPagesModel): DocNode[] {
  if (site.webPages.length === 0) return [];
  const nodes: DocNode[] = [h(2, 'Pages')];

  const roots = site.webPages.filter(pg => pg.isRoot);
  const rootIds = new Set(roots.map(pg => pg.id));

  // Content pages fold into their master; any whose master is missing (orphan)
  // is surfaced standalone rather than dropped.
  const variantsByRoot = new Map<string, WebPageModel[]>();
  const orphanContent: WebPageModel[] = [];
  for (const pg of site.webPages) {
    if (pg.isRoot) continue;
    if (pg.rootWebPageId && rootIds.has(pg.rootWebPageId)) {
      const arr = variantsByRoot.get(pg.rootWebPageId) ?? [];
      arr.push(pg);
      variantsByRoot.set(pg.rootWebPageId, arr);
    } else {
      orphanContent.push(pg);
    }
  }

  // Primary = master pages (+ orphans). Fallback: a site with no master pages at
  // all still renders every page rather than an empty section.
  const primary = roots.length > 0 ? [...roots, ...orphanContent] : site.webPages;
  const primaryIds = new Set(primary.map(pg => pg.id));

  const childrenOf = new Map<string | null, WebPageModel[]>();
  for (const pg of primary) {
    // Anchors at the top level when it has no parent, or its parent isn't primary.
    const key = pg.parentPageId && primaryIds.has(pg.parentPageId) ? pg.parentPageId : null;
    const arr = childrenOf.get(key) ?? [];
    arr.push(pg);
    childrenOf.set(key, arr);
  }

  const items: BulletItem[] = [];
  const visited = new Set<string>();
  const walk = (pg: WebPageModel, depth: number): void => {
    if (visited.has(pg.id)) return; // guard against cyclic parentpageid data
    visited.add(pg.id);
    const inlines: InlineNode[] = [t(pg.name)];
    if (pg.partialUrl) inlines.push(t('  '), c(`/${pg.partialUrl}`));
    // Only note localisation when there is more than one language variant — a
    // single-language site has exactly one content page per master (the norm),
    // which would otherwise annotate every row with noise.
    const variants = variantsByRoot.get(pg.id) ?? [];
    if (variants.length > 1) inlines.push(t(`  (${variants.length} localised versions)`));
    items.push(bullet(depth, ...inlines));
    for (const child of (childrenOf.get(pg.id) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
      walk(child, depth + 1);
    }
  };
  for (const root of (childrenOf.get(null) ?? []).sort((a, b) => a.name.localeCompare(b.name))) {
    walk(root, 0);
  }
  // Any primary page not reached (shouldn't happen, but never drop one silently).
  for (const pg of primary) {
    if (!visited.has(pg.id)) walk(pg, 0);
  }

  nodes.push(bulletList(items));
  return nodes;
}

// ── Page Templates (chain to web template — D5) ──

function renderPageTemplates(site: PowerPagesModel, templateName: Map<string, string>): DocNode[] {
  if (site.pageTemplates.length === 0) return [];
  return [
    h(2, 'Page Templates'),
    table(
      ['Name', 'Kind', 'Web Template', 'Bound Table', 'Default'],
      site.pageTemplates.map(tpl => [
        ct(tpl.name),
        ct(tpl.webTemplateId ? 'Web Template' : tpl.rewriteUrl ? 'Rewrite (legacy)' : '—'),
        cell(...refToInline(tpl.webTemplateId, templateName)),
        tpl.entityName ? cc(tpl.entityName) : ct('—'),
        ct(yesNo(tpl.isDefault)),
      ]),
    ),
  ];
}

// ── Web Templates (full Liquid/HTML source — D4 revised) ──

function renderWebTemplates(site: PowerPagesModel): DocNode[] {
  if (site.webTemplates.length === 0) return [];
  const nodes: DocNode[] = [h(2, 'Web Templates')];
  for (const w of site.webTemplates) {
    nodes.push(h(3, w.name));
    nodes.push(w.source.trim() ? codeBlock(w.source) : pt('(empty template)'));
  }
  return nodes;
}

// ── Content Snippets (full value — D4 revised) ──

function renderContentSnippets(site: PowerPagesModel, langName: (id: string | null) => string): DocNode[] {
  if (site.contentSnippets.length === 0) return [];
  const nodes: DocNode[] = [h(2, 'Content Snippets')];
  for (const sn of site.contentSnippets) {
    nodes.push(h(3, sn.displayName || sn.name));
    const meta: InlineNode[] = [c(sn.name)];
    if (sn.languageId) meta.push(t('  ·  '), t(langName(sn.languageId)));
    nodes.push(p(...meta));
    nodes.push(sn.value.trim() ? codeBlock(sn.value) : pt('(empty snippet)'));
  }
  return nodes;
}

// ── Navigation: Web Link Sets and their Web Links (join via weblinksetid — D5) ──

function renderNavigation(site: PowerPagesModel, pageName: Map<string, string>): DocNode[] {
  if (site.webLinkSets.length === 0 && site.webLinks.length === 0) return [];
  const nodes: DocNode[] = [h(2, 'Navigation')];

  const linksBySet = new Map<string | null, typeof site.webLinks>();
  for (const link of site.webLinks) {
    const key = link.webLinkSetId ?? null;
    const arr = linksBySet.get(key) ?? [];
    arr.push(link);
    linksBySet.set(key, arr);
  }

  for (const set of site.webLinkSets) {
    nodes.push(h(3, set.displayName || set.name));
    const links = (linksBySet.get(set.id) ?? []).slice().sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
    );
    if (links.length === 0) {
      nodes.push(pt('No links in this set.'));
      continue;
    }
    nodes.push(table(
      ['Link', 'Target Page', 'New Window'],
      links.map(link => [
        ct(link.name),
        cell(...refToInline(link.pageId, pageName)),
        ct(yesNo(link.openInNewWindow)),
      ]),
    ));
  }

  // Web links whose set isn't present (orphans) — surface rather than drop.
  const orphans = (linksBySet.get(null) ?? []).concat(
    site.webLinks.filter(l => l.webLinkSetId && !site.webLinkSets.some(s => s.id === l.webLinkSetId)),
  );
  if (orphans.length > 0) {
    nodes.push(h(3, 'Unlinked Web Links'));
    nodes.push(table(
      ['Link', 'Target Page'],
      orphans.map(link => [ct(link.name), cell(...refToInline(link.pageId, pageName))]),
    ));
  }

  return nodes;
}

// ── Site Markers (alias → page, join via pageid — D5) ──

function renderSiteMarkers(site: PowerPagesModel, pageName: Map<string, string>): DocNode[] {
  if (site.siteMarkers.length === 0) return [];
  return [
    h(2, 'Site Markers'),
    table(
      ['Marker', 'Target Page'],
      site.siteMarkers.map(mk => [cc(mk.name), cell(...refToInline(mk.pageId, pageName))]),
    ),
  ];
}

// ── Site Settings (key/value config) ──

function renderSiteSettings(site: PowerPagesModel): DocNode[] {
  if (site.siteSettings.length === 0) return [];
  return [
    h(2, 'Site Settings'),
    table(
      ['Setting', 'Value'],
      site.siteSettings.map(st => [cc(st.name), st.value === null ? ct('—') : ct(st.value)]),
    ),
  ];
}

// ── Security: Web Roles, Page Access Rules, Website Access (joins — D5) ──

function renderSecurity(
  site: PowerPagesModel,
  pageName: Map<string, string>,
  roleName: Map<string, string>,
): DocNode[] {
  if (site.webRoles.length === 0 && site.pageAccessRules.length === 0 && site.websiteAccess.length === 0) {
    return [];
  }
  const nodes: DocNode[] = [h(2, 'Security')];

  if (site.webRoles.length > 0) {
    nodes.push(h(3, 'Web Roles'));
    nodes.push(table(
      ['Role', 'Anonymous', 'Authenticated'],
      site.webRoles.map(r => [ct(r.name), ct(yesNo(r.anonymousUsersRole)), ct(yesNo(r.authenticatedUsersRole))]),
    ));
  }

  if (site.pageAccessRules.length > 0) {
    nodes.push(h(3, 'Page Access Control Rules'));
    nodes.push(table(
      ['Rule', 'Right', 'Page', 'Roles'],
      site.pageAccessRules.map(rule => [
        ct(rule.name),
        ct(labelOr(RIGHT_LABELS, rule.right)),
        cell(...refToInline(rule.webPageId, pageName)),
        ct(resolveNames(rule.webRoleIds, roleName)),
      ]),
    ));
  }

  if (site.websiteAccess.length > 0) {
    nodes.push(h(3, 'Website Access'));
    nodes.push(table(
      ['Name', 'Manage Snippets', 'Manage Markers', 'Manage Link Sets', 'Preview Unpublished', 'Roles'],
      site.websiteAccess.map(wa => [
        ct(wa.name),
        ct(yesNo(wa.manageContentSnippets)),
        ct(yesNo(wa.manageSiteMarkers)),
        ct(yesNo(wa.manageWebLinkSets)),
        ct(yesNo(wa.previewUnpublishedEntities)),
        ct(resolveNames(wa.webRoleIds, roleName)),
      ]),
    ));
  }

  return nodes;
}

function resolveNames(ids: string[], names: Map<string, string>): string {
  if (ids.length === 0) return '—';
  return ids.map(id => names.get(id) ?? id).join(', ');
}

// ── Forms & Lists (Dataverse refs by name; blobs by size — D4) ──

function renderFormsAndLists(site: PowerPagesModel): DocNode[] {
  if (site.basicForms.length === 0 && site.lists.length === 0) return [];
  const nodes: DocNode[] = [h(2, 'Forms & Lists')];

  if (site.basicForms.length > 0) {
    nodes.push(h(3, 'Basic Forms'));
    nodes.push(table(
      ['Name', 'Table', 'Form', 'Mode'],
      site.basicForms.map(f => [
        ct(f.name),
        f.entityName ? cc(f.entityName) : ct('—'),
        ct(f.formName || '—'),
        ct(labelOr(FORM_MODE_LABELS, f.mode)),
      ]),
    ));
  }

  if (site.lists.length > 0) {
    nodes.push(h(3, 'Lists'));
    nodes.push(table(
      ['Name', 'Table', 'Page Size', 'Views'],
      site.lists.map(l => [
        ct(l.name),
        l.entityName ? cc(l.entityName) : ct('—'),
        ct(l.pageSize === null ? '—' : String(l.pageSize)),
        ct(l.viewNames.length > 0 ? l.viewNames.join(', ') : '—'),
      ]),
    ));
  }

  return nodes;
}

// ── Web Files (bytes never kept — D4) ──

function renderWebFiles(site: PowerPagesModel, stateName: Map<string, string>): DocNode[] {
  if (site.webFiles.length === 0) return [];
  return [
    h(2, 'Web Files'),
    table(
      ['Name', 'URL', 'Type', 'Publishing State'],
      site.webFiles.map(f => [
        ct(f.name),
        f.partialUrl ? cc(f.partialUrl) : ct('—'),
        ct(f.mimeType || '—'),
        cell(...refToInline(f.publishingStateId, stateName)),
      ]),
    ),
  ];
}

// ── Bot Consumers (identified by schema name; config by size — D4) ──

function renderBotConsumers(site: PowerPagesModel): DocNode[] {
  if (site.botConsumers.length === 0) return [];
  return [
    h(2, 'Bot Consumers'),
    table(
      ['Name', 'Bot Schema Name', 'Config Size'],
      site.botConsumers.map(b => [
        ct(b.name),
        b.botSchemaName ? cc(b.botSchemaName) : ct('—'),
        ct(chars(b.configLength)),
      ]),
    ),
  ];
}

// ── Publishing States ──

function renderPublishingStates(states: PublishingStateModel[]): DocNode[] {
  if (states.length === 0) return [];
  return [
    h(2, 'Publishing States'),
    table(
      ['State', 'Default', 'Visible'],
      states.map(s => [ct(s.name), ct(yesNo(s.isDefault)), ct(yesNo(s.isVisible))]),
    ),
  ];
}
