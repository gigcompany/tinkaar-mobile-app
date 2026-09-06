import type { SupabaseAuthSession, SupabaseProjectConfig } from '../auth/supabaseAuth';
import type { AppVersionRecord } from './appVersionStore';

export async function saveAppVersionToSupabase({
  project,
  session,
  record,
}: {
  project: SupabaseProjectConfig;
  session: SupabaseAuthSession;
  record: AppVersionRecord;
}) {
  const response = await fetch(
    `${normalizeSupabaseUrl(project.supabaseUrl)}/rest/v1/ministore_app_versions?on_conflict=owner_id,app_id,version_id`,
    {
      method: 'POST',
      headers: {
        apikey: project.supabaseAnonKey,
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([
        {
          owner_id: session.userId,
          app_id: record.appId,
          version_id: record.id,
          app_name: record.name,
          app_version: record.version,
          prompt: record.prompt,
          provider_name: record.providerName,
          payload: record.app,
          created_at: record.createdAt,
        },
      ]),
    },
  );

  if (!response.ok) {
    throw new Error(`Supabase app version save failed (${response.status}): ${await response.text()}`);
  }
}

function normalizeSupabaseUrl(url: string) {
  return url.trim().replace(/\/$/, '');
}
