# Hard Constraints

The rules that must never be broken, each with its reason. Everything else in these docs is guidance; this page is not.

**Read this when:** before committing, before adding a dependency, before touching IR types, config schema, Mermaid generators, or anything under `output/` / `unpacked/` / the caches. Skim it at the start of every session.

---

## The two hard stops — ask Lewis first

You may branch, commit, push, open PRs, merge to `main`, and change config/schema on your own judgement. Exactly two things require a human:

| Rule | Why |
|------|-----|
| **Never bump `package.json` `version`, and never run `npm publish` locally.** | Releases are Lewis's call and are automated — `.github/workflows/npm-publish.yml` runs `npm ci` → `npm run typecheck` → `npm test` → `npm run build` → `npm publish` on a GitHub Release (`types: [created, published]`). A manual publish or a stray bump desynchronises the tag, the Release, and the registry. Current version is `1.4.0`. |
| **Never add an npm dependency without asking.** | Every dep ships to clients via `npx powerautodocs@latest` and is a supply-chain and install-time cost on ephemeral ADO agents. `devDependencies` are cheaper (`npm ci --omit=dev`, `files: ["dist"]`) but are **still a 🔴** — ask, and say which bucket. Watch for the trap: `commander` and `zod` sit in `node_modules` as transitive deps of `@mermaid-js/mermaid-cli`/`chromium-bidi`, so importing one compiles locally while being undeclared. An import must be a declared dep. |

---

## Client-data safety

**The package was renamed from `powerautodoc` to `powerautodocs` after an accidental client data exposure.** The old package was unpublished from npm (on 2026-03-27) and no longer resolves at all. That incident is why this section is absolute rather than advisory.

These paths exist on disk right now and all contain **real client material**. Every one is gitignored — `.gitignore` is a path-based guardrail, and it is the only one:

| Path | Contents | Ignored at |
|------|----------|-----------|
| `doc-gen.config.yml` | **A live 84-character ADO PAT** (`:215`) plus client org/project names | `.gitignore:38` (`*doc-gen.config.yml`) |
| `unpacked/` | 8 real client solutions, unpacked | `.gitignore:10` |
| `output/` | Generated client docs (`.docx`, `.pdf`, markdown) | `.gitignore:9` |
| `dev.log` | Full run output — client component names throughout | `.gitignore:14` (`*.log`) |
| `.powerautodocs-ai-cache.json` | 57 entries of real client flow names + AI summaries | `.gitignore:44` |
| `.powerautodocs-diagram-cache/` | 23 rendered PNGs of client ERDs and flows | `.gitignore:47` |

The rules:

- **Never `git add -f` any of the above.** *Why:* they are ignored deliberately, so a force-add is always someone overriding the only safeguard.
- **Never paste their contents anywhere external** — a PR body, a GitHub issue, a commit message, a web search, an AI provider prompt outside the tool's own enrichment path. *Why:* the exposure was a disclosure, not a commit; ignoring a file does not make quoting it safe.
- **Never `cat`, `echo`, or otherwise print `doc-gen.config.yml`.** *Why:* line 215 is a live credential. `REDACTED` appears only in a comment at line 206 — the placeholder convention is the *sample's*, not this file's. Read specific non-secret keys if you must; never dump the file.
- **Never build a test fixture from client data.** `tests/fixtures/` is committed and public; `unpacked/`, `unpackSolutions/`, `output/`, `dev.log` and both caches are not. Copying XML from one to the other launders client data into git history and defeats every other rule on this page. *Why it needs saying:* `unpacked/` is the obvious place to reach for — it is 314 real XML files that already parse — which is exactly what makes it dangerous. Hand-write a fictional solution instead (`tests/fixtures/solutions/ContosoDemo/`, and see `tests/fixtures/README.md`).
- **A new client-data-producing path needs a `.gitignore` entry *before* its first run.** *Why:* it only takes one run and one `git add .`. Note `unpackSolutions/` is not directory-ignored — only `*.zip` inside it (`.gitignore:32`) — so a non-zip artifact dropped there is uncovered.
- **The "commit the AI cache" decision applies to a *client's* repo, not this one.** *Why:* in a client repo the cache makes re-runs deterministic and diffable in review; here it would just be client data in our history. `.gitignore:41-43` spells this out.

The committed, safe artefacts are `samples/doc-gen.config.sample.yml` (where `pat: REDACTED` at `:172` is the real convention) and `samples/powerautodocs.pipeline.sample.yml`. Edit those; never promote a local config into them.

> `.claude/` **is** committed — `git check-ignore` confirms `.claude/CLAUDE.md` and `.claude/docs/` are not ignored, and `.gitignore:49-56` states the intent explicitly. These docs contain no client data and are versioned alongside the code they describe.

---

## Code contracts

- **IR field names on built types are a public contract: additions only.** No renames, no removals, without first checking every renderer usage. *Why:* `src/ir/` is the sole coupling between parsers and renderers (`src/ir/index.ts` is the barrel) — a rename compiles clean in the parser and silently empties a column three layers downstream.

- **Renderers emit `DocNode[]`, never markdown strings.** Builders (`h`, `p`, `pt`, `table`, `cell`, `ct`, `cc`, `bulletList`, `bullet`, `toc`, `mermaid`, `codeBlock`, `bq`, `bqt`, `t`, `c`, `b`, `i`, `lnk`) live in `src/docmodel/nodes.ts` — **not** `rendererUtils.ts`, which holds only `toADOWikiLink()` and `aiSummaryBlock()`. *Why:* one `DocNode[]` feeds three serializers (Markdown → ADO Wiki, Docx → Word, Pdf → PDF); a raw string can only ever feed one, and `docx`/`pdfmake` cannot consume markdown at all.
  - *Known exception, not a licence:* five renderers still export legacy `render*Markdown()` / `write*Markdown()` local-file helpers that call `serialize()` directly (`tableRenderer.ts`, `flowRenderer.ts`, `webResourceRenderer.ts`, `pluginRenderer.ts`, `overviewRenderer.ts`). They work — don't delete them, and don't extend them either. New work goes through the `DocNode` path.

- **Mermaid generators return raw DSL — never a fence.** `mermaidGenerator.ts` and `erdGenerator.ts` both `return lines.join('\n')` with no wrapper; `MarkdownSerializer` adds `:::mermaid`, `DocxSerializer` renders to PNG, `PdfSerializer` returns `null`. *Why:* commit a7c803d fixed exactly this — the ERD generator baked the fence in, `MarkdownSerializer` wrapped it again, and double-fenced ERDs shipped to the wiki undetected. Generalises: **a `DocNode` carries semantic content only; all format syntax belongs to a serializer.**

- **This rule is now enforced mechanically — `tests/renderers/formatBoundary.test.ts`.** It sweeps every renderer that returns `DocNode[]`, asserting no markdown syntax reaches heading text, inline prose or table headers. *Why it exists:* the rule above was written down and then broken anyway — four renderers baked markdown backticks into heading and paragraph text (`h(3, 'Update of \`entity\`')`). That renders correctly in the wiki and emits **literal backticks into the .docx**, because `DocxSerializer` writes heading text verbatim. It went unnoticed precisely because the wiki looked right. *Two things to know:* `HeadingNode.text` is a plain string and cannot carry inlines, so a heading needing code styling gets plain text instead — use a `c()` inline only where the node takes inlines. And a renderer absent from that file's `RENDERED` list is **unguarded**: add yours when you add a renderer, or the sweep silently skips it.

- **Do not use Mermaid node shapes introduced after v8.14.** *Why:* ADO Wiki is pinned to Mermaid 8.14 and silently fails to render newer shapes. `mermaidGenerator.ts:9-20` records the workarounds already made (Foreach uses a rectangle because cylinder isn't in 8.14; Terminate uses a circle because hexagon isn't). The Word PNG path runs `@mermaid-js/mermaid-cli` v11, so a modern shape *will* render correctly in Word and hide the problem — **the same DSL string feeds both outputs, so v8.14 is the binding floor regardless.**

---

## Config

- **Changing `doc-gen.config.yml` structure is allowed — breaking existing client deployments is not.** Be additive by default: new keys optional, with a `CONFIG_DEFAULTS` entry that preserves current behaviour for a config that omits them. *Why:* clients own their own committed config and upgrade implicitly via `npx powerautodocs@latest` — a required key or a renamed one breaks their pipeline on a run they didn't initiate.
- **Mirror any schema change into `samples/doc-gen.config.sample.yml`.** *Why:* it is what clients copy; an unmirrored change means the documented contract and the real one drift apart silently.
- **`src/config/loader.ts` `CONFIG_DEFAULTS` is the single source of truth for defaults.** The `/** Default: X */` JSDoc in `schema.ts` is known-stale and disagrees with the loader on at least `output.word` and `components.environmentVariables.enabled`. *Why:* the loader is what runs; a wrong default read from a comment has real consequences — `showCurrentValue` defaults to `true` (`loader.ts:59`), so a client config omitting the key publishes live environment variable values.

See [config-and-cli.md](config-and-cli.md) for the full field reference.

---

## Docs

- **Update `docs/architecture.jsx` when a feature lands** (flip `done: false` → `done: true`). *Why:* it is the project's public architecture map and the only place the build-status of each component is tracked.
- **It must stay valid JSX — it is a real build, not a note file.** `docs-viewer/src/main.jsx:4` imports it into a Vite/React app, and `.github/workflows/deploy-pages.yml` auto-deploys to **public GitHub Pages** on any push to `main` touching `docs/**`. *Why:* a syntax error breaks a live public site, and no PR check will catch it — preview with `npm run docs` first.
- **CI runs on pull requests, but it is a floor, not a proof.** `.github/workflows/ci.yml` typechecks, builds and tests every PR and every push to `main`; `npm-publish.yml` repeats the checks before publishing. *Why it doesn't let you skip verification:* the suite covers every parser, every renderer, `DocxSerializer` down to a real `word/document.xml`, all four `publisher/*` modules and the AI providers (closed as of #109). It does **not** exercise `PdfSerializer`/`pdfAssembler` (deprecated — planned removal, Lewis 2026-07-17) or a real-browser Mermaid launch — so **no test produces an actual PDF or a cold Puppeteer render.** A green PR says the tested fraction didn't regress; it says nothing about a 200-page run against a real solution. The backtick bug is the standing proof of the gap: every renderer test passed while the `.docx` shipped literal backticks, and it took unzipping one to see. See [process.md](process.md).
