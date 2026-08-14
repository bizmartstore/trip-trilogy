import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { syncEnvFromGlobal } from "./lib/worker-env";

const envMiddleware = createMiddleware().server(async ({ next }) => {
  // Nitro sets globalThis.__env__ before this runs; copy secrets into process.env
  // so every server function / route sees NEXORA_SUPABASE_SERVICE_ROLE_KEY.
  syncEnvFromGlobal();
  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [envMiddleware, errorMiddleware, csrfMiddleware],
}));
