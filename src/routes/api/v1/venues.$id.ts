import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApiAuth, jsonOk, jsonError } from "@/lib/api-auth.server";

const VENUE_COLUMNS =
  "id, name, address, lat, lng, capacity, phone, website, photo_url, parking_info, accessibility_info, created_at";

const patchVenueBody = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().max(500).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  capacity: z.number().int().min(0).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  website: z.string().url().max(500).optional().nullable(),
});

export const Route = createFileRoute("/api/v1/venues/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApiAuth(request, async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const { data: row } = await (supabaseAdmin as any)
            .from("venues")
            .select(VENUE_COLUMNS)
            .eq("id", params.id)
            .eq("coordinator_id", ctx.coordinatorId)
            .maybeSingle();
          if (!row) return jsonError(404, "not_found", "Venue not found");
          return jsonOk({ data: row });
        }),

      PATCH: async ({ request, params }) =>
        withApiAuth(request, async (ctx) => {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(422, "invalid_json", "Request body must be valid JSON");
          }
          const parsed = patchVenueBody.safeParse(body);
          if (!parsed.success) {
            return jsonError(422, "validation_error", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const admin = supabaseAdmin as any;
          const { data: existing } = await admin
            .from("venues")
            .select("id")
            .eq("id", params.id)
            .eq("coordinator_id", ctx.coordinatorId)
            .maybeSingle();
          if (!existing) return jsonError(404, "not_found", "Venue not found");
          const patch: Record<string, unknown> = { ...parsed.data };
          Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
          const { data: row, error } = await admin
            .from("venues")
            .update(patch)
            .eq("id", params.id)
            .select(VENUE_COLUMNS)
            .single();
          if (error) return jsonError(500, "internal_error", error.message);
          return jsonOk({ data: row });
        }),

      DELETE: async ({ request, params }) =>
        withApiAuth(request, async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const admin = supabaseAdmin as any;
          const { data: existing } = await admin
            .from("venues")
            .select("id")
            .eq("id", params.id)
            .eq("coordinator_id", ctx.coordinatorId)
            .maybeSingle();
          if (!existing) return jsonError(404, "not_found", "Venue not found");
          const { error } = await admin.from("venues").delete().eq("id", params.id);
          if (error) return jsonError(500, "internal_error", error.message);
          return jsonOk({ data: { ok: true } });
        }),
    },
  },
});
