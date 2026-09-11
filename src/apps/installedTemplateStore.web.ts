import { InstalledTemplateRecord } from './catalog';

const storageKey = 'workfoundry.installedTemplates';
const hiddenAppIdsStorageKey = 'workfoundry.hiddenAppIds';

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
  await saveHiddenAppIds((await loadHiddenAppIds()).filter((appId) => appId !== record.app.appId));
}

export async function deleteInstalledTemplate(appId: string): Promise<void> {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }

  const next = (await loadInstalledTemplates()).filter((template) => template.app.appId !== appId);
  globalThis.localStorage.setItem(storageKey, JSON.stringify(next));
}

export async function loadHiddenAppIds(): Promise<string[]> {
  if (typeof globalThis.localStorage === 'undefined') {
    return [];
  }

  const stored = globalThis.localStorage.getItem(hiddenAppIdsStorageKey);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? parsed.filter((appId): appId is string => typeof appId === 'string') : [];
  } catch (error) {
    console.warn('Ignoring invalid hidden app storage.', error);
    return [];
  }
}

export async function saveHiddenAppIds(appIds: string[]): Promise<void> {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }

  globalThis.localStorage.setItem(hiddenAppIdsStorageKey, JSON.stringify([...new Set(appIds)]));
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
