/**
 * IR model for Global Option Sets (Global Choices).
 * These are solution-level picklists reusable across multiple tables/columns.
 */

export type OptionSetType = 'picklist' | 'bool' | 'status' | 'state' | 'Unknown';

export interface ChoiceOptionModel {
  /** Integer value stored in Dataverse */
  value: number;
  /** Display label (English 1033) */
  label: string;
  /** Description if provided */
  description: string;
  /** Whether the option is hidden from the UI */
  isHidden: boolean;
  /** External value for integration mapping (if set) */
  externalValue: string;
}

export interface GlobalChoiceModel {
  /** Schema name e.g. "myprefix_LeaveType" */
  schemaName: string;
  /** Display name e.g. "Leave Type" */
  displayName: string;
  /** Description if provided */
  description: string;
  /** Picklist type */
  optionSetType: OptionSetType;
  /** Whether this is a global (solution-level) option set */
  isGlobal: boolean;
  /** Ordered list of options */
  options: ChoiceOptionModel[];
}