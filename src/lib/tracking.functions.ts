import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const recordShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        event_id: z.string().uuid(),
        platform: z.enum(["facebook", "twitter", "email", "link", "other"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("share_tracking").insert({
      event_id: data.event_id,
      user_id: context.userId,
      share_platform: data.platform,
    });
    if (error) throw new Error(error.message);
    const { count } = await context.supabase
      .from("share_tracking")
      .select("*", { count: "exact", head: true })
      .eq("event_id", data.event_id);
    return { ok: true, shares: count ?? 0 };
  });

export const recordClick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("click_tracking").insert({
      event_id: data.event_id,
      user_id: context.userId,
    });
    // Ignore duplicate (unique on event_id/user_id/click_date)
    if (error && !/duplicate key|unique constraint/i.test(error.message)) {
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const upsertRsvp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        event_id: z.string().uuid(),
        status: z.enum(["going", "interested", "declined"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("event_rsvps")
      .select("status")
      .eq("event_id", data.event_id)
      .eq("user_id", context.userId)
      .maybeSingle();

    let newStatus: "going" | "interested" | "declined" | null = data.status;
    let waitlisted = false;
    let waitlistPosition: number | null = null;

    // Load capacity settings
    const { data: ev } = await context.supabase
      .from("events")
      .select("max_capacity, has_waitlist")
      .eq("id", data.event_id)
      .maybeSingle();

    if (existing?.status === data.status) {
      // Toggle off
      const { error } = await context.supabase
        .from("event_rsvps")
        .delete()
        .eq("event_id", data.event_id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      newStatus = null;
      // A "going" seat opened up — promote next waitlisted user if any.
      if (existing?.status === "going" && ev?.max_capacity != null) {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: next } = await supabaseAdmin
            .from("event_waitlist")
            .select("id, user_id, position")
            .eq("event_id", data.event_id)
            .eq("status", "waitlisted")
            .order("position", { ascending: true })
            .limit(1)
            .maybeSingle();
          if (next) {
            await supabaseAdmin
              .from("event_rsvps")
              .upsert(
                { event_id: data.event_id, user_id: next.user_id, status: "going" },
                { onConflict: "event_id,user_id" },
              );
            await supabaseAdmin
              .from("event_waitlist")
              .update({ status: "promoted" })
              .eq("id", next.id);
            await supabaseAdmin.from("admin_audit_log").insert({
              admin_id: context.userId,
              action: "waitlist_auto_promote",
              table_name: "event_waitlist",
              record_id: next.id,
              change_details: { event_id: data.event_id, user_id: next.user_id },
            });
          }
        } catch {
          // best-effort promotion
        }
      }
    } else {
      // Enforce capacity on "going"
      if (data.status === "going" && ev?.max_capacity != null) {
        const { count: goingCount } = await context.supabase
          .from("event_rsvps")
          .select("*", { count: "exact", head: true })
          .eq("event_id", data.event_id)
          .eq("status", "going");
        const wasGoing = existing?.status === "going";
        const currentGoing = (goingCount ?? 0) - (wasGoing ? 1 : 0);
        if (currentGoing >= ev.max_capacity) {
          if (!ev.has_waitlist) {
            throw new Error("This event is at capacity");
          }
          // Auto-add to waitlist instead of RSVP
          const { data: last } = await context.supabase
            .from("event_waitlist")
            .select("position")
            .eq("event_id", data.event_id)
            .eq("status", "waitlisted")
            .order("position", { ascending: false })
            .limit(1)
            .maybeSingle();
          waitlistPosition = (last?.position ?? 0) + 1;
          const { error: wErr } = await context.supabase
            .from("event_waitlist")
            .upsert(
              {
                event_id: data.event_id,
                user_id: context.userId,
                position: waitlistPosition,
                status: "waitlisted",
              },
              { onConflict: "event_id,user_id" },
            );
          if (wErr) throw new Error(wErr.message);
          waitlisted = true;
          newStatus = existing?.status ?? null;
        }
      }
      if (!waitlisted) {
      const { error } = await context.supabase
        .from("event_rsvps")
        .upsert(
          {
            event_id: data.event_id,
            user_id: context.userId,
            status: data.status,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "event_id,user_id" },
        );
      if (error) throw new Error(error.message);
      }
    }

    const [{ count: going }, { count: interested }, { count: declined }] = await Promise.all([
      context.supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", data.event_id).eq("status", "going"),
      context.supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", data.event_id).eq("status", "interested"),
      context.supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", data.event_id).eq("status", "declined"),
    ]);
    return {
      myRsvp: newStatus,
      counts: { going: going ?? 0, interested: interested ?? 0, declined: declined ?? 0 },
      waitlisted,
      waitlistPosition,
    };
  });