# Roadmap

Phase status, what each remaining phase targets, and the open backlog mapped to GitHub issue
numbers.

**Read this when:** you need to know what is already shipped vs planned, which issue tracks the
work you are about to start, or where a new component sits in the delivery plan.

---

## Verify before you trust it

Issue and board state changes constantly and this file does not update itself. Before acting on
anything below, run:

```bash
gh issue list --repo lewginn/PowerAutoDocs --state open --limit 60
gh project item-list 3 --owner lewginn --limit 100 --format json
```

If the live output disagrees with this doc, **the live output wins** — then fix this doc. Don't
hardcode a package version or a capture date as the reason to trust a table below; the table is
either still accurate or it isn't, and the two commands above settle that in seconds.

The project number is **3** (`PowerAutoDocs Roadmap`, `PVT_kwHOATXE1c4BS3Pa`). Confirm with
`gh project list --owner lewginn` if that ever fails.

---

## Phase table

**The board's `Phase` field is authoritative** — every one of its 68 items carries a Phase,
Priority and Type, and `docs/architecture.jsx`'s phase numbering is kept in sync with it. Phases
1–4 are shipped; Phase 5 and Phase 6 group the remaining work by product-surface theme rather
than by build order, so a release can ship one coherent theme at a time instead of whatever
happened to get picked up next.

| Phase | Name | Status | Tracks |
|-------|------|--------|--------|
| Phase 1 | Core Pipeline & Data Model | ✅ Complete | #71–#80 |
| Phase 2 | Forms, Views & Filters | ✅ Complete | #81–#88 |
| Phase 3 | Component IR Models & Renderers | ✅ Complete | #37–#52 |
| Phase 4 | AI Enrichment & Delivery Formats | ✅ Complete | #1, #67, #68, #69, #94, #95, #100, #102, #103, #109, #110 |
| Phase 5 | Governance & Admin Configuration Components | 🔲 Planned | #54, #55, #56, #58, #59, #119, #120 |
| Phase 6 | Automation, Copilot & Integration Surfaces | 🔲 Planned | #57, #61, #97, #115, #116, #118 |
| Backlog | Presentation, Tooling & Long-tail | 🔲 Planned / deprioritised | #53, #60, #63, #64, #65, #66, #70, #90, #117 |

**#147 Company Word template — ✅ Shipped** (2026-08-18): `output.wordTemplate` renders the
Word document into a client's own branded `.docx` via `patchDocument`, at a `{{content}}`
placeholder, or by replacing an unprepared template's body while keeping its `sectPr`.
`src/docmodel/DocxSerializer.ts` (`buildTemplateDocument`), `src/docmodel/docxZip.ts`
(hand-rolled ZIP read/write on `node:zlib`, so no new dependency),
`src/config/loader.ts` (`resolveWordTemplatePath`), `output.wordTemplateStyles.table`.
TOC populates on open — `updateFields` is written into the template's `settings.xml`.

**#62 Power Pages — ✅ Shipped** (2026-07-19): `ir/powerPages.ts`, `parsers/powerPagesParser.ts`,
`renderers/powerPagesRenderer.ts`, wired into all three assemblers; config `components.powerPages`
(defaults off — D2). See [components.md](components.md) for the built matrix.

Every issue's body now states its own "what we're trying to achieve" / "why it matters" —
regrouped and rewritten on 2026-07-18 as a full issue-tracker cleanse (68 board items re-read
against `docs/components.md`, 19 stale duplicate issues from an old import closed). This table is
the index; the issue is the detail.

---

## What shipped in Phase 4

All closed or (for the PDF renderer) formally retired, all wired, all on the board as Done or
Removed:

| Issue | Item | Where it lives |
|-------|------|----------------|
| #1 | AI Enrichment Layer — summaries, caching, providers | `src/enrichment/aiSummariser.ts`, `src/enrichment/providers/` |
| #94 | Word renderer — DocNode + DocxSerializer + docAssembler | `src/docmodel/DocxSerializer.ts`, `src/publisher/docAssembler.ts` |
| #95 | ADO Wiki publisher — wikiAssembler + wikiPublisher | `src/publisher/wikiAssembler.ts`, `src/publisher/wikiPublisher.ts` |
| #67 | PDF renderer — **retired** (Lewis, 2026-07-17) | `src/docmodel/PdfSerializer.ts`, `src/publisher/pdfAssembler.ts` — still works, not invested in further; see [decisions.md](decisions.md#pdfmake-and-the-standard-14-fonts) |
| #69 | Dependency resolver — flow ↔ table cross-links | `src/enrichment/dependencyResolver.ts` |
| #68 | Mermaid → PNG — embedded diagrams in Word | `src/enrichment/mermaidRenderer.ts` |
| #100 | Word output theming — fonts, colours, table styles | `src/docmodel/wordTheme.ts` |
| #102 | CI pipeline + Vitest test suite | `.github/workflows/ci.yml` |
| #103 | Ragged-table row padding fix | `src/docmodel/MarkdownSerializer.ts` |
| #109 | Test coverage: publisher, pipeline entry point, enrichment | `tests/publisher/`, `tests/index.test.ts` |
| #110 | 42 defects found by #109's coverage pass — **all fixed**, not just pinned | see below |

**PDF output is planned for deprecation** (Lewis, 2026-07-17) — `pdfmake` lags Word on
theming/Mermaid fidelity and Word's own Export-to-PDF covers the same need. Nothing has been
removed yet and `output.pdf` still works, but do not invest in PDF features, tests or refactors
without confirming the plan still holds.

---

## Phase 5 — Governance & Admin Configuration Components (planned)

Dataverse admin/configuration object types that clients ask about specifically for security
audits, compliance reviews and data-governance sign-off — not day-to-day functional
documentation. All follow the standard parser → IR → renderer shape (see the
[add-a-parser playbook](playbooks.md)).

| Issue | Item | Priority |
|-------|------|----------|
| #54 | Business Process Flow Model & Parser & Renderer | High |
| #55 | Column Security Profile Model & Parser & Renderer | High |
| #56 | Routing Rule Set Model & Parser & Renderer | Medium |
| #58 | Duplicate Detection Rule Model & Parser & Renderer | Medium |
| #59 | SLA Model & Parser & Renderer | Medium |
| #120 | Masking Rule Model & Parser & Renderer (Secured/Attribute) | Medium |
| #119 | Settings Model & Parser & Renderer | Low |

---

## Phase 6 — Automation, Copilot & Integration Surfaces (planned)

Newer or integration-facing Power Platform surfaces — the ones growing fastest in client
solutions right now and currently invisible or thin in the generated docs.

| Issue | Item | Priority |
|-------|------|----------|
| #116 | Scheduled Flow Model & Parser & Renderer | Medium |
| #118 | Agent Model & Parser & Renderer (Copilot Studio) | Medium |
| #115 | Virtual Table Model & Parser & Renderer | Medium |
| #57 | Custom Connector Model & Parser & Renderer | Medium |
| #97 | Plugin source code linking — read `.cs` source for plugin steps | Medium |
| #61 | Service Endpoint Model & Parser & Renderer | Low |

**#97 is not a new component** — it extends the existing Plugin IR/renderer with real source
instead of adding a new parser/IR/renderer trio. Don't follow the standard checklist for it.

---

## Backlog — Presentation, Tooling & Long-tail (planned, lower priority)

Two different reasons for being here, not one: the presentation-layer items are genuinely lower
documentation value (UI/visual constructs an as-built doc generator gets little leverage from
re-describing); the tooling items improve PowerAutoDocs' own workflow rather than adding a new
documentable component.

| Issue | Item | Priority | Why it's here |
|-------|------|----------|----------------|
| #62 | Power Pages Model & Parser & Renderer | **High** | **Active development** on `feature/power-pages-parser` as of 2026-07-18 — no longer dormant, just not tracked as its own numbered phase yet |
| #64 | Auto-trigger pipeline — push / scheduled | Medium | Pipeline/DX, not a new component |
| #90 | AI Enrichment: configurable summary tone/length per client | Medium | Enrichment polish, not a new component |
| #53 | PCF Control Model & Parser & Renderer | Low | Presentation/UI layer |
| #60 | Dashboard Model & Parser & Renderer | Low | Presentation/UI layer |
| #117 | Custom Page Model & Parser & Renderer | Low | Presentation/UI layer |
| #63 | CLI flags with commander | Low | Already shipped (hand-rolled, `src/index.ts:73-87`); remaining scope is a dependency-add refactor needing Lewis's sign-off — see the issue |
| #65 | Git-based changelog | Low | Pipeline/DX, not a new component |
| #66 | IR JSON artifact export | Low | Pipeline/DX, not a new component |
| #70 | Complexity scorer | Low | Enrichment polish, not a new component |

**Canvas App Source** and **Confluence Renderer** are marked `moscow: "W"` (won't) in
`docs/architecture.jsx` and have no tracking issue — deliberately out of scope.

---

## Test coverage and defect debt

**1113 tests, 47 files, ~3s.** `npm test` runs the full suite; `.github/workflows/ci.yml` runs
typecheck + build + test on every PR and push to `main`. Coverage is every module with runtime
behaviour — all 17 parsers, all 14 renderers, `MarkdownSerializer`, `DocxSerializer` (asserted
against a real unzipped `.docx`), `wordTheme`, `erdGenerator`, `config/loader`, all four
`publisher/*` modules, `logger`, `main()`, and the enrichment layer including the AI providers.
The suite is **mock-free** — see [decisions.md](decisions.md#vitest-and-a-suite-that-deliberately-stops-short)
for why that's worth protecting.

**The debt tracked in #110 is now zero.** That issue pinned 42 defects found by writing the
coverage in #109; all 42 are now fixed (PRs #112–#128), and `grep -rn "it('BUG:" tests/` — the
convention for pinning a known-wrong behaviour in a characterisation test — currently returns
nothing. If you add a new pin, use that exact tag **in the test title** so the grep stays
exhaustive; if you're fixing one, delete the pin and update the test to assert the correct
behaviour rather than leaving it "BUG"-tagged and green.

Still uncovered, and each is a decision rather than a gap: `PdfSerializer` and `pdfAssembler`
(PDF deprecation, above), and the real-browser Mermaid render (the cache-hit path and the 3×
conversion are covered; only the Chrome launch is not).

**The `config/` row looks unfinished and isn't.** `defaults.ts`, `renderOptions.ts` and
`schema.ts` are constants and types; `config/index.ts` is re-exports. `loader.ts` is the only
runtime and is covered.

---

## Adding to the roadmap

When you create an issue, add it to the board immediately — an issue not on the board is
invisible to the roadmap:

```bash
gh issue create --repo lewginn/PowerAutoDocs --title "..." --body "..."
gh project item-add 3 --owner lewginn --url <issue-url>
```

Then set its Phase, Priority, Type and Status fields on the board — an issue without them is as
invisible to planning as one that isn't on the board at all. Pick the phase by product-surface
theme (which of Phase 5 / Phase 6 / Backlog's *reasons for being there*, described above, actually
fits) rather than by creation order.

After completing a feature, flip its `done: false` → `done: true` in `docs/architecture.jsx` and
move its board card to Done — the two are separate objects and the sync between them is **not**
reliable; check both. Note that `architecture.jsx` is not a standalone file — it is imported by
the `docs-viewer/` Vite app and **auto-deploys to GitHub Pages on merge to main**, so a syntax
error there breaks a public site. Preview with `npm run docs`.

See [Process](process.md) for branching, PR and merge conventions.
