import type { StoredSupabaseAuthState } from './supabaseAuth';

let storedState: StoredSupabaseAuthState = {
  project: null,
  session: null,
  organization: null,
  welcomeSeenAt: null,
};

export async function loadSupabaseAuthState(): Promise<StoredSupabaseAuthState> {
  return storedState;
}

export async function saveSupabaseAuthState(state: StoredSupabaseAuthState): Promise<void> {
  storedState = state;
}
