import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withApiAuth, jsonOk, jsonError } from "@/lib/api-auth.server";

const EVENT_COLUMNS =
  "id, title, description, location, start_time, end_time, status, category, tags, event_format, virtual_link, timezone, visibility, created_at";

const createEventBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }),
  category: z
    .enum(["sports", "networking", "education", "social", "fundraiser", "workshop", "other"])
    .default("other"),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  timezone: z.string().min(1).max(100).optional(),
  visibility: z.enum(["public", "unlisted"]).default("public"),
});

export const Route = createFileRoute("/api/v1/events")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApiAuth(request, async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const { data, error } = await (supabaseAdmin as any)
            .from("events")
            .select(EVENT_COLUMNS)
            .eq("coordinator_id", ctx.coordinatorId)
            .neq("status", "removed")
            .order("start_time", { ascending: true });
          if (error) return jsonError(500, "internal_error", error.message);
          return jsonOk({ data: data ?? [] });
        }),

      POST: async ({ request }) =>
        withApiAuth(request, async (ctx) => {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return jsonError(422, "invalid_json", "Request body must be valid JSON");
          }
          const parsed = createEventBody.safeParse(body);
          if (!parsed.success) {
            return jsonError(422, "validation_error", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
          }
          if (new Date(parsed.data.end_time) <= new Date(parsed.data.start_time)) {
            return jsonError(422, "validation_error", "end_time must be after start_time");
          }
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const { data: row, error } = await (supabaseAdmin as any)
            .from("events")
            .insert({
              coordinator_id: ctx.coordinatorId,
              title: parsed.data.title,
              description: parsed.data.description ?? null,
              location: parsed.data.location ?? null,
              start_time: parsed.data.start_time,
              end_time: parsed.data.end_time,
              status: "approved",
              category: parsed.data.category,
              tags: parsed.data.tags,
              timezone: parsed.data.timezone,
              visibility: parsed.data.visibility,
            })
            .select(EVENT_COLUMNS)
            .single();
          if (error) return jsonError(500, "internal_error", error.message);
          return jsonOk({ data: row }, 201);
        }),
    },
  },
});
