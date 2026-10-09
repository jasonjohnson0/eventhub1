import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/** Just enough to render <head> and JSON-LD for a public event page --
 *  deliberately separate from the rich client-side fetch events.$id.tsx
 *  already does (RLS-respecting, RPC-heavy) so that fetch's behavior is
 *  untouched. Uses the plain anon client, same as that fetch and
 *  fetchEvents/listLiveCoordinators -- an approved, public event's title/
 *  time/location is already readable by anyone, so there's no reason for
 *  this to run as service-role. Returns nothing for an event that isn't
 *  public/approved, the same thing an anonymous visitor would see anyway,
 *  just available during SSR for crawlers. */
export const getEventMeta = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    // biome-ignore lint/suspicious/noExplicitAny: extended columns not yet in generated types
    const sb = supabase as any;
    const { data: ev } = await sb
      .from("events")
      .select(
        "id, title, description, location, start_time, end_time, category, status, visibility, coordinator_id",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (!ev || ev.status !== "approved" || ev.visibility === "unlisted") return null;

    const [{ data: details }, { data: profile }] = await Promise.all([
      sb
        .from("event_details")
        .select("landscape_image_url, portrait_image_url, metadata")
        .eq("event_id", data.id)
        .maybeSingle(),
      sb.from("profiles").select("display_name").eq("id", ev.coordinator_id).maybeSingle(),
    ]);

    return {
      id: ev.id as string,
      title: ev.title as string,
      description: (ev.description as string | null) ?? null,
      location: (ev.location as string | null) ?? null,
      start_time: ev.start_time as string,
      end_time: ev.end_time as string,
      category: (ev.category as string | null) ?? null,
      coordinatorName: (profile?.display_name as string | null) ?? null,
      image: (details?.landscape_image_url ?? details?.portrait_image_url ?? null) as
        | string
        | null,
      imageAlt: ((details?.metadata as { image_alt_text?: string } | null)?.image_alt_text as
        | string
        | undefined) ?? null,
    };
  });
