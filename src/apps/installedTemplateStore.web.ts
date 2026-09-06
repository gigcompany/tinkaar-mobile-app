import { InstalledTemplateRecord } from './catalog';

const storageKey = 'workfoundry.installedTemplates';

export async function loadInstalledTemplates(): Promise<InstalledTemplateRecord[]> {
  if (typeof globalThis.localStorage === 'undefined') {
    return [];
  }

  const stored = globalThis.localStorage.getItem(storageKey);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isInstalledTemplateRecord) : [];
  } catch (error) {
    console.warn('Ignoring invalid installed template storage.', error);
    return [];
  }
}

export async function saveInstalledTemplate(record: InstalledTemplateRecord): Promise<void> {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }

  const existing = await loadInstalledTemplates();
  const next = [
    ...existing.filter((template) => template.app.appId !== record.app.appId && template.url !== record.url),
    record,
  ];
  globalThis.localStorage.setItem(storageKey, JSON.stringify(next));
}

function isInstalledTemplateRecord(value: unknown): value is InstalledTemplateRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as InstalledTemplateRecord).url === 'string' &&
    typeof (value as InstalledTemplateRecord).installedAt === 'string' &&
    typeof (value as InstalledTemplateRecord).app?.appId === 'string'
  );
}
