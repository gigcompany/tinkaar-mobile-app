import type { StoredSupabaseAuthState } from './supabaseAuth';

const storageKey = 'workfoundry.supabaseAuth';

export async function loadSupabaseAuthState(): Promise<StoredSupabaseAuthState> {
  if (typeof globalThis.localStorage === 'undefined') {
    return createEmptyAuthState();
  }

  const stored = globalThis.localStorage.getItem(storageKey);
  if (!stored) {
    return createEmptyAuthState();
  }

  try {
    const parsed = JSON.parse(stored) as StoredSupabaseAuthState;
    return {
      project: isProjectConfig(parsed.project) ? parsed.project : null,
      session: isAuthSession(parsed.session) ? parsed.session : null,
      organization: isOrganization(parsed.organization) ? parsed.organization : null,
      onboardingCompletedAt: typeof parsed.onboardingCompletedAt === 'string' ? parsed.onboardingCompletedAt : null,
    };
  } catch (error) {
    console.warn('Ignoring invalid Supabase auth storage.', error);
    return createEmptyAuthState();
  }
}

export async function saveSupabaseAuthState(state: StoredSupabaseAuthState): Promise<void> {
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.setItem(storageKey, JSON.stringify(state));
  }
}

function isProjectConfig(value: unknown): value is StoredSupabaseAuthState['project'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NonNullable<StoredSupabaseAuthState['project']>).supabaseUrl === 'string' &&
    typeof (value as NonNullable<StoredSupabaseAuthState['project']>).supabaseAnonKey === 'string'
  );
}

function isAuthSession(value: unknown): value is StoredSupabaseAuthState['session'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NonNullable<StoredSupabaseAuthState['session']>).accessToken === 'string' &&
    typeof (value as NonNullable<StoredSupabaseAuthState['session']>).refreshToken === 'string' &&
    typeof (value as NonNullable<StoredSupabaseAuthState['session']>).expiresAt === 'number' &&
    typeof (value as NonNullable<StoredSupabaseAuthState['session']>).userId === 'string'
  );
}

function isOrganization(value: unknown): value is StoredSupabaseAuthState['organization'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as NonNullable<StoredSupabaseAuthState['organization']>).name === 'string' &&
    typeof (value as NonNullable<StoredSupabaseAuthState['organization']>).createdAt === 'string' &&
    typeof (value as NonNullable<StoredSupabaseAuthState['organization']>).updatedAt === 'string'
  );
}

function createEmptyAuthState(): StoredSupabaseAuthState {
  return {
    project: null,
    session: null,
    organization: null,
    onboardingCompletedAt: null,
  };
}
