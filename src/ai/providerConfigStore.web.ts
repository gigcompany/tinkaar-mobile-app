import { AiProviderConfig, defaultAiProviderConfig } from './providerConfig';

const storageKey = 'appfoundry.aiProviderConfig';

export async function loadAiProviderConfig(): Promise<AiProviderConfig> {
  if (typeof globalThis.localStorage === 'undefined') {
    return defaultAiProviderConfig;
  }

  const stored = globalThis.localStorage.getItem(storageKey);
  if (!stored) {
    return defaultAiProviderConfig;
  }

  try {
    return normalizeAiProviderConfig(JSON.parse(stored) as Partial<AiProviderConfig>);
  } catch (error) {
    console.warn('Ignoring invalid AI provider settings.', error);
    return defaultAiProviderConfig;
  }
}

export async function saveAiProviderConfig(config: AiProviderConfig): Promise<void> {
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem(storageKey, JSON.stringify(config));
  }
}

function normalizeAiProviderConfig(config: Partial<AiProviderConfig>): AiProviderConfig {
  return {
    ...defaultAiProviderConfig,
    ...config,
    kind: config.kind === 'gemini' ? 'gemini' : 'openai-compatible',
  };
}
