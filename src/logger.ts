/**
 * Simple structured logger for PowerAutoDoc run output.
 * Keeps all console output consistent and easy to read in ADO pipeline logs.
 */

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'skip';

const SYMBOLS: Record<LogLevel, string> = {
  info:    '  →',
  success: '  ✓',
  warn:    '  ⚠',
  error:   '  ✗',
  skip:    '  ↷',
};

export function log(level: LogLevel, message: string): void {
  const symbol = SYMBOLS[level];
  if (level === 'error') {
    console.error(`${symbol} ${message}`);
  } else if (level === 'warn') {
    console.warn(`${symbol} ${message}`);
  } else {
    console.log(`${symbol} ${message}`);
  }
}

export function logHeader(message: string): void {
  console.log(`\n${message}`);
  console.log('─'.repeat(Math.min(message.length, 60)));
}

export function logSummary(summary: RunSummary): void {
  console.log('\n════════════════════════════════════════');
  console.log('  PowerAutoDoc — Run Summary');
  console.log('════════════════════════════════════════');

  console.log(`  Solutions processed : ${summary.solutionsProcessed}`);
  if (summary.solutionsSkipped.length > 0) {
    console.log(`  Solutions skipped   : ${summary.solutionsSkipped.length}`);
    for (const s of summary.solutionsSkipped) {
      console.log(`    ✗ ${s.name} — ${s.reason}`);
    }
  }

  if (summary.parseWarnings.length > 0) {
    console.log(`\n  Parse warnings (${summary.parseWarnings.length}):`);
    for (const w of summary.parseWarnings) {
      console.log(`    ⚠ [${w.solution}] ${w.component} — ${w.reason}`);
    }
  }

  if (summary.pagesPublished > 0) {
    console.log(`\n  Wiki pages published: ${summary.pagesPublished}`);
  }

  if (summary.publishFailures.length > 0) {
    console.log(`  Publish failures    : ${summary.publishFailures.length}`);
    for (const f of summary.publishFailures) {
      console.log(`    ✗ ${f.path} — ${f.reason}`);
    }
  }

  if (summary.aiSummariesGenerated > 0 || summary.aiSummariesCached > 0 || summary.aiSummaryFailures.length > 0) {
    console.log(`\n  AI summaries generated: ${summary.aiSummariesGenerated}`);
    console.log(`  AI summaries cached   : ${summary.aiSummariesCached}`);
    if (summary.aiSummaryFailures.length > 0) {
      console.log(`  AI summary failures   : ${summary.aiSummaryFailures.length}`);
      for (const f of summary.aiSummaryFailures) {
        console.log(`    ✗ [${f.component}] ${f.name} — ${f.reason}`);
      }
    }
  }

  const hasErrors = summary.solutionsSkipped.length > 0 || summary.publishFailures.length > 0;

  // AI summary failures grade as warnings. They used to count for nothing here,
  // so a run in which every single AI summary failed printed '✓ Completed
  // successfully' and exited 0 — the failures were listed in the block above and
  // contradicted by the status line four lines later.
  //
  // Warnings deliberately do NOT drive index.ts's exit code: a missing AI
  // summary is a degraded document, not a failed run, and failing the client's
  // pipeline over a flaky model call would be worse than the gap it reports.
  const hasWarnings = summary.parseWarnings.length > 0 || summary.aiSummaryFailures.length > 0;

  console.log('\n  Status: ' + (
    hasErrors ? '✗ Completed with errors' :
    hasWarnings ? '⚠ Completed with warnings' :
    '✓ Completed successfully'
  ));
  console.log('════════════════════════════════════════\n');
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunSummary {
  solutionsProcessed: number;
  solutionsSkipped: { name: string; reason: string }[];
  parseWarnings: { solution: string; component: string; reason: string }[];
  pagesPublished: number;
  publishFailures: { path: string; reason: string }[];
  aiSummariesGenerated: number;
  aiSummariesCached: number;
  aiSummaryFailures: { component: string; name: string; reason: string }[];
}

export function createSummary(): RunSummary {
  return {
    solutionsProcessed: 0,
    solutionsSkipped: [],
    parseWarnings: [],
    pagesPublished: 0,
    publishFailures: [],
    aiSummariesGenerated: 0,
    aiSummariesCached: 0,
    aiSummaryFailures: [],
  };
}