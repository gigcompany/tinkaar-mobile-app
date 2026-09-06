import { AppRecord } from '../data/repository';
import { DataSourceDefinition, FilterDefinition } from '../schema/appDefinition.schema';

export function applyDatasource(records: AppRecord[], datasource?: DataSourceDefinition) {
  if (!datasource) {
    return records;
  }

  const filter = datasource.filter;
  let next = filter ? records.filter((record) => matchesFilter(record, filter)) : records;

  datasource.sort?.forEach((sort) => {
    next = [...next].sort((left, right) => {
      const leftValue = String(left[sort.field] ?? '');
      const rightValue = String(right[sort.field] ?? '');
      const direction = sort.dir === 'asc' ? 1 : -1;
      return leftValue.localeCompare(rightValue) * direction;
    });
  });

  return next;
}

export function matchesFilter(record: AppRecord, filter: FilterDefinition) {
  const value = record[filter.field];

  if (filter.op === 'eq') {
    return value === filter.value;
  }

  if (filter.op === 'neq') {
    return value !== filter.value;
  }

  return String(value ?? '').toLowerCase().includes(String(filter.value ?? '').toLowerCase());
}
