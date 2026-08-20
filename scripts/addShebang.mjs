import { chmodSync, readFileSync, writeFileSync } from 'fs';
const f = 'dist/index.js';
const c = readFileSync(f, 'utf8');
if (!c.startsWith('#!')) writeFileSync(f, '#!/usr/bin/env node\n' + c);

// The executable bit used to be a '&& chmod +x dist/index.js' tacked onto the
// postbuild npm script. cmd.exe — npm's default shell on Windows — has no chmod,
// so 'npm run build' failed there after dist/ was already correct and complete.
// Doing it here keeps one cross-platform step: node's chmod is a documented no-op
// on Windows, and still sets the bit the published POSIX bin needs.
chmodSync(f, 0o755);
