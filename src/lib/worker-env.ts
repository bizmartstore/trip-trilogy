/**
 * Cloudflare Workers / Nitro env bridge.
 * Nitro sets `globalThis.__env__` on every request; secrets live there, not in process.env.
 */

type WaitUntil = (promise: Promise<unknown>) => void;

let waitUntilFn: WaitUntil | null = null;

type EnvMap = Record<string, unknown>;

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

export function applyCloudflareEnv(
  env: unknown,
  ctx?: { waitUntil?: WaitUntil },
) {
  if (env && typeof env === "object") {
    const g = globalThis as { __env__?: EnvMap };
    g.__env__ = env as EnvMap;
    const target = processEnv();
    for (const [key, value] of Object.entries(env as EnvMap)) {
      if (typeof value === "string" && value.length > 0) {
        target[key] = value;
      }
    }
  }
  if (typeof ctx?.waitUntil === "function") waitUntilFn = ctx.waitUntil;
}

/** Keep a write alive after the HTTP response on Cloudflare Workers. */
export function keepAlive(promise: Promise<unknown>) {
  waitUntilFn?.(promise);
  return promise;
}

export function readEnv(name: string): string {
  const fromCf = cloudflareEnv()?.[name];
  if (typeof fromCf === "string" && fromCf.trim()) return fromCf.trim();

  const fromProcess = processEnv()[name];
  if (fromProcess?.trim()) return fromProcess.trim();

  try {
    const meta = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const fromMeta = meta?.[name];
    if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  } catch {
    // import.meta.env is unavailable or replaced at build time
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
