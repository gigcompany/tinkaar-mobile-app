import { AppRecord } from '../data/repository';
import { AppDefinition } from '../schema/appDefinition.schema';

export const expenseTrackerAppDefinition: AppDefinition = {
  appId: 'expense-tracker',
  name: 'Expense Tracker',
  icon: 'wallet-cards',
  version: '1.0.0',
  theme: {
    mode: 'system',
    light: {
      primaryColor: '#2563eb',
      backgroundColor: '#f8fafc',
      surfaceColor: '#ffffff',
      textColor: '#0f172a',
      mutedTextColor: '#64748b',
      borderColor: '#dbe3ea',
      successColor: '#0f766e',
      dangerColor: '#dc2626',
    },
    dark: {
      primaryColor: '#60a5fa',
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
      databaseName: 'workfoundry_templates.db',
    },
    operations: [
      { operationId: 'expenses.list', table: 'Expenses', type: 'list' },
      { operationId: 'expenses.create', table: 'Expenses', type: 'create' },
      { operationId: 'expenses.update', table: 'Expenses', type: 'update' },
      { operationId: 'expenses.delete', table: 'Expenses', type: 'delete' },
    ],
  },
  tables: [
    {
      tableName: 'Expenses',
      fields: [
        { name: 'merchant', type: 'text', required: true },
        { name: 'category', type: 'picklist', values: ['Meals', 'Travel', 'Software', 'Office', 'Utilities', 'Other'], default: 'Meals' },
        { name: 'amount', type: 'currency', default: 0 },
        { name: 'expense_date', type: 'date', required: true },
        { name: 'recurrence', type: 'picklist', values: ['One time', 'Weekly', 'Monthly', 'Yearly'], default: 'One time' },
        { name: 'notes', type: 'textarea' },
        { name: 'reimbursable', type: 'boolean', default: false },
      ],
    },
  ],
  logic: [
    {
      id: 'positive-expense-amount',
      event: 'preSubmission',
      table: 'Expenses',
      steps: [
        {
          type: 'stop',
          message: 'Amount must be greater than zero.',
          when: { field: 'amount', op: 'lte', value: 0 },
        },
      ],
    },
  ],
  pages: [
    {
      pageId: 'expense_dashboard',
      title: 'Expenses',
      layout: {
        kind: 'container',
        type: 'screen',
        children: [
          {
            kind: 'container',
            type: 'stack',
            direction: 'vertical',
            children: [
              { kind: 'primitive', type: 'text', value: 'Expenses', variant: 'heading' },
              { kind: 'primitive', type: 'text', value: 'Track spend, recurring costs, and category mix.', variant: 'caption' },
            ],
          },
          {
            kind: 'container',
            type: 'grid',
            children: [
              {
                kind: 'widget',
                type: 'statcard',
                title: 'Total spent',
                subtitle: 'All recorded expenses',
                icon: 'wallet',
                datasource: { table: 'Expenses' },
                aggregate: { field: 'amount', fn: 'sum', format: 'currency' },
              },
              {
                kind: 'widget',
                type: 'statcard',
                title: 'Recurring',
                subtitle: 'Subscriptions and repeated costs',
                icon: 'repeat',
                datasource: { table: 'Expenses', filter: { field: 'recurrence', op: 'neq', value: 'One time' } },
                aggregate: { field: 'amount', fn: 'sum', format: 'currency' },
              },
            ],
          },
          {
            kind: 'widget',
            type: 'category-breakdown',
            title: 'By category',
            datasource: { table: 'Expenses' },
            categoryField: 'category',
            amountField: 'amount',
          },
          {
            kind: 'widget',
            type: 'timeline',
            title: 'Timeline',
            datasource: { table: 'Expenses' },
            dateField: 'expense_date',
            amountField: 'amount',
            categoryField: 'category',
            titleField: 'merchant',
            subtitleField: 'recurrence',
            limit: 8,
          },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Add expense',
            icon: 'plus',
            variant: 'fab',
            action: { type: 'openModal', target: 'add_expense_modal' },
          },
        ],
      },
    },
    {
      pageId: 'expense_list',
      title: 'All Expenses',
      layout: {
        kind: 'container',
        type: 'screen',
        children: [
          {
            kind: 'container',
            type: 'stack',
            direction: 'vertical',
            children: [
              { kind: 'primitive', type: 'text', value: 'All expenses', variant: 'heading' },
              { kind: 'primitive', type: 'text', value: 'Review one-time and recurring spend in one list.', variant: 'caption' },
            ],
          },
          {
            kind: 'container',
            type: 'list',
            id: 'expense_records',
            datasource: {
              table: 'Expenses',
              sort: [{ field: 'expense_date', dir: 'desc' }],
            },
            emptyState: {
              kind: 'primitive',
              type: 'text',
              value: 'No expenses yet. Add your first transaction.',
              variant: 'body',
            },
            itemTemplate: {
              kind: 'container',
              type: 'card',
              direction: 'horizontal',
              children: [
                {
                  kind: 'container',
                  type: 'stack',
                  direction: 'vertical',
                  children: [
                    {
                      kind: 'container',
                      type: 'stack',
                      direction: 'horizontal',
                      children: [
                        { kind: 'primitive', type: 'text', bind: 'merchant', variant: 'body' },
                        { kind: 'primitive', type: 'text', bind: 'amount', variant: 'body' },
                      ],
                    },
                    {
                      kind: 'container',
                      type: 'stack',
                      direction: 'horizontal',
                      children: [
                        { kind: 'primitive', type: 'text', bind: 'expense_date', variant: 'caption' },
                        { kind: 'primitive', type: 'badge', bind: 'category' },
                        { kind: 'primitive', type: 'badge', bind: 'recurrence' },
                      ],
                    },
                  ],
                },
                {
                  kind: 'primitive',
                  type: 'button',
                  label: 'Edit expense',
                  icon: 'edit',
                  variant: 'icon',
                  action: { type: 'openModal', target: 'edit_expense_modal', table: 'Expenses' },
                },
              ],
            },
          },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Add expense',
            icon: 'plus',
            variant: 'fab',
            action: { type: 'openModal', target: 'add_expense_modal' },
          },
        ],
      },
    },
    {
      pageId: 'add_expense_modal',
      title: 'New Expense',
      layout: {
        kind: 'complex',
        type: 'modal',
        children: [
          { kind: 'primitive', type: 'input', bind: 'merchant', label: 'Merchant', required: true },
          { kind: 'primitive', type: 'input', bind: 'amount', label: 'Amount', required: true },
          { kind: 'primitive', type: 'datepicker', bind: 'expense_date', label: 'Date' },
          { kind: 'primitive', type: 'select', bind: 'category', label: 'Category' },
          { kind: 'primitive', type: 'select', bind: 'recurrence', label: 'Repeats' },
          {
            kind: 'container',
            type: 'stack',
            direction: 'horizontal',
            children: [
              { kind: 'primitive', type: 'checkbox', bind: 'reimbursable' },
              { kind: 'primitive', type: 'text', value: 'Reimbursable', variant: 'body' },
            ],
          },
          { kind: 'primitive', type: 'input', bind: 'notes', label: 'Notes', multiline: true },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Save',
            variant: 'filled',
            action: {
              type: 'createRecord',
              table: 'Expenses',
              onSuccess: { type: 'closeModal' },
            },
          },
        ],
      },
    },
    {
      pageId: 'edit_expense_modal',
      title: 'Expense Details',
      layout: {
        kind: 'complex',
        type: 'modal',
        children: [
          { kind: 'primitive', type: 'input', bind: 'merchant', label: 'Merchant', required: true },
          { kind: 'primitive', type: 'input', bind: 'amount', label: 'Amount', required: true },
          { kind: 'primitive', type: 'datepicker', bind: 'expense_date', label: 'Date' },
          { kind: 'primitive', type: 'select', bind: 'category', label: 'Category' },
          { kind: 'primitive', type: 'select', bind: 'recurrence', label: 'Repeats' },
          {
            kind: 'container',
            type: 'stack',
            direction: 'horizontal',
            children: [
              { kind: 'primitive', type: 'checkbox', bind: 'reimbursable' },
              { kind: 'primitive', type: 'text', value: 'Reimbursable', variant: 'body' },
            ],
          },
          { kind: 'primitive', type: 'input', bind: 'notes', label: 'Notes', multiline: true },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Save',
            variant: 'filled',
            action: {
              type: 'updateRecord',
              table: 'Expenses',
              onSuccess: { type: 'closeModal' },
            },
          },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Delete expense',
            icon: 'trash',
            variant: 'danger',
            action: {
              type: 'deleteRecord',
              table: 'Expenses',
              onSuccess: { type: 'closeModal' },
            },
          },
        ],
      },
    },
  ],
  navigation: {
    type: 'tabs',
    items: [
      { pageId: 'expense_dashboard', label: 'Overview', icon: 'bar-chart' },
      { pageId: 'expense_list', label: 'Expenses', icon: 'receipt' },
    ],
  },
};

export const expenseTrackerSeedData: Record<string, AppRecord[]> = {
  Expenses: [
    {
      id: 'expense-1',
      merchant: 'Google Workspace',
      category: 'Software',
      amount: 144,
      expense_date: '2026-08-01',
      recurrence: 'Monthly',
      notes: 'Business email and collaboration tools.',
      reimbursable: false,
    },
    {
      id: 'expense-2',
      merchant: 'City Bistro',
      category: 'Meals',
      amount: 42.5,
      expense_date: '2026-08-12',
      recurrence: 'One time',
      notes: 'Client lunch.',
      reimbursable: true,
    },
    {
      id: 'expense-3',
      merchant: 'RideShare',
      category: 'Travel',
      amount: 28.75,
      expense_date: '2026-08-14',
      recurrence: 'One time',
      notes: 'Airport transfer.',
      reimbursable: true,
    },
    {
      id: 'expense-4',
      merchant: 'Figma',
      category: 'Software',
      amount: 15,
      expense_date: '2026-08-18',
      recurrence: 'Monthly',
      notes: 'Design workspace subscription.',
      reimbursable: false,
    },
    {
      id: 'expense-5',
      merchant: 'Office Depot',
      category: 'Office',
      amount: 86.2,
      expense_date: '2026-08-22',
      recurrence: 'One time',
      notes: 'Printer paper and labels.',
      reimbursable: false,
    },
  ],
};
