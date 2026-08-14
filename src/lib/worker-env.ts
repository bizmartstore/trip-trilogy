/**
 * Cloudflare Workers / Nitro env bridge.
 * Nitro sets `globalThis.__env__` on every request; secrets live there, not in process.env.
 * Worker secrets are non-enumerable — always read KNOWN_ENV_KEYS by direct property access.
 */

type WaitUntil = (promise: Promise<unknown>) => void;

let waitUntilFn: WaitUntil | null = null;

type EnvMap = Record<string, unknown>;

/** Per-request bindings from the Worker's fetch(env) argument (most reliable for secrets). */
let activeBindings: EnvMap | null = null;

/** Names we always probe by direct property access (may be non-enumerable). */
const KNOWN_ENV_KEYS = [
  "NEXORA_SUPABASE_URL",
  "EXPLOREHUB_SUPABASE_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "NEXORA_SUPABASE_SERVICE_ROLE_KEY",
  "EXPLOREHUB_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXORA_SESSION_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
] as const;

function processEnv(): Record<string, string | undefined> {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  if (!g.process) g.process = { env: {} };
  if (!g.process.env) g.process.env = {};
  return g.process.env;
}

function cloudflareEnv(): EnvMap | null {
  const g = globalThis as { __env__?: EnvMap };
  if (g.__env__ && typeof g.__env__ === "object") return g.__env__;
  return null;
}

function isExecutionContext(value: unknown): value is { waitUntil: WaitUntil } {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.waitUntil !== "function") return false;
  if ("ASSETS" in obj || "NEXORA_SUPABASE_URL" in obj || "SUPABASE_URL" in obj) {
    return false;
  }
  return true;
}

function readStringProp(env: EnvMap, name: string): string {
  try {
    const value = env[name];
    return typeof value === "string" && value.trim() ? value.trim() : "";
  } catch {
    return "";
  }
}

function copyStringsToProcess(env: EnvMap) {
  const target = processEnv();
  for (const key of KNOWN_ENV_KEYS) {
    const value = readStringProp(env, key);
    if (value) target[key] = value;
  }
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.length > 0) target[key] = value;
  }
}

/**
 * Bind the current request's Worker env (call once at the top of fetch()).
 * This is the only reliable way to read wrangler secrets on Cloudflare.
 */
export function bindWorkerEnv(env: unknown) {
  if (!env || typeof env !== "object") return;
  activeBindings = env as EnvMap;
  applyCloudflareEnv(env);
}

/**
 * Merge Worker bindings into globalThis.__env__ + process.env.
 * Safe to call with (request-only) signatures where env/ctx are undefined.
 */
export function applyCloudflareEnv(
  env: unknown,
  ctx?: { waitUntil?: WaitUntil },
) {
  let bindings = env;
  let context = ctx;

  if (isExecutionContext(bindings) && !context) {
    context = bindings;
    bindings = undefined;
  } else if (isExecutionContext(bindings) && context && !isExecutionContext(context)) {
    const swapped = context;
    context = bindings;
    bindings = swapped;
  }

  if (bindings && typeof bindings === "object") {
    const incoming = bindings as EnvMap;
    const g = globalThis as { __env__?: EnvMap };
    const existing =
      g.__env__ && typeof g.__env__ === "object" ? (g.__env__ as EnvMap) : null;

    const merged: EnvMap = { ...(existing ?? {}), ...incoming };
    for (const key of KNOWN_ENV_KEYS) {
      const fromIncoming = readStringProp(incoming, key);
      const fromExisting = existing ? readStringProp(existing, key) : "";
      if (fromIncoming) merged[key] = fromIncoming;
      else if (fromExisting) merged[key] = fromExisting;
    }
    g.__env__ = merged;
    activeBindings = merged;
    copyStringsToProcess(merged);
  }

  if (typeof context?.waitUntil === "function") waitUntilFn = context.waitUntil;
}

/** Re-copy env into process.env (per request). */
export function syncEnvFromGlobal() {
  const env = cloudflareEnv();
  if (env) {
    activeBindings = env;
    copyStringsToProcess(env);
    return;
  }
  if (activeBindings) copyStringsToProcess(activeBindings);
}

/** Keep a write alive after the HTTP response on Cloudflare Workers. */
export function keepAlive(promise: Promise<unknown>) {
  waitUntilFn?.(promise);
  return promise;
}

export function readEnv(name: string): string {
  if (activeBindings) {
    const fromActive = readStringProp(activeBindings, name);
    if (fromActive) return fromActive;
  }

  const cf = cloudflareEnv();
  if (cf) {
    const fromCf = readStringProp(cf, name);
    if (fromCf) return fromCf;
  }

  const fromProcess = processEnv()[name];
  if (fromProcess?.trim()) return fromProcess.trim();

  try {
    const meta = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const fromMeta = meta?.[name];
    if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  } catch {
    // import.meta.env unavailable at runtime
  }
  return "";
}

export function firstEnv(...names: string[]): string {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return "";
}

/** Which service-role key names are present (values never returned). */
export function serviceRoleKeyStatus() {
  const names = [
    "NEXORA_SUPABASE_SERVICE_ROLE_KEY",
    "EXPLOREHUB_SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  const present = names.filter((name) => Boolean(readEnv(name)));
  return {
    configured: present.length > 0,
    present: [...present],
    hasNitroEnv: cloudflareEnv() !== null,
    hasActiveBindings: activeBindings !== null,
  };
}
