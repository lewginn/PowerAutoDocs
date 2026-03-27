// parsers/businessRuleParser.ts

import { XMLParser } from 'fast-xml-parser';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type {
  BusinessRuleModel,
  BusinessRuleCondition,
  BusinessRuleAction,
  BusinessRuleActionType,
  BusinessRuleScope,
} from '../ir/businessRule.js';

// -----------------------------------------------
// Parser config — strips namespace prefixes so
// mcwc:SetVisibility becomes SetVisibility, etc.
// -----------------------------------------------
const PARSER = new XMLParser({
  removeNSPrefix: true,
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  isArray: (name) =>
    ['ActivityReference', 'Sequence', 'Collection', 'Variable', 'GetEntityProperty'].includes(name),
  parseTagValue: true,
  trimValues: true,
});

// -----------------------------------------------
// Helpers
// -----------------------------------------------

function attr(node: any, name: string): string {
  if (!node || typeof node !== 'object') return '';
  return ((node[`@_${name}`] ?? node[`@_x:${name}`] ?? '') as string).toString().trim();
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
// Action extraction from a branch Composite
// -----------------------------------------------

/**
 * Extract business rule actions from the Activities collection inside a Composite branch.
 * Looks for SetVisibility, SetFieldRequiredLevel, SetAttributeValue/SetEntityProperty sequences.
 */
function extractBranchActions(compositeRef: any): BusinessRuleAction[] {
  const actions: BusinessRuleAction[] = [];
  const props = compositeRef?.['ActivityReference.Properties'] ?? {};

  for (const col of asArray(props['Collection'])) {
    // Skip the Variables collection, process the Activities collection
    // Key may be @_Key or @_x:Key depending on fast-xml-parser version
    const key = attr(col, 'Key');
    if (key === 'Variables') continue;

    for (const seq of asArray(col['Sequence'])) {
      // SetVisibility — mcwc:SetVisibility (namespace stripped to SetVisibility)
      const setVis = seq['SetVisibility'];
      if (setVis) {
        const field = attr(setVis, 'ControlId');
        const isVisible = attr(setVis, 'IsVisible').toLowerCase() === 'true';
        if (field) {
          actions.push({ type: isVisible ? 'show' : 'hide', field });
        }
        continue;
      }

      // SetFieldRequiredLevel — mcwc:SetFieldRequiredLevel
      const setReq = seq['SetFieldRequiredLevel'];
      if (setReq) {
        const field = attr(setReq, 'ControlId');
        const level = attr(setReq, 'RequiredLevel');
        if (field) {
          const type: BusinessRuleActionType =
            level === 'Required'    ? 'setRequired' :
            level === 'Recommended' ? 'setRecommended' : 'setOptional';
          actions.push({ type, field });
        }
        continue;
      }

      // SetAttributeValue (clear/set value) — look for SetEntityProperty to get the field name,
      // then check if the value variable is uninitialised (clear) or has a value (set)
      const setAttr = seq['SetAttributeValue'];
      if (setAttr) {
        // The field being written is on the sibling SetEntityProperty
        for (const sep of asArray(seq['SetEntityProperty'])) {
          const field = attr(sep, 'Attribute');
          if (field) {
            // If the variable default is unset/null it's a clear, otherwise it's a set value
            // We use 'clearValue' as the conservative label — we can't easily read the value
            actions.push({ type: 'clearValue', field });
          }
        }
        // Also handle the case where SetEntityProperty appears without SetAttributeValue
        // (some clear patterns use only SetEntityProperty + UpdateEntity)
        continue;
      }

      // SetEntityProperty without SetAttributeValue — value set via workflow variable
      if (seq['SetEntityProperty'] && !setAttr) {
        for (const sep of asArray(seq['SetEntityProperty'])) {
          const field = attr(sep, 'Attribute');
          if (field) {
            actions.push({ type: 'clearValue', field });
          }
        }
      }
    }
  }

  return actions;
}

// -----------------------------------------------
// Condition extraction
// -----------------------------------------------

/**
 * Extract a BusinessRuleCondition from a ConditionSequence ActivityReference.
 * The ConditionSequence contains:
 *   - GetEntityProperty nodes (the field being tested)
 *   - ConditionBranch with Then composite (actions when true)
 *   - Optional Else composite (actions when false)
 *   - x:String x:Key="Description" (human-readable label)
 */
function extractCondition(condSeqRef: any): BusinessRuleCondition | null {
  const props = condSeqRef?.['ActivityReference.Properties'] ?? {};

  // Find the Activities collection — skip Variables
  let activitiesCol: any = null;
  for (const col of asArray(props['Collection'])) {
    const key = attr(col, 'Key');
    if (key === 'Variables') continue;
    activitiesCol = col;
    break;
  }

  if (!activitiesCol) return null;

  // Condition field — first GetEntityProperty Attribute value
  const conditionField = attr(asArray(activitiesCol['GetEntityProperty'])[0], 'Attribute') || '?';

  // Find the two ConditionBranch nodes in the Activities collection.
  // Dataverse encodes if/else as two sibling ConditionBranch nodes:
  //   Step2: condition = [field evaluation] → Then actions (the "if true" branch)
  //   Step3: condition = [True]             → Then actions (the "else" branch)
  const allBranches = asArray(activitiesCol['ActivityReference'])
    .filter(r => isAssembly(r, 'ConditionBranch'));

  const ifBranch   = allBranches[0];
  const elseBranch = allBranches[1]; // present when rule has an else

  if (!ifBranch) return null;

  const ifBranchProps = ifBranch['ActivityReference.Properties'] ?? {};

  // Description — x:String x:Key="Description" inside the if branch properties.
  // After removeNSPrefix, x:String element becomes 'String' as the object key.
  let description: string | undefined;
  const descNode = ifBranchProps['String'] ?? ifBranchProps['x:String'];
  if (typeof descNode === 'string' && descNode.trim()) {
    description = descNode.trim();
  } else if (descNode && typeof descNode === 'object' && '#text' in descNode) {
    const v = String(descNode['#text']).trim();
    if (v) description = v;
  }

  // Then actions — from the Composite inside the if branch
  const thenComposite = asArray(ifBranchProps['ActivityReference'])
    .find(r => isAssembly(r, 'Composite'));
  const thenActions = thenComposite ? extractBranchActions(thenComposite) : [];

  // Else actions — from the Composite inside the else branch (Step3 with condition=[True])
  let elseActions: ReturnType<typeof extractBranchActions> = [];
  if (elseBranch) {
    const elseBranchProps = elseBranch['ActivityReference.Properties'] ?? {};
    const elseComposite = asArray(elseBranchProps['ActivityReference'])
      .find(r => isAssembly(r, 'Composite'));
    elseActions = elseComposite ? extractBranchActions(elseComposite) : [];
  }

  return {
    conditionField,
    description: description || undefined,
    thenActions,
    elseActions,
  };
}

// -----------------------------------------------
// XAML parsing
// -----------------------------------------------

function extractConditions(workflowNode: any): BusinessRuleCondition[] {
  if (!workflowNode || typeof workflowNode !== 'object') return [];

  const conditions: BusinessRuleCondition[] = [];

  for (const ref of asArray(workflowNode['ActivityReference'])) {
    if (isAssembly(ref, 'ConditionSequence')) {
      const condition = extractCondition(ref);
      if (condition) conditions.push(condition);
    }
  }

  return conditions;
}

// -----------------------------------------------
// Metadata parsing
// -----------------------------------------------

function parseMetadata(xmlContent: string): Omit<BusinessRuleModel, 'conditions'> | null {
  try {
    const parsed = PARSER.parse(xmlContent);
    const wf = parsed?.Workflow;
    if (!wf) return null;

    // Only process Category = 2 (business rules)
    if (Number(textOf(wf.Category)) !== 2) return null;

    const id = attr(wf, 'WorkflowId').replace(/[{}]/g, '');
    const name = attr(wf, 'Name');
    const entity = textOf(wf.PrimaryEntity ?? '');
    const status: 'active' | 'inactive' =
      Number(textOf(wf.StateCode)) === 1 ? 'active' : 'inactive';

    // ProcessTriggerScope: 1 = specific form, 2 = all forms, absent = entity
    const scopeCode = wf.ProcessTriggerScope !== undefined
      ? Number(textOf(wf.ProcessTriggerScope))
      : null;
    const scope: BusinessRuleScope =
      scopeCode === 1 ? 'specificForm' :
      scopeCode === 2 ? 'allForms' : 'entity';

    return { id, name, entity, status, scope };
  } catch {
    return null;
  }
}

// -----------------------------------------------
// Main export
// -----------------------------------------------

export function parseBusinessRules(solutionPath: string): BusinessRuleModel[] {
  const workflowsPath = join(solutionPath, 'Workflows');

  if (!existsSync(workflowsPath)) return [];

  // Support both naming conventions:
  //   pac CLI v1: Name_xaml_data.xml  → sibling is Name.xaml
  //   pac CLI v2: Name.xaml.data.xml  → sibling is Name.xaml
  const dataFiles = readdirSync(workflowsPath)
    .filter(f => f.endsWith('.xaml.data.xml') || f.endsWith('_xaml_data.xml'))
    .map(f => join(workflowsPath, f));

  const rules: BusinessRuleModel[] = [];

  for (const dataFile of dataFiles) {
    try {
      const dataContent = readFileSync(dataFile, 'utf-8').replace(/^\uFEFF/, '');
      const meta = parseMetadata(dataContent);
      if (!meta) continue; // not a business rule (Category !== 2)

      // Derive sibling .xaml path for both naming conventions
      const xamlPath = dataFile.endsWith('.xaml.data.xml')
        ? dataFile.replace(/\.data\.xml$/, '')
        : dataFile.replace(/_xaml_data\.xml$/, '.xaml');

      let conditions: BusinessRuleCondition[] = [];

      if (existsSync(xamlPath)) {
        try {
          const xamlContent = readFileSync(xamlPath, 'utf-8').replace(/^\uFEFF/, '');
          const parsed = PARSER.parse(xamlContent);
          const workflowNode = parsed?.Activity?.Workflow ?? parsed?.Workflow;
          conditions = extractConditions(workflowNode ?? {});
        } catch {
          // XAML parse failure — emit rule with metadata only
        }
      }

      rules.push({ ...meta, conditions });
    } catch {
      // Skip malformed files
    }
  }

  return rules.sort((a, b) => a.name.localeCompare(b.name));
}