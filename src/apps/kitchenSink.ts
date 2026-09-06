import { AppRecord } from '../data/repository';
import { AppDefinition } from '../schema/appDefinition.schema';

export const kitchenSinkAppDefinition: AppDefinition = {
  appId: 'kitchen-sink',
  name: 'Kitchen Sink',
  icon: 'layout-grid',
  version: '1.0.0',
  theme: {
    mode: 'system',
    light: {
      primaryColor: '#2563eb',
      backgroundColor: '#f6f7fb',
      surfaceColor: '#ffffff',
      textColor: '#111827',
      mutedTextColor: '#6b7280',
      borderColor: '#d8dee9',
      successColor: '#059669',
      dangerColor: '#dc2626',
    },
    dark: {
      primaryColor: '#60a5fa',
      backgroundColor: '#0a0f1c',
      surfaceColor: '#111827',
      textColor: '#f9fafb',
      mutedTextColor: '#9ca3af',
      borderColor: '#2b3445',
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
      { operationId: 'demo.list', table: 'Demo_Records', type: 'list' },
      { operationId: 'demo.create', table: 'Demo_Records', type: 'create' },
      { operationId: 'demo.update', table: 'Demo_Records', type: 'update' },
      { operationId: 'demo.delete', table: 'Demo_Records', type: 'delete' },
    ],
  },
  tables: [
    {
      tableName: 'Demo_Records',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'description', type: 'textarea' },
        { name: 'status', type: 'picklist', values: ['Draft', 'Active', 'Blocked'], default: 'Active' },
        { name: 'score', type: 'number', default: 0 },
        { name: 'featured', type: 'boolean', default: false },
      ],
    },
  ],
  pages: [
    {
      pageId: 'kitchen_sink',
      title: 'Kitchen Sink',
      layout: {
        kind: 'container',
        type: 'screen',
        children: [
          {
            kind: 'container',
            type: 'stack',
            direction: 'horizontal',
            children: [
              {
                kind: 'container',
                type: 'stack',
                direction: 'vertical',
                children: [
                  { kind: 'primitive', type: 'text', value: 'Kitchen sink', variant: 'heading' },
                  {
                    kind: 'primitive',
                    type: 'text',
                    value: 'All registered renderer components in one app-defined screen.',
                    variant: 'caption',
                  },
                ],
              },
              {
                kind: 'primitive',
                type: 'button',
                label: 'Open Modal',
                variant: 'filled',
                action: { type: 'openModal', target: 'kitchen_sink_modal' },
              },
            ],
          },
          {
            kind: 'container',
            type: 'card',
            direction: 'vertical',
            children: [
              { kind: 'primitive', type: 'text', value: 'Typography', variant: 'heading' },
              { kind: 'primitive', type: 'text', value: 'Body copy wraps inside section cards without stretching the app frame.', variant: 'body' },
              { kind: 'primitive', type: 'text', value: 'Caption text uses the muted theme color.', variant: 'caption' },
            ],
          },
          {
            kind: 'container',
            type: 'card',
            direction: 'vertical',
            children: [
              { kind: 'primitive', type: 'text', value: 'Actions', variant: 'heading' },
              {
                kind: 'container',
                type: 'stack',
                direction: 'horizontal',
                children: [
                  {
                    kind: 'primitive',
                    type: 'button',
                    label: 'Filled action',
                    variant: 'filled',
                    action: { type: 'showToast', message: 'Filled action fired' },
                  },
                  {
                    kind: 'primitive',
                    type: 'button',
                    label: 'Ghost action',
                    variant: 'ghost',
                    action: { type: 'showToast', message: 'Ghost action fired' },
                  },
                ],
              },
            ],
          },
          {
            kind: 'container',
            type: 'card',
            direction: 'vertical',
            children: [
              { kind: 'primitive', type: 'text', value: 'Form controls', variant: 'heading' },
              { kind: 'primitive', type: 'input', bind: 'title', label: 'Single-line input', required: true },
              { kind: 'primitive', type: 'input', bind: 'description', label: 'Multiline input', multiline: true },
              { kind: 'primitive', type: 'select', bind: 'status', label: 'Picklist select' },
              {
                kind: 'container',
                type: 'stack',
                direction: 'horizontal',
                children: [
                  { kind: 'primitive', type: 'checkbox', bind: 'featured' },
                  { kind: 'primitive', type: 'text', value: 'Checkbox control', variant: 'body' },
                  { kind: 'primitive', type: 'badge', value: 'Badge' },
                ],
              },
            ],
          },
          {
            kind: 'container',
            type: 'list',
            id: 'demo_records',
            datasource: {
              table: 'Demo_Records',
              sort: [{ field: 'score', dir: 'desc' }],
            },
            itemTemplate: {
              kind: 'container',
              type: 'card',
              children: [
                {
                  kind: 'primitive',
                  type: 'checkbox',
                  bind: 'featured',
                  action: {
                    type: 'toggleField',
                    table: 'Demo_Records',
                    field: 'featured',
                  },
                },
                {
                  kind: 'container',
                  type: 'stack',
                  direction: 'vertical',
                  children: [
                    { kind: 'primitive', type: 'text', bind: 'title', variant: 'body' },
                    { kind: 'primitive', type: 'text', bind: 'description', variant: 'caption' },
                  ],
                },
                { kind: 'primitive', type: 'badge', bind: 'status' },
              ],
            },
          },
        ],
      },
    },
    {
      pageId: 'kitchen_sink_modal',
      title: 'Kitchen Sink Modal',
      layout: {
        kind: 'complex',
        type: 'modal',
        children: [
          { kind: 'primitive', type: 'text', value: 'Modal container', variant: 'heading' },
          {
            kind: 'primitive',
            type: 'text',
            value: 'This modal is launched by a declarative openModal action and rendered through the complex.modal registry entry.',
            variant: 'body',
          },
          { kind: 'primitive', type: 'input', bind: 'title', label: 'Modal input' },
          {
            kind: 'primitive',
            type: 'button',
            label: 'Close modal',
            variant: 'filled',
            action: { type: 'closeModal' },
          },
        ],
      },
    },
  ],
  navigation: {
    type: 'stack',
    items: [{ pageId: 'kitchen_sink', label: 'Components', icon: 'layout-dashboard' }],
  },
};

export const kitchenSinkSeedData: Record<string, AppRecord[]> = {
  Demo_Records: [
    {
      id: 'demo-1',
      title: 'Section card layout',
      description: 'Vertical cards keep labels, controls, and copy aligned inside the same surface.',
      status: 'Active',
      score: 91,
      featured: true,
    },
    {
      id: 'demo-2',
      title: 'Bound list row',
      description: 'Rows infer leading control, flexible content, and trailing badge placement.',
      status: 'Draft',
      score: 74,
      featured: false,
    },
    {
      id: 'demo-3',
      title: 'Responsive wrapping',
      description: 'Long supporting text should wrap without pushing accessories off screen.',
      status: 'Blocked',
      score: 62,
      featured: false,
    },
  ],
};
