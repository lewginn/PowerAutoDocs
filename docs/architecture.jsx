import { useState } from "react";

const moscow = {
  M: { label: "MUST", cls: "fill" },
  S: { label: "SHOULD", cls: "bare" },
  C: { label: "COULD", cls: "bare dim" },
  W: { label: "WON'T", cls: "bare dim strike" },
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
      { name: "Classic Workflows & Business Rules", icon: "⚡", detail: "XAML-based workflows and business rules from Workflows/ folder. Supports both _xaml_data.xml and .xaml.data.xml naming conventions. Category=2 → business rule (businessRuleParser); Category=3 → 'action', everything else → 'workflow' (classicWorkflowParser); Category=2 is excluded from the classic-workflow sweep to avoid double-counting.", tags: ["XAML", "XML"], done: true, moscow: "S" },
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
      { name: "Power Pages", icon: "🌐", detail: "Portal/Power Pages site definitions. Pages, web templates, entity forms, entity lists, site settings.", tags: ["XML"], done: true, moscow: "C" },
      { name: "Virtual Tables", icon: "🔌", detail: "Dataverse tables backed by an external data source rather than native storage. Provider name, external data source connection, source entity mapping.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Copilot Studio Agents", icon: "🤖", detail: "Agents packaged into the solution export. Topics, knowledge sources, orchestration/trigger config at whatever fidelity solution XML carries — canvas-level authoring detail is out of reach.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Settings (org/solution config)", icon: "🛠️", detail: "Solution/environment configuration records controlling platform behaviour — default currency, business closures, auto-numbering, duplicate-detection toggles — distinct from Environment Variable Definitions.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Masking Rules (Secured/Attribute)", icon: "🎭", detail: "Column-level masking rule definitions. Masked column, mask type/pattern, exempt security roles/profiles.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Custom Pages", icon: "🖼️", detail: "Canvas-style pages embedded within a Model-Driven App. Page type, owning app module reference(s), embedded canvas app reference.", tags: ["XML"], done: false, moscow: "C" },
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
      { name: "Classic Workflow Parser", icon: "⚡", detail: "XAML walker excluding Category=2 (owned by the Business Rule Parser). Category=3 maps to 'action', everything else to 'workflow'. Extracts trigger config, ConditionSequence steps with branch actions (update, terminate, nested conditions). Supports both pac CLI naming conventions.", tags: ["Core"], done: true, moscow: "S" },
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
      { name: "Power Pages Parser", icon: "🌐", detail: "Parses Power Pages/Portal XML. Pages, web templates, entity forms, entity lists, site settings.", tags: ["XML"], done: true, moscow: "C" },
      { name: "Virtual Table Parser", icon: "🔌", detail: "Reads virtual table definitions from solution XML — provider config and source entity mapping. Whether this extends TableModel or gets a standalone model is an open design question.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Agent Parser", icon: "🤖", detail: "Reads a Copilot Studio agent's solution XML export — topics, knowledge sources, orchestration/trigger config. Metadata extraction, not a topic-flow rebuild.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Settings Parser", icon: "🛠️", detail: "Reads org/solution-level configuration records not exposed via Environment Variables.", tags: ["XML"], done: false, moscow: "C" },
      { name: "Masking Rule Parser", icon: "🎭", detail: "Reads masking rule definitions for masked columns from the solution export.", tags: ["XML"], done: false, moscow: "S" },
      { name: "Custom Page Parser", icon: "🖼️", detail: "Reads Custom Page definitions referenced from AppModule.xml. Page type, app module reference, embedded canvas app reference.", tags: ["XML"], done: false, moscow: "C" },
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
      { name: "WebResourceModel", icon: "📜", detail: "Per-file model. resourceType, namespace, functions with JSDoc, async flag, params.", tags: ["ir/webResource.ts"], done: true, moscow: "S" },
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
      { name: "PowerPagesModel", icon: "🌐", detail: "Site name, pages, web templates, entity forms, entity lists, site settings.", tags: ["ir/powerPages.ts"], done: true, moscow: "C" },
      { name: "VirtualTableModel (or TableModel extension)", icon: "🔌", detail: "Provider config, source entity name, custom column list. Open design question: standalone model vs. an additive extension of TableModel.", tags: ["ir/table.ts or ir/virtualTable.ts"], done: false, moscow: "S" },
      { name: "AgentModel", icon: "🤖", detail: "Topics, knowledge sources, orchestration/trigger config for a Copilot Studio agent.", tags: ["ir/agent.ts"], done: false, moscow: "S" },
      { name: "SettingsModel", icon: "🛠️", detail: "Configured setting name and value, distinct from EnvironmentVariableModel.", tags: ["ir/settings.ts"], done: false, moscow: "C" },
      { name: "MaskingRuleModel", icon: "🎭", detail: "Masked column, mask type/pattern, exempt roles/profiles.", tags: ["ir/maskingRule.ts"], done: false, moscow: "S" },
      { name: "CustomPageModel", icon: "🖼️", detail: "Page type, owning Model-Driven App reference(s), embedded canvas app reference — surfaced alongside ModelDrivenAppModel rather than as a new top-level page.", tags: ["ir/customPage.ts"], done: false, moscow: "C" },
    ]
  },
  {
    id: "enrichment",
    label: "04 — ENRICHMENT LAYER",
    color: "#059669",
    bg: "#ecfdf5",
    description: "Cross-cutting analysis — diagrams, metrics, change detection",
    components: [
      { name: "Mermaid ER Diagram Generator", icon: "🗺️", detail: "Generates erDiagram from TableModels and RelationshipModels. Filters to custom entities via publisher prefix. Two-tier exclusion: excludeStandardRelationships flag kills all OOB noise; erd.excludeEntities/excludeRelationships config for per-solution fine-tuning. Self-referential edges skipped. Entity names SafeMermaidName-encoded. Returns raw Mermaid DSL only — the ADO :::mermaid fence is added by MarkdownSerializer, never by the generator, to avoid double-fencing.", tags: ["Diagram"], done: true, moscow: "S" },
      { name: "Mermaid Flow Generator", icon: "📈", detail: "Recursive action tree walker. Emits raw flowchart TD DSL (no fence — that's the serializer's job). Node shapes per type (If=diamond, Scope=subroutine, Foreach=loop, Terminate=circle). Yes/No edge labels, ⚠ Error path for Catch. Compatible with ADO Mermaid v8.14.", tags: ["Diagram"], done: true, moscow: "S" },
      { name: "Expression Serialiser", icon: "🔣", detail: "Converts Power Automate condition expression objects into human-readable strings. Handles and/or/not, equals/greater/less, contains, startsWith. Cleans @outputs()/@triggerBody() references to field names.", tags: ["Analysis"], done: true, moscow: "S" },
      { name: "AI Summary Cache Manager", icon: "💾", detail: ".powerautodocs-ai-cache.json stores AI-generated summaries, keyed by a SHA-256 hash of a derived 'summarisable view' of the component IR for cache invalidation. --regenerate-ai flag for manual full refresh. Committed in the client project repo that consumes powerautodocs, so summaries are reviewed in PRs before publication — gitignored in this repo since it would otherwise hold real client component names.", tags: ["AI", "Cache"], done: true, moscow: "C" },
      { name: "AI Provider Interface", icon: "🤖", detail: "Thin abstraction layer (AiProvider interface) for pluggable AI providers. Initially Claude/Anthropic. Config specifies provider + model. Future: add OpenAI, other providers without touching enrichment logic.", tags: ["AI", "Pluggable"], done: true, moscow: "C" },
      { name: "Component Summarizer", icon: "✍️", detail: "Generates human-readable summaries for flows, plugins, business rules, tables, security roles. Optional per-component in config. Audience-aware (technical/functional/executive). Injects summaries into DocNode output alongside raw extracted content.", tags: ["AI", "Enrichment"], done: true, moscow: "C" },
      { name: "Dependency Resolver", icon: "🔗", detail: "Resolves flow ↔ table links (dependencyResolver.ts), handling Dataverse entity-set pluralisation. Wired into all three assemblers. Surfaces as 'Used By Flows' on table pages and 'Tables Used' on flow pages.", tags: ["Analysis"], done: true, moscow: "C" },
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
      { name: "Markdown Renderer", icon: "✍️", detail: "Primary output. Renderers emit format-agnostic DocNode[]; MarkdownSerializer converts that to ADO Wiki markdown (the legacy write*Markdown() string-builder helpers still exist alongside it for local file output, but the DocNode[] path is primary). toADOWikiLink() encodes all internal links (spaces→hyphens, parens escaped, hyphens→%2D). [[_TOSP_]] on container pages only.", tags: ["Primary"], done: true, moscow: "M" },
      { name: "ADO Wiki Publisher", icon: "🌐", detail: "Azure DevOps REST API. Creates/updates wiki pages in correct hierarchy. Top-down parent creation. Page name sanitisation via s() helper. Auth pre-validation. Z→A publish order for A→Z sidebar display.", tags: ["ADO"], done: true, moscow: "S" },
      { name: "Word Renderer", icon: "📄", detail: "DocNode format-agnostic document model layer (src/docmodel/nodes.ts). Renderers emit DocNode[] via MarkdownSerializer (ADO Wiki) or DocxSerializer (Word). DocxSerializer → docx library: A4 page, proportional fixed-width column tables, TOC, page-number footer. Output controlled by output.word in config or --word CLI flag. Mermaid diagrams (ERD, flow charts) are rendered to PNG via mermaidRenderer.ts (@mermaid-js/mermaid-cli against a local Chrome/Edge — never Puppeteer's bundled Chromium, see .puppeteerrc.cjs) and embedded as images, content-hash cached to .powerautodocs-diagram-cache/. Toggle via output.wordDiagrams (default true); falls back to omitting diagrams with a console warning if no browser is found — never fails the run. Styling is themeable via output.wordTheme — see Word Theming.", tags: ["Optional"], done: true, moscow: "C" },
      { name: "Word Theming", icon: "🎨", detail: "Themeable Word output (src/docmodel/wordTheme.ts). Previously buildDocument() created a bare docx Document with no styles block and no default font, so the whole document inherited Word's built-ins (Calibri 11, stock blue Office headings) — it was unstyled rather than plainly styled. Now a resolved WordTheme is threaded into the serializer (same injection shape as MermaidRenderer, keeping docmodel free of config), and applied as real document styles so it also reaches content the serializer never touches directly — including generated TOC entries. The default theme needs no configuration: banded tables with a repeating header row, an accent-filled header, cell padding, a rule under each section heading, and a muted footer. output.wordTheme overrides it — in most cases a single accentColor line, from which heading colours, table header fill, banding tint, borders and code colour are all derived (levels 3-4 auto-darkened; header text picked white or near-black by WCAG luminance so a pale brand colour stays legible). Every derived value is individually overridable. Invalid colours warn and fall back rather than failing an unattended pipeline run. Word-scoped — PDF (pdfmake) stays unthemed by design and won't be revisited: PDF output is planned for deprecation (Lewis, 2026-07-17; see 'PDF output — deprecation planned?' below).", tags: ["Optional"], done: true, moscow: "C" },
      { name: "PDF Renderer", icon: "📑", detail: "⚠ Planned for deprecation (Lewis, 2026-07-17) — do not invest in PDF features, tests or refactors without confirming the plan still holds; see 'PDF output — deprecation planned?' below. Still works today: standalone PDF output reusing the DocNode layer — PdfSerializer (src/docmodel/PdfSerializer.ts) emits pdfmake content: A4 page, proportional fixed-width column tables (pt-based, scales the minimum down for wide tables like the security-role privilege matrix), TOC with page numbers, page-number footer. Standard 14 PDF fonts only (Helvetica/Courier) — no font files bundled; a glyph-fallback map substitutes WinAnsi-safe equivalents for symbols renderers emit outside that range (e.g. ●○ privilege dots → •°). pdfAssembler.ts mirrors docAssembler.ts section-by-section. Output controlled by output.pdf in config or --pdf CLI flag, local file only (not published to ADO Wiki). Mermaid skipped — unlike Word, which now embeds rendered diagrams (see Word Renderer). Untested by decision, not by gap — see the deprecation entry.", tags: ["Optional", "Deprecation planned"], done: true, moscow: "C" },
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
      { name: "ADO Pipeline YAML", icon: "🏭", detail: "Manual trigger pipeline. Node 24.x, npx powerautodocs@latest. PAT injected at runtime via sed into doc-gen.config.yml. WIKI_PAT secret variable. Tested end-to-end on live solutions.", tags: ["ADO YAML"], done: true, moscow: "S" },
      { name: "doc-gen.config.yml", icon: "⚙️", detail: "Per-project config. Multi-solution support. output.wiki / output.word booleans control output modes. components toggles control what gets rendered. Wiki org/project/identifier/parentPath. PAT field REDACTED for safe commit, injected at runtime via sed. Comprehensive inline comments for end-user setup.", tags: ["Config"], done: true, moscow: "M" },
      { name: "npm Package (powerautodocs)", icon: "📦", detail: "Published as powerautodocs on npmjs.com. GitHub repo: lewginn/PowerAutoDocs. Granular Access Token with bypass-2FA. Shebang entry point via scripts/addShebang.mjs (cross-platform). prepublishOnly build step. Node >=22 requirement (18 and 20 are end-of-life; CI tests 22 and 24). Renamed from powerautodoc to avoid accidental client data exposure in earlier versions.", tags: ["npm"], done: true, moscow: "M" },
      { name: "Run Logger + Summary", icon: "📋", detail: "src/logger.ts — structured console output with symbols (✓/✗/⚠/→). Per-solution section headers, per-component counts. End-of-run summary with solutions processed/skipped, parse warnings, pages published, publish failures. Exit code 1 on any hard failure — ADO pipeline marks step as failed.", tags: ["DX"], done: true, moscow: "S" },
      { name: "GitHub Actions npm Publish", icon: "🚀", detail: "npm-publish.yml workflow. Triggers on GitHub Release published, plus workflow_dispatch as a manual escape hatch. (Previously also listened on the created event — publishing a release directly, not as a draft, fires both created and published simultaneously, so the workflow ran twice per release and the second run always failed with a 403 since npm forbids republishing a version; fixed on main after v1.5.0, `created` removed from the trigger list.) Runs npm ci → typecheck → test → build → npm publish. NODE_AUTH_TOKEN from NPM_TOKEN repo secret. Replaces manual npm publish from local machine.", tags: ["CI/CD"], done: true, moscow: "S" },
      { name: "CI Pipeline", icon: "✅", detail: "ci.yml — runs on every pull request and every push to main, on a Node 22 + 24 matrix so the engines floor is tested rather than asserted. npm ci → npm run typecheck → npm run build → npm test. Typecheck covers src/ and tests/ via tsconfig.test.json; the build only sees src/. Concurrency cancels superseded runs on branches but never on main. Before this, npm run build ran only after a release was cut.", tags: ["CI/CD"], done: true, moscow: "M" },
      { name: "Vitest Test Suite", icon: "🧪", detail: "Vitest, chosen for zero-config pure-ESM/NodeNext support. Tests live in tests/ outside the build's src/ scope, so they never ship to npm. 1113 tests in ~3s, covering every module with runtime behaviour: all 17 parsers, all 14 renderers, MarkdownSerializer and DocxSerializer (both asserted against real generated output), wordTheme, erdGenerator, config/loader, the wiki and Word assemblers, the wiki publisher, the pipeline entry point and the AI enrichment layer. Fixtures are hand-written for fictional Contoso/Acme solutions: never derived from real client data. Still no mocks anywhere — the wiki publisher, AI provider and entry point were refactored to accept injected seams rather than be mocked around, on the principle that a test needing a mock is asking for a refactor first. Real browser Mermaid rendering remains out of scope by decision, not omission; the PDF path (PdfSerializer, pdfAssembler) is likewise untested by decision — see 'PDF output — deprecation planned?' below.", tags: ["Testing"], done: true, moscow: "M" },
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
  { emoji: "📜", name: "Web Resources", desc: "JS files with function index, namespace, JSDoc, event handlers vs helpers split. Linked summary table. Function 'Description' column is AI-populated (per-function summary) when AI enrichment is enabled, falling back to JSDoc.", done: true, moscow: "S" },
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
  { emoji: "🌐", name: "Power Pages", desc: "Site overview, pages, web templates, entity forms and lists", done: true, moscow: "C" },
  { emoji: "🔌", name: "Virtual Tables", desc: "External provider/data source, source entity mapping, custom columns layered on top", done: false, moscow: "S" },
  { emoji: "🤖", name: "Copilot Studio Agents", desc: "Agent index + per-agent pages: topics, knowledge sources, orchestration/trigger config", done: false, moscow: "S" },
  { emoji: "🛠️", name: "Settings", desc: "Org/solution configuration records beyond Environment Variables — default currency, auto-numbering, duplicate-detection toggles", done: false, moscow: "C" },
  { emoji: "🎭", name: "Masking Rules", desc: "Masked columns, mask type/pattern, and which roles/profiles are exempt", done: false, moscow: "S" },
  { emoji: "🖼️", name: "Custom Pages", desc: "Canvas-style pages surfaced alongside the Model-Driven App they belong to", done: false, moscow: "C" },
  { emoji: "🤖", name: "AI Enrichment", desc: "Optional AI-generated summaries for components. Per-component toggle in config. Cache-first approach with .powerautodocs-ai-cache.json. Pluggable provider interface.", done: true, moscow: "C" },
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
  { q: "Word output?", a: "DocNode layer + DocxSerializer", reason: "Renderers now emit DocNode[] (format-agnostic). MarkdownSerializer converts to ADO Wiki markdown; DocxSerializer converts to docx Paragraph/Table elements. A4 fixed-width tables (TableLayoutType.FIXED + DXA column widths) ensure consistent rendering in Word and Word Online. Output mode controlled by output.word in config.yml or --word CLI flag. Mermaid diagrams are embedded as images (rendered via mermaidRenderer.ts) — see 'Mermaid in Word?' below. PDF (PdfSerializer, the DocNode layer's other consumer) is planned for deprecation — see 'PDF output — deprecation planned?' below." },
  { q: "Word theming?", a: "Resolved WordTheme threaded into the serializer, applied as docx document styles", reason: "The Word output looked basic for one concrete reason: buildDocument() never set a styles block, and no default font was declared anywhere — so every heading and paragraph fell through to Word's built-in defaults. The fix is applied at the document-styles level rather than per-run, because styles reach content the serializer never explicitly emits runs for, including the generated TOC. The theme is resolved once in docAssembler (config → WordTheme) and passed down as a parameter, mirroring the MermaidRenderer injection — docmodel never imports config, so the serializer stays a pure DocNode → docx function and the IR/renderer boundary is untouched. Config surface is deliberately one field deep: output.wordTheme.accentColor derives heading colours, table header fill, row banding, borders and code colour, so branding is normally one line; each derived value stays individually overridable for the minority who need exact control. Named preset themes were considered and deferred — they are purely additive on top of this type, whereas shipping them now would freeze a palette vocabulary before there is evidence of what people actually want. Defaults are Office-bundled fonts (Calibri/Calibri Light/Courier New) because Word silently substitutes fonts that aren't installed on the reader's machine, which makes anything fashionable a coin flip. Invalid colours warn and fall back rather than throwing — deliberately unlike the fail-fast aiEnrichment validation, since a bad hex is cosmetic and failing an unattended pipeline at the end of a long parse over a missing '#' is the worse outcome." },
  { q: "Mermaid in Word?", a: "@mermaid-js/mermaid-cli against local Chrome/Edge, PNG embed, content-hash cache", reason: "Word has no native Mermaid support, so diagrams have to become images. mermaid-cli's renderMermaid() runs against a real browser instance — but Puppeteer's own bundled Chromium (~250MB) would be a fresh download on every ADO pipeline run, since hosted agents are ephemeral VMs. .puppeteerrc.cjs sets skipDownload: true; mermaidRenderer.ts instead points at the agent's preinstalled Chrome/Edge (or POWERAUTODOCS_CHROME_PATH if it's somewhere non-standard) — zero download, works cold every run. Rendered PNGs are cached to .powerautodocs-diagram-cache/ keyed by a SHA-256 of the diagram's Mermaid source, same 'unchanged input, skip the work' pattern as the AI enrichment cache — unchanged diagrams across runs never re-render, and the browser only launches if at least one diagram actually changed. Availability is checked once up front (no browser launch, just checking known install paths) rather than failing partway through a run; if no browser is found, diagrams are silently omitted with a console warning. Toggle via output.wordDiagrams (default true). This also surfaced and fixed a real bug: erdGenerator.ts was baking the ADO :::mermaid fence directly into the diagram string, which MarkdownSerializer then wrapped a second time — ERD diagrams in the wiki had been double-fenced. Fixed to return raw DSL, matching mermaidGenerator.ts." },
  { q: "PDF output?", a: "DocNode layer + PdfSerializer (pdfmake)", reason: "Reuses the same format-agnostic DocNode[] layer as Word — PdfSerializer converts it to pdfmake content using the standard 14 PDF fonts (Helvetica/Courier), so no font files or native binaries need bundling. Mirrors DocxSerializer's structure and decisions (A4, 1\" margins, proportional column widths, Mermaid skipped) for a self-contained file. pdfAssembler.ts mirrors docAssembler.ts section-by-section with identical heading offsets. Self-contained PDFs have no subpages, so internal links degrade gracefully to plain/code-styled text — same pattern as Word. Output controlled by output.pdf in config.yml or --pdf CLI flag; local file only, not published to the ADO Wiki. Superseded by a deprecation call (Lewis, 2026-07-17) — see 'PDF output — deprecation planned?' below; nothing removed yet and output.pdf still works, but treat this as the settled decision, not a base to build further PDF work on." },
  { q: "PDF output — deprecation planned?", a: "Deprecating; nothing removed yet", reason: "Lewis decided 2026-07-17 to deprecate PDF output, re-confirmed the same day when #109 asked whether pdfAssembler should get test coverage — the answer was no, on this decision. The reasoning: PdfSerializer (pdfmake) lags Word on theming and formatting fidelity — no font embedding, no Mermaid diagrams, no brand theming — and closing that gap would mean building a second theming system to maintain alongside Word's. Word's own Export to PDF already produces a themed, diagram-complete PDF from the same document, making a separate PdfSerializer redundant rather than complementary. PdfSerializer (419 lines) and pdfAssembler (222 lines) are consequently the only untested runtime in the repo while their Word twins are both covered; pdfAssembler mirrors docAssembler section-for-section, so a component added to all three assemblers now has a covered Word path and an uncovered PDF one — the accepted cost of not investing further in a format on its way out. Nothing has been removed yet and output.pdf still works, but do not invest in PDF features, tests or refactors without confirming the plan still holds. If it goes, pdfmake and @types/pdfmake go with it — a further dependency saving on every client run." },
  { q: "AI summaries — stable across runs?", a: "Cache-first: committed JSON file", reason: "A CI documentation pipeline must produce stable, reviewable output. Without a cache every run regenerates different text, creating constant noisy wiki diffs. The cache file (.powerautodocs-ai-cache.json) is committed alongside doc-gen.config.yml so AI-written summaries are reviewed in PRs before they're published — same discipline as any other code change." },
  { q: "AI summary cache invalidation?", a: "SHA-256 hash of component IR + --regenerate-ai flag", reason: "Each cache entry stores a SHA-256 of the serialised IR for that component. If the IR hasn't changed the cached summary is reused — controls API cost and prevents surprise rewrites on unchanged components. --regenerate-ai flag gives a manual escape hatch for a full fresh pass." },
  { q: "Which AI provider(s)?", a: "Anthropic (Claude) + Azure OpenAI day-one; factory-extensible", reason: "Anthropic/Claude is the natural fit given the toolchain. But most D365/Power Platform shops on ADO are deep in Azure and already have Azure OpenAI provisioned — Azure-hosted AI with data residency compliance and no new vendor procurement. Both providers implement the AiProvider interface (summarise(prompt): Promise<string>). The factory pattern in providers/index.ts means new providers (OpenAI direct, Bedrock, etc.) only need a new file — aiSummariser stays completely provider-agnostic." },
  { q: "Azure OpenAI auth — API key or managed identity?", a: "Support both; managed identity is preferred enterprise path", reason: "API key auth works in all Azure scenarios. Managed identity means the ADO agent's identity gets RBAC access to the Azure OpenAI resource via Azure AD — zero API keys to manage or rotate. Enterprise shops prefer this. Both are supported; config can omit apiKey if using managed identity + workload identity federation on the ADO service connection." },
  { q: "Which AI model?", a: "Configurable, defaulting to claude-haiku-4-5", reason: "Haiku is fast and cheap — ideal for batch-summarising many components per run. Clients who want higher quality can bump to Sonnet in their config. Pinning a specific model ID (not 'latest') ensures summaries don't silently change when Anthropic releases a new default." },
  { q: "Which components can be AI-summarised? (v1 scope)", a: "Flows, Classic Workflows, Business Rules, Plugins, Web Resources — opt-in per component", reason: "Deliberately scoped to a subset rather than mirroring all 14 component toggles. These five share one trait: they're complex, code-like or logic-heavy artefacts that are genuinely hard to skim at a glance — exactly where a plain-English summary adds real value. Things like Global Choices or Connection References are already terse lists; an AI summary would be redundant noise. Scope can grow in later phases as the enrichment proves itself." },
  { q: "AI config validation — fail-fast or skip?", a: "Fail-fast at config-load time on misconfiguration", reason: "Distinct from the runtime skip-and-continue strategy. If aiEnrichment.enabled is true but the selected provider's config block (anthropic / azureOpenAI) is missing or incomplete, the run errors immediately before any parsing starts — this is a configuration mistake the user must fix, not a transient runtime failure. Skip-and-continue is reserved for actual API call failures (rate limits, timeouts) once the pipeline is correctly configured and running." },
  { q: "AI call failure handling?", a: "Skip-and-continue — summary omitted, warning logged", reason: "Consistent with the existing error handling strategy. A rate-limit or bad API key should not halt documentation of everything else. The end-of-run summary lists how many AI summaries were skipped so failures are visible without being fatal to the pipeline." },
  { q: "AI API key handling?", a: "apiKeyEnv points to an env var name; key never in the config file", reason: "Same pattern as WIKI_PAT. The committed config contains apiKeyEnv: ANTHROPIC_API_KEY; the actual key is an ADO secret variable injected at pipeline runtime via the pipeline variables. Nothing sensitive ever touches the repo." },
  { q: "AI cache file format and shape?", a: "Single committed JSON file, keyed by {type}:{uniqueName}, SHA-256 of a 'summarisable view'", reason: "JSON needs no new dependency and diffs cleanly in PRs (matches package-lock.json precedent). Keys like flow:cr123_SyncAccounts are human-readable and greppable. Crucially, the hash is computed over a small derived 'summarisable view' per component — meaning-bearing fields only (names, descriptions, trigger info, action list) — not the full IR. This is the same shape fed into the AI prompt, so hash and prompt share one source of truth. Hashing the full IR would over-invalidate: an unrelated Mermaid-diagram tweak or a new bookkeeping field (depth/parentName/runAfter) would force every cached summary across every client to regenerate even though the actual logic hadn't changed — exactly the noisy-diff problem the cache exists to prevent. version: 1 is included for safe future migration; orphaned entries (components no longer present) are pruned each run to keep the committed file accurate. A promptVersion constant is also folded into the hash input — bumping it deliberately forces full regeneration when prompt wording is improved, preventing a mix of old-style and new-style summaries coexisting in the same doc set with no way to tell them apart." },
  { q: "AI summary section — conditional rendering?", a: "Renderer emits no DocNode if aiSummary is absent", reason: "If a component has no cached summary (AI disabled, or skipped due to failure) the renderer simply does not emit the summary section DocNode — no empty heading, no placeholder text. This is a renderer guard before the h() call, not conditional template logic. Output is identical to pre-AI pages when enrichment is off." },
  { q: "AI prompt strategy and structure?", a: "Three-layer prompt: shared system framing + per-component lens + reused 'summarisable view' data, inline in aiSummariser.ts", reason: "Layer 1 is a constant system framing (audience: technical handover documentation for consultants who didn't build the solution; 2-3 sentence length cap; plain prose, no markdown; and a strict hallucination guardrail — only describe what's explicitly in the data, no speculation about business purpose or downstream systems). Layer 2 is a one-line per-component-type 'lens' (e.g. flows: focus on trigger + sequence + branching; business rules: focus on the condition and then/else actions) so the model knows which facts matter for that artefact type rather than producing generically-confused output. Layer 3 reuses the same 'summarisable view' that feeds the cache hash — one function serves both, so there's no drift between what justified regeneration and what the model actually saw. Templates live as inline functions in aiSummariser.ts rather than a separate prompts/ folder — five component types in v1 doesn't yet warrant the per-type file split that parsers/renderers use." },
  { q: "Per-function AI summaries for Web Resources — separate calls or bundled?", a: "Bundled into the existing per-file call via structured JSON output", reason: "The rendered Functions table has a 'Description' column sourced from JSDoc — almost always empty in real client code. Rather than firing one extra AI call per function (could be 5-10x more calls across a typical solution's web resources), the existing per-file webResources prompt was extended to request structured JSON: { fileSummary, functionSummaries: { <name>: <one-liner> } }. One call now produces both the file-level summary (existing aiSummaryBlock) and a short summary per function (WebResourceFunction.aiSummary, falls back to jsDoc, then '—'). Cached and hashed exactly as before — zero extra API cost. promptVersion bumped to 2 to force a one-time regeneration under the new structured format; tryParseJsonObject() strips markdown fences and falls back to treating the raw text as the file summary if parsing fails, so a non-conforming provider response degrades gracefully rather than breaking the run." },
  { q: "Configurable summary tone/length per client?", a: "Deferred — not in v1 scope", reason: "Adding a tone: 'technical' | 'executive' or maxSentences config knob before knowing whether clients actually want it would add config surface and prompt-variation complexity speculatively. The fixed technical-handover tone and 2-3 sentence cap covers the primary use case. Tracked as a backlog candidate — straightforward to bolt on as an optional override once the core feature is proven in real use." },
];

// Mirrors the phase groupings tracked on the PowerAutoDocs Roadmap GitHub
// Project (github.com/users/lewginn/projects/3) — Lewis tracks/updates issue
// status and phase assignment there as the source of truth; this list is kept
// in sync with it (issue numbers noted per item for traceability).
const progress = [
  {
    phase: "Phase 1 — Core Pipeline & Data Model", color: "#2563eb", status: "COMPLETE",
    items: [
      { label: "Solution manifest parser (#71)", done: true },
      { label: "Entity / table parser (#72)", done: true },
      { label: "Column type mapping + filtering (#73)", done: true },
      { label: "Relationship parser (1:N) (#74)", done: true },
      { label: "IR models split by domain (#75)", done: true },
      { label: "Barrel exports — parsers + renderers (#76)", done: true },
      { label: "Config system with defaults (#77)", done: true },
      { label: "Markdown renderer (#78)", done: true },
      { label: "Solution overview page (#79)", done: true },
      { label: "Per-table documentation pages (#80)", done: true },
    ]
  },
  {
    phase: "Phase 2 — Forms, Views & Filters", color: "#7c3aed", status: "COMPLETE",
    items: [
      { label: "Form parser — Main, Quick Create, Card (#81)", done: true },
      { label: "View parser with type detection (#82)", done: true },
      { label: "View filter condition extraction (#83)", done: true },
      { label: "Nested join filter hierarchy + depth (#84)", done: true },
      { label: "Linked entity column prefixing (#85)", done: true },
      { label: "Compact / detailed form layout toggle (#86)", done: true },
      { label: "OOTB column exclusion defaults (#87)", done: true },
      { label: "Base currency field filtering (#88)", done: true },
    ]
  },
  {
    phase: "Phase 3 — Component IR Models & Renderers", color: "#9333ea", status: "COMPLETE",
    items: [
      { label: "Solution Model (#37)", done: true },
      { label: "Table & Column Model (#38)", done: true },
      { label: "Relationship Model (#39)", done: true },
      { label: "Form Model & Parser (#40)", done: true },
      { label: "View Model & Parser (#41)", done: true },
      { label: "Flow Model & Renderer (#42)", done: true },
      { label: "Classic Workflow Model & Renderer (#43)", done: true },
      { label: "Business Rule Model & Renderer (#44)", done: true },
      { label: "Plugin Model & Renderer (#45)", done: true },
      { label: "Web Resource Model & Renderer (#46)", done: true },
      { label: "Security Role Model & Renderer (#47)", done: true },
      { label: "Environment Variable Model & Renderer (#48)", done: true },
      { label: "Global Choice Model & Renderer (#49)", done: true },
      { label: "Connection Reference Model & Renderer (#50)", done: true },
      { label: "Email Template Model & Renderer (#51)", done: true },
      { label: "Model-Driven App Model & Renderer (#52)", done: true },
    ]
  },
  {
    phase: "Phase 4 — AI Enrichment & Delivery Formats", color: "#db2777", status: "COMPLETE",
    items: [
      { label: "Dependency resolver — flow ↔ table cross-links (#69)", done: true },
      { label: "AI Enrichment Layer — summaries, caching, providers (#1)", done: true },
      { label: "Word renderer — DocNode + DocxSerializer + docAssembler (#94)", done: true },
      { label: "ADO Wiki publisher — wikiAssembler + wikiPublisher (#95)", done: true },
      { label: "PDF renderer — retired 2026-07-17, DocNode + PdfSerializer + pdfAssembler (#67)", done: true },
      { label: "Mermaid → PNG conversion — embedded diagrams in Word output (#68)", done: true },
      { label: "Word theming — styled default + configurable brand colour/fonts (#100)", done: true },
      { label: "CI pipeline + Vitest test suite (#102)", done: true },
      { label: "Ragged-table row padding fix (#103)", done: true },
      { label: "Test coverage: publisher, pipeline entry point, enrichment (#109)", done: true },
      { label: "42 defects found by #109's coverage pass — all fixed (#110)", done: true },
    ]
  },
  {
    phase: "Phase 5 — Governance & Admin Configuration Components", color: "#0891b2", status: "PLANNED",
    items: [
      { label: "Business Process Flow Model & Parser & Renderer (#54)", done: false },
      { label: "Column Security Profile Model & Parser & Renderer (#55)", done: false },
      { label: "Routing Rule Set Model & Parser & Renderer (#56)", done: false },
      { label: "Duplicate Detection Rule Model & Parser & Renderer (#58)", done: false },
      { label: "SLA Model & Parser & Renderer (#59)", done: false },
      { label: "Masking Rule Model & Parser & Renderer — Secured/Attribute (#120)", done: false },
      { label: "Settings Model & Parser & Renderer (#119)", done: false },
    ]
  },
  {
    phase: "Phase 6 — Automation, Copilot & Integration Surfaces", color: "#9333ea", status: "PLANNED",
    items: [
      { label: "Scheduled Flow — recurrence metadata on the existing Flow model (#116)", done: false },
      { label: "Agent Model & Parser & Renderer — Copilot Studio (#118)", done: false },
      { label: "Virtual Table Model & Parser & Renderer (#115)", done: false },
      { label: "Custom Connector Model & Parser & Renderer (#57)", done: false },
      { label: "Plugin source code linking — real .cs source, not just metadata (#97)", done: false },
      { label: "Service Endpoint Model & Parser & Renderer (#61)", done: false },
    ]
  },
  {
    phase: "Backlog — Presentation, Tooling & Long-tail", color: "#64748b", status: "BACKLOG",
    items: [
      { label: "Power Pages Model & Parser & Renderer (#62)", done: true },
      { label: "Auto-trigger pipeline — push/scheduled (#64)", done: false },
      { label: "AI Enrichment — configurable summary tone/length per client (#90)", done: false },
      { label: "PCF Control Model & Parser & Renderer (#53)", done: false },
      { label: "Dashboard Model & Parser & Renderer (#60)", done: false },
      { label: "Custom Page Model & Parser & Renderer (#117)", done: false },
      { label: "CLI flags with commander (#63)", done: false },
      { label: "Git-based changelog (#65)", done: false },
      { label: "IR JSON artifact export (#66)", done: false },
      { label: "Complexity scorer (#70)", done: false },
    ]
  },
];

// ---------------------------------------------------------------------------
// Presentation layer — everything below renders the content above.
// Aesthetic: technical specification sheet. Paper ground, ink type, one
// vermilion accent. Serif for display, mono for data, sans for reading.
// ---------------------------------------------------------------------------

const wikiTree = [
  { indent: 0, kind: "folder", name: "[Solution Name]", done: true },
  { indent: 1, kind: "page", name: "Overview", done: true },
  { indent: 1, kind: "folder", name: "Data Model", done: true },
  { indent: 2, kind: "page", name: "Entity Relationship Diagram", done: true, note: "on Data Model page" },
  { indent: 2, kind: "page", name: "Virtual Tables", done: false },
  { indent: 2, kind: "page", name: "[Table Name] × N", done: true, note: "index page" },
  { indent: 3, kind: "page", name: "Columns", done: true },
  { indent: 3, kind: "page", name: "Views", done: true },
  { indent: 3, kind: "page", name: "Forms", done: true },
  { indent: 3, kind: "page", name: "Relationships", done: true },
  { indent: 3, kind: "page", name: "Business Rules", done: true, note: "index + per-rule pages" },
  { indent: 1, kind: "folder", name: "Automation", done: true },
  { indent: 2, kind: "page", name: "Flows", done: true, note: "summary + per-flow pages with diagrams" },
  { indent: 2, kind: "page", name: "Classic Workflows", done: true, note: "summary + per-workflow pages" },
  { indent: 2, kind: "page", name: "Plugin Assemblies", done: true },
  { indent: 1, kind: "folder", name: "Custom Code", done: true },
  { indent: 2, kind: "page", name: "Web Resources (JS)", done: true, note: "linked summary + per-file pages" },
  { indent: 2, kind: "page", name: "PCF Controls", done: false },
  { indent: 1, kind: "folder", name: "Security", done: true, note: "container page" },
  { indent: 2, kind: "page", name: "Security Roles", done: true, note: "index + per-role matrix pages" },
  { indent: 2, kind: "page", name: "Column Security Profiles", done: false },
  { indent: 2, kind: "page", name: "Masking Rules", done: false },
  { indent: 1, kind: "folder", name: "Integrations", done: true },
  { indent: 2, kind: "page", name: "Environment Variables", done: true },
  { indent: 2, kind: "page", name: "Connection References", done: true },
  { indent: 2, kind: "page", name: "Service Endpoints", done: false },
  { indent: 1, kind: "page", name: "Global Choices", done: true, note: "index + per-choice pages" },
  { indent: 1, kind: "page", name: "Email Templates", done: true, note: "index + per-template pages" },
  { indent: 1, kind: "page", name: "Model-Driven Apps", done: true, note: "index + per-app pages" },
  { indent: 2, kind: "page", name: "Custom Pages", done: false, note: "surfaced alongside owning app" },
  { indent: 1, kind: "page", name: "Copilot Studio Agents", done: false },
  { indent: 1, kind: "page", name: "Change Log", done: false },
  { indent: 1, kind: "page", name: "Business Process Flows", done: false, note: "index + per-BPF pages" },
  { indent: 1, kind: "page", name: "Duplicate Detection Rules", done: false },
  { indent: 1, kind: "page", name: "SLAs", done: false },
  { indent: 1, kind: "page", name: "Dashboards", done: false },
  { indent: 1, kind: "page", name: "Routing Rule Sets", done: false },
  { indent: 1, kind: "page", name: "Custom Connectors", done: false },
  { indent: 1, kind: "page", name: "Power Pages", done: true },
  { indent: 1, kind: "page", name: "Settings", done: false },
];

// Box-drawing prefix for row i: "│  " where an ancestor level continues,
// "├─ " / "└─ " at the row's own depth.
function treePrefix(items, i) {
  const item = items[i];
  let prefix = "";
  for (let d = 1; d <= item.indent; d++) {
    let continues = false;
    for (let j = i + 1; j < items.length; j++) {
      if (items[j].indent < d) break;
      if (items[j].indent === d) { continues = true; break; }
    }
    if (d === item.indent) prefix += continues ? "├─ " : "└─ ";
    else prefix += continues ? "│  " : "   ";
  }
  return prefix;
}

const phaseChip = {
  "COMPLETE": "fill",
  "IN PROGRESS": "accent",
  "PLANNED": "dim",
  "BACKLOG": "dash",
};

function Ticks({ total, done, size = 3, gap = 2, height = 9 }) {
  return (
    <span className="ticks" style={{ gap }}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{ width: size, height, background: i < done ? "var(--accent)" : "var(--hair)" }} />
      ))}
    </span>
  );
}

function Chip({ kind, children }) {
  return <span className={`chip ${kind || ""}`}>{children}</span>;
}

function StatusMark({ done }) {
  return done
    ? <span className="stat built">● BUILT</span>
    : <span className="stat">○ PLANNED</span>;
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

:root {
  --paper: #f2efe8;
  --surface: #faf8f3;
  --ink: #1c1913;
  --soft: #57524a;
  --faint: #9b958a;
  --faint-text: #6f6a5e;
  --hair: #d8d3c6;
  --hair2: #e4e0d5;
  --accent: #cf4500;
  --accent-ink: #a83a05;
  --serif: 'Instrument Serif', Georgia, serif;
  --sans: 'Inter', system-ui, -apple-system, sans-serif;
  --mono: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { color-scheme: light; }
body { background: var(--paper); }

.pad-root {
  min-height: 100vh;
  background: var(--paper);
  background-image: radial-gradient(var(--hair2) 1px, transparent 1px);
  background-size: 28px 28px;
  color: var(--ink);
  font-family: var(--sans);
  -webkit-font-smoothing: antialiased;
}
.pad-shell { max-width: 1260px; margin: 0 auto; padding: 0 48px 72px; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--hair); border-radius: 0; }

:where(.pad-root) a { color: inherit; text-decoration: none; }
:where(.pad-root button) { font: inherit; color: inherit; background: none; border: none; cursor: pointer; border-radius: 0; padding: 0; }
.pad-root button:focus-visible, .pad-root a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* ---- shared atoms ---- */
.label { font: 500 9px/1 var(--mono); letter-spacing: 0.18em; color: var(--soft); text-transform: uppercase; }
.chip { display: inline-block; font: 500 9px/1 var(--mono); letter-spacing: 0.1em; padding: 3px 6px 2px; border: 1px solid var(--ink); color: var(--ink); white-space: nowrap; }
.chip.fill { background: var(--ink); color: var(--paper); }
.chip.mid { border-color: var(--soft); color: var(--soft); }
.chip.dim { border-color: var(--faint); color: var(--faint-text); }
.chip.dash { border-style: dashed; border-color: var(--faint); color: var(--faint-text); }
.chip.accent { border-color: var(--accent); color: var(--accent-ink); }
.chip.bare { border: none; padding: 3px 0 2px; letter-spacing: 0.14em; color: var(--soft); }
.chip.bare.dim { color: var(--faint-text); }
.chip.bare.strike { text-decoration: line-through; }
.stat { font: 500 9px/1 var(--mono); letter-spacing: 0.12em; color: var(--faint-text); white-space: nowrap; }
.stat.built { color: var(--ink); }
.ticks { display: inline-flex; align-items: center; flex-wrap: wrap; row-gap: 2px; max-width: 100%; min-width: 0; }
.tag-line { font: 400 10px/1.8 var(--mono); color: var(--faint-text); letter-spacing: 0.02em; }
.serif-note { font-family: var(--serif); font-style: italic; }

/* ---- header / title block ---- */
.masthead { position: relative; padding: 34px 0 0; }
.eyebrow-row { display: flex; align-items: baseline; gap: 14px; margin-bottom: 26px; }
.brand { font: 600 11px/1 var(--mono); letter-spacing: 0.22em; color: var(--ink); }
.brand::before { content: '■ '; color: var(--accent); }
.eyebrow-sub { font: 400 10px/1.5 var(--mono); letter-spacing: 0.18em; color: var(--faint-text); }
.mast-links { margin-left: auto; display: flex; gap: 22px; }
.mast-links a { font: 500 10px/1 var(--mono); letter-spacing: 0.1em; color: var(--soft); border-bottom: 1px solid transparent; padding-bottom: 2px; white-space: nowrap; }
.mast-links a:hover { color: var(--accent-ink); border-bottom-color: var(--accent); }

.mast-grid { display: grid; grid-template-columns: 1fr 292px; gap: 48px; align-items: start; }
.mast-title { font-family: var(--serif); font-weight: 400; font-size: 52px; line-height: 1.02; letter-spacing: -0.015em; margin: 0 0 18px; max-width: 640px; }
.mast-title em { font-style: italic; color: var(--accent-ink); }
.mast-desc { font-size: 13px; line-height: 1.75; color: var(--soft); max-width: 620px; }

.tblock { border: 1px solid var(--ink); background: var(--surface); }
.tblock-row { display: grid; grid-template-columns: 96px 1fr; border-top: 1px solid var(--hair); }
.tblock-row:first-child { border-top: none; }
.tblock-k { font: 500 9px/1 var(--mono); letter-spacing: 0.16em; color: var(--faint-text); padding: 10px 12px 9px; border-right: 1px solid var(--hair); }
.tblock-v { font: 500 10px/1.4 var(--mono); letter-spacing: 0.04em; color: var(--ink); padding: 8px 12px 7px; }
.tblock-v a { border-bottom: 1px solid var(--hair); }
.tblock-v a:hover { color: var(--accent-ink); border-bottom-color: var(--accent); }

.progress-row { display: flex; align-items: center; gap: 18px; margin: 30px 0 0; flex-wrap: wrap; }
.progress-count { font: 500 11px/1 var(--mono); letter-spacing: 0.06em; color: var(--soft); }
.progress-count strong { color: var(--ink); font-weight: 700; }
.progress-phase { font: 400 10px/1.5 var(--mono); letter-spacing: 0.08em; color: var(--faint-text); }

.tab-row { display: flex; gap: 34px; margin-top: 26px; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--hair); }
.tab { font: 500 10.5px/1 var(--mono); letter-spacing: 0.14em; color: var(--faint-text); padding: 15px 0 13px; border-bottom: 2px solid transparent; margin-bottom: -1px; text-transform: uppercase; transition: color 0.15s; white-space: nowrap; }
.tab:hover { color: var(--ink); }
.tab.active { color: var(--ink); border-bottom-color: var(--accent); }
.tab .tnum { color: var(--faint); margin-right: 7px; }
.tab.active .tnum { color: var(--accent-ink); }

.deck { padding-top: 36px; }
.sec-label { font: 500 9px/1 var(--mono); letter-spacing: 0.2em; color: var(--soft); text-transform: uppercase; margin-bottom: 18px; }

/* ---- architecture tab ---- */
.filter-row { display: flex; align-items: center; gap: 8px; margin-bottom: 28px; flex-wrap: wrap; }
.filter-label { font: 500 9px/1 var(--mono); letter-spacing: 0.18em; color: var(--soft); margin-right: 6px; }
.fbtn { font: 500 9.5px/1 var(--mono); letter-spacing: 0.12em; padding: 7px 12px 6px; border: 1px solid var(--faint); color: var(--soft); background: var(--surface); transition: all 0.12s; white-space: nowrap; }
.fbtn:hover { border-color: var(--ink); color: var(--ink); }
.fbtn.active { background: var(--ink); border-color: var(--ink); color: var(--paper); }
.filter-key { font: 400 10px/1.5 var(--mono); color: var(--faint-text); margin-left: 10px; letter-spacing: 0.02em; }

.arch-grid { display: grid; grid-template-columns: 330px 1fr; gap: 36px; align-items: start; }

.rail { position: sticky; top: 28px; }
.lbtn { display: grid; grid-template-columns: 32px 1fr; gap: 16px; width: 100%; text-align: left; padding: 0; margin-bottom: 22px; position: relative; }
.lbtn:last-child { margin-bottom: 0; }
.lbtn:not(:last-child)::after { content: ''; position: absolute; left: 15px; top: 36px; bottom: -18px; width: 1px; background: var(--hair); }
.lnum { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font: 600 11px/1 var(--mono); border: 1px solid var(--hair); background: var(--surface); color: var(--soft); transition: all 0.15s; }
.lbtn:hover .lnum { border-color: var(--ink); color: var(--ink); }
.lbtn.active .lnum { background: var(--accent); border-color: var(--accent); color: #fff; }
.lbody { padding-top: 2px; }
.lname-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
.lname { font: 600 11px/1 var(--mono); letter-spacing: 0.12em; color: var(--ink); transition: color 0.15s; }
.lbtn:hover .lname { color: var(--accent-ink); }
.lbtn.active .lname { color: var(--accent-ink); }
.lcount { font: 400 9.5px/1 var(--mono); color: var(--faint-text); margin-left: auto; letter-spacing: 0.04em; }
.ldesc { font-size: 11.5px; line-height: 1.55; color: var(--soft); margin-bottom: 8px; }

.panel { background: var(--surface); border: 1px solid var(--hair); padding: 28px 32px 20px; min-height: 320px; }
.panel-head { border-bottom: 1px solid var(--ink); padding-bottom: 18px; }
.panel-label { font: 500 9.5px/1 var(--mono); letter-spacing: 0.18em; color: var(--accent-ink); margin-bottom: 10px; }
.panel-desc { font-family: var(--serif); font-style: italic; font-size: 21px; line-height: 1.3; color: var(--ink); }
.panel-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 160px; gap: 14px; }
.panel-empty .hint { font-family: var(--serif); font-style: italic; font-size: 21px; color: var(--faint-text); }

.rows { animation: rise 0.3s cubic-bezier(0.2, 0.7, 0.3, 1); }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.crow { display: grid; grid-template-columns: 44px 1fr; gap: 0 14px; padding: 15px 0 14px; border-top: 1px solid var(--hair2); }
.crow:first-child { border-top: none; }
.cidx { font: 500 10px/1 var(--mono); color: var(--faint-text); padding-top: 3px; letter-spacing: 0.04em; }
.cname-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: start; }
.cname-group { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cname { font-size: 13px; font-weight: 600; color: var(--ink); }
.crow.planned .cname { color: var(--soft); }
.cname-row .stat { padding-top: 3px; }
.cdetail { font-size: 12px; line-height: 1.65; color: var(--soft); margin-top: 5px; max-width: 780px; }
.crow.planned .cdetail { color: var(--faint-text); }

/* ---- progress tab ---- */
.phase-block { border: 1px solid var(--hair); background: var(--surface); margin-bottom: 16px; }
.phase-head { display: flex; align-items: center; gap: 14px; padding: 16px 22px 14px; border-bottom: 1px solid var(--hair2); flex-wrap: wrap; }
.phase-num { font: 600 10px/1 var(--mono); letter-spacing: 0.14em; color: var(--accent-ink); }
.phase-name { font-family: var(--serif); font-size: 21px; color: var(--ink); }
.phase-meta { margin-left: auto; display: flex; align-items: center; gap: 14px; }
.phase-count { font: 500 10px/1 var(--mono); color: var(--soft); letter-spacing: 0.04em; }
.phase-items { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 32px; padding: 16px 22px 18px; }
.pitem { display: flex; align-items: baseline; gap: 9px; font-size: 12px; line-height: 1.9; }
.pitem .pmark { font: 400 9px/1 var(--mono); color: var(--ink); flex-shrink: 0; position: relative; top: -1px; }
.pitem.todo .pmark { color: var(--faint); }
.pitem .ptext { color: var(--ink); }
.pitem.todo .ptext { color: var(--faint-text); }

.note-block { border-top: 1px solid var(--ink); padding: 18px 0; margin-top: 28px; }
.note-label { font: 600 9px/1 var(--mono); letter-spacing: 0.2em; color: var(--accent-ink); margin-bottom: 10px; }
.note-body { font-size: 12.5px; line-height: 1.75; color: var(--soft); max-width: 64ch; }
.note-body strong { color: var(--ink); font-weight: 600; }

/* ---- wiki tab ---- */
.tree-card { background: var(--surface); border: 1px solid var(--hair); padding: 24px 40px 24px 28px; margin-bottom: 36px; overflow-x: auto; width: fit-content; min-width: min(620px, 100%); max-width: 100%; }
.tree-intro { font-size: 12.5px; line-height: 1.7; color: var(--soft); max-width: 56ch; margin-bottom: 6px; }
.tree-legend { font: 400 9.5px/1.5 var(--mono); letter-spacing: 0.1em; color: var(--faint-text); margin-bottom: 14px; }
.tree-legend .b { color: var(--accent-ink); }
.tree-legend .p { color: var(--faint); }
.tree { font: 400 12px/1.6 var(--mono); white-space: pre; }
.tree .guide { color: var(--hair); }
.tree .tname { color: var(--ink); }
.tree .tname.folder { font-weight: 600; }
.tree .planned-row .tname { color: var(--faint-text); font-weight: 400; }
.tree .tmark { color: var(--accent-ink); }
.tree .planned-row .tmark { color: var(--faint); }
.tree .tnote { font-family: var(--serif); font-style: italic; font-size: 13px; color: var(--faint-text); }

.pages-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 40px; }
.pg-row { padding: 13px 0 12px; border-top: 1px solid var(--hair2); }
.pg-name-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: start; margin-bottom: 4px; }
.pg-name { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.pg-row.planned .pg-name { color: var(--soft); }
.pg-name-row .stat { padding-top: 2px; }
.pg-desc { font-size: 11.5px; line-height: 1.6; color: var(--soft); }
.pg-row.planned .pg-desc { color: var(--faint-text); }

/* ---- decisions tab ---- */
.dec-card { background: var(--surface); border: 1px solid var(--hair); }
.dec-head { display: grid; grid-template-columns: 52px 200px 220px 1fr; gap: 18px; padding: 12px 22px; border-bottom: 1px solid var(--ink); }
.dec-head .label { color: var(--faint-text); }
.dec-row { display: grid; grid-template-columns: 52px 200px 220px 1fr; gap: 18px; padding: 14px 22px 13px; border-bottom: 1px solid var(--hair2); }
.dec-row:last-child { border-bottom: none; }
.dec-idx { font: 500 10px/1.6 var(--mono); color: var(--faint-text); letter-spacing: 0.04em; }
.dec-q { font-size: 12px; font-weight: 600; color: var(--ink); line-height: 1.6; }
.dec-a { font: 500 11px/1.6 var(--mono); color: var(--ink); letter-spacing: 0.01em; }
.dec-r { font-size: 12px; line-height: 1.6; color: var(--soft); max-width: 68ch; }

/* ---- footer ---- */
.colophon { display: flex; align-items: baseline; gap: 14px; margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--hair); flex-wrap: wrap; }
.colophon .label { color: var(--faint-text); }
.colophon .right { margin-left: auto; font: 400 9.5px/1.5 var(--mono); letter-spacing: 0.1em; color: var(--faint-text); }

@media (max-width: 980px) {
  .pad-shell { padding: 0 22px 56px; }
  .eyebrow-row { flex-wrap: wrap; row-gap: 10px; }
  .mast-links { margin-left: 0; flex-basis: 100%; }
  .mast-grid { grid-template-columns: 1fr; gap: 26px; }
  .mast-title { font-size: 38px; }
  .progress-row .ticks { flex: 1 1 100%; }
  .arch-grid { grid-template-columns: 1fr; }
  .rail { position: static; }
  .phase-items { grid-template-columns: 1fr; }
  .pages-grid { grid-template-columns: 1fr; }
  .dec-head { display: none; }
  .dec-row { grid-template-columns: 52px 1fr; grid-template-rows: auto auto auto; }
  .dec-a { grid-column: 2; }
  .dec-r { grid-column: 2; }
  .tab-row { flex-wrap: wrap; gap: 8px 20px; }
}
`;

export default function App() {
  const [activeLayer, setActiveLayer] = useState("input");
  const [activeTab, setActiveTab] = useState("architecture");
  const [moscowFilter, setMoscowFilter] = useState(null);

  const active = layers.find(l => l.id === activeLayer);
  const totalComponents = layers.flatMap(l => l.components).length;
  const doneComponents = layers.flatMap(l => l.components).filter(c => c.done).length;
  const pct = Math.round(doneComponents / totalComponents * 100);

  const filteredComponents = active
    ? (moscowFilter ? active.components.filter(c => c.moscow === moscowFilter) : active.components)
    : [];

  const layerNum = label => label.split(" — ")[0];
  const layerName = label => label.split(" — ")[1];

  return (
    <div className="pad-root">
      <style>{css}</style>
      <div className="pad-shell">

        <header className="masthead">
          <div className="eyebrow-row">
            <span className="brand">POWERAUTODOCS</span>
            <span className="eyebrow-sub">SYSTEM ARCHITECTURE</span>
            <nav className="mast-links">
              <a href="https://www.npmjs.com/package/powerautodocs">npm ↗</a>
              <a href="https://github.com/lewginn/PowerAutoDocs">GitHub ↗</a>
              <a href="https://github.com/users/lewginn/projects/3">Project board ↗</a>
            </nav>
          </div>

          <div className="mast-grid">
            <div>
              <h1 className="mast-title">Automated <em>as-built</em> documentation for Power Platform</h1>
              <p className="mast-desc">
                A reusable pipeline that reads Power Platform solution artifacts directly from Git and produces
                structured, cross-linked wiki documentation in Azure DevOps — including Mermaid flow diagrams,
                nested action trees, business rules, plugin registrations, web resource indexes, security role
                matrices, environment variables, global choices, email templates, model-driven apps and
                auto-generated ER diagrams. Published as <strong>powerautodocs</strong> on npm.
              </p>
            </div>
            <aside className="tblock">
              <div className="tblock-row">
                <span className="tblock-k">PACKAGE</span>
                <span className="tblock-v"><a href="https://www.npmjs.com/package/powerautodocs">powerautodocs</a></span>
              </div>
              <div className="tblock-row">
                <span className="tblock-k">PIPELINE</span>
                <span className="tblock-v">INPUT → PARSE → IR → ENRICH → OUTPUT</span>
              </div>
              <div className="tblock-row">
                <span className="tblock-k">STATUS</span>
                <span className="tblock-v">PHASES 1–4 COMPLETE</span>
              </div>
              <div className="tblock-row">
                <span className="tblock-k">COVERAGE</span>
                <span className="tblock-v">{doneComponents} / {totalComponents} COMPONENTS · {pct}%</span>
              </div>
            </aside>
          </div>

          <div className="progress-row">
            <Ticks total={totalComponents} done={doneComponents} />
            <span className="progress-count"><strong>{doneComponents}</strong> of {totalComponents} components built</span>
            <span className="progress-phase">PHASES 1–4 COMPLETE · PHASE 5, PHASE 6 &amp; BACKLOG PLANNED</span>
          </div>

          <div className="tab-row">
            {["architecture", "progress", "wiki structure", "decisions"].map((tab, i) => (
              <button key={tab} className={`tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                <span className="tnum">{String(i + 1).padStart(2, "0")}</span>{tab}
              </button>
            ))}
          </div>
        </header>

        <main className="deck">

          {activeTab === "architecture" && (
            <div>
              <div className="filter-row">
                <span className="filter-label">FILTER — PRIORITY</span>
                <button className={`fbtn ${moscowFilter === null ? "active" : ""}`} onClick={() => setMoscowFilter(null)}>ALL</button>
                {Object.entries(moscow).map(([key, val]) => (
                  <button key={key} className={`fbtn ${moscowFilter === key ? "active" : ""}`}
                    onClick={() => setMoscowFilter(moscowFilter === key ? null : key)}>{val.label}</button>
                ))}
                <span className="filter-key">MoSCoW — must · should · could · won't (for now)</span>
              </div>

              <div className="arch-grid">
                <div className="rail">
                  {layers.map((layer) => {
                    const dc = layer.components.filter(c => c.done).length;
                    const tot = layer.components.length;
                    const visibleCount = moscowFilter ? layer.components.filter(c => c.moscow === moscowFilter).length : tot;
                    return (
                      <button key={layer.id} className={`lbtn ${activeLayer === layer.id ? "active" : ""}`}
                        onClick={() => setActiveLayer(activeLayer === layer.id ? null : layer.id)}>
                        <span className="lnum">{layerNum(layer.label)}</span>
                        <span className="lbody">
                          <span className="lname-row">
                            <span className="lname">{layerName(layer.label)}</span>
                            <span className="lcount">{dc}/{tot} built{moscowFilter && visibleCount !== tot ? ` · ${visibleCount} shown` : ""}</span>
                          </span>
                          <span className="ldesc" style={{ display: "block" }}>{layer.description}</span>
                          <Ticks total={tot} done={dc} size={4} height={7} />
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="panel">
                  {!active && (
                    <div className="panel-empty" style={{ minHeight: 320 }}>
                      <span className="hint">Select a layer from the pipeline index.</span>
                    </div>
                  )}
                  {active && (
                    <div className="rows" key={active.id + (moscowFilter || "")}>
                      <div className="panel-head">
                        <div className="panel-label">
                          {active.label} · {filteredComponents.length} COMPONENT{filteredComponents.length !== 1 ? "S" : ""}
                          {moscowFilter ? ` · ${moscow[moscowFilter].label} ONLY` : ""}
                        </div>
                        <div className="panel-desc">{active.description}</div>
                      </div>
                      {filteredComponents.length === 0 && (
                        <div className="panel-empty" style={{ minHeight: 160 }}>
                          <span className="hint">No {moscow[moscowFilter]?.label} components in this layer.</span>
                        </div>
                      )}
                      {filteredComponents.map((comp, i) => {
                        const m = moscow[comp.moscow];
                        return (
                          <div key={comp.name} className={`crow ${comp.done ? "" : "planned"}`}>
                            <span className="cidx">{layerNum(active.label)}·{String(i + 1).padStart(2, "0")}</span>
                            <div>
                              <div className="cname-row">
                                <span className="cname-group">
                                  <span className="cname">{comp.name}</span>
                                  <Chip kind={m.cls}>{m.label}</Chip>
                                </span>
                                <StatusMark done={comp.done} />
                              </div>
                              <div className="cdetail">{comp.detail}</div>
                              <div className="tag-line">{comp.tags.map(t => `[${t}]`).join("  ")}</div>
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
            <div style={{ maxWidth: 1000 }}>
              <div className="sec-label">Build progress</div>
              {progress.map(p => {
                const dc = p.items.filter(i => i.done).length;
                const tot = p.items.length;
                const [pnum, pname] = p.phase.split(" — ");
                return (
                  <div key={p.phase} className="phase-block">
                    <div className="phase-head">
                      <span className="phase-num">{pnum.toUpperCase()}</span>
                      <span className="phase-name">{pname}</span>
                      <span className="phase-meta">
                        <Ticks total={tot} done={dc} size={4} height={8} />
                        <span className="phase-count">{dc}/{tot}</span>
                        <Chip kind={phaseChip[p.status] || "dim"}>{p.status}</Chip>
                      </span>
                    </div>
                    <div className="phase-items">
                      {p.items.map(item => (
                        <div key={item.label} className={`pitem ${item.done ? "" : "todo"}`}>
                          <span className="pmark">{item.done ? "■" : "□"}</span>
                          <span className="ptext">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="note-block">
                <div className="note-label">NOTE — CURRENT STATE</div>
                <div className="note-body">
                  <strong>Phases 1–4 are complete and producing real output on live client solutions.</strong> The full pipeline
                  — data model, flows, classic workflows, business rules, plugins, web resources, security roles,
                  environment variables, global choices, email templates, model-driven apps and ER diagrams — publishes end-to-end via ADO pipeline.
                  AI enrichment and Word (.docx) output are both shipped and current. PDF output also shipped, but is planned for deprecation
                  (Lewis, 2026-07-17) — see the "PDF output — deprecation planned?" decision on the Decisions tab.
                  Phase 5 adds Dataverse governance/admin-configuration components (BPF, column security, routing rules, SLAs,
                  masking rules, settings); Phase 6 adds automation, Copilot and integration surfaces (scheduled flow metadata,
                  Copilot Studio agents, virtual tables, custom connectors, plugin source linking, service endpoints).
                </div>
              </div>
            </div>
          )}

          {activeTab === "wiki structure" && (
            <div style={{ maxWidth: 1000 }}>
              <div className="sec-label">ADO wiki page hierarchy</div>
              <div className="tree-card">
                <p className="tree-intro">
                  Each solution gets its own top-level wiki section. Pages are generated from the IR layer and published via ADO REST API.
                </p>
                <div className="tree-legend"><span className="b">●</span> BUILT &nbsp;·&nbsp; <span className="p">○</span> PLANNED</div>
                <div className="tree">
                  {wikiTree.map((item, i) => (
                    <div key={i} className={item.done ? "" : "planned-row"}>
                      <span className="guide">{treePrefix(wikiTree, i)}</span>
                      <span className="tmark">{item.done ? "● " : "○ "}</span>
                      <span className={`tname ${item.kind === "folder" ? "folder" : ""}`}>{item.name}</span>
                      {item.note && <span className="tnote">{"  "}— {item.note}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="sec-label">Pages built so far</div>
              <div className="pages-grid">
                {pages.map(page => {
                  const m = moscow[page.moscow];
                  return (
                    <div key={page.name} className={`pg-row ${page.done ? "" : "planned"}`}>
                      <div className="pg-name-row">
                        <span className="cname-group">
                          <span className="pg-name">{page.name}</span>
                          <Chip kind={m.cls}>{m.label}</Chip>
                        </span>
                        <StatusMark done={page.done} />
                      </div>
                      <div className="pg-desc">{page.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "decisions" && (
            <div>
              <div className="sec-label">Key architectural decisions — confirmed in build</div>
              <div className="dec-card">
                <div className="dec-head">
                  <span className="label">No.</span>
                  <span className="label">Decision</span>
                  <span className="label">Choice</span>
                  <span className="label">Rationale</span>
                </div>
                {decisions.map((d, i) => (
                  <div key={d.q} className="dec-row">
                    <span className="dec-idx">D{String(i + 1).padStart(2, "0")}</span>
                    <span className="dec-q">{d.q}</span>
                    <span className="dec-a">{d.a}</span>
                    <span className="dec-r">{d.reason}</span>
                  </div>
                ))}
              </div>
              <div className="note-block">
                <div className="note-label">NOTE — THE CONTRACT</div>
                <div className="note-body">
                  <strong>IR is the contract.</strong> Parsers only produce IR. Renderers only consume IR.
                  Neither knows about the other. Renderers emit DocNode[] (format-agnostic); MarkdownSerializer converts to ADO Wiki markdown,
                  DocxSerializer converts to Word (.docx) via the docx library. New output formats only need a new serializer.
                </div>
              </div>
            </div>
          )}

        </main>

        <footer className="colophon">
          <span className="label">POWERAUTODOCS · SYSTEM ARCHITECTURE</span>
          <span className="right">MAINTAINED IN docs/architecture.jsx · DEPLOYED VIA GITHUB PAGES</span>
        </footer>

      </div>
    </div>
  );
}
