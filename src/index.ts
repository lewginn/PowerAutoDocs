import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './config/index.js';
import {
  parseSolution, parseSolutionManifest,
  parseAllFlows, parseClassicWorkflows, parseBusinessRules,
  parseAllPlugins, parseAllWebResources,
  parseSecurityRoles, parseEnvironmentVariables, parseConnectionReferences,
  parseGlobalChoices, parseEmailTemplates, parseModelDrivenApps
} from './parsers/index.js';
import {
  writeTableMarkdown, writeOverviewMarkdown,
  writeFlowMarkdown, writePluginMarkdown, writeWebResourceMarkdown
} from './renderers/index.js';
import type {
  SolutionModel, FlowModel, ClassicWorkflowModel, BusinessRuleModel,
  PluginAssemblyModel, WebResourceModel,
  SecurityRoleModel, EnvironmentVariableModel, ConnectionReferenceModel,
  GlobalChoiceModel, EmailTemplateModel, ModelDrivenAppModel,
} from './ir/index.js';
import { publishToWiki } from './publisher/wikiPublisher.js';
import { buildWikiPages } from './publisher/wikiAssembler.js';
import { buildWordDocument } from './publisher/docAssembler.js';
import { log, logHeader, logSummary, createSummary } from './logger.js';
import type { RunSummary } from './logger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wraps a parser call in a try/catch.
 * On failure: logs a warning, records it in the summary, returns the fallback value.
 */
function tryParse<T>(
  component: string,
  solutionName: string,
  fallback: T,
  summary: RunSummary,
  fn: () => T
): T {
  try {
    return fn();
  } catch (err: any) {
    const reason = err?.message ?? String(err);
    log('warn', `${component} parser failed — ${reason}`);
    summary.parseWarnings.push({ solution: solutionName, component, reason });
    return fallback;
  }
}

/**
 * Validates a solution folder exists and has the expected structure.
 * Returns an actionable error message or null if valid.
 */
function validateSolutionPath(unpackedPath: string): string | null {
  if (!fs.existsSync(unpackedPath)) {
    return `Folder not found: ${unpackedPath}\n    → Has the solution been unpacked? Run: pac solution unpack --zipfile MySolution.zip --folder ${unpackedPath}`;
  }
  const solutionXml = path.join(unpackedPath, 'Other', 'Solution.xml');
  if (!fs.existsSync(solutionXml)) {
    return `No Other/Solution.xml found in: ${unpackedPath}\n    → This doesn't look like a pac-unpacked solution folder`;
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function main(configDir?: string): Promise<void> {
  const summary = createSummary();

  // ---- CLI flags (override config) ----
  const argv     = process.argv.slice(2);
  const flagWord = argv.includes('--word');
  const flagWiki = argv.includes('--wiki');

  const KNOWN_FLAGS = new Set(['--word', '--wiki']);
  const unknownFlags = argv.filter(a => a.startsWith('--') && !KNOWN_FLAGS.has(a));
  if (unknownFlags.length > 0) {
    console.error(`✗ Unknown flag(s): ${unknownFlags.join(', ')}`);
    console.error('  Valid flags: --word  --wiki');
    console.error('  Or set output.wiki / output.word in doc-gen.config.yml instead.');
    process.exit(1);
  }

  // ---- Load config ----
  let config;
  try {
    config = loadConfig(configDir ?? process.env.DOC_GEN_CONFIG_DIR ?? process.cwd());
  } catch (err: any) {
    console.error(`✗ Failed to load config: ${err.message}`);
    console.error('  → Is doc-gen.config.yml present in the current directory?');
    console.error('  → Or set DOC_GEN_CONFIG_DIR to its location.');
    process.exit(1);
  }

  // Apply CLI flag overrides (local dev convenience — pipeline uses config only).
  // If either flag is passed, treat them as the explicit output selection:
  //   --word        → Word only, suppress wiki even if config.wiki is set
  //   --wiki        → Wiki only, suppress Word even if config has output.word: true
  //   --word --wiki → both
  //   (no flags)    → fall through to whatever the config says
  if (flagWord || flagWiki) {
    config.output.word = flagWord;
    config.output.wiki = flagWiki;
    if (flagWiki && !config.wiki) {
      log('warn', '--wiki flag set but no wiki config in doc-gen.config.yml — skipping wiki publish');
    }
  }

  // Suppress wiki publish if output.wiki is explicitly false
  if (config.output.wiki === false) {
    config.wiki = undefined;
  }

  const { path: outputPath } = config.output;

  let mergedSolution: SolutionModel | null = null;
  const allSolutions: SolutionModel[] = [];
  const allFlows: FlowModel[] = [];
  const allClassicWorkflows: ClassicWorkflowModel[] = [];
  const allBusinessRules: BusinessRuleModel[] = [];
  const allPluginAssemblies: PluginAssemblyModel[] = [];
  const allWebResources: WebResourceModel[] = [];
  const allSecurityRoles: SecurityRoleModel[] = [];
  const allEnvVars: EnvironmentVariableModel[] = [];
  const allGlobalChoices: GlobalChoiceModel[] = [];
  const allEmailTemplates: EmailTemplateModel[] = [];
  const allModelDrivenApps: ModelDrivenAppModel[] = [];
  const allConnectionReferences: ConnectionReferenceModel[] = [];

  // ---- Process each solution ----
  for (const solutionEntry of config.solutions) {
    const { path: unpackedPath, publisherPrefix } = solutionEntry;
    const solutionLabel = solutionEntry.displayName ?? unpackedPath;

    logHeader(`Processing: ${solutionLabel}`);

    // Validate folder before attempting any parse
    const pathError = validateSolutionPath(unpackedPath);
    if (pathError) {
      log('error', pathError);
      summary.solutionsSkipped.push({ name: solutionLabel, reason: pathError.split('\n')[0] });
      continue;
    }

    // Wrap entire solution in try/catch — skip and continue on unexpected failure
    try {
      const solConfig = { ...config, solution: { unpackedPath, publisherPrefix } };

      // Manifest — if this fails the solution is unreadable, skip it
      const manifest = tryParse('Manifest', solutionLabel, null, summary, () =>
        parseSolutionManifest(unpackedPath)
      );
      if (!manifest) {
        summary.solutionsSkipped.push({ name: solutionLabel, reason: 'Manifest parse failed' });
        continue;
      }

      // ---- Data model ----
      const tables = tryParse('Tables', solutionLabel, [], summary, () =>
        parseSolution(unpackedPath, solConfig, publisherPrefix)
      );
      manifest.tables = tables;
      log('success', `Tables: ${tables.length} entities`);

      if (!mergedSolution) {
        mergedSolution = manifest;
      } else {
        mergedSolution.tables = [...mergedSolution.tables, ...tables];
      }

      writeOverviewMarkdown(manifest, outputPath);
      if (config.components.tables) {
        for (const table of tables) {
          writeTableMarkdown(table, `${outputPath}/tables`, solConfig);
        }
      }
      allSolutions.push(manifest);

      // ---- Business Rules ----
      const rules = tryParse('Business Rules', solutionLabel, [], summary, () =>
        parseBusinessRules(unpackedPath)
      );
      allBusinessRules.push(...rules);
      if (rules.length > 0) log('success', `Business Rules: ${rules.length}`);

      // ---- Modern Flows ----
      if (config.components.flows) {
        const flows = tryParse('Flows', solutionLabel, [], summary, () =>
          parseAllFlows(unpackedPath)
        );
        allFlows.push(...flows);
        writeFlowMarkdown(flows, outputPath);
        log('success', `Flows: ${flows.length}`);
      }

      // ---- Classic Workflows ----
      if (config.components.classicWorkflows) {
        const classicWfs = tryParse('Classic Workflows', solutionLabel, [], summary, () =>
          parseClassicWorkflows(unpackedPath)
        );
        allClassicWorkflows.push(...classicWfs);
        if (classicWfs.length > 0) log('success', `Classic Workflows: ${classicWfs.length}`);
      }

      // ---- Plugins ----
      if (config.components.plugins) {
        const assemblies = tryParse('Plugins', solutionLabel, [], summary, () =>
          parseAllPlugins(unpackedPath)
        );
        allPluginAssemblies.push(...assemblies);
        writePluginMarkdown(assemblies, outputPath);
        if (assemblies.length > 0) log('success', `Plugin Assemblies: ${assemblies.length}`);
      }

      // ---- Web Resources ----
      if (config.components.webResources) {
        const webResources = tryParse('Web Resources', solutionLabel, [], summary, () =>
          parseAllWebResources(unpackedPath)
        );
        allWebResources.push(...webResources);
        writeWebResourceMarkdown(webResources, outputPath);
        if (webResources.length > 0) log('success', `Web Resources: ${webResources.length}`);
      }

      // ---- Security Roles ----
      if (config.components.securityRoles) {
        const roles = tryParse('Security Roles', solutionLabel, [], summary, () =>
          parseSecurityRoles(unpackedPath, publisherPrefix)
        );
        allSecurityRoles.push(...roles);
        if (roles.length > 0) log('success', `Security Roles: ${roles.length}`);
      }

      // ---- Global Choices ----
      if (config.components.globalChoices) {
        const choices = tryParse('Global Choices', solutionLabel, [], summary, () =>
          parseGlobalChoices(unpackedPath, publisherPrefix)
        );
        allGlobalChoices.push(...choices);
        if (choices.length > 0) log('success', `Global Choices: ${choices.length}`);
      }

      // ---- Environment Variables ----
      if (config.components.environmentVariables.enabled) {
        const envVars = tryParse('Environment Variables', solutionLabel, [], summary, () =>
          parseEnvironmentVariables(unpackedPath)
        );
        allEnvVars.push(...envVars);
        if (envVars.length > 0) log('success', `Environment Variables: ${envVars.length}`);
      }

      // ---- Connection References ----
      if (config.components.connectionReferences) {
        const refs = tryParse('Connection References', solutionLabel, [], summary, () =>
          parseConnectionReferences(unpackedPath)
        );
        allConnectionReferences.push(...refs);
        if (refs.length > 0) log('success', `Connection References: ${refs.length}`);
      }

      // ---- Email Templates ----
      if (config.components.emailTemplates) {
        const emailTemplates = tryParse('Email Templates', solutionLabel, [], summary, () =>
          parseEmailTemplates(unpackedPath)
        );
        allEmailTemplates.push(...emailTemplates);
        if (emailTemplates.length > 0) log('success', `Email Templates: ${emailTemplates.length}`);
      }

      // ---- Model-Driven Apps ----
      if (config.components.modelDrivenApps) {
        const apps = tryParse('Model-Driven Apps', solutionLabel, [], summary, () =>
          parseModelDrivenApps(unpackedPath, publisherPrefix)
        );
        allModelDrivenApps.push(...apps);
        if (apps.length > 0) log('success', `Model-Driven Apps: ${apps.length}`);
      }

      summary.solutionsProcessed++;

    } catch (err: any) {
      const reason = err?.message ?? String(err);
      log('error', `Unexpected failure — ${reason}`);
      summary.solutionsSkipped.push({ name: solutionLabel, reason });
    }
  }

  // ---- Wiki publish ----
  if (config.wiki && mergedSolution) {
    if (allSolutions.length === 0) {
      log('warn', 'No solutions were processed successfully — skipping wiki publish');
    } else {
      logHeader('Publishing to ADO Wiki');

      if (!config.wiki.pat || config.wiki.pat === 'REDACTED') {
        log('error', 'wiki.pat is not set — cannot publish');
        log('info', 'Inject the PAT at runtime via your pipeline secret variable');
        summary.publishFailures.push({ path: '(all pages)', reason: 'PAT not configured' });
      } else {
        const pages = buildWikiPages(
          config,
          allSolutions,
          mergedSolution,
          allFlows,
          allPluginAssemblies,
          allWebResources,
          allClassicWorkflows,
          allBusinessRules,
          allSecurityRoles,
          allEnvVars,
          allConnectionReferences,
          allGlobalChoices,
          allEmailTemplates,
          allModelDrivenApps,
        );

        log('info', `Built ${pages.length} wiki pages — publishing...`);

        const results = await publishToWiki(config.wiki, pages);

        // Collect results — publishToWiki may return void; handle both cases
        if (Array.isArray(results)) {
          for (const r of results) {
            if (r.success) {
              summary.pagesPublished++;
            } else {
              summary.publishFailures.push({ path: r.path, reason: r.reason ?? 'Unknown error' });
              log('warn', `Failed to publish: ${r.path} — ${r.reason}`);
            }
          }
        } else {
          // publishToWiki doesn't return results yet — count all as published
          summary.pagesPublished = pages.length;
          log('success', `Published ${pages.length} pages`);
        }
      }
    }
  } else if (!config.wiki) {
    log('info', 'No wiki config — skipping publish (local output only)');
  }

  // ---- Word document ----
  if (config.output.word && mergedSolution) {
    logHeader('Generating Word document');
    const wordFilename = config.output.wordFilename ?? 'solution-documentation.docx';
    const wordOutputPath = path.join(config.output.path, wordFilename);
    try {
      await buildWordDocument(
        config,
        allSolutions,
        mergedSolution,
        allFlows,
        allPluginAssemblies,
        allWebResources,
        allClassicWorkflows,
        allBusinessRules,
        allSecurityRoles,
        allEnvVars,
        allConnectionReferences,
        allGlobalChoices,
        allEmailTemplates,
        allModelDrivenApps,
        wordOutputPath,
      );
      log('success', `Word document written: ${wordOutputPath}`);
    } catch (err: any) {
      log('error', `Word document generation failed — ${err?.message ?? err}`);
      summary.publishFailures.push({ path: wordOutputPath, reason: err?.message ?? String(err) });
    }
  }

  // ---- Summary ----
  logSummary(summary);

  // Exit with non-zero code if there were hard failures
  if (summary.solutionsSkipped.length > 0 || summary.publishFailures.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n✗ Fatal error: ${err?.message ?? err}`);
  process.exit(1);
});