import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseAllPlugins } from '../../src/parsers/pluginParser.js';
import type { PluginAssemblyModel, PluginStepModel } from '../../src/ir/index.js';

const SOLUTION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'solutions', 'ContosoDemo',
);

const assemblies = (): PluginAssemblyModel[] => parseAllPlugins(SOLUTION);

const assembly = (name: string): PluginAssemblyModel =>
  assemblies().find(a => a.assemblyName === name)!;

const step = (assemblyName: string, className: string): PluginStepModel =>
  assembly(assemblyName).steps.find(s => s.className === className)!;

describe('parseAllPlugins', () => {
  it('joins steps to the assembly that owns them across the two folders', () => {
    // The whole point of this parser: PluginAssemblies/ and SdkMessageProcessingSteps/
    // are unrelated on disk and are only linked by the fully-qualified type name.
    const contoso = assembly('Contoso.Crm.Plugins');
    expect(contoso.steps.map(s => s.className).sort()).toEqual([
      'GadgetPreOperation',
      'WidgetCleanup',
      'WidgetPostOperation',
      'WidgetPreValidation',
      'WidgetSyncHandler',
    ]);

    // An assembly with plugin types but no registered steps must still be reported —
    // an unregistered assembly is a documentation-worthy fact, not an omission.
    expect(assembly('Contoso.Crm.Workflows').steps).toEqual([]);
  });

  it('reads assembly metadata off the .dll.data.xml', () => {
    expect(assembly('Contoso.Crm.Plugins')).toMatchObject({
      assemblyName: 'Contoso.Crm.Plugins',
      version: '2.4.1.0',                 // lifted out of FullName, not the <Version> element
      fileName: '/PluginAssemblies/Contoso.Crm.Plugins/Contoso.Crm.Plugins.dll',
      isolationMode: 'Sandbox',           // IsolationMode 2
      pluginTypeNames: [
        'Contoso.Crm.Plugins.WidgetPostOperation',
        'Contoso.Crm.Plugins.WidgetPreValidation',
        'Contoso.Crm.Plugins.GadgetPreOperation',
      ],
    });
  });

  it('treats any isolation mode other than 2 as unsandboxed, and defaults a version-less FullName', () => {
    // Sandbox vs None is a security fact clients read off these docs, so the
    // non-2 branch is worth pinning separately.
    const workflows = assembly('Contoso.Crm.Workflows');
    expect(workflows.isolationMode).toBe('None');   // IsolationMode 1
    expect(workflows.version).toBe('1.0.0.0');      // FullName carries no Version=
  });

  it('maps stage codes to labels and falls back to PostOperation for unmapped codes', () => {
    expect(step('Contoso.Crm.Plugins', 'WidgetPreValidation').stage).toBe('PreValidation'); // 10
    expect(step('Contoso.Crm.Plugins', 'GadgetPreOperation').stage).toBe('PreOperation');   // 20
    expect(step('Contoso.Crm.Plugins', 'WidgetPostOperation').stage).toBe('PostOperation'); // 40
    expect(step('Contoso.Crm.Plugins', 'WidgetCleanup').stage).toBe('PostOperation');       // 30 — unmapped
  });

  it('maps mode 1 to Asynchronous and everything else to Synchronous', () => {
    expect(step('Contoso.Crm.Plugins', 'WidgetPreValidation').mode).toBe('Asynchronous');
    expect(step('Contoso.Crm.Plugins', 'WidgetPostOperation').mode).toBe('Synchronous');
  });

  it('derives message, class and assembly names from the step name and type name', () => {
    expect(step('Contoso.Crm.Plugins', 'WidgetPostOperation')).toMatchObject({
      id: '{c1111111-1111-4111-8111-111111111111}',
      name: 'Contoso.Crm.Plugins.WidgetPostOperation: Update of contoso_widget',
      className: 'WidgetPostOperation',
      // The trailing ", Version=..., Culture=..." of PluginTypeName must be dropped,
      // otherwise the assembly join below never matches.
      pluginTypeName: 'Contoso.Crm.Plugins.WidgetPostOperation',
      assemblyName: 'Contoso.Crm.Plugins',
      message: 'Update',
      primaryEntity: 'contoso_widget',
    });
  });

  it('reports Unknown for a step name that does not carry a "<Message> of <Entity>" clause', () => {
    // Step names are hand-typed by whoever registered the plugin, so the convention
    // is routinely broken; the message must degrade rather than emit a mangled verb.
    expect(step('Contoso.Crm.Plugins', 'WidgetCleanup').message).toBe('Unknown');
  });

  it('splits filtering attributes on commas and trims them, and empty means all attributes', () => {
    expect(step('Contoso.Crm.Plugins', 'WidgetPostOperation').filteringAttributes)
      .toEqual(['contoso_name', 'contoso_status', 'contoso_quantity']);
    // An empty <FilteringAttributes/> must not become [''] — a renderer would print
    // "fires on: <blank>" instead of "fires on: all attributes".
    expect(step('Contoso.Crm.Plugins', 'WidgetPreValidation').filteringAttributes).toEqual([]);
  });

  it('maps step images including type codes and per-image attributes', () => {
    expect(step('Contoso.Crm.Plugins', 'WidgetPostOperation').images).toEqual([
      {
        id: '{d1111111-1111-4111-8111-111111111111}',
        name: 'PreWidgetImage',
        imageType: 'PreImage',                            // 0
        attributes: ['contoso_name', 'contoso_status'],
      },
      {
        id: '{d2222222-2222-4222-8222-222222222222}',
        name: 'PostWidgetImage',
        imageType: 'PostImage',                           // 1
        attributes: [],                                   // empty <Attributes/> = whole record
      },
    ]);
  });

  it('handles a lone image element and the Both image type, falling back to EntityAlias for the name', () => {
    // fast-xml-parser collapses a single child to a scalar unless it is in the isArray
    // list — this is the assertion that catches SdkMessageProcessingStepImage falling out of it.
    expect(step('Contoso.Crm.Plugins', 'WidgetPreValidation').images).toEqual([
      {
        id: '{d3333333-3333-4333-8333-333333333333}',
        name: 'TargetWidget',       // no @Name attribute, so EntityAlias is used
        imageType: 'Both',          // 2
        attributes: ['contoso_name'],
      },
    ]);
  });

  it('gives a step with no images an empty array rather than undefined', () => {
    expect(step('Contoso.Crm.Plugins', 'GadgetPreOperation').images).toEqual([]);
  });

  it('synthesises a placeholder assembly for steps whose assembly is not in the solution', () => {
    // Steps registered against an assembly shipped by another solution are common;
    // dropping them would silently hide live server-side logic from the docs.
    const orphan = assembly('Fabrikam.Legacy.Plugins');
    expect(orphan).toMatchObject({
      version: 'Unknown',
      fileName: '',
      isolationMode: 'Sandbox',
      pluginTypeNames: [],
    });
    expect(orphan.steps.map(s => s.className)).toEqual(['OrphanHandler']);
  });

  it('skips an assembly folder with no .dll.data.xml, and a malformed one, without losing the others', () => {
    // PluginAssemblies/Contoso.Crm.NoData holds only a readme; Contoso.Crm.Broken holds
    // a truncated XML file. Neither may take the whole sweep down.
    const names = assemblies().map(a => a.assemblyName);
    expect(names).not.toContain('Contoso.Crm.NoData');
    expect(names).not.toContain('Contoso.Crm.Broken');
    expect(names).toContain('Contoso.Crm.Plugins');
  });

  it('skips a malformed step file but keeps every other step', () => {
    const all = assemblies().flatMap(a => a.steps);
    expect(all.some(s => s.className === 'Broken')).toBe(false);
    expect(all.length).toBeGreaterThan(0);
  });

  it('returns empty for a solution with no PluginAssemblies folder', () => {
    // Every sweeping parser must tolerate an absent component folder — most real
    // solutions contain only a few component types.
    expect(parseAllPlugins(path.join(SOLUTION, 'Other'))).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // KNOWN BUG — pinned so the fix is a deliberate, visible change.
  //
  // Steps are joined with `pluginTypeName.startsWith(assemblyName + '.')`, but a step's
  // own `assemblyName` is derived by lopping off the last dotted segment. For a type in a
  // namespace *below* the assembly root (Contoso.Crm.Plugins.Widgets.WidgetSyncHandler in
  // an assembly named Contoso.Crm.Plugins) the two disagree: the step matches the real
  // assembly, but its derived assemblyName is absent from `coveredAssemblies`, so the
  // orphan pass emits it a second time under a phantom assembly. Nested plugin namespaces
  // are ordinary, so this double-counts real steps in client documentation.
  // ---------------------------------------------------------------------------
  it('BUG: a nested-namespace plugin type is emitted twice, under a phantom assembly', () => {
    const syncSteps = assemblies()
      .flatMap(a => a.steps)
      .filter(s => s.className === 'WidgetSyncHandler');
    expect(syncSteps).toHaveLength(2);

    const phantom = assembly('Contoso.Crm.Plugins.Widgets');
    expect(phantom).toBeDefined();
    expect(phantom.version).toBe('Unknown');
    // Once fixed, WidgetSyncHandler should appear exactly once, under Contoso.Crm.Plugins.
    expect(assembly('Contoso.Crm.Plugins').steps.map(s => s.className))
      .toContain('WidgetSyncHandler');
  });
});
