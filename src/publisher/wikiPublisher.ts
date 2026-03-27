import type { WikiConfig } from '../config/index.js';

export interface WikiPage {
  /** Full path from wiki root e.g. /WikiNode/Data Model/myprefix_leaverequest */
  path: string;
  /** Markdown content */
  content: string;
}

interface WikiPageGetResult {
  path: string;
  eTag?: string;
}

// -----------------------------------------------
// Helpers
// -----------------------------------------------
function buildBaseUrl(config: WikiConfig): string {
  return (
    `https://dev.azure.com/${encodeURIComponent(config.organisation)}/` +
    `${encodeURIComponent(config.project)}/_apis/wiki/wikis/` +
    `${encodeURIComponent(config.wikiIdentifier)}/pages`
  );
}

function buildAuthHeader(pat: string): string {
  return `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
}

// -----------------------------------------------
// Sort pages so siblings publish Z→A
// ADO sidebar shows newest-first, so Z→A publish = A→Z display
// Parents are always published before their children
// -----------------------------------------------
function sortPagesForPublish(pages: WikiPage[]): WikiPage[] {
  const pagePaths = new Set(pages.map(p => p.path));

  // Group pages by parent path
  const grouped = new Map<string, WikiPage[]>();
  for (const page of pages) {
    const parts = page.path.split('/').filter(Boolean);
    const parent = '/' + parts.slice(0, -1).join('/');
    const siblings = grouped.get(parent) ?? [];
    siblings.push(page);
    grouped.set(parent, siblings);
  }

  const result: WikiPage[] = [];
  const visited = new Set<string>();

  function visit(page: WikiPage) {
    if (visited.has(page.path)) return;
    visited.add(page.path);

    // Publish parent first, then children in reverse alpha order
    result.push(page);

    const children = grouped.get(page.path) ?? [];
    const sorted = [...children].sort((a, b) => b.path.localeCompare(a.path));
    for (const child of sorted) {
      visit(child);
    }
  }

  // Start from root pages (whose parent is not in the pages list)
  const roots = pages.filter(p => {
    const parts = p.path.split('/').filter(Boolean);
    const parent = '/' + parts.slice(0, -1).join('/');
    return !pagePaths.has(parent);
  });

  roots.sort((a, b) => b.path.localeCompare(a.path));
  for (const root of roots) {
    visit(root);
  }

  // Safety net — append anything not reached
  for (const page of pages) {
    if (!visited.has(page.path)) result.push(page);
  }

  return result;
}

// -----------------------------------------------
// GET page — returns eTag if exists, null if 404
// -----------------------------------------------
async function getPage(config: WikiConfig, pagePath: string): Promise<WikiPageGetResult | null> {
  const url = `${buildBaseUrl(config)}?path=${encodeURIComponent(pagePath)}&api-version=7.0`;

  const response = await fetch(url, {
    headers: {
      'Authorization': buildAuthHeader(config.pat),
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    throw new Error(`GET wiki page failed [${response.status}] "${pagePath}": ${await response.text()}`);
  }

  return {
    path: pagePath,
    eTag: response.headers.get('ETag') ?? undefined,
  };
}

// -----------------------------------------------
// PUT page — creates or overwrites
// -----------------------------------------------
async function putPage(
  config: WikiConfig,
  pagePath: string,
  content: string,
  eTag?: string
): Promise<void> {
  const url = `${buildBaseUrl(config)}?path=${encodeURIComponent(pagePath)}&api-version=7.0`;

  const headers: Record<string, string> = {
    'Authorization': buildAuthHeader(config.pat),
    'Content-Type': 'application/json',
  };

  if (eTag) {
    headers['If-Match'] = eTag;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(`PUT wiki page failed [${response.status}] "${pagePath}": ${await response.text()}`);
  }

  const verb = response.status === 201 ? 'Created' : 'Updated';
  console.log(`  ✓ ${verb}: ${pagePath}`);
}

// -----------------------------------------------
// Ensure a parent page exists (placeholder if not)
// -----------------------------------------------
async function ensurePage(config: WikiConfig, pagePath: string): Promise<void> {
  const existing = await getPage(config, pagePath);
  if (!existing) {
    const title = pagePath.split('/').filter(Boolean).pop() ?? pagePath;
    await putPage(config, pagePath, `# ${title}\n`, undefined);
  }
}

// -----------------------------------------------
// Main publish function
// -----------------------------------------------
export async function publishToWiki(
  config: WikiConfig,
  pages: WikiPage[]
): Promise<void> {
  console.log(`\nPublishing ${pages.length} pages to ${config.wikiIdentifier}...`);
  console.log(`Organisation: ${config.organisation} · Project: ${config.project}\n`);

  // ---- Validate PAT before doing anything ----
  if (!config.pat || config.pat.trim() === '' || config.pat.trim().toUpperCase() === 'REDACTED') {
    throw new Error('Wiki PAT is missing or REDACTED — set it in doc-gen.config.yml or via the WIKI_PAT pipeline variable.');
  }

  // Quick auth check — GET the wiki root
  const testUrl = `https://dev.azure.com/${encodeURIComponent(config.organisation)}/${encodeURIComponent(config.project)}/_apis/wiki/wikis/${encodeURIComponent(config.wikiIdentifier)}?api-version=7.0`;
  const testResponse = await fetch(testUrl, {
    headers: { 'Authorization': buildAuthHeader(config.pat) },
  });
  if (testResponse.status === 401 || testResponse.status === 403) {
    throw new Error(`Wiki auth failed [${testResponse.status}] — check your PAT has Wiki read/write permissions.`);
  }
  if (!testResponse.ok) {
    throw new Error(`Wiki connection failed [${testResponse.status}] — check organisation, project and wikiIdentifier in config.`);
  }

  // Collect all unique intermediate parent paths
  const parentPaths = new Set<string>();
  for (const page of pages) {
    const parts = page.path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      parentPaths.add('/' + parts.slice(0, i).join('/'));
    }
  }

  // Ensure parents exist top-down (shortest path first)
  const sortedParents = [...parentPaths].sort(
    (a, b) => a.split('/').length - b.split('/').length
  );

  for (const parentPath of sortedParents) {
    const isContentPage = pages.some(p => p.path === parentPath);
    if (!isContentPage) {
      await ensurePage(config, parentPath);
    }
  }

  // Sort pages so siblings publish Z→A → display A→Z in ADO sidebar
  const sortedPages = sortPagesForPublish(pages);

  // Publish all pages — always overwrite
  for (const page of sortedPages) {
    try {
      const existing = await getPage(config, page.path);
      await putPage(config, page.path, page.content, existing?.eTag);
    } catch (err) {
      console.error(`  ✗ Failed: ${page.path}`, err);
    }
  }

  console.log('\nPublish complete.');
}