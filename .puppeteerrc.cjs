// mermaid-cli depends on puppeteer, which by default downloads its own
// ~250MB Chromium on every `npm install`. ADO pipeline agents are
// ephemeral (fresh VM per run), so that cost would be paid on every run.
// skipDownload here is puppeteer's own documented opt-out; we render
// diagrams against the agent's preinstalled Chrome/Edge instead —
// see src/enrichment/mermaidRenderer.ts for how the executable is located.
module.exports = {
  skipDownload: true,
};
