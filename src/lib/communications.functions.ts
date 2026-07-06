import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertCoordinatorOrAdmin(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  eventId: string,
) {
  const { data: ev, error } = await supabase
    .from("events")
    .select("id, coordinator_id, title, start_time, location")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!ev) throw new Error("Event not found");
  if (ev.coordinator_id === userId) return ev;
  const { data: staff } = await supabase
    .from("workspace_staff")
    .select("id")
    .eq("coordinator_id", ev.coordinator_id)
    .eq("staff_user_id", userId)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (staff) return ev;
  const { data: isAdmin } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
  return ev;
}

const emailSchema = z.string().email().max(254);

export const sendEventInvitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        event_id: z.string().uuid(),
        emails: z.array(emailSchema).min(1).max(500),
        custom_message: z.string().max(2000).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
    const rows = Array.from(new Set(data.emails.map((e) => e.toLowerCase()))).map((email) => ({
      event_id: data.event_id,
      sent_by: context.userId,
      recipient_email: email,
      custom_message: data.custom_message ?? null,
    }));
    const { data: inserted, error } = await context.supabase
      .from("event_invitations")
      .upsert(rows, { onConflict: "event_id,recipient_email", ignoreDuplicates: false })
      .select("id, recipient_email, token");
    if (error) throw new Error(error.message);
    return { queued: inserted?.length ?? 0, invitations: inserted ?? [] };
  });

export const listEventInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
    const { data: rows, error } = await context.supabase
      .from("event_invitations")
      .select("id, recipient_email, sent_at, opened_at, clicked_at, rsvp_status")
      .eq("event_id", data.event_id)
      .order("sent_at", { ascending: false });
    if (error) throw new Error(error.message);
    const stats = {
      total: rows?.length ?? 0,
      opened: (rows ?? []).filter((r) => r.opened_at).length,
      clicked: (rows ?? []).filter((r) => r.clicked_at).length,
      responded: (rows ?? []).filter((r) => r.rsvp_status !== "pending").length,
    };
    return { rows: rows ?? [], stats };
  });

export const trackEmailOpen = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ token: z.string().min(10).max(120) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("event_invitations")
      .update({ opened_at: new Date().toISOString() })
      .eq("token", data.token)
      .is("opened_at", null);
    return { ok: true };
  });

export const trackEmailClick = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ token: z.string().min(10).max(120) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: row } = await supabaseAdmin
      .from("event_invitations")
      .update({ clicked_at: now, opened_at: now })
      .eq("token", data.token)
      .select("event_id")
      .maybeSingle();
    return { ok: true, event_id: row?.event_id ?? null };
  });

export const scheduleReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        event_id: z.string().uuid(),
        user_ids: z.array(z.string().uuid()).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ev = await assertCoordinatorOrAdmin(
      context.supabase,
      context.userId,
      data.event_id,
    );
    let targets = data.user_ids;
    if (!targets || targets.length === 0) {
      const { data: rsvps } = await context.supabase
        .from("event_rsvps")
        .select("user_id")
        .eq("event_id", data.event_id)
        .eq("status", "going");
      targets = (rsvps ?? []).map((r) => r.user_id);
    }
    if (targets.length === 0) return { scheduled: 0 };

    const start = new Date(ev.start_time as string).getTime();
    const offsets: Array<{ ms: number; label: string }> = [
      { ms: 7 * 24 * 3600 * 1000, label: "7d" },
      { ms: 24 * 3600 * 1000, label: "1d" },
      { ms: 3600 * 1000, label: "1h" },
    ];
    const rows: Array<{
      user_id: string;
      event_id: string;
      type: "reminder";
      scheduled_for: string;
    }> = [];
    for (const uid of targets) {
      for (const off of offsets) {
        const at = new Date(start - off.ms);
        if (at.getTime() <= Date.now()) continue;
        rows.push({
          user_id: uid,
          event_id: data.event_id,
          type: "reminder",
          scheduled_for: at.toISOString(),
        });
      }
    }
    if (rows.length === 0) return { scheduled: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_notifications").insert(rows);
    if (error) throw new Error(error.message);
    return { scheduled: rows.length };
  });

export const sendEventAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        event_id: z.string().uuid(),
        message: z.string().min(1).max(2000),
        type: z.enum(["announcement", "update"]).default("announcement"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
    const { data: rsvps } = await context.supabase
      .from("event_rsvps")
      .select("user_id")
      .eq("event_id", data.event_id)
      .in("status", ["going", "interested"]);
    const targets = Array.from(new Set((rsvps ?? []).map((r) => r.user_id)));
    if (targets.length === 0) return { sent: 0 };
    const now = new Date().toISOString();
    const rows = targets.map((uid) => ({
      user_id: uid,
      event_id: data.event_id,
      type: data.type,
      custom_message: data.message,
      scheduled_for: now,
      sent_at: now,
    }));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_notifications").insert(rows);
    if (error) throw new Error(error.message);
    return { sent: rows.length };
  });

export const getUserNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: row } = await context.supabase
      .from("notification_preferences")
      .select("email_reminders, push_reminders, days_before")
      .eq("user_id", context.userId)
      .maybeSingle();
    return (
      row ?? {
        email_reminders: true,
        push_reminders: false,
        days_before: [1, 7],
      }
    );
  });

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        email_reminders: z.boolean(),
        push_reminders: z.boolean(),
        days_before: z.array(z.number().int().min(0).max(60)).max(6),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: context.userId,
          email_reminders: data.email_reminders,
          push_reminders: data.push_reminders,
          days_before: data.days_before,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_notifications")
      .select("id, event_id, type, custom_message, scheduled_for, sent_at, read_at")
      .eq("user_id", context.userId)
      .order("scheduled_for", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });