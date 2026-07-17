import type { WikiConfig } from '../config/index.js';

export interface WikiPage {
  /** Full path from wiki root e.g. /WikiNode/Data Model/myprefix_leaverequest */
  path: string;
  /** Markdown content */
  content: string;
}

/**
 * The HTTP seam. Production passes nothing and gets global `fetch`; a test
 * passes a hand-written fake and gets a real assertion boundary.
 *
 * This exists because the alternative — stubbing global `fetch` — mostly
 * asserts the stub works (decisions.md). An injected client means the ordering
 * logic in sortPagesForPublish, the eTag round-trip and the PAT guard are
 * tested as themselves, with no mocking framework involved.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * The outcome of one page's publish attempt.
 *
 * This exists because returning `void` made a wholly-failed publish
 * indistinguishable from a clean one: every error was swallowed into a
 * console.error, so `index.ts` counted every page as published and the run
 * exited 0. The caller cannot report honestly on what it cannot see.
 */
export interface PublishResult {
  path: string;
  success: boolean;
  /** Present only when success is false. */
  reason?: string;
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

/**
 * The nearest ancestor of `path` that is itself a CONTENT page, skipping over
 * any number of placeholder gaps in between — or null if none exists (path is
 * a true independent root). Used instead of the immediate parent so that a
 * content page separated from its real content ancestor by one or more
 * placeholder folders (e.g. content /Root/Data Model, placeholder
 * /Root/Data Model/Widget, content /Root/Data Model/Widget/Columns) is still
 * recognised as that ancestor's descendant, not an unrelated root competing
 * with it on full-path string comparison.
 */
function nearestContentAncestor(path: string, pagePaths: Set<string>): string | null {
  const parts = path.split('/').filter(Boolean);
  // i >= 0, not i > 0: i === 0 checks the literal wiki root '/' as a
  // candidate ancestor, which matters whenever '/' is itself a content page
  // (a single-segment page's only possible ancestor is the root).
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = '/' + parts.slice(0, i).join('/');
    if (pagePaths.has(candidate)) return candidate;
  }
  return null;
}

// -----------------------------------------------
// Sort pages so siblings publish Z→A
// ADO sidebar shows newest-first, so Z→A publish = A→Z display
// Parents are always published before their children
// -----------------------------------------------
function sortPagesForPublish(pages: WikiPage[]): WikiPage[] {
  const pagePaths = new Set(pages.map(p => p.path));

  // A duplicate INPUT path would otherwise be dropped with no trace: the
  // dedupe below (visited) keeps only the first occurrence, silently
  // discarding every later page's real content. Warn once per colliding path
  // before that happens, so it is visible in the run log instead of only in
  // a diff between what was meant to publish and what did.
  const pathCounts = new Map<string, number>();
  for (const page of pages) {
    pathCounts.set(page.path, (pathCounts.get(page.path) ?? 0) + 1);
  }
  for (const [path, count] of pathCounts) {
    if (count > 1) {
      console.warn(
        `  ⚠ Wiki page path collision: ${count} pages share the path "${path}" — ` +
        `only the first will be published, the rest are silently dropped.`
      );
    }
  }

  // Group pages by their nearest CONTENT ancestor, not their immediate
  // parent — the immediate parent is often a placeholder, which is never
  // itself in `pages`, so grouping on it alone left a page like
  // /Root/Data Model/Widget/Columns with no group to belong to at all.
  const grouped = new Map<string, WikiPage[]>();
  for (const page of pages) {
    const ancestor = nearestContentAncestor(page.path, pagePaths);
    if (ancestor === null) continue;
    const siblings = grouped.get(ancestor) ?? [];
    siblings.push(page);
    grouped.set(ancestor, siblings);
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

  // Start from root pages — those with no CONTENT ancestor at any depth, not
  // just an immediate one. A content page one level below a placeholder used
  // to be misclassified as a root purely because its immediate parent wasn't
  // itself a content page, so it competed on full-path string comparison
  // against completely unrelated subtrees and could sort — and therefore
  // publish — before its own real ancestor.
  const roots = pages.filter(p => nearestContentAncestor(p.path, pagePaths) === null);

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
async function getPage(config: WikiConfig, pagePath: string, doFetch: FetchLike): Promise<WikiPageGetResult | null> {
  const url = `${buildBaseUrl(config)}?path=${encodeURIComponent(pagePath)}&api-version=7.0`;

  const response = await doFetch(url, {
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
  doFetch: FetchLike,
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

  const response = await doFetch(url, {
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
async function ensurePage(config: WikiConfig, pagePath: string, doFetch: FetchLike): Promise<void> {
  const existing = await getPage(config, pagePath, doFetch);
  if (!existing) {
    const title = pagePath.split('/').filter(Boolean).pop() ?? pagePath;
    await putPage(config, pagePath, `# ${title}\n`, doFetch, undefined);
  }
}

// -----------------------------------------------
// Main publish function
// -----------------------------------------------
export async function publishToWiki(
  config: WikiConfig,
  pages: WikiPage[],
  doFetch: FetchLike = fetch
): Promise<PublishResult[]> {
  console.log(`\nPublishing ${pages.length} pages to ${config.wikiIdentifier}...`);
  console.log(`Organisation: ${config.organisation} · Project: ${config.project}\n`);

  // ---- Validate PAT before doing anything ----
  if (!config.pat || config.pat.trim() === '' || config.pat.trim().toUpperCase() === 'REDACTED') {
    throw new Error('Wiki PAT is missing or REDACTED — set it in doc-gen.config.yml or via the WIKI_PAT pipeline variable.');
  }

  // Quick auth check — GET the wiki root
  const testUrl = `https://dev.azure.com/${encodeURIComponent(config.organisation)}/${encodeURIComponent(config.project)}/_apis/wiki/wikis/${encodeURIComponent(config.wikiIdentifier)}?api-version=7.0`;
  const testResponse = await doFetch(testUrl, {
    headers: { 'Authorization': buildAuthHeader(config.pat) },
  });
  if (testResponse.status === 401 || testResponse.status === 403) {
    throw new Error(`Wiki auth failed [${testResponse.status}] — check your PAT has Wiki read/write permissions.`);
  }
  if (!testResponse.ok) {
    throw new Error(`Wiki connection failed [${testResponse.status}] — check organisation, project and wikiIdentifier in config.`);
  }

  const results: PublishResult[] = [];
  const pageByPath = new Map(pages.map(p => [p.path, p]));
  // Shared across both helpers below so a path is ensured/published exactly
  // once, however many times it's reached as someone else's ancestor.
  const handled = new Set<string>();

  // Publishes one page (content or a synthesised placeholder), recording the
  // outcome. Shared by both the real content pages below and by a content
  // page reached early as an ancestor.
  async function publishOne(path: string, content: string): Promise<void> {
    try {
      const existing = await getPage(config, path, doFetch);
      await putPage(config, path, content, doFetch, existing?.eTag);
      results.push({ path, success: true });
    } catch (err) {
      const reason = (err as Error)?.message ?? String(err);
      console.error(`  ✗ Failed: ${path}`, err);
      results.push({ path, success: false, reason });
    }
  }

  // Ensures every ancestor of `path` exists, shallowest first, BEFORE `path`
  // itself is published. An ancestor that is itself a content page is
  // published here as content, not stubbed as a placeholder — this is the
  // fix: ancestor-ensuring and content-publishing used to be two disjoint
  // phases (all placeholders, THEN all content), so a placeholder nested
  // under a content page — e.g. a content "Data Model" page with a
  // placeholder "Widget" folder beneath it — was created while its own
  // content-page parent didn't exist yet. Walking the real ancestor chain,
  // content or placeholder, in order removes that possibility structurally
  // rather than special-casing it.
  async function ensureAncestors(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const ancestor = '/' + parts.slice(0, i).join('/');
      if (handled.has(ancestor)) continue;
      handled.add(ancestor);

      const contentPage = pageByPath.get(ancestor);
      if (contentPage) {
        await publishOne(ancestor, contentPage.content);
      } else {
        // Placeholder parents degrade like content pages rather than
        // aborting the run — a transient 500 here must not cost every page
        // beneath it.
        try {
          await ensurePage(config, ancestor, doFetch);
        } catch (err) {
          const reason = (err as Error)?.message ?? String(err);
          console.error(`  ✗ Failed to create parent: ${ancestor} — ${reason}`);
          results.push({ path: ancestor, success: false, reason });
        }
      }
    }
  }

  // Sort pages so siblings publish Z→A → display A→Z in ADO sidebar. Driving
  // the walk in this order — rather than "all placeholders, then all
  // content" — is what lets ensureAncestors interleave a content-page
  // ancestor at exactly the point it's needed, and still preserves the Z→A
  // sibling discipline for both content pages AND the placeholder folders
  // pulled in ahead of them.
  const sortedPages = sortPagesForPublish(pages);

  for (const page of sortedPages) {
    if (handled.has(page.path)) continue; // already published as an ancestor
    handled.add(page.path);
    await ensureAncestors(page.path);
    await publishOne(page.path, page.content);
  }

  console.log('\nPublish complete.');
  return results;
}