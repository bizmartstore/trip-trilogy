import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const FALLBACK_URL = "https://aeynekfhnzjcimskwouw.supabase.co";

function readEnv(name: string): string {
  const fromProcess = typeof process !== "undefined" ? process.env[name] : undefined;
  const meta = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return (fromProcess || meta?.[name] || "").trim();
}

export function getSupabaseUrl(): string {
  return readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL") || FALLBACK_URL;
}

export function getSupabaseAnonKey(): string {
  return (
    readEnv("SUPABASE_ANON_KEY") ||
    readEnv("SUPABASE_PUBLISHABLE_KEY") ||
    readEnv("VITE_SUPABASE_ANON_KEY") ||
    readEnv("VITE_SUPABASE_PUBLISHABLE_KEY")
  );
}

export function getSupabaseServiceRoleKey(): string {
  return readEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
} as const;

export function createSupabaseAnon(): SupabaseClient {
  const key = getSupabaseAnonKey();
  if (!key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_ANON_KEY so accounts persist across devices.",
    );
  }
  return createClient(getSupabaseUrl(), key, { auth: authOptions });
}

export function createSupabaseAdmin(): SupabaseClient | null {
  const key = getSupabaseServiceRoleKey();
  if (!key) return null;
  return createClient(getSupabaseUrl(), key, { auth: authOptions });
}
