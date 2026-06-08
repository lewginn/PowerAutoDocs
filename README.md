# PowerAutoDocs

Automated as-built documentation generator for Power Platform solutions.

Reads unpacked solution XML directly from Git and publishes structured, cross-linked documentation to an Azure DevOps Wiki and/or a Word document — automatically, on every deployment.

[![npm](https://img.shields.io/npm/v/powerautodocs)](https://www.npmjs.com/package/powerautodocs)
[![license](https://img.shields.io/npm/l/powerautodocs)](LICENSE)
[![node](https://img.shields.io/node/v/powerautodocs)](https://nodejs.org)

**[View architecture →](https://lewginn.github.io/PowerAutoDocs/)**

---

## What it documents

powerautodocs covers the full stack of a Dataverse/Power Platform solution:

| Component | Output |
| --- | --- |
| Tables & Columns | Schema, types, required flags, custom vs standard |
| Views | Filter conditions, linked entity joins, column lists |
| Forms | Tab/section/field breakdown, compact or detailed layout |
| Relationships | 1:N with direction, custom vs OOB, ER diagram |
| Power Automate Flows | Trigger, nested action tree with branch markers, Mermaid flowchart |
| Classic Workflows | XAML-based workflows with condition steps |
| Business Rules | If/else branches, show/hide/required/clear actions |
| Plugins | Assembly metadata, step registrations, entity/message/stage |
| Web Resources (JS) | Function index, JSDoc, namespace detection, optional AI-generated per-function summaries |
| Security Roles | Privilege matrix per entity (Create/Read/Write/Delete/Append/AppendTo) |
| Environment Variables | Type, default value, secret store |
| Connection References | Connector name, logical name |
| Global Choices | Option sets with values and labels |
| Email Templates | Subject, plain text body with field placeholders |
| Model-Driven Apps | Entity list, app settings, role mappings |

---

## How it works

powerautodocs uses a layered IR (Intermediate Representation) pipeline:

```
Unpacked Solution XML/JSON
        ↓
    Parsers (one per component type)
        ↓
    IR (typed TypeScript interfaces)
        ↓
    Enrichment (ERD, Mermaid diagrams, optional AI summaries)
        ↓
    Renderers (emit format-agnostic DocNode[])
        ↓
    MarkdownSerializer → ADO Wiki Publisher (REST API)
    DocxSerializer     → Word .docx file
    PdfSerializer      → PDF file
```

Parsers only produce IR. Renderers only consume IR. Neither knows about the other — swap or add output formats without touching the parsing logic.

---

## Quick Start

**1. Unpack your solution**
```bash
pac solution unpack --zipfile MySolution.zip --folder ./unpacked/MySolution
```

**2. Add a `doc-gen.config.yml`** to your repo root — copy [`samples/doc-gen.config.sample.yml`](samples/doc-gen.config.sample.yml) as a starting point

**3. Run**
```bash
npx powerautodocs@latest
```

Output is controlled by `output.wiki`, `output.word` and `output.pdf` in your config, or via CLI flags:

```bash
npx powerautodocs@latest --wiki                 # Wiki only
npx powerautodocs@latest --word                 # Word only
npx powerautodocs@latest --pdf                  # PDF only
npx powerautodocs@latest --wiki --word --pdf    # Any combination
npx powerautodocs@latest --regenerate-ai        # Force a full AI summary refresh, ignoring the cache
```

---

## Output modes

powerautodocs supports three output formats, configurable independently:

| Mode | Config flag | CLI flag | Output |
| --- | --- | --- | --- |
| ADO Wiki | `output.wiki: true` | `--wiki` | Pages published to Azure DevOps Wiki via REST API |
| Word document | `output.word: true` | `--word` | `.docx` file written to `output/` folder |
| PDF document | `output.pdf: true` | `--pdf` | `.pdf` file written to `output/` folder (local only — not published to ADO Wiki) |

CLI flags override the config file — passing any one of `--wiki` / `--word` / `--pdf` treats the
set you pass as the explicit output selection (unlisted formats are suppressed for that run, even
if enabled in config). If no flags are passed, the config drives everything.

Like the Word document, the PDF is a single self-contained file mirroring the wiki structure.
Mermaid diagrams (ERD, flow charts) are omitted from both Word and PDF output — they're rendered
in the ADO Wiki only.

---

## AI Enrichment (optional)

powerautodocs can generate short, plain-English AI summaries for the harder-to-skim parts of a
solution — Power Automate Flows, Classic Workflows, Business Rules, Plugin Assemblies, and JS Web
Resources — and inject them straight into the rendered documentation as a **Summary** section on
each component's page. JS Web Resources also get an AI-generated one-line description per
**function**, replacing the (almost always empty) JSDoc-derived "Description" column.

It's off by default and fully opt-in — your base documentation remains deterministic and identical
whether or not it's enabled.

**Key properties:**
- **Cache-first** — every component is reduced to a small, stable "summarisable view", SHA-256
  hashed, and checked against a committed JSON cache file (default `.powerautodocs-ai-cache.json`).
  Unchanged components reuse their cached summary — no API call, no cost, no non-deterministic
  output/diff churn between runs.
- **Opt-in per component type** — toggle each of the five supported types independently under
  `aiEnrichment.components`.
- **Pluggable provider** — choose `anthropic` (Claude) or `azure-openai`, configurable model/deployment.
- **Never stores secrets in config** — you provide the *name* of an environment variable
  (`apiKeyEnv` / `endpointEnv`); the actual key is supplied at runtime via your shell or pipeline
  secret variables (same pattern as `wiki.pat` / `WIKI_PAT`).
- **`--regenerate-ai`** CLI flag forces a full refresh, ignoring the cache.

### Enabling it

Add an `aiEnrichment` block to your `doc-gen.config.yml` (see
[`samples/doc-gen.config.sample.yml`](samples/doc-gen.config.sample.yml) for the fully-documented
version):

```yaml
aiEnrichment:
  enabled: true
  provider: anthropic
  cacheFile: .powerautodocs-ai-cache.json

  anthropic:
    apiKeyEnv: ANTHROPIC_API_KEY   # name of the env var holding your key — never the key itself
    model: claude-haiku-4-5        # optional — this is the default (fast/cheap)

  components:
    flows: true
    classicWorkflows: true
    businessRules: true
    plugins: true
    webResources: true
```

Then export the key locally before running:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx powerautodocs@latest
```

For Azure OpenAI, use the `azure-openai` provider block instead — it supports both API-key and
managed-identity authentication. See the sample config for the full field reference.

> The cache file is committed alongside `doc-gen.config.yml` in your *client project* repo so
> AI-written summaries are reviewed in pull requests before publication, the same as any other
> generated artefact. Re-runs only regenerate summaries for components that actually changed.

---

## ADO Pipeline

A ready-to-use pipeline is available at [`samples/powerautodocs.pipeline.sample.yml`](samples/powerautodocs.pipeline.sample.yml).

Copy it into your repo at `.azuredevops/powerautodocs.yml`, register it in ADO, and add the following pipeline variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `WIKI_PAT` | Yes (if using wiki output) | PAT with **Wiki (Read & Write)** scope — mark as secret |
| `POWERAUTODOCS_VERSION` | No | npm version tag to pin (default: `latest`) |
| `ANTHROPIC_API_KEY` | Only if `aiEnrichment.provider: anthropic` | Mark as secret — name must match `aiEnrichment.anthropic.apiKeyEnv` in your config |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` | Only if `aiEnrichment.provider: azure-openai` | Mark `AZURE_OPENAI_API_KEY` as secret — names must match `endpointEnv` / `apiKeyEnv` in your config |

The pipeline injects `WIKI_PAT` into `doc-gen.config.yml` at runtime via `sed`. The committed config file always contains `REDACTED` as the pat value — never commit a real token.

> **Secret variables aren't automatically exposed to script steps** — they must be explicitly
> mapped via an `env:` block on the step that runs `npx powerautodocs`, exactly like `WIKI_PAT` is
> mapped for the config-injection step. The sample pipeline already does this — see
> [`samples/powerautodocs.pipeline.sample.yml`](samples/powerautodocs.pipeline.sample.yml).

---

## Configuration

Copy [`samples/doc-gen.config.sample.yml`](samples/doc-gen.config.sample.yml) to your repo root, rename it to `doc-gen.config.yml`, and update the values. The sample file contains comments explaining every field.

A sample ADO pipeline is also available at [`samples/powerautodocs.pipeline.sample.yml`](samples/powerautodocs.pipeline.sample.yml).

A minimal config looks like this:

```yaml
solutions:
  - path: ./unpacked/MySolution
    publisherPrefix: myprefix
    displayName: My Solution

output:
  path: ./output
  wiki: true
  word: true
  wordFilename: solution-documentation.docx
  pdf: false
  pdfFilename: solution-documentation.pdf

wiki:
  organisation: MyOrg
  project: MyProject
  wikiIdentifier: MyProject.wiki
  parentPath: /My Solution
  pat: REDACTED   # inject at runtime — do not commit
```

### Multi-solution projects

List multiple solutions — powerautodocs merges them into a single wiki:

```yaml
solutions:
  - path: ./unpacked/CoreSolution
    publisherPrefix: myprefix
    displayName: Core

  - path: ./unpacked/PluginsSolution
    publisherPrefix: myprefix
    displayName: Plugins

  - path: ./unpacked/FlowsSolution
    publisherPrefix: myprefix
    displayName: Flows
```

### Non-root config location

If your config lives outside the repo root, pass its location via environment variable:

```yaml
- script: npx powerautodocs@latest
  env:
    DOC_GEN_CONFIG_DIR: $(Build.SourcesDirectory)/config
    WIKI_PAT: $(WIKI_PAT)
```

---

## Wiki output structure

```
📁 [Solution Name]
├── 🏠 Overview               ← component counts + solutions table
├── 📁 Data Model
│   ├── 📊 ER Diagram         ← auto-generated Mermaid erDiagram
│   └── 📋 [Table] × N
│       ├── Columns
│       ├── Views
│       ├── Forms
│       ├── Relationships
│       └── Business Rules
├── 📁 Automation
│   ├── 🔄 Flows              ← summary + per-flow pages with Mermaid diagrams
│   ├── ⚡ Classic Workflows
│   └── 🔌 Plugin Assemblies
├── 📁 Custom Code
│   └── 📜 Web Resources (JS)
├── 📁 Security
│   └── 🔐 Security Roles
├── 📁 Integrations
│   ├── 🌍 Environment Variables
│   └── 🔗 Connection References
├── 🎛️ Global Choices
├── 📧 Email Templates
└── 📱 Model-Driven Apps
```

---

## Requirements

- Node.js 18+
- Power Platform CLI (`pac`) — for unpacking solutions
- Azure DevOps Wiki — for wiki output (optional if using Word and/or PDF only)

---

## License

MIT — see [LICENSE](LICENSE)
