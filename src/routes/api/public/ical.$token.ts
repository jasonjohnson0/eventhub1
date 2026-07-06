import { createFileRoute } from "@tanstack/react-router";
import { buildIcs } from "@/lib/distribution.functions";

export const Route = createFileRoute("/api/public/ical/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "").replace(/\.ics$/i, "").trim();
        if (!token || token.length < 16 || !/^[a-f0-9-]+$/i.test(token)) {
          return new Response("Invalid token", { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
        const { data, error } = await (supabaseAdmin as any).rpc("get_ical_feed_events", {
          _token: token,
        });
        if (error) {
          console.error("ical feed rpc error", error);
          return new Response(`Server error: ${error.message}`, { status: 500 });
        }
        const events = (data ?? []) as Array<{
          id: string;
          title: string;
          description: string | null;
          location: string | null;
          start_time: string;
          end_time: string;
          event_format: string | null;
          virtual_link: string | null;
        }>;
        const ics = buildIcs("EventHub — My events", events);
        return new Response(ics, {
          status: 200,
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `inline; filename="eventhub-${token.slice(0, 8)}.ics"`,
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});