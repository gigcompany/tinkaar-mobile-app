import {
  CloudSyncOutboxItem,
  CloudSyncStore,
  createId,
} from './cloudSyncStoreTypes';

type StoredSyncState = {
  outbox: CloudSyncOutboxItem[];
  watermarks: Record<string, string>;
  deviceId: string;
};

export function createCloudSyncStore(namespace: string): CloudSyncStore {
  return new WebCloudSyncStore(namespace);
}

class WebCloudSyncStore implements CloudSyncStore {
  private storageKey: string;

  constructor(namespace: string) {
    this.storageKey = `ministore:sync:${namespace}`;
    this.writeState(this.readState());
  }

  enqueue(item: CloudSyncOutboxItem) {
    const state = this.readState();
    state.outbox = [...state.outbox.filter((candidate) => !isSameRecord(candidate, item)), item];
    this.writeState(state);
  }

  getDueOutboxItems(appId: string, now: string, limit: number) {
    return this.readState()
      .outbox.filter((item) => item.appId === appId && item.nextAttemptAt <= now)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit);
  }

  getPendingCount(appId: string) {
    return this.readState().outbox.filter((item) => item.appId === appId).length;
  }

  removeOutboxItems(ids: string[]) {
    const idSet = new Set(ids);
    const state = this.readState();
    state.outbox = state.outbox.filter((item) => !idSet.has(item.id));
    this.writeState(state);
  }

  markOutboxItemsFailed(ids: string[], error: string, nextAttemptAt: string) {
    const idSet = new Set(ids);
    const state = this.readState();
    state.outbox = state.outbox.map((item) =>
      idSet.has(item.id)
        ? {
            ...item,
            attemptCount: item.attemptCount + 1,
            lastError: error,
            nextAttemptAt,
          }
        : item,
    );
    this.writeState(state);
  }

  clearAppState(appId: string) {
    const state = this.readState();
    state.outbox = state.outbox.filter((item) => item.appId !== appId);
    delete state.watermarks[appId];
    this.writeState(state);
  }

  getWatermark(appId: string) {
    return this.readState().watermarks[appId] ?? null;
  }

  setWatermark(appId: string, watermark: string) {
    const state = this.readState();
    state.watermarks[appId] = watermark;
    this.writeState(state);
  }

  getDeviceId() {
    return this.readState().deviceId;
  }

  private readState(): StoredSyncState {
    if (typeof globalThis.localStorage === 'undefined') {
      return createEmptyState();
    }

    try {
      const stored = globalThis.localStorage.getItem(this.storageKey);
      const parsed = stored ? (JSON.parse(stored) as Partial<StoredSyncState>) : {};
      return {
        outbox: Array.isArray(parsed.outbox) ? parsed.outbox.filter(isOutboxItem) : [],
        watermarks: isStringRecord(parsed.watermarks) ? parsed.watermarks : {},
        deviceId: typeof parsed.deviceId === 'string' ? parsed.deviceId : createId('device'),
      };
    } catch (error) {
      console.warn('Ignoring invalid web sync state.', error);
      return createEmptyState();
    }
  }

  private writeState(state: StoredSyncState) {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(this.storageKey, JSON.stringify(state));
    }
  }
}

function createEmptyState(): StoredSyncState {
  return { outbox: [], watermarks: {}, deviceId: createId('device') };
}

function isOutboxItem(value: unknown): value is CloudSyncOutboxItem {
  return typeof value === 'object' && value !== null && typeof (value as CloudSyncOutboxItem).id === 'string';
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && Object.values(value).every((entry) => typeof entry === 'string');
}

function isSameRecord(left: CloudSyncOutboxItem, right: CloudSyncOutboxItem) {
  return left.appId === right.appId && left.tableName === right.tableName && left.recordId === right.recordId;
}
