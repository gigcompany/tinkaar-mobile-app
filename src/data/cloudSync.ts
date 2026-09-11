import { AppDefinition } from '../schema/appDefinition.schema';
import { AppRecord, CrudRepository, Listener, RepositorySyncStatus } from './repository';
import { createCloudSyncStore } from './cloudSyncStore';
import { CloudSyncOutboxItem, createOutboxItem, getBackoffDelayMs } from './cloudSyncStoreTypes';

export type SupabaseCloudSyncConfig = {
  engine: 'supabase';
  enabled?: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  accessToken?: string;
  ownerId?: string;
  tableName?: string;
  payloadColumn?: 'payload' | 'data';
  maxBatchSize?: number;
  pullPageSize?: number;
  retryIntervalMs?: number;
};

type SupabaseRecordRow = {
  owner_id?: string;
  app_id: string;
  table_name: string;
  record_id: string;
  payload?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
  deleted_at: string | null;
  updated_at: string;
  device_id?: string | null;
  sync_version?: number | null;
};

const defaultTableName = 'ministore_records';
const defaultOwnerId = 'default';
const defaultMaxBatchSize = 25;
const defaultPullPageSize = 250;
const defaultRetryIntervalMs = 30_000;

export function withCloudSyncRepository({
  repository,
  app,
  config,
}: {
  repository: CrudRepository;
  app: AppDefinition;
  config: SupabaseCloudSyncConfig | null;
}): CrudRepository {
  if (!config || config.enabled === false || app.data.cloudSync?.enabled === false) {
    return repository;
  }

  if (app.data.cloudSync && app.data.cloudSync.engine !== config.engine) {
    return repository;
  }

  let coordinator: SupabaseSyncCoordinator;
  try {
    coordinator = new SupabaseSyncCoordinator(repository, app, config);
  } catch (error) {
    console.warn('Disabling cloud sync after local sync store initialization failed.', error);
    return repository;
  }

  return {
    adapterName: repository.adapterName,
    getRecords: (tableName) => repository.getRecords(tableName),
    upsertRecord(tableName, record) {
      repository.upsertRecord(tableName, record);
      coordinator.enqueueUpsert(tableName, record);
    },
    createRecord(tableName, values) {
      const record = repository.createRecord(tableName, values);
      coordinator.enqueueUpsert(tableName, record);
      return record;
    },
    updateRecord(tableName, recordId, patch) {
      repository.updateRecord(tableName, recordId, patch);
      const record = repository.getRecords(tableName).find((candidate) => candidate.id === recordId);
      if (record) {
        coordinator.enqueueUpsert(tableName, record);
      }
    },
    deleteRecord(tableName, recordId) {
      const record = repository.getRecords(tableName).find((candidate) => candidate.id === recordId);
      repository.deleteRecord(tableName, recordId);
      coordinator.enqueueDelete(tableName, recordId, record ?? null);
    },
    subscribe: (listener) => repository.subscribe(listener),
    getSyncStatus: () => coordinator.getStatus(),
    forceSync: () => coordinator.syncNow(),
    subscribeSyncStatus: (listener) => coordinator.subscribe(listener),
  };
}

class SupabaseSyncCoordinator {
  private appId: string;
  private endpoint: string;
  private ownerId: string;
  private payloadColumn: 'payload' | 'data';
  private deviceId: string;
  private maxBatchSize: number;
  private pullPageSize: number;
  private retryIntervalMs: number;
  private store;
  private statusListeners = new Set<Listener>();
  private syncInFlight = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private status: RepositorySyncStatus = {
    phase: 'idle',
    pendingCount: 0,
    lastSyncedAt: null,
    lastPulledAt: null,
    lastError: null,
  };

  constructor(
    private repository: CrudRepository,
    private app: AppDefinition,
    private config: SupabaseCloudSyncConfig,
  ) {
    this.appId = app.appId;
    this.ownerId = config.ownerId ?? defaultOwnerId;
    this.payloadColumn = config.payloadColumn ?? 'payload';
    this.maxBatchSize = config.maxBatchSize ?? defaultMaxBatchSize;
    this.pullPageSize = config.pullPageSize ?? defaultPullPageSize;
    this.retryIntervalMs = config.retryIntervalMs ?? defaultRetryIntervalMs;
    this.endpoint = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(
      app.data.cloudSync?.tableName ?? config.tableName ?? defaultTableName,
    )}`;
    this.store = createCloudSyncStore(`${this.ownerId}:${this.appId}`);
    this.deviceId = this.store.getDeviceId();
    this.updateStatus({ pendingCount: this.store.getPendingCount(this.appId) });
    this.scheduleSync(250);
  }

  enqueueUpsert(tableName: string, record: AppRecord) {
    this.store.enqueue(createOutboxItem({ appId: this.appId, operation: 'upsert', tableName, recordId: record.id, record }));
    this.updateStatus({ pendingCount: this.store.getPendingCount(this.appId), lastError: null });
    this.scheduleSync(0);
  }

  enqueueDelete(tableName: string, recordId: string, record: AppRecord | null) {
    this.store.enqueue(createOutboxItem({ appId: this.appId, operation: 'delete', tableName, recordId, record }));
    this.updateStatus({ pendingCount: this.store.getPendingCount(this.appId), lastError: null });
    this.scheduleSync(0);
  }

  getStatus() {
    return this.status;
  }

  subscribe(listener: Listener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  async syncNow() {
    if (this.syncInFlight) {
      return;
    }

    this.syncInFlight = true;
    this.updateStatus({ phase: 'syncing', pendingCount: this.store.getPendingCount(this.appId), lastError: null });

    try {
      await this.pushDueChanges();

      const pendingCount = this.store.getPendingCount(this.appId);
      if (pendingCount === 0) {
        await this.pullRemoteChanges();
      }

      this.updateStatus({
        phase: 'idle',
        pendingCount: this.store.getPendingCount(this.appId),
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      });
    } catch (error) {
      this.updateStatus({
        phase: 'error',
        pendingCount: this.store.getPendingCount(this.appId),
        lastError: getErrorMessage(error),
      });
    } finally {
      this.syncInFlight = false;
      if (this.store.getPendingCount(this.appId) > 0) {
        this.scheduleSync(this.retryIntervalMs);
      }
    }
  }

  private async pushDueChanges() {
    const now = new Date().toISOString();
    const items = this.store.getDueOutboxItems(this.appId, now, this.maxBatchSize);
    if (items.length === 0) {
      return;
    }

    try {
      await this.upsertRows(items.map((item) => outboxItemToSupabaseRow(item, this.ownerId, this.deviceId, this.payloadColumn)));
      this.store.removeOutboxItems(items.map((item) => item.id));
      this.updateStatus({ pendingCount: this.store.getPendingCount(this.appId) });
    } catch (error) {
      const maxAttemptCount = Math.max(...items.map((item) => item.attemptCount));
      const nextAttemptAt = new Date(Date.now() + getBackoffDelayMs(maxAttemptCount)).toISOString();
      this.store.markOutboxItemsFailed(items.map((item) => item.id), getErrorMessage(error), nextAttemptAt);
      throw error;
    }

    if (this.store.getDueOutboxItems(this.appId, new Date().toISOString(), this.maxBatchSize).length > 0) {
      await this.pushDueChanges();
    }
  }

  private async pullRemoteChanges() {
    let watermark = this.store.getWatermark(this.appId);
    let page = 0;

    while (page < 20) {
      const rows = await this.fetchRemoteRows(watermark);
      if (rows.length === 0) {
        return;
      }

      let nextWatermark = watermark;
      rows.forEach((row) => {
        this.applyRemoteRow(row);
        if (!nextWatermark || row.updated_at > nextWatermark) {
          nextWatermark = row.updated_at;
        }
      });

      if (nextWatermark) {
        this.store.setWatermark(this.appId, nextWatermark);
        this.updateStatus({ lastPulledAt: nextWatermark });
        watermark = nextWatermark;
      }

      if (rows.length < this.pullPageSize) {
        return;
      }
      page += 1;
    }
  }

  private applyRemoteRow(row: SupabaseRecordRow) {
    if (!this.app.tables.some((table) => table.tableName === row.table_name)) {
      return;
    }

    if (row.deleted_at) {
      this.repository.deleteRecord(row.table_name, row.record_id);
      return;
    }

    const payload = this.payloadColumn === 'data' ? row.data ?? {} : row.payload ?? {};
    this.repository.upsertRecord(row.table_name, { id: row.record_id, ...payload } as AppRecord);
  }

  private async upsertRows(rows: SupabaseRecordRow[]) {
    if (rows.length === 0) {
      return;
    }

    const response = await fetch(`${this.endpoint}?on_conflict=owner_id,app_id,table_name,record_id`, {
      method: 'POST',
      headers: this.getHeaders('resolution=merge-duplicates,return=minimal'),
      body: JSON.stringify(rows),
    });

    await assertOk(response, 'Supabase push failed');
  }

  private async fetchRemoteRows(watermark: string | null) {
    const params = new URLSearchParams({
      select: `owner_id,app_id,table_name,record_id,${this.payloadColumn},deleted_at,updated_at,device_id,sync_version`,
      owner_id: `eq.${this.ownerId}`,
      app_id: `eq.${this.appId}`,
      order: 'updated_at.asc',
      limit: String(this.pullPageSize),
    });

    if (watermark) {
      params.set('updated_at', `gt.${watermark}`);
    }

    const response = await fetch(`${this.endpoint}?${params.toString()}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    await assertOk(response, 'Supabase pull failed');
    const parsed = (await response.json()) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSupabaseRecordRow) : [];
  }

  private getHeaders(prefer?: string) {
    return {
      apikey: this.config.supabaseAnonKey,
      Authorization: `Bearer ${this.config.accessToken ?? this.config.supabaseAnonKey}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    };
  }

  private scheduleSync(delayMs: number) {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, delayMs);
  }

  private updateStatus(patch: Partial<RepositorySyncStatus>) {
    this.status = { ...this.status, ...patch };
    this.statusListeners.forEach((listener) => listener());
  }
}

function outboxItemToSupabaseRow(
  item: CloudSyncOutboxItem,
  ownerId: string,
  deviceId: string,
  payloadColumn: 'payload' | 'data',
): SupabaseRecordRow {
  const payload = item.operation === 'delete' ? null : stripId(item.record);
  return {
    owner_id: ownerId,
    app_id: item.appId,
    table_name: item.tableName,
    record_id: item.recordId,
    [payloadColumn]: payload,
    deleted_at: item.operation === 'delete' ? item.localUpdatedAt : null,
    updated_at: item.localUpdatedAt,
    device_id: deviceId,
    sync_version: Date.parse(item.localUpdatedAt),
  };
}

function stripId(record: AppRecord | null) {
  if (!record) {
    return {};
  }

  const { id: _id, ...values } = record;
  return values;
}

async function assertOk(response: Response, prefix: string) {
  if (!response.ok) {
    throw new Error(`${prefix} (${response.status}): ${await response.text()}`);
  }
}

function isSupabaseRecordRow(value: unknown): value is SupabaseRecordRow {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const row = value as SupabaseRecordRow;
  return (
    typeof row.app_id === 'string' &&
    typeof row.table_name === 'string' &&
    typeof row.record_id === 'string' &&
    typeof row.updated_at === 'string' &&
    (row.deleted_at === null || typeof row.deleted_at === 'string')
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
