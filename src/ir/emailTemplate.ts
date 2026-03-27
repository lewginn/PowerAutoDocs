/**
 * IR model for Email Templates.
 * Subject and body are extracted from XSL files as plain text
 * with dynamic field references shown as {fieldName} placeholders.
 */

export interface EmailTemplateModel {
  id: string;
  title: string;
  description: string;
  targetEntity: string;
  templateTypeCode: number;
  /** Plain text subject with dynamic fields as {fieldName} placeholders */
  subject: string;
  /** Plain text body with dynamic fields as {fieldName} placeholders */
  body: string;
  /** All dynamic field references from subject and body XSL */
  dynamicFields: string[];
  languageCode: number;
  isCustomizable: boolean;
}