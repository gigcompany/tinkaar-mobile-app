import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(rootDir, 'node_modules', '.cache', 'tinkaar-ai-mutator-regression');
const tscBin = join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');

if (!existsSync(tscBin)) {
  throw new Error('TypeScript is not installed. Run the project install first.');
}

rmSync(buildDir, { recursive: true, force: true });
execFileSync(
  tscBin,
  [
    '--module',
    'commonjs',
    '--ignoreConfig',
    '--target',
    'es2020',
    '--esModuleInterop',
    '--skipLibCheck',
    '--rootDir',
    'src',
    '--outDir',
    buildDir,
    'src/ai/appMutator.ts',
  ],
  { cwd: rootDir, stdio: 'inherit' },
);

const {
  generateAppMutation,
  generateNewAppDefinition,
} = await import(pathToFileURL(join(buildDir, 'ai', 'appMutator.js')).href);

const provider = {
  presetId: 'custom',
  kind: 'openai-compatible',
  displayName: 'Mock',
  baseUrl: 'https://mock.local/v1',
  model: 'mock-model',
  apiKey: 'test-key',
  headersJson: '',
};

const responses = [];
globalThis.fetch = async () => {
  const response = responses.shift();
  if (!response) {
    throw new Error('No mock AI response queued.');
  }

  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(response) } }],
    }),
    text: async () => '',
  };
};

responses.push({
  summary: 'Built a notes app.',
  app: {
    appId: 'notes',
    name: 'Notes',
    version: '1.0.0',
    data: {},
    tables: [
      {
        tableName: 'Notes',
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'content', type: 'textarea' },
          { name: 'created_date', type: 'date' },
        ],
      },
    ],
    pages: [
      {
        pageId: 'notes',
        title: 'Notes',
        layout: {
          kind: 'container',
          type: 'screen',
          children: [
            { kind: 'container', type: 'header', children: [{ kind: 'primitive', type: 'text', value: 'Notes', variant: 'heading' }] },
            {
              kind: 'widget',
              type: 'list',
              datasource: { table: 'Notes' },
              emptyState: { kind: 'primitive', type: 'text', value: 'No notes yet. Tap + to add one.' },
            },
            { kind: 'primitive', type: 'input', bind: 'title', label: 'Title', required: true },
            { kind: 'primitive', type: 'input', bind: 'content', label: 'Content', multiline: true },
            { kind: 'primitive', type: 'button', label: 'Save', action: { type: 'createRecord', table: 'Notes' } },
            { kind: 'primitive', type: 'fab', label: 'Add', icon: 'plus', action: { type: 'openModal', target: 'missing_modal' } },
          ],
        },
      },
    ],
    navigation: { type: 'stack', items: [{ pageId: 'notes', label: 'Notes' }] },
  },
});

const createResult = await generateNewAppDefinition({
  provider,
  prompt: 'User: Build a simple note taker app from scratch.',
  approvedPlan: ['Create a Notes app with a notes list, add note modal, and edit note modal.'],
  existingAppIds: [],
});

assert(createResult.app.name === 'Notes', 'new app keeps the requested Notes identity');
assert(createResult.app.tables[0].tableName === 'Notes', 'new app keeps the Notes table');
assert(createResult.app.pages.some((page) => page.pageId === 'add_notes_modal' && page.layout.type === 'modal'), 'new app has an add note modal');
assert(createResult.app.pages.some((page) => page.pageId === 'edit_notes_modal' && page.layout.type === 'modal'), 'new app has an edit note modal');
assert(!hasInlineFormControl(getPage(createResult.app, 'notes').layout), 'main notes page does not contain inline form controls');
assert(allOpenModalTargetsExist(createResult.app), 'all openModal targets point to existing pages');
assert(allComponentsAreSupported(createResult.app), 'invented component names are normalized to supported renderer components');

const mutatedApp = structuredClone(createResult.app);
const mainPage = getPage(mutatedApp, 'notes');
const list = findNode(mainPage.layout, (node) => node.type === 'list');
list.datasource = {
  table: 'Notes',
  filter: { op: 'equals', value: 'Work' },
};

responses.push({
  summary: 'Filtered notes.',
  app: mutatedApp,
});

const editResult = await generateAppMutation({
  provider,
  currentApp: createResult.app,
  prompt: 'User: Fix the note list filter.',
  approvedPlan: ['Keep the notes list and repair any invalid filters.'],
});

const editedList = findNode(getPage(editResult.app, 'notes').layout, (node) => node.type === 'list');
assert(!editedList.datasource.filter, 'invalid datasource filters are removed during edit repair');
assert(allOpenModalTargetsExist(editResult.app), 'edited app keeps valid modal targets');
assert(allComponentsAreSupported(editResult.app), 'edited app keeps supported renderer components');

console.log('AI mutator regression tests passed.');

function getPage(app, pageId) {
  const page = app.pages.find((candidate) => candidate.pageId === pageId);
  assert(Boolean(page), `expected page ${pageId}`);
  return page;
}

function findNode(node, predicate) {
  const found = findNodeOrNull(node, predicate);
  if (!found) {
    throw new Error('Expected node was not found.');
  }
  return found;
}

function findNodeOrNull(node, predicate) {
  if (predicate(node)) {
    return node;
  }

  for (const child of node.children ?? []) {
    const found = findNodeOrNull(child, predicate);
    if (found) {
      return found;
    }
  }

  if (node.itemTemplate) {
    const found = findNodeOrNull(node.itemTemplate, predicate);
    if (found) {
      return found;
    }
  }

  return null;
}

function hasInlineFormControl(node) {
  if (['input', 'select', 'datepicker', 'checkbox'].includes(node.type)) {
    return true;
  }

  return (node.children ?? []).some(hasInlineFormControl);
}

function allOpenModalTargetsExist(app) {
  const pageIds = new Set(app.pages.map((page) => page.pageId));

  return app.pages.every((page) => walkNodes(page.layout, (node) => {
    if (node.action?.type === 'openModal') {
      return Boolean(node.action.target && pageIds.has(node.action.target));
    }
    return true;
  }));
}

function allComponentsAreSupported(app) {
  const supported = new Set([
    'container.screen',
    'container.stack',
    'container.grid',
    'container.list',
    'container.card',
    'container.table',
    'complex.modal',
    'primitive.text',
    'primitive.button',
    'primitive.checkbox',
    'primitive.switch',
    'primitive.radiogroup',
    'primitive.checkboxgroup',
    'primitive.input',
    'primitive.datepicker',
    'primitive.select',
    'primitive.badge',
    'primitive.divider',
    'primitive.progressbar',
    'widget.statcard',
    'widget.category-breakdown',
    'widget.timeline',
  ]);

  return app.pages.every((page) => walkNodes(page.layout, (node) => supported.has(`${node.kind}.${node.type}`)));
}

function walkNodes(node, predicate) {
  if (!predicate(node)) {
    return false;
  }

  return (node.children ?? []).every((child) => walkNodes(child, predicate)) &&
    (!node.itemTemplate || walkNodes(node.itemTemplate, predicate)) &&
    (!node.emptyState || walkNodes(node.emptyState, predicate));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
