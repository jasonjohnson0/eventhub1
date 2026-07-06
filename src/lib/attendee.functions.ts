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
    .select("coordinator_id")
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

export const getCapacityStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: ev, error } = await context.supabase
      .from("events")
      .select("max_capacity, has_waitlist")
      .eq("id", data.event_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ev) throw new Error("Event not found");
    const [{ count: going }, { count: waitlist }] = await Promise.all([
      context.supabase
        .from("event_rsvps")
        .select("*", { count: "exact", head: true })
        .eq("event_id", data.event_id)
        .eq("status", "going"),
      context.supabase
        .from("event_waitlist")
        .select("*", { count: "exact", head: true })
        .eq("event_id", data.event_id)
        .eq("status", "waitlisted"),
    ]);
    const current = going ?? 0;
    const max = ev.max_capacity ?? null;
    return {
      max,
      has_waitlist: ev.has_waitlist,
      current,
      remaining: max == null ? null : Math.max(0, max - current),
      waitlist_count: waitlist ?? 0,
      at_capacity: max != null && current >= max,
    };
  });

export const getRsvpCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const [{ count: going }, { count: interested }] = await Promise.all([
      context.supabase
        .from("event_rsvps")
        .select("*", { count: "exact", head: true })
        .eq("event_id", data.event_id)
        .eq("status", "going"),
      context.supabase
        .from("event_rsvps")
        .select("*", { count: "exact", head: true })
        .eq("event_id", data.event_id)
        .eq("status", "interested"),
    ]);
    return { going: going ?? 0, interested: interested ?? 0 };
  });

export const getAttendanceRate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
    const [{ count: rsvpCount }, { count: checkedIn }] = await Promise.all([
      context.supabase
        .from("event_rsvps")
        .select("*", { count: "exact", head: true })
        .eq("event_id", data.event_id)
        .eq("status", "going"),
      context.supabase
        .from("event_rsvps")
        .select("*", { count: "exact", head: true })
        .eq("event_id", data.event_id)
        .eq("status", "going")
        .not("checked_in_at", "is", null),
    ]);
    const rsvp = rsvpCount ?? 0;
    const ci = checkedIn ?? 0;
    return {
      rsvp_count: rsvp,
      checked_in_count: ci,
      rate: rsvp === 0 ? 0 : Math.round((ci / rsvp) * 100),
    };
  });

export const getWaitlistPosition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("event_waitlist")
      .select("position, status")
      .eq("event_id", data.event_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row || row.status !== "waitlisted") return { position: null as number | null };
    return { position: row.position };
  });

export const joinWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("event_waitlist")
      .select("id, position, status")
      .eq("event_id", data.event_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing && existing.status === "waitlisted") return { position: existing.position };

    const { data: last } = await context.supabase
      .from("event_waitlist")
      .select("position")
      .eq("event_id", data.event_id)
      .eq("status", "waitlisted")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (last?.position ?? 0) + 1;
    const { error } = await context.supabase
      .from("event_waitlist")
      .upsert(
        {
          event_id: data.event_id,
          user_id: context.userId,
          position: nextPosition,
          status: "waitlisted",
        },
        { onConflict: "event_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { position: nextPosition };
  });

export const leaveWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("event_waitlist")
      .delete()
      .eq("event_id", data.event_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const promoteFromWaitlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("max_capacity")
      .eq("id", data.event_id)
      .maybeSingle();
    if (!ev) throw new Error("Event not found");
    const { count: going } = await supabaseAdmin
      .from("event_rsvps")
      .select("*", { count: "exact", head: true })
      .eq("event_id", data.event_id)
      .eq("status", "going");
    if (ev.max_capacity != null && (going ?? 0) >= ev.max_capacity) {
      return { promoted: null as string | null };
    }
    const { data: next } = await supabaseAdmin
      .from("event_waitlist")
      .select("id, user_id, position")
      .eq("event_id", data.event_id)
      .eq("status", "waitlisted")
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!next) return { promoted: null };

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
      action: "waitlist_promote",
      table_name: "event_waitlist",
      record_id: next.id,
      change_details: { event_id: data.event_id, user_id: next.user_id, position: next.position },
    });
    return { promoted: next.user_id };
  });

export const markAttended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        event_id: z.string().uuid(),
        user_id: z.string().uuid(),
        attended: z.boolean().default(true),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
    const { error } = await context.supabase
      .from("event_rsvps")
      .update({ checked_in_at: data.attended ? new Date().toISOString() : null })
      .eq("event_id", data.event_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAttendees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rsvps, error } = await supabaseAdmin
      .from("event_rsvps")
      .select("user_id, status, checked_in_at, created_at")
      .eq("event_id", data.event_id)
      .in("status", ["going", "interested"])
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const byId = await loadUserDirectory(supabaseAdmin, (rsvps ?? []).map((r) => r.user_id));
    return (rsvps ?? []).map((r) => {
      const p = byId.get(r.user_id);
      return {
        user_id: r.user_id,
        name: p?.name ?? "Unknown",
        email: p?.email ?? "",
        status: r.status,
        checked_in_at: r.checked_in_at,
      };
    });
  });

export const exportRsvpList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ event_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("title")
      .eq("id", data.event_id)
      .maybeSingle();
    const { data: rsvps } = await supabaseAdmin
      .from("event_rsvps")
      .select("user_id, status, checked_in_at, created_at")
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: true });
    const byId = await loadUserDirectory(supabaseAdmin, (rsvps ?? []).map((r) => r.user_id));
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const rows = [
      ["Name", "Email", "Status", "Checked In At", "RSVP At"].map(escape).join(","),
      ...(rsvps ?? []).map((r) => {
        const p = byId.get(r.user_id);
        return [
          p?.name ?? "Unknown",
          p?.email ?? "",
          r.status,
          r.checked_in_at ?? "",
          r.created_at,
        ]
          .map((v) => escape(String(v)))
          .join(",");
      }),
    ];
    return {
      filename: `${(ev?.title ?? "event").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}_rsvps.csv`,
      csv: rows.join("\n"),
    };
  });

export const updateEventCapacity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        event_id: z.string().uuid(),
        max_capacity: z.number().int().positive().nullable(),
        has_waitlist: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertCoordinatorOrAdmin(context.supabase, context.userId, data.event_id);
    const { error } = await context.supabase
      .from("events")
      .update({ max_capacity: data.max_capacity, has_waitlist: data.has_waitlist })
      .eq("id", data.event_id);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: "event_capacity_update",
      table_name: "events",
      record_id: data.event_id,
      change_details: { max_capacity: data.max_capacity, has_waitlist: data.has_waitlist },
    });
    return { ok: true };
  });