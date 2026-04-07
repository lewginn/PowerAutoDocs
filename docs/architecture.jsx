import { useState } from "react";

const moscow = {
  M: { label: "MUST", color: "#dc2626", bg: "#fef2f2" },
  S: { label: "SHOULD", color: "#d97706", bg: "#fffbeb" },
  C: { label: "COULD", color: "#2563eb", bg: "#eff6ff" },
  W: { label: "WON'T", color: "#9ca3af", bg: "#f9fafb" },
};

const layers = [
  {
    id: "input",
    label: "01 — INPUT LAYER",
    color: "#2563eb",
    bg: "#eff6ff",
    description: "What we consume from the Git repo",
    components: [
      { name: "Solution ZIPs", icon: "📦", detail: "Unpacked via pac CLI before the tool runs. Contains all component folders, solution.xml, relationships.", tags: ["XML", "pac CLI"], done: true, moscow: "M" },
      { name: "Flat XML Exports", icon: "🗂️", detail: "Pre-extracted XML files per component. Entities, forms, views, saved queries, relationships all parsed.", tags: ["XML", "Structured"], done: true, moscow: "M" },
      { name: "Power Automate Flows", icon: "🔄", detail: "Flow JSON exported with solution. Trigger, actions, nested conditions, Scope/Foreach/Switch all extracted into FlowModel IR with depth and parentName tracking.", tags: ["JSON"], done: true, moscow: "S" },
      { name: "Classic Workflows & Business Rules", icon: "⚡", detail: "XAML-based workflows and business rules from Workflows/ folder. Supports both _xaml_data.xml and .xaml.data.xml naming conventions. Category=0 → classic workflow, Category=2 → business rule.", tags: ["XAML", "XML"], done: true, moscow: "S" },
      { name: "Plugins & Assemblies", icon: "⚙️", detail: "Plugin step registrations from solution XML. Assembly metadata, entity/message/stage bindings.", tags: ["C#", "XML"], done: true, moscow: "S" },
      { name: "Web Resources (JS)", icon: "📜", detail: "JavaScript files from WebResources folder. JSDoc comments, function signatures, namespace detection extracted per file.", tags: ["JS", "XML"], done: true, moscow: "S" },
      { name: "Security Role XML", icon: "🔐", detail: "Role XML from Roles/ folder. RolePrivilege entries with level (Global/Deep/Local/Basic) per entity. Absent = None. Filtered to publisher prefix custom entities only.", tags: ["XML"], done: true, moscow: "S" },
      { name: "Environment Variable Definitions", icon: "🌍", detail: "EnvironmentVariableDefinitions/ folder. One subfolder per variable with environmentvariabledefinition.xml and optional environmentvariablevalues.json for current value.", tags: ["XML", "JSON"], done: true, moscow: "S" },
      { name: "Global Choices (OptionSets)", icon: "🎛️", detail: "OptionSets/ folder. One XML file per global option set. Filtered to publisher prefix. Options with value, label, isHidden, externalValue.", tags: ["XML"], done: true, moscow: "S" },
      { name: "Connection References", icon: "🔗", detail: "Embedded in Other/Customizations.xml under <connectionreferences>. Logical name, display name, connector ID path. Connector name resolved from API name via lookup map.", tags: ["XML"], done: true, moscow: "S" },
      { name: "Email Templates", icon: "📧", detail: "Templates/ folder → EmailTemplates.xml (metadata) + EmailDocuments/{languageCode}/{guid}/subject.xsl + body.xsl. Subject and body reconstructed as plain text with {fieldName} placeholders interleaved in document order.", tags: ["XML"], done: true, moscow: "C" },
      { name: "Model-Driven Apps", icon: "📱", detail: "AppModules/{uniqueName}/AppModule.xml. Entity references (type=1), role mappings, app settings, display name from LocalizedNames.", tags: ["XML"], done: true, moscow: "C" },
      { name: "PCF Controls", icon: "🧩", detail: "Power Apps Component Framework controls unpacked from solution. Manifest, component metadata extracted.", tags: ["JSON", "XML"], done: false, moscow: "C" },
      { name: "Business Process Flows", icon: "🔁", detail: "BPF definitions from solution XML. Stages, steps, entity scope and activated state.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Duplicate Detection Rules", icon: "🔍", detail: "DuplicateRule XML. Match conditions, base/matching entity, field comparisons.", tags: ["XML"], done: false, moscow: "C" },
      { name: "SLAs", icon: "⏱️", detail: "SLA and SLA Item definitions. KPI fields, warning/failure actions, applicable entity.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Dashboards", icon: "📊", detail: "SystemForm type=0 (dashboard). Component layout, chart and view references.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Column Security Profiles", icon: "🔒", detail: "FieldSecurityProfile XML. Per-column read/update/create permissions per profile.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Service Endpoints", icon: "🔌", detail: "ServiceEndpoint XML. Azure Service Bus, webhooks, event hub connections.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Routing Rule Sets", icon: "📨", detail: "RoutingRule XML. Case routing conditions, queue assignments.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Custom Connectors", icon: "🔗", detail: "Custom connector definitions for Power Platform. API base URL, authentication, actions/triggers.", tags: ["JSON", "XML"], done: false, moscow: "S" },
      { name: "Power Pages", icon: "🌐", detail: "Portal/Power Pages site definitions. Pages, web templates, entity forms, entity lists, site settings.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Canvas App Source", icon: "🎨", detail: "Unpacked .msapp source. Reads screens, controls, formulas.", tags: ["JSON", "Optional"], done: false, moscow: "W" },
    ]
  },
  {
    id: "parser",
    label: "02 — PARSER LAYER",
    color: "#7c3aed",
    bg: "#f5f3ff",
    description: "Typed extractors — one per source type, all emit IR objects",
    components: [
      { name: "Solution Manifest Parser", icon: "🔍", detail: "Reads Other/solution.xml. Extracts unique name, display name, version, managed flag, publisher and customization prefix. Runs for all solutions regardless of role.", tags: ["Core"], done: true, moscow: "M" },
      { name: "Entity / Table Parser", icon: "🗃️", detail: "Extracts table schema: columns, types, required flags, isCustom detection, maxLength, lookup targets. Base currency field filtering.", tags: ["Core"], done: true, moscow: "M" },
      { name: "View Parser", icon: "👁️", detail: "Parses SavedQuery XML. View type detection, columns, filter conditions including nested link-entity joins with depth tracking and alias resolution.", tags: ["Core"], done: true, moscow: "M" },
      { name: "Form Parser", icon: "📋", detail: "Parses FormXml for Main, Quick Create and Card forms. Extracts tabs, sections, fields and header fields. Inactive forms skipped.", tags: ["Core"], done: true, moscow: "M" },
      { name: "Relationship Parser", icon: "↔️", detail: "Reads Other/Relationships XML files. OneToMany resolved from both perspectives. Custom vs standard detection. Direction-aware rendering.", tags: ["Core"], done: true, moscow: "M" },
      { name: "Flow / Workflow Parser", icon: "🔄", detail: "Modern flows from JSON. RecordSelected, Webhook, Manual, Scheduled triggers. Recursive action tree walker with depth + parentName + branch tracking (Yes/No). Expression serialiser for If conditions. Enriched descriptions for Foreach/Switch.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Classic Workflow Parser", icon: "⚡", detail: "XAML walker for Category=0 workflows. Extracts trigger config, ConditionSequence steps with branch actions (update, terminate, nested conditions). Supports both pac CLI naming conventions.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Business Rule Parser", icon: "📐", detail: "XAML walker for Category=2 rules. Extracts condition field, if/else branches as two sibling ConditionBranch nodes. Captures SetVisibility, SetFieldRequiredLevel, SetAttributeValue actions per branch. Description from x:String x:Key=Description.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Plugin Parser", icon: "🔌", detail: "Plugin assemblies and SDK message processing steps. Entity, message, stage, order, filter expressions.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Web Resource Analyser", icon: "📜", detail: "Walks WebResources/ folder, finds *.data.xml files. Strips .data.xml to find sibling JS source. Extracts namespace, functions (object literal, declarations, arrow), async flag, params, JSDoc.", tags: ["JS"], done: true, moscow: "S" },
      { name: "Security Role Parser", icon: "🔐", detail: "Walks Roles/ folder. Parses RolePrivilege entries, maps Global/Deep/Local/Basic/None levels. Filters to publisher prefix entities. Absent privilege = None. Preserves original entity casing from first occurrence.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Environment Variable Parser", icon: "🌍", detail: "Walks EnvironmentVariableDefinitions/ subfolders. Parses definition XML for type, default, required, secret store. Reads optional values JSON for current value. Type codes mapped: 100000000=String, 100000001=Number, 100000002=Boolean, 100000003=JSON, 100000010=DataSource.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Global Choice Parser", icon: "🎛️", detail: "Walks OptionSets/ folder. Filters to publisher prefix files. Parses options with value, label (1033), isHidden, externalValue. Type from OptionSetType element (picklist/bool/status/state).", tags: ["Core"], done: true, moscow: "S" },
      { name: "Connection Reference Parser", icon: "🔗", detail: "Reads Other/Customizations.xml, extracts <connectionreferences> block. Maps connector API name to friendly label via lookup (Dataverse, Office 365, SharePoint, Teams etc). Sorted by display name.", tags: ["Core"], done: true, moscow: "S" },
      { name: "Email Template Parser", icon: "📧", detail: "Parses EmailTemplates.xml for metadata. Reads subject.xsl and body.xsl per template, interleaves CDATA text and xsl:value-of selects in document order. Language code mapped to display name.", tags: ["Core"], done: true, moscow: "C" },
      { name: "Model-Driven App Parser", icon: "📱", detail: "Walks AppModules/ subfolders, reads AppModule.xml per app. Extracts display name, description, statecode, FormFactor. Splits entities into custom vs standard. Counts role mappings and extracts app settings.", tags: ["Core"], done: true, moscow: "C" },
      { name: "PCF Parser", icon: "🧩", detail: "Reads ControlManifest.xml. Extracts component name, properties, data types.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Business Process Flow Parser", icon: "🔁", detail: "Parses BPF workflow XML. Stages with steps, entity scope, activated state.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Duplicate Detection Rule Parser", icon: "🔍", detail: "Parses DuplicateRule XML. Match conditions, base/matching entity, field comparison operators.", tags: ["XML"], done: false, moscow: "C" },
      { name: "SLA Parser", icon: "⏱️", detail: "Parses SLA and SLA Item XML. KPI name, warning/failure times and actions, applicable entity.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Dashboard Parser", icon: "📊", detail: "Parses SystemForm type=0 XML. Dashboard name, layout sections, embedded chart/view references.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Column Security Profile Parser", icon: "🔒", detail: "Parses FieldSecurityProfile XML. Profile name, field permissions (read/update/create) per column.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Service Endpoint Parser", icon: "🔌", detail: "Parses ServiceEndpoint XML. Endpoint name, type (Service Bus/webhook/event hub), connection details.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Routing Rule Set Parser", icon: "📨", detail: "Parses RoutingRule XML. Rule name, conditions, queue assignments, applicable entity.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Custom Connector Parser", icon: "🔗", detail: "Parses custom connector JSON/XML. Base URL, auth type, operations list.", tags: ["JSON", "XML"], done: false, moscow: "S" },
      { name: "Power Pages Parser", icon: "🌐", detail: "Parses Power Pages/Portal XML. Pages, web templates, entity forms, entity lists, site settings.", tags: ["XML"], done: false, moscow: "C" },
    ]
  },
  {
    id: "ir",
    label: "03 — IR LAYER",
    color: "#9333ea",
    bg: "#faf5ff",
    description: "Intermediate Representation — domain-split TypeScript interfaces, single source of truth",
    components: [
      { name: "SolutionModel", icon: "🏗️", detail: "Top-level container. Publisher, version, managed flag, customization prefix. Tables attached post-parse.", tags: ["ir/solution.ts"], done: true, moscow: "M" },
      { name: "TableModel + ColumnModel", icon: "📊", detail: "Schema, columns with ColumnType union, isCustom flags, relationships, forms, views all nested.", tags: ["ir/table.ts"], done: true, moscow: "M" },
      { name: "FormModel + ViewModel", icon: "🖼️", detail: "Forms with tabs/sections/fields. Views with typed filter conditions, nested join support, isDefault/isQuickFind flags.", tags: ["ir/form.ts", "ir/view.ts"], done: true, moscow: "M" },
      { name: "RelationshipModel", icon: "↔️", detail: "OneToMany with referencing/referenced entity, lookup field, direction perspective, isCustom flag.", tags: ["ir/relationship.ts"], done: true, moscow: "M" },
      { name: "FlowModel", icon: "🔀", detail: "Trigger (type, entity, description, filterAttributes), FlowActionModel with depth/parentName/runAfter/description. mermaidDiagram string attached at parse time.", tags: ["ir/flow.ts"], done: true, moscow: "S" },
      { name: "ClassicWorkflowModel", icon: "⚡", detail: "Trigger config (onCreate/onUpdate/onDelete/onDemand, updateFields), mode (realtime/background), scope, runAs. Steps with type/entity/conditionFields/setFields/thenSteps.", tags: ["ir/classicWorkflow.ts"], done: true, moscow: "S" },
      { name: "BusinessRuleModel", icon: "📐", detail: "Entity, scope (specificForm/allForms/entity), status. Conditions with conditionField, description, thenActions and elseActions. Actions typed as show/hide/setRequired/setOptional/clearValue.", tags: ["ir/businessRule.ts"], done: true, moscow: "S" },
      { name: "PluginAssemblyModel", icon: "🔌", detail: "Assembly, plugin type names, step registrations with entity + message + stage + order.", tags: ["ir/plugin.ts"], done: true, moscow: "S" },
      { name: "WebResourceModel", icon: "📜", detail: "Per-file model. resourceType, namespace, functions with JSDoc, async flag, params.", tags: ["ir/webresource.ts"], done: true, moscow: "S" },
      { name: "SecurityRoleModel", icon: "🔐", detail: "Role name, id, isAutoAssigned, isCustomizable. EntityPrivileges array with all 8 operations (create/read/write/delete/append/appendTo/assign/share) as PrivilegeLevel union.", tags: ["ir/securityRole.ts"], done: true, moscow: "S" },
      { name: "EnvironmentVariableModel", icon: "🌍", detail: "schemaName, displayName, description, type (String/Number/Boolean/JSON/DataSource), defaultValue, currentValue (optional), isRequired, secretStore.", tags: ["ir/environmentVariable.ts"], done: true, moscow: "S" },
      { name: "GlobalChoiceModel", icon: "🎛️", detail: "schemaName, displayName, description, optionSetType, isGlobal. Options array with value, label, description, isHidden, externalValue.", tags: ["ir/globalChoice.ts"], done: true, moscow: "S" },
      { name: "ConnectionReferenceModel", icon: "🔗", detail: "logicalName, displayName, connectorId (full path), connectorName (friendly label).", tags: ["ir/connectionReference.ts"], done: true, moscow: "S" },
      { name: "EmailTemplateModel", icon: "📧", detail: "id, title, description, targetEntity, subject and body as plain text with {fieldName} placeholders, dynamicFields[], languageCode, isCustomizable.", tags: ["ir/emailTemplate.ts"], done: true, moscow: "C" },
      { name: "ModelDrivenAppModel", icon: "📱", detail: "uniqueName, displayName, description, isActive, formFactor, customEntities[], standardEntities[], roleCount, appSettings[].", tags: ["ir/modelDrivenApp.ts"], done: true, moscow: "C" },
      { name: "PCFModel", icon: "🧩", detail: "Component manifest metadata, property definitions, data types.", tags: ["ir/pcf.ts"], done: false, moscow: "C" },
      { name: "BusinessProcessFlowModel", icon: "🔁", detail: "BPF name, entity, isActivated, stages with steps and required fields.", tags: ["ir/bpf.ts"], done: false, moscow: "S" },
      { name: "DuplicateDetectionRuleModel", icon: "🔍", detail: "Rule name, base/matching entity, match conditions with field and operator.", tags: ["ir/duplicateRule.ts"], done: false, moscow: "C" },
      { name: "SLAModel", icon: "⏱️", detail: "SLA name, entity, isDefault. Items with KPI name, warning/failure durations and actions.", tags: ["ir/sla.ts"], done: false, moscow: "C" },
      { name: "DashboardModel", icon: "📊", detail: "Dashboard name, layout sections, embedded chart and view references.", tags: ["ir/dashboard.ts"], done: false, moscow: "C" },
      { name: "ColumnSecurityProfileModel", icon: "🔒", detail: "Profile name, field permissions array (fieldName, canRead, canUpdate, canCreate).", tags: ["ir/columnSecurityProfile.ts"], done: false, moscow: "S" },
      { name: "ServiceEndpointModel", icon: "🔌", detail: "Endpoint name, type (ServiceBus/WebHook/EventHub), namespace, contract.", tags: ["ir/serviceEndpoint.ts"], done: false, moscow: "C" },
      { name: "RoutingRuleSetModel", icon: "📨", detail: "Rule set name, entity, rule items with conditions and target queue.", tags: ["ir/routingRule.ts"], done: false, moscow: "S" },
      { name: "CustomConnectorModel", icon: "🔗", detail: "Connector name, base URL, auth type, operations list.", tags: ["ir/customConnector.ts"], done: false, moscow: "S" },
      { name: "PowerPagesModel", icon: "🌐", detail: "Site name, pages, web templates, entity forms, entity lists, site settings.", tags: ["ir/powerPages.ts"], done: false, moscow: "C" },
    ]
  },
  {
    id: "enrichment",
    label: "04 — ENRICHMENT LAYER",
    color: "#059669",
    bg: "#ecfdf5",
    description: "Cross-cutting analysis — diagrams, metrics, change detection",
    components: [
      { name: "Mermaid ER Diagram Generator", icon: "🗺️", detail: "Generates erDiagram from TableModels and RelationshipModels. Filters to custom entities via publisher prefix. Two-tier exclusion: excludeStandardRelationships flag kills all OOB noise; erd.excludeEntities/excludeRelationships config for per-solution fine-tuning. Self-referential edges skipped. Entity names SafeMermaidName-encoded. ADO :::mermaid fence.", tags: ["Diagram"], done: true, moscow: "S" },
      { name: "Mermaid Flow Generator", icon: "📈", detail: "Recursive action tree walker. flowchart TD with ADO :::mermaid syntax. Node shapes per type (If=diamond, Scope=subroutine, Foreach=loop, Terminate=circle). Yes/No edge labels, ⚠ Error path for Catch. Compatible with ADO Mermaid v8.14.", tags: ["Diagram"], done: true, moscow: "S" },
      { name: "Expression Serialiser", icon: "🔣", detail: "Converts Power Automate condition expression objects into human-readable strings. Handles and/or/not, equals/greater/less, contains, startsWith. Cleans @outputs()/@triggerBody() references to field names.", tags: ["Analysis"], done: true, moscow: "S" },
      { name: "Dependency Resolver", icon: "🔗", detail: "Resolves plugin → entity, flow → table links. Surfaces in docs as 'Used By' / 'Related' sections.", tags: ["Analysis"], done: false, moscow: "C" },
      { name: "Complexity Scorer", icon: "📏", detail: "Flags high-complexity flows/plugins. Highlights what needs most attention in handover docs.", tags: ["Analysis"], done: false, moscow: "C" },
      { name: "Change Detector", icon: "📝", detail: "Git diff between commits → 'What changed since last release'. Generates change log wiki pages.", tags: ["Optional"], done: false, moscow: "C" },
    ]
  },
  {
    id: "output",
    label: "05 — OUTPUT LAYER",
    color: "#e11d48",
    bg: "#fff1f2",
    description: "Pluggable renderers — swap or combine without touching parsers or IR",
    components: [
      { name: "Markdown Renderer", icon: "✍️", detail: "Primary output. All renderers emit markdown strings directly — string builder pattern with markdownTable() helper. toADOWikiLink() encodes all internal links (spaces→hyphens, parens escaped, hyphens→%2D). [[_TOSP_]] on container pages only.", tags: ["Primary"], done: true, moscow: "M" },
      { name: "ADO Wiki Publisher", icon: "🌐", detail: "Azure DevOps REST API. Creates/updates wiki pages in correct hierarchy. Top-down parent creation. Page name sanitisation via s() helper. Auth pre-validation. Z→A publish order for A→Z sidebar display.", tags: ["ADO"], done: true, moscow: "S" },
      { name: "Word Renderer", icon: "📄", detail: "DocNode format-agnostic document model layer (src/docmodel/nodes.ts). Renderers emit DocNode[] via MarkdownSerializer (ADO Wiki) or DocxSerializer (Word). DocxSerializer → docx library: A4 page, proportional fixed-width column tables, TOC, page-number footer. Output controlled by output.word in config or --word CLI flag. Mermaid skipped in Word (ADO-only).", tags: ["Optional"], done: true, moscow: "C" },
      { name: "PDF Renderer", icon: "📑", detail: "Standalone PDF output separate from Word. Would reuse the DocNode layer — needs a headless rendering strategy (e.g. Puppeteer, Playwright, or a dedicated PDF library). Deferred: Word covers the primary use case.", tags: ["Optional"], done: false, moscow: "W" },
      { name: "Confluence Renderer", icon: "🔵", detail: "Same IR → Confluence storage format. For clients not on ADO. Low priority — most clients use ADO.", tags: ["Optional"], done: false, moscow: "W" },
    ]
  },
  {
    id: "pipeline",
    label: "06 — PIPELINE LAYER",
    color: "#0891b2",
    bg: "#ecfeff",
    description: "Azure DevOps YAML + npm package — reusable across all client projects",
    components: [
      { name: "ADO Pipeline YAML", icon: "🏭", detail: "Manual trigger pipeline. Node 20, npx powerautodocs@latest. PAT injected at runtime via sed into doc-gen.config.yml. WIKI_PAT secret variable. Tested end-to-end on live solutions.", tags: ["ADO YAML"], done: true, moscow: "S" },
      { name: "doc-gen.config.yml", icon: "⚙️", detail: "Per-project config. Multi-solution support. output.wiki / output.word booleans control output modes. components toggles control what gets rendered. Wiki org/project/identifier/parentPath. PAT field REDACTED for safe commit, injected at runtime via sed. Comprehensive inline comments for end-user setup.", tags: ["Config"], done: true, moscow: "M" },
      { name: "npm Package (powerautodocs)", icon: "📦", detail: "Published as powerautodocs on npmjs.com. GitHub repo: lewginn/PowerAutoDocs. Granular Access Token with bypass-2FA. Shebang entry point via scripts/addShebang.mjs (cross-platform). prepublishOnly build step. Node >=18 requirement. Renamed from powerautodoc to avoid accidental client data exposure in earlier versions.", tags: ["npm"], done: true, moscow: "M" },
      { name: "Run Logger + Summary", icon: "📋", detail: "src/logger.ts — structured console output with symbols (✓/✗/⚠/→). Per-solution section headers, per-component counts. End-of-run summary with solutions processed/skipped, parse warnings, pages published, publish failures. Exit code 1 on any hard failure — ADO pipeline marks step as failed.", tags: ["DX"], done: true, moscow: "S" },
      { name: "GitHub Actions npm Publish", icon: "🚀", detail: "npm-publish.yml workflow. Triggers on GitHub Release created. Runs npm ci → npm run build → npm publish. NODE_AUTH_TOKEN from NPM_TOKEN repo secret. Replaces manual npm publish from local machine.", tags: ["CI/CD"], done: true, moscow: "S" },
      { name: "Trigger Strategy", icon: "⚡", detail: "Currently manual trigger only. Push to main, scheduled nightly options planned.", tags: ["Trigger"], done: false, moscow: "S" },
      { name: "IR Artifact Store", icon: "💾", detail: "IR JSON snapshot published as pipeline artifact. Enables diffing, debugging, re-runs from cache.", tags: ["Artefact"], done: false, moscow: "C" },
    ]
  }
];

const pages = [
  { emoji: "🏠", name: "Solution Overview", desc: "Publisher, version, managed/unmanaged, component counts per solution, solutions table", done: true, moscow: "M" },
  { emoji: "🗺️", name: "ER Diagram", desc: "Auto-generated Mermaid erDiagram on the Data Model summary page. Custom entities only (publisher prefix filtered). Configurable exclusions via erd.excludeEntities and erd.excludeRelationships.", done: true, moscow: "S" },
  { emoji: "📋", name: "Table Pages", desc: "Index page + subpages: Columns, Views, Forms, Relationships, Business Rules (always emitted, shows empty state if none)", done: true, moscow: "M" },
  { emoji: "🔄", name: "Automation / Flows", desc: "Flow summary + per-flow pages with trigger, nested action list with ✓/✗ branch markers, Mermaid flowchart", done: true, moscow: "S" },
  { emoji: "⚡", name: "Classic Workflows", desc: "Summary index + per-workflow pages with trigger config, condition steps and branch actions", done: true, moscow: "S" },
  { emoji: "📐", name: "Business Rules", desc: "Per-table subpages with if/else branch logic, show/hide/required/clear actions grouped by type. Individual rule per page.", done: true, moscow: "S" },
  { emoji: "🔌", name: "Plugins", desc: "Plugin assemblies, step registrations, entity/message/stage bindings", done: true, moscow: "S" },
  { emoji: "📜", name: "Web Resources", desc: "JS files with function index, namespace, JSDoc, event handlers vs helpers split. Linked summary table.", done: true, moscow: "S" },
  { emoji: "🔐", name: "Security", desc: "Security container page → Security Roles subpage → per-role privilege matrix with ●○ dot levels. Structured for future additions (column security profiles etc).", done: true, moscow: "S" },
  { emoji: "🌍", name: "Integrations / Env Vars", desc: "Environment variables with type, default value, current value, secret store indicator. Configurable column visibility.", done: true, moscow: "S" },
  { emoji: "🎛️", name: "Global Choices", desc: "Solution-level option sets. Index with option count + per-choice pages with full value/label table.", done: true, moscow: "S" },
  { emoji: "🔗", name: "Integrations / Connection Refs", desc: "Connection references with friendly connector names and logical names. Sits alongside Environment Variables under Integrations.", done: true, moscow: "S" },
  { emoji: "📧", name: "Email Templates", desc: "Index with subject preview + per-template pages with subject, plain text body with {fieldName} placeholders, and dynamic fields list.", done: true, moscow: "C" },
  { emoji: "📱", name: "Model-Driven Apps", desc: "Index + per-app pages with metadata, app settings, custom and standard entity lists in 3-column table.", done: true, moscow: "C" },
  { emoji: "🧩", name: "PCF Controls", desc: "Component manifest, properties, data types", done: false, moscow: "C" },
  { emoji: "📝", name: "Change Log", desc: "What changed per release — git-diff driven, auto-generated", done: false, moscow: "C" },
  { emoji: "🔁", name: "Business Process Flows", desc: "BPF index + per-flow pages with stages, steps and entity scope", done: false, moscow: "S" },
  { emoji: "🔒", name: "Column Security Profiles", desc: "Profile index under Security section + per-profile field permission matrix", done: false, moscow: "S" },
  { emoji: "🔍", name: "Duplicate Detection Rules", desc: "Rules index + per-rule match conditions", done: false, moscow: "C" },
  { emoji: "⏱️", name: "SLAs", desc: "SLA index + per-SLA pages with KPIs and warning/failure actions", done: false, moscow: "C" },
  { emoji: "📊", name: "Dashboards", desc: "Dashboard index + per-dashboard component list", done: false, moscow: "C" },
  { emoji: "🔌", name: "Service Endpoints", desc: "Endpoint index with type and connection details under Integrations", done: false, moscow: "C" },
  { emoji: "📨", name: "Routing Rule Sets", desc: "Rule set index + per-rule conditions and queue assignments", done: false, moscow: "S" },
  { emoji: "🔗", name: "Custom Connectors", desc: "Connector index + per-connector operations list", done: false, moscow: "S" },
  { emoji: "🌐", name: "Power Pages", desc: "Site overview, pages, web templates, entity forms and lists", done: false, moscow: "C" },
];

const decisions = [
  { q: "Language / Runtime?", a: "TypeScript / Node.js", reason: "Typed IR interfaces catch errors at compile time. Pure TypeScript string builders mean no templating engine dependency. NodeNext module resolution for ESM compatibility. tsx for fast local iteration without a build step." },
  { q: "Core architecture?", a: "IR-based pipeline", reason: "Parsers only produce IR. Renderers only consume IR. Neither knows about the other. This separation means output formats (markdown, Word, Confluence) can be swapped or added without touching any parser. The IR is the contract between the two halves of the system." },
  { q: "How reusable across clients?", a: "npm package + ADO pipeline template", reason: "powerautodocs published to npmjs.com — clients run npx powerautodocs@latest with no local install. Client projects only need doc-gen.config.yml and a pipeline YAML. GitHub Actions workflow auto-publishes to npm on each GitHub Release, removing manual publish steps." },
  { q: "Multi-solution projects?", a: "Config-driven merge", reason: "doc-gen.config.yml lists multiple solutions. Each is parsed independently then merged into a single IR before rendering. Every solution is scanned for everything — the components config controls what gets rendered, not what gets parsed. Solution role concept was removed as unnecessary complexity." },
  { q: "Flow action rendering?", a: "Nested markdown list", reason: "Flows have a natural tree structure. A flat table format fought against this. Nested bullet list with ✓/✗ branch markers renders the hierarchy naturally. The Mermaid diagram owns the visual representation — the action list owns the detail." },
  { q: "Mermaid in ADO Wiki?", a: ":::mermaid fence, pinned to v8.14", reason: "ADO Wiki uses ::: delimiters, not backtick fences. Pinned to Mermaid v8.14 for compatibility — newer node shapes like {{}} are not supported. Trigger nodes use stadium shape, Terminate uses circle. erDiagram used for ERD with empty entity blocks (no columns by design)." },
  { q: "ERD entity filtering?", a: "Two-tier: prefix + explicit overrides", reason: "excludeStandardRelationships:true automatically filters to custom entities via publisher prefix — eliminates ownerid/systemuser/businessunit noise in one setting. erd.excludeEntities and erd.excludeRelationships in config.yml for per-solution fine-tuning of remaining noise." },
  { q: "Error handling strategy?", a: "Skip-and-continue with run summary", reason: "A single bad solution path should not kill the entire run. Each solution is wrapped in try/catch — failures are recorded and the run continues. End-of-run summary shows processed/skipped counts, parse warnings and publish failures. Exit code 1 on any failure so ADO marks the step red." },
  { q: "File casing on Linux?", a: "Capitalised filenames (Solution.xml)", reason: "pac CLI on Windows produces capitalised filenames (Solution.xml, Customizations.xml). macOS is case-insensitive so lowercase references worked locally. ADO agents run Ubuntu — Linux is case-sensitive and lowercase references failed silently. Standardised all filename references to match pac CLI output." },
  { q: "Package name?", a: "powerautodocs (renamed from powerautodoc)", reason: "Original package powerautodoc was published with client references in source file comments. npm does not allow full package deletion after 72 hours. Renamed to powerautodocs on a clean repository (lewginn/PowerAutoDocs) with no client data in history. Old package deprecated." },
  { q: "Security page structure?", a: "Security container → sublevel pages", reason: "Security is a container page with [[_TOSP_]]. Security Roles is a sublevel — not the top page itself — leaving room for Column Security Profiles and other future additions without restructuring the wiki hierarchy." },
  { q: "Word output?", a: "DocNode layer + DocxSerializer", reason: "Renderers now emit DocNode[] (format-agnostic). MarkdownSerializer converts to ADO Wiki markdown; DocxSerializer converts to docx Paragraph/Table elements. A4 fixed-width tables (TableLayoutType.FIXED + DXA column widths) ensure consistent rendering in Word and Word Online. Output mode controlled by output.word in config.yml or --word CLI flag. Mermaid blocks skipped in Word — ADO-only rendering." },
  { q: "PDF output?", a: "Treated as a separate future feature", reason: "PDF rendering requires a different approach to Word (headless browser or dedicated PDF library) and has different use cases. Splitting them avoids conflating two distinct delivery formats. Word covers the primary client use case. PDF deferred." },
];

const progress = [
  {
    phase: "Phase 1 — Core Data Model", color: "#2563eb", status: "COMPLETE",
    items: [
      { label: "Solution manifest parser", done: true },
      { label: "Entity / table parser", done: true },
      { label: "Column type mapping + filtering", done: true },
      { label: "Relationship parser (1:N)", done: true },
      { label: "IR models split by domain", done: true },
      { label: "Barrel exports (parsers + renderers)", done: true },
      { label: "Config system with defaults", done: true },
      { label: "Markdown renderer", done: true },
      { label: "Solution overview page", done: true },
      { label: "Per-table documentation pages", done: true },
    ]
  },
  {
    phase: "Phase 2 — Forms, Views & Filters", color: "#7c3aed", status: "COMPLETE",
    items: [
      { label: "Form parser (Main, Quick Create, Card)", done: true },
      { label: "View parser with type detection", done: true },
      { label: "View filter condition extraction", done: true },
      { label: "Nested join filter hierarchy + depth", done: true },
      { label: "Linked entity column prefixing", done: true },
      { label: "Compact / detailed form layout toggle", done: true },
      { label: "OOTB column exclusion defaults", done: true },
      { label: "Base currency field filtering", done: true },
    ]
  },
  {
    phase: "Phase 3 — Automation, Code & Pipeline", color: "#9333ea", status: "COMPLETE",
    items: [
      { label: "Flow parser — trigger types + recursive action tree", done: true },
      { label: "Flow parser — expression serialiser for conditions", done: true },
      { label: "Mermaid diagram generator (ADO v8.14 compatible)", done: true },
      { label: "Classic workflow parser (XAML)", done: true },
      { label: "Business rule parser — if/else branch extraction", done: true },
      { label: "Table pages split into subpages (Columns/Views/Forms/Relationships/Business Rules)", done: true },
      { label: "Plugin step parser", done: true },
      { label: "Web Resource parser (JS)", done: true },
      { label: "ADO Wiki REST publisher", done: true },
      { label: "Page name sanitisation + ADO wiki link encoding", done: true },
      { label: "npm package (powerautodocs)", done: true },
      { label: "ADO pipeline YAML", done: true },
      { label: "Multi-solution manifest parsing (all roles)", done: true },
      { label: "Security role privilege matrix", done: true },
      { label: "Environment variables parser", done: true },
      { label: "Global choice (option set) parser", done: true },
      { label: "Connection references parser", done: true },
      { label: "Email template parser", done: true },
      { label: "Model-driven app parser", done: true },
      { label: "Mermaid ER diagram generator", done: true },
      { label: "Run logger + summary (logger.ts)", done: true },
      { label: "GitHub Actions npm publish workflow", done: true },
      { label: "PCF control parser", done: false },
    ]
  },
  {
    phase: "Phase 4 — Extended Components", color: "#db2777", status: "PLANNED",
    items: [
      { label: "Business process flow parser", done: false },
      { label: "Column security profile parser", done: false },
      { label: "Routing rule set parser", done: false },
      { label: "Custom connector parser", done: false },
      { label: "Duplicate detection rule parser", done: false },
      { label: "SLA parser", done: false },
      { label: "Dashboard parser", done: false },
      { label: "Service endpoint parser", done: false },
      { label: "Power Pages parser", done: false },
      { label: "PCF control parser", done: false },
    ]
  },
  {
    phase: "Phase 5 — Advanced & Delivery", color: "#0891b2", status: "PLANNED",
    items: [
      { label: "CLI entry point (--word / --wiki flags, unknown flag detection)", done: true },
      { label: "Auto-trigger pipeline (push/scheduled)", done: false },
      { label: "Change log (git-diff driven)", done: false },
      { label: "IR JSON artifact publishing", done: false },
      { label: "Word renderer (DocNode layer + DocxSerializer + docAssembler)", done: true },
      { label: "PDF renderer (headless rendering — separate from Word)", done: false },
      { label: "Mermaid → PNG for static formats (mmdc)", done: false },
      { label: "Dependency resolver (flow → table links)", done: false },
      { label: "Complexity scorer", done: false },
    ]
  },
];

export default function App() {
  const [activeLayer, setActiveLayer] = useState(null);
  const [activeTab, setActiveTab] = useState("architecture");
  const [moscowFilter, setMoscowFilter] = useState(null);

  const active = layers.find(l => l.id === activeLayer);
  const totalComponents = layers.flatMap(l => l.components).length;
  const doneComponents = layers.flatMap(l => l.components).filter(c => c.done).length;
  const pct = Math.round(doneComponents / totalComponents * 100);

  const filteredComponents = active
    ? (moscowFilter ? active.components.filter(c => c.moscow === moscowFilter) : active.components)
    : [];

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", color: "#0f172a", maxWidth: 1400, margin: "0 auto" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@300;400;600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          ::-webkit-scrollbar { width: 4px; }
          ::-webkit-scrollbar-track { background: #f1f5f9; }
          ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
          .layer-card { border: 1px solid #e2e8f0; background: #ffffff; border-radius: 6px; padding: 14px 18px; cursor: pointer; transition: all 0.2s; position: relative; overflow: hidden; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
          .layer-card:hover { border-color: var(--color); transform: translateX(3px); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .layer-card.active { border-color: var(--color); background: var(--bg); }
          .layer-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--color); }
          .tag { display: inline-block; font-size: 9px; padding: 2px 6px; border-radius: 2px; border: 1px solid currentColor; opacity: 0.7; margin: 2px; letter-spacing: 0.04em; }
          .comp-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 14px; margin-bottom: 8px; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
          .comp-card.done { background: #f0fdf4; border-color: #bbf7d0; }
          .comp-card:hover { border-color: #cbd5e1; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
          .tab-btn { background: none; border: none; color: #64748b; cursor: pointer; padding: 10px 18px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.08em; border-bottom: 2px solid transparent; transition: all 0.2s; }
          .tab-btn:hover { color: #1e293b; }
          .tab-btn.active { color: #0f172a; border-bottom-color: #0f172a; }
          .decision-row { display: grid; grid-template-columns: 190px 170px 1fr; gap: 16px; padding: 11px 16px; border-bottom: 1px solid #f1f5f9; align-items: start; }
          .decision-row:last-child { border-bottom: none; }
          .pill { display: inline-block; font-size: 9px; padding: 1px 7px; border-radius: 2px; letter-spacing: 0.08em; font-weight: 500; }
          .moscow-btn { background: #fff; border: 1px solid #cbd5e1; border-radius: 3px; cursor: pointer; padding: 3px 10px; font-family: 'IBM Plex Mono', monospace; font-size: 10px; letter-spacing: 0.08em; transition: all 0.15s; color: #475569; }
          .moscow-btn:hover { border-color: #334155; color: #1e293b; }
          .moscow-btn.active { color: white; }
        `}</style>

        <div style={{ padding: "28px 40px 0", borderBottom: "1px solid #e2e8f0", background: "#ffffff", boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ background: "#0f172a", color: "white", fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: 11, padding: "3px 10px", borderRadius: 2, letterSpacing: "0.12em" }}>POWERAUTODOCS</div>
            <span style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.1em", fontFamily: "'IBM Plex Mono', monospace" }}>v0.1.x</span>
          </div>
          <h1 style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: 22, fontWeight: 300, color: "#0f172a", letterSpacing: "-0.01em", marginBottom: 6 }}>
            Automated As-Built Documentation Generator
          </h1>
          <p style={{ fontSize: 11, color: "#64748b", maxWidth: 700, lineHeight: 1.7, marginBottom: 16 }}>
            A reusable pipeline that reads Power Platform solution artifacts directly from Git and produces
            structured, cross-linked wiki documentation in Azure DevOps — including Mermaid flow diagrams,
            nested action trees, business rules, plugin registrations, web resource indexes, security role
            matrices, environment variables, global choices, email templates, model-driven apps and auto-generated ER diagrams. Published as powerautodocs on npm.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
            <div style={{ width: 260, height: 3, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg, #2563eb, #9333ea)", borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: "#64748b", letterSpacing: "0.08em" }}>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>{doneComponents}</span>
              <span style={{ color: "#94a3b8" }}>/{totalComponents}</span>
              <span> components built &nbsp;·&nbsp; </span>
              <span style={{ color: "#059669", fontWeight: 600 }}>Phases 1, 2 & 3 complete · Phase 4 planned</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: 0 }}>
            {["architecture", "progress", "wiki structure", "decisions"].map(tab => (
              <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: "28px 40px" }}>

          {activeTab === "architecture" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, color: "#475569", letterSpacing: "0.15em", marginRight: 4 }}>FILTER BY PRIORITY:</span>
                <button className={`moscow-btn ${moscowFilter === null ? "active" : ""}`}
                  style={{ borderColor: moscowFilter === null ? "#0f172a" : undefined, background: moscowFilter === null ? "#0f172a" : undefined }}
                  onClick={() => setMoscowFilter(null)}>ALL</button>
                {Object.entries(moscow).map(([key, val]) => (
                  <button key={key} className={`moscow-btn ${moscowFilter === key ? "active" : ""}`}
                    style={{ borderColor: moscowFilter === key ? val.color : undefined, background: moscowFilter === key ? val.color : undefined }}
                    onClick={() => setMoscowFilter(moscowFilter === key ? null : key)}>{val.label}</button>
                ))}
                <span style={{ fontSize: 10, color: "#64748b", marginLeft: 8 }}>Must · Should · Could · Won't (for now)</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, alignItems: "start" }}>
                <div>
                  <div style={{ fontSize: 9, color: "#475569", letterSpacing: "0.15em", marginBottom: 12 }}>SELECT A LAYER</div>
                  {layers.map((layer) => {
                    const dc = layer.components.filter(c => c.done).length;
                    const tot = layer.components.length;
                    const visibleCount = moscowFilter ? layer.components.filter(c => c.moscow === moscowFilter).length : tot;
                    return (
                      <div key={layer.id}>
                        <div className={`layer-card ${activeLayer === layer.id ? "active" : ""}`}
                          style={{ "--color": layer.color, "--bg": layer.bg }}
                          onClick={() => setActiveLayer(activeLayer === layer.id ? null : layer.id)}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <span style={{ fontSize: 10, color: layer.color, fontWeight: 500, letterSpacing: "0.08em" }}>{layer.label}</span>
                            <span style={{ fontSize: 9, color: "#94a3b8" }}>{dc}/{tot} built{moscowFilter && visibleCount !== tot ? ` · ${visibleCount} visible` : ""}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>{layer.description}</div>
                          <div style={{ marginTop: 8, height: 2, background: "#f1f5f9", borderRadius: 1, overflow: "hidden" }}>
                            <div style={{ width: `${dc / tot * 100}%`, height: "100%", background: layer.color, opacity: 0.7 }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div>
                  {!activeLayer && (
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: 40, textAlign: "center", color: "#cbd5e1", fontSize: 12 }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>←</div>
                      Select a layer to explore its components
                    </div>
                  )}
                  {activeLayer && active && (
                    <div>
                      <div style={{ fontSize: 9, color: active.color, letterSpacing: "0.15em", marginBottom: 12, fontWeight: 500 }}>
                        {active.label} — {filteredComponents.length} COMPONENT{filteredComponents.length !== 1 ? "S" : ""}
                        {moscowFilter && <span style={{ color: moscow[moscowFilter].color }}> · {moscow[moscowFilter].label} ONLY</span>}
                      </div>
                      {filteredComponents.length === 0 && (
                        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: 24, textAlign: "center", color: "#cbd5e1", fontSize: 11 }}>
                          No {moscow[moscowFilter]?.label} components in this layer
                        </div>
                      )}
                      {filteredComponents.map(comp => {
                        const m = moscow[comp.moscow];
                        return (
                          <div key={comp.name} className={`comp-card ${comp.done ? "done" : ""}`}>
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{comp.icon}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 13, color: comp.done ? "#15803d" : "#0f172a", fontWeight: 500 }}>{comp.name}</span>
                                  <span className="pill" style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}40` }}>{m.label}</span>
                                  {comp.done
                                    ? <span className="pill" style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>BUILT</span>
                                    : <span className="pill" style={{ background: "#f8fafc", color: "#94a3b8", border: "1px solid #e2e8f0" }}>PLANNED</span>
                                  }
                                </div>
                                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6, marginBottom: 7 }}>{comp.detail}</div>
                                <div>{comp.tags.map(t => <span key={t} className="tag" style={{ color: active.color }}>{t}</span>)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "progress" && (
            <div style={{ maxWidth: 880 }}>
              <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.15em", marginBottom: 20 }}>BUILD PROGRESS</div>
              {progress.map(p => {
                const dc = p.items.filter(i => i.done).length;
                const tot = p.items.length;
                const statusStyle = {
                  "COMPLETE": { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
                  "IN PROGRESS": { bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
                  "PLANNED": { bg: "#f8fafc", color: "#94a3b8", border: "#e2e8f0" },
                }[p.status] || { bg: "#f8fafc", color: "#94a3b8", border: "#e2e8f0" };
                return (
                  <div key={p.phase} style={{ background: "#fff", borderLeft: `3px solid ${p.color}`, border: `1px solid #e2e8f0`, borderRadius: 6, padding: 18, marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 10, color: p.color, letterSpacing: "0.1em", fontWeight: 500 }}>{p.phase}</span>
                        <span className="pill" style={{ background: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.border}` }}>{p.status}</span>
                      </div>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{dc}/{tot}</span>
                    </div>
                    <div style={{ height: 2, background: "#f1f5f9", borderRadius: 1, overflow: "hidden", marginBottom: 14 }}>
                      <div style={{ width: `${dc / tot * 100}%`, height: "100%", background: p.color, opacity: 0.7 }} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 20px" }}>
                      {p.items.map(item => (
                        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0", fontSize: 11 }}>
                          <span style={{ color: item.done ? "#15803d" : "#cbd5e1", fontSize: 13 }}>{item.done ? "●" : "○"}</span>
                          <span style={{ color: item.done ? "#0f172a" : "#94a3b8" }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderLeft: "3px solid #2563eb", borderRadius: 6, padding: 14, fontSize: 11, color: "#1e40af", lineHeight: 1.7 }}>
                <strong>Phases 1, 2 & 3 are producing real output on live client solutions.</strong> The full pipeline
                — data model, flows, classic workflows, business rules, plugins, web resources, security roles,
                environment variables, global choices, email templates, model-driven apps and ER diagrams — publishes end-to-end via ADO pipeline.
                Phase 4 adds extended D365 components. Phase 5 adds delivery formats and advanced analysis.
              </div>
            </div>
          )}

          {activeTab === "wiki structure" && (
            <div style={{ maxWidth: 820 }}>
              <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.15em", marginBottom: 20 }}>ADO WIKI PAGE HIERARCHY</div>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: 24, marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 18, lineHeight: 1.6 }}>
                  Each solution gets its own top-level wiki section. Pages are generated from the IR layer and published via ADO REST API.
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}>
                  {[
                    { indent: 0, text: "📁 [Solution Name]", color: "#2563eb", done: true },
                    { indent: 1, text: "🏠 Overview", color: "#0f172a", done: true },
                    { indent: 1, text: "📁 Data Model", color: "#0f172a", done: true },
                    { indent: 2, text: "📊 Entity Relationship Diagram ← on Data Model page", color: "#059669", done: true },
                    { indent: 2, text: "📋 [Table Name] × N  ← index page", color: "#0f172a", done: true },
                    { indent: 3, text: "📝 Columns", color: "#0f172a", done: true },
                    { indent: 3, text: "👁️ Views", color: "#0f172a", done: true },
                    { indent: 3, text: "📋 Forms", color: "#0f172a", done: true },
                    { indent: 3, text: "↔️ Relationships", color: "#0f172a", done: true },
                    { indent: 3, text: "📐 Business Rules  ← index + per-rule pages", color: "#0f172a", done: true },
                    { indent: 1, text: "📁 Automation", color: "#0f172a", done: true },
                    { indent: 2, text: "🔄 Flows (summary + per-flow pages with diagrams)", color: "#0f172a", done: true },
                    { indent: 2, text: "⚡ Classic Workflows (summary + per-workflow pages)", color: "#0f172a", done: true },
                    { indent: 2, text: "🔌 Plugin Assemblies", color: "#0f172a", done: true },
                    { indent: 1, text: "📁 Custom Code", color: "#0f172a", done: true },
                    { indent: 2, text: "📜 Web Resources (JS) ← linked summary + per-file pages", color: "#0f172a", done: true },
                    { indent: 2, text: "🧩 PCF Controls", color: "#cbd5e1", done: false },
                    { indent: 1, text: "📁 Security  ← container page", color: "#0f172a", done: true },
                    { indent: 2, text: "🔐 Security Roles ← index + per-role matrix pages", color: "#0f172a", done: true },
                    { indent: 2, text: "🔒 Column Security Profiles", color: "#cbd5e1", done: false },
                    { indent: 1, text: "📁 Integrations", color: "#0f172a", done: true },
                    { indent: 2, text: "🌍 Environment Variables", color: "#0f172a", done: true },
                    { indent: 2, text: "🔗 Connection References", color: "#0f172a", done: true },
                    { indent: 1, text: "🎛️ Global Choices ← index + per-choice pages", color: "#0f172a", done: true },
                    { indent: 1, text: "📧 Email Templates ← index + per-template pages", color: "#0f172a", done: true },
                    { indent: 1, text: "📱 Model-Driven Apps ← index + per-app pages", color: "#0f172a", done: true },
                    { indent: 1, text: "📝 Change Log", color: "#cbd5e1", done: false },
                    { indent: 1, text: "🔁 Business Process Flows ← index + per-BPF pages", color: "#cbd5e1", done: false },
                    { indent: 1, text: "🔍 Duplicate Detection Rules", color: "#cbd5e1", done: false },
                    { indent: 1, text: "⏱️ SLAs", color: "#cbd5e1", done: false },
                    { indent: 1, text: "📊 Dashboards", color: "#cbd5e1", done: false },
                    { indent: 2, text: "🔌 Service Endpoints ← under Integrations", color: "#cbd5e1", done: false },
                    { indent: 1, text: "📨 Routing Rule Sets", color: "#cbd5e1", done: false },
                    { indent: 1, text: "🔗 Custom Connectors", color: "#cbd5e1", done: false },
                    { indent: 1, text: "🌐 Power Pages", color: "#cbd5e1", done: false },
                  ].map((item, i) => (
                    <div key={i} style={{
                      paddingLeft: item.indent * 18, paddingTop: 4, paddingBottom: 4,
                      color: item.done ? item.color : "#e2e8f0",
                      borderLeft: item.indent > 0 ? "1px solid #f1f5f9" : "none",
                      marginLeft: item.indent > 0 ? (item.indent - 1) * 18 + 10 : 0,
                      display: "flex", alignItems: "center", gap: 10
                    }}>
                      <span>{item.text}</span>
                      {item.done && <span className="pill" style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>BUILT</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.15em", marginBottom: 12 }}>PAGES BUILT SO FAR</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {pages.map(page => {
                  const m = moscow[page.moscow];
                  return (
                    <div key={page.name} className={`comp-card ${page.done ? "done" : ""}`}>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{page.emoji}</span>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 12, color: page.done ? "#15803d" : "#0f172a", fontWeight: 500 }}>{page.name}</span>
                            <span className="pill" style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}40` }}>{m.label}</span>
                            {page.done && <span className="pill" style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>BUILT</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{page.desc}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "decisions" && (
            <div style={{ maxWidth: 900 }}>
              <div style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.15em", marginBottom: 20 }}>KEY ARCHITECTURAL DECISIONS — CONFIRMED IN BUILD</div>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "190px 170px 1fr", gap: 16, padding: "10px 16px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                  {["Decision", "Choice", "Rationale"].map(h => (
                    <div key={h} style={{ fontSize: 9, color: "#64748b", letterSpacing: "0.15em" }}>{h}</div>
                  ))}
                </div>
                {decisions.map(d => (
                  <div key={d.q} className="decision-row">
                    <div style={{ fontSize: 11, color: "#475569" }}>{d.q}</div>
                    <div style={{ fontSize: 11, color: "#2563eb", fontWeight: 500 }}>{d.a}</div>
                    <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.6 }}>{d.reason}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderLeft: "3px solid #2563eb", borderRadius: 6, padding: 14, fontSize: 11, color: "#1e40af", lineHeight: 1.7 }}>
                <strong>IR is the contract.</strong> Parsers only produce IR. Renderers only consume IR.
                Neither knows about the other. Renderers emit DocNode[] (format-agnostic); MarkdownSerializer converts to ADO Wiki markdown,
                DocxSerializer converts to Word (.docx) via the docx library. New output formats only need a new serializer.
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}