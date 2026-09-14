import { createFileRoute } from "@tanstack/react-router";
import { withApiAuth, jsonOk, jsonError } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/events/$id/tickets/$ticketId")({
  server: {
    handlers: {
      // Spec 09 F3: no purchase endpoint in v1, this is tier management only
      // (read tiers via the parent GET, remove a tier here). Charging stays
      // in Checkout (#1), never a secret-key API.
      DELETE: async ({ request, params }) =>
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
          const { data: tier } = await admin
            .from("event_tickets")
            .select("id")
            .eq("id", params.ticketId)
            .eq("event_id", params.id)
            .maybeSingle();
          if (!tier) return jsonError(404, "not_found", "Ticket tier not found");
          const { error } = await admin.from("event_tickets").delete().eq("id", params.ticketId);
          if (error) return jsonError(500, "internal_error", error.message);
          return jsonOk({ data: { ok: true } });
        }),
    },
  },
});
