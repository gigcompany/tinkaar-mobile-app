import type { AppRecord } from './repository';

export type CloudSyncOperation = 'upsert' | 'delete';

export type CloudSyncOutboxItem = {
  id: string;
  appId: string;
  operation: CloudSyncOperation;
  tableName: string;
  recordId: string;
  record: AppRecord | null;
  localUpdatedAt: string;
  createdAt: string;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string | null;
};

export type CloudSyncStore = {
  enqueue: (item: CloudSyncOutboxItem) => void;
  getDueOutboxItems: (appId: string, now: string, limit: number) => CloudSyncOutboxItem[];
  getPendingCount: (appId: string) => number;
  removeOutboxItems: (ids: string[]) => void;
  markOutboxItemsFailed: (ids: string[], error: string, nextAttemptAt: string) => void;
  getWatermark: (appId: string) => string | null;
  setWatermark: (appId: string, watermark: string) => void;
  getDeviceId: () => string;
};

export function createOutboxItem({
  appId,
  operation,
  tableName,
  recordId,
  record,
}: {
  appId: string;
  operation: CloudSyncOperation;
  tableName: string;
  recordId: string;
  record: AppRecord | null;
}) {
  const now = new Date().toISOString();

  return {
    id: createId('sync'),
    appId,
    operation,
    tableName,
    recordId,
    record,
    localUpdatedAt: now,
    createdAt: now,
    attemptCount: 0,
    nextAttemptAt: now,
    lastError: null,
  };
}

export function getBackoffDelayMs(attemptCount: number) {
  const cappedAttempt = Math.min(attemptCount, 6);
  return Math.min(60_000, 1_000 * 2 ** cappedAttempt);
}

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
