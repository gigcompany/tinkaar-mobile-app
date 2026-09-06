import { AppRecord, RecordValue } from '../data/repository';
import {
  ActionDefinition,
  AppDefinition,
  LogicConditionDefinition,
  LogicEvent,
  LogicRuleDefinition,
  LogicStepDefinition,
  LogicValue,
  LogicValueReference,
  NodeDefinition,
} from '../schema/appDefinition.schema';

export type LogicTrigger = {
  event: LogicEvent;
  pageId?: string;
  table?: string;
  field?: string;
  nodeId?: string;
  value?: RecordValue;
  record?: AppRecord | null;
};

export type LogicExecutionResult = {
  draft: Record<string, RecordValue>;
  blocked: boolean;
  messages: string[];
  actions: ActionDefinition[];
};

export function executeLogic({
  app,
  trigger,
  draft,
  record,
}: {
  app: AppDefinition;
  trigger: LogicTrigger;
  draft: Record<string, RecordValue>;
  record?: AppRecord | null;
}): LogicExecutionResult {
  const nextDraft = { ...draft };
  const result: LogicExecutionResult = {
    draft: nextDraft,
    blocked: false,
    messages: [],
    actions: [],
  };
  const context = { draft: nextDraft, record: record ?? trigger.record ?? null, event: trigger };

  getLogicRules(app)
    .filter((rule) => matchesTrigger(rule, trigger))
    .forEach((rule) => {
      if (rule.when && !matchesCondition(rule.when, context)) {
        return;
      }

      runSteps(rule.steps, context, result);
    });

  return result;
}

function runSteps(
  steps: LogicStepDefinition[],
  context: {
    draft: Record<string, RecordValue>;
    record: AppRecord | null;
    event: LogicTrigger;
  },
  result: LogicExecutionResult,
) {
  steps.forEach((step) => {
    if (step.type !== 'validate' && step.when && !matchesCondition(step.when, context)) {
      return;
    }

    switch (step.type) {
      case 'setField':
        if (step.field) {
          context.draft[step.field] = toRecordValue(resolveLogicValue(step.value, context));
        }
        return;
      case 'showToast':
        if (step.message) {
          result.messages.push(step.message);
        }
        return;
      case 'validate':
        if (!matchesValidationStep(step, context) && step.message) {
          result.blocked = true;
          result.messages.push(step.message);
        }
        return;
      case 'stop':
        result.blocked = true;
        if (step.message) {
          result.messages.push(step.message);
        }
        return;
      case 'runAction':
        if (step.action) {
          result.actions.push(step.action);
        }
        return;
    }
  });
}

function matchesTrigger(rule: LogicRuleDefinition, trigger: LogicTrigger) {
  return (
    rule.event === trigger.event &&
    (!rule.pageId || rule.pageId === trigger.pageId) &&
    (!rule.table || rule.table === trigger.table) &&
    (!rule.field || rule.field === trigger.field) &&
    (!rule.nodeId || rule.nodeId === trigger.nodeId)
  );
}

function matchesValidationStep(
  step: LogicStepDefinition,
  context: {
    draft: Record<string, RecordValue>;
    record: AppRecord | null;
    event: LogicTrigger;
  },
) {
  if (step.when) {
    return matchesCondition(step.when, context);
  }

  return step.field ? isPresent(context.draft[step.field]) : true;
}

function matchesCondition(
  condition: LogicConditionDefinition,
  context: {
    draft: Record<string, RecordValue>;
    record: AppRecord | null;
    event: LogicTrigger;
  },
) {
  const left = resolveConditionLeftValue(condition, context);
  const right = resolveLogicValue(condition.value, context);

  switch (condition.op) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'contains':
      return Array.isArray(left) ? left.includes(right as never) : String(left ?? '').includes(String(right ?? ''));
    case 'empty':
      return !isPresent(left);
    case 'notEmpty':
      return isPresent(left);
    case 'gt':
      return toNumber(left) > toNumber(right);
    case 'gte':
      return toNumber(left) >= toNumber(right);
    case 'lt':
      return toNumber(left) < toNumber(right);
    case 'lte':
      return toNumber(left) <= toNumber(right);
    case 'in':
      return Array.isArray(right) && right.includes(left as never);
  }
}

function resolveConditionLeftValue(
  condition: LogicConditionDefinition,
  context: {
    draft: Record<string, RecordValue>;
    record: AppRecord | null;
    event: LogicTrigger;
  },
) {
  if (condition.source === 'event') {
    return condition.key ? context.event[condition.key as keyof LogicTrigger] : context.event.value;
  }

  if (condition.source === 'record') {
    return condition.field ? context.record?.[condition.field] : context.record;
  }

  return condition.field ? context.draft[condition.field] : context.draft;
}

function resolveLogicValue(
  value: LogicValue | undefined,
  context: {
    draft: Record<string, RecordValue>;
    record: AppRecord | null;
    event: LogicTrigger;
  },
) {
  if (isLogicValueReference(value)) {
    switch (value.source) {
      case 'draft':
        return value.field ? context.draft[value.field] : context.draft;
      case 'record':
        return value.field ? context.record?.[value.field] : context.record;
      case 'event':
        return value.key ? context.event[value.key as keyof LogicTrigger] : context.event.value;
      case 'literal':
        return value.value;
      case 'now':
        return new Date().toISOString();
    }
  }

  return value;
}

function getLogicRules(app: AppDefinition) {
  return [...(app.logic ?? []), ...app.pages.flatMap((page) => collectNodeLogic(page.layout))];
}

function collectNodeLogic(node: NodeDefinition): LogicRuleDefinition[] {
  return [
    ...(node.logic ?? []).map((rule) => ({ ...rule, nodeId: rule.nodeId ?? node.id })),
    ...(node.children ?? []).flatMap(collectNodeLogic),
    ...(node.itemTemplate ? collectNodeLogic(node.itemTemplate) : []),
    ...(node.emptyState ? collectNodeLogic(node.emptyState) : []),
  ];
}

function isLogicValueReference(value: LogicValue | undefined): value is LogicValueReference {
  return typeof value === 'object' && value !== null && 'source' in value;
}

function toRecordValue(value: unknown): RecordValue {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(String);
  }

  if (typeof value === 'object') {
    return value as Record<string, unknown>;
  }

  return String(value);
}

function toNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(number) ? number : 0;
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
