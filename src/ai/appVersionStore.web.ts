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

const storageKey = 'appfoundry.appVersions';

export async function loadAppVersions(appId?: string): Promise<AppVersionRecord[]> {
  if (typeof globalThis.localStorage === 'undefined') {
    return [];
  }

  const stored = globalThis.localStorage.getItem(storageKey);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    const records = Array.isArray(parsed) ? parsed.filter(isAppVersionRecord) : [];
    return records
      .filter((record) => !appId || record.appId === appId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  } catch (error) {
    console.warn('Ignoring invalid app version storage.', error);
    return [];
  }
}

export async function saveAppVersionRecord(record: AppVersionRecord): Promise<void> {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }

  const existing = await loadAppVersions();
  const next = [record, ...existing.filter((candidate) => candidate.id !== record.id)];
  globalThis.localStorage.setItem(storageKey, JSON.stringify(next));
}

function isAppVersionRecord(value: unknown): value is AppVersionRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AppVersionRecord).id === 'string' &&
    typeof (value as AppVersionRecord).appId === 'string' &&
    typeof (value as AppVersionRecord).createdAt === 'string' &&
    typeof (value as AppVersionRecord).app?.appId === 'string'
  );
}
