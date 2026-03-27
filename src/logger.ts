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

  const hasErrors = summary.solutionsSkipped.length > 0 || summary.publishFailures.length > 0;
  const hasWarnings = summary.parseWarnings.length > 0;

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
}

export function createSummary(): RunSummary {
  return {
    solutionsProcessed: 0,
    solutionsSkipped: [],
    parseWarnings: [],
    pagesPublished: 0,
    publishFailures: [],
  };
}