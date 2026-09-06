import { CrudRepository, RecordValue } from '../data/repository';
import { AppDefinition } from '../schema/appDefinition.schema';
import { LogicExecutionResult, LogicTrigger } from './logicEngine';

export type RuntimeContextForActions = {
  app: AppDefinition;
  repository: CrudRepository;
  draft: Record<string, RecordValue>;
  editingRecord: { tableName: string; recordId: string } | null;
  pageId: string;
  setDraftValue: (field: string, value: RecordValue) => void;
  runLogic: (trigger: LogicTrigger) => LogicExecutionResult;
  openModal: (pageId: string, source?: { tableName: string; record: Record<string, RecordValue> & { id: string } }) => void;
  closeModal: () => void;
  navigate: (pageId: string) => void;
};
