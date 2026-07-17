import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { publishToWiki } from '../../src/publisher/wikiPublisher.js';
import type { FetchLike, WikiPage } from '../../src/publisher/wikiPublisher.js';
import type { WikiConfig } from '../../src/config/index.js';

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------
// Not built from aConfig(): CONFIG_DEFAULTS carries no `wiki` block (wiki is
// optional on DocGenConfig), so there is nothing to deep-merge onto. Typing the
// factory as WikiConfig is what stops it drifting from the schema — a renamed
// field is a compile error here, not a silent pass.
const aWikiConfig = (over: Partial<WikiConfig> = {}): WikiConfig => ({
  organisation: 'contoso',
  project: 'ProjectDelta',
  wikiIdentifier: 'ProjectDelta.wiki',
  parentPath: '/Root',
  pat: 'fake-pat-for-tests',
  ...over,
});

const aPage = (path: string, content = 'body'): WikiPage => ({ path, content });

// -----------------------------------------------------------------------------
// The fake wiki — a hand-written FetchLike, injected through publishToWiki's
// third parameter. Recording calls in an array we own gives exact ordering
// assertions with no mocking framework involved (decisions.md).
// -----------------------------------------------------------------------------
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

type Responder = (path: string) => Response | Promise<Response>;

interface Fake {
  fetch: FetchLike;
  calls: Call[];
}

const json = (status: number, headers: Record<string, string> = {}): Response =>
  new Response('{}', { status, headers });

/** Path a wiki request targets, read back off the query string. */
const pathOf = (url: string): string => new URL(url).searchParams.get('path') ?? '';

const makeFake = (opts: {
  /** Response to the wiki-root auth probe. Defaults to 200. */
  root?: Response;
  /** Response to a page GET. Defaults to 404 — i.e. nothing exists yet. */
  get?: Responder;
  /** Response to a page PUT. Defaults to 200. */
  put?: Responder;
} = {}): Fake => {
  const calls: Call[] = [];

  const fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    });

    // The auth probe hits the wiki itself; every page call carries ?path=.
    if (!url.includes('?path=')) return opts.root ?? json(200);

    const path = pathOf(url);
    if (method === 'PUT') return opts.put ? opts.put(path) : json(200);
    return opts.get ? opts.get(path) : new Response('', { status: 404 });
  };

  return { fetch, calls };
};

const putCalls = (fake: Fake): Call[] => fake.calls.filter(c => c.method === 'PUT');
const putPaths = (fake: Fake): string[] => putCalls(fake).map(c => pathOf(c.url));
const bodyOf = (call: Call): string => JSON.parse(call.body ?? '{}').content;

type ConsoleSpy = MockInstance<(...args: unknown[]) => void>;

let log: ConsoleSpy;
let error: ConsoleSpy;

beforeEach(() => {
  // publishToWiki narrates every page to stdout.
  log = vi.spyOn(console, 'log').mockImplementation(() => {}) as ConsoleSpy;
  error = vi.spyOn(console, 'error').mockImplementation(() => {}) as ConsoleSpy;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const logged = (): string => log.mock.calls.map(c => c.join(' ')).join('\n');

// -----------------------------------------------------------------------------

describe('publishToWiki — PAT guard', () => {
  // A pipeline that sanitises its config leaves the literal REDACTED behind; a
  // missing WIKI_PAT variable leaves an empty string. Either way, the point of
  // the guard is that the operator gets told what to fix instead of a 401.
  for (const pat of ['', '   ', 'REDACTED', 'redacted', '  ReDaCtEd  ']) {
    it(`refuses to send anything when the PAT is ${JSON.stringify(pat)}`, async () => {
      const fake = makeFake();

      await expect(publishToWiki(aWikiConfig({ pat }), [aPage('/Root/A')], fake.fetch))
        .rejects.toThrow(/Wiki PAT is missing or REDACTED/);

      // The guard is worthless if it fires after the credential has been used.
      expect(fake.calls).toHaveLength(0);
    });
  }

  it('names both places a PAT can come from so the message is actionable', async () => {
    const fake = makeFake();
    await expect(publishToWiki(aWikiConfig({ pat: '' }), [], fake.fetch))
      .rejects.toThrow(/doc-gen.config.yml.*WIKI_PAT/);
  });

  it('proceeds with a PAT that merely looks odd', async () => {
    // Only empty/REDACTED are rejected — no other validation should be invented.
    // 'not really redacted' contains 'redacted' as a substring; the guard must
    // match the whole trimmed value, not test for containment.
    const fake = makeFake();
    const results = await publishToWiki(aWikiConfig({ pat: 'not really redacted' }), [], fake.fetch);

    // No pages in, so no results out — but it got past the guard and made the
    // auth check, which is what this asserts.
    expect(results).toEqual([]);
    expect(fake.calls).toHaveLength(1);
  });
});

describe('publishToWiki — auth probe', () => {
  it('throws "Wiki auth failed" on 401 and publishes nothing', async () => {
    const fake = makeFake({ root: json(401) });

    await expect(publishToWiki(aWikiConfig(), [aPage('/Root/A')], fake.fetch))
      .rejects.toThrow(/Wiki auth failed \[401\] — check your PAT has Wiki read\/write permissions/);

    // One probe, then stop. No page traffic on a dead credential.
    expect(fake.calls).toHaveLength(1);
  });

  it('throws "Wiki auth failed" on 403 and publishes nothing', async () => {
    const fake = makeFake({ root: json(403) });
    await expect(publishToWiki(aWikiConfig(), [aPage('/Root/A')], fake.fetch))
      .rejects.toThrow(/Wiki auth failed \[403\]/);
    expect(fake.calls).toHaveLength(1);
  });

  it('distinguishes a wrong org/project/wiki from a bad PAT', async () => {
    // 404 on the root means the wiki identifier is wrong, not the credential —
    // sending the operator to check their PAT here would waste their afternoon.
    const fake = makeFake({ root: json(404) });
    await expect(publishToWiki(aWikiConfig(), [aPage('/Root/A')], fake.fetch))
      .rejects.toThrow(/Wiki connection failed \[404\] — check organisation, project and wikiIdentifier/);
    expect(fake.calls).toHaveLength(1);
  });

  it('throws "Wiki connection failed" on a 500 and publishes nothing', async () => {
    const fake = makeFake({ root: json(500) });
    await expect(publishToWiki(aWikiConfig(), [aPage('/Root/A')], fake.fetch))
      .rejects.toThrow(/Wiki connection failed \[500\]/);
    expect(fake.calls).toHaveLength(1);
  });

  it('still probes when there is nothing to publish', async () => {
    const fake = makeFake();
    await publishToWiki(aWikiConfig(), [], fake.fetch);
    expect(fake.calls).toHaveLength(1);
    expect(putPaths(fake)).toEqual([]);
    expect(logged()).toContain('Publishing 0 pages');
  });
});

describe('publishToWiki — URL building', () => {
  it('percent-encodes organisation, project and wiki identifier', async () => {
    // An org with a space or a project with a slash must not be able to escape
    // its path segment and rewrite the URL.
    const fake = makeFake();
    const config = aWikiConfig({
      organisation: 'Contoso Ltd',
      project: 'Project/Delta',
      wikiIdentifier: 'My Wiki.wiki',
    });

    await publishToWiki(config, [aPage('/A B')], fake.fetch);

    expect(fake.calls[0].url).toBe(
      'https://dev.azure.com/Contoso%20Ltd/Project%2FDelta/_apis/wiki/wikis/My%20Wiki.wiki?api-version=7.0',
    );
    // The page path is a single query parameter, so its slashes and spaces are
    // encoded too — otherwise "/A B" would split the URL.
    expect(putCalls(fake)[0].url).toBe(
      'https://dev.azure.com/Contoso%20Ltd/Project%2FDelta/_apis/wiki/wikis/My%20Wiki.wiki/pages' +
      '?path=%2FA%20B&api-version=7.0',
    );
  });

  it('pins the api-version on every call', async () => {
    // ADO removes preview API versions; a page call silently drifting off 7.0
    // would only surface as a client-side 400 mid-run.
    const fake = makeFake();
    await publishToWiki(aWikiConfig(), [aPage('/Root/A')], fake.fetch);
    expect(fake.calls.every(c => c.url.includes('api-version=7.0'))).toBe(true);
  });
});

describe('publishToWiki — auth header', () => {
  it('sends Basic base64(":" + pat) on the probe and on every page call', async () => {
    // ADO PAT auth is basic auth with an empty username. Getting the colon wrong
    // 401s the whole run.
    const expected = 'Basic OmZha2UtcGF0LWZvci10ZXN0cw=='; // base64(':fake-pat-for-tests')
    const fake = makeFake();

    await publishToWiki(aWikiConfig(), [aPage('/Root/A')], fake.fetch);

    // Probe + GET/PUT of the /Root placeholder + GET/PUT of /Root/A.
    expect(fake.calls).toHaveLength(5);
    for (const call of fake.calls) {
      expect(call.headers['Authorization']).toBe(expected);
    }
  });

  it('sends JSON content type on page reads and writes', async () => {
    const fake = makeFake();
    await publishToWiki(aWikiConfig(), [aPage('/Root/A')], fake.fetch);
    const pageCalls = fake.calls.filter(c => c.url.includes('?path='));
    // Spelled out rather than mapped off pageCalls itself: an expectation built
    // from the same array it is checked against also passes when the array is
    // empty, which is exactly the case where the assertion is worthless.
    expect(pageCalls.map(c => c.headers['Content-Type'])).toEqual([
      'application/json',
      'application/json',
      'application/json',
      'application/json',
    ]);
  });
});

describe('publishToWiki — parent pages', () => {
  it('creates a placeholder for each intermediate path that is not a content page', async () => {
    const fake = makeFake();
    const pages = [
      aPage('/Root/Data Model'),
      aPage('/Root/Data Model/Widget/Columns'),
    ];

    await publishToWiki(aWikiConfig(), pages, fake.fetch);

    // /Root and /Root/Data Model/Widget are structural only, so they are stubbed
    // out first. /Root/Data Model is real content — it must not be stubbed.
    const placeholders = putCalls(fake).slice(0, 2);
    expect(placeholders.map(c => pathOf(c.url))).toEqual(['/Root', '/Root/Data Model/Widget']);
    expect(placeholders.map(bodyOf)).toEqual(['# Root\n', '# Widget\n']);

    // Exactly one PUT per path: the content pages were not also stubbed.
    //
    // BUG: pinned deliberately — not a spec. Two orderings here are wrong:
    //  1. the /Root/Data Model/Widget placeholder is PUT while its own parent
    //     /Root/Data Model does not exist yet, because the ensure pass skips
    //     ancestors that are content pages and publishes them later;
    //  2. /Root/Data Model is published *after* its own descendant, because a
    //     page whose immediate parent is a placeholder is treated as a root by
    //     sortPagesForPublish, and roots sort on the full path, so the longer
    //     path wins. This shape is real: /WikiNode/Automation is a content page,
    //     /WikiNode/Automation/Flows is a placeholder, and the flow pages under
    //     it are content. Reported.
    expect(putPaths(fake)).toEqual([
      '/Root',
      '/Root/Data Model/Widget',
      '/Root/Data Model/Widget/Columns',
      '/Root/Data Model',
    ]);
  });

  it('ensures parents shortest-path-first', async () => {
    // ADO rejects a page whose parent does not exist yet, so depth order here is
    // the difference between a wiki tree and a pile of 404s.
    const fake = makeFake();
    await publishToWiki(aWikiConfig(), [aPage('/A/B/C/D/Leaf')], fake.fetch);

    expect(putPaths(fake).slice(0, 4)).toEqual(['/A', '/A/B', '/A/B/C', '/A/B/C/D']);
  });

  it('leaves an existing parent page alone rather than blanking it', async () => {
    // A placeholder PUT over a real page would replace hand-written wiki content
    // with "# Title" — silent data loss in the client's wiki.
    const fake = makeFake({
      get: path => (path === '/Root' ? json(200, { ETag: 'v1' }) : new Response('', { status: 404 })),
    });

    await publishToWiki(aWikiConfig(), [aPage('/Root/A')], fake.fetch);

    expect(putPaths(fake)).toEqual(['/Root/A']);
  });

  it('needs no parents for a single top-level page', async () => {
    const fake = makeFake();
    await publishToWiki(aWikiConfig(), [aPage('/Overview')], fake.fetch);
    expect(putPaths(fake)).toEqual(['/Overview']);
  });

  it('stubs each shared ancestor exactly once', async () => {
    const fake = makeFake();
    const pages = ['/Root/A/One', '/Root/A/Two', '/Root/B/Three'].map(p => aPage(p));

    await publishToWiki(aWikiConfig(), pages, fake.fetch);

    // /Root is an ancestor of all three but is only stubbed once — three PUTs of
    // "# Root" would be three needless round trips per run.
    expect(putPaths(fake).filter(p => p === '/Root')).toHaveLength(1);
  });

  it('creates placeholder siblings in first-seen order, not Z→A', async () => {
    // BUG: pinned deliberately — not a spec. sortPagesForPublish goes to
    // real trouble to publish content siblings Z→A so ADO's newest-first sidebar
    // displays them A→Z, but placeholder parents never go through it: they are
    // sorted by depth only, and Set insertion order (stable sort) then decides
    // the rest. These three folder names are the real ones wikiAssembler emits
    // under /WikiNode/Automation, in the order it emits them — so the client's
    // sidebar shows Plugins, Classic Workflows, Flows. Reported.
    const fake = makeFake();
    const pages = [
      aPage('/Root/Automation/Flows/Send Email'),
      aPage('/Root/Automation/Classic Workflows/Legacy'),
      aPage('/Root/Automation/Plugins/Contoso.Plugins'),
    ];

    await publishToWiki(aWikiConfig(), pages, fake.fetch);

    expect(putPaths(fake).slice(0, 5)).toEqual([
      '/Root',
      '/Root/Automation',
      '/Root/Automation/Flows',
      '/Root/Automation/Classic Workflows',
      '/Root/Automation/Plugins',
    ]);

    // The content pages under them *are* sorted Z→A, which is what makes the
    // placeholder order stand out as an oversight rather than a choice.
    expect(putPaths(fake).slice(5)).toEqual([
      '/Root/Automation/Plugins/Contoso.Plugins',
      '/Root/Automation/Flows/Send Email',
      '/Root/Automation/Classic Workflows/Legacy',
    ]);
  });
});

describe('publishToWiki — eTag round trip', () => {
  it('echoes the ETag from GET back as If-Match on the PUT', async () => {
    // ADO refuses to overwrite an existing page without If-Match.
    const fake = makeFake({ get: () => json(200, { ETag: '"abc123"' }) });

    await publishToWiki(aWikiConfig(), [aPage('/Overview')], fake.fetch);

    expect(putCalls(fake)[0].headers['If-Match']).toBe('"abc123"');
  });

  it('sends no If-Match at all when the page does not exist yet', async () => {
    // An If-Match on a create is a 412; the header must be absent, not empty.
    const fake = makeFake({ get: () => new Response('', { status: 404 }), put: () => json(201) });

    await publishToWiki(aWikiConfig(), [aPage('/Overview')], fake.fetch);

    expect(putCalls(fake)[0].headers).not.toHaveProperty('If-Match');
  });

  it('sends no If-Match when the page exists but the response carries no ETag', async () => {
    const fake = makeFake({ get: () => json(200) });
    await publishToWiki(aWikiConfig(), [aPage('/Overview')], fake.fetch);
    expect(putCalls(fake)[0].headers).not.toHaveProperty('If-Match');
  });

  it('keeps each page on its own ETag', async () => {
    const fake = makeFake({
      get: path => json(200, { ETag: `etag-for${path}` }),
    });

    await publishToWiki(aWikiConfig(), [aPage('/A'), aPage('/B')], fake.fetch);

    const matched = putCalls(fake).map(c => [pathOf(c.url), c.headers['If-Match']]);
    expect(matched).toEqual([['/B', 'etag-for/B'], ['/A', 'etag-for/A']]);
  });

  it('sends the page content as the JSON body', async () => {
    const fake = makeFake();
    await publishToWiki(aWikiConfig(), [aPage('/Overview', '# Overview\n\nHello')], fake.fetch);
    expect(putCalls(fake)[0].body).toBe(JSON.stringify({ content: '# Overview\n\nHello' }));
  });
});

describe('publishToWiki — logging', () => {
  it('reports Created for a 201', async () => {
    const fake = makeFake({ put: () => json(201) });
    await publishToWiki(aWikiConfig(), [aPage('/Overview')], fake.fetch);
    expect(logged()).toContain('Created: /Overview');
    expect(logged()).not.toContain('Updated: /Overview');
  });

  it('reports Updated for any other success status', async () => {
    const fake = makeFake({ get: () => json(200, { ETag: 'v1' }), put: () => json(200) });
    await publishToWiki(aWikiConfig(), [aPage('/Overview')], fake.fetch);
    expect(logged()).toContain('Updated: /Overview');
    expect(logged()).not.toContain('Created: /Overview');
  });

  it('announces the target before publishing and confirms at the end', async () => {
    const fake = makeFake();
    await publishToWiki(aWikiConfig({ organisation: 'Contoso' }), [aPage('/A')], fake.fetch);
    const out = logged();
    expect(out).toContain('Publishing 1 pages to ProjectDelta.wiki');
    expect(out).toContain('Organisation: Contoso');
    expect(out).toContain('Publish complete.');
  });

  it('never writes the PAT to the log, in plain or encoded form', async () => {
    // Pipeline logs are shipped to ADO and often pasted into tickets. Covers the
    // failure path too — an error message is the likeliest place a credential
    // gets stringified by accident — and the base64 form, since a leaked
    // Authorization header is just as usable as a leaked PAT.
    const pat = 'sentinel-pat-value';
    const encoded = Buffer.from(`:${pat}`).toString('base64');
    const fake = makeFake({
      get: () => new Response('TF401019: denied', { status: 400 }),
    });

    await publishToWiki(aWikiConfig({ pat }), [aPage('/A')], fake.fetch);

    const everything = logged() + '\n' +
      error.mock.calls.map(c => c.map(a => (a instanceof Error ? a.message : String(a))).join(' ')).join('\n');
    expect(everything).toContain('Failed: /A'); // the failure path really ran
    expect(everything).not.toContain(pat);
    expect(everything).not.toContain(encoded);
  });
});

describe('publishToWiki — sibling ordering', () => {
  it('publishes siblings Z→A and parents before children', async () => {
    // Load-bearing: the ADO sidebar orders siblings newest-created-first, so
    // publishing Z→A is what makes the client see A→Z. Input order is scrambled
    // here on purpose — the sort must be doing the work, not the caller.
    const fake = makeFake();
    const pages = [
      aPage('/Root/Alpha/Two'),
      aPage('/Root/Beta'),
      aPage('/Root'),
      aPage('/Root/Alpha/One'),
      aPage('/Root/Alpha'),
    ];

    await publishToWiki(aWikiConfig(), pages, fake.fetch);

    expect(putPaths(fake)).toEqual([
      '/Root',
      '/Root/Beta',        // Beta before Alpha → sidebar shows Alpha, Beta
      '/Root/Alpha',
      '/Root/Alpha/Two',   // Two before One → sidebar shows One, Two
      '/Root/Alpha/One',
    ]);
  });

  it('orders multiple root pages Z→A too', async () => {
    const fake = makeFake();
    const pages = [aPage('/Automation'), aPage('/Overview'), aPage('/Data Model')];

    await publishToWiki(aWikiConfig(), pages, fake.fetch);

    expect(putPaths(fake)).toEqual(['/Overview', '/Data Model', '/Automation']);
  });

  it('sorts on the whole path, so numeric-prefixed siblings reverse cleanly', async () => {
    const fake = makeFake();
    const pages = [aPage('/Root/1 First'), aPage('/Root/2 Second'), aPage('/Root/10 Tenth')];

    await publishToWiki(aWikiConfig(), pages, fake.fetch);

    // localeCompare, not numeric: "2" sorts after "10". The sidebar therefore
    // reads 1, 10, 2 — string order, which is what the sort promises.
    expect(putPaths(fake).slice(1)).toEqual(['/Root/2 Second', '/Root/10 Tenth', '/Root/1 First']);
  });

  it('reads each page immediately before writing it', async () => {
    // The GET/PUT pair must stay adjacent: a batched read phase would let another
    // publisher invalidate every ETag before the writes started.
    const fake = makeFake();
    await publishToWiki(aWikiConfig(), [aPage('/B'), aPage('/A')], fake.fetch);

    expect(fake.calls.map(c => `${c.method} ${pathOf(c.url)}`)).toEqual([
      'GET ',       // the auth probe
      'GET /B',
      'PUT /B',
      'GET /A',
      'PUT /A',
    ]);
  });

  it('drops all but the first page when two pages share a path', async () => {
    // BUG: pinned deliberately — not a spec. sortPagesForPublish dedupes on
    // path via its `visited` set, and the safety-net loop re-checks the same set,
    // so a second WikiPage at an already-visited path is never published and
    // never reported: no PUT, no console.error, and index.ts still counts it in
    // `pagesPublished = pages.length`. Last-write-wins is the usual semantic for
    // an overwriting publisher; first-wins-silently is not. Reported.
    const fake = makeFake();

    await publishToWiki(
      aWikiConfig(),
      [aPage('/Root/Widget', 'first'), aPage('/Root/Widget', 'second')],
      fake.fetch,
    );

    expect(putPaths(fake)).toEqual(['/Root', '/Root/Widget']);
    expect(bodyOf(putCalls(fake)[1])).toBe('first');
    // Silently — nothing told the operator a page was discarded.
    expect(error.mock.calls).toHaveLength(0);
  });

  it('publishes a page the tree walk never reaches', async () => {
    // The safety net. A page at "/" is its own parent, so it is neither a root
    // nor anybody's child and the walk skips the lot — everything then falls
    // through to the append pass in input order.
    const fake = makeFake();
    const pages = [aPage('/'), aPage('/Home'), aPage('/Home/Deep')];

    await publishToWiki(aWikiConfig(), pages, fake.fetch);

    expect(putPaths(fake)).toEqual(['/', '/Home', '/Home/Deep']);
  });
});

describe('publishToWiki — degradation', () => {
  it('logs a page whose GET rejects and carries on with the rest', async () => {
    // A transient socket failure on one page must not cost the other 300.
    const fake = makeFake({
      get: path => {
        if (path === '/Root/Beta') return Promise.reject(new Error('socket hang up'));
        return new Response('', { status: 404 });
      },
    });

    await publishToWiki(aWikiConfig(), [aPage('/Root/Alpha'), aPage('/Root/Beta')], fake.fetch);

    // Beta never reaches a PUT; Alpha — sorted after it — still publishes.
    expect(putPaths(fake)).toEqual(['/Root', '/Root/Alpha']);
    expect(error.mock.calls.some(c => String(c[0]).includes('Failed: /Root/Beta'))).toBe(true);
  });

  it('logs a page whose PUT is rejected by ADO and carries on', async () => {
    const fake = makeFake({
      put: path => (path === '/Root/Alpha' ? new Response('page is locked', { status: 409 }) : json(200)),
    });

    await publishToWiki(
      aWikiConfig(),
      [aPage('/Root/Alpha'), aPage('/Root/Beta'), aPage('/Root/Gamma')],
      fake.fetch,
    );

    // Every page was still attempted, in order.
    expect(putPaths(fake)).toEqual(['/Root', '/Root/Gamma', '/Root/Beta', '/Root/Alpha']);
    const failure = error.mock.calls.find(c => String(c[0]).includes('/Root/Alpha'));
    expect(failure).toBeDefined();
    expect(String((failure?.[1] as Error).message)).toContain('PUT wiki page failed [409]');
    // The response body is surfaced — a 409 with no reason is unactionable.
    expect(String((failure?.[1] as Error).message)).toContain('page is locked');
  });

  it('surfaces the body of a failed GET in the logged error', async () => {
    const fake = makeFake({ get: () => new Response('TF401019: no such wiki', { status: 400 }) });

    await publishToWiki(aWikiConfig(), [aPage('/Overview')], fake.fetch);

    const failure = error.mock.calls.find(c => String(c[0]).includes('/Overview'));
    expect(String((failure?.[1] as Error).message)).toContain('GET wiki page failed [400]');
    expect(String((failure?.[1] as Error).message)).toContain('TF401019');
  });

  it('reports every page as failed when every page fails', async () => {
    // Was pinned: publishToWiki returned Promise<void> and swallowed every error
    // into console.error, so a run where nothing published was indistinguishable
    // from a clean one — index.ts counted all N as published and exited 0.
    const fake = makeFake({ put: () => new Response('nope', { status: 500 }) });

    const results = await publishToWiki(aWikiConfig(), [aPage('/A'), aPage('/B')], fake.fetch);

    expect(results).toHaveLength(2);
    expect(results.every(r => !r.success)).toBe(true);
    expect(results.map(r => r.path).sort()).toEqual(['/A', '/B']);
    // The reason is carried through, not just the fact of failure — it is what
    // the client reads in the run summary.
    expect(results[0].reason).toContain('PUT wiki page failed [500]');
    // Still resolves: one bad page must not cost the rest.
    expect(logged()).toContain('Publish complete.');
  });

  it('reports a mixed run honestly rather than all-or-nothing', async () => {
    // The case that matters most: partial failure must be visible. This is what
    // made 'Published 340 pages' a lie when 339 of them 409'd.
    const fake = makeFake({
      put: path => (path === '/B' ? new Response('conflict', { status: 409 }) : json(200)),
    });

    const results = await publishToWiki(aWikiConfig(), [aPage('/A'), aPage('/B'), aPage('/C')], fake.fetch);

    expect(results.filter(r => r.success).map(r => r.path).sort()).toEqual(['/A', '/C']);
    const failed = results.filter(r => !r.success);
    expect(failed).toHaveLength(1);
    expect(failed[0].path).toBe('/B');
    expect(failed[0].reason).toContain('409');
  });

  it('degrades rather than aborting when a parent placeholder fails', async () => {
    // Was pinned: parent creation sat outside the try/catch protecting content
    // pages, so the same transient 500 tolerated on a page was fatal on a
    // placeholder and no content page published at all.
    const fake = makeFake({
      put: path => (path === '/Root' ? new Response('boom', { status: 500 }) : json(200)),
    });

    const results = await publishToWiki(aWikiConfig(), [aPage('/Root/A'), aPage('/Root/B')], fake.fetch);

    // The placeholder failure is reported...
    const rootResult = results.find(r => r.path === '/Root');
    expect(rootResult?.success).toBe(false);
    expect(rootResult?.reason).toContain('PUT wiki page failed [500]');

    // ...and the content pages beneath it still published, which is the point.
    expect(putPaths(fake)).toEqual(expect.arrayContaining(['/Root', '/Root/A', '/Root/B']));
    expect(results.filter(r => r.success).map(r => r.path).sort()).toEqual(['/Root/A', '/Root/B']);
  });
});
