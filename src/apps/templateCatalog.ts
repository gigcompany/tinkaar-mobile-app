import type { InstallableTemplateSource } from './catalog';

export type TemplateCatalogLoadResult =
  | { success: true; sources: InstallableTemplateSource[] }
  | { success: false; errorMessage: string };

export async function fetchTemplateCatalogSources(url: string): Promise<TemplateCatalogLoadResult> {
  const response = await fetch(url);
  if (!response.ok) {
    return { success: false, errorMessage: `Catalog download failed with HTTP ${response.status}.` };
  }

  const payload = await response.json();
  return parseTemplateCatalogSources(payload);
}

export function parseTemplateCatalogSources(payload: unknown): TemplateCatalogLoadResult {
  const entries = Array.isArray(payload)
    ? payload
    : isObject(payload) && Array.isArray(payload.templates)
      ? payload.templates
      : isObject(payload) && Array.isArray(payload.apps)
        ? payload.apps
        : null;

  if (!entries) {
    return { success: false, errorMessage: 'Catalog JSON must be an array or an object with a templates array.' };
  }

  const sources = entries.flatMap((entry, index) => parseTemplateSource(entry, index));
  if (sources.length === 0) {
    return { success: false, errorMessage: 'Catalog does not contain any valid installable apps.' };
  }

  return { success: true, sources: dedupeTemplateSources(sources) };
}

function parseTemplateSource(entry: unknown, index: number): InstallableTemplateSource[] {
  if (!isObject(entry) || typeof entry.url !== 'string' || !entry.url.trim() || !isHttpUrl(entry.url.trim())) {
    return [];
  }

  const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : undefined;
  const appId = typeof entry.appId === 'string' && entry.appId.trim() ? entry.appId.trim() : undefined;
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : appId ?? `catalog-app-${index + 1}`;

  if (!name && !appId) {
    return [];
  }

  return [
    {
      id,
      name: name ?? appId ?? id,
      icon: typeof entry.icon === 'string' && entry.icon.trim() ? entry.icon.trim() : undefined,
      description: typeof entry.description === 'string' && entry.description.trim() ? entry.description.trim() : undefined,
      url: entry.url.trim(),
      appId,
      tags: Array.isArray(entry.tags) ? entry.tags.filter(isNonEmptyString).map((tag) => tag.trim()) : undefined,
    },
  ];
}

function dedupeTemplateSources(sources: InstallableTemplateSource[]) {
  const sourcesByKey = new Map<string, InstallableTemplateSource>();

  sources.forEach((source) => {
    sourcesByKey.set(source.appId ?? source.url, source);
  });

  return [...sourcesByKey.values()];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
