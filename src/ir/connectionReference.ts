/**
 * IR model for Connection References.
 * Connection references decouple flows/apps from specific connections,
 * allowing environment-specific configuration without modifying the solution.
 */

export interface ConnectionReferenceModel {
  /** Logical name e.g. "myprefix_sharedcommondataserviceforapps_f10b6" */
  logicalName: string;
  /** Display name e.g. "Microsoft Dataverse SolutionName-f10b6" */
  displayName: string;
  /** Connector ID path e.g. "/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps" */
  connectorId: string;
  /** Friendly connector name derived from connectorId e.g. "Microsoft Dataverse" */
  connectorName: string;
}