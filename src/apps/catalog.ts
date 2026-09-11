import type { AppRecord } from '../data/repository';
import { AppDefinition, appDefinitionSchema } from '../schema/appDefinition.schema';
import { todoAppDefinition } from './todo';

export type TemplateBundle = {
  app: AppDefinition;
  seedData: Record<string, AppRecord[]>;
  source: 'bundled' | 'external' | 'installed';
  installedUrl?: string;
  installedAt?: string;
};

export type InstalledTemplateRecord = {
  url: string;
  installedAt: string;
  app: AppDefinition;
  seedData: Record<string, AppRecord[]>;
};

export type InstallableTemplateSource = {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  url: string;
  appId?: string;
  tags?: string[];
};

const bundledTemplates: TemplateBundle[] = [
  { app: todoAppDefinition, seedData: {}, source: 'bundled' },
];

export function getTemplateCatalog(externalTemplates: unknown[]): TemplateBundle[] {
  const templatesById = new Map(bundledTemplates.map((template) => [template.app.appId, template]));

  externalTemplates.forEach((template) => {
    const parsed = parseTemplateBundle(template, isInstalledTemplateRecord(template) ? 'installed' : 'external');
    if (!parsed.success) {
      console.warn('Ignoring invalid external Tinkaar template.', parsed.errorMessage);
      return;
    }

    templatesById.set(parsed.data.app.appId, parsed.data);
  });

  return [...templatesById.values()];
}

export function parseTemplateBundle(template: unknown, source: TemplateBundle['source']): ParseResult<TemplateBundle> {
  const payload = normalizeTemplatePayload(template);
  const parsed = appDefinitionSchema.safeParse(payload.app);

  if (!parsed.success) {
    return { success: false, errorMessage: parsed.error.message };
  }

  return {
    success: true,
    data: {
      app: parsed.data,
      seedData: {},
      source,
      installedUrl: payload.url,
      installedAt: payload.installedAt,
    },
  };
}

export function toInstalledTemplateRecord(bundle: TemplateBundle, url: string): InstalledTemplateRecord {
  return {
    url,
    installedAt: new Date().toISOString(),
    app: bundle.app,
    seedData: {},
  };
}

function normalizeTemplatePayload(template: unknown) {
  if (isObject(template) && isObject(template.app)) {
    return {
      app: template.app,
      seedData: template.seedData,
      url: typeof template.url === 'string' ? template.url : undefined,
      installedAt: typeof template.installedAt === 'string' ? template.installedAt : undefined,
    };
  }

  return { app: template, seedData: {} };
}

function isInstalledTemplateRecord(value: unknown): value is InstalledTemplateRecord {
  return (
    isObject(value) &&
    typeof value.url === 'string' &&
    typeof value.installedAt === 'string' &&
    isObject(value.app)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; errorMessage: string };
