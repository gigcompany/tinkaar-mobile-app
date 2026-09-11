import { openDatabaseSync } from 'expo-sqlite';
import type { StoredSupabaseAuthState } from './supabaseAuth';

const database = openDatabaseSync('workfoundry_supabase_auth.db');
database.execSync(`
  CREATE TABLE IF NOT EXISTS supabase_auth_state (
    id TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL
  )
`);

export async function loadSupabaseAuthState(): Promise<StoredSupabaseAuthState> {
  const [row] = database.getAllSync<{ payload: string }>('SELECT payload FROM supabase_auth_state WHERE id = ?', 'default');
  if (!row?.payload) {
    return createEmptyAuthState();
  }

  try {
    const parsed = JSON.parse(row.payload) as Partial<StoredSupabaseAuthState> & { onboardingCompletedAt?: string | null };
    return {
      project: parsed.project ?? null,
      session: parsed.session ?? null,
      organization: parsed.organization ?? null,
      welcomeSeenAt: parsed.welcomeSeenAt ?? parsed.onboardingCompletedAt ?? null,
    };
  } catch (error) {
    console.warn('Ignoring invalid Supabase auth storage.', error);
    return createEmptyAuthState();
  }
}

export async function saveSupabaseAuthState(state: StoredSupabaseAuthState): Promise<void> {
  database.runSync(
    'INSERT OR REPLACE INTO supabase_auth_state (id, payload) VALUES (?, ?)',
    'default',
    JSON.stringify(state),
  );
}

function createEmptyAuthState(): StoredSupabaseAuthState {
  return {
    project: null,
    session: null,
    organization: null,
    welcomeSeenAt: null,
  };
}
