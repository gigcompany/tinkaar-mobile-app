import { AppDefinition } from '../schema/appDefinition.schema';

export const todoAppDefinition: AppDefinition = {
  appId: 'todo',
  name: 'Todo List',
  icon: 'check-square',
  version: '1.0.0',
  theme: {
    mode: 'system',
    light: {
      primaryColor: '#0f766e',
      backgroundColor: '#f8fafc',
      surfaceColor: '#ffffff',
      textColor: '#0f172a',
      mutedTextColor: '#64748b',
      borderColor: '#dbe3ea',
      successColor: '#0f766e',
      dangerColor: '#dc2626',
    },
    dark: {
      primaryColor: '#2dd4bf',
      backgroundColor: '#0b1120',
      surfaceColor: '#111827',
      textColor: '#f8fafc',
      mutedTextColor: '#94a3b8',
      borderColor: '#263244',
      successColor: '#34d399',
      dangerColor: '#f87171',
    },
    radius: 'md',
    fontScale: 1,
    fontFamily: 'system',
  },
  data: {
    storage: {
      adapter: 'sqlite',
      databaseName: 'ministore_templates.db',
    },
    operations: [
      { operationId: 'tasks.list', table: 'Tasks', type: 'list' },
      { operationId: 'tasks.create', table: 'Tasks', type: 'create' },
      { operationId: 'tasks.update', table: 'Tasks', type: 'update' },
      { operationId: 'tasks.delete', table: 'Tasks', type: 'delete' },
    ],
  },
  tables: [
    {
      tableName: 'Tasks',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'notes', type: 'textarea' },
        { name: 'due_date', type: 'date' },
        { name: 'priority', type: 'picklist', values: ['Low', 'Medium', 'High'], default: 'Medium' },
        { name: 'completed', type: 'boolean', default: false },
      ],
    },
  ],
  pages: [
    {
      pageId: 'task_list',
      title: 'My Tasks',
      layout: {
        kind: 'container',
        type: 'screen',
        children: [
          {
            kind: 'container',
            type: 'stack',
            direction: 'vertical',
            children: [
              { kind: 'primitive', type: 'text', value: 'My Tasks', variant: 'heading' },
              { kind: 'primitive', type: 'text', value: 'Use the pencil to edit details, dates, or priority.', variant: 'caption' },
            ],
          },
          {
            kind: 'container',
            type: 'list',
            id: 'open_tasks',
            datasource: {
              table: 'Tasks',
              filter: { field: 'completed', op: 'eq', value: false },
              sort: [{ field: 'due_date', dir: 'asc' }],
            },
            emptyState: {
              kind: 'primitive',
              type: 'text',
              value: 'No tasks yet. Add one to prove the renderer flow.',
              variant: 'body',
            },
            itemTemplate: {
              kind: 'container',
              type: 'card',
              direction: 'horizontal',
              children: [
                {
                  kind: 'primitive',
                  type: 'checkbox',
                  bind: 'completed',
                  action: {
                    type: 'toggleField',
                    table: 'Tasks',
                    field: 'completed',
                  },
                },
                {
                  kind: 'container',
                  type: 'stack',
                  direction: 'vertical',
                  children: [
                    { kind: 'primitive', type: 'text', bind: 'title', variant: 'body' },
                    {
                      kind: 'container',
                      type: 'stack',
                      direction: 'horizontal',
                      children: [
                        { kind: 'primitive', type: 'text', bind: 'due_date', variant: 'caption' },
                        { kind: 'primitive', type: 'badge', bind: 'priority' },
                        {
                          kind: 'primitive',
                          type: 'button',
                          label: 'Edit task',
                          icon: 'edit',
                          variant: 'icon',
                          action: { type: 'openModal', target: 'edit_task_modal', table: 'Tasks' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Add task',
            icon: 'plus',
            variant: 'fab',
            action: { type: 'openModal', target: 'add_task_modal' },
          },
        ],
      },
    },
    {
      pageId: 'add_task_modal',
      title: 'New Task',
      layout: {
        kind: 'complex',
        type: 'modal',
        children: [
          { kind: 'primitive', type: 'input', bind: 'title', label: 'Title', required: true },
          { kind: 'primitive', type: 'input', bind: 'notes', label: 'Notes', multiline: true },
          { kind: 'primitive', type: 'datepicker', bind: 'due_date', label: 'Due date' },
          { kind: 'primitive', type: 'select', bind: 'priority', label: 'Priority' },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Save',
            variant: 'filled',
            action: {
              type: 'createRecord',
              table: 'Tasks',
              onSuccess: { type: 'closeModal' },
            },
          },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Cancel',
            variant: 'ghost',
            action: { type: 'closeModal' },
          },
        ],
      },
    },
    {
      pageId: 'edit_task_modal',
      title: 'Task Details',
      layout: {
        kind: 'complex',
        type: 'modal',
        children: [
          { kind: 'primitive', type: 'input', bind: 'title', label: 'Title', required: true },
          { kind: 'primitive', type: 'input', bind: 'notes', label: 'Notes', multiline: true },
          { kind: 'primitive', type: 'datepicker', bind: 'due_date', label: 'Due date' },
          { kind: 'primitive', type: 'select', bind: 'priority', label: 'Priority' },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Save',
            variant: 'filled',
            action: {
              type: 'updateRecord',
              table: 'Tasks',
              onSuccess: { type: 'closeModal' },
            },
          },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Delete task',
            icon: 'trash',
            variant: 'danger',
            action: {
              type: 'deleteRecord',
              table: 'Tasks',
              onSuccess: { type: 'closeModal' },
            },
          },
        ],
      },
    },
  ],
  navigation: {
    type: 'stack',
    items: [{ pageId: 'task_list', label: 'Tasks', icon: 'check-square' }],
  },
};
