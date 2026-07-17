# Test fixtures

There are two layers here, on either side of the IR contract. Pick the one that matches what
you are testing — needing both in one test usually means the layers have leaked.

| | What it is | Who uses it |
|---|---|---|
| `solutions/ContosoDemo/` | Hand-authored solution XML on disk, shaped like `pac solution unpack` output | **Parser** tests — parsers take a path and read `fs` |
| `ir.ts` | Factory functions returning IR objects (`aFlow()`, `aTable()`, …), each taking a `Partial<>` override | **Renderer** tests — renderers consume IR, so they need no XML |
| `config.ts` | `aConfig()` — a full `DocGenConfig`, built by merging overrides onto the real `CONFIG_DEFAULTS` | Anything taking config |

The two invented companies are deliberate: `solutions/` describes **Contoso**, `ir.ts` describes
**Acme Widgets**, so it is obvious at a glance which side of the contract a test sits on.

Everything under `solutions/` is **synthetic**. It is hand-written to mimic the shape of
`pac solution unpack` output, and it describes a fictional company (Contoso) that has never
been a client.

## The rule

**Never build a fixture by copying from `unpacked/`, `unpackSolutions/`, `output/`, `dev.log`,
or either cache.** Those hold real client solution content and are gitignored for that reason —
copying any of it in here launders client data straight into git history, which is exactly the
failure that got the package renamed from `powerautodoc`. See `.claude/docs/constraints.md`.

Fixtures are committed, public, and permanent. Treat anything you put here as published.

## Adding one

Write the XML by hand from the parser's expectations and the Dataverse schema, not from a real
file. Invent the names — `Contoso`, `contoso_`, fictional tables and flows. Keep each fixture as
small as the test needs: a fixture is a statement about what the parser must handle, so an
unexplained field is a question nobody can answer later.

`ContosoDemo/` is the shared solution root. Add to it rather than starting a parallel tree unless
you specifically need a differently-shaped solution (a malformed one, say).

Because the root is shared, a fixture is not private to one test: adding an entity to
`Entities/` changes what `parseSolution` returns for every test that sweeps that folder. Prefer
adding a new component over editing an existing one, and if a test needs a count, derive it or
assert on a named item rather than a magic total that the next fixture will break.

## Adding an IR factory

Add it to `ir.ts` with defaults that describe the *ordinary* case, and let tests override the one
field they care about. A factory whose defaults are already an edge case makes every test that
uses it lie about what it is testing.
