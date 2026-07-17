# Architecture

The six-layer pipeline, the real `src/` tree, and the structural invariants that hold it together.

**Read this when:** you need to know where code goes, how data flows from solution XML to published output, what the IR contract means in practice, or how renderers/serializers divide responsibility. Read this **before** adding a parser, renderer, serializer or enrichment pass.

**Not here:** which components are built vs planned (see [components.md](components.md)); the step-by-step wiring checklists (see [playbooks.md](playbooks.md)); why each decision was taken (see [decisions.md](decisions.md)).

---

## What the pipeline is

`powerautodocs` is a batch documentation pipeline. It reads a **pac-unpacked** Power Platform solution folder, parses it into typed models, and emits documentation in three formats: ADO Wiki markdown, Word `.docx`, PDF. There is no interactivity, no server, no incremental mode — one process, start to finish, exit code 0 or 1.

Entry point: `src/index.ts` — `main()` is exported and also auto-invoked, so `npx powerautodocs` works as a bin.

---

## The six layers

```
[01 INPUT]     pac-unpacked solution folder (XML, JSON, JS, XAML)
                  ↓
[02 PARSERS]   src/parsers/ — one per source type. Emit IR. Nothing else.
                  ↓
[03 IR]        src/ir/ — TypeScript interfaces. The contract.
                  ↓
[04 ENRICHMENT] src/enrichment/ — derived analysis over IR:
                  AI summaries · Mermaid ERD · flow diagrams · flow↔table deps
                  ↓
[05 OUTPUT]    src/renderers/ emit DocNode[] → src/docmodel/ serializers:
                  MarkdownSerializer → ADO Wiki
                  DocxSerializer     → Word .docx
                  PdfSerializer      → PDF
                  ↓
[06 PIPELINE]  src/publisher/ assemblers + wikiPublisher, doc-gen.config.yml,
                  ADO YAML, npm package
```

Assembly is where it all converges. Three assemblers each take the full set of IR and produce one output:

| Assembler | Function | Output |
|---|---|---|
| `src/publisher/wikiAssembler.ts:41` | `buildWikiPages()` | `WikiPage[]` → `wikiPublisher.ts:158` `publishToWiki()` |
| `src/publisher/docAssembler.ts:75` | `buildWordDocument()` | writes `.docx` to `outputPath` (returns `void`) |
| `src/publisher/pdfAssembler.ts:59` | `buildPdfDocument()` | writes `.pdf` to `outputPath` (returns `void`) |

**All three mirror each other section-for-section.** A new component wired into only two of them is silently missing from the third — this is the single most common wiring failure. See [playbooks.md](playbooks.md).

---

## Folder structure

Verified against the tree; regenerate with `find src -type f -name '*.ts' | sort` if in doubt.

```
src/
  index.ts                ← orchestrator. CLI flags, per-solution parse loop,
                              AI enrichment, then wiki/word/pdf output. main() exported.
  logger.ts               ← RunSummary buckets + end-of-run summary + exit code
  config/
    index.ts              ← barrel
    schema.ts             ← DocGenConfig + sub-interfaces
    loader.ts             ← loadConfig(), CONFIG_DEFAULTS, deepMerge, AI config validation
    defaults.ts           ← default column exclusions etc.
    renderOptions.ts      ← RENDER_OPTIONS.formLayout ('compact' | 'detailed')
  ir/                     ← one file per domain model — source of truth
    index.ts              ← barrel
    solution.ts  table.ts  form.ts  view.ts  relationship.ts
    flow.ts  classicWorkflow.ts  businessRule.ts  plugin.ts
    webResource.ts        ← NOTE the capital R
    securityRole.ts  environmentVariable.ts  globalChoice.ts
    connectionReference.ts  emailTemplate.ts  modelDrivenApp.ts
  parsers/                ← emit IR only
    index.ts              ← barrel
    solutionManifestParser.ts  ← Other/Solution.xml → SolutionModel
    solutionParser.ts     ← per-solution orchestrator: parseSolution(). Walks Entities/,
                              delegates to tableParser, applies column filters, wires in
                              views/forms/relationships per component toggles
    tableParser.ts        ← the actual entity/table parser: parseEntityXml()
    viewParser.ts  formParser.ts  relationshipParser.ts
    flowParser.ts  classicWorkflowParser.ts  businessRuleParser.ts
    pluginParser.ts  webResourceParser.ts  securityRoleParser.ts
    environmentVariableParser.ts  globalChoiceParser.ts
    connectionReferenceParser.ts  emailTemplateParser.ts  modelDrivenAppParser.ts
  renderers/              ← consume IR, emit DocNode[]
    index.ts              ← barrel (does NOT re-export rendererUtils — see Barrels below)
    overviewRenderer.ts
    tableRenderer.ts      ← tables AND their sub-pages: columns, views, forms,
                              relationships, business rules, "Used By Flows"
    flowRenderer.ts  classicWorkflowRenderer.ts  businessRuleRenderer.ts
    pluginRenderer.ts  webResourceRenderer.ts  securityRoleRenderer.ts
    environmentVariableRenderer.ts  globalChoiceRenderer.ts
    connectionReferenceRenderer.ts  emailTemplateRenderer.ts
    modelDrivenAppRenderer.ts
    rendererUtils.ts      ← toADOWikiLink(), aiSummaryBlock(), encodePageSegment().
                              The DocNode builders are NOT here — they're in docmodel/nodes.ts
  docmodel/               ← format-agnostic document model
    index.ts              ← barrel (omits PdfSerializer — import it directly)
    nodes.ts              ← DocNode/InlineNode/BulletItem types + ALL builder helpers
    MarkdownSerializer.ts ← DocNode[] → ADO Wiki markdown string
    DocxSerializer.ts     ← DocNode[] → docx Paragraph/Table
    PdfSerializer.ts      ← DocNode[] → pdfmake Content
  enrichment/
    aiSummariser.ts       ← cache-first AI summaries; mutates aiSummary on IR in place
    providers/
      index.ts            ← barrel + createProvider() factory
      AiProvider.ts       ← interface: summarise(prompt): Promise<string>
      AnthropicProvider.ts  AzureOpenAIProvider.ts
    erdGenerator.ts       ← Mermaid erDiagram from TableModels
    mermaidGenerator.ts   ← Mermaid flowchart from a flow's trigger + actions
    mermaidRenderer.ts    ← Mermaid → PNG via mermaid-cli + a LOCAL Chrome/Edge
    dependencyResolver.ts ← flow ↔ table cross-reference maps
  publisher/
    wikiAssembler.ts  wikiPublisher.ts  docAssembler.ts  pdfAssembler.ts
```

Outside `src/`:

```
scripts/addShebang.mjs    ← postbuild shebang injection (cross-platform)
docs/architecture.jsx     ← the interactive architecture doc (React)
docs-viewer/              ← standalone Vite/React app that renders docs/architecture.jsx.
                              Own package.json + node_modules; excluded from the root
                              tsconfig. `npm run docs` builds and serves it.
                              .github/workflows/deploy-pages.yml publishes it to GitHub
                              Pages on any push to main touching docs/** or docs-viewer/**.
samples/                  ← the client-facing contract: doc-gen.config.sample.yml and
                              powerautodocs.pipeline.sample.yml. Clients copy these.
.puppeteerrc.cjs          ← skipDownload: true — load-bearing, see Mermaid → PNG below
```

### Renderer file naming — not strictly one-per-component

The tree reads "one renderer per component type", but that only holds for **top-level** components. **Table-scoped** components (forms, views, relationships, business rules) render inside `tableRenderer.ts` — there is no `formRenderer.ts`, `viewRenderer.ts` or `relationshipRenderer.ts`. Business rules have two render paths on purpose: `renderTableBusinessRules`/`renderSingleBusinessRule` (table-scoped, in `tableRenderer.ts`) and `renderBusinessRule`/`renderBusinessRulesOverview` (standalone, in `businessRuleRenderer.ts`). Don't add a third.

### Barrel conventions — and the three real gaps

The `ir/`, `parsers/`, `renderers/` and `docmodel/` barrels cover every *file*, but three individual symbols are not exported and are imported directly by path today:

- `renderers/index.ts` does not re-export `rendererUtils.ts` at all. `aiSummaryBlock` and `toADOWikiLink` are reached via `from './rendererUtils.js'` (e.g. `flowRenderer.ts:9`).
- `docmodel/index.ts` exports `nodes`, `MarkdownSerializer` and `DocxSerializer` — **not** `PdfSerializer`. Consumers import `../docmodel/PdfSerializer.js` directly.
- `ir/index.ts:11` exports `PrivilegeLevel` and `EntityPrivileges` but not their sibling `PrivilegeOperation` (`ir/securityRole.ts:9`).

These are gaps, not conventions. Follow the existing import style in the file you're editing rather than "fixing" the barrel mid-feature.

---

## Invariant 1 — the IR is the contract

**Parsers only produce IR. Renderers only consume IR. Neither knows the other exists.**

This is the most important invariant in the codebase. It is what makes three output formats possible from one parse, and what lets a parser be rewritten without touching a renderer.

Concretely:

- A parser must not import from `src/renderers/` or `src/docmodel/`.
- A renderer must not read the filesystem, parse XML, or know a solution folder exists.
- IR types live in `src/ir/`, one file per domain, re-exported from `src/ir/index.ts`.
- **IR field names on built types are a public contract: additions are safe; renames and removals are breaking.** Check every renderer usage before touching an existing field.

### Known deviation: the flow parser calls the Mermaid generator

`src/parsers/flowParser.ts:5` imports `generateMermaidDiagram` from `../enrichment/mermaidGenerator.js` and line 330 populates `mermaidDiagram` on the returned `FlowModel` (declared `src/ir/flow.ts:54`, consumed `src/renderers/flowRenderer.ts:118-120`). So flow diagrams are generated at **parse** time, not in the enrichment stage, contradicting the layer diagram above.

Named here so you neither hunt for a call site in the assemblers that doesn't exist, nor treat it as precedent. The ERD generator does it correctly: called from the three assemblers (`wikiAssembler.ts:75`, `docAssembler.ts:121`, `pdfAssembler.ts:91`), never from a parser. **New enrichment goes in the assemblers.**

---

## Invariant 2 — enrichment derives, it does not own

Enrichment sits between parse and render and comes in two shapes:

**Read-only derivation** — takes IR in, returns new data, mutates nothing. `erdGenerator.ts` and `dependencyResolver.ts` both do this. `resolveFlowTableDependencies(flows, tables)` (`dependencyResolver.ts:41`) returns `{ tableToFlows, flowToTables }` lookup maps; it handles Dataverse entity-set pluralisation (`opportunities` → `opportunity`) via `singularCandidates()`, and drops flows referencing tables not present in the solution. The maps are passed into renderers as arguments — `renderTableUsedByFlows` on table pages, "Tables Used" on flow pages. Prefer this shape.

**In-place mutation** — `aiSummariser.ts` populates `aiSummary` on supported IR models before rendering. This is the exception, justified because every renderer would otherwise need a parallel summary argument threaded through it. `aiSummaryBlock()` (`rendererUtils.ts:27`) returns `[]` when `aiSummary` is absent, so output is byte-identical to pre-AI pages when enrichment is off.

---

## Invariant 3 — renderers emit DocNode[], never format strings

`src/docmodel/nodes.ts` defines the format-agnostic document model. A `DocNode` carries **semantic content only** — heading, paragraph, table, bullet_list, mermaid, code_block, blockquote, toc_placeholder. No markdown syntax. No docx objects. No pdfmake structures.

All builder helpers live in **`src/docmodel/nodes.ts`** — not in `rendererUtils.ts`:

| Kind | Helpers | Location |
|---|---|---|
| Inline | `t` `c` `b` `i` `lnk` | `nodes.ts:110-122` |
| Block | `h` `p` `pt` `bq` `bqt` `toc` `mermaid` `codeBlock` | `nodes.ts:129-155` |
| Table | `table` `cell` `ct` `cc` | `nodes.ts:161-171` |
| List | `bulletList` `bullet` | `nodes.ts:174-178` |

A typical renderer import (`tableRenderer.ts:9`):

```ts
import { h, pt, p, t, c, b, lnk, table, ct, cc, cell, bulletList, bullet, toc } from '../docmodel/nodes.js';
```

Heading `level` is **relative to the renderer's own section** (1 = section title). The assembler applies a `headingOffset` when placing that section in the document. A renderer that hardcodes an absolute document level breaks when reused at a different depth.

### The legacy `write*Markdown` path — still live, don't extend

The invariant is real but not absolute in the current code. Six renderers import `serialize` from `MarkdownSerializer` directly, and five of them expose string-returning helpers that dump markdown to local files: `renderTableMarkdown`/`writeTableMarkdown` (`tableRenderer.ts:388,407`), `renderFlowMarkdown`/`writeFlowMarkdown` (`flowRenderer.ts:130,192`), `writeOverviewMarkdown` (`overviewRenderer.ts:101`), `writePluginMarkdown` (`pluginRenderer.ts:173`), `writeWebResourceMarkdown` (`webResourceRenderer.ts:137`). They're called from the per-solution loop in `index.ts` (lines 178, 181, 199, 218, 228) and write into `output/`. `classicWorkflowRenderer.ts:6` also imports `serialize`, but the import is unused — it exposes no markdown writer and is already fully on the DocNode path.

So `MarkdownSerializer` has seven consumers, not one: `wikiAssembler.ts:10` (the real path) plus those six renderers.

**Status: legacy, kept for local-output debugging. Do not extend it, do not add new `write*Markdown` functions, and do not delete it as "dead code" — `index.ts` calls it.** New work goes through `render*` → `DocNode[]` → assembler → serializer.

---

## Invariant 4 — format syntax belongs to the serializer, always

Generators return **raw content**. Serializers own **every format wrapper**. This is the generator→serializer contract, and it generalises past Mermaid: no DocNode payload ever carries syntax for a target format.

Mermaid is the worked example. `mermaidGenerator.ts:149` and `erdGenerator.ts:107` both `return lines.join('\n')` — no fence. `erdGenerator.ts:21-22` says so explicitly: "no ADO fence — that's added by MarkdownSerializer's 'mermaid' case". `nodes.ts:61` types `MermaidNode.code` as "the raw Mermaid DSL (no fence markers)".

The three serializers each wrap it their own way:

| Serializer | Mermaid handling |
|---|---|
| `MarkdownSerializer.ts:84` | `:::mermaid\n${node.code}\n:::` — the ADO fence |
| `DocxSerializer.ts:223` | renders to PNG via the injected `MermaidRenderer` callback, embeds as an image |
| `PdfSerializer.ts:343-345` | returns `null` — skipped in PDF by design |

**This has been broken once already.** Commit `a7c803d`: "erdGenerator.ts baked the ADO `:::mermaid` fence into the diagram string itself, and MarkdownSerializer wrapped it a second time — ERD diagrams in the wiki have been double-fenced." It shipped undetected. Baking the fence back into a generator reintroduces it, and would also corrupt the PNG render input for Word. Older prose describing the ERD generator as producing an "ADO `:::mermaid` fence" is wrong.

### Mermaid → PNG: dependency inversion, on purpose

`DocxSerializer` must not depend on puppeteer/mermaid-cli. So it declares a callback type instead (`DocxSerializer.ts:219`):

```ts
export type MermaidRenderer = (code: string) => Promise<{ data: Buffer; width: number; height: number } | null>;
```

`docAssembler.ts` supplies the real implementation from `enrichment/mermaidRenderer.ts` when `config.output.wordDiagrams !== false`, probing for a browser **once up front** via `resolveChromeExecutable()` rather than per-diagram (`docAssembler.ts:99-105`). If resolution throws, it warns and leaves `renderMermaid` undefined; the serializer's mermaid case then returns `[]`. The `.docx` is produced with every diagram silently missing — **a clean run on a machine with no Chrome/Edge proves nothing about diagrams.**

`.puppeteerrc.cjs` sets `skipDownload: true` because ADO agents are fresh VMs and would otherwise pay a ~250MB Chromium download every run — which is why `mermaidRenderer.ts` must always pass an explicit `executablePath`. There is no bundled fallback. Resolution order: `POWERAUTODOCS_CHROME_PATH`, then a hardcoded `CHROME_CANDIDATES` list covering macOS/Linux/Windows Chrome and Edge. New platform ⇒ new candidate entry, not a new dependency.

`resolveChromeExecutable()` (`mermaidRenderer.ts:57`) throws on both a nonexistent override and no candidate found — but its only live caller wraps it in a try/catch that warns and carries on (`docAssembler.ts:99-106`). So neither case is fail-fast: an explicitly wrong `POWERAUTODOCS_CHROME_PATH` degrades **identically** to having no browser at all — the `.docx` is written with every diagram silently absent, exit code 0. If you are debugging "my diagrams vanished", read the warning on stderr; the run status will not tell you.

`pdfAssembler.ts` has no diagram wiring at all — it never imports `mermaidRenderer`. `output.wordDiagrams` is genuinely Word-scoped and there is no `pdfDiagrams` equivalent. Adding diagrams to PDF means mirroring the callback plumbing that already exists in `DocxSerializer`, not inventing it.

---

## Error handling — where the dividing line falls

Two idioms, and it matters which one a new failure mode gets.

**Fail-fast (throw/exit before work starts)** — cheap to detect, always fatal, never per-artifact:
- config YAML parse + shape (`config/loader.ts:176,180`)
- `validateAiEnrichmentConfig` (`loader.ts:114-149`)
- unknown CLI flags (`index.ts:79-85`)
- Chrome resolution, probed once up front — then **degrades** to a warning rather than failing

**Skip-and-continue (record and carry on)** — one bad artifact must not cost the other seven solutions:
- every parser call is wrapped in `tryParse<T>` (`index.ts:32-48`) → `summary.parseWarnings`
- each solution is wrapped again → `summary.solutionsSkipped`
- publish/Word/PDF failures → `summary.publishFailures` — including a missing/`REDACTED` wiki PAT, checked at `index.ts:330` **after** all parsing and rendering, which records a `publishFailure` rather than exiting early. (`wikiPublisher.ts:166` does throw on the same condition, but `index.ts:330` gates it first, so that guard is a defence-in-depth backstop.)
- AI API failures → `summary.aiSummaryFailures`, falling back to a stale cached summary if one exists

**Exit code:** `index.ts:441-442` exits 1 only if `solutionsSkipped` or `publishFailures` is non-empty. `parseWarnings` and `aiSummaryFailures` do **not** fail the build. Only `parseWarnings` downgrades the grade to "⚠ Completed with warnings" (`logger.ts:75`); `aiSummaryFailures` are printed in the summary body (`logger.ts:63-68`) but leave the run graded "✓ Completed successfully", so don't look for a warning status to detect them.

Adding a failure mode means picking a `RunSummary` bucket in `src/logger.ts` and adding a `logSummary` block. Route a genuine publish failure into `parseWarnings` and you hand ADO a green build on a broken publish.

---

## File casing is load-bearing

`pac` CLI on Windows produces capitalised names; Linux ADO agents are case-sensitive; macOS/Windows dev machines are not — so a lowercase regression passes locally and only fails on a client's pipeline run. The capitalised segments are hardcoded at:

- `src/index.ts:60` — `path.join(unpackedPath, 'Other', 'Solution.xml')`, the pre-flight check whose failure reads "This doesn't look like a pac-unpacked solution folder"
- `src/parsers/solutionManifestParser.ts:22` — same path
- `src/parsers/connectionReferenceParser.ts:49` — `path.join(solutionRoot, 'Other', 'Customizations.xml')`

Both the folder segment and the filename are capitalised. Same rule inside `src/ir/` — the file is `webResource.ts`, capital R.

---

## Cross-references

- [components.md](components.md) — what's parsed today, what's planned, per-component notes
- [playbooks.md](playbooks.md) — the wiring checklists (new parser, new AI provider) and how to verify a change
- [decisions.md](decisions.md) — why the IR pipeline, why DocNode, why pdfmake, why the package rename
