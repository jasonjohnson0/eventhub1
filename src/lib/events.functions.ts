import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const isoDate = z.string().datetime({ offset: true });

export const listMyEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Coordinator sees events they own, plus events of coordinators whose staff they are.
    const { data: staff } = await context.supabase
      .from("workspace_staff")
      .select("coordinator_id")
      .eq("staff_user_id", context.userId)
      .not("accepted_at", "is", null);
    const coordinatorIds = [context.userId, ...(staff ?? []).map((s) => s.coordinator_id)];
    const { data, error } = await context.supabase
      .from("events")
      .select("id, title, description, location, start_time, end_time, status, coordinator_id")
      .in("coordinator_id", coordinatorIds)
      .neq("status", "removed")
      .order("start_time", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(4000).optional().nullable(),
        location: z.string().max(300).optional().nullable(),
        start_time: isoDate,
        end_time: isoDate,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const nowIso = new Date().toISOString();
    const { data: activeBans } = await context.supabase
      .from("bans")
      .select("id, reason, expires_at")
      .eq("scope", "user")
      .eq("target_user_id", context.userId)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .limit(1);
    if (activeBans && activeBans.length > 0) {
      throw new Error(`You are banned from creating events: ${activeBans[0].reason ?? "no reason provided"}`);
    }
    const { data: row, error } = await context.supabase
      .from("events")
      .insert({
        coordinator_id: context.userId,
        title: data.title,
        description: data.description ?? null,
        location: data.location ?? null,
        start_time: data.start_time,
        end_time: data.end_time,
        status: "approved",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const rescheduleEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ id: z.string().uuid(), start_time: isoDate, end_time: isoDate }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("events")
      .update({ start_time: data.start_time, end_time: data.end_time })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: ev, error } = await context.supabase
      .from("events")
      .select("id, title, description, location, start_time, end_time, status, coordinator_id, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ev) throw new Error("Event not found");

    const { data: details } = await context.supabase
      .from("event_details")
      .select("landscape_image_url, portrait_image_url, metadata")
      .eq("event_id", data.id)
      .maybeSingle();

    const [{ count: rsvpGoing }, { count: rsvpInterested }, { count: rsvpDeclined }, { count: shareCount }, { count: clickCount }] =
      await Promise.all([
        context.supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", data.id).eq("status", "going"),
        context.supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", data.id).eq("status", "interested"),
        context.supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", data.id).eq("status", "declined"),
        context.supabase.from("share_tracking").select("*", { count: "exact", head: true }).eq("event_id", data.id),
        context.supabase
          .from("click_tracking")
          .select("*", { count: "exact", head: true })
          .eq("event_id", data.id)
          .gte("clicked_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);

    const { data: myRsvp } = await context.supabase
      .from("event_rsvps")
      .select("status")
      .eq("event_id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: slots } = await context.supabase
      .from("sponsored_slots")
      .select("id, position, slot_type, status, cost_cents")
      .eq("event_id", data.id)
      .order("position");

    return {
      event: ev,
      details,
      counts: {
        going: rsvpGoing ?? 0,
        interested: rsvpInterested ?? 0,
        declined: rsvpDeclined ?? 0,
        shares: shareCount ?? 0,
        clicksLast24h: clickCount ?? 0,
      },
      myRsvp: myRsvp?.status ?? null,
      slots: slots ?? [],
      isCoordinator: ev.coordinator_id === context.userId,
    };
  });

export const listEventCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    if (data.ids.length === 0) return {} as Record<string, { rsvps: number; shares: number }>;
    const [rsvps, shares] = await Promise.all([
      context.supabase.from("event_rsvps").select("event_id").in("event_id", data.ids),
      context.supabase.from("share_tracking").select("event_id").in("event_id", data.ids),
    ]);
    const acc: Record<string, { rsvps: number; shares: number }> = {};
    for (const id of data.ids) acc[id] = { rsvps: 0, shares: 0 };
    for (const r of rsvps.data ?? []) if (acc[r.event_id]) acc[r.event_id].rsvps += 1;
    for (const s of shares.data ?? []) if (acc[s.event_id]) acc[s.event_id].shares += 1;
    return acc;
  });