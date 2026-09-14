import { createFileRoute } from "@tanstack/react-router";

/**
 * Drains due event reminders (spec 07) -- `scheduleReminders` only ever
 * wrote `user_notifications` rows; nothing sent them until this route
 * existed. Meant to be hit on a schedule (Vercel Cron: see
 * `docs/DEPLOY_VERCEL.md`), gated by `CRON_SECRET` rather than auth, since
 * there is no signed-in user driving this -- it's a clock, not a person.
 */
async function handleDrain(request: Request) {
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    return new Response(JSON.stringify({ error: "CRON_SECRET not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { drainDueEmailReminders } = await import("@/lib/communications.functions");
  try {
    const result = await drainDueEmailReminders();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[cron/email-reminders] drain failed:", err);
    return new Response(JSON.stringify({ error: "Drain failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/cron/email-reminders")({
  server: {
    handlers: {
      GET: async ({ request }) => handleDrain(request),
      POST: async ({ request }) => handleDrain(request),
    },
  },
});
