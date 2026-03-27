/**
 * IR model for Environment Variable Definitions.
 * Each definition may have an optional current value (from environmentvariablevalues.json).
 * If no value file exists, currentValue is undefined and defaultValue applies.
 */

export type EnvironmentVariableType =
  | 'String'
  | 'Number'
  | 'Boolean'
  | 'JSON'
  | 'DataSource'
  | 'Unknown';

export interface EnvironmentVariableModel {
  /** Schema name, e.g. "myprefix_LeaveType" */
  schemaName: string;
  /** Display name, e.g. "Leave Type" */
  displayName: string;
  /** Description / purpose */
  description: string;
  /** Data type */
  type: EnvironmentVariableType;
  /** Default value from the definition XML (may be empty) */
  defaultValue: string;
  /** Current value from environmentvariablevalues.json (undefined if not set) */
  currentValue: string | undefined;
  /** Whether this variable is required */
  isRequired: boolean;
  /** Whether the value is stored in a secret store (0=none, 1=Azure KV, 2=MS Secret Store) */
  secretStore: number;
}