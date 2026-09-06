import { openDatabaseSync } from 'expo-sqlite';
import { AiProviderConfig, defaultAiProviderConfig } from './providerConfig';

const database = openDatabaseSync('appfoundry_ai_settings.db');
database.execSync(`
  CREATE TABLE IF NOT EXISTS ai_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )
`);

type AiSettingsRow = {
  value: string;
};

export async function loadAiProviderConfig(): Promise<AiProviderConfig> {
  const row = database.getFirstSync<AiSettingsRow>('SELECT value FROM ai_settings WHERE key = ?', 'provider');
  if (!row?.value) {
    return defaultAiProviderConfig;
  }

  try {
    return normalizeAiProviderConfig(JSON.parse(row.value) as Partial<AiProviderConfig>);
  } catch (error) {
    console.warn('Ignoring invalid AI provider settings.', error);
    return defaultAiProviderConfig;
  }
}

export async function saveAiProviderConfig(config: AiProviderConfig): Promise<void> {
  database.runSync(
    'INSERT OR REPLACE INTO ai_settings (key, value) VALUES (?, ?)',
    'provider',
    JSON.stringify(config),
  );
}

function normalizeAiProviderConfig(config: Partial<AiProviderConfig>): AiProviderConfig {
  return {
    ...defaultAiProviderConfig,
    ...config,
    kind: config.kind === 'gemini' ? 'gemini' : 'openai-compatible',
  };
}
