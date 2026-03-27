# PowerAutoDocs

Automated as-built documentation generator for Power Platform solutions.

Reads unpacked solution XML directly from Git and publishes structured, cross-linked documentation to an Azure DevOps Wiki — automatically, on every deployment.

[![npm](https://img.shields.io/npm/v/powerautodocs)](https://www.npmjs.com/package/powerautodocs)
[![license](https://img.shields.io/npm/l/powerautodocs)](LICENSE)
[![node](https://img.shields.io/node/v/powerautodocs)](https://nodejs.org)

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
| Environment Variables | Type, default value, current value, secret store |
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

**2. Add a `doc-gen.config.yml`** to your repo root (see [Configuration](#configuration))

**3. Run**
```bash
npx powerautodocs@latest
```

That's it. Documentation is published directly to your ADO Wiki.

---

## ADO Pipeline

Add this to your Azure DevOps pipeline YAML to auto-generate docs on every deployment:

```yaml
- task: NodeTool@0
  inputs:
    versionSpec: '20.x'
  displayName: 'Install Node.js'

- script: npx powerautodocs@latest
  displayName: 'Generate As-Built Documentation'
  env:
    WIKI_PAT: $(WIKI_PAT)
```

Set `WIKI_PAT` as a secret pipeline variable containing a PAT with **Wiki (Read & Write)** scope.

In your `doc-gen.config.yml`, set `wiki.pat: $(WIKI_PAT)` — the pipeline injects it at runtime. Never commit a real PAT.

---

## Configuration

Create a `doc-gen.config.yml` in your repo root:

```yaml
solutions:
  - path: ./unpacked/MySolution
    publisherPrefix: myprefix
    displayName: My Solution

output:
  path: ./output

parse:
  customColumnsOnly: false
  excludeBaseCurrencyFields: true
  excludeStandardRelationships: true
  excludedColumns:
    - timezoneruleversionnumber
    - utcconversiontimezonecode
    - importsequencenumber
    - overriddencreatedon
    - exchangerate
    - transactioncurrencyid
    - owningteam
    - owninguser
    - owningbusinessunit
    - createdonbehalfby
    - modifiedonbehalfby
    - versionnumber

render:
  formLayout: compact   # compact | detailed

components:
  tables: true
  forms: true
  views: true
  relationships: true
  flows: true
  classicWorkflows: true
  plugins: true
  webResources: true
  securityRoles: true
  environmentVariables:
    enabled: true
    showDefaultValue: true
    showCurrentValue: true
  globalChoices: true
  emailTemplates: true
  modelDrivenApps: true
  connectionReferences: true

# Optional — fine-tune the auto-generated ER diagram
# erd:
#   excludeEntities:
#     - myprefix_auditlog
#   excludeRelationships:
#     - myprefix_leaverequest_myprefix_leavetype

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
- Azure DevOps Wiki — for publishing

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
    Renderers (markdown string builders)
        ↓
    ADO Wiki Publisher (REST API)
```

Parsers only produce IR. Renderers only consume IR. Neither knows about the other — swap or add output formats without touching the parsing logic.

---

## License

MIT — see [LICENSE](LICENSE)