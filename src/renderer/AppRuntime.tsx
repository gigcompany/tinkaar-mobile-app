import { PropsWithChildren, createContext, useCallback, useEffect, useContext, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { AppDefinition, PageDefinition } from '../schema/appDefinition.schema';
import { AppRecord, CrudRepository, RecordValue, RepositorySyncStatus } from '../data/repository';
import { ResolvedAppTheme } from '../theme/theme';
import { executeLogic, LogicExecutionResult, LogicTrigger } from './logicEngine';

type DraftRecord = Record<string, RecordValue>;

type RuntimeContextValue = {
  app: AppDefinition;
  theme: ResolvedAppTheme;
  currency: string;
  activePage: PageDefinition;
  modalPage: PageDefinition | null;
  repository: CrudRepository;
  syncStatus: RepositorySyncStatus;
  draft: DraftRecord;
  editingRecord: { tableName: string; recordId: string } | null;
  pageId: string;
  setDraftValue: (field: string, value: RecordValue) => void;
  runLogic: (trigger: LogicTrigger) => LogicExecutionResult;
  openModal: (pageId: string, source?: { tableName: string; record: AppRecord }) => void;
  closeModal: () => void;
  navigate: (pageId: string) => void;
  forceSync: () => Promise<void>;
  version: number;
};

type RecordContextValue = {
  record: AppRecord | null;
  tableName: string | null;
};

const RuntimeContext = createContext<RuntimeContextValue | null>(null);
const RecordContext = createContext<RecordContextValue>({ record: null, tableName: null });
const disabledSyncStatus: RepositorySyncStatus = {
  phase: 'disabled',
  pendingCount: 0,
  lastSyncedAt: null,
  lastPulledAt: null,
  lastError: null,
};

export function AppRuntimeProvider({
  app,
  repository,
  theme,
  currency,
  children,
}: PropsWithChildren<{ app: AppDefinition; repository: CrudRepository; theme: ResolvedAppTheme; currency: string }>) {
  const bootState = useMemo(() => getBootState(app), [app]);
  const [activePageId, setActivePageId] = useState(bootState.pageId);
  const [modalPageId, setModalPageId] = useState<string | null>(bootState.modalPageId);
  const [draft, setDraft] = useState<DraftRecord>({});
  const draftRef = useRef<DraftRecord>({});
  const [editingRecord, setEditingRecord] = useState<{ tableName: string; recordId: string } | null>(null);
  const [version, setVersion] = useState(0);
  const [syncStatus, setSyncStatus] = useState<RepositorySyncStatus>(() => repository.getSyncStatus?.() ?? disabledSyncStatus);

  useEffect(() => {
    const unsubscribe = repository.subscribe(() => setVersion((current) => current + 1));
    return () => {
      unsubscribe();
    };
  }, [repository]);

  useEffect(() => {
    setSyncStatus(repository.getSyncStatus?.() ?? disabledSyncStatus);
    const unsubscribe = repository.subscribeSyncStatus?.(() => {
      setSyncStatus(repository.getSyncStatus?.() ?? disabledSyncStatus);
    });
    return () => {
      unsubscribe?.();
    };
  }, [repository]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const getEditingRecord = useCallback(() => {
    if (!editingRecord) {
      return null;
    }

    return repository.getRecords(editingRecord.tableName).find((record) => record.id === editingRecord.recordId) ?? null;
  }, [editingRecord, repository]);

  const runLogic = useCallback(
    (trigger: LogicTrigger) => {
      const pageId = trigger.pageId ?? modalPageId ?? activePageId;
      let executionResult: LogicExecutionResult = {
        draft: draftRef.current,
        blocked: false,
        messages: [],
        actions: [],
      };

      setDraft((currentDraft) => {
        const startingDraft =
          trigger.event === 'fieldChange' && trigger.field
            ? { ...currentDraft, [trigger.field]: trigger.value ?? null }
            : currentDraft;

        executionResult = executeLogic({
          app,
          trigger: { ...trigger, pageId },
          draft: startingDraft,
          record: trigger.record ?? getEditingRecord(),
        });
        draftRef.current = executionResult.draft;

        return executionResult.draft;
      });

      if (executionResult.messages.length > 0) {
        Alert.alert(executionResult.messages[0], executionResult.messages.slice(1).join('\n') || undefined);
      }

      return executionResult;
    },
    [activePageId, app, getEditingRecord, modalPageId],
  );

  useEffect(() => {
    const pageId = modalPageId ?? activePageId;
    runLogic({ event: 'preLoad', pageId });
    const postLoadHandle = setTimeout(() => runLogic({ event: 'postLoad', pageId }), 0);

    return () => clearTimeout(postLoadHandle);
  }, [activePageId, app.appId, modalPageId, runLogic]);

  const value = useMemo<RuntimeContextValue>(() => {
    const activePage = app.pages.find((page) => page.pageId === activePageId) ?? app.pages[0];
    const modalPage = app.pages.find((page) => page.pageId === modalPageId) ?? null;

    return {
      app,
      theme,
      currency,
      activePage,
      modalPage,
      repository,
      syncStatus,
      draft,
      editingRecord,
      pageId: modalPageId ?? activePageId,
      version,
      runLogic,
      setDraftValue(field, value) {
        runLogic({ event: 'fieldChange', pageId: modalPageId ?? activePageId, field, value });
      },
      openModal(pageId, source) {
        if (source) {
          const nextDraft = copyRecordFields(source.record);
          draftRef.current = nextDraft;
          setDraft(nextDraft);
          setEditingRecord({ tableName: source.tableName, recordId: source.record.id });
        } else {
          draftRef.current = {};
          setDraft({});
          setEditingRecord(null);
        }
        setModalPageId(pageId);
      },
      closeModal() {
        draftRef.current = {};
        setDraft({});
        setEditingRecord(null);
        setModalPageId(null);
      },
      navigate(pageId) {
        setActivePageId(pageId);
      },
      forceSync() {
        return repository.forceSync?.() ?? Promise.resolve();
      },
    };
  }, [activePageId, app, currency, draft, editingRecord, modalPageId, repository, runLogic, syncStatus, theme, version]);

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

function copyRecordFields(record: AppRecord) {
  const { id, ...fields } = record;
  return fields;
}

function getBootState(app: AppDefinition) {
  const defaultPageId = app.navigation.items[0]?.pageId ?? app.pages[0]?.pageId ?? '';
  const params = getWebSearchParams();
  const requestedPageId = params?.get('page');
  const requestedModalPageId = params?.get('modal');
  const pageId = requestedPageId && app.pages.some((page) => page.pageId === requestedPageId) ? requestedPageId : defaultPageId;
  const modalPageId =
    requestedModalPageId && app.pages.some((page) => page.pageId === requestedModalPageId) ? requestedModalPageId : null;

  return { pageId, modalPageId };
}

function getWebSearchParams() {
  if (typeof globalThis.location === 'undefined') {
    return null;
  }

  return new URLSearchParams(globalThis.location.search);
}

export function useRuntime() {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error('useRuntime must be used inside AppRuntimeProvider');
  }
  return context;
}

export function RecordProvider({
  record,
  tableName,
  children,
}: PropsWithChildren<{ record: AppRecord | null; tableName: string | null }>) {
  return <RecordContext.Provider value={{ record, tableName }}>{children}</RecordContext.Provider>;
}

export function useRecordContext() {
  return useContext(RecordContext);
}
