import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApiAuth, jsonOk, jsonError } from "@/lib/api-auth.server";

const TICKET_COLUMNS =
  "id, name, description, price_cents, quantity_available, quantity_sold, early_bird, early_bird_price_cents, valid_from, valid_until";

const createTierBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional().nullable(),
  price_cents: z.number().int().min(0),
  quantity_available: z.number().int().min(0),
  early_bird: z.boolean().default(false),
  early_bird_price_cents: z.number().int().min(0).optional().nullable(),
  valid_from: z.string().datetime({ offset: true }).optional().nullable(),
  valid_until: z.string().datetime({ offset: true }).optional().nullable(),
});

/** Confirms the event belongs to this API key's coordinator; returns null
 *  (caller sends 404) rather than throwing, same "don't leak existence"
 *  posture as every other /api/v1 resource lookup. */
async function assertOwnsEvent(
  // biome-ignore lint/suspicious/noExplicitAny: admin client generic type
  admin: any,
  eventId: string,
  coordinatorId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("coordinator_id", coordinatorId)
    .maybeSingle();
  return !!data;
}

export const Route = createFileRoute("/api/v1/events/$id/tickets")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApiAuth(request, async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const admin = supabaseAdmin as any;
          if (!(await assertOwnsEvent(admin, params.id, ctx.coordinatorId))) {
            return jsonError(404, "not_found", "Event not found");
          }
          const { data, error } = await admin
            .from("event_tickets")
            .select(TICKET_COLUMNS)
            .eq("event_id", params.id)
            .order("price_cents", { ascending: true });
          if (error) return jsonError(500, "internal_error", error.message);
          return jsonOk({ data: data ?? [] });
        }),

      POST: async ({ request, params }) =>
        withApiAuth(request, async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const admin = supabaseAdmin as any;
          if (!(await assertOwnsEvent(admin, params.id, ctx.coordinatorId))) {
            return jsonError(404, "not_found", "Event not found");
          }
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(422, "invalid_json", "Request body must be valid JSON");
          }
          const parsed = createTierBody.safeParse(body);
          if (!parsed.success) {
            return jsonError(422, "validation_error", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
          }
          const { data: row, error } = await admin
            .from("event_tickets")
            .insert({ event_id: params.id, ...parsed.data })
            .select(TICKET_COLUMNS)
            .single();
          if (error) return jsonError(500, "internal_error", error.message);
          return jsonOk({ data: row }, 201);
        }),
    },
  },
});
