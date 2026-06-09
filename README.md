# PowerAutoDocs

Automated as-built documentation generator for Power Platform solutions.

Reads unpacked solution XML directly from Git and publishes structured, cross-linked documentation to an Azure DevOps Wiki, a Word document, and/or a PDF — run locally or via an Azure DevOps pipeline.

[![npm](https://img.shields.io/npm/v/powerautodocs)](https://www.npmjs.com/package/powerautodocs)
[![license](https://img.shields.io/npm/l/powerautodocs)](LICENSE)
[![node](https://img.shields.io/node/v/powerautodocs)](https://nodejs.org)

**[View architecture →](https://lewginn.github.io/PowerAutoDocs/)** · **[Documentation wiki →](https://github.com/lewginn/PowerAutoDocs/wiki)**

---

## What it documents

Covers the full stack of a Dataverse / Power Platform solution:

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
| Web Resources (JS) | Function index, JSDoc, namespace detection, AI-generated per-function summaries |
| Security Roles | Privilege matrix per entity (Create/Read/Write/Delete/Append/AppendTo) |
| Environment Variables | Type, default value, secret store |
| Connection References | Connector name, logical name |
| Global Choices | Option sets with values and labels |
| Email Templates | Subject, plain text body with field placeholders |
| Model-Driven Apps | Entity list, app settings, role mappings |

## Output formats

Three formats, configurable independently:

| Format | Description |
| --- | --- |
| **ADO Wiki** | Structured, cross-linked pages published to Azure DevOps Wiki via REST API. Includes Mermaid ER diagrams and per-flow flowcharts. |
| **Word (.docx)** | Single self-contained document mirroring the wiki structure. A4, proportional column tables, auto-populated TOC. |
| **PDF** | Same structure as Word, generated via pdfmake with no bundled font files. Local output only — not published to ADO Wiki. |

Mermaid diagrams are ADO Wiki only — omitted from Word and PDF.

### Wiki structure

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

## AI Enrichment (optional)

Generates short, plain-English summaries for the harder-to-skim parts of a solution — Power Automate Flows, Classic Workflows, Business Rules, Plugin Assemblies, and JS Web Resources — injected as a **Summary** section on each component's page. JS Web Resources also get a per-function one-liner replacing the almost always empty JSDoc "Description" column.

Off by default. Base documentation is fully deterministic whether or not it is enabled.

- **Cache-first** — summaries are hashed and stored in a committed cache file. Unchanged components reuse their cached summary with no API call and no cost.
- **Pluggable provider** — Anthropic (Claude) or Azure OpenAI, including managed identity.
- **Opt-in per component type** — enable only the components you want summarised.

## How it works

```
Unpacked Solution XML / JSON
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

Parsers only produce IR. Renderers only consume IR. Neither knows about the other — swap or add output formats without touching parsing logic.

---

## Quick start

```bash
# 1. Unpack your solution
pac solution unpack --zipfile MySolution.zip --folder ./unpacked/MySolution

# 2. Add a doc-gen.config.yml to your repo root (copy from samples/)

# 3. Run
npx powerautodocs@latest
```

PowerAutoDocs can be run locally or triggered automatically via an Azure DevOps pipeline. For full setup instructions see the **[documentation wiki](https://github.com/lewginn/PowerAutoDocs/wiki)**:

- [Running Locally](https://github.com/lewginn/PowerAutoDocs/wiki/Running-Locally)
- [Running via ADO Pipeline](https://github.com/lewginn/PowerAutoDocs/wiki/Running-via-ADO-Pipeline)
- [Configuration](https://github.com/lewginn/PowerAutoDocs/wiki/doc-gen.config.yml)

---

## Requirements

- Node.js 18+
- Power Platform CLI (`pac`) for unpacking solutions
- Azure DevOps Wiki for wiki output (optional if using Word/PDF only)

## License

MIT — see [LICENSE](LICENSE)
