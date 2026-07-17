// tests/types/adm-zip.d.ts
//
// adm-zip ships no type declarations, and @types/adm-zip would be a new
// devDependency — a 🔴 under the dependency rule, which applies to devDeps too.
// The test suite uses exactly three members of the API, so declaring them here
// costs nothing, adds no supply-chain surface, and is better typed than the
// `any` a bare `declare module 'adm-zip'` would produce.
//
// This lives under tests/ and is only ever seen by tsconfig.test.json, so it
// cannot reach dist/ or the published tarball.
//
// If the suite ever needs more of adm-zip than this, that is the moment to ask
// about @types/adm-zip rather than to keep growing this file.

declare module 'adm-zip' {
  interface AdmZipEntry {
    entryName: string;
  }

  export default class AdmZip {
    constructor(buffer?: Buffer);
    /** Read a zip entry's contents as text, e.g. 'word/document.xml'. */
    readAsText(entryName: string): string;
    getEntries(): AdmZipEntry[];
  }
}
