# Component Status

The what-exists matrix: every input source, parser, IR model, renderer, enrichment feature and output target, with its verified build status.

**Read this when:** you need to know whether something is already built before you build it; you're picking up a backlog item and want to know what it touches; you're about to claim a component is missing or shipped.

---

## How to read this doc

| Marker | Meaning |
|--------|---------|
| ✅ Built | Exists on disk, wired into the pipeline, verified against source at the file:line given |
| ⬜ Not built | No file, no IR type, no wiring. The path column is the *intended* location, not an existing one |
| ⚠️ Built but unwired | The code exists but nothing calls it |

MoSCoW priorities (M/S/C/W) are carried over from `docs/architecture.jsx`, which is the origin of the prioritisation. Where this doc and `architecture.jsx` disagree, **this doc is correct** — see [Known drift in architecture.jsx](#known-drift-in-docsarchitecturejsx) at the bottom.

This doc answers *what exists*. It does not cover *how the layers fit together* (see `architecture.md`), *how to configure it* (see `config-and-cli.md`), or *how to land a change* (see `process.md`).

---

## Layer 01 — Input sources

All input is an unpacked Power Platform solution folder, produced by `pac CLI` before the tool runs. `src/index.ts:60` pre-flight-checks for `Other/Solution.xml` and refuses to run without it — note the capitalisation, it is load-bearing on Linux ADO agents.

### ✅ Built

| Source | Where it's read from | MoSCoW |
|--------|----------------------|--------|
| Solution ZIPs | Unpacked via `pac CLI` before the tool runs | M |
| Flat XML exports | `Entities/` — entities, forms, views, saved queries, relationships | M |
| Power Automate Flows | Flow JSON from the solution export | S |
| Classic Workflows & Business Rules | XAML from `Workflows/` | S |
| Plugins & Assemblies | Step registrations from solution XML | S |
| Web Resources (JS) | JavaScript files from `WebResources/` | S |
| Security Roles | `Roles/` | S |
| Environment Variable Definitions | `EnvironmentVariableDefinitions/` | S |
| Global Choices (OptionSets) | `OptionSets/` | S |
| Connection References | `Other/Customizations.xml` (`connectionReferenceParser.ts:49`) | S |
| Email Templates | `Templates/EmailTemplates.xml` + subject/body XSL files | C |
| Model-Driven Apps | `AppModules/{uniqueName}/AppModule.xml` | C |
| Power Pages | `Assets/powerpagesites.xml` + `powerpagesitelanguages.xml`, `powerpagecomponents/{guid}/powerpagecomponent.xml` | C |

### ⬜ Not built

| Source | MoSCoW |
|--------|--------|
| Business Process Flows | S |
| Column Security Profiles | S |
| Routing Rule Sets | S |
| Custom Connectors | S |
| PCF Controls | C |
| Duplicate Detection Rules | C |
| SLAs | C |
| Dashboards | C |
| Service Endpoints | C |
| Canvas App Source | **W — out of scope** |

---

## Layer 02 — Parsers

`src/parsers/` — one parser per source type, all emitting IR and nothing else. Every parser is barrel-exported from `src/parsers/index.ts`.

### ✅ Built

| Parser | File | Entry point | IR output | Notes |
|--------|------|-------------|-----------|-------|
| Solution Manifest | `solutionManifestParser.ts` | `parseSolutionManifest()` | `SolutionModel` | Reads `Other/Solution.xml`. Runs for every solution |
| Per-solution orchestrator | `solutionParser.ts` | `parseSolution()` | `TableModel[]` | **Not a leaf parser.** Walks `Entities/`, delegates to `tableParser`, applies column filters, wires in views/forms/relationships per the `components` toggles (`solutionParser.ts:60-70`) |
| Entity / Table | `tableParser.ts` | `parseEntityXml()` | `TableModel` + `ColumnModel` | `isCustom` detection, lookup targets |
| View | `viewParser.ts` | `parseEntityViews()` | `ViewModel` | Nested join + alias resolution |
| Form | `formParser.ts` | `parseEntityForms()` | `FormModel` | Main, Quick Create, Card. Inactive forms skipped |
| Relationship | `relationshipParser.ts` | `parseAllRelationships()`, `getRelationshipsForTable()` | `RelationshipModel` | Direction-aware |
| Flow / Workflow | `flowParser.ts` | `parseAllFlows()` | `FlowModel` | Recursive action tree, Yes/No branches. **Also calls the Mermaid flow generator at parse time** — see the deviation note below |
| Classic Workflow | `classicWorkflowParser.ts` | `parseClassicWorkflows()` | `ClassicWorkflowModel` | XAML walker. Excludes Category=2 (business rules — owned by `businessRuleParser`); Category=3 → `'action'`, everything else → `'workflow'` (`classicWorkflowParser.ts:83-89`) |
| Business Rule | `businessRuleParser.ts` | `parseBusinessRules()` | `BusinessRuleModel` | XAML walker, Category=2 only (`businessRuleParser.ts:237`) |
| Plugin | `pluginParser.ts` | `parseAllPlugins()` | `PluginAssemblyModel` | Assembly + step registrations |
| Web Resource Analyser | `webResourceParser.ts` | `parseAllWebResources()` | `WebResourceModel` | JSDoc, namespace, function extraction |
| Security Role | `securityRoleParser.ts` | `parseSecurityRoles()` | `SecurityRoleModel` | Publisher-prefix filtered |
| Environment Variable | `environmentVariableParser.ts` | `parseEnvironmentVariables()` | `EnvironmentVariableModel` | Type codes mapped |
| Global Choice | `globalChoiceParser.ts` | `parseGlobalChoices()` | `GlobalChoiceModel` | Publisher-prefix filtered |
| Connection Reference | `connectionReferenceParser.ts` | `parseConnectionReferences()` | `ConnectionReferenceModel` | Connector-name lookup map |
| Email Template | `emailTemplateParser.ts` | `parseEmailTemplates()` | `EmailTemplateModel` | XSL subject + body reconstruction |
| Model-Driven App | `modelDrivenAppParser.ts` | `parseModelDrivenApps()` | `ModelDrivenAppModel` | `AppModule.xml` per app |
| Power Pages | `powerPagesParser.ts` | `parsePowerPages()` (`:470`) | `PowerPagesModel` | One model per site (D1); groups every `powerpagecomponent.xml` by `powerpagesiteid`. Structural only (D4) — stores payload lengths, never bodies. No publisher prefix (D3) |

> **Known deviation — the flow parser enriches at parse time.**
> `flowParser.ts:5` imports `generateMermaidDiagram` from `../enrichment/mermaidGenerator.js` and line 330 populates `mermaidDiagram` directly on the returned `FlowModel` (the field is declared at `ir/flow.ts`, consumed at `flowRenderer.ts:118-120`). This contradicts the layered model, where enrichment runs *after* parsing. The ERD generator does follow the documented pattern — it is called from the three assemblers, never from a parser. **Do not copy the flowParser precedent** when adding new enrichment; there is no flow-diagram call site in the assemblers, so don't hunt for one.

### ⬜ Not built

PCF, Business Process Flow, Duplicate Detection Rule, SLA, Dashboard, Column Security Profile, Service Endpoint, Routing Rule Set, Custom Connector. Priorities mirror the Layer 01 table above.

---

## Layer 03 — IR models

`src/ir/` — one file per domain. **These are the contract.** Additions are safe; renames and removals are breaking changes, because every renderer consumes these field names.

| Interface(s) | File | Status |
|--------------|------|--------|
| `SolutionModel`, `PublisherModel` | `ir/solution.ts` | ✅ Built |
| `TableModel`, `ColumnModel`, `ColumnType` | `ir/table.ts` | ✅ Built |
| `FormModel`, `FormTabModel`, `FormSectionModel` | `ir/form.ts` | ✅ Built |
| `ViewModel`, `ViewFilterCondition` | `ir/view.ts` | ✅ Built |
| `RelationshipModel` | `ir/relationship.ts` | ✅ Built |
| `FlowModel`, `FlowTriggerModel`, `FlowActionModel` | `ir/flow.ts` | ✅ Built |
| `ClassicWorkflowModel` (+ step/trigger types) | `ir/classicWorkflow.ts` | ✅ Built |
| `BusinessRuleModel`, `BusinessRuleCondition`, `BusinessRuleAction` | `ir/businessRule.ts` | ✅ Built |
| `PluginAssemblyModel`, `PluginStepModel`, `PluginStepImageModel` | `ir/plugin.ts` | ✅ Built |
| `WebResourceModel`, `WebResourceFunction`, `WEB_RESOURCE_TYPE_MAP` | **`ir/webResource.ts`** (capital R) | ✅ Built |
| `SecurityRoleModel`, `EntityPrivileges`, `PrivilegeLevel` | `ir/securityRole.ts` | ✅ Built |
| `EnvironmentVariableModel` | `ir/environmentVariable.ts` | ✅ Built |
| `GlobalChoiceModel`, `ChoiceOptionModel` | `ir/globalChoice.ts` | ✅ Built |
| `ConnectionReferenceModel` | `ir/connectionReference.ts` | ✅ Built |
| `EmailTemplateModel` | `ir/emailTemplate.ts` | ✅ Built |
| `ModelDrivenAppModel` | `ir/modelDrivenApp.ts` | ✅ Built |
| `PowerPagesModel` (+ per-component sub-types: `WebPageModel`, `WebTemplateModel`, `ContentSnippetModel`, `SiteSettingModel`, `WebRoleModel`, `PageAccessRuleModel`, `WebsiteAccessModel`, `SiteMarkerModel`, `WebLinkSetModel`, `WebLinkModel`, `BasicFormModel`, `ListModel`, `WebFileModel`, `BotConsumerModel`, `PageTemplateModel`, `PublishingStateModel`, `PowerPagesLanguageModel`) | `ir/powerPages.ts` (`:222`) | ✅ Built |
| `PCFModel` | `ir/pcf.ts` | ⬜ Not built |
| `BusinessProcessFlowModel` | `ir/bpf.ts` | ⬜ Not built |
| `ColumnSecurityProfileModel` | `ir/columnSecurityProfile.ts` | ⬜ Not built |
| `RoutingRuleSetModel` | `ir/routingRule.ts` | ⬜ Not built |
| `CustomConnectorModel` | `ir/customConnector.ts` | ⬜ Not built |
| `DuplicateDetectionRuleModel`, `SLAModel`, `DashboardModel`, `ServiceEndpointModel` | — | ⬜ Not built |

**`ir/webResource.ts` has a capital R.** Older docs said `webresource.ts`. Get this wrong and it compiles on macOS and fails on the Linux ADO agent — the same class of bug the "capitalised filenames" decision exists to prevent.

### Barrel gap

`src/ir/index.ts` covers every *file*, but omits one symbol: `PrivilegeOperation` (declared `ir/securityRole.ts:9`) is not exported, while its siblings `PrivilegeLevel` and `EntityPrivileges` are (`ir/index.ts:11`). Import it from `./securityRole.js` directly, or add it to the barrel — either is fine, just don't assume its absence means it doesn't exist.

---

## Layer 04 — Enrichment

`src/enrichment/` — cross-cutting analysis derived from IR. All read-only: enrichment returns derived data, it does not mutate IR (the one exception is `aiSummariser`, which populates `aiSummary` in place by design).

### ✅ Built

| Feature | File | Entry point | Notes |
|---------|------|-------------|-------|
| Mermaid ER Diagram Generator | `erdGenerator.ts` | `generateERDiagram()` | `erDiagram` from `TableModel[]` + relationships. Custom entities only (publisher-prefix filtered). Two-tier exclusion: `parse.excludeStandardRelationships` + `erd.excludeEntities`/`erd.excludeRelationships`. Self-referential edges skipped. Called by all three assemblers |
| Mermaid Flow Generator | `mermaidGenerator.ts` | `generateMermaidDiagram()` | `flowchart TD`. Pinned to Mermaid v8.14 — ADO Wiki will not render newer node shapes. If=diamond, Scope=subroutine, Foreach=loop, Terminate=circle. Called from `flowParser.ts:330`, not from the assemblers |
| Expression Serialiser | **`parsers/flowParser.ts:135`** | `serializeExpression()` (module-private) | Power Automate condition objects → human-readable strings. Handles and/or/not, comparisons, contains, startsWith. `cleanValue()` (`flowParser.ts:126`) strips `@outputs()`/`@triggerBody()` down to field names. **Lives in the parser, not `enrichment/`** — it is listed as an enrichment feature historically, but there is no `expressionSerialiser.ts` |
| AI Enrichment | `aiSummariser.ts` + `providers/` | `enrichWithAiSummaries()` (`aiSummariser.ts:336`) | Cache-first summaries. Supported kinds are exactly `'flows' \| 'classicWorkflows' \| 'businessRules' \| 'plugins' \| 'webResources'` (`aiSummariser.ts:189`), all opt-in and all defaulting to `false`. `PROMPT_VERSION = 2` (`aiSummariser.ts:38`) |
| **Dependency Resolver** | `dependencyResolver.ts` | `resolveFlowTableDependencies()` (`dependencyResolver.ts:41`) | ✅ **Built and shipped** — see below |
| Mermaid → PNG renderer | `mermaidRenderer.ts` | `renderDiagramPng()`, `resolveChromeExecutable()`, `closeMermaidBrowser()` | Renders Mermaid to PNG via a **local** Chrome/Edge. Word only — see Layer 05 |

#### Dependency Resolver (built — older docs said "not yet built")

`resolveFlowTableDependencies(flows, tables)` returns `{ tableToFlows, flowToTables }` lookup maps, derived read-only from IR — it mutates nothing, matching the `erdGenerator` pattern. It handles Dataverse entity-set pluralisation (`opportunities` → `opportunity`) via `singularCandidates()` (`dependencyResolver.ts:25`), because connector actions reference entity-set names while `TableModel.logicalName` is singular. Flows referencing no table in this solution are omitted from both maps.

Wired into all three assemblers:
- `wikiAssembler.ts:9, :86`
- `docAssembler.ts:21, :127`
- `pdfAssembler.ts:21, :97`

Surfaces in output as **"Used By Flows"** on table pages (`renderTableUsedByFlows`, `tableRenderer.ts:289`) and **"Tables Used"** on flow pages (`flowRenderer.ts:108-110`).

### AI providers

`src/enrichment/providers/` — pluggable behind the `AiProvider` interface (`summarise(prompt): Promise<string>`) plus a `createProvider()` factory, which keeps `aiSummariser.ts` provider-agnostic.

| Provider | File | Status |
|----------|------|--------|
| Anthropic (Claude API, direct) | `AnthropicProvider.ts` | ✅ Built |
| Azure OpenAI Service | `AzureOpenAIProvider.ts` | ✅ Built |
| OpenAI direct, Amazon Bedrock, … | — | ⬜ Not built |

Neither provider hardcodes an env var name — the config names the variable and the provider reads `process.env[config.apiKeyEnv]`. Grepping for `ANTHROPIC_API_KEY` in `src/` returns only two comment mentions (`config/schema.ts:31`, `providers/AnthropicProvider.ts:9`) and no code reference; that does not mean Anthropic auth is unwired. See `config-and-cli.md`.

### ⬜ Not built

| Feature | MoSCoW | Notes |
|---------|--------|-------|
| Complexity Scorer | C | Flag high-complexity flows/plugins |
| Change Detector | C | Git-diff → "what changed since last release" changelog pages |

---

## Layer 05 — Renderers, serializers and assemblers

### Renderers — `src/renderers/`

Renderers consume IR and emit `DocNode[]`. **The builder helpers (`h`, `p`, `pt`, `table`, `cell`, `ct`, `cc`, `bulletList`, `bullet`, `toc`, `mermaid`, `codeBlock`, `bq`, `bqt`, `t`, `c`, `b`, `i`, `lnk`) live in `src/docmodel/nodes.ts`** (lines 110-178), *not* in `rendererUtils.ts`. Older docs got this wrong. `src/renderers/rendererUtils.ts` exports three functions:

- `toADOWikiLink()` (`rendererUtils.ts:10`) — internal wiki link encoding
- `aiSummaryBlock()` (`rendererUtils.ts:27`) — emits the "Summary" `DocNode` section, returning `[]` when `aiSummary` is absent so output is byte-identical to pre-AI pages
- `encodePageSegment()` (added #110) — the ADO wiki page-path sanitiser, shared between `wikiAssembler.ts` (which builds the path) and every renderer building an `lnk()` href to it, so the two can never disagree the way four of them used to

`rendererUtils.ts` is **not** exported from `src/renderers/index.ts` — import it directly (`from './rendererUtils.js'`), as `flowRenderer.ts:9` does.

| Renderer file | Exports (via `renderers/index.ts`) | Status |
|---------------|------------------------------------|--------|
| `overviewRenderer.ts` | `renderOverview`, `writeOverviewMarkdown` | ✅ Built |
| `tableRenderer.ts` | `renderTableIndex`, `renderTableColumns`, `renderTableViews`, `renderTableForms`, `renderTableRelationships`, `renderTableBusinessRules`, `renderSingleBusinessRule`, `renderTableUsedByFlows`, `renderTableMarkdown`, `writeTableMarkdown` | ✅ Built |
| `flowRenderer.ts` | `renderFlowSummary`, `renderSingleFlow`, `renderFlowMarkdown`, `writeFlowMarkdown` | ✅ Built |
| `classicWorkflowRenderer.ts` | `renderClassicWorkflow`, `renderClassicWorkflowsOverview` | ✅ Built |
| `businessRuleRenderer.ts` | `renderBusinessRule`, `renderBusinessRulesOverview` | ⚠️ **Built but unwired** — see below |
| `pluginRenderer.ts` | `renderPluginSummary`, `renderAssemblyIndex`, `renderSinglePluginType`, `writePluginMarkdown` | ✅ Built |
| `webResourceRenderer.ts` | `renderWebResourceSummary`, `renderWebResourceDetail`, `writeWebResourceMarkdown` | ✅ Built |
| `securityRoleRenderer.ts` | `renderSecurityRolePage`, `renderSecurityRolesIndex`, `encodeRoleName` | ✅ Built |
| `environmentVariableRenderer.ts` | `renderEnvironmentVariablesPage` | ✅ Built |
| `globalChoiceRenderer.ts` | `renderGlobalChoicesIndex`, `renderGlobalChoicePage`, `encodeChoiceName` | ✅ Built |
| `emailTemplateRenderer.ts` | `renderEmailTemplatesIndex`, `renderEmailTemplatePage` | ✅ Built |
| `connectionReferenceRenderer.ts` | `renderConnectionReferencesPage` | ✅ Built |
| `modelDrivenAppRenderer.ts` | `renderModelDrivenAppsIndex`, `renderModelDrivenAppPage` | ✅ Built |
| `powerPagesRenderer.ts` | `renderPowerPagesIndex`, `renderPowerPagesSitePage` | ✅ Built — structural only (D4); all subsections are internal helpers composed into the site page |

Two things the "one renderer per component type" framing hides:

1. **There is no `formRenderer.ts`, `viewRenderer.ts` or `relationshipRenderer.ts`.** Table-scoped components render *inside* `tableRenderer.ts`. Only top-level components get their own file. If you add a table-scoped component, follow that precedent rather than the generic checklist.
2. **Business rules have two render paths.** All three assemblers use `tableRenderer`'s `renderTableBusinessRules` / `renderSingleBusinessRule` (`wikiAssembler.ts:112-114`, `docAssembler.ts:153-155`). `businessRuleRenderer.ts`'s `renderBusinessRule` / `renderBusinessRulesOverview` are exported from the barrel but have **zero consumers anywhere in `src/`** — dead code. Don't extend it thinking it's the live path, and don't add a third.

#### Legacy `write*Markdown()` helpers

The `render*` functions emitting `DocNode[]` are the primary path. Alongside them, five renderers (`tableRenderer`, `flowRenderer`, `overviewRenderer`, `pluginRenderer`, `webResourceRenderer`) import `serialize` from `MarkdownSerializer` directly and expose string-returning `render*Markdown()` / `write*Markdown()` helpers that write local files. `src/index.ts` still calls the `write*` ones during the parse loop. (`classicWorkflowRenderer` also imports `serialize` — `classicWorkflowRenderer.ts:6` — but never calls it: a dead import, and it exposes no such helper.)

So `MarkdownSerializer` has 7 importers, not one: `wikiAssembler.ts` plus all six renderers named above (the five that call `serialize`, and `classicWorkflowRenderer` which only imports it).

**These legacy helpers are not deprecated and are still called — do not delete them to "restore the invariant".** Equally, do not extend them: new component output belongs in the `DocNode[]` `render*` path plus the three assemblers, which is what actually reaches the wiki, Word and PDF.

### DocNode layer — `src/docmodel/`

| File | Purpose | Status |
|------|---------|--------|
| `nodes.ts` | `DocNode` / `InlineNode` / `BulletItem` types + all builder helpers | ✅ Built |
| `MarkdownSerializer.ts` | `DocNode[]` → ADO Wiki markdown string | ✅ Built |
| `DocxSerializer.ts` | `DocNode[]` → docx `Paragraph`/`Table` elements | ✅ Built |
| `PdfSerializer.ts` | `DocNode[]` → `pdfmake` content (standard 14 fonts) | ✅ Built — **deprecated, planned removal** (Lewis, 2026-07-17) |
| `index.ts` | Barrel — **omits `PdfSerializer`** (exports `nodes`, `MarkdownSerializer`, `DocxSerializer` only). Import `./PdfSerializer.js` directly | ✅ Built |

**Mermaid nodes carry raw DSL, never a fence.** `mermaidGenerator.ts:149` and `erdGenerator.ts:107` both `return lines.join('\n')` unfenced; `MermaidNode.code` is typed as raw Mermaid DSL. Each serializer wraps it its own way — `MarkdownSerializer` emits the ADO `:::mermaid` fence, `DocxSerializer` renders to PNG, `PdfSerializer` returns `null` (`PdfSerializer.ts:343-345`). Baking the fence into a generator double-fences the wiki output; that exact bug shipped once and was fixed in commit `a7c803d`. The general rule: **DocNodes carry semantic content only; all format syntax belongs in a serializer.**

### Assemblers — `src/publisher/`

There are **three** assemblers with the same shape. A new component must be wired into all three or it silently vanishes from one output format.

| Assembler | Entry point | Output | Status |
|-----------|-------------|--------|--------|
| `wikiAssembler.ts` | `buildWikiPages()` (`:41`) | `WikiPage[]` → ADO Wiki | ✅ Built |
| `docAssembler.ts` | `buildWordDocument()` (`:75`) | Word `.docx` | ✅ Built |
| `pdfAssembler.ts` | `buildPdfDocument()` (`:59`) | `.pdf` | ✅ Built — **deprecated, planned removal** (Lewis, 2026-07-17) |
| `wikiPublisher.ts` | `publishToWiki()` (`:158`) | ADO REST API PUT/GET | ✅ Built |

---

## Output targets

| Target | Serializer | Assembler | Enabled by | Diagrams? | Status |
|--------|-----------|-----------|------------|-----------|--------|
| ADO Wiki | `MarkdownSerializer` | `wikiAssembler` → `wikiPublisher` | `output.wiki` / `--wiki` | ✅ `:::mermaid` fence, rendered by ADO | ✅ Built |
| Word `.docx` | `DocxSerializer` | `docAssembler` | `output.word` / `--word` | ✅ PNG embeds, toggled by `output.wordDiagrams` (default `true`) | ✅ Built |
| PDF | `PdfSerializer` | `pdfAssembler` | `output.pdf` / `--pdf` | ❌ Skipped by design | ✅ Built — **deprecated, planned removal** (Lewis, 2026-07-17, see [decisions.md](decisions.md#pdfmake-and-the-standard-14-fonts)) |
| Confluence | — | — | — | — | ⬜ **W — not built.** Low priority, most clients are on ADO |

Notes that matter:

- **PDF is local-file output only** — it is never published to the wiki. **It is also planned for deprecation** (Lewis, 2026-07-17) — `pdfmake` lags Word on theming/formatting fidelity and Mermaid support; Word's own Export to PDF covers the same need from the same document. Nothing removed yet, `output.pdf` still works, but do not invest further in it.
- **Diagram rendering is wired for Word only.** `docAssembler.ts:99-106` checks `config.output.wordDiagrams !== false`, calls `resolveChromeExecutable()` once up front, and injects a `renderMermaid` callback into `DocxSerializer`. `pdfAssembler.ts` has no equivalent and never imports `mermaidRenderer`. So `output.wordDiagrams` is genuinely Word-scoped and there is no `pdfDiagrams` — and given the deprecation above, adding one is not recommended.
- **Missing Chrome degrades silently.** Diagram rendering needs a local Chrome/Edge (`.puppeteerrc.cjs` sets `skipDownload: true` deliberately — ADO agents are fresh VMs and would pay a ~250MB download every run). If no browser resolves, `docAssembler` warns and produces a diagram-free `.docx` rather than failing. A clean run is therefore **not** evidence the diagrams worked.

---

## Relationship to `docs/architecture.jsx`

`docs/architecture.jsx` is the interactive architecture doc — the human/client-facing view of this same matrix, with `done: true|false` and `moscow` fields per component. It is the origin of the MoSCoW priorities reproduced here.

It is **not** standalone: it is imported by `docs-viewer/` (a separate Vite/React app) and auto-deploys to GitHub Pages on merge to `main`. It must stay valid JSX.

When a feature lands, `architecture.jsx` must be updated to match this doc. **The update process — how to edit it, preview it, and what deploys — belongs in [process.md](process.md).** This doc is only the statement of truth about what is built.

### Known drift in `docs/architecture.jsx`

Verified stale at the time of writing. Fix opportunistically when you touch the file:

| Location | Says | Reality |
|----------|------|---------|
| Enrichment → Dependency Resolver | `done: false` | ✅ Built and wired into all three assemblers |
| Output → Markdown Renderer detail | "All renderers emit markdown strings directly — string builder pattern with `markdownTable()` helper" | Renderers emit `DocNode[]`; `MarkdownSerializer` does the conversion. Only the legacy `write*Markdown()` helpers still build strings |
| IR → WebResourceModel tag | `ir/webresource.ts` | `ir/webResource.ts` (capital R) |
| Input → Classic Workflows detail | "Category=0 → classic workflow" | Parser excludes Category=2 and maps Category=3 → `'action'`, everything else → `'workflow'` |
| Enrichment → AI Summary Cache Manager | "Committed `.powerautodocs-ai-cache.json`" | Committed in the *client's* repo; gitignored in this repo. See `config-and-cli.md` |
| Pipeline → GitHub Actions npm Publish | "Triggers on GitHub Release created" | Triggers on `[created, published]` — `created` alone silently skipped the v1.4.0 publish. See `process.md` |
