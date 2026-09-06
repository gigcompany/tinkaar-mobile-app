import { Alert } from 'react-native';
import { AppRecord, RecordValue } from '../data/repository';
import { ActionDefinition, FieldDefinition } from '../schema/appDefinition.schema';
import { RuntimeContextForActions } from './types';

export function dispatchAction(action: ActionDefinition | undefined, context: RuntimeContextForActions, record: AppRecord | null) {
  if (!action) {
    return;
  }

  switch (action.type) {
    case 'openModal':
      if (action.target) {
        context.openModal(action.target, record && action.table ? { tableName: action.table, record } : undefined);
      }
      return;
    case 'closeModal':
      context.closeModal();
      return;
    case 'navigate':
      if (action.pageId) {
        context.navigate(action.pageId);
      }
      return;
    case 'toggleField':
      if (record && action.table && action.field && hasOperation(context, action.table, 'update')) {
        context.repository.updateRecord(action.table, record.id, { [action.field]: !record[action.field] });
      }
      return;
    case 'updateRecord':
      if (record && action.table && action.field && hasOperation(context, action.table, 'update')) {
        context.repository.updateRecord(action.table, record.id, sanitizeRecordPatch(context, action.table, { [action.field]: action.value as RecordValue }));
      } else if (action.table && context.editingRecord?.tableName === action.table && hasOperation(context, action.table, 'update')) {
        const validationMessages = validateRequiredFields(context, action.table, context.draft);
        const validationResult = context.runLogic({ event: 'validation', pageId: context.pageId, table: action.table, record });
        const preSubmissionResult = validationResult.blocked
          ? validationResult
          : context.runLogic({ event: 'preSubmission', pageId: context.pageId, table: action.table, record });

        if (validationMessages.length > 0 || validationResult.blocked || preSubmissionResult.blocked) {
          showValidationMessages(validationMessages);
          return;
        }

        const patch = sanitizeRecordPatch(context, action.table, preSubmissionResult.draft);
        context.repository.updateRecord(action.table, context.editingRecord.recordId, patch);
        const updatedRecord =
          context.repository.getRecords(action.table).find((candidate) => candidate.id === context.editingRecord?.recordId) ?? record;
        runQueuedActions(preSubmissionResult.actions, context, updatedRecord);
        const postSubmissionResult = context.runLogic({
          event: 'postSubmission',
          pageId: context.pageId,
          table: action.table,
          record: updatedRecord,
        });
        runQueuedActions(postSubmissionResult.actions, context, updatedRecord);
        dispatchAction(action.onSuccess, context, updatedRecord);
      }
      return;
    case 'createRecord':
      if (action.table && hasOperation(context, action.table, 'create')) {
        const draftWithDefaults = { ...getDefaultValues(context, action.table), ...context.draft };
        const validationMessages = validateRequiredFields(context, action.table, draftWithDefaults);
        const validationResult = context.runLogic({ event: 'validation', pageId: context.pageId, table: action.table, record });
        const preSubmissionResult = validationResult.blocked
          ? validationResult
          : context.runLogic({ event: 'preSubmission', pageId: context.pageId, table: action.table, record });

        if (validationMessages.length > 0 || validationResult.blocked || preSubmissionResult.blocked) {
          showValidationMessages(validationMessages);
          return;
        }

        const createdRecord = context.repository.createRecord(
          action.table,
          sanitizeRecordPatch(context, action.table, { ...getDefaultValues(context, action.table), ...preSubmissionResult.draft }),
        );
        runQueuedActions(preSubmissionResult.actions, context, createdRecord);
        const postSubmissionResult = context.runLogic({
          event: 'postSubmission',
          pageId: context.pageId,
          table: action.table,
          record: createdRecord,
        });
        runQueuedActions(postSubmissionResult.actions, context, createdRecord);
        dispatchAction(action.onSuccess, context, createdRecord);
      }
      return;
    case 'deleteRecord':
      if (action.table && hasOperation(context, action.table, 'delete')) {
        const recordId = record?.id ?? (context.editingRecord?.tableName === action.table ? context.editingRecord.recordId : null);
        if (recordId) {
          context.repository.deleteRecord(action.table, recordId);
          dispatchAction(action.onSuccess, context, record);
        }
      }
      return;
    case 'showToast':
      Alert.alert(action.message ?? 'Done');
      return;
  }
}

function runQueuedActions(actions: ActionDefinition[], context: RuntimeContextForActions, record: AppRecord | null) {
  actions.forEach((queuedAction) => dispatchAction(queuedAction, context, record));
}

function hasOperation(context: RuntimeContextForActions, table: string, type: 'create' | 'update' | 'delete') {
  return context.app.data.operations.some((operation) => operation.table === table && operation.type === type);
}

function getDefaultValues(context: RuntimeContextForActions, tableName: string) {
  const table = context.app.tables.find((candidate) => candidate.tableName === tableName);
  return Object.fromEntries(
    (table?.fields ?? [])
      .filter((field) => field.default !== undefined)
      .map((field) => [field.name, field.default as RecordValue]),
  );
}

function sanitizeRecordPatch(context: RuntimeContextForActions, tableName: string, values: Record<string, RecordValue>) {
  const table = context.app.tables.find((candidate) => candidate.tableName === tableName);
  if (!table) {
    return {};
  }

  return Object.fromEntries(
    table.fields.flatMap((field) => {
      if (!(field.name in values)) {
        return [];
      }

      return [[field.name, coerceRecordValue(field, values[field.name])]];
    }),
  );
}

function validateRequiredFields(context: RuntimeContextForActions, tableName: string, values: Record<string, RecordValue>) {
  const table = context.app.tables.find((candidate) => candidate.tableName === tableName);
  if (!table) {
    return [];
  }

  return table.fields
    .filter((field) => field.required && !isPresent(values[field.name]))
    .map((field) => `${toTitle(field.name)} is required.`);
}

function showValidationMessages(messages: string[]) {
  const uniqueMessages = [...new Set(messages)].filter(Boolean);
  if (uniqueMessages.length > 0) {
    Alert.alert(uniqueMessages[0], uniqueMessages.slice(1).join('\n') || undefined);
  }
}

function coerceRecordValue(field: FieldDefinition, value: RecordValue): RecordValue {
  if (value === null || value === undefined) {
    return field.default === undefined ? null : (field.default as RecordValue);
  }

  if (['number', 'decimal', 'percentage', 'currency'].includes(field.type)) {
    const number = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(number) ? number : 0;
  }

  if (field.type === 'boolean') {
    return value === true || value === 'true';
  }

  if (field.type === 'multiselect') {
    return Array.isArray(value) ? value.map(String) : String(value).split(',').map((item) => item.trim()).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === 'object') {
    return value;
  }

  return String(value);
}

function isPresent(value: unknown) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

function toTitle(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
