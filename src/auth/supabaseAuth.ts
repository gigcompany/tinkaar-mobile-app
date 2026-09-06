import type { SupabaseCloudSyncConfig } from '../data/cloudSync';
import { loadSupabaseAuthState, saveSupabaseAuthState } from './supabaseAuthStore';

export type SupabaseProjectConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  tableName?: string;
  payloadColumn?: 'payload' | 'data';
};

export type SupabaseAuthSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
  email?: string;
};

export type SupabaseOrganization = {
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredSupabaseAuthState = {
  project: SupabaseProjectConfig | null;
  session: SupabaseAuthSession | null;
  organization: SupabaseOrganization | null;
  onboardingCompletedAt: string | null;
};

type SupabaseAuthResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: {
    id?: string;
    email?: string;
  } | null;
  error?: string;
  error_description?: string;
  msg?: string;
};

type SupabaseOrganizationRow = {
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __MINISTORE_CLOUD_SYNC__: SupabaseCloudSyncConfig | undefined;
}

export { loadSupabaseAuthState, saveSupabaseAuthState };

export function getExternalSupabaseProjectConfig(): SupabaseProjectConfig | null {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const supabaseUrl = globalThis.__MINISTORE_CLOUD_SYNC__?.supabaseUrl ?? env?.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = globalThis.__MINISTORE_CLOUD_SYNC__?.supabaseAnonKey ?? env?.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    tableName: globalThis.__MINISTORE_CLOUD_SYNC__?.tableName ?? env?.EXPO_PUBLIC_SUPABASE_TABLE_NAME,
    payloadColumn: globalThis.__MINISTORE_CLOUD_SYNC__?.payloadColumn,
  };
}

export function createSupabaseCloudSyncConfig(
  project: SupabaseProjectConfig | null,
  session: SupabaseAuthSession | null,
): SupabaseCloudSyncConfig | null {
  if (!project || !session) {
    return null;
  }

  return {
    engine: 'supabase',
    enabled: true,
    supabaseUrl: normalizeSupabaseUrl(project.supabaseUrl),
    supabaseAnonKey: project.supabaseAnonKey,
    accessToken: session.accessToken,
    ownerId: session.userId,
    tableName: project.tableName,
    payloadColumn: project.payloadColumn,
  };
}

export async function saveSupabaseOrganization({
  project,
  session,
  organizationName,
}: {
  project: SupabaseProjectConfig;
  session: SupabaseAuthSession;
  organizationName: string;
}): Promise<SupabaseOrganization> {
  const now = new Date().toISOString();
  const row: SupabaseOrganizationRow = {
    owner_id: session.userId,
    name: organizationName.trim(),
    created_at: now,
    updated_at: now,
  };

  const response = await fetch(
    `${normalizeSupabaseUrl(project.supabaseUrl)}/rest/v1/ministore_organizations?on_conflict=owner_id`,
    {
      method: 'POST',
      headers: {
        ...getAuthHeaders(project, session.accessToken),
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([row]),
    },
  );

  if (!response.ok) {
    throw new Error(`Supabase organization setup failed (${response.status}): ${await response.text()}`);
  }

  const parsed = (await response.json().catch(() => [])) as unknown;
  const [savedRow] = Array.isArray(parsed) ? parsed.filter(isSupabaseOrganizationRow) : [];

  return {
    name: savedRow?.name ?? row.name,
    createdAt: savedRow?.created_at ?? row.created_at,
    updatedAt: savedRow?.updated_at ?? row.updated_at,
  };
}

export async function signInWithSupabasePassword({
  project,
  email,
  password,
}: {
  project: SupabaseProjectConfig;
  email: string;
  password: string;
}) {
  const session = await requestAuthSession(project, '/auth/v1/token?grant_type=password', {
    email: email.trim(),
    password,
  });
  if (!session) {
    throw new Error('Supabase did not return a signed-in session.');
  }
  return session;
}

export async function signUpWithSupabasePassword({
  project,
  email,
  password,
}: {
  project: SupabaseProjectConfig;
  email: string;
  password: string;
}) {
  return requestAuthSession(project, '/auth/v1/signup', {
    email: email.trim(),
    password,
  }, { allowMissingSession: true });
}

export async function refreshSupabaseSession(project: SupabaseProjectConfig, session: SupabaseAuthSession) {
  const refreshedSession = await requestAuthSession(project, '/auth/v1/token?grant_type=refresh_token', {
    refresh_token: session.refreshToken,
  });
  if (!refreshedSession) {
    throw new Error('Supabase did not return a refreshed session.');
  }
  return refreshedSession;
}

export async function signOutOfSupabase(project: SupabaseProjectConfig, session: SupabaseAuthSession | null) {
  if (!session) {
    return;
  }

  const response = await fetch(`${normalizeSupabaseUrl(project.supabaseUrl)}/auth/v1/logout`, {
    method: 'POST',
    headers: getAuthHeaders(project, session.accessToken),
  });

  if (!response.ok && response.status !== 401) {
    throw new Error(`Supabase sign out failed (${response.status}): ${await response.text()}`);
  }
}

export async function refreshSessionIfNeeded(project: SupabaseProjectConfig, session: SupabaseAuthSession) {
  const refreshAt = session.expiresAt - 60;
  if (Date.now() / 1000 < refreshAt) {
    return session;
  }

  return refreshSupabaseSession(project, session);
}

export function validateSupabaseProjectConfig(project: SupabaseProjectConfig) {
  if (!project.supabaseUrl.trim()) {
    return 'Enter the Supabase project URL.';
  }

  if (!project.supabaseAnonKey.trim()) {
    return 'Enter the Supabase publishable key.';
  }

  try {
    const url = new URL(normalizeSupabaseUrl(project.supabaseUrl));
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
      return 'Supabase URL must use HTTPS.';
    }
  } catch {
    return 'Enter a valid Supabase project URL.';
  }

  return null;
}

function normalizeSupabaseUrl(url: string) {
  return url.trim().replace(/\/$/, '');
}

async function requestAuthSession(
  project: SupabaseProjectConfig,
  path: string,
  body: Record<string, string>,
  options: { allowMissingSession?: boolean } = {},
) {
  const response = await fetch(`${normalizeSupabaseUrl(project.supabaseUrl)}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(project),
    body: JSON.stringify(body),
  });
  const parsed = (await response.json().catch(() => ({}))) as SupabaseAuthResponse;

  if (!response.ok) {
    throw new Error(parsed.error_description ?? parsed.msg ?? parsed.error ?? `Supabase auth failed (${response.status}).`);
  }

  if (options.allowMissingSession && !parsed.access_token && !parsed.refresh_token) {
    return null;
  }

  if (!parsed.access_token || !parsed.refresh_token || !parsed.user?.id) {
    throw new Error('Supabase did not return a signed-in session. Confirm the email address, then sign in.');
  }

  return {
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token,
    expiresAt: parsed.expires_at ?? Math.floor(Date.now() / 1000) + (parsed.expires_in ?? 3600),
    userId: parsed.user.id,
    email: parsed.user.email,
  };
}

function getAuthHeaders(project: SupabaseProjectConfig, accessToken?: string) {
  return {
    apikey: project.supabaseAnonKey,
    Authorization: `Bearer ${accessToken ?? project.supabaseAnonKey}`,
    'Content-Type': 'application/json',
  };
}

function isSupabaseOrganizationRow(value: unknown): value is SupabaseOrganizationRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as SupabaseOrganizationRow).owner_id === 'string' &&
    typeof (value as SupabaseOrganizationRow).name === 'string' &&
    typeof (value as SupabaseOrganizationRow).created_at === 'string' &&
    typeof (value as SupabaseOrganizationRow).updated_at === 'string'
  );
}
