import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApiAuth, jsonOk, jsonError } from "@/lib/api-auth.server";

const EVENT_COLUMNS =
  "id, title, description, location, start_time, end_time, status, category, tags, event_format, virtual_link, timezone, visibility, created_at";

const patchEventBody = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  start_time: z.string().datetime({ offset: true }).optional(),
  end_time: z.string().datetime({ offset: true }).optional(),
  category: z
    .enum(["sports", "networking", "education", "social", "fundraiser", "workshop", "other"])
    .optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  timezone: z.string().min(1).max(100).optional(),
  visibility: z.enum(["public", "unlisted"]).optional(),
});

export const Route = createFileRoute("/api/v1/events/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        withApiAuth(request, async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const { data: row } = await (supabaseAdmin as any)
            .from("events")
            .select(EVENT_COLUMNS)
            .eq("id", params.id)
            .eq("coordinator_id", ctx.coordinatorId)
            .maybeSingle();
          // A key must never see another calendar's event -- 404, not 403,
          // so a valid-but-wrong-owner id can't be distinguished from one
          // that simply doesn't exist (spec's own edge case).
          if (!row) return jsonError(404, "not_found", "Event not found");
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
          const parsed = patchEventBody.safeParse(body);
          if (!parsed.success) {
            return jsonError(422, "validation_error", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const admin = supabaseAdmin as any;
          const { data: existing } = await admin
            .from("events")
            .select("id")
            .eq("id", params.id)
            .eq("coordinator_id", ctx.coordinatorId)
            .maybeSingle();
          if (!existing) return jsonError(404, "not_found", "Event not found");

          const patch: Record<string, unknown> = { ...parsed.data };
          Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
          const { data: row, error } = await admin
            .from("events")
            .update(patch)
            .eq("id", params.id)
            .select(EVENT_COLUMNS)
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
            .from("events")
            .select("id")
            .eq("id", params.id)
            .eq("coordinator_id", ctx.coordinatorId)
            .maybeSingle();
          if (!existing) return jsonError(404, "not_found", "Event not found");
          // Same soft-cancel as the coordinator UI's own delete (deleteMyEvent)
          // -- removed, not hard-deleted, so RSVPs/tickets keep referential
          // history and refunds can still process.
          const { error } = await admin
            .from("events")
            .update({ status: "removed", removed_at: new Date().toISOString() })
            .eq("id", params.id);
          if (error) return jsonError(500, "internal_error", error.message);
          return jsonOk({ data: { ok: true } });
        }),
    },
  },
});
