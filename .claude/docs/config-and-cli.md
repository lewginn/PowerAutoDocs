# Config, CLI & Environment

The operational reference for `doc-gen.config.yml`, CLI flags, environment variables, caches and local runs.

**Read this when:** you need to know what a config field does or defaults to, what a CLI flag does, what the process reads from the environment, why a cache did or didn't invalidate, or how to run the tool locally.

---

## Where the truth lives

Three places claim to define defaults. Only one is real.

| Source | Authority |
|--------|-----------|
| `src/config/loader.ts` → `CONFIG_DEFAULTS` (loader.ts:21-78) | **Authoritative.** This is what merges with the YAML at runtime. |
| `src/config/schema.ts` JSDoc (`/** Default: X */`) | **Known stale — do not trust.** Two comments contradict the loader (see below). |
| `samples/doc-gen.config.sample.yml` | The client-facing template. Its values are *choices*, not defaults — it deliberately overrides some. |

Verified comparison of the security- and output-relevant JSDoc defaults against `CONFIG_DEFAULTS` — the first two contradict, the third is listed because it is often assumed stale and is not:

| Field | schema.ts says | loader.ts actually sets |
|-------|----------------|-------------------------|
| `output.word` | schema.ts:88 "Default: false" | loader.ts:31 `true` |
| `components.environmentVariables.enabled` | schema.ts:16 "Default: false" | loader.ts:57 `true` |
| `components.environmentVariables.showCurrentValue` | schema.ts:20 "Default: true" | loader.ts:59 `true` (agrees) |

If you change a default, change `CONFIG_DEFAULTS`. Fixing the JSDoc alongside it is welcome but is cosmetic.

---

## Config loading

`loadConfig(configDir)` — `src/config/loader.ts:162`.

- Directory resolution (`src/index.ts:91`): `configDir` argument → `process.env.DOC_GEN_CONFIG_DIR` → `process.cwd()`. The file must be named exactly `doc-gen.config.yml`.
- **A missing config does not fail the run.** loader.ts:165-168 logs `No doc-gen.config.yml found at … — using defaults` and returns `CONFIG_DEFAULTS`. That means an unconfigured run silently proceeds against `./unpacked` with an empty `publisherPrefix`, `wiki: true` and `word: true` — it looks like a successful run that documented nothing. If output is mysteriously empty, check this first.
- Invalid YAML, or a non-object at the top level, **throws** (loader.ts:176, :180) and `index.ts:92-97` exits 1.
- Merge is `deepMerge` (loader.ts:84): right side wins, **arrays are replaced, not concatenated**. Setting `parse.excludedColumns` in YAML discards the 12 built-in exclusions entirely rather than adding to them.
- A solution entry with no `publisherPrefix` warns but does not fail (loader.ts:186-193). Custom-component detection is then broken across ERD, security roles, global choices and model-driven apps.
- `aiEnrichment` is fail-fast validated at load time (`validateAiEnrichmentConfig`, loader.ts:114) — see [AI enrichment](#aienrichment) below.

**Path resolution gotcha:** `solutions[].path` resolves against `process.cwd()`, not against the config directory — `index.ts:145` passes it straight to `fs.existsSync`. Only the AI cache honours `configDir` (aiSummariser.ts:346). The schema comment "relative to config file" (schema.ts:7) is wrong. With `DOC_GEN_CONFIG_DIR` pointing somewhere other than cwd, solution paths still resolve from cwd.

---

## `doc-gen.config.yml` — full field reference

Every field in `DocGenConfig` (`src/config/schema.ts:80`). Defaults from `CONFIG_DEFAULTS` (`src/config/loader.ts:21`).

### `solutions[]` — required in practice

Array of `SolutionEntry` (schema.ts:6). Each is parsed independently and merged before render.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `path` | string | `./unpacked` (single default entry) | Unpacked solution folder. Resolved from **cwd**, not the config dir. Must contain `Other/Solution.xml` or the solution is skipped (index.ts:60-63) and the run exits 1. |
| `publisherPrefix` | string | `''` | Drives custom-component detection everywhere. Empty = warning at load, degraded output. |
| `displayName` | string? | the `path` string verbatim | Run log label only (`index.ts:140` → `logHeader`). Not used in any wiki heading — schema.ts:11's "used in wiki headings. Defaults to folder name" is stale on both counts. |

### `output`

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `path` | string | `./output` | Local artifact directory — markdown, `.docx`, `.pdf`. |
| `wiki` | boolean? | `true` | Publish to ADO Wiki. `false` nulls `config.wiki` outright (index.ts:117-119). |
| `word` | boolean? | `true` | Generate `.docx`. (schema.ts's doc comment claimed `false` — corrected to match `CONFIG_DEFAULTS`.) |
| `wordFilename` | string? | `solution-documentation.docx` | Joined onto `output.path`. |
| `pdf` | boolean? | `false` | Generate `.pdf`. Local only — never published to the wiki. **Deprecated — planned removal** (Lewis, 2026-07-17); see [roadmap.md](roadmap.md#open-work-outside-the-phase-plan) for the reasoning. |
| `pdfFilename` | string? | `solution-documentation.pdf` | |
| `wordDiagrams` | boolean? | `true` | Embed Mermaid diagrams as PNGs in the Word doc. **Word-scoped only** — there is no PDF equivalent; `PdfSerializer` skips Mermaid by design. Degrades to a console warning (not a failure) when no browser is found — see [Chrome resolution](#puppeteerrccjs-and-chrome-resolution). |
| `wordTheme` | object? | *(absent — see below)* | Visual theme for the `.docx`. **Word-scoped only** — the PDF is pdfmake and unthemed. See [`output.wordTheme`](#outputwordtheme). |

#### `output.wordTheme`

Every field is optional and **defaulting does not happen in `loader.ts`** — `CONFIG_DEFAULTS` has no `wordTheme` key at all. Resolution lives solely in `resolveWordTheme()` (`src/docmodel/wordTheme.ts`), so there is one source of truth rather than a default table that can drift from the resolver. An absent block and an empty block produce the identical default theme.

Most of these derive from `accentColor` — the intended common case is a one-line brand override. Setting any derived field overrides only itself.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `accentColor` | string? | `#2A6099` | Brand colour. H1/H2, table header fill, rules, banding tint and code colour all derive from it. |
| `bodyFont` | string? | `Calibri` | |
| `headingFont` | string? | `bodyFont` if set, else `Calibri Light` | |
| `bodyFontSize` | number? | `10.5` | **Points**, not half-points — the resolver converts. |
| `bodyColor` | string? | `#1A1A1A` | Near-black, not pure black — deliberate, see the file's comment. |
| `headingColor` | string? | `accentColor` | Levels 3-4 are auto-darkened from it (25% / 40% towards black). |
| `headingRule` | boolean? | `true` | Rule under level-1 headings. |
| `tableHeaderFill` | string? | `accentColor` | |
| `tableHeaderColor` | string? | white or `#1A1A1A`, whichever contrasts | Chosen by WCAG relative luminance — a pale brand colour gets dark text automatically. |
| `tableBanding` | boolean? | `true` | When on, `insideHorizontal` borders are dropped — shading already delineates rows. |
| `tableFontSize` | number? | `9` | **Points.** A step below body text — these tables are dense and wide and body size forces mid-word wrapping. Also drives column measurement, so raising it widens columns rather than overflowing them. |
| `tableBandFill` | string? | 92% tint of `accentColor` towards white | |
| `tableBorderColor` | string? | 70% tint of `accentColor` towards white | |
| `codeFont` | string? | `Courier New` | |
| `codeFill` | string? | `#F2F2F2` | |
| `codeColor` | string? | `accentColor` darkened 35% | |

Colours accept `'#0F62FE'` or `'0f62fe'`. **An invalid colour warns and falls back — it never throws.** This deliberately differs from `validateAiEnrichmentConfig`'s fail-fast stance: a bad hex is cosmetic, and failing an entire unattended pipeline run at the *end* of a long parse over a missing `#` is a worse outcome than a correct document in the default colour.

Code size is **not** themeable — it is fixed at 9pt (`CODE_SIZE_HALF_POINTS`, `DocxSerializer.ts`) as a deliberate relationship to body size, since monospace runs optically larger at equal nominal size. Inside a table it is clamped to the table size so code chips never outsize the cell around them.

**`tableFontSize` is load-bearing, not cosmetic.** `calcColumnWidths` measures at exactly the size the cells render at — measuring at one size and rendering at another is precisely how text ends up wider than the column holding it. Raise it and columns widen to match; there is no separate knob to keep in sync.

Fonts are resolved by Word on whatever machine opens the document; missing fonts are **silently substituted**. The defaults are all Office-bundled for that reason.

### `parse`

Controls what the parsers keep. Applied inside `solutionParser.ts:52-70`.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `customColumnsOnly` | boolean | `false` | `true` drops every column without `isCustom`. |
| `excludeBaseCurrencyFields` | boolean | `true` | Drops `*_base` columns of type `money`. |
| `excludeStandardRelationships` | boolean | `true` | Keeps only `isCustom` relationships. Also the first tier of ERD noise filtering. |
| `excludedColumns` | string[] | 12 entries (loader.ts:6-19) | `timezoneruleversionnumber`, `utcconversiontimezonecode`, `importsequencenumber`, `overriddencreatedon`, `exchangerate`, `transactioncurrencyid`, `owningteam`, `owninguser`, `owningbusinessunit`, `createdonbehalfby`, `modifiedonbehalfby`, `versionnumber`. **Setting this in YAML replaces the list — it does not extend it.** |

### `render`

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `formLayout` | `'compact' \| 'detailed'` | `'compact'` | `compact` = summary table; `detailed` = full tab/section/field breakdown. Consumed at `tableRenderer.ts:164,183`. |

> `src/config/renderOptions.ts` exports a `RENDER_OPTIONS` constant with the same `formLayout` key. It is **dead code** — nothing in `src/` imports it (only `src/config/index.ts` re-exports it). `config.render.formLayout` is the live path. Don't wire new render options through `renderOptions.ts`.

### `components`

**These toggles gate parsing, not just rendering** — a disabled component is never parsed at all (`index.ts:194-284`, `solutionParser.ts:60-70`). The sample config's comment "all components are always parsed" (sample.yml:79) is wrong.

| Field | Default | Gate site |
|-------|---------|-----------|
| `tables` | `true` | **Render-only exception.** Tables are always parsed (index.ts:166) because the merged solution model depends on them; the toggle only suppresses local markdown writes (index.ts:179). |
| `forms` | `true` | solutionParser.ts:61 — parse gated |
| `views` | `true` | solutionParser.ts:60 — parse gated |
| `relationships` | `true` | solutionParser.ts:63-70 — parse gated |
| `flows` | `true` | index.ts:194 |
| `classicWorkflows` | `true` | index.ts:204 |
| `plugins` | `true` | index.ts:213 |
| `webResources` | `true` | index.ts:223 |
| `securityRoles` | `true` | index.ts:233 |
| `globalChoices` | `true` | index.ts:242 |
| `emailTemplates` | `true` | index.ts:269 |
| `modelDrivenApps` | `true` | index.ts:278 |
| `connectionReferences` | `true` | index.ts:260 |
| `powerPages` | `false` | index.ts:285 — parse gated. **The only render toggle that defaults off** (D2): a large first-release parser, opt-in per client until proven. Flip in `loader.ts` to enable by default. |
| `environmentVariables` | object — see below | index.ts:251 (`.enabled`) |

**Business Rules have no toggle.** `parseBusinessRules` is called unconditionally at `index.ts:187` and no `components.businessRules` field exists in the schema. They are the only component with an *AI* toggle (`aiEnrichment.components.businessRules`) but no render toggle. Adding one means adding the schema field, the default, *and* the `if` at index.ts:187 — the field alone is a no-op.

#### `components.environmentVariables` (`EnvironmentVariablesConfig`, schema.ts:15)

| Field | Default | Notes |
|-------|---------|-------|
| `enabled` | `true` | (schema.ts:16 claims `false` — stale.) |
| `showDefaultValue` | `true` | Design-time value from the solution XML. Low risk. |
| `showCurrentValue` | **`true`** (loader.ts:59) | ⚠️ **Security-sensitive.** Current values are the *runtime* values pulled from the environment and can contain connection strings, endpoints and secrets. The default is unsafe: a client config that omits this key publishes current values to the wiki. `samples/doc-gen.config.sample.yml:99` explicitly sets `false` with a caution comment, so anyone who copies the sample is protected — anyone who hand-writes a config is not. |

> The `showCurrentValue: true` default contradicts its own intent and is the single riskiest default in the file — this package was already renamed once after a client-data exposure. Flipping the loader default to `false` is worth doing; it is a config default change, so it is within the agent's autonomy (see [process.md](process.md)) — but it changes behaviour for every existing client deployment that omits the key, so raise it as an issue rather than slipping it into an unrelated PR.

### `wiki` — optional, no defaults

`WikiConfig` (schema.ts:151). Absent from `CONFIG_DEFAULTS` entirely, so if the block is missing the run logs `No wiki config — skipping publish` (index.ts:373) and produces local output only. All fields are required when the block is present — none is optional or guarded.

| Field | Notes |
|-------|-------|
| `organisation` | ADO org, e.g. `CustomerName`. Used in the REST URL (wikiPublisher.ts:20). |
| `project` | ADO project (wikiPublisher.ts:21). |
| `wikiIdentifier` | e.g. `ProjectDeltaWiki.wiki` (wikiPublisher.ts:22). |
| `parentPath` | Root page path, e.g. `/WikiNode`. Every page path is built under it (wikiAssembler.ts:59). Accessed unguarded — omitting it throws. |
| `pat` | ⚠️ Personal Access Token, Wiki (Read & Write) scope. See [PAT handling](#pat-handling). |

### `erd` — optional, no defaults

`ErdConfig` (schema.ts:144). Passed to `generateERDiagram` by all three assemblers (`wikiAssembler.ts:75`, `docAssembler.ts:121`, `pdfAssembler.ts:91`).

| Field | Notes |
|-------|-------|
| `excludeEntities` | string[] of entity logical names to drop from the diagram entirely. |
| `excludeRelationships` | string[] of relationship schema names to drop (specific edges). |

Second tier of ERD filtering. The first tier is publisher-prefix + `parse.excludeStandardRelationships`; this block is for the residual noise those miss.

### `aiEnrichment` — optional

`AiEnrichmentConfig` (schema.ts:65). Defaults at loader.ts:66-77.

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `enabled` | boolean | `false` | Master switch. `false` → `enrichWithAiSummaries` returns immediately. |
| `provider` | `'anthropic' \| 'azure-openai'` | `'anthropic'` | |
| `anthropic` | object? | *(absent)* | Required when `provider: anthropic`. |
| `azureOpenAI` | object? | *(absent)* | Required when `provider: azure-openai`. |
| `components.flows` | boolean | `false` | |
| `components.classicWorkflows` | boolean | `false` | |
| `components.businessRules` | boolean | `false` | |
| `components.plugins` | boolean | `false` | |
| `components.webResources` | boolean | `false` | JavaScript resources only — filtered at aiSummariser.ts (`resourceType === 'JavaScript'`). |
| `cacheFile` | string? | *(unset)* | Advanced override — bypasses `cache.dir` for the AI cache specifically. Resolved relative to the config dir. Most users should use top-level `cache.dir` instead — see [Caches](#caches). |

All AI component toggles default `false` deliberately — they deliberately do not mirror `components` (schema.ts:74). Enrichment costs money; opt-in is per-component.

`anthropic` (schema.ts:30):

| Field | Default | Notes |
|-------|---------|-------|
| `apiKeyEnv` | *(required)* | **Name of the env var** holding the key — not the key itself. |
| `model` | `claude-haiku-4-5` (`DEFAULT_ANTHROPIC_MODEL`, schema.ts:37) | Fast/cheap, suited to batch summarisation. |

`azureOpenAI` (schema.ts:39):

| Field | Default | Notes |
|-------|---------|-------|
| `endpointEnv` | *(required)* | Name of the env var holding the endpoint URL. |
| `apiKeyEnv` | *(required unless `useManagedIdentity`)* | Name of the env var holding the key. |
| `useManagedIdentity` | `false` | Azure AD token provider instead of a key — zero secrets to rotate. Preferred for Azure-native clients. |
| `deployment` | *(required)* | Deployment name on the Azure OpenAI resource. |
| `apiVersion` | *(required)* | e.g. `2024-10-21`. |

**Fail-fast validation** (`validateAiEnrichmentConfig`, loader.ts:114-155) runs at load, before any parsing. It throws — with all errors listed at once — when `enabled: true` and:

- `provider` is neither `anthropic` nor `azure-openai`;
- the matching provider block is missing;
- `anthropic.apiKeyEnv` is missing;
- `azureOpenAI.endpointEnv` / `deployment` / `apiVersion` is missing;
- `azureOpenAI` has neither `apiKeyEnv` nor `useManagedIdentity: true`;
- **no component is opted in** — `enabled: true` with all `components` false is an error, not a silent no-op.

This is deliberate (comment at loader.ts:106-113): a broken AI block means the user opted in and got the shape wrong, so surfacing it before any work beats disabling enrichment silently mid-run. Runtime API failures are the opposite — skip-and-continue, recorded in `RunSummary.aiSummaryFailures`, falling back to a stale cached summary if one exists (aiSummariser.ts:298-303), and they do **not** fail the build.

---

## CLI flags

Parsed by hand off `process.argv.slice(2)` at `src/index.ts:73-86`. **`commander` is in `package.json` but imported nowhere** — do not assume flag parsing has been migrated.

| Flag | Effect |
|------|--------|
| `--word` | Word output |
| `--wiki` | Wiki publish |
| `--pdf` | PDF output. **Deprecated — planned removal** (Lewis, 2026-07-17), see [roadmap.md](roadmap.md#open-work-outside-the-phase-plan). |
| `--regenerate-ai` | Ignore cached AI summaries and regenerate every one. Does **not** affect output selection. |

### Precedence

`index.ts:107-114`. The three output flags share one rule:

> **If any of `--word` / `--wiki` / `--pdf` is passed, the passed set becomes the explicit output selection — every unlisted format is suppressed, even if enabled in config.**

```
--word              → Word only          (wiki AND pdf suppressed)
--wiki              → Wiki only          (word AND pdf suppressed)
--pdf               → PDF only           (word AND wiki suppressed)
--word --pdf        → Word + PDF         (any combination allowed)
(no output flags)   → config drives everything
```

Because `CONFIG_DEFAULTS` has `wiki: true, word: true`, a flagless run against a default config attempts **both** a wiki publish and a Word build.

`--wiki` with no `wiki` block in config warns and skips the publish (index.ts:111-113). `output.wiki: false` in config nulls `config.wiki` entirely (index.ts:117-119).

### Unknown-flag detection has a hole

index.ts:80: `argv.filter(a => a.startsWith('--') && !KNOWN_FLAGS.has(a))`. Only `--`-prefixed tokens are checked. `-word`, `word` or `—word` (em dash) pass silently, are ignored, and the run falls through to config — i.e. `npx powerautodocs -word` publishes to the wiki with no warning. The "typo protection" is real but partial.

---

## Environment variables

Exactly four are read anywhere in `src/` (verified by grepping `process.env`).

| Variable | Read at | Purpose |
|----------|---------|---------|
| `DOC_GEN_CONFIG_DIR` | `index.ts:91`, `index.ts:306` | Directory containing `doc-gen.config.yml`. Also the base for AI cache resolution. **Not** the base for `solutions[].path`. |
| `POWERAUTODOCS_CHROME_PATH` | `mermaidRenderer.ts:58` | Explicit browser executable for Mermaid→PNG. See below. |
| *(named by `aiEnrichment.anthropic.apiKeyEnv`)* | `AnthropicProvider.ts:17` | Anthropic API key. |
| *(named by `aiEnrichment.azureOpenAI.endpointEnv` / `.apiKeyEnv`)* | `AzureOpenAIProvider.ts:22, :52` | Azure OpenAI endpoint + key. |

**The provider secrets are indirect.** No env var name is hardcoded — grepping `src/` for `ANTHROPIC_API_KEY` returns only two comment mentions (`config/schema.ts:31`, `enrichment/providers/AnthropicProvider.ts:9`) and no code reference. The config names the variable; the code reads `process.env[thatName]`. `ANTHROPIC_API_KEY` / `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` are merely the sample's conventional choices. Do not hardcode them; the indirection is what keeps secrets out of `doc-gen.config.yml`.

**`WIKI_PAT` is not an environment variable to this process.** It is an ADO pipeline secret that gets `sed`-injected into the config file before the tool runs. Nothing in `src/` reads it.

### ADO injection

From `samples/powerautodocs.pipeline.sample.yml`:

- Node `24.x` (`NodeTool@0`), `ubuntu-latest` agent.
- Step 0 checks out with `persistCredentials: true` — needed so step 4 can push back to the repo.
- `doc-gen.config.yml` lives in a `PowerAutoDocs/` folder in the client repo. A `DOC_GEN_CONFIG_DIR` pipeline variable points there; step 3 maps it through to the process env, which is what `loadConfig` (and the cache resolution below) reads instead of `process.cwd()`. `solutions[].path` and `output.path` stay relative to the repo root (the command still runs from `$(Build.SourcesDirectory)`) — only the config file and its cache folder live under `PowerAutoDocs/`.
- `POWERAUTODOCS_VERSION` pipeline variable, defaulting to `latest`; the run is `npx powerautodocs@$(POWERAUTODOCS_VERSION)`. Set it in the ADO UI to pin a version.
- Step 2 injects the PAT: `sed -i "s/REDACTED/$(WIKI_PAT)/g" $(DOC_GEN_CONFIG_DIR)/doc-gen.config.yml`.
- Step 3 maps AI secrets through an explicit `env:` block. **ADO secret variables are not auto-exposed to script steps** — without the `env:` block the provider throws "environment variable X is not set".
- Step 4 commits the cache folder (`PowerAutoDocs/.powerautodocs-cache/`, `cache.dir`) back to the branch, so ADO's ephemeral agent doesn't start cold every run — see [Caches](#caches) below. Requires the ADO Build Service account to have Contribute permission on the repo; otherwise the push fails (the doc generation itself still succeeds).
- Step 5 publishes `output/solution-documentation.docx` as a pipeline artifact.

### PAT handling

- In the **client project repo**, `wiki.pat` is committed as the literal `REDACTED` and replaced at pipeline runtime from the `WIKI_PAT` secret.
- `index.ts:330` and `wikiPublisher.ts:166` both refuse to publish when the value is empty or still `REDACTED`, but by different mechanisms: `index.ts:330` records a `publishFailures` entry (exit 1 via the run summary), while `wikiPublisher.ts:166` **throws** — which escapes to the top-level `main().catch()` (index.ts:446) as a "Fatal error". In practice index.ts:330 guards first, so the wikiPublisher throw is a defence-in-depth backstop. wikiPublisher's check is also the stricter of the two (trims and upper-cases; index.ts matches `'REDACTED'` exactly).
- In **this repo**, `doc-gen.config.yml` is gitignored twice (`.gitignore:1`, `.gitignore:38 *doc-gen.config.yml`) and has never been committed. The tracked artifact is `samples/doc-gen.config.sample.yml:172`. The local working copy holds a real live PAT — never `cat`, echo, paste or attach it anywhere. Never `git add -f` it.

---

## Caches

Two caches, one folder, same idiom: hash the input, look for the hash, only do the expensive thing on a miss. Both key on **content**, never on mtime or filename.

`cache.dir` (`CacheConfig`, schema.ts) sets the shared folder, default `.powerautodocs-cache` (`DEFAULT_CACHE_DIR`, loader.ts), always resolved against **config dir** via `resolveCacheDir(config, configDir)` (loader.ts) — never `process.cwd()`, so both land in the same place regardless of what directory a command happens to run from.

| | AI summary cache | Diagram cache |
|---|---|---|
| Location | `<cache.dir>/.powerautodocs-ai-cache.json` — or `aiEnrichment.cacheFile` if set, an advanced override that bypasses `cache.dir` entirely | `<cache.dir>/diagrams/` (docAssembler.ts) |
| Key | `{type}:{uniqueName}`, e.g. `flows:My Flow Name` (aiSummariser.ts:54) | `<sha256(mermaidSource).slice(0,16)>.png` (mermaidRenderer.ts:96-98) |
| Entry | `{ hash, summary, generatedAt }` (aiSummariser.ts:44-51) | the PNG bytes |
| Hash input | `sha256("v{PROMPT_VERSION}:" + JSON.stringify(summarisableView))` (aiSummariser.ts:74-77) | `sha256(mermaid DSL)` only |
| Versioned | **yes** — `PROMPT_VERSION` (aiSummariser.ts:38, currently `2`) | **no** |
| Escape hatch | `--regenerate-ai` | delete the directory |

Before this was unified, the diagram cache was a hardcoded constant resolved against `process.cwd()` with no config representation at all, while the AI cache was independently configurable and config-dir-relative — the two landed in different places whenever cwd ≠ config dir. `resolveCacheDir` is the single resolution point both now go through.

### Persisting the cache in ADO

Ephemeral pipeline agents don't retain disk between runs — without extra work, the cache starts empty every single execution, meaning **every run pays full AI cost regardless of how little the solution changed**. `samples/powerautodocs.pipeline.sample.yml` addresses this with a commit-back step (step 4): after generation, it force-adds the whole cache folder, commits, and pushes to the run's branch. This is the **client repo's** copy of the pipeline, and client repos are not bound by this repo's own `.gitignore` — see PAT handling above and `.claude/CLAUDE.md`'s "never commit client data" rule, which is scoped to *this* repo, not the client's.

Consequence worth knowing: since the diagram cache is committed as binary PNGs, the client repo's history grows a binary diff on every run that changes any diagram. The two caches share one folder by design now (that's the whole point — one thing to commit, not two), so this is an all-or-nothing tradeoff: keep both, or drop the `git add -f` line from step 4 entirely and let the cache be purely local/best-effort (no cross-run persistence at all).

### What invalidates the AI cache

The *summarisable view* is the single source of truth for both the hash and the prompt payload (aiSummariser.ts:14-16, `flowView`/`classicWorkflowView`/etc. from :86). Consequences:

1. **Adding a field to a view invalidates every entry of that kind** and bills a full regeneration on the next client run. Views are deliberately small, stable projections — names, triggers, steps — with cosmetic fields (ids, offsets) excluded so the cache doesn't churn on noise. Keep it that way.
2. **Editing prompt wording without bumping `PROMPT_VERSION` leaves every entry a false hit.** The new prompt never runs and your change looks like a no-op. `PROMPT_VERSION` is folded into the hash specifically so bumping it is a deliberate global invalidation. Bump it whenever prompt wording or response format changes materially — `1 → 2` was the structured-JSON web-resource change.
3. Hit test is `!forceRegenerate && existing && existing.hash === hash` (aiSummariser.ts:282).
4. An unparseable cache file warns and starts empty (aiSummariser.ts:63-66) rather than failing the run.
5. **Pruning:** orphaned entries (renamed/removed components) are deleted per-run, but only within component kinds enabled *this run* — so toggling a component off doesn't wipe its cached summaries.

### What invalidates the diagram cache

Only the Mermaid source text. There is **no `PROMPT_VERSION` equivalent**: changing `SCALE_FACTOR` (mermaidRenderer.ts:34, currently `3`) or `renderMermaid`'s viewport/`backgroundColor` options invalidates **nothing**. Stale-resolution PNGs persist until you delete `<cache.dir>/diagrams/` by hand. If a render-settings change appears to have done nothing, this is why.

### Committed or not

The cache folder is **gitignored in this repo** (`.gitignore` — `.powerautodocs-cache/`) — the local copy contains real client component names, AI summaries and rendered client ERDs. The "commit the cache so re-runs are deterministic and diffable in PR review" decision applies to a **client project repo consuming powerautodocs**, not here. Never quote cache contents in an issue or PR body.

---

## Running locally

```bash
npm run dev        # tsx src/index.ts                 → dev.log
npm run dev:word   # tsx src/index.ts --word          → dev.log
npm run dev:wiki   # tsx src/index.ts --wiki          → dev.log
npm run dev:both   # tsx src/index.ts --word --wiki   → dev.log
npm run build      # tsc → dist/ ; postbuild adds the shebang + chmod +x
npm run typecheck  # tsc --noEmit -p tsconfig.test.json  (src/ + tests/)
npm test           # vitest run
npm run test:watch # vitest, watch mode
npm run docs       # cd docs-viewer && npm run build && npx serve dist
```

All four `dev*` scripts redirect stdout **and** stderr into `dev.log` (gitignored) — nothing appears on the terminal. Read `dev.log` for the run summary. `dev:word` / `dev:wiki` / `dev:both` are the fastest way to exercise one output path; there is no `dev:pdf` script — use `npx tsx src/index.ts --pdf`.

`doc-gen.config.yml` must be in cwd, or `DOC_GEN_CONFIG_DIR` must point at its directory. Remember that a missing config **warns and proceeds on defaults** rather than failing.

| Path | Contents | Tracked? |
|------|----------|----------|
| `output/` | markdown, `.docx`, `.pdf` | gitignored — real client docs |
| `unpacked/` | pac-unpacked client solutions | gitignored — real client data |
| `dev.log` | full run output | gitignored |
| `.powerautodocs-cache/` (`cache.dir`) | AI summaries + client component names, rendered ERD/flow PNGs | gitignored |
| `doc-gen.config.yml` | local config, **live PAT** | gitignored |
| `dist/` | build output | gitignored |

`npm test` (Vitest, 1134 tests) covers all 17 parsers, all 14 renderers, `MarkdownSerializer`, `DocxSerializer`, `wordTheme`, `erdGenerator`, `config/loader`, all four `publisher/*` modules, `logger`, `main()`, and the enrichment layer including the AI providers — see [roadmap.md](roadmap.md#open-work-outside-the-phase-plan). It does **not** touch `PdfSerializer`/`pdfAssembler` (deprecated, see the `output.pdf` row above) or a real-browser Mermaid launch — so no test exercises actual PDF byte output or a cold Puppeteer render. Passing tests are not a verified change. For what verification actually means here — including how to inspect the generated `.docx`/`.pdf` — see [process.md](process.md).

---

## The npm package

| | |
|---|---|
| Name | `powerautodocs` (renamed from `powerautodoc` after a client-data exposure) |
| Version | `1.5.0` (package.json:3) — goes stale; check the file |
| `bin` | `powerautodocs` → `dist/index.js` (package.json:6-8) |
| `files` | `dist` only |
| `type` | `module` |
| `engines.node` | `>=22`, and **tested**: `ci.yml` runs the whole gate on a `[22, 24]` matrix. 18 and 20 are both EOL. Publish, Pages and the sample ADO pipeline all use 24. |
| Shebang | injected post-build by `scripts/addShebang.mjs`, then `chmod +x` |
| `prepublishOnly` | runs `npm run build` |
| Tests in the tarball | none — tests live in `tests/` at the root, outside `tsconfig.json`'s `src/` scope, so `tsc` never emits them into `dist/` |

Consumed by clients as `npx powerautodocs@latest` — no local install.

**Publishing and version bumps are a hard stop.** The agent may branch, commit, push, open PRs and merge without asking, but must ask Lewis before any `npm publish` or `package.json` version bump, and before adding any new npm dependency. Release mechanics live in [process.md](process.md).

### Dependencies

Every one of the eight declared `dependencies` is imported and load-bearing: `@anthropic-ai/sdk`, `openai` (Azure provider), `@mermaid-js/mermaid-cli` + `puppeteer` (diagram render), `docx`, `pdfmake`, `fast-xml-parser`, `js-yaml`.

`commander`, `handlebars`, `zod`, `adm-zip` and `glob` were declared but unused, and were pruned on 2026-07-17 (13 → 8 declared prod deps; 13 packages out of the production tree). `adm-zip` moved to `devDependencies` — it unzips the `.docx` in the `DocxSerializer` tests. Config validation stays hand-rolled in `loader.ts`; CLI parsing stays hand-rolled in `index.ts:73-86`. See [decisions.md](decisions.md#dependencies-the-five-vestigial-ones-are-gone) for why those approaches are deliberate.

`pdfmake` and `@types/pdfmake` become removable if PDF output is deprecated as planned — see [roadmap.md](roadmap.md).

---

## `.puppeteerrc.cjs` and Chrome resolution

`@mermaid-js/mermaid-cli` depends on Puppeteer, which by default downloads its own ~250MB Chromium on every `npm install`. **ADO agents are fresh VMs on every run**, so that download would be paid every single run. `.puppeteerrc.cjs` therefore sets:

```js
module.exports = { skipDownload: true };
```

This is load-bearing. Do not delete it, and do not "fix" a launch failure with `npx puppeteer browsers install chrome` — that reimposes the exact cost the file exists to avoid.

Because there is no bundled Chromium, `mermaidRenderer.ts` **must** supply `executablePath` on every launch (mermaidRenderer.ts:80). Resolution order in `resolveChromeExecutable()` (mermaidRenderer.ts:57):

1. `POWERAUTODOCS_CHROME_PATH`, if set. **Throws if the path doesn't exist** (mermaidRenderer.ts:60-62) — an explicitly wrong override is fail-fast, never silently ignored.
2. First hit in the hardcoded 11-entry `CHROME_CANDIDATES` list (mermaidRenderer.ts:36-48): macOS Chrome/Edge, `/usr/bin/google-chrome{,-stable}`, `chromium{,-browser}`, `microsoft-edge`, and the Windows Chrome/Edge Program Files paths.
3. Otherwise throws with an actionable message.

Supporting a new platform means adding to `CHROME_CANDIDATES` — not adding a dependency.

Other details worth knowing:

- Launch args are `['--no-sandbox', '--disable-setuid-sandbox']` — required on ADO Linux agents.
- The browser is a lazily-created module-level singleton (`browserPromise`, mermaidRenderer.ts:75). `closeMermaidBrowser()` is called once at `docAssembler.ts:248`; without it the process hangs.
- Availability is probed **once up front** (path existence only, no launch) at `docAssembler.ts:99-105`, mirroring the fail-fast-before-work pattern.
- **Failure degrades silently.** When resolution throws, docAssembler catches, warns, and leaves `renderMermaid` undefined; the `.docx` is produced with every diagram missing and a **clean exit code**. On a machine without Chrome/Edge you will see a green run and a diagram-free document — that is the environment, not your change. Verify diagram work on a machine with a browser, or set `POWERAUTODOCS_CHROME_PATH`.
- Cache hits never launch the browser at all, so most runs never start Chrome.

---

## `samples/` — the client-facing contract

| File | What it is |
|------|------------|
| `samples/doc-gen.config.sample.yml` | The fully-annotated config clients copy into a `PowerAutoDocs/` folder in their repo. |
| `samples/powerautodocs.pipeline.sample.yml` | The ADO pipeline clients copy to `PowerAutoDocs/powerautodocs.yml`. |

These are what clients actually deploy. **Any schema change must be mirrored into `doc-gen.config.sample.yml`** or client deployments drift silently — mirroring it is part of the change, not a follow-up.

Two known inaccuracies in the sample worth fixing when you're next in there: line 79 claims "all components are always parsed" (they are not — the toggles gate parsing), and it does not document the `parse.excludedColumns` replace-not-extend behaviour.
