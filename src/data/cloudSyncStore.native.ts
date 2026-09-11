import { openDatabaseSync } from 'expo-sqlite';
import {
  CloudSyncOutboxItem,
  CloudSyncStore,
  createId,
} from './cloudSyncStoreTypes';

type OutboxRow = {
  id: string;
  app_id: string;
  operation: 'upsert' | 'delete';
  table_name: string;
  record_id: string;
  record: string | null;
  local_updated_at: string;
  created_at: string;
  attempt_count: number;
  next_attempt_at: string;
  last_error: string | null;
};

type WatermarkRow = {
  watermark: string;
};

type DeviceRow = {
  device_id: string;
};

export function createCloudSyncStore(namespace: string): CloudSyncStore {
  return new NativeCloudSyncStore(namespace);
}

class NativeCloudSyncStore implements CloudSyncStore {
  private db = openDatabaseSync('ministore_sync.db');

  constructor(private namespace: string) {
    this.db.execSync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        namespace TEXT NOT NULL,
        app_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        record TEXT,
        local_updated_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_due ON sync_outbox(namespace, app_id, next_attempt_at, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_outbox_record ON sync_outbox(namespace, app_id, table_name, record_id);
      CREATE TABLE IF NOT EXISTS sync_watermarks (
        namespace TEXT NOT NULL,
        app_id TEXT NOT NULL,
        watermark TEXT NOT NULL,
        PRIMARY KEY(namespace, app_id)
      );
      CREATE TABLE IF NOT EXISTS sync_devices (
        namespace TEXT PRIMARY KEY NOT NULL,
        device_id TEXT NOT NULL
      );
    `);
  }

  enqueue(item: CloudSyncOutboxItem) {
    this.db.runSync(
      `INSERT OR REPLACE INTO sync_outbox
        (id, namespace, app_id, operation, table_name, record_id, record, local_updated_at, created_at, attempt_count, next_attempt_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      item.id,
      this.namespace,
      item.appId,
      item.operation,
      item.tableName,
      item.recordId,
      item.record ? JSON.stringify(item.record) : null,
      item.localUpdatedAt,
      item.createdAt,
      item.attemptCount,
      item.nextAttemptAt,
      item.lastError,
    );
  }

  getDueOutboxItems(appId: string, now: string, limit: number) {
    return this.db
      .getAllSync<OutboxRow>(
        `SELECT * FROM sync_outbox
         WHERE namespace = ? AND app_id = ? AND next_attempt_at <= ?
         ORDER BY created_at ASC
         LIMIT ?`,
        this.namespace,
        appId,
        now,
        limit,
      )
      .flatMap(rowToOutboxItem);
  }

  getPendingCount(appId: string) {
    const [row] = this.db.getAllSync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM sync_outbox WHERE namespace = ? AND app_id = ?',
      this.namespace,
      appId,
    );
    return row?.count ?? 0;
  }

  removeOutboxItems(ids: string[]) {
    ids.forEach((id) => {
      this.db.runSync('DELETE FROM sync_outbox WHERE namespace = ? AND id = ?', this.namespace, id);
    });
  }

  markOutboxItemsFailed(ids: string[], error: string, nextAttemptAt: string) {
    ids.forEach((id) => {
      this.db.runSync(
        `UPDATE sync_outbox
         SET attempt_count = attempt_count + 1, last_error = ?, next_attempt_at = ?
         WHERE namespace = ? AND id = ?`,
        error,
        nextAttemptAt,
        this.namespace,
        id,
      );
    });
  }

  clearAppState(appId: string) {
    this.db.runSync('DELETE FROM sync_outbox WHERE namespace = ? AND app_id = ?', this.namespace, appId);
    this.db.runSync('DELETE FROM sync_watermarks WHERE namespace = ? AND app_id = ?', this.namespace, appId);
  }

  getWatermark(appId: string) {
    const [row] = this.db.getAllSync<WatermarkRow>(
      'SELECT watermark FROM sync_watermarks WHERE namespace = ? AND app_id = ?',
      this.namespace,
      appId,
    );
    return row?.watermark ?? null;
  }

  setWatermark(appId: string, watermark: string) {
    this.db.runSync(
      'INSERT OR REPLACE INTO sync_watermarks (namespace, app_id, watermark) VALUES (?, ?, ?)',
      this.namespace,
      appId,
      watermark,
    );
  }

  getDeviceId() {
    const [row] = this.db.getAllSync<DeviceRow>('SELECT device_id FROM sync_devices WHERE namespace = ?', this.namespace);
    if (row?.device_id) {
      return row.device_id;
    }

    const deviceId = createId('device');
    this.db.runSync('INSERT OR REPLACE INTO sync_devices (namespace, device_id) VALUES (?, ?)', this.namespace, deviceId);
    return deviceId;
  }
}

function rowToOutboxItem(row: OutboxRow): CloudSyncOutboxItem[] {
  try {
    return [
      {
        id: row.id,
        appId: row.app_id,
        operation: row.operation,
        tableName: row.table_name,
        recordId: row.record_id,
        record: row.record ? JSON.parse(row.record) : null,
        localUpdatedAt: row.local_updated_at,
        createdAt: row.created_at,
        attemptCount: row.attempt_count,
        nextAttemptAt: row.next_attempt_at,
        lastError: row.last_error,
      },
    ];
  } catch (error) {
    console.warn('Ignoring invalid sync outbox payload.', error);
    return [];
  }
}
