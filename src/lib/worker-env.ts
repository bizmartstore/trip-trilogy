/**
 * Cloudflare Workers pass bindings as the `env` argument to `fetch`, not
 * `process.env`. Copy them so the rest of the server can keep using process.env.
 */

type WaitUntil = (promise: Promise<unknown>) => void;

let waitUntilFn: WaitUntil | null = null;

function processEnv(): Record<string, string | undefined> {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  if (!g.process) g.process = { env: {} };
  if (!g.process.env) g.process.env = {};
  return g.process.env;
}

export function applyCloudflareEnv(
  env: unknown,
  ctx?: { waitUntil?: WaitUntil },
) {
  if (env && typeof env === "object") {
    const target = processEnv();
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (typeof value === "string" && value.length > 0 && !target[key]) {
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
  const fromProcess = processEnv()[name];
  if (fromProcess?.trim()) return fromProcess.trim();
  try {
    const meta = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    const fromMeta = meta?.[name];
    if (fromMeta?.trim()) return fromMeta.trim();
  } catch {
    // import.meta.env is unavailable in some Worker bundles
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
