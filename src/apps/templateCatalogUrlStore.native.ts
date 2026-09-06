import { openDatabaseSync } from 'expo-sqlite';

const database = openDatabaseSync('workfoundry_template_catalog.db');
database.execSync(`
  CREATE TABLE IF NOT EXISTS template_catalog_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )
`);

type TemplateCatalogUrlRow = {
  value: string;
};

export async function loadTemplateCatalogUrl(): Promise<string> {
  const row = database.getFirstSync<TemplateCatalogUrlRow>(
    'SELECT value FROM template_catalog_settings WHERE key = ?',
    'catalog_url',
  );

  return row?.value ?? '';
}

export async function saveTemplateCatalogUrl(url: string): Promise<void> {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    database.runSync('DELETE FROM template_catalog_settings WHERE key = ?', 'catalog_url');
    return;
  }

  database.runSync(
    'INSERT OR REPLACE INTO template_catalog_settings (key, value) VALUES (?, ?)',
    'catalog_url',
    trimmedUrl,
  );
}
