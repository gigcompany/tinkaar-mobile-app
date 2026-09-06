import { openDatabaseSync } from 'expo-sqlite';
import type { AppDefinition } from '../schema/appDefinition.schema';

export type AppVersionRecord = {
  id: string;
  appId: string;
  version: string;
  name: string;
  prompt: string;
  providerName: string;
  createdAt: string;
  app: AppDefinition;
};

const database = openDatabaseSync('appfoundry_app_versions.db');
database.execSync(`
  CREATE TABLE IF NOT EXISTS app_versions (
    id TEXT PRIMARY KEY NOT NULL,
    app_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )
`);

type AppVersionRow = {
  payload: string;
};

export async function loadAppVersions(appId?: string): Promise<AppVersionRecord[]> {
  const rows = appId
    ? database.getAllSync<AppVersionRow>('SELECT payload FROM app_versions WHERE app_id = ? ORDER BY created_at DESC', appId)
    : database.getAllSync<AppVersionRow>('SELECT payload FROM app_versions ORDER BY created_at DESC');

  return rows.flatMap((row) => parseStoredRecord(row.payload));
}

export async function saveAppVersionRecord(record: AppVersionRecord): Promise<void> {
  database.runSync(
    'INSERT OR REPLACE INTO app_versions (id, app_id, created_at, payload) VALUES (?, ?, ?, ?)',
    record.id,
    record.appId,
    record.createdAt,
    JSON.stringify(record),
  );
}

function parseStoredRecord(payload: string): AppVersionRecord[] {
  try {
    const parsed = JSON.parse(payload) as AppVersionRecord;
    return parsed?.id && parsed?.app?.appId ? [parsed] : [];
  } catch (error) {
    console.warn('Ignoring invalid app version payload.', error);
    return [];
  }
}
