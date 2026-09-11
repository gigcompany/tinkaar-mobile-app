import { z } from 'zod';
import { AppThemeDefinition, appThemeSchema } from '../theme/theme';

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'decimal'
  | 'percentage'
  | 'currency'
  | 'email'
  | 'phone'
  | 'url'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'picklist'
  | 'lookup'
  | 'multiselect'
  | 'singlechoice'
  | 'compound_name'
  | 'image'
  | 'file'
  | 'formula'
  | 'autonumber'
  | 'geopoint';

export type FilterDefinition = {
  field: string;
  op: 'eq' | 'neq' | 'contains';
  value: unknown;
};

export type DataSourceDefinition = {
  table: string;
  filter?: FilterDefinition;
  sort?: { field: string; dir: 'asc' | 'desc' }[];
};

export type AggregateDefinition = {
  field?: string;
  fn: 'sum' | 'count' | 'avg';
  format?: 'currency' | 'number';
};

export type DataOperationDefinition = {
  operationId: string;
  table: string;
  type: 'list' | 'create' | 'update' | 'delete';
  adapter?: string;
};

export type AppDataDefinition = {
  storage: {
    adapter: 'sqlite' | 'memory';
    databaseName?: string;
  };
  cloudSync?: {
    engine: 'supabase';
    enabled?: boolean;
    tableName?: string;
  };
  operations: DataOperationDefinition[];
};

export type ActionDefinition = {
  type:
    | 'createRecord'
    | 'updateRecord'
    | 'deleteRecord'
    | 'openModal'
    | 'closeModal'
    | 'navigate'
    | 'toggleField'
    | 'showToast';
  table?: string;
  field?: string;
  value?: unknown;
  target?: string;
  pageId?: string;
  message?: string;
  onSuccess?: ActionDefinition;
};

export type LogicEvent =
  | 'preLoad'
  | 'postLoad'
  | 'fieldChange'
  | 'preSubmission'
  | 'postSubmission'
  | 'validation'
  | 'buttonClick';

export type LogicValueReference = {
  source: 'draft' | 'record' | 'event' | 'literal' | 'now';
  field?: string;
  key?: string;
  value?: unknown;
};

export type LogicValue = unknown | LogicValueReference;

export type LogicConditionDefinition = {
  source?: 'draft' | 'record' | 'event';
  field?: string;
  key?: string;
  op: 'eq' | 'neq' | 'contains' | 'empty' | 'notEmpty' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  value?: LogicValue;
};

export type LogicStepDefinition = {
  type: 'setField' | 'showToast' | 'validate' | 'stop' | 'runAction';
  field?: string;
  value?: LogicValue;
  message?: string;
  when?: LogicConditionDefinition;
  action?: ActionDefinition;
};

export type LogicRuleDefinition = {
  id: string;
  event: LogicEvent;
  pageId?: string;
  table?: string;
  field?: string;
  nodeId?: string;
  when?: LogicConditionDefinition;
  steps: LogicStepDefinition[];
};

export type NodeDefinition = {
  kind: 'primitive' | 'complex' | 'container' | 'widget';
  type: string;
  id?: string;
  label?: string;
  icon?: string;
  value?: unknown;
  variant?: string;
  bind?: string;
  title?: string;
  subtitle?: string;
  direction?: 'vertical' | 'horizontal';
  datasource?: DataSourceDefinition;
  aggregate?: AggregateDefinition;
  columns?: { field: string; label?: string }[];
  categoryField?: string;
  amountField?: string;
  dateField?: string;
  titleField?: string;
  subtitleField?: string;
  limit?: number;
  itemTemplate?: NodeDefinition;
  emptyState?: NodeDefinition;
  children?: NodeDefinition[];
  action?: ActionDefinition;
  logic?: LogicRuleDefinition[];
  visibility?: FilterDefinition;
  multiline?: boolean;
  required?: boolean;
};

export type FieldDefinition = {
  name: string;
  type: FieldType;
  required?: boolean;
  values?: string[];
  default?: unknown;
};

export type TableDefinition = {
  tableName: string;
  fields: FieldDefinition[];
};

export type PageDefinition = {
  pageId: string;
  title: string;
  layout: NodeDefinition;
};

export type AppDefinition = {
  appId: string;
  name: string;
  icon?: string;
  version: string;
  theme: AppThemeDefinition;
  data: AppDataDefinition;
  tables: TableDefinition[];
  pages: PageDefinition[];
  logic?: LogicRuleDefinition[];
  navigation: {
    type: 'tabs' | 'drawer' | 'stack';
    items: { pageId: string; label: string; icon?: string }[];
  };
};

const fieldTypeSchema = z.enum([
  'text',
  'textarea',
  'number',
  'decimal',
  'percentage',
  'currency',
  'email',
  'phone',
  'url',
  'date',
  'datetime',
  'boolean',
  'picklist',
  'lookup',
  'multiselect',
  'singlechoice',
  'compound_name',
  'image',
  'file',
  'formula',
  'autonumber',
  'geopoint',
]);

const filterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'neq', 'contains']),
  value: z.unknown(),
});

const actionSchema: z.ZodType<ActionDefinition> = z.lazy(() =>
  z.object({
    type: z.enum([
      'createRecord',
      'updateRecord',
      'deleteRecord',
      'openModal',
      'closeModal',
      'navigate',
      'toggleField',
      'showToast',
    ]),
    table: z.string().optional(),
    field: z.string().optional(),
    value: z.unknown().optional(),
    target: z.string().optional(),
    pageId: z.string().optional(),
    message: z.string().optional(),
    onSuccess: actionSchema.optional(),
  }),
);

const logicValueReferenceSchema: z.ZodType<LogicValueReference> = z.object({
  source: z.enum(['draft', 'record', 'event', 'literal', 'now']),
  field: z.string().optional(),
  key: z.string().optional(),
  value: z.unknown().optional(),
});

const logicValueSchema: z.ZodType<LogicValue> = z.union([logicValueReferenceSchema, z.unknown()]);

const logicConditionSchema: z.ZodType<LogicConditionDefinition> = z.object({
  source: z.enum(['draft', 'record', 'event']).optional(),
  field: z.string().optional(),
  key: z.string().optional(),
  op: z.enum(['eq', 'neq', 'contains', 'empty', 'notEmpty', 'gt', 'gte', 'lt', 'lte', 'in']),
  value: logicValueSchema.optional(),
});

const logicStepSchema: z.ZodType<LogicStepDefinition> = z.lazy(() =>
  z.object({
    type: z.enum(['setField', 'showToast', 'validate', 'stop', 'runAction']),
    field: z.string().optional(),
    value: logicValueSchema.optional(),
    message: z.string().optional(),
    when: logicConditionSchema.optional(),
    action: actionSchema.optional(),
  }),
);

const logicRuleSchema: z.ZodType<LogicRuleDefinition> = z.lazy(() =>
  z.object({
    id: z.string(),
    event: z.enum(['preLoad', 'postLoad', 'fieldChange', 'preSubmission', 'postSubmission', 'validation', 'buttonClick']),
    pageId: z.string().optional(),
    table: z.string().optional(),
    field: z.string().optional(),
    nodeId: z.string().optional(),
    when: logicConditionSchema.optional(),
    steps: z.array(logicStepSchema),
  }),
);

const datasourceSchema = z.object({
  table: z.string(),
  filter: filterSchema.optional(),
  sort: z
    .array(z.object({ field: z.string(), dir: z.enum(['asc', 'desc']) }))
    .optional(),
});

const aggregateSchema = z.object({
  field: z.string().optional(),
  fn: z.enum(['sum', 'count', 'avg']),
  format: z.enum(['currency', 'number']).optional(),
});

const dataOperationSchema = z.object({
  operationId: z.string(),
  table: z.string(),
  type: z.enum(['list', 'create', 'update', 'delete']),
  adapter: z.string().optional(),
});

const nodeSchema: z.ZodType<NodeDefinition> = z.lazy(() =>
  z.object({
    kind: z.enum(['primitive', 'complex', 'container', 'widget']),
    type: z.string(),
    id: z.string().optional(),
    label: z.string().optional(),
    icon: z.string().optional(),
    value: z.unknown().optional(),
    variant: z.string().optional(),
    bind: z.string().optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    direction: z.enum(['vertical', 'horizontal']).optional(),
    datasource: datasourceSchema.optional(),
    aggregate: aggregateSchema.optional(),
    columns: z.array(z.object({ field: z.string(), label: z.string().optional() })).optional(),
    categoryField: z.string().optional(),
    amountField: z.string().optional(),
    dateField: z.string().optional(),
    titleField: z.string().optional(),
    subtitleField: z.string().optional(),
    limit: z.number().int().positive().optional(),
    itemTemplate: nodeSchema.optional(),
    emptyState: nodeSchema.optional(),
    children: z.array(nodeSchema).optional(),
    action: actionSchema.optional(),
    logic: z.array(logicRuleSchema).optional(),
    visibility: filterSchema.optional(),
    multiline: z.boolean().optional(),
    required: z.boolean().optional(),
  }),
);

export const appDefinitionSchema = z.object({
  appId: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  version: z.string(),
  theme: appThemeSchema,
  data: z.object({
    storage: z.object({
      adapter: z.enum(['sqlite', 'memory']).default('sqlite'),
      databaseName: z.string().optional(),
    }),
    cloudSync: z
      .object({
        engine: z.enum(['supabase']),
        enabled: z.boolean().optional(),
        tableName: z.string().optional(),
      })
      .optional(),
    operations: z.array(dataOperationSchema),
  }),
  tables: z.array(
    z.object({
      tableName: z.string(),
      fields: z.array(
        z.object({
          name: z.string(),
          type: fieldTypeSchema,
          required: z.boolean().optional(),
          values: z.array(z.string()).optional(),
          default: z.unknown().optional(),
        }),
      ),
    }),
  ),
  pages: z.array(
    z.object({
      pageId: z.string(),
      title: z.string(),
      layout: nodeSchema,
    }),
  ),
  logic: z.array(logicRuleSchema).optional(),
  navigation: z.object({
    type: z.enum(['tabs', 'drawer', 'stack']),
    items: z.array(
      z.object({
        pageId: z.string(),
        label: z.string(),
        icon: z.string().optional(),
      }),
    ),
  }),
});
