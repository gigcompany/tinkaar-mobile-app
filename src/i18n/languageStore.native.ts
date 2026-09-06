import { openDatabaseSync } from 'expo-sqlite';
import { isLanguageCode, type LanguageCode } from './translations';

const database = openDatabaseSync('workfoundry_preferences.db');
database.execSync(`
  CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )
`);

export async function loadLanguagePreference(): Promise<LanguageCode | null> {
  const [row] = database.getAllSync<{ value: string }>('SELECT value FROM preferences WHERE key = ?', 'language');
  return isLanguageCode(row?.value) ? row.value : null;
}

export async function saveLanguagePreference(language: LanguageCode): Promise<void> {
  database.runSync('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)', 'language', language);
}
