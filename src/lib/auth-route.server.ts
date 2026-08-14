import { supabaseConfigured, supabaseMissingConfigMessage } from "@/lib/supabase-rest.server";
import { serviceRoleKeyStatus, syncEnvFromGlobal } from "@/lib/worker-env";

/** Ensure Worker secrets are in scope before any auth / Supabase call. */
export function prepareAuthRequest() {
  syncEnvFromGlobal();
  if (supabaseConfigured()) return { ok: true as const };

  const status = serviceRoleKeyStatus();
  return {
    ok: false as const,
    response: Response.json(
      {
        ok: false,
        error: supabaseMissingConfigMessage(),
        diagnostics: status,
      },
      { status: 503 },
    ),
  };
}
