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
| Web Resources (JS) | Function index, JSDoc, namespace detection |
| Security Roles | Privilege matrix per entity (Create/Read/Write/Delete/Append/AppendTo) |
| Environment Variables | Type, default value, secret store |
| Connection References | Connector name, logical name |
| Global Choices | Option sets with values and labels |
| Email Templates | Subject, plain text body with field placeholders |
| Model-Driven Apps | Entity list, app settings, role mappings |

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

Output is controlled by `output.wiki` and `output.word` in your config, or via CLI flags:

```bash
npx powerautodocs@latest --wiki        # Wiki only
npx powerautodocs@latest --word        # Word only
npx powerautodocs@latest --wiki --word # Both
```

---

## Output modes

powerautodocs supports two output formats, configurable independently:

| Mode | Config flag | CLI flag | Output |
| --- | --- | --- | --- |
| ADO Wiki | `output.wiki: true` | `--wiki` | Pages published to Azure DevOps Wiki via REST API |
| Word document | `output.word: true` | `--word` | `.docx` file written to `output/` folder |

CLI flags override the config file. If no flags are passed, the config drives everything.

---

## ADO Pipeline

A ready-to-use pipeline is available at [`samples/powerautodocs.pipeline.sample.yml`](samples/powerautodocs.pipeline.sample.yml).

Copy it into your repo at `.azuredevops/powerautodocs.yml`, register it in ADO, and add the following pipeline variables:

| Variable | Required | Notes |
| --- | --- | --- |
| `WIKI_PAT` | Yes (if using wiki output) | PAT with **Wiki (Read & Write)** scope — mark as secret |
| `POWERAUTODOCS_VERSION` | No | npm version tag to pin (default: `latest`) |

The pipeline injects `WIKI_PAT` into `doc-gen.config.yml` at runtime via `sed`. The committed config file always contains `REDACTED` as the pat value — never commit a real token.

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
- Azure DevOps Wiki — for wiki output (optional if using Word only)

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
    Enrichment (ERD, Mermaid diagrams)
        ↓
    Renderers (emit format-agnostic DocNode[])
        ↓
    MarkdownSerializer → ADO Wiki Publisher (REST API)
    DocxSerializer     → Word .docx file
```

Parsers only produce IR. Renderers only consume IR. Neither knows about the other — swap or add output formats without touching the parsing logic.

---

## License

MIT — see [LICENSE](LICENSE)
