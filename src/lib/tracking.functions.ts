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
    if (existing?.status === data.status) {
      // Toggle off
      const { error } = await context.supabase
        .from("event_rsvps")
        .delete()
        .eq("event_id", data.event_id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      newStatus = null;
    } else {
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

    const [{ count: going }, { count: interested }, { count: declined }] = await Promise.all([
      context.supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", data.event_id).eq("status", "going"),
      context.supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", data.event_id).eq("status", "interested"),
      context.supabase.from("event_rsvps").select("*", { count: "exact", head: true }).eq("event_id", data.event_id).eq("status", "declined"),
    ]);
    return {
      myRsvp: newStatus,
      counts: { going: going ?? 0, interested: interested ?? 0, declined: declined ?? 0 },
    };
  });