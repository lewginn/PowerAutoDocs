# Playbooks

Step-by-step wiring checklists for the four recurring extension tasks in this codebase.

**Read this when:** you are adding a new component parser, a new AI provider, a new output
format/serializer, or a new `DocNode` type — and you need the exact files to touch, in order,
and what breaks if you miss one.

For the surrounding git/branch/PR workflow, how a change is verified, and the release
mechanics, see [Process](process.md). This doc covers only *what to wire and in what order*.

---

## Read this first — conventions that apply to every playbook

**TypeScript error vs SILENT missing output.** This is the distinction that matters most.
`strict: true` is on (`tsconfig.json:8`), so some omissions are caught at compile time and
some are not. Each checklist below marks every step with one of:

- **TS** — the compiler catches it. `npm run build` fails. Safe to forget.
- **SILENT** — it compiles, it runs, the exit code is 0, and the output is quietly wrong or
  missing a section. These are the dangerous ones, and **the test suite does not catch them
  either** — it covers DocNode serialisation, `rendererUtils`, the ERD generator and the
  fixtured parsers, none of which is where a wired-up-wrong renderer shows itself. Assume a
  SILENT step is caught by nothing but you (see [Process](process.md)).

**CI (`ci.yml`) typechecks, builds and tests every PR** — so a TS error no longer waits for
release day. Run `npm run typecheck && npm test` locally anyway; it takes seconds and CI is
not a substitute for exercising the change end-to-end.

**Barrels are not uniformly complete.** Do not assume the barrel is the public surface:

| Barrel | Gap |
|--------|-----|
| `src/renderers/index.ts` | Does not export `rendererUtils.ts` at all. `aiSummaryBlock()` and `toADOWikiLink()` are imported directly from `./rendererUtils.js`. |
| `src/docmodel/index.ts` | Exports `nodes`, `MarkdownSerializer`, `DocxSerializer` — **not** `PdfSerializer`. Consumers import `../docmodel/PdfSerializer.js` directly. |
| `src/ir/index.ts` | Type-only re-exports (`export type {...}`), plus runtime values separately (`WEB_RESOURCE_TYPE_MAP`). A new runtime const needs a non-`type` export line. |

Follow the established convention of the barrel you are editing rather than "fixing" it as a
drive-by.

**DocNode builders live in `src/docmodel/nodes.ts`, not `rendererUtils.ts`.** `h`, `p`, `pt`,
`bq`, `bqt`, `toc`, `mermaid`, `codeBlock`, `table`, `cell`, `ct`, `cc`, `bulletList`,
`bullet`, `t`, `c`, `b`, `i`, `lnk` are all defined at `nodes.ts:110-179`.
`src/renderers/rendererUtils.ts` holds exactly two functions: `toADOWikiLink()`
(`rendererUtils.ts:10`) and `aiSummaryBlock()` (`rendererUtils.ts:27`).

**No format syntax in the DocNode layer, ever.** A `DocNode` carries semantic content only;
all format syntax belongs in a serializer. The canonical example: `mermaid()` nodes hold raw
Mermaid DSL with no fence (`nodes.ts:61`), and `MarkdownSerializer.ts:84` adds the ADO
`:::mermaid` fence. Baking the fence into the generator once already shipped a double-fence
bug (commit `a7c803d`).

**The two hard stops.** You may branch, commit, push, open PRs, merge to main, and change
config/schema without asking. You must ask Lewis before **(a)** any `npm publish` or
`package.json` version bump, and **(b)** adding any new npm dependency. Playbook 3 in
particular usually needs a new dependency — stop and ask before you install it.

> The five vestigial deps (`commander`, `handlebars`, `zod`, `adm-zip`, `glob`) were pruned on
> 2026-07-17. Two of them — `commander` and `zod` — are still in `node_modules` as transitive
> deps of `@mermaid-js/mermaid-cli` and `chromium-bidi`, so importing one **compiles locally
> and is still an undeclared dependency**. Finding a module in `node_modules` is not sanction.

---

## 1. Add a new component parser

The full path for a new top-level component (BPF, PCF, Custom Connector, etc.). Touch in
this order — each step depends on the previous one compiling.

| # | File | What | Miss it → |
|---|------|------|-----------|
| 1 | `src/ir/{name}.ts` | Define the IR interface. Parsers produce it, renderers consume it, neither knows the other. | **TS** |
| 2 | `src/ir/index.ts` | `export type { {Name}Model } from './{name}.js';` Runtime consts need a separate non-`type` export. | **TS** at every import site |
| 3 | `src/parsers/{name}Parser.ts` | Implement. Emit IR only — no rendering, no markdown, no config-shaped output. | — |
| 4 | `src/parsers/index.ts` | Add barrel export. | **TS** in `src/index.ts` |
| 5 | `src/renderers/{name}Renderer.ts` | Implement. Consume IR only. Emit `DocNode[]` — see the caveat below. | — |
| 6 | `src/renderers/index.ts` | Add barrel export. | **TS** in all three assemblers |
| 7 | `src/config/schema.ts` | Add the toggle to `DocGenConfig.components` (`schema.ts:122-138`). | **TS** where you read it |
| 8 | `src/config/loader.ts` | Add the default to `CONFIG_DEFAULTS` (`loader.ts:21`). **This is the single source of truth for defaults** — the JSDoc in `schema.ts` is known-stale and disagrees with the loader in two places (`environmentVariables.enabled` and `output.word` — both documented as `false`, both actually `true`). | **TS** if the field is required; **SILENT** (undefined → falsy → never renders) if optional |
| 9 | `samples/doc-gen.config.sample.yml` | Add to the `components:` block (~line 81). This file is the client-facing contract — it is what clients copy. | **SILENT**, downstream: clients never discover the component exists |
| 10 | `src/index.ts` | Add the accumulator array (`index.ts:124-135`), the `tryParse`-wrapped parse block gated on the toggle (pattern: `index.ts:194-284`), and pass the accumulator to all three assembler calls (`index.ts:335`, `:383`, `:413`). | **SILENT** — no data, empty section |
| 11 | `src/publisher/wikiAssembler.ts` | Add the parameter to `buildWikiPages()` (`wikiAssembler.ts:41`) and the wiki section. | **SILENT** — see the asymmetry note |
| 12 | `src/publisher/docAssembler.ts` | Add the parameter to `buildWordDocument()` (`docAssembler.ts:75`) **before `outputPath`** and the Word section. | **TS** for the param, **SILENT** for the section |
| 13 | `src/publisher/pdfAssembler.ts` | Add the parameter to `buildPdfDocument()` (`pdfAssembler.ts:59`) **before `outputPath`** and the PDF section. **The old checklist omitted this step entirely.** | **TS** for the param, **SILENT** for the section |
| 14 | `docs/architecture.jsx` | Flip `done: false` → `done: true`. This file is built by the `docs-viewer/` Vite app and auto-deploys to GitHub Pages on merge to main — it must stay valid JSX. | **SILENT** — docs drift |

### The assembler asymmetry — read this before step 11

All three assemblers take positional parameters with `= []` defaults. This makes them behave
differently when you forget a call site:

- **`buildWikiPages()` ends at `modelDrivenApps = []` — no trailing required parameter.** Add
  a 15th parameter with a default, forget to pass it from `index.ts`, and **it compiles
  cleanly and silently publishes an empty section.** Nothing catches this.
- **`buildWordDocument()` and `buildPdfDocument()` end with a required `outputPath: string`.**
  Insert a parameter before it without updating the call sites and you get a **TS error** —
  because `outputPath` is a required parameter following defaulted ones, TypeScript raises the
  call's minimum arity, so the existing 15-argument call fails with `TS2554: Expected 16
  arguments, but got 15`. The required trailing parameter is doing real work as a guard here.

So: the wiki assembler is the one that will silently betray you. Check it last, and check it
by eye.

### Renderer caveat — it is not one file per component

`src/renderers/` is *not* strictly one renderer per component type, despite what the folder
listing suggests. There is no `formRenderer.ts`, `viewRenderer.ts` or `relationshipRenderer.ts`
— forms, views and relationships all render inside `tableRenderer.ts`
(`renderTableViews`, `renderTableForms`, `renderTableRelationships`, exported at
`renderers/index.ts:1-7`).

**Rule of thumb:** a table-scoped component renders inside `tableRenderer.ts`; only a
top-level component gets its own file. Note also that business rules already have two render
paths — `renderTableBusinessRules`/`renderSingleBusinessRule` in `tableRenderer.ts` *and*
`renderBusinessRule`/`renderBusinessRulesOverview` in `businessRuleRenderer.ts`. Don't add a
third.

### Toggles gate parsing, not just rendering

Contrary to the old doc, `components` toggles gate **both parsing and rendering** — a disabled
component is never parsed (`index.ts:194-284`, and `solutionParser.ts:59-70` for
views/forms/relationships). The one exception is `components.tables`, which is render-only
(`index.ts:179`); tables are parsed regardless at `index.ts:166` because the merged solution
model depends on them.

**Business rules are the odd one out:** `parseBusinessRules` is called unconditionally at
`index.ts:187` and there is no `components.businessRules` field in `schema.ts` — yet
`aiEnrichment.components.businessRules` *does* exist and is honoured. If you add a
`components.businessRules` toggle, remember `index.ts:187` will not read it unless you wire it.

### Error-handling contract

Wrap every parser call in `tryParse` (`index.ts:35`). Per-artifact failures are
skip-and-continue — one bad XML file must not cost the other seven solutions. Do **not** throw
from a parser: `parseWarnings` and `aiSummaryFailures` do not fail the build, while
`solutionsSkipped` and `publishFailures` exit 1 (`index.ts:441`). Pick the right `RunSummary`
bucket in `src/logger.ts` for any new failure mode.

---

## 2. Add a new AI provider

The factory pattern keeps `aiSummariser.ts` fully provider-agnostic — it depends only on the
`AiProvider` interface. A new provider is a new file plus registrations in three places.

| # | File | What | Miss it → |
|---|------|------|-----------|
| 1 | `src/enrichment/providers/{Name}Provider.ts` | Implement the `AiProvider` interface — one method, `summarise(prompt: string): Promise<string>` (`AiProvider.ts:9`). **Throw on failure**; the orchestrator owns catching and skip-and-continue. | — |
| 2 | `src/config/schema.ts` | Add the value to the `AiProviderType` union (`schema.ts:28`) and add a `{Name}ProviderConfig` interface + the optional field on `AiEnrichmentConfig` (`schema.ts:65-78`). **The union is named `AiProviderType` — the old doc called it `AiEnrichmentProvider`, which does not exist.** | **TS** |
| 3 | `src/enrichment/providers/index.ts` | Add the barrel export **and** the `createProvider()` case (`providers/index.ts:22`). | **RUNTIME throw**, not TS — see below |
| 4 | `src/config/loader.ts` | Add a branch to `validateAiEnrichmentConfig()` (`loader.ts:114`). **The old checklist omitted this step.** | **FAIL-FAST throw at config load** — see below |
| 5 | `samples/doc-gen.config.sample.yml` | Document the new `aiEnrichment` block shape. | **SILENT**, downstream |
| 6 | `docs/architecture.jsx` | Add the provider if it materially changes auth or deployment. | **SILENT** — docs drift |

### Why steps 3 and 4 are not TypeScript-protected

`createProvider()` has a `default:` clause that throws (`providers/index.ts:36-37`). A
`default` makes the switch exhaustive as far as the compiler is concerned, so **adding a
provider to the union and forgetting the factory case compiles fine and throws at runtime**,
mid-run, after all parsing has completed.

Worse, `validateAiEnrichmentConfig()` has an `else` branch whose error message hardcodes the
provider list — `` `aiEnrichment.provider must be 'anthropic' or 'azure-openai' — got '...'` ``
(`loader.ts:139-141`). Forget step 4 and your new provider is rejected at config-load time
with a message claiming it isn't a valid provider. This validation is deliberately fail-fast:
a misconfigured AI block means the user opted in and got the shape wrong, so it throws before
any parsing starts.

### Secrets are named by config, not hardcoded

There is no hardcoded `ANTHROPIC_API_KEY` anywhere in `src/`. Providers read
`process.env[config.apiKeyEnv]` — the config names the env var, the code dereferences it.
`AnthropicProvider.ts:17` and `AzureOpenAIProvider.ts:22,52` both follow this. Preserve the
indirection; it is what keeps secrets out of `doc-gen.config.yml`.

### Current providers

- `AnthropicProvider.ts` — Claude API direct. `model` optional, falls back to
  `DEFAULT_ANTHROPIC_MODEL` (`schema.ts:37`).
- `AzureOpenAIProvider.ts` — Azure OpenAI Service. Endpoint + deployment + apiVersion, with
  `useManagedIdentity` as an alternative to `apiKeyEnv`.

### If you change prompt wording, bump `PROMPT_VERSION`

`PROMPT_VERSION` (`aiSummariser.ts:38`, currently `2`) is folded into the cache hash. Change
prompt wording or response format *without* bumping it and every existing cache entry stays a
false hit — the new prompt never runs and your change looks like a no-op.

---

## 3. Add a new output format / serializer

Derived from how PDF was actually added — commit `8393a12`
(*"feat: add PDF output via pdfmake — closes #67"*). That commit is the reference
implementation; read it before starting.

**Stop first:** a new output format almost always means a new npm dependency. That is a hard
stop — ask Lewis before installing. (`pdfmake` also needed `@types/pdfmake` as a
devDependency.)

| # | File | What | Miss it → |
|---|------|------|-----------|
| 1 | `package.json` | The library + any `@types/*` devDependency. **Ask Lewis first.** | — |
| 2 | `src/docmodel/{Name}Serializer.ts` | `serializeBlock(node, headingOffset)` switching over every `DocNode`; `serializeBlocks()`; `buildToc()`; a doc-definition builder; a `toBuffer()`. Mirror `PdfSerializer.ts` — it mirrors `DocxSerializer.ts` in turn. | **TS** (see Playbook 4) |
| 3 | `src/config/schema.ts` | `output.{fmt}` + `output.{fmt}Filename` (`schema.ts:83-104`). | **TS** |
| 4 | `src/config/loader.ts` | `CONFIG_DEFAULTS.output` entries (`loader.ts:28-36`). Default the format to `false` — enabling a new format by default changes every existing client's run. | **SILENT** — undefined → never generated |
| 5 | `src/publisher/{fmt}Assembler.ts` | `build{Fmt}Document(...)` mirroring `pdfAssembler.ts:59` section-by-section — same structure, same heading offsets. Positional params, `outputPath` last. | — |
| 6 | `src/index.ts` | Four edits: the flag const (`index.ts:73-77`), `KNOWN_FLAGS` (`index.ts:79`), the output-override block (`index.ts:107-114`), and the generation block (pattern: `index.ts:408-435`). | see below |
| 7 | `samples/doc-gen.config.sample.yml` | The `output:` block. | **SILENT**, downstream |
| 8 | `README.md` | Client-facing docs — commit `8393a12` updated it. | **SILENT**, downstream |
| 9 | `docs/architecture.jsx` | Layer 05 entry. | **SILENT** — docs drift |

### The `src/index.ts` edits are individually silent

- Forget `KNOWN_FLAGS` → the flag is rejected as unknown and the process exits 1
  (`index.ts:81-86`). Loud, at least.
- Forget the override block → the flag parses, is ignored, and **config silently wins**.
- Forget the generation block → the config field exists, documented, and does nothing.

The override block is three-way and all-or-nothing: if *any* of `--word`/`--wiki`/`--pdf` is
passed, all three config values are overwritten from the flags, so unlisted formats are
suppressed (`index.ts:107-114`). A fourth format must join that block or the semantics break.

### Decisions your serializer must make deliberately

- **Mermaid.** Two precedents. `DocxSerializer` takes an injected `MermaidRenderer` callback
  (`DocxSerializer.ts:219`) so the docmodel layer stays free of the puppeteer dependency
  chain; no callback or a `null` result skips the block. `PdfSerializer` just returns `null`
  (`PdfSerializer.ts:343-345`). If you skip Mermaid, you also need
  `dropOrphanedDiagramHeadings()` (`pdfAssembler.ts:50`) — shared renderers emit a "Diagram"
  heading immediately before the diagram, which would otherwise dangle with nothing beneath it.
  Note the callback plumbing already exists in `DocxSerializer`; adding diagrams to PDF is a
  mirroring job, not an invention.
- **The barrel.** `src/docmodel/index.ts` was **not** updated for `PdfSerializer` — consumers
  import the file directly. Match that, or update the barrel deliberately; don't do it by
  accident.
- **A `dev:` script.** `package.json` has `dev`, `dev:word`, `dev:wiki`, `dev:both` — there is
  no `dev:pdf`. Consider adding one; it is the fastest way to exercise a single output path.

---

## 4. Add a new DocNode type

The smallest playbook, and the best-protected one. **Verified empirically:** adding a variant
to the `DocNode` union and running `npx tsc --noEmit` produces exactly three `TS2366` errors —
`MarkdownSerializer.ts(69)`, `DocxSerializer.ts(250)`, `PdfSerializer.ts(315)`. One per
serializer. You cannot forget one.

| # | File | What | Miss it → |
|---|------|------|-----------|
| 1 | `src/docmodel/nodes.ts` | Define the node type, add it to the `DocNode` union (`nodes.ts:94-102`), add a builder helper alongside the others (`nodes.ts:128-179`). Semantic content only — no format syntax. | — |
| 2 | `src/docmodel/MarkdownSerializer.ts` | Add the case to `serializeBlock()` (`MarkdownSerializer.ts:69`). | **TS2366** |
| 3 | `src/docmodel/DocxSerializer.ts` | Add the case to `serializeBlock()` (`DocxSerializer.ts:246`). | **TS2366** |
| 4 | `src/docmodel/PdfSerializer.ts` | Add the case to `serializeBlock()` (`PdfSerializer.ts:315`). | **TS2366** |
| 5 | The renderers that emit it | Import the builder from `../docmodel/nodes.js`. | — |
| 6 | Assembler filters, if the node is wiki-only | e.g. `toc_placeholder` is stripped in the Word/PDF assemblers via `.filter(n => n.type !== 'toc_placeholder')` (`pdfAssembler.ts:106,123`). | **SILENT** — stray node in the wrong format |

### Why it's a compile error (and where the protection ends)

None of the three `serializeBlock` switches has a `default:` clause, and all three declare
non-`undefined` return types (`string`, `Content | null`, `Promise<DocxBlock | DocxBlock[]>`).
With `strict: true`, a non-exhaustive switch means an implicit `undefined` return that doesn't
match the annotation → `TS2366`. **Never add a `default:` to these switches** — it would
silently destroy the exhaustiveness guard that makes this playbook safe.

Each serializer may still legitimately *ignore* a node — but do it explicitly: return `[]`
(Docx `toc_placeholder`, `DocxSerializer.ts:303`) or `null` (Pdf, filtered out by
`serializeBlocks` at `PdfSerializer.ts:372-376`).

### Adding an `InlineNode` is NOT equally protected

Also verified empirically. Adding a variant to `InlineNode` (`nodes.ts:12-17`) surfaces only
three errors — `MarkdownSerializer.ts(13)`, `PdfSerializer.ts(65)`, `DocxSerializer.ts(26)`.
The two `inlinesToText()` helpers (`DocxSerializer.ts:55-65`, `PdfSerializer.ts:83-93`) stay
**silent**, because their `map` callbacks have no return-type annotation — TS happily infers
`string | undefined` and `.join('')` swallows it.

Those helpers feed table column-width measurement, so a new inline type silently measures as
zero-width and your tables come out mis-sized in Word and PDF with no error anywhere. If you
add an `InlineNode`, update both `inlinesToText()` functions by hand — the compiler will not
remind you.

---

## After any of these

Update `docs/architecture.jsx` (it builds via `docs-viewer/` and auto-deploys to GitHub Pages
on merge to main — a JSX syntax error breaks a public deploy; preview with `npm run docs`),
run `npm run build && npm run typecheck && npm test`, and exercise the change end-to-end.

If your change touches a layer the suite covers — `MarkdownSerializer`, `rendererUtils`,
`erdGenerator`, or a parser with fixtures — **add to the suite in the same PR**. Fixtures are
hand-written and fictional; never copy from `unpacked/`. See [Process](process.md) for what
"tested locally" actually means here, how to inspect generated `.docx`/`.pdf` output, and the
PR conventions.
