import type { CloudSyncOutboxItem, CloudSyncStore } from './cloudSyncStoreTypes';
import { createId } from './cloudSyncStoreTypes';

export function createCloudSyncStore(_namespace: string): CloudSyncStore {
  return new MemoryCloudSyncStore();
}

class MemoryCloudSyncStore implements CloudSyncStore {
  private outbox: CloudSyncOutboxItem[] = [];
  private watermarks = new Map<string, string>();
  private deviceId = createId('device');

  enqueue(item: CloudSyncOutboxItem) {
    this.outbox = [...this.outbox.filter((candidate) => !isSameRecord(candidate, item)), item];
  }

  getDueOutboxItems(appId: string, now: string, limit: number) {
    return this.outbox
      .filter((item) => item.appId === appId && item.nextAttemptAt <= now)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit);
  }

  getPendingCount(appId: string) {
    return this.outbox.filter((item) => item.appId === appId).length;
  }

  removeOutboxItems(ids: string[]) {
    const idSet = new Set(ids);
    this.outbox = this.outbox.filter((item) => !idSet.has(item.id));
  }

  markOutboxItemsFailed(ids: string[], error: string, nextAttemptAt: string) {
    const idSet = new Set(ids);
    this.outbox = this.outbox.map((item) =>
      idSet.has(item.id)
        ? {
            ...item,
            attemptCount: item.attemptCount + 1,
            lastError: error,
            nextAttemptAt,
          }
        : item,
    );
  }

  clearAppState(appId: string) {
    this.outbox = this.outbox.filter((item) => item.appId !== appId);
    this.watermarks.delete(appId);
  }

  getWatermark(appId: string) {
    return this.watermarks.get(appId) ?? null;
  }

  setWatermark(appId: string, watermark: string) {
    this.watermarks.set(appId, watermark);
  }

  getDeviceId() {
    return this.deviceId;
  }
}

function isSameRecord(left: CloudSyncOutboxItem, right: CloudSyncOutboxItem) {
  return left.appId === right.appId && left.tableName === right.tableName && left.recordId === right.recordId;
}
