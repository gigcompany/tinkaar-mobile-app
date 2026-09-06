import type { AppRecord, CrudRepository } from './repository';
import type { TableDefinition } from '../schema/appDefinition.schema';

export type SQLiteRepositoryOptions = {
  appId: string;
  databaseName?: string;
};

export function createSQLiteRepository(
  _tables: TableDefinition[],
  _seed: Record<string, AppRecord[]>,
  _options: SQLiteRepositoryOptions,
): CrudRepository | null {
  return null;
}

export function isSQLiteAdapterAvailable() {
  return false;
}
