# Architectural Decisions

The "why it is this way" record for PowerAutoDocs — each entry names a choice, the alternative it beat, and the cost of reversing it.

**Read this when:** you are about to propose, review or implement a change that contradicts an existing design choice — a new dependency, a different output format, a "simplification" of the IR or DocNode layers, or anything that touches Mermaid, caching, or the browser/Chrome plumbing. Read the relevant entry *before* writing code, not after.

Everything below was verified against the source at the time of writing, with `file:line` pointers so you can re-verify rather than trust. If you find a decision that no longer matches the code, the code wins — fix this doc in the same PR.

> **Related docs:** [Architecture](architecture.md) for the layer model and file map · [Process](process.md) for branching, commits and PRs · [Config](config-and-cli.md) for the full `doc-gen.config.yml` field reference.

---

## The one-liners

Decisions that need no elaboration. The "why" column is the whole argument.

| Decision | Choice | Why |
|----------|--------|-----|
| Language | TypeScript / Node.js | Typed IR interfaces are the contract between layers; no templating engine needed |
| Architecture | IR-based pipeline | Parsers and renderers are fully decoupled — neither imports the other |
| Reuse across clients | npm package + ADO pipeline | `npx powerautodocs@latest` — no per-client install or fork |
| Multi-solution | Config-driven merge | Each solution parsed independently, tables merged into one `mergedSolution` before render (`src/index.ts:172-176`) |
| Flow rendering | Nested bullet list | Mirrors the action tree's own shape; the Mermaid diagram owns the visual, the list owns the detail |
| ERD filtering | Publisher prefix + explicit overrides | Eliminates OOB noise (ownerid/createdby/systemuser) automatically; `erd.excludeEntities`/`erd.excludeRelationships` handle the rest |
| File casing | Capitalised path segments (`Other/Solution.xml`) | pac CLI on Windows emits capitals; Linux ADO agents are case-sensitive |
| PDF library | `pdfmake`, standard 14 fonts | Self-contained output — no bundled TTFs, no native binaries |
| Package name | `powerautodocs` | Renamed from `powerautodoc` after an accidental client data exposure; the old package was unpublished from npm (2026-03-27) and no longer resolves at all |

Three of these have a sharper edge than the table conveys — see [IR-based pipeline](#the-ir-is-the-contract), [File casing](#file-casing-is-load-bearing-and-only-breaks-in-production) and [pdfmake](#pdfmake-and-the-standard-14-fonts) below.

---

## The IR is the contract

**Parsers only produce IR. Renderers only consume IR. Neither knows the other exists.** This is the most important invariant in the codebase and the reason the same parse feeds Wiki, Word and PDF without any of them knowing about each other.

The practical consequence: **IR field names on built types are a public contract — additions are safe, renames and removals are breaking.** A rename means finding every renderer that reads the field, and the compiler will only help you if the rename is total.

**Known deviation — read this before citing precedent.** `src/parsers/flowParser.ts:5` imports `generateMermaidDiagram` from `../enrichment/mermaidGenerator.js` and populates `mermaidDiagram` on the `FlowModel` at parse time (`src/ir/flow.ts` declares the field; `src/renderers/flowRenderer.ts` consumes it). That is enrichment running inside a parser, which contradicts the layer model. The ERD generator does it correctly — it is called from the three assemblers (`wikiAssembler.ts`, `docAssembler.ts:121-125`, `pdfAssembler.ts:95`), never from a parser. **Do not copy the flow parser's pattern for new enrichment.** It is a deviation to be aware of, not a precedent to follow.

---

## DocNode + one serializer per format

Renderers emit `DocNode[]` — a format-agnostic block/inline tree — and each output format has its own serializer that turns that tree into its native representation:

```
MarkdownSerializer → ADO Wiki markdown
DocxSerializer     → docx Paragraph/Table elements
PdfSerializer      → pdfmake content
```

**Why not string builders?** Because `docx` and `pdfmake` are object-model libraries. You cannot hand either of them a markdown string. Before the DocNode layer, renderers concatenated markdown directly, which made Word output impossible without rewriting every renderer. One shared `DocNode[]` means a new format costs one serializer, not thirteen renderers.

**The rule that falls out of it:** every DocNode carries *semantic* content only. All format syntax — fences, escapes, indent staircases — belongs in a serializer. See [Mermaid generators return raw DSL](#mermaid-generators-return-raw-dsl--the-serializer-owns-the-fence) for what happens when this is violated.

Builder helpers (`h`, `p`, `pt`, `table`, `cell`, `ct`, `cc`, `bulletList`, `bullet`, `toc`, `mermaid`, `codeBlock`, `bq`, `bqt`, `t`, `c`, `b`, `i`, `lnk`) live in **`src/docmodel/nodes.ts`**, not `rendererUtils.ts`. `src/renderers/rendererUtils.ts` holds exactly two things: `toADOWikiLink()` and `aiSummaryBlock()`.

### The legacy string path is real and is not deprecated-by-accident

The DocNode-emitting `render*` functions are the primary path, but a second, older path still exists and still works: `render*Markdown()` / `write*Markdown()` helpers that call `serialize()` *inside* the renderer to write local `.md` files. Five renderers use `serialize` for this (`tableRenderer.ts`, `flowRenderer.ts`, `webResourceRenderer.ts`, `pluginRenderer.ts`, `overviewRenderer.ts`), and those helpers are exported from the barrel. A sixth, `classicWorkflowRenderer.ts:6`, imports `serialize` but never calls it — a dead import, and it exposes no such helper. `MarkdownSerializer` therefore has seven importers — those six renderers plus `wikiAssembler.ts` — not one.

`writeOverviewMarkdown` and `writeTableMarkdown` are called live from `src/index.ts:178-183`, so this is working code, not dead code.

**Do not "fix" the invariant by deleting these.** They produce the local `output/` markdown that is useful for eyeballing a run. Equally, **do not extend them** — new components get the DocNode path only. The invariant as stated ("renderers emit DocNode[], not strings") describes the path you should build on; it is not yet a complete description of the file.

---

## Mermaid generators return raw DSL — the serializer owns the fence

`generateERDiagram` (`src/enrichment/erdGenerator.ts:107`) and `generateMermaidDiagram` (`src/enrichment/mermaidGenerator.ts:149`) both `return lines.join('\n')` — raw Mermaid DSL, **no fence**. `MermaidNode.code` (`src/docmodel/nodes.ts:62-65`) is documented as raw DSL. Each serializer then wraps it its own way:

| Serializer | What it does with a `mermaid` node |
|------------|-----------------------------------|
| `MarkdownSerializer` | `:::mermaid\n${node.code}\n:::` (`MarkdownSerializer.ts:83-84`) |
| `DocxSerializer` | Renders to PNG via the injected `MermaidRenderer` callback |
| `PdfSerializer` | Returns `null` — skipped (`PdfSerializer.ts:343-345`) |

**This is a scar, not a preference.** `erdGenerator.ts` used to bake the `:::mermaid` fence into the diagram string itself, and `MarkdownSerializer` wrapped it a second time — every ERD in every client wiki was double-fenced and rendered as literal `:::mermaid` text. It shipped undetected. Fixed in `a7c803d`, whose commit message records it.

If you re-bake a fence into a generator you reintroduce that bug *and* corrupt the PNG render input for Word, because the renderer feeds `node.code` straight to Mermaid.

### Why `:::` and why v8.14

ADO Wiki uses `:::mermaid` fences, not backtick fences — this is ADO-specific and non-negotiable. ADO also pins Mermaid to **v8.14**, so **node shapes introduced after v8.14 will not render**. `mermaidGenerator.ts:9-17` documents the workarounds inline: `Foreach` uses a rectangle with a `↺` symbol (cylinder isn't in 8.14), `Terminate` uses a circle (hexagon isn't in 8.14). If a diagram silently fails to render in ADO, a post-8.14 shape is the first thing to check.

---

## Mermaid → PNG for Word: a local browser, never a bundled one

Word has no native Mermaid support, so ERD and flow diagrams have to become images. `src/enrichment/mermaidRenderer.ts` does this with `@mermaid-js/mermaid-cli`'s `renderMermaid()` driving a real browser.

**The decision: never let Puppeteer download its own Chromium.** `.puppeteerrc.cjs` sets `skipDownload: true`. The reasoning is in the file itself and it is entirely about the deployment model — ADO pipeline agents are **fresh VMs on every run**, so Puppeteer's ~250MB Chromium download would be paid on *every single run*, not once. We point at the agent's preinstalled Chrome/Edge instead.

**This makes `skipDownload` load-bearing.** There is no bundled browser to fall back on, so `mermaidRenderer.ts` must supply `executablePath` on every `puppeteer.launch()` (`mermaidRenderer.ts:79-83`). Resolution order (`resolveChromeExecutable()`, `mermaidRenderer.ts:57-73`):

1. `POWERAUTODOCS_CHROME_PATH` if set — and it **throws** if the path doesn't exist. An explicitly wrong override is fail-fast, never silently ignored.
2. A hardcoded 11-entry `CHROME_CANDIDATES` list covering macOS/Linux/Windows Chrome and Edge (`mermaidRenderer.ts:36-48`).
3. Otherwise throw with a message telling you to set the env var or install a browser.

**Supporting a new platform means adding to `CHROME_CANDIDATES` — not adding a dependency.** Launch args are `['--no-sandbox', '--disable-setuid-sandbox']`, required on ADO Linux agents.

**The trap:** if you "fix" a Puppeteer launch failure by deleting `.puppeteerrc.cjs` or running `npx puppeteer browsers install chrome`, you re-impose the exact ~250MB-per-run cost the file exists to avoid.

### Degradation is silent by design — and that will mislead you

`docAssembler.ts:98-107` calls `resolveChromeExecutable()` **once, up front** (path existence only, no browser launch), inside a try/catch. On failure it warns to the console and leaves `renderMermaid` undefined; `DocxSerializer`'s mermaid case then returns `[]`. The run succeeds and produces a `.docx` with **every diagram silently missing**.

That is the right call for a client's pipeline — one missing browser must not fail an otherwise good run. But it means: **on a machine without Chrome/Edge, a clean exit code proves nothing about diagrams.** If you are verifying a Word change and the diagrams are gone, check for the warning before concluding you broke something.

The browser is a lazily-created module-level singleton (`browserPromise`). `closeMermaidBrowser()` is called once at the end of `docAssembler` — **without it the process hangs.**

### 3× supersampling, 1× reported dimensions

`SCALE_FACTOR = 3` (`mermaidRenderer.ts:34`), passed as `deviceScaleFactor` in the viewport. Puppeteer's default 1 CSS pixel = 1 raster pixel looks visibly soft once Word displays it at real page width.

The subtlety worth preserving: `RenderedDiagram.width/height` are converted **back to nominal 1× units** before returning (`toNominal()`, `mermaidRenderer.ts:110-112`). So callers size the image exactly as they did before — same physical size on the page, 3× the pixel data. **Layout is unaffected; only sharpness changes.** If you change `SCALE_FACTOR`, keep that conversion or every diagram triples in size on the page.

### Word only — PDF still skips Mermaid

Diagram rendering is wired into `docAssembler.ts` alone. `pdfAssembler.ts` never imports `mermaidRenderer`; `PdfSerializer` returns `null` for mermaid nodes by design. So `output.wordDiagrams` is genuinely Word-scoped and the name is accurate — there is no `pdfDiagrams` equivalent, and `pdfAssembler.ts:48-51` goes further, dropping any heading directly followed by a mermaid node so the PDF doesn't carry orphaned "Diagram" headings.

If you are asked to add diagrams to the PDF: the callback plumbing already exists (`MermaidRenderer` type in `DocxSerializer.ts`) and needs **mirroring, not inventing**.

---

## Word action lists use native Word bullets, never hand-rolled indents

`DocxSerializer`'s `bulletItems()` emits `new Paragraph({ children, bullet: { level: item.depth }, spacing: { after: 40 } })` — `BulletItem.depth` maps straight onto Word's native multilevel list numbering.

**A previous attempt hand-rolled this with explicit per-depth `indent` values.** Don't. A hand-rolled indent is a plain paragraph wearing a bullet costume: it carries no list semantics, so renderers are free to lay it out however they like. Pages flattened them into a near-vertical column, which is what made nesting look broken. Native lists render consistently in Word, Word Online, Pages and LibreOffice alike. Fixed in `60a5df4`.

**Why this one is easy to regress:** the failure is invisible in Word itself, which tolerates fake indents. It only shows up in Pages/LibreOffice/Word Online — exactly where nobody checks.

Spacing is deliberately tight (`after: 40`, no `before`) so a long flow action tree reads as one dense block, like the wiki's list, rather than a sparse page of stripes.

### Code spans get light shading

Inline `code` nodes render as Courier New at size 18 **plus** `shading: { fill: 'F2F2F2' }` (`DocxSerializer.ts:30-42`). This mimics the wiki's code "chip". The reasoning is in the source comment: Courier alone doesn't separate logical names from prose strongly enough — a step like **Name** — List records on `tasks` reads as one undifferentiated run of text, which is most of what made Word action lists feel mushy next to the wiki's.

### Other DocxSerializer invariants a change can quietly break

- `TableLayoutType.FIXED` + all-DXA widths + an explicit `columnWidths` array must stay in sync — this is what makes Word Online render tables consistently.
- `HEADING_SPACING[1].before` is `0`. The inline comment at `DocxSerializer.ts:199` ("page break handles the before gap") is stale — forced page breaks were removed, and top-level headings now flow naturally, relying on `keepNext` to avoid orphans (`DocxSerializer.ts:255-262`).
- Mermaid images use `TWIPS_PER_PIXEL = 15` (1440 ÷ 96) and clamp to `PAGE_WIDTH_TWIPS`, preserving aspect ratio via a single `scale` factor.
- `features: { updateFields: true }` — the TOC populates automatically on open.

---

## pdfmake and the standard 14 fonts

`PdfSerializer` uses only the standard 14 PDF fonts — Helvetica and Courier (`PdfSerializer.ts:21-35`). **No font files are bundled**, which is the entire point: the package stays self-contained with no TTFs and no native binaries.

The cost is paid in two places, both of which are deliberate and both of which look like bugs if you don't know:

- **`GLYPH_FALLBACKS` (`PdfSerializer.ts:42-50`)** — the standard 14 only support WinAnsi-encoded glyphs. Renderers occasionally emit Unicode symbols (the ●/○ privilege dots in `securityRoleRenderer`) that fall outside that range and render as garbage. The fallback map substitutes the closest WinAnsi-safe equivalent. **Adding a Unicode glyph to a renderer means adding a fallback here**, or accepting garbage in the PDF.
- **Per-column minimums sized to the longest *unbreakable* word** (`longestWordWidth`/`calcColumnWidths`) — the standard 14 have no hyphenation, so a long entity name or identifier would hard-break mid-character without this.

Otherwise `PdfSerializer` deliberately mirrors `DocxSerializer`: A4, 1" margins, `COL_MAX_CHARS = 35` cap, proportional column widths, Mermaid skipped. One intentional divergence: all-empty-header tables render as a plain bordered grid rather than a shaded header bar, because pdfmake always shades `headerRows` and Markdown/Word have no visible header row there.

Section headings flowing naturally with no forced page breaks is *shared* with `DocxSerializer`, not a divergence — both removed the page break for the same reason, that forcing one left large dead-space gaps when a section ended partway down a page (`PdfSerializer.ts:323`, `DocxSerializer.ts:255-262`).

---

## AI enrichment: cache-first, hashed over a summarisable view

Every component that gets an AI summary is first reduced to a **summarisable view** — a small, stable projection containing only the fields that would meaningfully change the summary (names, descriptions, triggers, steps). Cosmetic fields — ids, depth bookkeeping, raw XML offsets — are excluded.

**Why not hash the full IR?** Because the IR churns for reasons that have nothing to do with the summary. Hash the whole model and any cosmetic field addition silently invalidates every cached entry and bills a full regeneration on the next client run. The view is the insulation layer.

The view is the single source of truth for **both** the hash and the prompt payload. That symmetry is the useful property: a field added to a view automatically invalidates every entry of that kind, because the thing the model sees and the thing we hash are the same object.

- **Hash:** `sha256('v' + PROMPT_VERSION + ':' + JSON.stringify(view))` (`aiSummariser.ts:74-77`)
- **Cache key:** `{type}:{uniqueName}` · **Entry:** `{ hash, summary, generatedAt }`
- **Hit test:** `!forceRegenerate && existing && existing.hash === hash`
- **`PROMPT_VERSION`** is currently `2` (`aiSummariser.ts:38`)

**`PROMPT_VERSION` is folded into the hash specifically so that bumping it is a deliberate, global invalidation.** This is the trap that matters: **editing prompt wording without bumping `PROMPT_VERSION` leaves every existing entry a false hit** — the new prompt never runs, and the change looks like a no-op. It was bumped 1 → 2 for the structured-output change that added per-function web resource summaries.

An unparseable cache file warns and starts empty rather than failing the run (`aiSummariser.ts:60-65`).

### The diagram cache is the same idiom — with one asymmetry

`renderDiagramPng` caches PNGs to `.powerautodocs-diagram-cache/` keyed by `sha256(mermaidSource).slice(0,16)` (`mermaidRenderer.ts:96-98, 120-127`). A cache hit never launches the browser, which is why most runs never pay for a browser at all. Both caches key on **content**, never mtime or filename.

**But the diagram cache has no `PROMPT_VERSION` equivalent.** The key is the Mermaid source alone. So changing `SCALE_FACTOR`, the viewport, or `backgroundColor` **does not invalidate anything** — stale PNGs at the old resolution persist until you manually delete the cache directory. An agent tuning render settings will see no change and conclude the edit didn't work. This asymmetry is a known rough edge, not a designed feature.

---

## Error handling: fail-fast for environment, skip-and-continue for artifacts

The dividing line is sharper than "skip-and-continue + run summary" suggests, and getting it wrong has consequences in both directions.

**Fail-fast (throw/exit before work starts)** — problems that are cheap to detect and always fatal:
- Config YAML parse + shape errors (`config/loader.ts`)
- `validateAiEnrichmentConfig` — a misconfigured `aiEnrichment` block throws before any parsing starts
- Unknown CLI flags (`src/index.ts:79-85`)
- Chrome resolution — probed once up front, not on first diagram

**Skip-and-continue (record and carry on)** — per-artifact problems, where one bad file must not cost the other seven solutions:
- Every parser call is wrapped by `tryParse<T>` (`src/index.ts:32-48`) → `summary.parseWarnings`, returns a fallback
- Each solution is additionally wrapped → `summary.solutionsSkipped`
- Publish/Word/PDF failures → `summary.publishFailures`
- A missing/`REDACTED` wiki PAT (`src/index.ts:330-333`) → `summary.publishFailures`. **This one reads like fail-fast and isn't.** The check sits inside the wiki-publish block, so it runs only *after* every solution has been parsed, enriched and rendered; it logs, records the failure and carries on, and Word/PDF output still generates. It turns the build red via the end-of-run exit check, not by exiting early. (`wikiPublisher.ts:166` does throw on the same condition, but `index.ts:330` guards first, so that is a defence-in-depth backstop.)
- AI API failures → `summary.aiSummaryFailures`, falling back to a stale cached summary if one exists

**Which bucket turns the build red:** `src/index.ts:441-442` exits 1 **only** if `solutionsSkipped` or `publishFailures` is non-empty. `parseWarnings` and `aiSummaryFailures` do **not** fail the build — but they are not graded alike either. Only `parseWarnings` downgrades the run to "⚠ Completed with warnings" (`logger.ts:75` derives `hasWarnings` from `parseWarnings` alone). `aiSummaryFailures` are printed as a count block in the summary body (`logger.ts:63-68`) and touch the status line not at all, so a run whose only problem is failed AI summaries still reads "✓ Completed successfully". Don't go looking for a warning grade to detect them.

Adding a new failure mode means picking a `RunSummary` bucket in `src/logger.ts` and adding a `logSummary` block. Choose deliberately: throw from a parser and you kill an entire client's run over one bad XML file; route a genuine publish failure into `parseWarnings` and you hand ADO a green build on a broken publish.

---

## File casing is load-bearing and only breaks in production

The rule — capitalised folder **and** filename segments — is enforced nowhere but the hardcoded paths themselves:

- `src/index.ts:60` — `path.join(unpackedPath, 'Other', 'Solution.xml')`, the pre-flight check whose failure reads "This doesn't look like a pac-unpacked solution folder"
- `src/parsers/solutionManifestParser.ts:22` — same path
- `src/parsers/connectionReferenceParser.ts:49` — `path.join(solutionRoot, 'Other', 'Customizations.xml')`

**Why it bites:** macOS and Windows dev machines are case-insensitive. Write `path.join(root, 'other', 'solution.xml')` from habit and it passes locally, passes review, and fails only on the client's Linux ADO agent. There is no test and no CI to catch it. Copy the capitalisation from an existing call site rather than typing it.

---

## Dependencies: five of them are vestigial

`package.json` declares `commander`, `handlebars`, `zod`, `adm-zip` and `glob`. **None of the five is imported anywhere in `src/`.** Their presence in `package.json` is not evidence they are the sanctioned approach:

- **`commander`** — CLI parsing is deliberately hand-rolled off `process.argv` with a `KNOWN_FLAGS` set (`src/index.ts:73-85`). Do not assume a migration has happened.
- **`handlebars`** — directly contradicts the "no templating engine" rationale behind the TypeScript/IR choice. Do not reach for it.
- **`zod`** — config validation is hand-written in `config/loader.ts`.

**Adding a new npm dependency requires asking Lewis first — this is a hard stop**, alongside `npm publish` and `package.json` version bumps. Everything else (branching, committing, merging, config/schema changes) you may do autonomously. See [Process](process.md).

Live non-obvious dependencies, for contrast: `@anthropic-ai/sdk` and `openai` (AI providers), `@mermaid-js/mermaid-cli` + `puppeteer` (diagram rendering), `docx`, `pdfmake`, `fast-xml-parser`, `js-yaml`.

---

## Decisions deliberately not taken

| Not doing | Status | Why |
|-----------|--------|-----|
| Confluence renderer | WON'T | Most clients use ADO; a fourth serializer isn't earning its keep |
| Canvas App source parsing | WON'T | Out of scope |
| Mermaid in PDF | Not planned | `PdfSerializer` returns `null` by design; plumbing exists if this changes |
| `commander` for CLI parsing | Not planned as-is | Hand-rolled parser is sufficient; migrating is a Phase 5 nice-to-have, not a directive |
