import { AppDefinition, appDefinitionSchema } from '../schema/appDefinition.schema';
import { AiProviderConfig } from './providerConfig';

export type AppMutationResult = {
  app: AppDefinition;
  summary: string;
};

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
}: {
  provider: AiProviderConfig;
  currentApp: AppDefinition;
  prompt: string;
}): Promise<AppMutationResult> {
  const instructions = createMutationPrompt(currentApp, prompt);
  const content = provider.kind === 'gemini'
    ? await requestGeminiMutation(provider, instructions)
    : await requestOpenAiCompatibleMutation(provider, instructions);
  const parsed = parseJsonObject(content);
  const candidate = isObject(parsed) && isObject(parsed.app) ? parsed.app : parsed;
  const validated = appDefinitionSchema.safeParse(candidate);

  if (!validated.success) {
    throw new Error(`AI returned an invalid app definition: ${validated.error.message}`);
  }

  const app = normalizeMutatedApp(currentApp, validated.data);
  const referenceError = validateAppReferences(app);
  if (referenceError) {
    throw new Error(referenceError);
  }

  return {
    app,
    summary: isObject(parsed) && typeof parsed.summary === 'string' ? parsed.summary : 'Generated an updated app definition.',
  };
}

function createMutationPrompt(currentApp: AppDefinition, userPrompt: string) {
  return [
    'You are editing a Tinkaar app definition JSON document.',
    'Return only JSON. No markdown fences, no prose outside JSON.',
    'The JSON response must be an object with two keys: "summary" and "app".',
    '"app" must be a complete AppDefinition, not a patch.',
    'Keep the same appId. Preserve existing tables, pages, navigation, data storage, and cloudSync unless the user explicitly asks to change them.',
    'Use only these node kinds: primitive, complex, container, widget.',
    'Use only supported action types: createRecord, updateRecord, deleteRecord, openModal, closeModal, navigate, toggleField, showToast.',
    'Use only supported field types from the current app schema.',
    'Make app changes practical for a mobile CRUD app: add fields to forms and lists when needed, keep labels short, and preserve required validations.',
    '',
    `User request: ${userPrompt}`,
    '',
    'Current app definition JSON:',
    JSON.stringify(currentApp),
  ].join('\n');
}

async function requestOpenAiCompatibleMutation(provider: AiProviderConfig, prompt: string) {
  const requestBody: Record<string, unknown> = {
    model: provider.model.trim(),
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You generate strict JSON app definitions for Tinkaar.',
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

async function requestGeminiMutation(provider: AiProviderConfig, prompt: string) {
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
          parts: [{ text: prompt }],
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

function validateAppReferences(app: AppDefinition) {
  const tableNames = new Set(app.tables.map((table) => table.tableName));
  const pageIds = new Set(app.pages.map((page) => page.pageId));

  for (const operation of app.data.operations) {
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
