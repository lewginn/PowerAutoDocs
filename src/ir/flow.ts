export type FlowCategory = 'ModernFlow' | 'ClassicWorkflow';

export type FlowTriggerType =
  | 'DataverseCreate'
  | 'DataverseUpdate'
  | 'DataverseDelete'
  | 'DataverseCreateOrUpdate'
  | 'Scheduled'
  | 'Manual'
  | 'Other';

export interface FlowTriggerModel {
  name: string;
  type: FlowTriggerType;
  /** Dataverse table logical name, if applicable */
  entity?: string;
  /** Raw filter expression e.g. "statuscode eq 948610001" */
  filterExpression?: string;
  /** Comma-separated attributes that trigger the flow */
  filterAttributes?: string;
  /** Human-readable one-liner */
  description: string;
}

export interface FlowActionModel {
  /** Action key with underscores replaced by spaces */
  name: string;
  /** Raw action type from JSON e.g. OpenApiConnection */
  type: string;
  /** Operation e.g. CreateRecord, GetItem, UpdateRecord */
  operationId: string;
  /** Dataverse entity targeted, if applicable */
  entityName?: string;
  /** Human-readable summary of what this action does */
  description: string;
  /** Names of actions this one waits for */
  runAfter: string[];
  /** Nesting depth — 0 = top level, 1 = inside If/Scope/Foreach, etc. */
  depth: number;
  /** Name of the parent container action, if nested */
  parentName?: string;
}

export interface FlowModel {
  id: string;
  name: string;
  category: FlowCategory;
  isActive: boolean;
  trigger: FlowTriggerModel;
  actions: FlowActionModel[];
  /** Logical names of connection references used */
  connectionReferences: string[];
  /** Mermaid flowchart diagram string — generated at parse time */
  mermaidDiagram?: string;
}