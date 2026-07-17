# Development Process

The end-to-end workflow for doing a piece of work on PowerAutoDocs, and the autonomy boundaries around it.

**Read this when:** you are about to start, verify, commit, review or ship any change — or you need to know whether you can proceed without asking Lewis.

---

## Autonomy — what you may do without asking

This replaces the older, vaguer "confirm scope with Lewis before making changes beyond what was asked" rule. That rule made every change a negotiation. It is gone. The line is now drawn at **cost and irreversibility**, not at scope.

| | Action | Notes |
|---|--------|-------|
| 🟢 | Create branches, commit, push | Follow the conventions below |
| 🟢 | Open a PR, review it, **merge it to `main`** | Single-author repo — you are the reviewer; see [The PR is the review](#the-pr-is-the-review) |
| 🟢 | Change `src/config/schema.ts` / `loader.ts` — add or alter config fields | Mirror the change into `samples/doc-gen.config.sample.yml`, or client deployments silently drift |
| 🟢 | Add IR fields, parsers, renderers, serializers | IR **additions** are safe; renames/removals are breaking — see the architecture doc |
| 🟢 | Refactor, rename internal functions, restructure files | Nothing is compile-gated in CI, so `npm run build` locally is on you |
| 🟢 | Update `docs/architecture.jsx`, `README.md`, `.claude/docs/**` | Note `docs/**` on `main` auto-deploys to GitHub Pages |
| 🟢 | Create GitHub issues, move board cards | Add every new issue to the Roadmap board immediately |
| 🔴 | **`npm publish`** | Never. Ever. Manually. `.github/workflows/npm-publish.yml` does it on a GitHub Release. A manual publish from a dev machine ships whatever is in the working tree — including a `doc-gen.config.yml` with a live client PAT. The package was already renamed once (`powerautodoc` → `powerautodocs`) after an accidental client data exposure. |
| 🔴 | **Bump `package.json` version** | The version is Lewis's release signal, not a housekeeping detail. A bump commit is what he pairs with a GitHub Release, and the Release is what fires the publish. Bumping it yourself either strands a version nobody released, or ships one nobody reviewed. |
| 🔴 | **Add any npm dependency** | Real, recurring cost. Clients run `npx powerautodocs@latest` on an **ephemeral ADO agent on every run** (`samples/powerautodocs.pipeline.sample.yml:76`) — nothing is cached between runs, so install weight is paid every time, forever, by every client. It is also a permanent supply-chain and licence surface. Existing deps in `package.json` are **not** blanket permission (see below). |

**Red means ask and wait.** Not "ask and assume yes". There are only three of them; everything else, proceed.

### `package.json` deps are not a menu

`commander`, `handlebars`, `zod`, `adm-zip` and `glob` are declared dependencies that are **imported nowhere in `src/`**. Their presence is not sanction to start using them:

- **`commander`** — CLI parsing is deliberately hand-rolled in `src/index.ts:73-85` (`process.argv` + a `KNOWN_FLAGS` Set). Issue #63 tracks migrating to commander; until that is agreed, do not import it.
- **`handlebars`** — directly contradicts the recorded decision "no templating engine". Do not reach for it.
- **`zod`** — config validation is hand-written (`validateAiEnrichmentConfig`, `src/config/loader.ts:114-149`).

Using one of these is functionally the same as adding a new dependency — it converts dead weight into a load-bearing commitment. Ask first. (Pruning them is a good candidate issue.)

---

## The work loop

### 1. Orient

```bash
git status && git log --oneline -10
gh issue list --repo lewginn/PowerAutoDocs
gh project item-list 3 --owner lewginn --format json --limit 60   # "PowerAutoDocs Roadmap"
```

Find the issue tracking the work before starting. If there isn't one, create it and add it to the board in the same breath — an issue that isn't on the board is invisible:

```bash
gh issue create --repo lewginn/PowerAutoDocs --title "..." --body "..."
gh project item-add 3 --owner lewginn --url <issue-url>
```

Read the files touched by recent commits before modifying them.

### 2. Branch

Three prefixes are in real use, all lowercase-kebab after the prefix, topic-scoped:

| Prefix | For | Real examples |
|--------|-----|---------------|
| `feature/` | New capability | `feature/word-mermaid-diagrams`, `feature/pdf-renderer`, `feature/ai-enrichment` |
| `fix/` | Bug fix | `fix/npm-publish-trigger` |
| `docs/` | Documentation-only | `docs/update-readme` (shipped as PR #96) |

```bash
git checkout -b feature/pcf-parser
```

**The "never push directly to main" rule is narrower than it reads.** Half the history is direct-to-main and that is correct. The actual convention, from `git log --first-parent --no-merges`:

- **Feature and fix code → branch + PR.** Every `feat:` since v1.2.0 came through a PR (#89, #91, #92, #93, #96, #98). No exceptions.
- **Docs, chore, and version bumps → straight to `main`.** e.g. `066fde9` (docs: architecture Phase 4), `0fca815` (chore: add Pages workflow), `ab1ef56` (`1.4.0`).

Don't ceremonially PR a typo fix. Don't push a parser straight to main citing precedent.

### 3. Implement

The architecture invariants live in the architecture doc. The one that matters most: **the IR is the contract — parsers only produce IR, renderers only consume it.**

### 4. Verify

See [Verification](#verification) below. This is the part with no safety net; do not skimp.

### 5. Update `docs/architecture.jsx`

Mandatory after any feature — flip `done: false` → `done: true` for the component.

It is **not** a standalone file. It is imported by `docs-viewer/src/main.jsx:4` (`import App from '../../docs/architecture.jsx'`), a separate tracked Vite/React app with its own `package.json` and `node_modules`, excluded from the root `tsconfig.json`. `.github/workflows/deploy-pages.yml` auto-deploys it to **GitHub Pages on any push to `main` touching `docs/**` or `docs-viewer/**`**. A JSX syntax error breaks a public site, and nothing else will catch it.

Preview before merging:

```bash
npm run docs   # cd docs-viewer && npm run build && npx serve dist
```

### 6. Commit

**Conventional Commits — the prefix is required.** Every commit *you* write since `53fdc5d` has one: `feat:` / `fix:` / `docs:` / `chore:`. The prefixless exceptions in history are all things you are not writing: GitHub's own `Merge pull request #NN …` commits, bare version bumps (`ab1ef56` = `1.4.0`), and one legacy squash (`31e7228` "Feature/GitHub project backfill (#89)").

- Subject: imperative, ~72 chars. `feat: embed Mermaid diagrams as images in Word output`
- Body: **explains WHY, not what.** The diff already says what. Cover the rationale, the trade-off, the rejected alternative, and any incidental bug found along the way. `a7c803d` runs 20 lines of prose and is the reference; `60a5df4` explains an entire rejected approach and why it was wrong. Match that depth.
- Footer: `closes #N` (auto-closes on merge to main) then the co-author trailer.

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

On the bare version-bump exception above (`1.4.0`, `1.2.0`): those are Lewis's `npm version` commits touching only `package.json` + `package-lock.json`. You are not writing those (🔴).

### 7. Push — read [the git identity gotcha](#the-git-identity-gotcha-read-this-before-your-first-push) first

### 8. Open the PR

```bash
gh pr create --title "..." --body "..."
```

House style, from PR #98:

```markdown
## Summary
- Bulleted. Each bullet explains why, not just what. Name the trade-off.
- Call out any pre-existing bug fixed in passing.

closes #N

## Test plan
- [x] `npm run build` / `npx tsc --noEmit` clean
- [x] Generated Word doc end-to-end against real client solution data, `wordDiagrams: true` and `false`
- [x] Verified `nodes.ts`, `MarkdownSerializer.ts`, `flowRenderer.ts` are byte-identical to `main` — wiki output provably untouched
- [x] Inspected generated docx XML: native `w:numPr` lists across 5 nesting levels, embedded PNG media

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Boxes get ticked because you **ran** the thing, not because you intend to.

#### The PR is the review

`git log --format='%an' -20` → 20/20 Lewis Ginn. PRs are self-merged. There is no second human, no external reviewer, and **no CI on pull requests at all** — `.github/workflows/` has exactly two workflows and neither has a `pull_request:` trigger. A green PR means nothing; it means no checks ran.

So the PR body *is* the review artifact and the durable record. Write it as the thing a future agent reads to understand what was actually verified — because nobody is going to catch what you skipped.

### 9. Merge

Merge it yourself (🟢). Two styles are both in use, and the observable rule is:

- **Multi-commit feature branches → merge commit.** `Merge pull request #98 from lewginn/feature/word-mermaid-diagrams` (1ad7d01). #91 kept all its commits, #98 kept all 3. Individual commits survive — so **each one must stand alone** with a proper conventional-commit subject and body.
- **Small single-purpose fixes → squash.** #93 → `9fbd085`, #89 → `31e7228`, landing as one commit with a trailing `(#N)`.

### 10. Confirm the board moved

`closes #N` closes the *issue*; the board card is a separate object and the sync is **not** reliable. The documented failure mode has actually happened and is still sitting there: **issue #1 "AI Enrichment Layer" is closed and shipped in v1.3.0, but its card still reads `In Progress`** — the stalest card on the board. Check yours, and move it to `Done` by hand if needed.

(PRs #89/#91/#92/#93/#96/#98 are absent from the board. That is correct — the board tracks issues, not PRs.)

---

## Verification

### There is no test suite. None. Anywhere.

No jest, vitest or mocha. No `*.test.ts`, no `*.spec.ts`, no `__tests__` outside `docs-viewer/node_modules` (third-party packages' own tests). No `test` script in `package.json`. No eslint/prettier/biome config at the root.

This is deliberate and it is not your invitation to fix it. **Any test runner is a new npm dependency (🔴).** Do not scaffold one. Do not invent test files.

There is also **no CI compile gate**: `npm run build` is executed only by `npm-publish.yml`, i.e. *after* a release is cut. A PR can be merged with a TypeScript error and it will surface when Lewis cuts a release. **Building locally before you push is mandatory, not optional — it is the only compile gate in the entire process.**

### What "verified" actually means here

**1. It compiles.**
```bash
npm run build      # tsc → dist/, then addShebang + chmod
npx tsc --noEmit   # type-only check (there is no `typecheck` script, despite PR #98 citing this)
```

**2. It runs end-to-end against real unpacked client solution data.** All four pipe stdout+stderr to `dev.log` (gitignored):
```bash
npm run dev        # tsx src/index.ts          — config drives output
npm run dev:word   # --word                    — Word only
npm run dev:wiki   # --wiki                    — Wiki only
npm run dev:both   # --word --wiki             — both
```
There is no `dev:pdf` script — use `npx tsx src/index.ts --pdf`. Any output flag is the *explicit selection*: unlisted formats are suppressed even if enabled in config (`src/index.ts:107-115`).

Requires a `doc-gen.config.yml` in cwd, or `DOC_GEN_CONFIG_DIR`. **Careful:** if it is absent, `loadConfig` warns and silently falls back to `CONFIG_DEFAULTS` (`src/config/loader.ts:165-168`) rather than failing — a missing config looks like a clean run against `./unpacked`.

**3. A clean exit code proves nothing.** `src/index.ts:441-442` exits 1 only if `solutionsSkipped` or `publishFailures` are non-empty. Parse warnings grade as "⚠ Completed with warnings" and exit 0. AI summary failures don't even do that — they're printed as a count block (`src/logger.ts:63-71`) but are excluded from the status line (`src/logger.ts:74-75` derives `hasWarnings` from `parseWarnings` alone), so an AI-only failure still reads "✓ Completed successfully" and exits 0. Diagram rendering degrades to a console warning — on a machine with no Chrome/Edge you get a clean run and a diagram-free `.docx`. **Read `dev.log` and inspect the artifact.**

**4. Prove the other formats are untouched.** For anything touching the shared DocNode layer, this is the only regression net that exists — a Word change can silently break Wiki output for every existing client. The technique, from PR #98:

```bash
git diff main --stat -- src/docmodel/nodes.ts src/docmodel/MarkdownSerializer.ts src/renderers/
```
Byte-identical to `main` = wiki output *provably* untouched. Say so in the PR.

### Inspecting a generated `.docx`

A `.docx` is a zip. You do not need Word installed to assert on indentation, list semantics or embedded media:

```bash
unzip -l output/solution-documentation.docx          # parts manifest
unzip -p output/solution-documentation.docx word/document.xml > /tmp/doc.xml
```

Then assert on the OOXML directly:

```bash
python3 -c "
d = open('/tmp/doc.xml').read()
print('embedded images:', d.count('<a:blip'))     # → 23, matches .powerautodocs-diagram-cache/
print('native list refs:', d.count('<w:numPr'))   # → 272; zero means bullets regressed to fake indents
import re; print(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', d)[:8])
"
```

- `word/numbering.xml` **present** ⇒ native Word lists survived. Its absence is the `60a5df4` regression: hand-rolled per-depth `indent` values are "a plain paragraph wearing a bullet costume" — no list semantics, so renderers lay them out however they like.
- `<a:blip>` count should equal the PNG count in `.powerautodocs-diagram-cache/`.
- Count `<a:blip>` and `<w:numPr>` on `main` first, then compare. Absolute numbers mean little; deltas mean everything.

**Do not verify `.docx` in macOS Pages.** Pages renders `.docx` unreliably — it mangles manual paragraph indents (it flattened the `60a5df4` bullet staircase into a near-vertical column). Ironically that made it useful *once*, as the canary that exposed the fake-bullet bug — but as a general check it will report failures that aren't real and hide ones that are. **Use real Word (or Word Online), or LibreOffice.**

### Inspecting a generated `.pdf`

Poppler is not installed — `pdftotext`, `mutool`, `qpdf` and `pypdf` are all absent, and the Read tool's PDF mode fails without `pdftoppm`. `pdfmake` writes text as `[<hex>] TJ`, **not** `(literal) Tj`, so the usual paren-based extraction silently returns zero tokens and reads as "the PDF is empty" when it isn't. Inflate the streams and decode the hex:

```python
import re, zlib
data = open('output/solution-documentation.pdf','rb').read()
out = []
for s in re.findall(rb'stream\r?\n(.*?)\r?\nendstream', data, re.S):
    try: c = zlib.decompress(s)
    except Exception: continue
    for h in re.findall(rb'<([0-9A-Fa-f]+)>', c):
        out.append(bytes.fromhex(h.decode()).decode('latin-1'))
print(len(out), ''.join(out)[:80])
# → 33719 'Table of ContentsOverview4Summary4Solutions4Data Model5...'
```

---

## The git identity gotcha (read this before your first push)

**This machine is authenticated to two GitHub accounts** — `lewginn` (active) and `barvaapp` — and `git config credential.helper` is **`osxkeychain`**.

`gh auth switch` changes which account the **`gh` CLI** acts as. It does **not** change git push auth. The osxkeychain-cached credential for `github.com` wins, so `git push` keeps using the *other* account's token and fails with a **403 naming an account you didn't choose** — while `gh auth status` cheerfully reports you're logged in as the right one. The error points at authorisation; the cause is a stale keychain entry.

Fix, after any account switch:

```bash
gh auth setup-git   # rewrites git's credential config to route through gh
```

Verify before assuming:

```bash
gh auth status                      # which account is active
git config --get-all credential.helper
git push                            # the only real test
```

This cost real time. Reach for `gh auth setup-git` the moment a push 403s with the wrong account name in the message, rather than re-authenticating from scratch.

---

## Release — Lewis's call, always

The full chain, for context when diagnosing "the publish didn't happen":

1. **Lewis** bumps the version — a bare-number commit touching only `package.json` + `package-lock.json` (`ab1ef56` = `1.4.0`), the `npm version` default format. 🔴 Not you.
2. **Lewis** tags and creates a GitHub Release. Tags are `v`-prefixed (`v1.2.0`, `v1.3.0`, `v1.4.0`); releases are titled descriptively — "v1.4.0 — PDF output", "v1.3.0 - AI Enrichment".
3. **GitHub Actions** publishes. `.github/workflows/npm-publish.yml`: Node 20, `npm ci && npm run build && npm publish` with `NODE_AUTH_TOKEN: secrets.NPM_TOKEN`.

Current version: **1.4.0**. (Expect this line to be stale — trust `package.json`.)

### The v1.4.0 incident, so you don't re-derive it

The workflow originally fired on `release: types: [created]`. `created` does not fire when a **draft** release is later published via the UI — only `published` does. **v1.4.0 silently skipped its npm publish.** Fixed in PR #93: it now listens on `[created, published]` and adds `workflow_dispatch` as a manual escape hatch:

```bash
gh workflow run "Publish to npm"    # re-trigger without a release event
```

If a publish appears not to have happened, check the Actions tab for a *missing* run before assuming a *failed* one.

### Node version

`package.json` declares `engines.node >= 18`. Nothing actually exercises Node 18 — `npm-publish.yml` uses Node 20 and `samples/powerautodocs.pipeline.sample.yml` pins `20.x`. Treat `>=18` as an untested claim, not a verified floor.

---

## Files that look committed but aren't

`ls` shows plenty that git does not. Everything below is gitignored and holds **real client data or a live secret**:

| Path | Contents |
|------|----------|
| `doc-gen.config.yml` | **A real live 84-char ADO PAT.** Never `cat`, echo, paste or quote it. The tracked template is `samples/doc-gen.config.sample.yml` (`pat: REDACTED`). |
| `unpacked/` | Real client solutions, unpacked. Do not name them outside this working tree. |
| `output/` | Generated client docs — `.docx` / `.pdf` |
| `dev.log` | Full run output, client component names throughout |
| `.powerautodocs-ai-cache.json` | 57 entries of real client flow names + AI summaries |
| `.powerautodocs-diagram-cache/` | 23 rendered PNGs of client ERDs and flows |

The "commit the AI cache so re-runs are diffable in PR review" decision applies to a **client project repo consuming powerautodocs**, not to this repo. Here it is ignored (`.gitignore:44`) precisely because it contains client names.

**`.gitignore` is the only guardrail and it works by path, not by content.** Pasting `dev.log` into an issue, quoting a cache entry in a PR body, or attaching an `output/*.docx` to a GitHub comment defeats it entirely. So does `git add -f`. Note also `unpackSolutions/` is not directory-ignored — only its `*.zip` contents are (`.gitignore:32`), so any other artifact dropped there is exposed. **Any new client-data-producing path needs a `.gitignore` entry before its first run.**

### `.claude/` is now committed

Historically this repo's `.gitignore` carried a `*claude.md` pattern which — with `core.ignorecase = true` on macOS — silently swallowed `.claude/CLAUDE.md`. It was untracked and had never been committed, so "update CLAUDE.md after every feature" was a no-op from the repo's perspective. PR #98's body claims it was updated; that half of the change was invisible to git.

That pattern is gone. `.claude/CLAUDE.md` and `.claude/docs/` are **deliberately committed** — they contain no client data and belong versioned alongside the code they describe. Doc changes travel through PRs like everything else, so commit them.

The one `.claude/` path still ignored is `.claude/settings.local.json` — machine-local agent settings, ignored via the **global** gitignore (`~/.config/git/ignore`), not this repo's. Nothing in this repo's `.gitignore` excludes `.claude/` any more; `git check-ignore -v .claude/<path>` settles any doubt.
