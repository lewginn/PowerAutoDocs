import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import type { ConnectionReferenceModel } from '../ir/connectionReference.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'connectionreference',
});

/**
 * Maps known connector API names to human-readable labels.
 * The connectorId ends with the API name e.g. "shared_commondataserviceforapps".
 */
const CONNECTOR_NAMES: Record<string, string> = {
  'shared_commondataserviceforapps': 'Microsoft Dataverse',
  'shared_commondataserviceforapps_1': 'Microsoft Dataverse',
  'shared_office365': 'Office 365 Outlook',
  'shared_office365users': 'Office 365 Users',
  'shared_sharepointonline': 'SharePoint Online',
  'shared_teams': 'Microsoft Teams',
  'shared_onedriveforbusiness': 'OneDrive for Business',
  'shared_azureblob': 'Azure Blob Storage',
  'shared_azurequeues': 'Azure Queues',
  'shared_servicebus': 'Azure Service Bus',
  'shared_sendgrid': 'SendGrid',
  'shared_smtp': 'SMTP',
  'shared_sql': 'SQL Server',
  'shared_azuread': 'Azure AD',
  'shared_keyvault': 'Azure Key Vault',
  'shared_approvals': 'Approvals',
  'shared_flowpush': 'Notifications',
  'shared_powerappsnotification': 'Power Apps Notification',
};

function resolveConnectorName(connectorId: string): string {
  // Extract the API name from the end of the path
  const parts = connectorId.split('/');
  const apiName = parts[parts.length - 1] ?? '';
  return CONNECTOR_NAMES[apiName] ?? apiName.replace(/^shared_/, '').replace(/_/g, ' ');
}

/**
 * Parses connection references from Other/Customizations.xml.
 * Returns empty array if the file doesn't exist or has no connection references.
 */
export function parseConnectionReferences(solutionRoot: string): ConnectionReferenceModel[] {
  const customizationsPath = path.join(solutionRoot, 'Other', 'Customizations.xml');
  if (!fs.existsSync(customizationsPath)) {
    console.log(`No Customizations.xml found at: ${customizationsPath}`);
    return [];
  }

  const xml = fs.readFileSync(customizationsPath, 'utf-8');
  const doc = xmlParser.parse(xml);

  const refs: any[] = doc?.['ImportExportXml']?.['connectionreferences']?.['connectionreference']
    ?? doc?.['connectionreferences']?.['connectionreference']
    ?? [];

  return refs
    .map(r => {
      const logicalName: string = r['@_connectionreferencelogicalname'] ?? '';
      const displayName: string = r['connectionreferencedisplayname'] ?? logicalName;
      const connectorId: string = r['connectorid'] ?? '';

      if (!logicalName) return null;

      return {
        logicalName,
        displayName,
        connectorId,
        connectorName: resolveConnectorName(connectorId),
      };
    })
    .filter((r): r is ConnectionReferenceModel => r !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}