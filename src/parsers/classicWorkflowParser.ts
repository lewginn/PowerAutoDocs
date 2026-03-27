// parsers/classicWorkflowParser.ts

import { XMLParser } from 'fast-xml-parser';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type {
  ClassicWorkflowModel,
  ClassicWorkflowStepModel,
  ClassicWorkflowCategory,
  ClassicWorkflowMode,
  ClassicWorkflowScope,
} from '../ir/classicWorkflow.js';

// -----------------------------------------------
// Parser config
// -----------------------------------------------
// ignoreNameSpace strips namespace prefixes from element names:
//   mxswa:ActivityReference  →  ActivityReference
//   mxswa:UpdateEntity       →  UpdateEntity
// Attribute names (x:Key, x:TypeArguments) may retain prefix depending
// on fast-xml-parser version — we check both variants below.
// -----------------------------------------------
const PARSER = new XMLParser({
  removeNSPrefix: true,
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  isArray: (name) =>
    [
      'ActivityReference',
      'Sequence',
      'Collection',
      'Variable',
      'GetEntityProperty',
      'SetEntityProperty',
      'Assign',
    ].includes(name),
  parseTagValue: true,
  trimValues: true,
});

// -----------------------------------------------
// Helpers
// -----------------------------------------------

function attr(node: any, name: string): string {
  if (!node || typeof node !== 'object') return '';
  // Try with and without x: prefix for attributes like x:Key, x:TypeArguments
  return (
    (node[`@_${name}`] ?? node[`@_x:${name}`] ?? '') as string
  ).toString().trim();
}

function textOf(val: any): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (typeof val === 'object' && '#text' in val) return String(val['#text']).trim();
  return '';
}

function asArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function isAssembly(node: any, fragment: string): boolean {
  return attr(node, 'AssemblyQualifiedName').includes(fragment);
}

// -----------------------------------------------
// Metadata parsing (_xaml_data.xml)
// -----------------------------------------------

function parseMetadata(xmlContent: string): Omit<ClassicWorkflowModel, 'steps'> | null {
  try {
    const parsed = PARSER.parse(xmlContent);
    const wf = parsed?.Workflow;
    if (!wf) return null;

    const id = attr(wf, 'WorkflowId').replace(/[{}]/g, '');
    const name = attr(wf, 'Name');

    const categoryCode = Number(textOf(wf.Category));

    // Category=2 = business rule — handled by businessRuleParser, skip here
    if (categoryCode === 2) return null;

    const category: ClassicWorkflowCategory =
      categoryCode === 3 ? 'action' : 'workflow';

    const mode: ClassicWorkflowMode =
      Number(textOf(wf.Mode)) === 0 ? 'realtime' : 'background';

    const scope: ClassicWorkflowScope =
      Number(textOf(wf.Scope)) === 1 ? 'user' :
      Number(textOf(wf.Scope)) === 2 ? 'businessunit' : 'organization';

    const runAs: 'owner' | 'callinguser' =
      Number(textOf(wf.RunAs)) === 0 ? 'owner' : 'callinguser';

    const status: 'active' | 'inactive' =
      Number(textOf(wf.StateCode)) === 1 ? 'active' : 'inactive';

    const updateFieldsRaw = textOf(wf.TriggerOnUpdateAttributeList ?? '');
    const updateFields = updateFieldsRaw
      ? updateFieldsRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    // onUpdate is true when updateFields are set OR UpdateStage element present
    const onUpdate = updateFields.length > 0 || wf.UpdateStage !== undefined;

    return {
      id,
      name,
      entity: textOf(wf.PrimaryEntity ?? ''),
      category,
      mode,
      scope,
      runAs,
      status,
      triggers: {
        onCreate: Number(textOf(wf.TriggerOnCreate  ?? 0)) === 1,
        onUpdate,
        onDelete: Number(textOf(wf.TriggerOnDelete  ?? 0)) === 1,
        onDemand: Number(textOf(wf.OnDemand         ?? 0)) === 1,
        updateFields,
      },
    };
  } catch {
    return null;
  }
}

// -----------------------------------------------
// XAML step extraction
// -----------------------------------------------

/**
 * Find the error message for a TerminateWorkflow step.
 * Looks for a Variable named stepLabelDescription with a Default value.
 * Falls back to stripping the prefix from the Sequence DisplayName.
 */
function extractTerminateMessage(seq: any): string {
  for (const v of asArray(seq?.['Sequence.Variables']?.Variable)) {
    if (attr(v, 'Name') === 'stepLabelDescription') {
      const def = attr(v, 'Default');
      if (def) return def;
    }
  }
  // Fall back: strip "StopWorkflowStepN: " prefix from DisplayName
  const dn = attr(seq, 'DisplayName');
  return dn.replace(/^StopWorkflowStep\d+:\s*/i, '').trim();
}

/**
 * Extract fields touched (read or written) in a Sequence.
 * Combines GetEntityProperty (reads) and SetEntityProperty (writes).
 */
function extractTouchedFields(seq: any): string[] {
  const fields = new Set<string>();
  for (const g of asArray(seq?.GetEntityProperty)) {
    const f = attr(g, 'Attribute'); if (f) fields.add(f);
  }
  for (const s of asArray(seq?.SetEntityProperty)) {
    const f = attr(s, 'Attribute'); if (f) fields.add(f);
  }
  return [...fields];
}

/**
 * Extract a named Sequence (UpdateStep, StopWorkflowStep, CreateStep, etc.)
 * into a ClassicWorkflowStepModel.
 */
function extractSequenceStep(seq: any): ClassicWorkflowStepModel | null {
  const displayName = attr(seq, 'DisplayName');
  if (!displayName) return null;

  // TerminateWorkflow is a direct child element of the Sequence
  if (seq['TerminateWorkflow']) {
    return {
      name: displayName,
      type: 'terminate',
      errorMessage: extractTerminateMessage(seq),
    };
  }

  // UpdateEntity is a direct child element
  if (seq['UpdateEntity']) {
    const ue = seq['UpdateEntity'];
    return {
      name: displayName,
      type: 'update',
      entity: attr(ue, 'EntityName'),
      setFields: extractTouchedFields(seq),
    };
  }

  // CreateEntity is a direct child element
  if (seq['CreateEntity']) {
    const ce = seq['CreateEntity'];
    return {
      name: displayName,
      type: 'create',
      entity: attr(ce, 'EntityName'),
      setFields: extractTouchedFields(seq),
    };
  }

  return { name: displayName, type: 'other' };
}

/**
 * Extract action steps from inside a ConditionBranch's Then composite.
 * Structure: ConditionBranch.Properties > Composite > ActivityReference.Properties
 *            > Collection[Key=Activities] > Sequence[]
 */
function extractBranchSteps(conditionBranchRef: any): ClassicWorkflowStepModel[] {
  const steps: ClassicWorkflowStepModel[] = [];
  const props = conditionBranchRef?.['ActivityReference.Properties'] ?? {};

  // The Then composite is an ActivityReference with AssemblyQualifiedName containing 'Composite'
  for (const ref of asArray(props['ActivityReference'])) {
    if (!isAssembly(ref, 'Composite')) continue;

    const compProps = ref?.['ActivityReference.Properties'] ?? {};
    for (const col of asArray(compProps['Collection'])) {
      // Find the Activities collection (Key="Activities")
      const key = attr(col, 'Key');
      if (key && key !== 'Activities') continue;

      // Named action Sequences inside the branch
      for (const seq of asArray(col['Sequence'])) {
        const step = extractSequenceStep(seq);
        if (step) steps.push(step);
      }

      // Nested ConditionSequences inside the branch
      for (const ref2 of asArray(col['ActivityReference'])) {
        if (isAssembly(ref2, 'ConditionSequence')) {
          steps.push(extractConditionStep(ref2));
        }
      }
    }
  }

  return steps;
}

/**
 * Extract a ConditionSequence ActivityReference into a structured step.
 * The ConditionSequence wraps:
 *  - GetEntityProperty nodes (what fields are checked)
 *  - EvaluateCondition/EvaluateLogicalCondition (internal — skipped)
 *  - ConditionBranch (the if/then)
 */
function extractConditionStep(ref: any): ClassicWorkflowStepModel {
  const displayName = attr(ref, 'DisplayName') || 'Condition';
  const props = ref?.['ActivityReference.Properties'] ?? {};

  // Find the Activities collection inside ConditionSequence.Properties
  let activitiesCol: any = null;
  for (const col of asArray(props['Collection'])) {
    const key = attr(col, 'Key');
    if (!key || key === 'Activities') { activitiesCol = col; break; }
  }

  // Condition fields — from GetEntityProperty Attribute values in the Activities block
  const conditionFields: string[] = [];
  for (const g of asArray(activitiesCol?.GetEntityProperty)) {
    const f = attr(g, 'Attribute'); if (f) conditionFields.push(f);
  }

  // ConditionBranch — find within ActivityReferences in the Activities collection
  const branchRef = asArray(activitiesCol?.ActivityReference)
    .find(r => isAssembly(r, 'ConditionBranch'));

  const thenSteps = branchRef ? extractBranchSteps(branchRef) : [];

  return {
    name: displayName,
    type: 'condition',
    conditionFields: conditionFields.length > 0 ? conditionFields : undefined,
    thenSteps: thenSteps.length > 0 ? thenSteps : undefined,
  };
}

/**
 * Extract the top-level steps from the parsed mxswa:Workflow node.
 * After namespace stripping this is simply 'Workflow'.
 */
function extractWorkflowSteps(workflowNode: any): ClassicWorkflowStepModel[] {
  if (!workflowNode || typeof workflowNode !== 'object') return [];

  const steps: ClassicWorkflowStepModel[] = [];

  // Top-level ConditionSequence ActivityReferences
  for (const ref of asArray(workflowNode['ActivityReference'])) {
    if (isAssembly(ref, 'ConditionSequence')) {
      steps.push(extractConditionStep(ref));
    }
  }

  // Top-level Sequences (simple update/create flows with no conditions)
  for (const seq of asArray(workflowNode['Sequence'])) {
    const step = extractSequenceStep(seq);
    if (step) steps.push(step);
  }

  return steps;
}

// -----------------------------------------------
// Main export
// -----------------------------------------------

export function parseClassicWorkflows(solutionPath: string): ClassicWorkflowModel[] {
  const workflowsPath = join(solutionPath, 'Workflows');

  if (!existsSync(workflowsPath)) {
    console.warn(`No Workflows folder found at: ${workflowsPath}`);
    return [];
  }

  // Classic workflow metadata files end with _xaml_data.xml
  // Support both naming conventions:
  //   pac CLI v1: Name_xaml_data.xml  → sibling is Name.xaml
  //   pac CLI v2: Name.xaml.data.xml  → sibling is Name.xaml
  const dataFiles = readdirSync(workflowsPath)
    .filter(f => f.endsWith('.xaml.data.xml') || f.endsWith('_xaml_data.xml'))
    .map(f => join(workflowsPath, f));

  console.log(`  Found ${dataFiles.length} classic workflow data files in: ${workflowsPath}`);

  const workflows: ClassicWorkflowModel[] = [];

  for (const dataFile of dataFiles) {
    try {
      const dataContent = readFileSync(dataFile, 'utf-8').replace(/^\uFEFF/, ''); // strip BOM
      const meta = parseMetadata(dataContent);
      if (!meta) continue;

      // Sibling .xaml file — handle both naming conventions
      const xamlPath = dataFile.endsWith('.xaml.data.xml')
        ? dataFile.replace(/\.data\.xml$/, '')
        : dataFile.replace(/_xaml_data\.xml$/, '.xaml');

      let steps: ClassicWorkflowStepModel[] = [];

      if (existsSync(xamlPath)) {
        try {
          const xamlContent = readFileSync(xamlPath, 'utf-8').replace(/^\uFEFF/, '');
          const parsed = PARSER.parse(xamlContent);
          // Root: <Activity> > <mxswa:Workflow> → after namespace strip: Activity.Workflow
          const workflowNode = parsed?.Activity?.Workflow ?? parsed?.Workflow;
          steps = extractWorkflowSteps(workflowNode ?? {});
        } catch {
          // XAML parse failure — still emit workflow with metadata only
        }
      }

      workflows.push({ ...meta, steps });
    } catch {
      // Skip malformed files
    }
  }

  return workflows.sort((a, b) => a.name.localeCompare(b.name));
}