# Test fixtures

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
