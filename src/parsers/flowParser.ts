import { XMLParser } from 'fast-xml-parser';
import * as fs from 'fs';
import * as path from 'path';
import type { FlowModel, FlowTriggerModel, FlowActionModel, FlowTriggerType } from '../ir/index.js';
import { generateMermaidDiagram } from '../enrichment/mermaidGenerator.js';

const xmlParser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  isArray: (name) => ['LocalizedName'].includes(name),
});

// -----------------------------------------------
// Dataverse webhook message code → trigger type
// -----------------------------------------------
const MESSAGE_MAP: Record<number, FlowTriggerType> = {
  1: 'DataverseCreate',
  2: 'DataverseDelete',
  4: 'DataverseUpdate',
  5: 'DataverseCreateOrUpdate',
};

// -----------------------------------------------
// OperationId → human-readable action description
// -----------------------------------------------
function describeAction(operationId: string, entityName?: string): string {
  const entity = entityName ? ` on \`${entityName}\`` : '';
  const opMap: Record<string, string> = {
    CreateRecord: `Create record${entity}`,
    UpdateRecord: `Update record${entity}`,
    UpdateOnlyRecord: `Update record${entity}`,
    DeleteRecord: `Delete record${entity}`,
    GetItem: `Get record${entity}`,
    ListRecords: `List records${entity}`,
    ExecuteChangeset: `Execute changeset${entity}`,
    PerformBoundAction: `Perform bound action${entity}`,
    SendEmail: 'Send email',
    SendEmailV2: 'Send email',
    SendApproval: 'Send approval request',
    StartAndWaitForAnApproval: 'Send approval and wait for response',
    CreateHtml: 'Create HTML content',
    Compose: 'Compose value',
    Expression: 'Evaluate expression',
    ParseJson: 'Parse JSON',
    Http: 'HTTP request',
    Response: 'Return response',
    Terminate: 'Terminate flow',
    Delay: 'Wait / delay',
    If: 'Condition branch',
    Switch: 'Switch condition',
    Foreach: 'Loop — for each',
    Until: 'Loop — until',
    Scope: 'Scope / try block',
  };
  return opMap[operationId] ?? `Run action: ${operationId}${entity}`;
}

// -----------------------------------------------
// Parse trigger from JSON definition
// -----------------------------------------------
function parseTrigger(triggers: Record<string, any>): FlowTriggerModel {
  const [triggerKey, trigger] = Object.entries(triggers)[0] ?? ['Unknown', {}];
  const name = triggerKey.replace(/_/g, ' ');
  const params = trigger?.inputs?.parameters ?? {};
  const operationId: string = trigger?.inputs?.host?.operationId ?? trigger?.inputs?.operationId ?? '';

  // Dataverse webhook trigger
  if (operationId === 'SubscribeWebhookTrigger') {
    const messageCode = Number(params['subscriptionRequest/message']);
    const entity: string = params['subscriptionRequest/entityname'] ?? '';
    const filterExpression: string = params['subscriptionRequest/filterexpression'] ?? '';
    const filterAttributes: string = params['subscriptionRequest/filteringattributes'] ?? '';
    const triggerType = MESSAGE_MAP[messageCode] ?? 'Other';

    const triggerLabels: Record<string, string> = {
      DataverseCreate: `When a \`${entity}\` record is created`,
      DataverseUpdate: `When a \`${entity}\` record is updated`,
      DataverseDelete: `When a \`${entity}\` record is deleted`,
      DataverseCreateOrUpdate: `When a \`${entity}\` record is created or updated`,
    };

    return {
      name,
      type: triggerType,
      entity,
      filterExpression: filterExpression || undefined,
      filterAttributes: filterAttributes || undefined,
      description: triggerLabels[triggerType] ?? `Dataverse trigger on \`${entity}\``,
    };
  }

  // Scheduled trigger
  if (trigger?.type === 'Recurrence') {
    const interval = trigger?.recurrence?.interval ?? '';
    const freq = trigger?.recurrence?.frequency ?? '';
    return {
      name,
      type: 'Scheduled',
      description: `Scheduled — every ${interval} ${freq}`.trim(),
    };
  }

  // Record Selected trigger (manual trigger from Dataverse form/view)
  if (operationId === 'RecordSelected') {
    const entity: string = params['entityName'] ?? '';
    return {
      name,
      type: 'Manual',
      entity: entity || undefined,
      description: `When a \`${entity}\` record is selected in a Dataverse form or view`,
    };
  }

  // Manual trigger
  if (trigger?.type === 'Request' || operationId === 'PowerAppsNotification') {
    return { name, type: 'Manual', description: 'Manually triggered or called from Power Apps' };
  }

  return { name, type: 'Other', description: `Trigger: ${trigger?.type ?? 'Unknown'}` };
}

// -----------------------------------------------
// Serialise a Power Automate condition expression
// into a human-readable string
// -----------------------------------------------
function cleanValue(val: string): string {
  if (typeof val !== 'string') return String(val);
  val = val.replace(/@outputs\('([^']+)'\)\??\['body\/([^\]]+)'\]/g, (_, _a, field) => field);
  val = val.replace(/@triggerBody\(\)\??\['([^\]]+)'\]/g, (_, field) => field);
  val = val.replace(/@triggerOutputs\(\)\??\['body\/([^\]]+)'\]/g, (_, field) => field);
  val = val.replace(/@(null|true|false)/g, '$1');
  return val;
}

function serializeExpression(expr: any, depth: number = 0): string {
  if (!expr || typeof expr !== 'object') return String(expr ?? '');

  for (const op of ['and', 'or']) {
    if (Array.isArray(expr[op])) {
      const parts = expr[op].map((e: any) => serializeExpression(e, depth + 1));
      const joined = parts.join(` ${op} `);
      return depth > 0 ? `(${joined})` : joined;
    }
  }

  if (expr.not) return `not ${serializeExpression(expr.not, depth + 1)}`;

  const compMap: Record<string, string> = {
    equals: '=', greater: '>', greaterOrEquals: '>=', less: '<', lessOrEquals: '<=',
  };
  for (const [op, symbol] of Object.entries(compMap)) {
    if (Array.isArray(expr[op]) && expr[op].length === 2) {
      const [left, right] = expr[op].map((v: any) =>
        typeof v === 'string' ? cleanValue(v) : serializeExpression(v, depth + 1)
      );
      return `${left} ${symbol} ${right}`;
    }
  }

  if (Array.isArray(expr.contains) && expr.contains.length === 2) {
    return `${cleanValue(expr.contains[0])} contains ${cleanValue(expr.contains[1])}`;
  }

  for (const fn of ['startsWith', 'endsWith']) {
    if (Array.isArray(expr[fn]) && expr[fn].length === 2) {
      return `${cleanValue(expr[fn][0])} ${fn} ${cleanValue(expr[fn][1])}`;
    }
  }

  return JSON.stringify(expr);
}

// -----------------------------------------------
// Parse actions recursively — walks If/Scope/Foreach branches
// -----------------------------------------------
function parseActions(actions: Record<string, any>, depth: number = 0, parentName?: string): FlowActionModel[] {
  const results: FlowActionModel[] = [];

  for (const [key, action] of Object.entries(actions)) {
    const name = key.replace(/_/g, ' ');
    const type: string = action?.type ?? '';
    const operationId: string = action?.inputs?.host?.operationId ?? type;
    const entityName: string = action?.inputs?.parameters?.entityName ?? '';
    const runAfter: string[] = Object.keys(action?.runAfter ?? {}).map(k => k.replace(/_/g, ' '));

    // Enrich descriptions for container action types
    let description = describeAction(operationId, entityName || undefined);

    if (type === 'If') {
      const yesCount = Object.keys(action?.actions ?? {}).length;
      const noCount = Object.keys(action?.else?.actions ?? {}).length;
      const parts: string[] = [];
      if (yesCount > 0) parts.push(`Yes: ${yesCount} action${yesCount !== 1 ? 's' : ''}`);
      if (noCount > 0) parts.push(`No: ${noCount} action${noCount !== 1 ? 's' : ''}`);
      const branchSummary = parts.length > 0 ? ` (${parts.join(' / ')})` : '';
      const expr = action?.expression ? serializeExpression(action.expression) : '';
      description = expr ? `If ${expr}${branchSummary}` : `Condition branch${branchSummary}`;
    }

    if (type === 'Foreach') {
      const collection: string = action?.foreach ?? '';
      // Extract the action output reference e.g. @outputs('Foo')?['body/value'] → Foo
      const match = collection.match(/outputs\('([^']+)'\)/);
      const collectionLabel = match ? match[1].replace(/_/g, ' ') : collection;
      const innerCount = Object.keys(action?.actions ?? {}).length;
      description = collectionLabel
        ? `Loop over ${collectionLabel} (${innerCount} action${innerCount !== 1 ? 's' : ''})`
        : `Loop — for each (${innerCount} action${innerCount !== 1 ? 's' : ''})`;
    }

    if (type === 'Switch') {
      const switchOn: string = action?.expression ?? '';
      const match = switchOn.match(/outputs\('([^']+)'\)/);
      const switchLabel = match ? match[1].replace(/_/g, ' ') : switchOn;
      description = switchLabel ? `Switch on ${switchLabel}` : 'Switch condition';
    }

    results.push({
      name,
      type,
      operationId,
      entityName: entityName || undefined,
      description,
      runAfter,
      depth,
      parentName,
    });

    // Recurse into If branches
    if (type === 'If') {
      if (action?.actions) results.push(...parseActions(action.actions, depth + 1, `${name} (Yes)`));
      if (action?.else?.actions) results.push(...parseActions(action.else.actions, depth + 1, `${name} (No)`));
    }

    // Recurse into Scope (Try/Catch pattern)
    if (type === 'Scope') {
      if (action?.actions) results.push(...parseActions(action.actions, depth + 1, name));
    }

    // Recurse into Foreach
    if (type === 'Foreach') {
      if (action?.actions) results.push(...parseActions(action.actions, depth + 1, name));
    }

    // Recurse into Switch cases
    if (type === 'Switch') {
      for (const [caseKey, caseActions] of Object.entries(action?.cases ?? {})) {
        const c = caseActions as any;
        if (c?.actions) results.push(...parseActions(c.actions, depth + 1, `${name} (${caseKey})`));
      }
      if (action?.default?.actions) results.push(...parseActions(action.default.actions, depth + 1, `${name} (default)`));
    }
  }

  return results;
}

// -----------------------------------------------
// Parse a single flow XML + JSON pair
// -----------------------------------------------
function parseFlowPair(xmlPath: string, unpackedPath: string): FlowModel | null {
  const rawXml = fs.readFileSync(xmlPath, 'utf-8');
  const parsed = xmlParser.parse(rawXml);
  const workflow = parsed?.Workflow;

  if (!workflow) {
    console.warn(`No Workflow node found in: ${xmlPath}`);
    return null;
  }

  const id: string = workflow['@_WorkflowId']?.replace(/[{}]/g, '') ?? '';
  const category = Number(workflow.Category);

  // Category 5 = Modern Flow, anything else = Classic Workflow
  // We only parse Modern Flows here — classic workflows handled separately
  if (category !== 5) return null;

  const isActive = Number(workflow.StateCode) === 1;

  const localizedNames = workflow.LocalizedNames?.LocalizedName ?? [];
  const nameEntry = localizedNames.find((n: any) => n['@_languagecode'] === '1033');
  const name: string = nameEntry?.['@_description'] ?? workflow['@_Name'] ?? 'Unknown Flow';

  // Resolve JSON file path — JsonFileName is relative to unpacked root
  const jsonRelPath: string = workflow.JsonFileName ?? '';
  if (!jsonRelPath) {
    console.warn(`No JsonFileName in workflow XML: ${xmlPath}`);
    return null;
  }

  // JsonFileName starts with /Workflows/... — strip leading slash and join
  const jsonPath = path.join(unpackedPath, jsonRelPath.replace(/^\//, ''));

  if (!fs.existsSync(jsonPath)) {
    console.warn(`Flow JSON not found: ${jsonPath}`);
    return null;
  }

  let flowJson: any;
  try {
    flowJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (err) {
    console.error(`Failed to parse flow JSON: ${jsonPath}`, err);
    return null;
  }

  const definition = flowJson?.properties?.definition;
  if (!definition) {
    console.warn(`No definition found in flow JSON: ${jsonPath}`);
    return null;
  }

  const triggers: Record<string, any> = definition.triggers ?? {};
  const actions: Record<string, any> = definition.actions ?? {};

  const connectionRefs = Object.values(flowJson?.properties?.connectionReferences ?? {})
    .map((ref: any) => ref?.connection?.connectionReferenceLogicalName ?? '')
    .filter(Boolean);

  const trigger = parseTrigger(triggers);

  return {
    id,
    name,
    category: 'ModernFlow',
    isActive,
    trigger,
    actions: parseActions(actions),
    connectionReferences: connectionRefs,
    mermaidDiagram: generateMermaidDiagram(trigger, actions),
  };
}

// -----------------------------------------------
// Parse all flows from the Workflows folder
// -----------------------------------------------
export function parseAllFlows(unpackedPath: string): FlowModel[] {
  const workflowsPath = path.join(unpackedPath, 'Workflows');

  if (!fs.existsSync(workflowsPath)) {
    console.warn(`No Workflows folder found at: ${workflowsPath}`);
    return [];
  }

  // Only process XML files — each XML is the metadata for one flow
  // The paired JSON is referenced inside the XML via JsonFileName
  const xmlFiles = fs
    .readdirSync(workflowsPath)
    .filter(f => f.endsWith('.xml'));

  console.log(`Found ${xmlFiles.length} workflow XML files`);

  const flows: FlowModel[] = [];

  for (const file of xmlFiles) {
    const xmlPath = path.join(workflowsPath, file);
    try {
      const flow = parseFlowPair(xmlPath, unpackedPath);
      if (flow) flows.push(flow);
    } catch (err) {
      console.error(`Failed to parse workflow: ${file}`, err);
    }
  }

  console.log(`Parsed ${flows.length} modern flows`);
  return flows;
}