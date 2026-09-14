import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadUserDirectory } from "@/lib/attendee.functions";

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
    const ev = await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
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

    // Deliver through the provider configured in /admin/setup, logging each
    // attempt to email_sends (spec 07) rather than only the invitation's own
    // sent_at/opened_at/clicked_at columns.
    const { sendAndLogEmails } = await import("@/lib/platform-mailer.server");
    const { invitationTemplate } = await import("@/lib/email-templates");
    // An invitation link has to be absolute -- there is no page for a relative
    // URL to resolve against in an inbox. The fallback was lovable.app, which
    // after the move to Vercel points at a deployment we no longer promote.
    // Set PUBLIC_SITE_URL once a custom domain is attached and this stops
    // mattering.
    const { siteOrigin } = await import("@/lib/site-url");
    const base = siteOrigin() || "https://eventhub1-eight.vercel.app";
    const entries = (inserted ?? []).map((inv) => {
      const tpl = invitationTemplate({
        event: {
          id: ev.id,
          title: ev.title,
          start_time: ev.start_time,
          location: ev.location ?? null,
        },
        invitationUrl: `${base}/invite/${inv.token}`,
        customMessage: data.custom_message ?? null,
      });
      return {
        message: { to: inv.recipient_email, subject: tpl.subject, html: tpl.html, text: tpl.text },
        log: {
          coordinator_id: ev.coordinator_id as string,
          event_id: data.event_id,
          invitation_id: inv.id,
          type: "invitation" as const,
        },
      };
    });
    const delivery = await sendAndLogEmails(entries);
    return {
      queued: inserted?.length ?? 0,
      invitations: inserted ?? [],
      sent: delivery.sent,
      failed: delivery.failed,
      provider: delivery.provider,
      errors: delivery.errors,
    };
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
    const ev = await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
    const { data: rsvps } = await context.supabase
      .from("event_rsvps")
      .select("user_id")
      .eq("event_id", data.event_id)
      .in("status", ["going", "interested"]);
    const targets = Array.from(new Set((rsvps ?? []).map((r) => r.user_id)));
    if (targets.length === 0) return { sent: 0, simulated: 0, failed: 0, skipped: 0 };

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

    // Spec 07: this used to be the whole implementation -- an in-app row and
    // nothing else, despite the compose box implying a real email went out.
    // Now it actually emails, in addition to keeping the in-app copy.
    const { updateTemplate } = await import("@/lib/email-templates");
    const { sendAndLogEmails, logEmailSends } = await import("@/lib/platform-mailer.server");
    const directory = await loadUserDirectory(supabaseAdmin, targets);
    const tpl = updateTemplate({
      event: { id: ev.id as string, title: ev.title as string, start_time: ev.start_time as string, location: (ev.location as string | null) ?? null },
      message: data.message,
    });
    const entries: { message: { to: string; subject: string; html: string; text: string }; log: { coordinator_id: string; event_id: string; type: "announcement" | "update"; recipient_user_id: string } }[] = [];
    const skippedRows: Parameters<typeof logEmailSends>[0] = [];
    for (const uid of targets) {
      const email = directory.get(uid)?.email;
      if (!email) {
        skippedRows.push({
          coordinator_id: ev.coordinator_id as string,
          event_id: data.event_id,
          invitation_id: null,
          type: data.type,
          recipient_email: "",
          recipient_user_id: uid,
          subject: tpl.subject,
          provider: null,
          provider_message_id: null,
          status: "skipped",
          error: "No email on file",
          sent_at: null,
        });
        continue;
      }
      entries.push({
        message: { to: email, subject: tpl.subject, html: tpl.html, text: tpl.text },
        log: { coordinator_id: ev.coordinator_id as string, event_id: data.event_id, type: data.type, recipient_user_id: uid },
      });
    }
    await logEmailSends(skippedRows);
    const delivery = entries.length
      ? await sendAndLogEmails(entries)
      : { sent: 0, simulated: 0, failed: 0, errors: [] as string[], provider: null };
    return { sent: delivery.sent, simulated: delivery.simulated, failed: delivery.failed, skipped: skippedRows.length, errors: delivery.errors };
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

/** Unified email log (spec 07): every attempted send, across invitations,
 *  announcements, updates and reminders, for the requesting coordinator's
 *  own events. Reads through the authenticated client -- RLS on
 *  `email_sends` already scopes this to `coordinator_id = auth.uid()`, so
 *  there's no separate ownership check to get wrong here. `event_id` is an
 *  optional narrowing filter, not a security boundary: passing someone
 *  else's event id just returns zero rows, the same as any other id that
 *  isn't this coordinator's own. */
export const listEmailSends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        event_id: z.string().uuid().optional(),
        type: z.enum(["invitation", "announcement", "update", "reminder"]).optional(),
        status: z
          .enum(["queued", "sent", "failed", "skipped", "simulated", "bounced", "complained"])
          .optional(),
        search: z.string().trim().max(254).optional(),
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
    let query = (context.supabase as any)
      .from("email_sends")
      .select(
        "id, event_id, invitation_id, type, recipient_email, subject, provider, status, error, sent_at, opened_at, clicked_at, created_at",
      )
      .eq("coordinator_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.event_id) query = query.eq("event_id", data.event_id);
    if (data.type) query = query.eq("type", data.type);
    if (data.status) query = query.eq("status", data.status);
    if (data.search) query = query.ilike("recipient_email", `%${data.search}%`);
    if (data.from) query = query.gte("created_at", data.from);
    if (data.to) query = query.lte("created_at", data.to);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      event_id: string | null;
      invitation_id: string | null;
      type: "invitation" | "announcement" | "update" | "reminder";
      recipient_email: string;
      subject: string | null;
      provider: string | null;
      status: "queued" | "sent" | "failed" | "skipped" | "simulated" | "bounced" | "complained";
      error: string | null;
      sent_at: string | null;
      opened_at: string | null;
      clicked_at: string | null;
      created_at: string;
    }>;
  });

function reminderOffsetLabel(startTimeIso: string, scheduledForIso: string): "7d" | "1d" | "1h" {
  const diffMs = new Date(startTimeIso).getTime() - new Date(scheduledForIso).getTime();
  if (diffMs >= 6 * 24 * 3600 * 1000) return "7d";
  if (diffMs >= 20 * 3600 * 1000) return "1d";
  return "1h";
}

/** Drains due `user_notifications` rows of type `reminder` -- actually
 *  emails them (spec 07's headline gap: `scheduleReminders` only ever wrote
 *  rows, nothing drained them) and stamps `sent_at` so a row is never sent
 *  twice. Not a `createServerFn`: this runs from `/api/cron/email-reminders`
 *  on the service-role client, not from an authenticated user's browser, so
 *  it's a plain exported function the route handler calls directly. */
export async function drainDueEmailReminders(
  limit = 200,
): Promise<{ sent: number; simulated: number; failed: number; skipped: number; attempted: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // biome-ignore lint/suspicious/noExplicitAny: table not in generated types yet
  const admin = supabaseAdmin as any;
  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from("user_notifications")
    .select("id, user_id, event_id, scheduled_for")
    .eq("type", "reminder")
    .is("sent_at", null)
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  if (!due || due.length === 0) return { sent: 0, simulated: 0, failed: 0, skipped: 0, attempted: 0 };

  const eventIds = Array.from(new Set<string>(due.map((r: { event_id: string }) => r.event_id)));
  const { data: events } = await admin
    .from("events")
    .select("id, coordinator_id, title, start_time, location")
    .in("id", eventIds);
  const eventById = new Map(
    (events ?? []).map((e: { id: string }) => [e.id, e]),
  ) as Map<string, { id: string; coordinator_id: string; title: string; start_time: string; location: string | null }>;

  const userIds = Array.from(new Set<string>(due.map((r: { user_id: string }) => r.user_id)));
  const directory = await loadUserDirectory(admin, userIds);
  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("user_id, email_reminders")
    .in("user_id", userIds);
  const optedOut = new Set(
    (prefs ?? [])
      .filter((p: { email_reminders: boolean }) => p.email_reminders === false)
      .map((p: { user_id: string }) => p.user_id),
  );

  const { reminderTemplate } = await import("@/lib/email-templates");
  const { sendAndLogEmails, logEmailSends } = await import("@/lib/platform-mailer.server");

  const entries: Parameters<typeof sendAndLogEmails>[0] = [];
  const skippedRows: Parameters<typeof logEmailSends>[0] = [];
  const attemptedIds: string[] = [];

  for (const row of due as Array<{ id: string; user_id: string; event_id: string; scheduled_for: string }>) {
    const ev = eventById.get(row.event_id);
    if (!ev) continue; // event deleted since scheduling -- nothing to remind about, nothing to log
    const skip = (reason: string, email = "") => {
      skippedRows.push({
        coordinator_id: ev.coordinator_id,
        event_id: ev.id,
        invitation_id: null,
        type: "reminder",
        recipient_email: email,
        recipient_user_id: row.user_id,
        subject: null,
        provider: null,
        provider_message_id: null,
        status: "skipped",
        error: reason,
        sent_at: null,
      });
      attemptedIds.push(row.id);
    };
    if (optedOut.has(row.user_id)) {
      skip("email_reminders disabled");
      continue;
    }
    const email = directory.get(row.user_id)?.email;
    if (!email) {
      skip("No email on file");
      continue;
    }
    const tpl = reminderTemplate({
      event: { id: ev.id, title: ev.title, start_time: ev.start_time, location: ev.location },
      when: reminderOffsetLabel(ev.start_time, row.scheduled_for),
    });
    entries.push({
      message: { to: email, subject: tpl.subject, html: tpl.html, text: tpl.text },
      log: { coordinator_id: ev.coordinator_id, event_id: ev.id, type: "reminder", recipient_user_id: row.user_id },
    });
    attemptedIds.push(row.id);
  }

  await logEmailSends(skippedRows);
  const result = entries.length
    ? await sendAndLogEmails(entries)
    : { sent: 0, simulated: 0, failed: 0, errors: [] as string[], provider: null };

  if (attemptedIds.length > 0) {
    await admin
      .from("user_notifications")
      .update({ sent_at: new Date().toISOString() })
      .in("id", attemptedIds);
  }

  return {
    sent: result.sent,
    simulated: result.simulated,
    failed: result.failed,
    skipped: skippedRows.length,
    attempted: attemptedIds.length,
  };
}