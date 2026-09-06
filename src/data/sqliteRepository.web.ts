import type { AppRecord, CrudRepository } from './repository';
import type { TableDefinition } from '../schema/appDefinition.schema';
import type { SQLiteRepositoryOptions } from './sqliteRepository';

const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

class WebSQLiteRepository implements CrudRepository {
  readonly adapterName = 'sqlite';
  private listeners = new Set<() => void>();
  private tableNames: string[];
  private storagePrefix: string;

  constructor(tables: TableDefinition[], seed: Record<string, AppRecord[]>, options: SQLiteRepositoryOptions) {
    this.tableNames = tables.map((table) => table.tableName);
    this.storagePrefix = `ministore:${options.databaseName ?? 'ministore'}:${options.appId}`;

    this.tableNames.forEach((tableName) => {
      if (globalThis.localStorage.getItem(this.getStorageKey(tableName)) === null) {
        this.writeRecords(tableName, seed[tableName] ?? []);
      }
      this.removeLegacyTodoSeedRecords(options.appId, tableName);
    });
  }

  getRecords(tableName: string) {
    this.assertKnownTable(tableName);
    return this.readRecords(tableName);
  }

  createRecord(tableName: string, values: Omit<AppRecord, 'id'>) {
    const next = { ...values, id: createId() };
    this.upsertRecord(tableName, next);
    return next;
  }

  upsertRecord(tableName: string, record: AppRecord) {
    const records = this.readRecords(tableName);
    const exists = records.some((candidate) => candidate.id === record.id);
    this.writeRecords(tableName, exists ? records.map((candidate) => (candidate.id === record.id ? record : candidate)) : [...records, record]);
    this.emit();
  }

  updateRecord(tableName: string, recordId: string, patch: Partial<AppRecord>) {
    const records = this.readRecords(tableName);
    this.writeRecords(
      tableName,
      records.map((record) => (record.id === recordId ? ({ ...record, ...patch, id: recordId } as AppRecord) : record)),
    );
    this.emit();
  }

  deleteRecord(tableName: string, recordId: string) {
    this.writeRecords(
      tableName,
      this.readRecords(tableName).filter((record) => record.id !== recordId),
    );
    this.emit();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private getStorageKey(tableName: string) {
    return `${this.storagePrefix}:${tableName}`;
  }

  private readRecords(tableName: string) {
    this.assertKnownTable(tableName);

    try {
      const stored = globalThis.localStorage.getItem(this.getStorageKey(tableName));
      const parsed = stored ? (JSON.parse(stored) as unknown) : [];
      return Array.isArray(parsed) ? parsed.filter(isAppRecord) : [];
    } catch (error) {
      console.warn('Ignoring invalid web repository payload.', error);
      return [];
    }
  }

  private writeRecords(tableName: string, records: AppRecord[]) {
    this.assertKnownTable(tableName);
    globalThis.localStorage.setItem(this.getStorageKey(tableName), JSON.stringify(records));
  }

  private assertKnownTable(tableName: string) {
    if (!this.tableNames.includes(tableName)) {
      throw new Error(`Unknown table: ${tableName}`);
    }
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private removeLegacyTodoSeedRecords(appId: string, tableName: string) {
    if (appId !== 'todo' || tableName !== 'Tasks') {
      return;
    }

    const next = this.readRecords(tableName).filter((record) => {
      const expectedTitle = legacyTodoSeedTitles[record.id];
      return !expectedTitle || record.title !== expectedTitle;
    });
    this.writeRecords(tableName, next);
  }
}

export function createSQLiteRepository(
  tables: TableDefinition[],
  seed: Record<string, AppRecord[]>,
  options: SQLiteRepositoryOptions,
): CrudRepository | null {
  if (typeof globalThis.localStorage === 'undefined') {
    return null;
  }

  return new WebSQLiteRepository(tables, seed, options);
}

export function isSQLiteAdapterAvailable() {
  return typeof globalThis.localStorage !== 'undefined';
}

function isAppRecord(value: unknown): value is AppRecord {
  return typeof value === 'object' && value !== null && typeof (value as AppRecord).id === 'string';
}

const legacyTodoSeedTitles: Record<string, string> = {
  'task-1': 'Draft the customer intake workflow',
  'task-2': 'Map first template fields',
  'task-3': 'Validate renderer schema',
};
