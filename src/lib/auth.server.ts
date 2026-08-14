import type { User } from "@supabase/supabase-js";

import { isMainAdminEmail, normalizeEmail } from "@/lib/constants";
import {
  createSupabaseAdmin,
  createSupabaseAnon,
  isSupabaseConfigured,
} from "@/lib/supabase.server";
import { ensureStore, hashPassword, resolveRole } from "@/lib/store.server";
import type { HubAccount } from "@/lib/types";

export type SafeAccount = Omit<HubAccount, "passwordHash">;
export type AuthResult =
  | { ok: true; account: SafeAccount; needsConfirmation?: boolean }
  | { ok: false; error: string };

function missingConfig(): AuthResult {
  return {
    ok: false,
    error:
      "Account database is not connected. Set SUPABASE_ANON_KEY so sign-in works across devices.",
  };
}

function metadataString(meta: User["user_metadata"], key: string): string | undefined {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function toAccount(user: User, client = createSupabaseAnon()): Promise<SafeAccount> {
  const email = normalizeEmail(user.email ?? "");
  const state = await ensureStore();
  let role = resolveRole(email, state.adminInvites);

  if (user.id) {
    const { data: roles } = await client.from("user_roles").select("role").eq("user_id", user.id);
    if (roles?.some((row) => row.role === "admin")) role = "admin";
  }

  let name =
    metadataString(user.user_metadata, "full_name") ||
    metadataString(user.user_metadata, "name") ||
    email.split("@")[0];
  let picture =
    metadataString(user.user_metadata, "avatar_url") ||
    metadataString(user.user_metadata, "picture");

  const { data: profile } = await client
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.full_name) name = profile.full_name;
  if (profile?.avatar_url) picture = profile.avatar_url;

  return {
    email,
    name,
    role,
    picture,
    createdAt: user.created_at,
  };
}

function authErrorMessage(
  error: { message?: string; code?: string } | null,
  fallback: string,
): string {
  const message = (error?.message ?? "").toLowerCase();
  const code = (error?.code ?? "").toLowerCase();
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Confirm your email before signing in. Check your inbox for a link from ExploreHub.";
  }
  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials") ||
    message.includes("invalid email or password")
  ) {
    return "No account found for that email, or the password is incorrect.";
  }
  if (message.includes("already registered") || message.includes("user already exists")) {
    return "An account with this email already exists. Sign in instead.";
  }
  return error?.message || fallback;
}

/** If this password still matches a leftover in-memory account, copy it into Supabase. */
async function migrateLocalAccount(input: {
  email: string;
  password: string;
}): Promise<SafeAccount | null> {
  const state = await ensureStore();
  const email = normalizeEmail(input.email);
  const existing = state.accounts.find((account) => account.email === email);
  if (!existing) return null;
  const hash = await hashPassword(input.password);
  if (hash !== existing.passwordHash) return null;

  const admin = createSupabaseAdmin();
  if (admin) {
    const created = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: existing.name, avatar_url: existing.picture },
    });
    if (created.data.user) return toAccount(created.data.user, admin);
  }

  const anon = createSupabaseAnon();
  const signed = await anon.auth.signInWithPassword({ email, password: input.password });
  if (signed.data.user) return toAccount(signed.data.user, anon);

  return {
    email: existing.email,
    name: existing.name,
    role: resolveRole(email, state.adminInvites),
    picture: existing.picture,
    createdAt: existing.createdAt,
  };
}

export async function registerAccount(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  if (!isSupabaseConfigured()) return missingConfig();

  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const metadata = {
    full_name: name,
    ...(isMainAdminEmail(email) ? { role: "admin" } : {}),
  };

  const admin = createSupabaseAdmin();
  if (admin) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) return { ok: false, error: authErrorMessage(error, "Could not create account.") };
    if (!data.user) return { ok: false, error: "Could not create account." };
    return { ok: true, account: await toAccount(data.user, admin) };
  }

  const supabase = createSupabaseAnon();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: { data: metadata },
  });
  if (error) return { ok: false, error: authErrorMessage(error, "Could not create account.") };
  if (data.user?.identities && data.user.identities.length === 0) {
    return { ok: false, error: "An account with this email already exists. Sign in instead." };
  }
  if (!data.user) return { ok: false, error: "Could not create account." };
  if (!data.session) {
    return {
      ok: true,
      needsConfirmation: true,
      account: await toAccount(data.user, supabase),
    };
  }
  return { ok: true, account: await toAccount(data.user, supabase) };
}

export async function signInAccount(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  if (!isSupabaseConfigured()) return missingConfig();

  const email = normalizeEmail(input.email);
  const supabase = createSupabaseAnon();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (data.user) {
    return { ok: true, account: await toAccount(data.user, supabase) };
  }

  const migrated = await migrateLocalAccount(input);
  if (migrated) return { ok: true, account: migrated };

  return {
    ok: false,
    error: authErrorMessage(error, "No account found for that email. Create an account first."),
  };
}

export async function upsertOAuthAccount(input: {
  idToken: string;
  name?: string;
  email?: string;
  picture?: string;
}): Promise<SafeAccount> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Account database is not connected. Set SUPABASE_ANON_KEY so Google sign-in works across devices.",
    );
  }
  const supabase = createSupabaseAnon();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: input.idToken,
  });
  if (error || !data.user) {
    throw new Error(
      error?.message ||
        "Google sign-in could not reach the account database. Enable the Google provider in Supabase Auth.",
    );
  }
  return toAccount(data.user, supabase);
}
