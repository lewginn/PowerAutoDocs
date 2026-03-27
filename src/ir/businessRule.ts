export type BusinessRuleActionType =
  | 'show'
  | 'hide'
  | 'setRequired'
  | 'setRecommended'
  | 'setOptional'
  | 'setValue'
  | 'clearValue';

export interface BusinessRuleAction {
  type: BusinessRuleActionType;
  /** Field logical name (ControlId) */
  field: string;
}

export interface BusinessRuleCondition {
  /** Field being tested in the condition */
  conditionField: string;
  /** Human-readable label from x:String x:Key="Description" in the ConditionBranch */
  description?: string;
  /** Actions to take when the condition is true */
  thenActions: BusinessRuleAction[];
  /** Actions to take when the condition is false (else branch) */
  elseActions: BusinessRuleAction[];
}

export type BusinessRuleScope = 'allForms' | 'specificForm' | 'entity';

export interface BusinessRuleModel {
  id: string;
  name: string;
  entity: string;
  status: 'active' | 'inactive';
  /** allForms = runs on all forms, specificForm = tied to one form, entity = server-side */
  scope: BusinessRuleScope;
  conditions: BusinessRuleCondition[];
}