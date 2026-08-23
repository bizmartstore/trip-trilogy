import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createFileRoute } from "@tanstack/react-router";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";

import {
  buildChatSystemPrompt,
  lookupBookingsForChat,
} from "@/lib/chat-context.server";
import { readEnv, syncEnvFromGlobal } from "@/lib/worker-env";

/**
 * Nexi — the Nexora concierge chat endpoint.
 * Streams Gemini responses; the model can call checkBookingStatus to answer
 * "is my reservation approved?" from the live booking store.
 */
export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        syncEnvFromGlobal();

        let messages: UIMessage[];
        try {
          const body = (await request.json()) as { messages?: unknown };
          if (!Array.isArray(body.messages)) {
            return Response.json({ error: "messages-required" }, { status: 400 });
          }
          messages = body.messages as UIMessage[];
        } catch {
          return Response.json({ error: "invalid-body" }, { status: 400 });
        }

        const apiKey = readEnv("GEMINI_API_KEY");
        if (!apiKey) {
          return Response.json(
            {
              error: "chat-not-configured",
              message:
                "The assistant is not configured yet. Please add the Gemini API key.",
            },
            { status: 503 },
          );
        }

        const google = createGoogleGenerativeAI({ apiKey });
        const system = await buildChatSystemPrompt();

        try {
          const result = streamText({
            model: google("gemini-2.5-flash"),
            system,
            messages: await convertToModelMessages(messages),
            tools: {
              checkBookingStatus: tool({
                description:
                  "Look up the status of a customer's Nexora reservation(s) by the email address used at checkout. Use this whenever a customer asks whether their booking/reservation is approved, pending, rejected or paid.",
                inputSchema: z.object({
                  email: z
                    .string()
                    .describe("Email address the customer used when reserving"),
                  bookingDate: z
                    .string()
                    .nullable()
                    .describe(
                      "Optional YYYY-MM-DD — the day the booking was made or the trip start date, to narrow multiple reservations",
                    ),
                }),
                execute: async ({ email, bookingDate }) =>
                  lookupBookingsForChat(email, bookingDate),
              }),
            },
            stopWhen: stepCountIs(5),
            abortSignal: request.signal,
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
          });
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            return new Response(null, { status: 499 });
          }
          console.error("[chat] stream failed:", error);
          return Response.json({ error: "chat-failed" }, { status: 500 });
        }
      },
    },
  },
});
