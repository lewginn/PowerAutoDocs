// tests/fixtures/ir.ts
//
// Synthetic IR fixtures for renderer tests.
//
// Everything here describes a fictional "Acme Widgets" solution invented for the
// test suite. No fixture may be derived from a real client solution — see
// .claude/docs/constraints.md. Keep it that way: if you need a new shape, invent
// it rather than copying one out of unpacked/.
//
// There are deliberately two fixture layers, with two different invented names:
//
//   this file (Acme Widgets)              — IR objects, for renderer tests.
//                                           Renderers consume IR, so they need no XML.
//   tests/fixtures/solutions/ContosoDemo  — hand-authored solution XML on disk,
//                                           for parser tests. Parsers read paths.
//
// The names differ so it is obvious at a glance which side of the IR contract a
// test sits on. A renderer test must never need ContosoDemo, and a parser test
// must never need these factories — if one does, the layers have leaked.
//
// Each factory takes a Partial<> override so a test can state only the field it
// cares about, and the assertion stays readable:
//
//   aFlow({ actions: [anAction({ depth: 1 })] })

import type {
  BusinessRuleModel,
  ClassicWorkflowModel,
  ColumnModel,
  ConnectionReferenceModel,
  EmailTemplateModel,
  EntityPrivileges,
  EnvironmentVariableModel,
  FlowActionModel,
  FlowModel,
  FlowTriggerModel,
  FormModel,
  GlobalChoiceModel,
  ModelDrivenAppModel,
  PluginAssemblyModel,
  PluginStepModel,
  RelationshipModel,
  SecurityRoleModel,
  SolutionModel,
  TableModel,
  ViewModel,
  WebResourceModel,
} from '../../src/ir/index.js';

// -----------------------------------------------
// Tables
// -----------------------------------------------

export const aColumn = (over: Partial<ColumnModel> = {}): ColumnModel => ({
  logicalName: 'acme_widgetname',
  displayName: 'Widget Name',
  description: 'The name of the widget.',
  type: 'string',
  isRequired: false,
  isCustom: true,
  ...over,
});

export const aView = (over: Partial<ViewModel> = {}): ViewModel => ({
  name: 'Active Widgets',
  type: 'Public',
  columns: ['acme_widgetname', 'createdon'],
  description: 'All active widgets.',
  isDefault: true,
  isQuickFind: false,
  filters: [],
  ...over,
});

export const aForm = (over: Partial<FormModel> = {}): FormModel => ({
  name: 'Widget Main Form',
  type: 'Main',
  tabs: [{ label: 'General', sections: [{ label: 'Details', columns: ['acme_widgetname'] }] }],
  ...over,
});

export const aRelationship = (over: Partial<RelationshipModel> = {}): RelationshipModel => ({
  name: 'acme_widget_acme_part',
  type: 'OneToMany',
  referencingEntity: 'acme_part',
  referencedEntity: 'acme_widget',
  referencingAttribute: 'acme_widgetid',
  description: 'Parts belonging to a widget.',
  isCustom: true,
  ...over,
});

export const aTable = (over: Partial<TableModel> = {}): TableModel => ({
  logicalName: 'acme_widget',
  displayName: 'Widget',
  pluralDisplayName: 'Widgets',
  description: 'A thing Acme sells.',
  isCustom: true,
  isActivity: false,
  columns: [aColumn()],
  relationships: [],
  forms: [],
  views: [],
  ...over,
});

// -----------------------------------------------
// Flows
// -----------------------------------------------

export const aTrigger = (over: Partial<FlowTriggerModel> = {}): FlowTriggerModel => ({
  name: 'When a widget is created',
  type: 'DataverseCreate',
  entity: 'acme_widget',
  description: 'Runs when a Widget row is created.',
  ...over,
});

export const anAction = (over: Partial<FlowActionModel> = {}): FlowActionModel => ({
  name: 'Create a part',
  type: 'OpenApiConnection',
  operationId: 'CreateRecord',
  entityName: 'acme_part',
  description: 'Creates a Part row.',
  runAfter: [],
  depth: 0,
  ...over,
});

export const aFlow = (over: Partial<FlowModel> = {}): FlowModel => ({
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Create Part On Widget Create',
  category: 'ModernFlow',
  isActive: true,
  trigger: aTrigger(),
  actions: [anAction()],
  connectionReferences: [],
  ...over,
});

// -----------------------------------------------
// Plugins
// -----------------------------------------------

export const aPluginStep = (over: Partial<PluginStepModel> = {}): PluginStepModel => ({
  id: '22222222-2222-2222-2222-222222222222',
  name: 'WidgetPostOperation: Update of acme_widget',
  className: 'WidgetPostOperation',
  pluginTypeName: 'Acme.Widgets.Plugins.WidgetPostOperation',
  assemblyName: 'Acme.Widgets.Plugins',
  message: 'Update',
  primaryEntity: 'acme_widget',
  stage: 'PostOperation',
  mode: 'Synchronous',
  filteringAttributes: [],
  images: [],
  ...over,
});

export const aPluginAssembly = (over: Partial<PluginAssemblyModel> = {}): PluginAssemblyModel => ({
  assemblyName: 'Acme.Widgets.Plugins',
  version: '1.0.0.0',
  fileName: 'Acme.Widgets.Plugins.dll',
  isolationMode: 'Sandbox',
  pluginTypeNames: ['Acme.Widgets.Plugins.WidgetPostOperation'],
  steps: [aPluginStep()],
  ...over,
});

// -----------------------------------------------
// Web resources
// -----------------------------------------------

export const aWebResource = (over: Partial<WebResourceModel> = {}): WebResourceModel => ({
  id: '33333333-3333-3333-3333-333333333333',
  name: 'acme_/Scripts/Widget.js',
  displayName: 'Widget.js',
  resourceType: 'JavaScript',
  introducedVersion: '1.0.0.0',
  dependencies: [],
  fileName: 'Scripts/Widget.js',
  ...over,
});

// -----------------------------------------------
// Security roles
// -----------------------------------------------

export const aPrivilege = (over: Partial<EntityPrivileges> = {}): EntityPrivileges => ({
  entityName: 'Widget',
  entityLogicalName: 'acme_widget',
  create: 'Basic',
  read: 'Global',
  write: 'Basic',
  delete: 'None',
  append: 'Basic',
  appendTo: 'Basic',
  assign: 'None',
  share: 'None',
  ...over,
});

export const aSecurityRole = (over: Partial<SecurityRoleModel> = {}): SecurityRoleModel => ({
  id: '44444444-4444-4444-4444-444444444444',
  name: 'Widget Manager',
  isCustomizable: true,
  isAutoAssigned: false,
  privileges: [aPrivilege()],
  ...over,
});

// -----------------------------------------------
// Business rules
// -----------------------------------------------

export const aBusinessRule = (over: Partial<BusinessRuleModel> = {}): BusinessRuleModel => ({
  id: '55555555-5555-5555-5555-555555555555',
  name: 'Require Serial For Premium Widgets',
  entity: 'acme_widget',
  status: 'active',
  scope: 'allForms',
  conditions: [
    {
      conditionField: 'acme_tier',
      description: 'Tier is Premium',
      thenActions: [{ type: 'setRequired', field: 'acme_serial' }],
      elseActions: [{ type: 'setOptional', field: 'acme_serial' }],
    },
  ],
  ...over,
});

// -----------------------------------------------
// Classic workflows
// -----------------------------------------------

export const aClassicWorkflow = (over: Partial<ClassicWorkflowModel> = {}): ClassicWorkflowModel => ({
  id: '66666666-6666-6666-6666-666666666666',
  name: 'Stamp Widget Approval',
  entity: 'acme_widget',
  category: 'workflow',
  mode: 'background',
  scope: 'organization',
  runAs: 'owner',
  status: 'active',
  triggers: { onCreate: true, onUpdate: false, onDelete: false, onDemand: false, updateFields: [] },
  steps: [{ name: 'Update Widget', type: 'update', entity: 'acme_widget', setFields: ['acme_approved'] }],
  ...over,
});

// -----------------------------------------------
// Global choices
// -----------------------------------------------

export const aGlobalChoice = (over: Partial<GlobalChoiceModel> = {}): GlobalChoiceModel => ({
  schemaName: 'acme_widgettier',
  displayName: 'Widget Tier',
  description: 'How premium a widget is.',
  optionSetType: 'picklist',
  isGlobal: true,
  options: [
    { value: 100000000, label: 'Standard', description: '', isHidden: false, externalValue: '' },
    { value: 100000001, label: 'Premium', description: 'Costs more.', isHidden: false, externalValue: 'PREM' },
  ],
  ...over,
});

// -----------------------------------------------
// Email templates
// -----------------------------------------------

export const anEmailTemplate = (over: Partial<EmailTemplateModel> = {}): EmailTemplateModel => ({
  id: '77777777-7777-7777-7777-777777777777',
  title: 'Widget Shipped',
  description: 'Sent when a widget ships.',
  targetEntity: 'acme_widget',
  templateTypeCode: 1,
  subject: 'Your widget {acme_widgetname} has shipped',
  body: 'Hello {firstname}, your widget is on its way.',
  dynamicFields: ['acme_widgetname', 'firstname'],
  languageCode: 1033,
  isCustomizable: true,
  ...over,
});

// -----------------------------------------------
// Connection references
// -----------------------------------------------

export const aConnectionReference = (
  over: Partial<ConnectionReferenceModel> = {},
): ConnectionReferenceModel => ({
  logicalName: 'acme_sharedcommondataserviceforapps_a1b2c',
  displayName: 'Microsoft Dataverse AcmeWidgets-a1b2c',
  connectorId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps',
  connectorName: 'Microsoft Dataverse',
  ...over,
});

// -----------------------------------------------
// Environment variables
// -----------------------------------------------

export const anEnvironmentVariable = (
  over: Partial<EnvironmentVariableModel> = {},
): EnvironmentVariableModel => ({
  schemaName: 'acme_ApiBaseUrl',
  displayName: 'API Base URL',
  description: 'Base URL for the Acme parts API.',
  type: 'String',
  defaultValue: 'https://example.invalid/api',
  currentValue: undefined,
  isRequired: true,
  secretStore: 0,
  ...over,
});

// -----------------------------------------------
// Model-driven apps
// -----------------------------------------------

export const aModelDrivenApp = (over: Partial<ModelDrivenAppModel> = {}): ModelDrivenAppModel => ({
  uniqueName: 'acme_WidgetHub',
  displayName: 'Widget Hub',
  description: 'Manage widgets and parts.',
  isActive: true,
  formFactor: 'Web',
  customEntities: ['acme_widget'],
  standardEntities: ['account'],
  roleCount: 2,
  appSettings: [],
  ...over,
});

// -----------------------------------------------
// Solution
// -----------------------------------------------

export const aSolution = (over: Partial<SolutionModel> = {}): SolutionModel => ({
  uniqueName: 'AcmeWidgets',
  displayName: 'Acme Widgets',
  version: '1.0.0.0',
  isManaged: false,
  publisher: { uniqueName: 'acme', displayName: 'Acme Corp', prefix: 'acme' },
  tables: [aTable()],
  ...over,
});
