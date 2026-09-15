import { AppDefinition, appDefinitionSchema } from '../schema/appDefinition.schema';
import { AiProviderConfig } from './providerConfig';

export type AppMutationResult = {
  app: AppDefinition;
  summary: string;
};

export type AppMutationConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AppMutationPlanResult = {
  message: string;
  questions: string[];
  plan: string[];
  readyToBuild: boolean;
};

export type AppBuildMode = 'create' | 'customize';

export const APP_MUTATION_SYSTEM_PROMPT = 'You generate strict JSON app definitions for Tinkaar.';

const APP_MUTATION_PLANNING_SYSTEM_PROMPT = 'You help users safely plan Tinkaar app definition changes before code generation.';
const APP_CREATION_SYSTEM_PROMPT = 'You generate strict JSON app definitions for new Tinkaar apps.';
const APP_INTERFACE_PATTERN_GUIDE = [
  'Reference interface patterns:',
  '- Notes/journals: one Notes table with title:text required, content:textarea, created_date:date, optional tags:multiselect. Main page has a list of note cards and a FAB/openModal button. Add/edit forms must be separate modal pages.',
  '- Task/status trackers: one primary table with title, status:picklist, due_date:date, notes:textarea. Main page has list cards, optional status badges, and add/edit modal pages.',
  '- Inventory/CRM/vendor apps: use two or more related tables only when the request names distinct record types. Each table needs a list page or dashboard section plus add/edit modal pages.',
  '- Dashboards: use widgets only when backing fields exist. Keep dashboards read-only, then link to list/detail actions.',
  '- Form pages: never put create/edit forms directly on the main screen unless the user explicitly asks for a single permanent form. Default to modal pages opened by buttons.',
  '- FAB actions: every floating add button must be { type: "openModal", target: "<existing add modal pageId>" }. The target page layout must be { kind: "complex", type: "modal" }.',
  '- Edit actions: list item edit buttons must pass the table and open an existing edit modal page.',
  '- Supported components only: container.screen, container.stack, container.grid, container.list, container.card, container.table, complex.modal, primitive.text, primitive.button, primitive.checkbox, primitive.switch, primitive.radiogroup, primitive.checkboxgroup, primitive.input, primitive.datepicker, primitive.select, primitive.badge, primitive.divider, primitive.progressbar, widget.statcard, widget.category-breakdown, widget.timeline.',
  '- Do not invent component names like container.header, widget.list, primitive.fab, container.form, or widget.card.',
].join('\n');

export const APP_MUTATION_INSTRUCTIONS = [
  'You are editing a Tinkaar app definition JSON document.',
  'Return only JSON. No markdown fences, no prose outside JSON.',
  'The JSON response must be an object with two keys: "summary" and "app".',
  '"app" must be a complete AppDefinition, not a patch.',
  'Keep the same appId. Preserve existing tables, pages, navigation, data storage, and cloudSync unless the user explicitly asks to change them.',
  'Use only these node kinds: primitive, complex, container, widget.',
  'Use only supported action types: createRecord, updateRecord, deleteRecord, openModal, closeModal, navigate, toggleField, showToast.',
  'Use only supported field types from the current app schema.',
  'Make app changes practical for a mobile CRUD app: add fields to forms and lists when needed, keep labels short, and preserve required validations.',
];

type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

export async function generateAppMutation({
  provider,
  currentApp,
  prompt,
  approvedPlan,
}: {
  provider: AiProviderConfig;
  currentApp: AppDefinition;
  prompt: string;
  approvedPlan?: string[];
}): Promise<AppMutationResult> {
  const instructions = createMutationPrompt(currentApp, prompt, approvedPlan);
  const content = provider.kind === 'gemini'
    ? await requestGeminiMutation(provider, instructions, APP_MUTATION_SYSTEM_PROMPT)
    : await requestOpenAiCompatibleMutation(provider, instructions, APP_MUTATION_SYSTEM_PROMPT);
  const parsed = parseJsonObject(content);
  const candidate = isObject(parsed) && isObject(parsed.app) ? parsed.app : parsed;
  const sanitizedCandidate = sanitizeGeneratedAppCandidate(candidate, currentApp);
  const validated = appDefinitionSchema.safeParse(sanitizedCandidate);

  if (!validated.success) {
    throw new Error(`AI returned an invalid app definition: ${validated.error.message}`);
  }

  const app = sanitizeAppReferences(normalizeMutatedApp(currentApp, validated.data));
  const referenceError = validateAppReferences(app);
  if (referenceError) {
    throw new Error(referenceError);
  }

  const fieldError = validateAppFieldReferences(app);
  if (fieldError) {
    throw new Error(fieldError);
  }

  return {
    app,
    summary: isObject(parsed) && typeof parsed.summary === 'string' ? parsed.summary : 'Generated an updated app definition.',
  };
}

export async function generateAppMutationPlan({
  provider,
  currentApp,
  messages,
  mode = currentApp ? 'customize' : 'create',
  existingAppIds = [],
}: {
  provider: AiProviderConfig;
  currentApp?: AppDefinition;
  messages: AppMutationConversationMessage[];
  mode?: AppBuildMode;
  existingAppIds?: string[];
}): Promise<AppMutationPlanResult> {
  const instructions = createPlanningPrompt({ currentApp, messages, mode, existingAppIds });
  const content = provider.kind === 'gemini'
    ? await requestGeminiMutation(provider, instructions, APP_MUTATION_PLANNING_SYSTEM_PROMPT)
    : await requestOpenAiCompatibleMutation(provider, instructions, APP_MUTATION_PLANNING_SYSTEM_PROMPT);
  const parsed = parseJsonObject(content);

  if (!isObject(parsed)) {
    throw new Error('AI planner did not return a JSON object.');
  }

  const questions = normalizeStringArray(parsed.questions).slice(0, 3);
  const plan = normalizeStringArray(parsed.plan).slice(0, 6);
  const readyToBuild = parsed.readyToBuild === true && plan.length > 0 && questions.length === 0;
  const message = typeof parsed.message === 'string' && parsed.message.trim()
    ? parsed.message.trim()
    : readyToBuild
      ? 'I can make this change. Please review the plan before I build it.'
      : 'I need a little more detail before I can build this safely.';

  return {
    message,
    questions,
    plan,
    readyToBuild,
  };
}

export async function generateNewAppDefinition({
  provider,
  prompt,
  approvedPlan,
  existingAppIds = [],
}: {
  provider: AiProviderConfig;
  prompt: string;
  approvedPlan: string[];
  existingAppIds?: string[];
}): Promise<AppMutationResult> {
  const instructions = createNewAppPrompt(prompt, approvedPlan, existingAppIds);
  const content = provider.kind === 'gemini'
    ? await requestGeminiMutation(provider, instructions, APP_CREATION_SYSTEM_PROMPT)
    : await requestOpenAiCompatibleMutation(provider, instructions, APP_CREATION_SYSTEM_PROMPT);
  const parsed = parseJsonObject(content);
  const candidate = isObject(parsed) && isObject(parsed.app) ? parsed.app : parsed;
  const normalizedCandidate = normalizeNewAppCandidate(candidate, existingAppIds);
  const validated = appDefinitionSchema.safeParse(normalizedCandidate);

  if (!validated.success) {
    const fallback = createFallbackNewAppDefinition(prompt, approvedPlan, existingAppIds);
    return {
      app: fallback,
      summary: 'Created a simple starter app you can edit from here.',
    };
  }

  const app = sanitizeAppReferences(normalizeNewApp(validated.data, existingAppIds));
  const referenceError = validateAppReferences(app);
  if (referenceError) {
    const fallback = createFallbackNewAppDefinition(prompt, approvedPlan, existingAppIds);
    return {
      app: fallback,
      summary: 'Created a simple starter app you can edit from here.',
    };
  }

  const fieldError = validateAppFieldReferences(app);
  if (fieldError) {
    const fallback = createFallbackNewAppDefinition(prompt, approvedPlan, existingAppIds);
    return {
      app: fallback,
      summary: 'Created a simple starter app you can edit from here.',
    };
  }

  return {
    app,
    summary: isObject(parsed) && typeof parsed.summary === 'string' ? parsed.summary : 'Generated a new app definition.',
  };
}

function createMutationPrompt(currentApp: AppDefinition, userPrompt: string, approvedPlan: string[] | undefined) {
  return [
    ...APP_MUTATION_INSTRUCTIONS,
    APP_INTERFACE_PATTERN_GUIDE,
    'Follow the approved plan when one is provided. If conversation context conflicts with the approved plan, the approved plan wins.',
    '',
    `User request and conversation: ${userPrompt}`,
    '',
    approvedPlan?.length ? `Approved implementation plan:\n${approvedPlan.map((item) => `- ${item}`).join('\n')}` : 'Approved implementation plan: none provided.',
    '',
    'Current app definition JSON:',
    JSON.stringify(currentApp),
  ].join('\n');
}

function createNewAppPrompt(userPrompt: string, approvedPlan: string[], existingAppIds: string[]) {
  return [
    ...APP_MUTATION_INSTRUCTIONS,
    APP_INTERFACE_PATTERN_GUIDE,
    'You are creating a brand-new Tinkaar app definition JSON document from scratch.',
    'Return only JSON. No markdown fences, no prose outside JSON.',
    'The JSON response must be an object with two keys: "summary" and "app".',
    '"app" must be a complete AppDefinition.',
    'Choose a short lowercase kebab-case appId that is not in the existing app id list.',
    'Use version "1.0.0".',
    'The app.data object is required. Use sqlite storage. Set data.storage.databaseName to a short unique database filename for this app.',
    'The app.data.operations array is required and must include list/create/update/delete operations for each CRUD table.',
    'Omit data.cloudSync unless the user asks for cloud sync. If included, data.cloudSync.engine must be exactly "supabase".',
    'Do not include seedData.',
    'Design a practical mobile CRUD app: define focused tables, list/create/update/delete operations, at least one main list page, and add/edit modal pages for primary records.',
    'For a simple note taker, do not create only a form. Create a Notes list screen, a New Note modal, and an Edit Note modal.',
    'Include navigation items only for non-modal user-facing pages.',
    'Add helpful empty states, concise field labels, useful required validations, and simple dashboard widgets only when their fields exist.',
    '',
    `Existing app ids: ${existingAppIds.length ? existingAppIds.join(', ') : 'none'}`,
    '',
    `User request and conversation: ${userPrompt}`,
    '',
    `Approved implementation plan:\n${approvedPlan.map((item) => `- ${item}`).join('\n')}`,
  ].join('\n');
}

function createPlanningPrompt({
  currentApp,
  messages,
  mode,
  existingAppIds,
}: {
  currentApp?: AppDefinition;
  messages: AppMutationConversationMessage[];
  mode: AppBuildMode;
  existingAppIds: string[];
}) {
  const context = mode === 'customize' && currentApp
    ? [
        'Current app summary:',
        createAppSummary(currentApp),
        '',
      ]
    : [
        'You are planning a brand-new app from scratch.',
        `Existing app ids: ${existingAppIds.length ? existingAppIds.join(', ') : 'none'}`,
        '',
      ];

  return [
    mode === 'customize'
      ? 'You are planning a change to an existing Tinkaar mobile CRUD app definition.'
      : 'You are planning a brand-new Tinkaar mobile CRUD app definition.',
    'Return only JSON. No markdown fences, no prose outside JSON.',
    'The JSON response must be an object with these keys: "message", "questions", "plan", and "readyToBuild".',
    '"questions" must be an array of short clarifying questions. Ask questions when the request is ambiguous, destructive, changes data shape without clear labels/types, or could remove existing behavior.',
    '"plan" must be an array of concise implementation steps when the request is clear enough to build.',
    '"readyToBuild" must be true only when no more clarification is needed and the plan is specific enough for the user to approve.',
    mode === 'customize'
      ? 'Preserve the same appId, storage, and cloudSync. Avoid deleting fields, pages, navigation, or data unless the user explicitly asked for it.'
      : 'For a new app, plan the app name, core tables, primary fields, main screens, forms, navigation, and any useful dashboard widgets.',
    'Do not generate the full app definition in this planning response.',
    APP_INTERFACE_PATTERN_GUIDE,
    '',
    ...context,
    'Conversation so far:',
    messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n'),
  ].join('\n');
}

async function requestOpenAiCompatibleMutation(provider: AiProviderConfig, prompt: string, systemPrompt: string) {
  const requestBody: Record<string, unknown> = {
    model: provider.model.trim(),
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  if (!usesDefaultTemperatureOnly(provider)) {
    requestBody.temperature = 0.2;
  }

  const response = await fetch(`${trimTrailingSlash(provider.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${provider.apiKey.trim()}`,
      'Content-Type': 'application/json',
      ...parseExtraHeaders(provider.headersJson),
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`AI provider request failed (${response.status}): ${await response.text()}`);
  }

  const parsed = (await response.json()) as OpenAiCompatibleResponse;
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI provider did not return content.');
  }

  return content;
}

function usesDefaultTemperatureOnly(provider: AiProviderConfig) {
  const baseUrl = provider.baseUrl.trim().toLowerCase();
  const model = provider.model.trim().toLowerCase();

  return (
    provider.presetId === 'microsoft-foundry' ||
    baseUrl.includes('services.ai.azure.com') ||
    baseUrl.includes('.openai.azure.com') ||
    baseUrl.includes('ai.azure.com') ||
    model.startsWith('gpt-5') ||
    model.startsWith('gpt-6') ||
    /^o\d/.test(model)
  );
}

async function requestGeminiMutation(provider: AiProviderConfig, prompt: string, systemPrompt: string) {
  const model = encodeURIComponent(provider.model.trim());
  const response = await fetch(`${trimTrailingSlash(provider.baseUrl)}/models/${model}:generateContent?key=${encodeURIComponent(provider.apiKey.trim())}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...parseExtraHeaders(provider.headersJson),
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${prompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${await response.text()}`);
  }

  const parsed = (await response.json()) as GeminiResponse;
  const content = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
  if (!content) {
    throw new Error('Gemini did not return content.');
  }

  return content;
}

function normalizeMutatedApp(currentApp: AppDefinition, nextApp: AppDefinition): AppDefinition {
  const versionSuffix = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

  return {
    ...nextApp,
    appId: currentApp.appId,
    name: nextApp.name.trim() || currentApp.name,
    version: `${currentApp.version || '1.0.0'}-ai-${versionSuffix}`,
    data: {
      ...nextApp.data,
      storage: currentApp.data.storage,
      cloudSync: currentApp.data.cloudSync,
    },
  };
}

function normalizeNewAppCandidate(candidate: unknown, existingAppIds: string[]) {
  if (!isObject(candidate)) {
    return createFallbackNewAppDefinition('', [], existingAppIds);
  }

  const appId = createUniqueAppId(
    typeof candidate.appId === 'string' ? candidate.appId : typeof candidate.name === 'string' ? candidate.name : '',
    existingAppIds,
  );
  const tables = normalizeTables(candidate.tables);
  const data = isObject(candidate.data) ? candidate.data : {};
  const { cloudSync: _ignoredCloudSync, operations: _ignoredOperations, storage: _ignoredStorage, ...dataRest } = data;
  const storage = isObject(data.storage) ? data.storage : {};
  const operations = createCrudOperations(tables);
  const cloudSync = isValidCloudSync(data.cloudSync) ? data.cloudSync : undefined;
  const pages = ensureCrudPages(normalizePages(candidate.pages, tables), tables);
  const navigation = normalizeNavigation(candidate.navigation, pages);

  return {
    ...candidate,
    appId,
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name : toTitleCase(appId),
    version: typeof candidate.version === 'string' && candidate.version.trim() ? candidate.version : '1.0.0',
    theme: isObject(candidate.theme) ? candidate.theme : createDefaultTheme(),
    data: {
      ...dataRest,
      storage: {
        ...storage,
        adapter: 'sqlite',
        databaseName: `tinkaar_${appId.replace(/-/g, '_')}.db`,
      },
      operations,
      ...(cloudSync ? { cloudSync } : {}),
    },
    tables,
    pages,
    navigation,
  };
}

function normalizeNewApp(nextApp: AppDefinition, existingAppIds: string[]): AppDefinition {
  const appId = createUniqueAppId(nextApp.appId || nextApp.name, existingAppIds);

  return {
    ...nextApp,
    appId,
    name: nextApp.name.trim() || toTitleCase(appId),
    version: nextApp.version.trim() || '1.0.0',
    data: {
      ...nextApp.data,
      storage: {
        adapter: 'sqlite',
        databaseName: `tinkaar_${appId.replace(/-/g, '_')}.db`,
      },
    },
  };
}

function sanitizeGeneratedAppCandidate(candidate: unknown, fallbackApp: AppDefinition) {
  if (!isObject(candidate)) {
    return candidate;
  }

  const tables = normalizeTables(candidate.tables, fallbackApp.tables);
  const pages = ensureCrudPages(normalizePages(candidate.pages, tables, fallbackApp.pages), tables);
  const navigation = normalizeNavigation(candidate.navigation, pages, fallbackApp.navigation);

  return {
    ...candidate,
    tables,
    pages,
    navigation,
    data: {
      ...fallbackApp.data,
      ...(isObject(candidate.data) ? candidate.data : {}),
      operations: createCrudOperations(tables),
    },
  };
}

function sanitizeAppReferences(app: AppDefinition): AppDefinition {
  const pageIds = new Set(app.pages.map((page) => page.pageId));
  const modalPageIds = new Set(app.pages.filter((page) => page.layout.type === 'modal').map((page) => page.pageId));
  const tableFields = new Map(app.tables.map((table) => [table.tableName, new Set(table.fields.map((field) => field.name))]));

  const pageSafeApp = {
    ...app,
    pages: app.pages.map((page) => ({
      ...page,
      layout: sanitizeNodeActionTargets(page.layout, app.tables, pageIds, modalPageIds),
    })),
  };

  return {
    ...pageSafeApp,
    pages: pageSafeApp.pages.map((page) => ({
      ...page,
      layout: sanitizeNodeFieldReferences(page.layout, tableFields, null),
    })),
  };
}

function sanitizeNodeActionTargets(
  node: AppDefinition['pages'][number]['layout'],
  tables: AppDefinition['tables'],
  pageIds: Set<string>,
  modalPageIds: Set<string>,
): AppDefinition['pages'][number]['layout'] {
  const nodeCopy: AppDefinition['pages'][number]['layout'] = { ...node };

  if (nodeCopy.action) {
    nodeCopy.action = sanitizeActionTarget(nodeCopy.action, nodeCopy, tables, pageIds, modalPageIds);
  }

  if (nodeCopy.children) {
    nodeCopy.children = nodeCopy.children.map((child) => sanitizeNodeActionTargets(child, tables, pageIds, modalPageIds));
  }

  if (nodeCopy.itemTemplate) {
    nodeCopy.itemTemplate = sanitizeNodeActionTargets(nodeCopy.itemTemplate, tables, pageIds, modalPageIds);
  }

  if (nodeCopy.emptyState) {
    nodeCopy.emptyState = sanitizeNodeActionTargets(nodeCopy.emptyState, tables, pageIds, modalPageIds);
  }

  return nodeCopy;
}

function sanitizeActionTarget(
  action: NonNullable<AppDefinition['pages'][number]['layout']['action']>,
  node: AppDefinition['pages'][number]['layout'],
  tables: AppDefinition['tables'],
  pageIds: Set<string>,
  modalPageIds: Set<string>,
): NonNullable<AppDefinition['pages'][number]['layout']['action']> {
  const nextAction = { ...action };

  if (nextAction.type === 'openModal' && (!nextAction.target || !modalPageIds.has(nextAction.target))) {
    const tableName = nextAction.table && tables.some((table) => table.tableName === nextAction.table)
      ? nextAction.table
      : tables[0]?.tableName;
    const ids = getCrudPageIds(tableName ?? 'Records');
    const target = node.variant === 'fab' || !nextAction.table ? ids.addModalId : ids.editModalId;

    if (modalPageIds.has(target)) {
      nextAction.target = target;
    } else {
      nextAction.type = 'showToast';
      nextAction.message = 'This screen is not ready yet.';
      delete nextAction.target;
      delete nextAction.table;
    }
  }

  if (nextAction.type === 'navigate' && nextAction.pageId && !pageIds.has(nextAction.pageId)) {
    nextAction.type = 'showToast';
    nextAction.message = 'This screen is not ready yet.';
    delete nextAction.pageId;
  }

  if (nextAction.onSuccess) {
    nextAction.onSuccess = sanitizeActionTarget(nextAction.onSuccess, node, tables, pageIds, modalPageIds);
  }

  return nextAction;
}

function sanitizeNodeFieldReferences(
  node: AppDefinition['pages'][number]['layout'],
  tableFields: Map<string, Set<string>>,
  inheritedTable: string | null,
): AppDefinition['pages'][number]['layout'] {
  const datasource = sanitizeDatasource(node.datasource, tableFields);
  const currentTable = datasource?.table ?? node.action?.table ?? inheritedTable;
  const fields = currentTable ? tableFields.get(currentTable) : undefined;
  const nodeCopy: AppDefinition['pages'][number]['layout'] = {
    ...node,
    ...(datasource ? { datasource } : {}),
  };

  if (node.datasource && !datasource) {
    delete nodeCopy.datasource;
  }

  for (const key of ['bind', 'categoryField', 'amountField', 'dateField', 'titleField', 'subtitleField'] as const) {
    if (nodeCopy[key] && fields && !fields.has(nodeCopy[key] as string)) {
      delete nodeCopy[key];
    }
  }

  if (nodeCopy.aggregate?.field && fields && !fields.has(nodeCopy.aggregate.field)) {
    nodeCopy.aggregate = { ...nodeCopy.aggregate };
    delete nodeCopy.aggregate.field;
  }

  if (nodeCopy.columns && fields) {
    const columns = nodeCopy.columns.filter((column) => fields.has(column.field));
    if (columns.length) {
      nodeCopy.columns = columns;
    } else {
      delete nodeCopy.columns;
    }
  }

  const childTable = datasource?.table ?? currentTable;
  if (nodeCopy.children) {
    nodeCopy.children = nodeCopy.children.map((child) => sanitizeNodeFieldReferences(child, tableFields, childTable));
  }

  if (nodeCopy.itemTemplate) {
    nodeCopy.itemTemplate = sanitizeNodeFieldReferences(nodeCopy.itemTemplate, tableFields, childTable);
  }

  if (nodeCopy.emptyState) {
    nodeCopy.emptyState = sanitizeNodeFieldReferences(nodeCopy.emptyState, tableFields, currentTable);
  }

  return nodeCopy;
}

function sanitizeDatasource(
  datasource: AppDefinition['pages'][number]['layout']['datasource'],
  tableFields: Map<string, Set<string>>,
) {
  if (!datasource || !tableFields.has(datasource.table)) {
    return undefined;
  }

  const fields = tableFields.get(datasource.table)!;
  const nextDatasource: NonNullable<AppDefinition['pages'][number]['layout']['datasource']> = {
    table: datasource.table,
  };

  if (datasource.filter && fields.has(datasource.filter.field) && ['eq', 'neq', 'contains'].includes(datasource.filter.op)) {
    nextDatasource.filter = datasource.filter;
  }

  const sort = datasource.sort?.filter((item) => fields.has(item.field) && (item.dir === 'asc' || item.dir === 'desc'));
  if (sort?.length) {
    nextDatasource.sort = sort;
  }

  return nextDatasource;
}

function normalizeTables(value: unknown, fallbackTables: AppDefinition['tables'] = []) {
  const sourceTables = Array.isArray(value) && value.length > 0 ? value : fallbackTables;
  const tables = sourceTables
    .filter(isObject)
    .map((table, tableIndex) => {
      const tableName = toPascalName(typeof table.tableName === 'string' ? table.tableName : `Records${tableIndex + 1}`);
      const fields = normalizeFields(table.fields);

      return {
        tableName,
        fields: fields.length ? fields : createFallbackFields(),
      };
    })
    .filter((table) => table.tableName);

  return tables.length ? dedupeTables(tables) : [{ tableName: 'Records', fields: createFallbackFields() }];
}

function normalizeFields(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .filter(isObject)
    .map((field, index) => {
      const name = normalizeFieldName(typeof field.name === 'string' ? field.name : `field_${index + 1}`);
      const type = normalizeFieldType(field.type);

      return {
        name,
        type,
        ...(typeof field.required === 'boolean' ? { required: field.required } : {}),
        ...(Array.isArray(field.values) ? { values: field.values.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) } : {}),
        ...(field.default !== undefined ? { default: field.default } : {}),
      };
    })
    .filter((field) => {
      if (!field.name || seen.has(field.name)) {
        return false;
      }
      seen.add(field.name);
      return true;
    });
}

function normalizePages(value: unknown, tables: AppDefinition['tables'], fallbackPages: AppDefinition['pages'] = []) {
  const tableNames = new Set(tables.map((table) => table.tableName));
  const sourcePages = Array.isArray(value) && value.length > 0 ? value : fallbackPages;
  const pages = sourcePages
    .filter(isObject)
    .map((page, index) => {
      const fallbackPage = createFallbackPages(tables)[index];
      const pageId = slugify(typeof page.pageId === 'string' ? page.pageId : typeof page.title === 'string' ? page.title : fallbackPage?.pageId ?? `page_${index + 1}`) || `page_${index + 1}`;
      const title = typeof page.title === 'string' && page.title.trim() ? page.title.trim() : fallbackPage?.title ?? toTitleCase(pageId);
      const layout = isObject(page.layout) ? normalizeNode(page.layout, tableNames) : fallbackPage?.layout;

      return layout ? { pageId, title, layout } : null;
    })
    .filter((page): page is AppDefinition['pages'][number] => Boolean(page));

  return pages.length ? dedupePages(pages) : createFallbackPages(tables);
}

function ensureCrudPages(pages: AppDefinition['pages'], tables: AppDefinition['tables']) {
  if (!tables.length) {
    return pages;
  }

  const primaryTable = tables[0];
  const ids = getCrudPageIds(primaryTable.tableName);
  const existingIds = new Set(pages.map((page) => page.pageId));
  const modalIds = new Set(
    pages
      .filter((page) => page.layout.type === 'modal')
      .map((page) => page.pageId),
  );
  const fallbackPages = createCrudPagesForTable(primaryTable);
  const mainPageIndex = pages.findIndex((page) => page.layout.type !== 'modal');
  const nextPages = pages.map((page, index) => {
    if (page.layout.type === 'modal') {
      return page;
    }

    const isPrimaryMainPage = index === mainPageIndex || page.pageId === ids.listPageId;
    return {
      ...page,
      layout: ensureMainCrudLayout(page.layout, primaryTable, {
        addModalId: modalIds.has(ids.addModalId) ? ids.addModalId : fallbackPages[1].pageId,
        editModalId: modalIds.has(ids.editModalId) ? ids.editModalId : fallbackPages[2].pageId,
        forceCrudSurface: isPrimaryMainPage,
      }),
    };
  });

  fallbackPages.slice(1).forEach((fallbackPage) => {
    if (!existingIds.has(fallbackPage.pageId)) {
      nextPages.push(fallbackPage);
    }
  });

  if (mainPageIndex === -1) {
    nextPages.unshift(fallbackPages[0]);
  }

  return dedupePages(nextPages);
}

function ensureMainCrudLayout(
  layout: AppDefinition['pages'][number]['layout'],
  table: AppDefinition['tables'][number],
  options: { addModalId: string; editModalId: string; forceCrudSurface: boolean },
): AppDefinition['pages'][number]['layout'] {
  if (!options.forceCrudSurface || layout.type === 'modal') {
    return layout;
  }

  const children = layout.children ?? [];
  const displayChildren = children.filter((child) => !isInlineFormNode(child) && !isBrokenFabNode(child, options.addModalId));
  const hasList = containsListForTable(layout, table.tableName);
  const hasAddFab = containsOpenModalTarget(layout, options.addModalId);
  const nextChildren = [
    ...displayChildren,
    ...(hasList ? [] : [createListNode(table, options.editModalId)]),
    ...(hasAddFab ? [] : [createFabNode(options.addModalId)]),
  ];

  return {
    ...layout,
    kind: 'container',
    type: 'screen',
    children: nextChildren.length ? nextChildren : createCrudPagesForTable(table)[0].layout.children,
  };
}

function isInlineFormNode(node: AppDefinition['pages'][number]['layout']): boolean {
  if (['input', 'select', 'datepicker', 'checkbox'].includes(node.type)) {
    return true;
  }

  if (node.action && ['createRecord', 'updateRecord', 'deleteRecord', 'closeModal'].includes(node.action.type)) {
    return true;
  }

  if (node.children?.some(isInlineFormNode)) {
    return node.type !== 'card' && node.type !== 'list';
  }

  return false;
}

function isBrokenFabNode(node: AppDefinition['pages'][number]['layout'], addModalId: string) {
  return node.variant === 'fab' && (node.action?.type !== 'openModal' || node.action.target !== addModalId);
}

function containsListForTable(node: AppDefinition['pages'][number]['layout'], tableName: string): boolean {
  if (node.type === 'list' && node.datasource?.table === tableName) {
    return true;
  }

  return Boolean(node.children?.some((child) => containsListForTable(child, tableName)));
}

function containsOpenModalTarget(node: AppDefinition['pages'][number]['layout'], target: string): boolean {
  if (node.action?.type === 'openModal' && node.action.target === target) {
    return true;
  }

  return Boolean(node.children?.some((child) => containsOpenModalTarget(child, target)) || (node.itemTemplate && containsOpenModalTarget(node.itemTemplate, target)));
}

function normalizeNavigation(value: unknown, pages: AppDefinition['pages'], fallbackNavigation?: AppDefinition['navigation']): AppDefinition['navigation'] {
  const pageIds = new Set(pages.map((page) => page.pageId));
  const fallbackItems = fallbackNavigation?.items?.filter((item) => pageIds.has(item.pageId)) ?? [];
  const rawItems = isObject(value) && Array.isArray(value.items) ? value.items : fallbackItems;
  const items = rawItems
    .filter(isObject)
    .map((item) => ({
      pageId: typeof item.pageId === 'string' && pageIds.has(item.pageId) ? item.pageId : '',
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Home',
      ...(typeof item.icon === 'string' && item.icon.trim() ? { icon: item.icon.trim() } : {}),
    }))
    .filter((item) => item.pageId);
  const mainPage = pages.find((page) => page.layout.type !== 'modal') ?? pages[0];

  return {
    type: isObject(value) && ['tabs', 'drawer', 'stack'].includes(String(value.type)) ? value.type as AppDefinition['navigation']['type'] : fallbackNavigation?.type ?? 'stack',
    items: items.length ? items : [{ pageId: mainPage.pageId, label: mainPage.title, icon: 'layout-grid' }],
  };
}

function normalizeNode(value: Record<string, unknown>, tableNames: Set<string>): AppDefinition['pages'][number]['layout'] {
  const component = normalizeComponentKindType(value);
  const kind = component.kind;
  const node: AppDefinition['pages'][number]['layout'] = {
    kind,
    type: component.type,
  };

  copyStringProp(value, node, 'id');
  copyStringProp(value, node, 'label');
  copyStringProp(value, node, 'icon');
  copyStringProp(value, node, 'variant');
  copyStringProp(value, node, 'bind');
  copyStringProp(value, node, 'title');
  copyStringProp(value, node, 'subtitle');
  copyStringProp(value, node, 'categoryField');
  copyStringProp(value, node, 'amountField');
  copyStringProp(value, node, 'dateField');
  copyStringProp(value, node, 'titleField');
  copyStringProp(value, node, 'subtitleField');

  if (value.value !== undefined) {
    node.value = value.value;
  }
  if (component.variant) {
    node.variant = component.variant;
  }
  if (value.direction === 'vertical' || value.direction === 'horizontal') {
    node.direction = value.direction;
  }
  if (typeof value.limit === 'number' && Number.isInteger(value.limit) && value.limit > 0) {
    node.limit = value.limit;
  }
  if (typeof value.multiline === 'boolean') {
    node.multiline = value.multiline;
  }
  if (typeof value.required === 'boolean') {
    node.required = value.required;
  }
  if (isObject(value.datasource)) {
    const datasource = normalizeDatasourceCandidate(value.datasource, tableNames);
    if (datasource) {
      node.datasource = datasource;
    }
  }
  if (Array.isArray(value.children)) {
    node.children = value.children.filter(isObject).map((child) => normalizeNode(child, tableNames));
  }
  if (isObject(value.itemTemplate)) {
    node.itemTemplate = normalizeNode(value.itemTemplate, tableNames);
  }
  if (isObject(value.emptyState)) {
    node.emptyState = normalizeNode(value.emptyState, tableNames);
  }
  if (isObject(value.action)) {
    node.action = normalizeActionCandidate(value.action, tableNames);
  }

  return node;
}

function normalizeComponentKindType(value: Record<string, unknown>): {
  kind: AppDefinition['pages'][number]['layout']['kind'];
  type: string;
  variant?: string;
} {
  const rawKind = typeof value.kind === 'string' ? value.kind.trim() : '';
  const rawType = typeof value.type === 'string' ? value.type.trim() : '';
  const key = `${rawKind}.${rawType}`.toLowerCase();
  const hasChildren = Array.isArray(value.children) && value.children.length > 0;

  const aliases: Record<string, { kind: AppDefinition['pages'][number]['layout']['kind']; type: string; variant?: string }> = {
    'container.header': { kind: 'container', type: 'stack' },
    'container.form': { kind: 'container', type: 'stack' },
    'container.section': { kind: 'container', type: 'stack' },
    'container.row': { kind: 'container', type: 'stack' },
    'container.column': { kind: 'container', type: 'stack' },
    'container.fab': { kind: 'primitive', type: 'button', variant: 'fab' },
    'widget.list': { kind: 'container', type: 'list' },
    'widget.card': { kind: 'container', type: 'card' },
    'widget.grid': { kind: 'container', type: 'grid' },
    'widget.table': { kind: 'container', type: 'table' },
    'widget.stat-card': { kind: 'widget', type: 'statcard' },
    'widget.stat_card': { kind: 'widget', type: 'statcard' },
    'widget.stats': { kind: 'widget', type: 'statcard' },
    'primitive.fab': { kind: 'primitive', type: 'button', variant: 'fab' },
    'primitive.iconbutton': { kind: 'primitive', type: 'button', variant: 'icon' },
    'primitive.icon-button': { kind: 'primitive', type: 'button', variant: 'icon' },
    'primitive.textarea': { kind: 'primitive', type: 'input' },
    'primitive.dropdown': { kind: 'primitive', type: 'select' },
    'primitive.picker': { kind: 'primitive', type: 'select' },
    'primitive.date': { kind: 'primitive', type: 'datepicker' },
  };

  if (aliases[key]) {
    return aliases[key];
  }

  if (isSupportedComponent(rawKind, rawType)) {
    return {
      kind: rawKind as AppDefinition['pages'][number]['layout']['kind'],
      type: rawType,
    };
  }

  if (hasChildren) {
    return { kind: 'container', type: rawType === 'screen' ? 'screen' : 'stack' };
  }

  if (value.datasource) {
    return { kind: 'container', type: 'list' };
  }

  if (value.action || rawType === 'button') {
    return { kind: 'primitive', type: 'button' };
  }

  if (value.bind || value.label) {
    return { kind: 'primitive', type: 'input' };
  }

  return { kind: 'primitive', type: 'text' };
}

function isSupportedComponent(kind: string, type: string) {
  return new Set([
    'container.screen',
    'container.stack',
    'container.grid',
    'container.list',
    'container.card',
    'container.table',
    'complex.modal',
    'primitive.text',
    'primitive.button',
    'primitive.checkbox',
    'primitive.switch',
    'primitive.radiogroup',
    'primitive.checkboxgroup',
    'primitive.input',
    'primitive.datepicker',
    'primitive.select',
    'primitive.badge',
    'primitive.divider',
    'primitive.progressbar',
    'widget.statcard',
    'widget.category-breakdown',
    'widget.timeline',
  ]).has(`${kind}.${type}`);
}

function normalizeDatasourceCandidate(value: Record<string, unknown>, tableNames: Set<string>) {
  if (typeof value.table !== 'string' || !tableNames.has(value.table)) {
    return null;
  }

  const datasource: NonNullable<AppDefinition['pages'][number]['layout']['datasource']> = { table: value.table };
  if (isObject(value.filter) && typeof value.filter.field === 'string' && ['eq', 'neq', 'contains'].includes(String(value.filter.op))) {
    datasource.filter = {
      field: value.filter.field,
      op: value.filter.op as 'eq' | 'neq' | 'contains',
      value: value.filter.value,
    };
  }
  if (Array.isArray(value.sort)) {
    const sort = value.sort
      .filter(isObject)
      .filter((item) => typeof item.field === 'string' && (item.dir === 'asc' || item.dir === 'desc'))
      .map((item) => ({ field: item.field as string, dir: item.dir as 'asc' | 'desc' }));
    if (sort.length) {
      datasource.sort = sort;
    }
  }

  return datasource;
}

function normalizeActionCandidate(value: Record<string, unknown>, tableNames: Set<string>) {
  const actionTypes = ['createRecord', 'updateRecord', 'deleteRecord', 'openModal', 'closeModal', 'navigate', 'toggleField', 'showToast'];
  const type = actionTypes.includes(String(value.type)) ? value.type as NonNullable<AppDefinition['pages'][number]['layout']['action']>['type'] : 'showToast';
  const action: NonNullable<AppDefinition['pages'][number]['layout']['action']> = { type };

  copyStringProp(value, action, 'field');
  copyStringProp(value, action, 'target');
  copyStringProp(value, action, 'pageId');
  copyStringProp(value, action, 'message');
  if (typeof value.table === 'string' && tableNames.has(value.table)) {
    action.table = value.table;
  }
  if (value.value !== undefined) {
    action.value = value.value;
  }
  if (isObject(value.onSuccess)) {
    action.onSuccess = normalizeActionCandidate(value.onSuccess, tableNames);
  }

  return action;
}

function createFallbackNewAppDefinition(userPrompt: string, approvedPlan: string[], existingAppIds: string[]): AppDefinition {
  const appName = deriveFallbackAppName(userPrompt, approvedPlan);
  const appId = createUniqueAppId(appName, existingAppIds);
  const tables: AppDefinition['tables'] = [{ tableName: 'Records', fields: createFallbackFields() }];

  return {
    appId,
    name: appName,
    icon: 'layout-grid',
    version: '1.0.0',
    theme: createDefaultTheme(),
    data: {
      storage: {
        adapter: 'sqlite',
        databaseName: `tinkaar_${appId.replace(/-/g, '_')}.db`,
      },
      operations: createCrudOperations(tables),
    },
    tables,
    pages: createFallbackPages(tables),
    navigation: {
      type: 'stack',
      items: [{ pageId: 'records', label: 'Records', icon: 'layout-grid' }],
    },
  };
}

function createFallbackFields(): AppDefinition['tables'][number]['fields'] {
  return [
    { name: 'title', type: 'text', required: true },
    { name: 'status', type: 'picklist', values: ['New', 'In Progress', 'Done'], default: 'New' },
    { name: 'notes', type: 'textarea' },
    { name: 'created_date', type: 'date' },
  ];
}

function createFallbackPages(tables: AppDefinition['tables']): AppDefinition['pages'] {
  const table = tables[0] ?? { tableName: 'Records', fields: createFallbackFields() };

  return createCrudPagesForTable(table);
}

function createCrudPagesForTable(table: AppDefinition['tables'][number]): AppDefinition['pages'] {
  const tableName = table.tableName || 'Records';
  const ids = getCrudPageIds(tableName);
  const titleLabel = toReadableTitle(tableName);
  const singularLabel = toSingularTitle(titleLabel);

  return [
    {
      pageId: ids.listPageId,
      title: titleLabel,
      layout: {
        kind: 'container',
        type: 'screen',
        children: [
          { kind: 'primitive', type: 'text', value: titleLabel, variant: 'heading' },
          createListNode(table, ids.editModalId),
          createFabNode(ids.addModalId),
        ],
      },
    },
    {
      pageId: ids.addModalId,
      title: `New ${singularLabel}`,
      layout: {
        kind: 'complex',
        type: 'modal',
        children: [
          ...createFormNodes(table),
          { kind: 'primitive', type: 'button', label: 'Save', variant: 'filled', action: { type: 'createRecord', table: tableName, onSuccess: { type: 'closeModal' } } },
          { kind: 'primitive', type: 'button', label: 'Cancel', variant: 'ghost', action: { type: 'closeModal' } },
        ],
      },
    },
    {
      pageId: ids.editModalId,
      title: `Edit ${singularLabel}`,
      layout: {
        kind: 'complex',
        type: 'modal',
        children: [
          ...createFormNodes(table),
          { kind: 'primitive', type: 'button', label: 'Save', variant: 'filled', action: { type: 'updateRecord', table: tableName, onSuccess: { type: 'closeModal' } } },
          { kind: 'primitive', type: 'button', label: 'Delete', icon: 'trash', variant: 'danger', action: { type: 'deleteRecord', table: tableName, onSuccess: { type: 'closeModal' } } },
        ],
      },
    },
  ];
}

function createListNode(table: AppDefinition['tables'][number], editModalId: string): AppDefinition['pages'][number]['layout'] {
  const tableName = table.tableName;
  const titleField = getDisplayField(table, ['text', 'compound_name', 'autonumber']) ?? table.fields[0]?.name;
  const subtitleField = getDisplayField(table, ['textarea', 'email', 'phone', 'url', 'date', 'datetime'], titleField);
  const badgeField = getDisplayField(table, ['picklist', 'singlechoice'], titleField);
  const dateField = table.fields.find((field) => ['created_date', 'date', 'due_date'].includes(field.name) || field.type === 'date')?.name;

  return {
    kind: 'container',
    type: 'list',
    id: `${slugify(tableName) || 'records'}_list`,
    datasource: {
      table: tableName,
      ...(dateField ? { sort: [{ field: dateField, dir: 'desc' }] } : {}),
    },
    emptyState: { kind: 'primitive', type: 'text', value: `No ${toReadableTitle(tableName).toLowerCase()} yet. Tap + to add one.`, variant: 'body' },
    itemTemplate: {
      kind: 'container',
      type: 'card',
      direction: 'horizontal',
      children: [
        {
          kind: 'container',
          type: 'stack',
          direction: 'vertical',
          children: [
            titleField ? { kind: 'primitive', type: 'text', bind: titleField, variant: 'body' } : { kind: 'primitive', type: 'text', value: toSingularTitle(toReadableTitle(tableName)), variant: 'body' },
            ...(subtitleField ? [{ kind: 'primitive' as const, type: 'text', bind: subtitleField, variant: 'caption' }] : []),
            ...(badgeField ? [{ kind: 'primitive' as const, type: 'badge', bind: badgeField }] : []),
          ],
        },
        {
          kind: 'primitive',
          type: 'button',
          label: 'Edit',
          icon: 'edit',
          variant: 'icon',
          action: { type: 'openModal', target: editModalId, table: tableName },
        },
      ],
    },
  };
}

function createFabNode(addModalId: string): AppDefinition['pages'][number]['layout'] {
  return {
    kind: 'primitive',
    type: 'button',
    label: 'Add',
    icon: 'plus',
    variant: 'fab',
    action: { type: 'openModal', target: addModalId },
  };
}

function createFormNodes(table: AppDefinition['tables'][number]): AppDefinition['pages'][number]['layout'][] {
  return table.fields
    .filter((field) => !['autonumber', 'formula'].includes(field.type))
    .map((field) => {
      const base = {
        kind: 'primitive' as const,
        bind: field.name,
        label: toReadableTitle(field.name),
        ...(field.required ? { required: true } : {}),
      };

      if (field.type === 'boolean') {
        return { ...base, type: 'checkbox' };
      }

      if (['picklist', 'singlechoice', 'multiselect'].includes(field.type)) {
        return { ...base, type: 'select' };
      }

      if (field.type === 'date' || field.type === 'datetime') {
        return { ...base, type: 'datepicker' };
      }

      return { ...base, type: 'input', ...(field.type === 'textarea' ? { multiline: true } : {}) };
    });
}

function getCrudPageIds(tableName: string) {
  const base = slugify(tableName) || 'records';
  return {
    listPageId: base,
    addModalId: `add_${base}_modal`,
    editModalId: `edit_${base}_modal`,
  };
}

function getDisplayField(table: AppDefinition['tables'][number], preferredTypes: string[], excludeField?: string) {
  return table.fields.find((field) => field.name !== excludeField && preferredTypes.includes(field.type))?.name;
}

function createDefaultTheme(): AppDefinition['theme'] {
  return {
    mode: 'light',
    light: {
      primaryColor: '#2563eb',
      backgroundColor: '#f8fafc',
      surfaceColor: '#ffffff',
      textColor: '#0f172a',
      mutedTextColor: '#64748b',
      borderColor: '#dbe3ea',
      successColor: '#0f766e',
      dangerColor: '#dc2626',
    },
    dark: {
      primaryColor: '#60a5fa',
      backgroundColor: '#0b1120',
      surfaceColor: '#111827',
      textColor: '#f8fafc',
      mutedTextColor: '#94a3b8',
      borderColor: '#263244',
      successColor: '#34d399',
      dangerColor: '#f87171',
    },
    radius: 'md',
    fontScale: 1,
    fontFamily: 'system',
  };
}

function createCrudOperations(tables: unknown[]): AppDefinition['data']['operations'] {
  return tables
    .filter(isObject)
    .map((table) => (typeof table.tableName === 'string' ? table.tableName.trim() : ''))
    .filter(Boolean)
    .flatMap((tableName) => {
      const operationBase = slugify(tableName) || tableName.toLowerCase();
      return [
        { operationId: `${operationBase}.list`, table: tableName, type: 'list' },
        { operationId: `${operationBase}.create`, table: tableName, type: 'create' },
        { operationId: `${operationBase}.update`, table: tableName, type: 'update' },
        { operationId: `${operationBase}.delete`, table: tableName, type: 'delete' },
      ];
    });
}

function isValidCloudSync(value: unknown) {
  return isObject(value) && value.engine === 'supabase';
}

function validateAppReferences(app: AppDefinition) {
  const seenTableNames = new Set<string>();
  const tableNames = new Set(app.tables.map((table) => table.tableName));
  const seenPageIds = new Set<string>();
  const pageIds = new Set(app.pages.map((page) => page.pageId));
  const operationIds = new Set<string>();

  for (const table of app.tables) {
    if (seenTableNames.has(table.tableName)) {
      return `Duplicate table name ${table.tableName}.`;
    }
    seenTableNames.add(table.tableName);
  }

  for (const page of app.pages) {
    if (seenPageIds.has(page.pageId)) {
      return `Duplicate page id ${page.pageId}.`;
    }
    seenPageIds.add(page.pageId);
  }

  for (const operation of app.data.operations) {
    if (operationIds.has(operation.operationId)) {
      return `Duplicate operation id ${operation.operationId}.`;
    }
    operationIds.add(operation.operationId);

    if (!tableNames.has(operation.table)) {
      return `Operation ${operation.operationId} references unknown table ${operation.table}.`;
    }
  }

  for (const item of app.navigation.items) {
    if (!pageIds.has(item.pageId)) {
      return `Navigation references unknown page ${item.pageId}.`;
    }
  }

  for (const page of app.pages) {
    const error = validateNodeReferences(page.layout, tableNames, pageIds);
    if (error) {
      return error;
    }
  }

  return null;
}

function validateAppFieldReferences(app: AppDefinition) {
  const tableFields = new Map<string, Set<string>>();

  for (const table of app.tables) {
    const fields = new Set<string>();
    for (const field of table.fields) {
      if (fields.has(field.name)) {
        return `Table ${table.tableName} has duplicate field ${field.name}.`;
      }
      fields.add(field.name);
    }
    tableFields.set(table.tableName, fields);
  }

  for (const page of app.pages) {
    const error = validateNodeFieldReferences(page.layout, tableFields, null);
    if (error) {
      return error;
    }
  }

  for (const rule of app.logic ?? []) {
    const error = validateLogicRuleFieldReferences(rule, tableFields);
    if (error) {
      return error;
    }
  }

  return null;
}

function validateNodeReferences(node: AppDefinition['pages'][number]['layout'], tableNames: Set<string>, pageIds: Set<string>): string | null {
  if (node.datasource?.table && !tableNames.has(node.datasource.table)) {
    return `Node datasource references unknown table ${node.datasource.table}.`;
  }

  if (node.action?.table && !tableNames.has(node.action.table)) {
    return `Action references unknown table ${node.action.table}.`;
  }

  if (node.action?.pageId && !pageIds.has(node.action.pageId)) {
    return `Action references unknown page ${node.action.pageId}.`;
  }

  if (node.action?.type === 'openModal' && node.action.target && !pageIds.has(node.action.target)) {
    return `Action references unknown modal page ${node.action.target}.`;
  }

  for (const child of node.children ?? []) {
    const error = validateNodeReferences(child, tableNames, pageIds);
    if (error) {
      return error;
    }
  }

  if (node.itemTemplate) {
    const error = validateNodeReferences(node.itemTemplate, tableNames, pageIds);
    if (error) {
      return error;
    }
  }

  if (node.emptyState) {
    return validateNodeReferences(node.emptyState, tableNames, pageIds);
  }

  return null;
}

function validateNodeFieldReferences(node: AppDefinition['pages'][number]['layout'], tableFields: Map<string, Set<string>>, inheritedTable: string | null): string | null {
  const currentTable = node.datasource?.table ?? node.action?.table ?? inferSingleActionTable(node) ?? inheritedTable;

  if (node.datasource) {
    const datasourceError = validateDatasourceFields(node.datasource, tableFields);
    if (datasourceError) {
      return datasourceError;
    }
  }

  if (node.action) {
    const actionError = validateActionFieldReferences(node.action, tableFields);
    if (actionError) {
      return actionError;
    }
  }

  if (currentTable) {
    const nodeFields = [
      node.bind,
      node.aggregate?.field,
      node.categoryField,
      node.amountField,
      node.dateField,
      node.titleField,
      node.subtitleField,
    ].filter((field): field is string => Boolean(field));

    for (const field of nodeFields) {
      if (!tableFields.get(currentTable)?.has(field)) {
        return `Node ${node.id ?? node.type} references unknown field ${currentTable}.${field}.`;
      }
    }

    for (const column of node.columns ?? []) {
      if (!tableFields.get(currentTable)?.has(column.field)) {
        return `Node ${node.id ?? node.type} column references unknown field ${currentTable}.${column.field}.`;
      }
    }
  }

  for (const rule of node.logic ?? []) {
    const error = validateLogicRuleFieldReferences(rule, tableFields, currentTable);
    if (error) {
      return error;
    }
  }

  const childTable = node.datasource?.table ?? currentTable;
  for (const child of node.children ?? []) {
    const error = validateNodeFieldReferences(child, tableFields, childTable);
    if (error) {
      return error;
    }
  }

  if (node.itemTemplate) {
    const error = validateNodeFieldReferences(node.itemTemplate, tableFields, node.datasource?.table ?? currentTable);
    if (error) {
      return error;
    }
  }

  if (node.emptyState) {
    return validateNodeFieldReferences(node.emptyState, tableFields, currentTable);
  }

  return null;
}

function validateDatasourceFields(datasource: NonNullable<AppDefinition['pages'][number]['layout']['datasource']>, tableFields: Map<string, Set<string>>) {
  const fields = tableFields.get(datasource.table);
  if (!fields) {
    return null;
  }

  if (datasource.filter && !fields.has(datasource.filter.field)) {
    return `Datasource for ${datasource.table} filters on unknown field ${datasource.filter.field}.`;
  }

  for (const sort of datasource.sort ?? []) {
    if (!fields.has(sort.field)) {
      return `Datasource for ${datasource.table} sorts on unknown field ${sort.field}.`;
    }
  }

  return null;
}

function validateActionFieldReferences(action: NonNullable<AppDefinition['pages'][number]['layout']['action']>, tableFields: Map<string, Set<string>>): string | null {
  if (action.table && action.field && !tableFields.get(action.table)?.has(action.field)) {
    return `Action ${action.type} references unknown field ${action.table}.${action.field}.`;
  }

  return action.onSuccess ? validateActionFieldReferences(action.onSuccess, tableFields) : null;
}

function validateLogicRuleFieldReferences(rule: NonNullable<AppDefinition['logic']>[number], tableFields: Map<string, Set<string>>, fallbackTable: string | null = null) {
  const tableName = rule.table ?? fallbackTable;

  if (!tableName) {
    return null;
  }

  if (rule.field && !tableFields.get(tableName)?.has(rule.field)) {
    return `Logic rule ${rule.id} references unknown field ${tableName}.${rule.field}.`;
  }

  if (rule.when) {
    const error = validateLogicConditionFieldReference(rule.when, tableName, tableFields, `Logic rule ${rule.id}`);
    if (error) {
      return error;
    }
  }

  for (const step of rule.steps) {
    if (step.field && !tableFields.get(tableName)?.has(step.field)) {
      return `Logic rule ${rule.id} step references unknown field ${tableName}.${step.field}.`;
    }

    if (step.when) {
      const error = validateLogicConditionFieldReference(step.when, tableName, tableFields, `Logic rule ${rule.id} step`);
      if (error) {
        return error;
      }
    }

    if (step.action) {
      const error = validateActionFieldReferences(step.action, tableFields);
      if (error) {
        return error;
      }
    }
  }

  return null;
}

function validateLogicConditionFieldReference(condition: NonNullable<NonNullable<AppDefinition['logic']>[number]['when']>, tableName: string, tableFields: Map<string, Set<string>>, label: string) {
  if (condition.field && !tableFields.get(tableName)?.has(condition.field)) {
    return `${label} condition references unknown field ${tableName}.${condition.field}.`;
  }

  return null;
}

function inferSingleActionTable(node: AppDefinition['pages'][number]['layout']) {
  const tables = new Set<string>();
  collectActionTables(node, tables);

  return tables.size === 1 ? [...tables][0] : null;
}

function collectActionTables(node: AppDefinition['pages'][number]['layout'], tables: Set<string>) {
  if (node.action?.table) {
    tables.add(node.action.table);
  }

  for (const child of node.children ?? []) {
    collectActionTables(child, tables);
  }

  if (node.itemTemplate) {
    collectActionTables(node.itemTemplate, tables);
  }

  if (node.emptyState) {
    collectActionTables(node.emptyState, tables);
  }
}

function createAppSummary(app: AppDefinition) {
  return [
    `App: ${app.name} (${app.appId}) version ${app.version}`,
    `Tables: ${app.tables.map((table) => `${table.tableName}[${table.fields.map((field) => `${field.name}:${field.type}${field.required ? ':required' : ''}`).join(', ')}]`).join('; ')}`,
    `Pages: ${app.pages.map((page) => `${page.pageId} (${page.title})`).join(', ')}`,
    `Navigation: ${app.navigation.type} with ${app.navigation.items.map((item) => `${item.label}->${item.pageId}`).join(', ')}`,
  ].join('\n');
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];
}

function createUniqueAppId(value: string, existingAppIds: string[]) {
  const existing = new Set(existingAppIds);
  const base = slugify(value) || `ai-app-${Date.now().toString(36)}`;
  let candidate = base;
  let index = 2;

  while (existing.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

function dedupeTables(tables: AppDefinition['tables']) {
  const seen = new Set<string>();

  return tables.map((table, index) => {
    let tableName = table.tableName || `Records${index + 1}`;
    const base = tableName;
    let suffix = 2;

    while (seen.has(tableName)) {
      tableName = `${base}${suffix}`;
      suffix += 1;
    }

    seen.add(tableName);
    return { ...table, tableName };
  });
}

function dedupePages(pages: AppDefinition['pages']) {
  const seen = new Set<string>();

  return pages.map((page, index) => {
    let pageId = page.pageId || `page_${index + 1}`;
    const base = pageId;
    let suffix = 2;

    while (seen.has(pageId)) {
      pageId = `${base}_${suffix}`;
      suffix += 1;
    }

    seen.add(pageId);
    return { ...page, pageId };
  });
}

function copyStringProp<T extends Record<string, unknown>>(source: Record<string, unknown>, target: T, key: string) {
  const value = source[key];
  if (typeof value === 'string' && value.trim()) {
    target[key as keyof T] = value.trim() as T[keyof T];
  }
}

function normalizeFieldType(value: unknown): AppDefinition['tables'][number]['fields'][number]['type'] {
  const supported = [
    'text',
    'textarea',
    'number',
    'decimal',
    'percentage',
    'currency',
    'email',
    'phone',
    'url',
    'date',
    'datetime',
    'boolean',
    'picklist',
    'lookup',
    'multiselect',
    'singlechoice',
    'compound_name',
    'image',
    'file',
    'formula',
    'autonumber',
    'geopoint',
  ];

  return supported.includes(String(value)) ? value as AppDefinition['tables'][number]['fields'][number]['type'] : 'text';
}

function normalizeFieldName(value: string) {
  return slugify(value).replace(/-/g, '_') || 'field';
}

function toPascalName(value: string) {
  const title = toTitleCase(slugify(value) || value);
  return title.replace(/\s+/g, '') || 'Records';
}

function toReadableTitle(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || 'Records';
}

function toSingularTitle(value: string) {
  return value.endsWith('ies')
    ? `${value.slice(0, -3)}y`
    : value.endsWith('s') && value.length > 1
      ? value.slice(0, -1)
      : value;
}

function deriveFallbackAppName(userPrompt: string, approvedPlan: string[]) {
  const source = [...approvedPlan, userPrompt]
    .find((item) => item && item.trim().length > 0)
    ?.replace(/\b(User|AI|Plan|Questions?):/gi, ' ')
    .replace(/\b(build|create|make|track|manage|app|application|from scratch|simple|starter)\b/gi, ' ')
    .replace(/[^a-zA-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = source?.split(' ').filter(Boolean).slice(0, 4).join(' ');

  return words ? toTitleCase(slugify(words)) : 'New App';
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
}

function toTitleCase(value: string) {
  return value
    .split('-')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'New App';
}

function parseJsonObject(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error('AI response was not JSON.');
    }
    return JSON.parse(match[0]) as unknown;
  }
}

function parseExtraHeaders(headersJson: string | undefined) {
  if (!headersJson?.trim()) {
    return {};
  }

  const parsed = JSON.parse(headersJson) as unknown;
  if (!isObject(parsed)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(parsed)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value as string]),
  );
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/$/, '');
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
