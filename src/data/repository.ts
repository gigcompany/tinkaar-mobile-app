import { TableDefinition } from '../schema/appDefinition.schema';
import { createSQLiteRepository } from './sqliteRepository';

export type RecordValue = string | number | boolean | null | string[] | Record<string, unknown>;
export type AppRecord = { id: string; [field: string]: RecordValue };
export type Listener = () => void;
export type StorageAdapterName = 'memory' | 'sqlite';

export type CrudRepository = {
  readonly adapterName: StorageAdapterName;
  getRecords: (tableName: string) => AppRecord[];
  upsertRecord: (tableName: string, record: AppRecord) => void;
  createRecord: (tableName: string, values: Omit<AppRecord, 'id'>) => AppRecord;
  updateRecord: (tableName: string, recordId: string, patch: Partial<AppRecord>) => void;
  deleteRecord: (tableName: string, recordId: string) => void;
  subscribe: (listener: Listener) => () => void;
  getSyncStatus?: () => RepositorySyncStatus;
  forceSync?: () => Promise<void>;
  subscribeSyncStatus?: (listener: Listener) => () => void;
};

export type RepositorySyncStatus = {
  phase: 'disabled' | 'idle' | 'syncing' | 'error';
  pendingCount: number;
  lastSyncedAt: string | null;
  lastPulledAt: string | null;
  lastError: string | null;
};

const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export class InMemoryRepository implements CrudRepository {
  readonly adapterName = 'memory';
  private records = new Map<string, AppRecord[]>();
  private listeners = new Set<Listener>();

  constructor(tables: TableDefinition[], seed: Record<string, AppRecord[]>) {
    tables.forEach((table) => {
      this.records.set(table.tableName, seed[table.tableName] ?? []);
    });
  }

  getRecords(tableName: string) {
    return [...(this.records.get(tableName) ?? [])];
  }

  createRecord(tableName: string, values: Omit<AppRecord, 'id'>) {
    const next = { ...values, id: createId() };
    this.upsertRecord(tableName, next);
    return next;
  }

  upsertRecord(tableName: string, record: AppRecord) {
    const records = this.getRecords(tableName);
    const exists = records.some((candidate) => candidate.id === record.id);
    this.records.set(
      tableName,
      exists ? records.map((candidate) => (candidate.id === record.id ? record : candidate)) : [...records, record],
    );
    this.emit();
  }

  updateRecord(tableName: string, recordId: string, patch: Partial<AppRecord>) {
    this.records.set(
      tableName,
      this.getRecords(tableName).map((record) =>
        record.id === recordId ? ({ ...record, ...patch, id: recordId } as AppRecord) : record,
      ),
    );
    this.emit();
  }

  deleteRecord(tableName: string, recordId: string) {
    this.records.set(
      tableName,
      this.getRecords(tableName).filter((record) => record.id !== recordId),
    );
    this.emit();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

export function createRepository({
  appId,
  adapter,
  databaseName,
  tables,
  seed,
}: {
  appId: string;
  adapter: StorageAdapterName;
  databaseName?: string;
  tables: TableDefinition[];
  seed: Record<string, AppRecord[]>;
}): CrudRepository {
  if (adapter === 'sqlite') {
    try {
      const repository = createSQLiteRepository(tables, seed, { appId, databaseName });
      if (repository) {
        return repository;
      }
    } catch (error) {
      console.warn('Falling back to in-memory storage after SQLite initialization failed.', error);
    }
  }

  return new InMemoryRepository(tables, seed);
}
