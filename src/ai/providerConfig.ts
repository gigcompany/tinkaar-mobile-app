export type AiProviderKind = 'openai-compatible' | 'gemini';

export type AiProviderPresetId = 'litellm' | 'vercel-gateway' | 'openrouter' | 'gemini' | 'microsoft-foundry' | 'custom';

export type AiProviderConfig = {
  presetId: AiProviderPresetId;
  kind: AiProviderKind;
  displayName: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  headersJson?: string;
};

export type AiProviderPreset = {
  id: AiProviderPresetId;
  label: string;
  kind: AiProviderKind;
  baseUrl: string;
  model: string;
};

export const aiProviderPresets: AiProviderPreset[] = [
  {
    id: 'litellm',
    label: 'LiteLLM',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:4000/v1',
    model: 'gpt-4.1-mini',
  },
  {
    id: 'vercel-gateway',
    label: 'Vercel Gateway',
    kind: 'openai-compatible',
    baseUrl: 'https://ai-gateway.vercel.sh/v1',
    model: 'openai/gpt-4.1-mini',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4.1-mini',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
  },
  {
    id: 'microsoft-foundry',
    label: 'Microsoft Foundry',
    kind: 'openai-compatible',
    baseUrl: 'https://YOUR-RESOURCE.openai.azure.com/openai/v1',
    model: 'YOUR-DEPLOYMENT-NAME',
  },
  {
    id: 'custom',
    label: 'Custom',
    kind: 'openai-compatible',
    baseUrl: '',
    model: '',
  },
];

const defaultPreset = aiProviderPresets[0];

export const defaultAiProviderConfig: AiProviderConfig = {
  presetId: defaultPreset.id,
  kind: defaultPreset.kind,
  displayName: defaultPreset.label,
  baseUrl: defaultPreset.baseUrl,
  model: defaultPreset.model,
  apiKey: '',
  headersJson: '',
};

export function createAiProviderConfigFromPreset(presetId: AiProviderPresetId, current: AiProviderConfig): AiProviderConfig {
  const preset = aiProviderPresets.find((candidate) => candidate.id === presetId) ?? aiProviderPresets[0];

  return {
    ...current,
    presetId: preset.id,
    kind: preset.kind,
    displayName: preset.label,
    baseUrl: preset.baseUrl,
    model: preset.model,
  };
}

export function validateAiProviderConfig(config: AiProviderConfig) {
  if (!config.baseUrl.trim()) {
    return 'Enter the AI provider base URL.';
  }

  if (!config.model.trim()) {
    return 'Enter the model name.';
  }

  if (!config.apiKey.trim()) {
    return 'Enter the provider API key.';
  }

  try {
    const url = new URL(config.baseUrl.trim());
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      return 'AI provider URL must use HTTPS unless it is localhost.';
    }
  } catch {
    return 'Enter a valid AI provider URL.';
  }

  if (config.headersJson?.trim()) {
    try {
      const parsed = JSON.parse(config.headersJson) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return 'Extra headers must be a JSON object.';
      }
    } catch {
      return 'Extra headers must be valid JSON.';
    }
  }

  return null;
}
