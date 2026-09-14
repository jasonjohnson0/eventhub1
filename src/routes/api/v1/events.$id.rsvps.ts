import { createFileRoute } from "@tanstack/react-router";
import { withApiAuth, jsonOk, jsonError } from "@/lib/api-auth.server";

/** Read-only, coordinator-side. The public RSVP write path is upsertRsvp
 *  (a signed-in attendee's own action) -- spec 09 explicitly scopes this
 *  resource "no public write", so there's no POST/PATCH here at all. */
export const Route = createFileRoute("/api/v1/events/$id/rsvps")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApiAuth(request, async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const admin = supabaseAdmin as any;
          const { data: ev } = await admin
            .from("events")
            .select("id")
            .eq("id", params.id)
            .eq("coordinator_id", ctx.coordinatorId)
            .maybeSingle();
          if (!ev) return jsonError(404, "not_found", "Event not found");
          const { data, error } = await admin
            .from("event_rsvps")
            .select("id, user_id, status, created_at")
            .eq("event_id", params.id)
            .order("created_at", { ascending: true });
          if (error) return jsonError(500, "internal_error", error.message);
          return jsonOk({ data: data ?? [] });
        }),
    },
  },
});
