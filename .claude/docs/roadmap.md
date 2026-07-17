# Roadmap

Phase status, what each remaining phase targets, and the open backlog mapped to GitHub issue numbers.

**Read this when:** you need to know what is already shipped vs planned, which issue tracks the work you are about to start, or where a new component sits in the delivery plan.

---

> ## ⚠️ This is a point-in-time snapshot — verify before you trust it
>
> Captured **2026-07-17** against package version **1.4.0**. Issue state changes constantly and this file does not update itself. Before acting on anything below, run:
>
> ```bash
> gh issue list --repo lewginn/PowerAutoDocs --state open --limit 40
> gh project item-list 3 --owner lewginn --limit 100
> ```
>
> If the live output disagrees with this doc, **the live output wins** — then fix this doc. The old `CLAUDE.md` rotted precisely because it hardcoded issue numbers and never re-checked them (it cited #67 and #69 as live examples of open work more than a month after both were closed and Done).

---

## Phase table

**`docs/architecture.jsx` is the authoritative phase numbering** — it is committed, it is published to GitHub Pages, and its phases match what actually shipped. Use these names and numbers.

| Phase | Name | Status | Tracks |
|-------|------|--------|--------|
| Phase 1 | Core Pipeline & Data Model | ✅ Complete | #71–#80 |
| Phase 2 | Forms, Views & Filters | ✅ Complete | #81–#88 |
| Phase 3 | Component IR Models & Renderers | ✅ Complete | #37–#52 |
| Phase 4 | AI Enrichment & Delivery Formats | ✅ Complete | #1, #67, #68, #69, #94 |
| Phase 5 | Extended Components & Configuration | 🔲 Planned | #54–#59, #61, #63, #90 |
| Backlog | Future Enhancements | 🔲 Planned | #53, #60, #62, #64, #65, #66, #70 |

Source: `docs/architecture.jsx:227-312`. Phases 1–4 are complete and producing real output against live client solutions.

### Do not use the old CLAUDE.md phase table

The pre-split `.claude/CLAUDE.md` carried a **different and wrong** phase table (its lines 472-486):

| Old CLAUDE.md said | Reality |
|---|---|
| Phase 3 — "Automation, Code & Pipeline" | Phase 3 is *Component IR Models & Renderers* |
| Phase 4 — "Extended Components", 🔲 Planned | Phase 4 is *AI Enrichment & Delivery Formats*, ✅ **Complete** |
| Phase 5 — "Advanced & Delivery", 🔲 Planned | Phase 5 is *Extended Components & Configuration* |

The two documents had drifted into describing different plans. The old table also contradicted itself within its own file — it listed Phase 4 as "Planned" while a note four lines below admitted AI enrichment, Word, PDF, Mermaid→PNG and the dependency resolver were all "built and shipped". That contradiction is resolved here in favour of `architecture.jsx`.

---

## What shipped in Phase 4 (for context — do not rebuild these)

All closed, all wired, all on the board as Done:

| Issue | Item | Where it lives |
|-------|------|----------------|
| #1 | AI Enrichment Layer — summaries, caching, providers | `src/enrichment/aiSummariser.ts`, `src/enrichment/providers/` |
| #94 | Word renderer — DocNode + DocxSerializer + docAssembler | `src/docmodel/DocxSerializer.ts`, `src/publisher/docAssembler.ts` |
| #67 | PDF renderer — DocNode + PdfSerializer + pdfAssembler | `src/docmodel/PdfSerializer.ts`, `src/publisher/pdfAssembler.ts` |
| #69 | Dependency resolver — flow ↔ table cross-links | `src/enrichment/dependencyResolver.ts` |
| #68 | Mermaid → PNG — embedded diagrams in Word | `src/enrichment/mermaidRenderer.ts` |

**#68 closed 2026-07-17** — it is the most recent completion and the reason this snapshot exists. If you are reading a doc that still lists Mermaid→PNG as planned, that doc is stale.

---

## Phase 5 — Extended Components & Configuration (planned)

Nine open issues. Seven are new Power Platform component types following the standard parser → IR → renderer shape; one is config, one is CLI.

| Issue | Item | MoSCoW |
|-------|------|--------|
| #54 | Business Process Flow Model & Parser & Renderer | S |
| #55 | Column Security Profile Model & Parser & Renderer | S |
| #56 | Routing Rule Set Model & Parser & Renderer | S |
| #57 | Custom Connector Model & Parser & Renderer | S |
| #58 | Duplicate Detection Rule Model & Parser & Renderer | C |
| #59 | SLA Model & Parser & Renderer | C |
| #61 | Service Endpoint Model & Parser & Renderer | C |
| #63 | CLI flags with commander | — |
| #90 | AI Enrichment: configurable summary tone/length per client | enhancement |

Every component issue here is the same job: add an IR type, a parser, a renderer, config toggles, and wire it into **all three** assemblers. See the add-a-parser wiring checklist before starting — missing the PDF assembler is the classic silent failure.

### #63 "CLI flags with commander" — read the title carefully

CLI flags are **already shipped** — flag parsing is hand-rolled off `process.argv` in `src/index.ts:73-85` with a `KNOWN_FLAGS` set. Do not conclude from the issue being open that `--word`/`--wiki`/`--pdf`/`--regenerate-ai` don't work. They do.

**#63's scope changed on 2026-07-17.** It was *migrate the hand-rolled parser to the already-installed commander*. `commander` has since been pruned (it was declared but never imported), so #63 now means **adding a dependency back** — a 🔴 needing Lewis's approval, weighed against a hand-rolled parser that works. Note `commander` still resolves locally as a transitive dep of `@mermaid-js/mermaid-cli`, so an import would compile and still be undeclared; that is a trap, not a green light.

---

## Backlog — Future Enhancements (planned, lower priority)

| Issue | Item | MoSCoW |
|-------|------|--------|
| #53 | PCF Control Model & Parser & Renderer | C |
| #60 | Dashboard Model & Parser & Renderer | C |
| #62 | Power Pages Model & Parser & Renderer | C |
| #64 | Auto-trigger pipeline — push / scheduled | S |
| #65 | Git-based changelog | C |
| #66 | IR JSON artifact export | C |
| #70 | Complexity scorer | C |

**Canvas App Source** is marked `moscow: "W"` (won't) in `docs/architecture.jsx:40` and has no issue — deliberately out of scope. **Confluence Renderer** is likewise `W` (`architecture.jsx:141`) — low priority, most clients are on ADO.

---

## Open work outside the phase plan

| Issue | Item | Board status |
|-------|------|--------------|
| #97 | Plugin source code linking — read `.cs` source for plugin steps | Todo |
| #102 | CI pipeline + Vitest test suite | Done — first pass shipped |
| #103 | `MarkdownSerializer` emits a short row for a ragged table | Todo |
| #109 | Test coverage: publisher, pipeline entry point, enrichment | Done — closed the last gaps |
| #110 | **42 defects found by #109 — pinned, not fixed** | Todo — the real follow-on |

#97 is the newest substantive issue (opened 2026-06-10) and is not slotted into a phase block in `architecture.jsx`. If you pick it up, add it to a phase block or accept that it lives outside the published roadmap.

**#109 closed the remaining gaps: the suite is now 1090 tests, ~3s.** CI (`ci.yml`) typechecks, builds and tests every PR. Coverage is **every module with runtime behaviour** — all 17 parsers, all 14 renderers, `MarkdownSerializer`, `DocxSerializer` (asserted against a real unzipped `.docx`), `wordTheme`, `erdGenerator`, `config/loader`, all four `publisher/*` modules, `logger`, `main()`, and the enrichment layer including the AI providers.

Getting there needed three seams opened in source, not mocks — `main()` was unimportable, `publishToWiki` called bare `fetch()`, `enrichWithAiSummaries` resolved its own provider. The suite is still **mock-free**. See [decisions.md](decisions.md#vitest-and-a-suite-that-deliberately-stops-short) for why that property is worth protecting.

Still uncovered, and each is a decision rather than a gap: `PdfSerializer` and `pdfAssembler` (PDF deprecation, below), and the real-browser Mermaid render (the cache-hit path and the 3× conversion are covered; only the Chrome launch is not).

**The `config/` row is finished and looks unfinished.** `defaults.ts`, `renderOptions.ts` and `schema.ts` are constants and types; `config/index.ts` is re-exports. `loader.ts` is the only runtime and is covered. A coverage table will keep reporting 1-of-4 forever — that is correct, not a to-do.

**PDF output is planned for deprecation** (Lewis, 2026-07-17; **re-confirmed 2026-07-17** when #109 asked whether `pdfAssembler` should be covered — the answer was no, on this decision). This is why `PdfSerializer` (419 lines) and `pdfAssembler` (222 lines) are the only untested runtime in the repo while their Word twins are both covered. Nothing has been removed yet and `output.pdf` still works — but do not invest in PDF features, tests or refactors without confirming the plan still holds. If it goes, `pdfmake` and `@types/pdfmake` go with it, which is a further dependency saving on every client run.

**Their untested-ness is load-bearing in one direction:** `pdfAssembler` mirrors `docAssembler` section-for-section, so a component added to all three assemblers now has a covered Word path and an uncovered PDF one. The classic silent failure named above ("missing the PDF assembler") will no longer be caught by the suite for PDF. That is the accepted cost of not investing in a format on its way out — not an oversight to fix.

**Writing those tests found ten defects, and that — not the tests themselves — is the argument for the remaining coverage.** Every one had been shipping to clients undetected, and none was found by reading the code; they surfaced the moment something asserted on real output. **All ten are now fixed.**

**The argument then repeated itself, four times over.** #109's pass over `publisher/*`, `main()`, `logger` and enrichment found **42 more** (tracked on #110). Same shape: all shipping, none visible by reading. The two worth knowing without opening the issue —

- **A wiki page-path collision silently deletes a table's docs.** `s()` is many-to-one, so two tables whose display names sanitise identically (`A/B` and `A-B`) emit two complete page sets at one path. The publisher PUTs one over the other and `sortPagesForPublish` drops the duplicate. One real table's entire documentation vanishes from the client's wiki. No error, green pipeline.
- **A wholly-failed publish reports success.** `publishToWiki` swallows every per-page error into `console.error` and returns `void`, so `index.ts`'s `Array.isArray(results)` branch is permanently dead and the `else` sets `pagesPublished = pages.length` unconditionally. Every page can fail and the client still reads "Published 340 pages… ✓ Completed successfully", exit 0.

**Count the debt with `grep -rn "it('BUG:" tests/`.** It returns the pinned tests, one line each — that is the whole rule, and it is worth stating precisely because the first version of this paragraph got it wrong. It claimed `grep -rn 'BUG:' tests/` returned ~35; it returned 8, because most pins were tagged `KNOWN GAP` instead and the two conventions had drifted apart within one PR. A reader following the documented command would have seen a quarter of the debt and believed it was all of it. Tags are now standardised on `BUG:` **in the test title**, so one grep is exhaustive.

The old instruction here ("keep it that way, or pin the reason") was written when the count was zero. The pins each carry a reason, a source line, and a note on whether the behaviour might be intentional — but treat them as **debt and a prompt to fix the source, not a settled state**. The ten above were fixed in the pass that found them; these were not, only because 42 is a different size of job from 10. **A pin is a deferral, not a decision.**

| Fixed | Why it mattered |
|---|---|
| `tableParser` dropped **every** description and plural name | `getEnglishLabel` hardcoded a `<displayname>` child while being handed `<Descriptions>`/`<LocalizedCollectionNames>`. The Description column was blank on every table page — in a documentation tool. |
| Email merge fields lost their spaces | `order{number}has shipped` in every subject and body with a mid-sentence field. |
| Four renderers baked markdown backticks into heading text | Correct in the wiki, literal backticks in the `.docx`. Now fenced by `formatBoundary.test.ts`. |
| `loadConfig` returned the shared `CONFIG_DEFAULTS` object | A `--word` run with no config file rewrote the exported defaults for the process. |
| `pluginParser` documented a nested-namespace plugin type **twice** | Ownership is now a longest-prefix match against assemblies found on disk, and orphan detection is by step identity — not by the *guessed* name `extractAssemblyName` derives. Also fixed a second latent double-count where two nested assemblies both claimed a type. |
| `webResourceParser` published a nameless ghost resource | A truncated `.data.xml` parses into a truthy-but-empty object; it now needs a name to be published. |
| `webResourceParser` returned the literal `"/**"` as a description | The tagless-JSDoc fallback's line cleaner never stripped the block's own opening delimiter. Most Power Platform JSDoc omits `@description`, so this was the common path. |
| `environmentVariableRenderer` emitted a header with no cell | `currentValueCell` was commented out while its header push was left in. |
| `securityRoleParser` lost **every** role over one bad file | No `try/catch` and no `<Role>` guard, so a malformed file threw out of the whole sweep; `tryParse` in `index.ts` then zeroed the component. Now skips per file, like every sibling. |
| `relationshipParser` leaked an entity-less relationship into the ERD | Its `catch` is dead for malformed XML — a truncated export parses leniently rather than throwing. Skipped at source. |

**The pattern worth carrying forward:** three of the ten (the web-resource ghost, the security-role sweep crash, the relationship leak) came from the same wrong assumption — that `fast-xml-parser` throws on bad input. **It does not: it is not validating**, so a truncated or half-written file parses *successfully* into a truthy-but-empty object. A `try/catch` around a parse is therefore not a malformed-input guard, and two of those three had one that could never fire. Guard on the *shape* you need (`if (!name) return null`), not on an exception. See the [playbook](playbooks.md) when adding a parser.

**#103 is latent, not live** — no renderer builds a ragged table today. It was found by writing the tests, and there is a characterisation test pinned to the current wrong behaviour that must be updated when it's fixed.

---

## ⚠️ The issue tracker contains a large duplicate set

This will mislead you if you skim `gh issue list`. **Issues #2–#35 are a duplicate set sitting exactly 35 numbers below the canonical #37–#70 set.**

| Duplicate (open, off-board) | Canonical | Canonical state |
|---|---|---|
| #2–#17 | #37–#52 | **Closed**, board Done — Phase 3 component models |
| #18–#27 | #53–#62 | Open, board Todo — extended components |
| #28–#31 | #63–#66 | Open, board Todo — CLI flags, auto-trigger, changelog, IR JSON |
| #32 | #67 | **Closed** — PDF renderer |
| #33 | #68 | **Closed** — Mermaid to PNG |
| #34 | #69 | **Closed** — Dependency resolver |
| #35 | #70 | Open, board Todo — Complexity scorer |
| #36 | — | "Test Issue" — junk, no counterpart |

**The rule: the project board is canonical.** The board holds 57 items — #1, #37–#88, #90, #94, #95, #97. **None of #2–#36 are on the board at all.** Anything open but absent from the board is a duplicate or junk.

Why this matters: #2–#17 are all **open** and describe work that shipped long ago (Solution Model, Table & Column Model, Flow Model & Renderer…). An agent that trusts `--state open` alone will conclude the core data model is unbuilt and start rewriting Phase 1. Always cross-check against the board.

This set is worth closing en masse — but per the [Process](process.md) autonomy rules, bulk-closing 30+ issues is a judgement call worth raising with Lewis rather than doing silently.

---

## Known drift to fix when you're nearby

Small, verified, and safe to correct without asking:

1. **`docs/architecture.jsx:125` contradicts itself.** The Layer 04 component entry for Dependency Resolver still reads `done: false`, while the Phase 4 roadmap block at line 279 correctly reads `done: true` for the same work (#69). The resolver is built (`src/enrichment/dependencyResolver.ts`) and wired into all three assemblers. Flip line 125 to `done: true`.
2. **Issue #1's board card reads `In Progress`** despite the issue being closed 2026-06-07 and shipped in v1.3.0. It is the single stalest card on the board — the exact auto-close-didn't-sync failure the process docs warn about. Move it to Done.
3. **`architecture.jsx:119-120` describes the Mermaid generators as emitting an "ADO `:::mermaid` fence".** They do not, and must not — fencing is the serializer's job. This wording is what caused the double-fence bug fixed in commit a7c803d.

PRs and merge commits (#89, #91, #92, #93, #96, #98) are **not** on the board. That is correct — the board tracks issues, not PRs. It is not drift.

---

## Adding to the roadmap

When you create an issue, add it to the board immediately — an issue not on the board is invisible to the roadmap:

```bash
gh issue create --repo lewginn/PowerAutoDocs --title "..." --body "..."
gh project item-add 3 --owner lewginn --url <issue-url>
```

The project number is **3** (`PowerAutoDocs Roadmap`, `PVT_kwHOATXE1c4BS3Pa`). Confirm with `gh project list --owner lewginn` if that ever fails.

After completing a feature, flip its `done: false` → `done: true` in `docs/architecture.jsx` and move its board card to Done. Note that `architecture.jsx` is not a standalone file — it is imported by the `docs-viewer/` Vite app and **auto-deploys to GitHub Pages on merge to main**, so a syntax error there breaks a public site. Preview with `npm run docs`.

See [Process](process.md) for branching, PR and merge conventions.
