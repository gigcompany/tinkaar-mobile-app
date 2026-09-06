import { AppThemeOverride } from '../theme/theme';
import { AppDefinition } from '../schema/appDefinition.schema';
import type { InstallableTemplateSource } from '../apps/catalog';
import type { SupabaseCloudSyncConfig } from '../data/cloudSync';

export const DEFAULT_TEMPLATE_CATALOG_URL = 'https://raw.githubusercontent.com/gigcompany/appfoundry-templates/main/catalog.json';

declare global {
  // Hosts can set this before the app bundle runs to override app-defined theme defaults.
  // Example: globalThis.__MINISTORE_THEME_OVERRIDE__ = { mode: 'system', light: { primaryColor: '#7c3aed' } }
  // eslint-disable-next-line no-var
  var __MINISTORE_THEME_OVERRIDE__: AppThemeOverride | undefined;
  // Hosts can set this before the app bundle runs to provide downloaded app templates.
  // eslint-disable-next-line no-var
  var __MINISTORE_APP_TEMPLATES__: AppDefinition[] | undefined;
  // Hosts can set this before the app bundle runs to provide curated installable template URLs.
  // eslint-disable-next-line no-var
  var __MINISTORE_TEMPLATE_SOURCES__: InstallableTemplateSource[] | undefined;
  // Hosts can set this before the app bundle runs to provide a public JSON catalog URL.
  // eslint-disable-next-line no-var
  var __MINISTORE_TEMPLATE_CATALOG_URL__: string | undefined;
  // Hosts can set this before the app bundle runs to enable cloud sync.
  // eslint-disable-next-line no-var
  var __MINISTORE_CLOUD_SYNC__: SupabaseCloudSyncConfig | undefined;
}

export function getExternalThemeOverride() {
  return globalThis.__MINISTORE_THEME_OVERRIDE__ ?? {};
}

export function getExternalAppTemplates() {
  return globalThis.__MINISTORE_APP_TEMPLATES__ ?? [];
}

export function getExternalTemplateSources() {
  return globalThis.__MINISTORE_TEMPLATE_SOURCES__ ?? [];
}

export function getExternalTemplateCatalogUrl() {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return globalThis.__MINISTORE_TEMPLATE_CATALOG_URL__ ?? env?.EXPO_PUBLIC_MINISTORE_TEMPLATE_CATALOG_URL ?? DEFAULT_TEMPLATE_CATALOG_URL;
}

export function getExternalCloudSyncConfig(): SupabaseCloudSyncConfig | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const supabaseUrl = globalThis.__MINISTORE_CLOUD_SYNC__?.supabaseUrl ?? env?.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = globalThis.__MINISTORE_CLOUD_SYNC__?.supabaseAnonKey ?? env?.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = globalThis.__MINISTORE_CLOUD_SYNC__?.accessToken ?? env?.EXPO_PUBLIC_SUPABASE_ACCESS_TOKEN;
  const ownerId = globalThis.__MINISTORE_CLOUD_SYNC__?.ownerId ?? env?.EXPO_PUBLIC_SUPABASE_OWNER_ID;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return {
    engine: 'supabase',
    enabled: globalThis.__MINISTORE_CLOUD_SYNC__?.enabled ?? true,
    supabaseUrl,
    supabaseAnonKey,
    accessToken,
    ownerId,
    tableName: globalThis.__MINISTORE_CLOUD_SYNC__?.tableName ?? env?.EXPO_PUBLIC_SUPABASE_TABLE_NAME,
    payloadColumn: globalThis.__MINISTORE_CLOUD_SYNC__?.payloadColumn,
    maxBatchSize: globalThis.__MINISTORE_CLOUD_SYNC__?.maxBatchSize,
    pullPageSize: globalThis.__MINISTORE_CLOUD_SYNC__?.pullPageSize,
    retryIntervalMs: globalThis.__MINISTORE_CLOUD_SYNC__?.retryIntervalMs,
  };
}
