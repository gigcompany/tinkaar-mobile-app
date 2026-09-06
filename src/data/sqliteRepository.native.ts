import { openDatabaseSync, SQLiteDatabase } from 'expo-sqlite';
import type { AppRecord, CrudRepository, Listener } from './repository';
import type { TableDefinition } from '../schema/appDefinition.schema';
import type { SQLiteRepositoryOptions } from './sqliteRepository';

type StoredRow = {
  id: string;
  data: string;
};

const createId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

class NativeSQLiteRepository implements CrudRepository {
  readonly adapterName = 'sqlite';
  private db: SQLiteDatabase;
  private listeners = new Set<Listener>();
  private physicalTables = new Map<string, string>();

  constructor(tables: TableDefinition[], seed: Record<string, AppRecord[]>, options: SQLiteRepositoryOptions) {
    this.db = openDatabaseSync(options.databaseName ?? 'ministore.db');
    this.db.execSync('PRAGMA journal_mode = WAL');

    tables.forEach((table) => {
      const physicalTable = getPhysicalTableName(options.appId, table.tableName);
      this.physicalTables.set(table.tableName, physicalTable);
      this.db.execSync(
        `CREATE TABLE IF NOT EXISTS "${physicalTable}" (
          id TEXT PRIMARY KEY NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`,
      );

      const [{ count }] = this.db.getAllSync<{ count: number }>(`SELECT COUNT(*) AS count FROM "${physicalTable}"`);
      if (count === 0) {
        seed[table.tableName]?.forEach((record) => {
          this.insertRecord(physicalTable, record);
        });
      }

      removeLegacyTodoSeedRecords(this.db, options.appId, table.tableName, physicalTable);
    });
  }

  getRecords(tableName: string) {
    const physicalTable = this.getPhysicalTable(tableName);
    const rows = this.db.getAllSync<StoredRow>(`SELECT id, data FROM "${physicalTable}" ORDER BY created_at ASC`);

    return rows.map((row) => ({ id: row.id, ...parseStoredData(row.data) }));
  }

  createRecord(tableName: string, values: Omit<AppRecord, 'id'>) {
    const physicalTable = this.getPhysicalTable(tableName);
    const next = { ...values, id: createId() };
    this.insertRecord(physicalTable, next);
    this.emit();
    return next;
  }

  upsertRecord(tableName: string, record: AppRecord) {
    const physicalTable = this.getPhysicalTable(tableName);
    this.insertRecord(physicalTable, record);
    this.emit();
  }

  updateRecord(tableName: string, recordId: string, patch: Partial<AppRecord>) {
    const existing = this.getRecords(tableName).find((record) => record.id === recordId);
    if (!existing) {
      return;
    }

    const physicalTable = this.getPhysicalTable(tableName);
    const next = { ...existing, ...patch, id: recordId };
    this.db.runSync(
      `UPDATE "${physicalTable}" SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      JSON.stringify(stripId(next)),
      recordId,
    );
    this.emit();
  }

  deleteRecord(tableName: string, recordId: string) {
    const physicalTable = this.getPhysicalTable(tableName);
    this.db.runSync(`DELETE FROM "${physicalTable}" WHERE id = ?`, recordId);
    this.emit();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private insertRecord(physicalTable: string, record: AppRecord) {
    this.db.runSync(
      `INSERT OR REPLACE INTO "${physicalTable}" (id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
      record.id,
      JSON.stringify(stripId(record)),
    );
  }

  private getPhysicalTable(tableName: string) {
    const physicalTable = this.physicalTables.get(tableName);
    if (!physicalTable) {
      throw new Error(`Unknown table: ${tableName}`);
    }
    return physicalTable;
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}

export function createSQLiteRepository(
  tables: TableDefinition[],
  seed: Record<string, AppRecord[]>,
  options: SQLiteRepositoryOptions,
): CrudRepository | null {
  return new NativeSQLiteRepository(tables, seed, options);
}

export function isSQLiteAdapterAvailable() {
  return true;
}

function getPhysicalTableName(appId: string, tableName: string) {
  return `app_${sanitizeIdentifier(appId)}_${sanitizeIdentifier(tableName)}`;
}

function sanitizeIdentifier(value: string) {
  return value.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
}

function parseStoredData(data: string): Omit<AppRecord, 'id'> {
  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Omit<AppRecord, 'id'>) : {};
  } catch (error) {
    console.warn('Ignoring invalid SQLite record payload.', error);
    return {};
  }
}

function stripId(record: AppRecord): Omit<AppRecord, 'id'> {
  const { id: _id, ...values } = record;
  return values;
}

const legacyTodoSeedTitles: Record<string, string> = {
  'task-1': 'Draft the customer intake workflow',
  'task-2': 'Map first template fields',
  'task-3': 'Validate renderer schema',
};

function removeLegacyTodoSeedRecords(
  db: SQLiteDatabase,
  appId: string,
  tableName: string,
  physicalTable: string,
) {
  if (appId !== 'todo' || tableName !== 'Tasks') {
    return;
  }

  const rows = db.getAllSync<StoredRow>(`SELECT id, data FROM "${physicalTable}"`);
  rows.forEach((row) => {
    const expectedTitle = legacyTodoSeedTitles[row.id];
    if (!expectedTitle) {
      return;
    }

    const data = parseStoredData(row.data);
    if (data.title === expectedTitle) {
      db.runSync(`DELETE FROM "${physicalTable}" WHERE id = ?`, row.id);
    }
  });
}
