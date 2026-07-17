# CLAUDE.md — PowerAutoDocs

**This file is an orchestrator, not a manual.** It carries only what must be true in every
session: what this project is, the rules that are expensive to break, and where everything
else lives. The detail sits in `.claude/docs/` — read the page that matches your task
*before* touching code rather than guessing from memory.

---

## What this is

`powerautodocs` — an npm package and Azure DevOps pipeline tool that turns unpacked Power
Platform solution XML into structured, cross-linked documentation: published to an ADO Wiki,
and/or emitted as a Word `.docx` and a PDF.

It is a **batch documentation pipeline**. Not a chatbot, not interactive. Clients run it from
an ADO pipeline via `npx powerautodocs@<pinned version>`.

- GitHub `lewginn/PowerAutoDocs` · npm `powerautodocs`
- Six layers: **Input → Parsers → IR → Enrichment → Output → Pipeline**

---

## Ask Lewis first — only these two

Everything else, proceed without asking: branch, commit, push, open PRs, merge to `main`,
change the config schema, refactor, update docs. See [process.md](docs/process.md) for the
full autonomy boundary.

1. **`npm publish`, or any `package.json` version bump.**
   Releases are Lewis's call. GitHub Actions publishes automatically on a GitHub Release
   (`.github/workflows/npm-publish.yml`). Never publish by hand, never bump the version
   speculatively.

2. **Adding any new npm dependency.**
   Every client pays its install weight on an ephemeral ADO agent, on every single run,
   forever — nothing is cached between runs. A dependency is a permanent recurring cost,
   not a one-off. Propose it with that cost stated, and wait.

---

## Never — no exceptions

- **Never commit client data.** `output/`, `unpacked/`, `dev.log`, `doc-gen.config.yml`,
  `.powerautodocs-ai-cache.json` and `.powerautodocs-diagram-cache/` all hold real client
  solution content. They are gitignored — keep it that way. Never paste their contents into
  a commit, PR, issue, or any external service. The package was renamed from `powerautodoc`
  after an accidental client data exposure; that is why this rule is absolute rather than
  a preference.

- **Never break the IR contract.** Parsers only *produce* IR; renderers only *consume* it;
  neither knows the other exists. Field names on built IR types are a public contract —
  additive only. No renames or removals without checking every renderer usage first.

- **Never emit format strings from a renderer.** Renderers return `DocNode[]`. Markdown,
  docx and PDF syntax belong to the serializer that owns that format — including fences,
  wrappers and escaping. (A double-fenced ERD bug came from breaking exactly this.)

Full list, each with its reason: [constraints.md](docs/constraints.md).

---

## Where things live

| If you are… | Read |
|---|---|
| Starting, verifying, committing, reviewing or shipping **any** change — or wondering whether you can proceed without asking | [docs/process.md](docs/process.md) |
| About to break a rule, or unsure what's sacred | [docs/constraints.md](docs/constraints.md) |
| Adding a **parser**, **AI provider**, **output format/serializer**, or **DocNode type** — need the exact files, in order | [docs/playbooks.md](docs/playbooks.md) |
| Working out where code goes, how data flows, or how renderers and serializers divide up | [docs/architecture.md](docs/architecture.md) |
| Asking "is this already built?" or "what does this touch?" | [docs/components.md](docs/components.md) |
| Looking up a config field, CLI flag, env var, cache behaviour, or how to run locally | [docs/config-and-cli.md](docs/config-and-cli.md) |
| About to contradict an existing design choice, or asking "why is it like this?" | [docs/decisions.md](docs/decisions.md) |
| Asking what's shipped vs planned, or which issue tracks this work | [docs/roadmap.md](docs/roadmap.md) |

Also: `docs/architecture.jsx` is the **user-facing** interactive architecture doc (published
via GitHub Pages) — distinct from `.claude/docs/`, and it must be updated when a feature
lands. See [process.md](docs/process.md).

---

## Every session

1. `git status && git log --oneline -10` to orient.
2. Skim [constraints.md](docs/constraints.md) — it is short by design.
3. Read the doc matching your task from the table above **before** writing code.
4. Read any file you are about to modify, in full, first.
5. Branch before you work — never commit to `main` mid-feature.

---

## Keeping these docs honest

**The code is the source of truth. If a doc contradicts the code, the code wins** — fix the
doc in the same PR rather than leaving a known-stale line behind.

These pages carry `file:line` pointers so you can re-verify rather than trust. They were
verified against source when written, but line numbers drift and status tables rot. Treat a
citation as a signpost, not a guarantee: if a pointer misses, find the real thing and correct
the doc. The previous single 512-line CLAUDE.md accumulated 33 verified-false claims by
being edited without ever being re-checked — that failure mode is what this structure exists
to prevent.
