// ir/classicWorkflow.ts

export type ClassicWorkflowCategory = 'workflow' | 'action';
export type ClassicWorkflowMode = 'realtime' | 'background';
export type ClassicWorkflowScope = 'organization' | 'businessunit' | 'user';

export interface ClassicWorkflowStepModel {
  name: string;
  type: 'condition' | 'update' | 'create' | 'terminate' | 'other';
  entity?: string;           // table for update/create steps
  conditionFields?: string[]; // fields checked in this condition
  setFields?: string[];       // fields written in update/create
  errorMessage?: string;      // message for terminate steps
  thenSteps?: ClassicWorkflowStepModel[]; // actions inside the condition branch
}

export interface ClassicWorkflowTriggers {
  onCreate: boolean;
  onUpdate: boolean;
  onDelete: boolean;
  onDemand: boolean;
  updateFields: string[]; // specific fields that trigger on update
}

export interface ClassicWorkflowModel {
  id: string;
  name: string;
  entity: string;
  category: ClassicWorkflowCategory;
  mode: ClassicWorkflowMode;
  scope: ClassicWorkflowScope;
  runAs: 'owner' | 'callinguser';
  status: 'active' | 'inactive';
  triggers: ClassicWorkflowTriggers;
  steps: ClassicWorkflowStepModel[];
}