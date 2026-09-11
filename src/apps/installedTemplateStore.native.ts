import { openDatabaseSync } from 'expo-sqlite';
import { InstalledTemplateRecord } from './catalog';

const database = openDatabaseSync('workfoundry_installed_templates.db');
database.execSync(`
  CREATE TABLE IF NOT EXISTS installed_templates (
    app_id TEXT PRIMARY KEY NOT NULL,
    url TEXT NOT NULL,
    installed_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS hidden_apps (
    app_id TEXT PRIMARY KEY NOT NULL,
    hidden_at TEXT NOT NULL
  );
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
  database.runSync('DELETE FROM hidden_apps WHERE app_id = ?', record.app.appId);
}

export async function deleteInstalledTemplate(appId: string): Promise<void> {
  database.runSync('DELETE FROM installed_templates WHERE app_id = ?', appId);
}

export async function loadHiddenAppIds(): Promise<string[]> {
  return database
    .getAllSync<{ app_id: string }>('SELECT app_id FROM hidden_apps ORDER BY hidden_at ASC')
    .map((row) => row.app_id);
}

export async function saveHiddenAppIds(appIds: string[]): Promise<void> {
  database.execSync('DELETE FROM hidden_apps');
  [...new Set(appIds)].forEach((appId) => {
    database.runSync('INSERT OR REPLACE INTO hidden_apps (app_id, hidden_at) VALUES (?, ?)', appId, new Date().toISOString());
  });
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
