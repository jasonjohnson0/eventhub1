import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// There was no healthcheck/status endpoint anywhere -- nothing for an
// uptime monitor (UptimeRobot, Better Uptime, Pingdom, a cron ping,
// whatever gets set up) to point at. This is the minimum that's actually
// worth checking: the app process is up, and it can still reach the
// database. It does not attempt to verify Stripe, email delivery, or
// anything else external -- a healthcheck that fails for too many
// unrelated reasons stops being trustworthy.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const { error } = await supabase.from("events").select("id", { head: true, count: "exact" }).limit(1);
        const dbOk = !error;
        const body = {
          status: dbOk ? "ok" : "degraded",
          db: dbOk ? "ok" : "unreachable",
          latency_ms: Date.now() - started,
        };
        return new Response(JSON.stringify(body), {
          status: dbOk ? 200 : 503,
          headers: {
            "content-type": "application/json",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
