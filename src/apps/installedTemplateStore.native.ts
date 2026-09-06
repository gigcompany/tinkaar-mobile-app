import { openDatabaseSync } from 'expo-sqlite';
import { InstalledTemplateRecord } from './catalog';

const database = openDatabaseSync('workfoundry_installed_templates.db');
database.execSync(`
  CREATE TABLE IF NOT EXISTS installed_templates (
    app_id TEXT PRIMARY KEY NOT NULL,
    url TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )
`);

type InstalledTemplateRow = {
  payload: string;
};

export async function loadInstalledTemplates(): Promise<InstalledTemplateRecord[]> {
  return database
    .getAllSync<InstalledTemplateRow>('SELECT payload FROM installed_templates ORDER BY installed_at ASC')
    .flatMap((row) => parseStoredRecord(row.payload));
}

export async function saveInstalledTemplate(record: InstalledTemplateRecord): Promise<void> {
  database.runSync(
    'INSERT OR REPLACE INTO installed_templates (app_id, url, installed_at, payload) VALUES (?, ?, ?, ?)',
    record.app.appId,
    record.url,
    record.installedAt,
    JSON.stringify(record),
  );
}

function parseStoredRecord(payload: string): InstalledTemplateRecord[] {
  try {
    const parsed = JSON.parse(payload) as InstalledTemplateRecord;
    return parsed?.app?.appId ? [parsed] : [];
  } catch (error) {
    console.warn('Ignoring invalid installed template payload.', error);
    return [];
  }
}
