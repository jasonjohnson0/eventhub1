import { createFileRoute } from "@tanstack/react-router";
import { withApiAuth, jsonOk, jsonError } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/v1/me")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withApiAuth(request, async (ctx) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
          const { data: profile } = await (supabaseAdmin as any)
            .from("coordinator_profiles")
            .select("slug, company_name, timezone, currency")
            .eq("coordinator_id", ctx.coordinatorId)
            .maybeSingle();
          if (!profile) return jsonError(404, "not_found", "Coordinator profile not found");
          return jsonOk({
            coordinator_id: ctx.coordinatorId,
            slug: profile.slug,
            company_name: profile.company_name,
            timezone: profile.timezone,
            currency: profile.currency,
          });
        }),
    },
  },
});
