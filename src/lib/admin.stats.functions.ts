import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);
    const monthIso = startOfMonth.toISOString();

    const [allEvents, monthEvents, allUsers, slotsTotal, slotsFilled, revenueMonth, revenueAll] = await Promise.all([
      context.supabase.from("events").select("*", { count: "exact", head: true }).neq("status", "removed"),
      context.supabase.from("events").select("*", { count: "exact", head: true }).neq("status", "removed").gte("created_at", monthIso),
      context.supabase.from("profiles").select("*", { count: "exact", head: true }),
      context.supabase.from("sponsored_slots").select("*", { count: "exact", head: true }),
      context.supabase.from("sponsored_slots").select("*", { count: "exact", head: true }).eq("status", "paid"),
      context.supabase.from("billing").select("amount_cents").eq("status", "succeeded").gte("created_at", monthIso),
      context.supabase.from("billing").select("amount_cents").eq("status", "succeeded"),
    ]);

    const sum = (rows: { amount_cents: number }[] | null | undefined) =>
      (rows ?? []).reduce((acc, r) => acc + (r.amount_cents ?? 0), 0);

    return {
      events: { thisMonth: monthEvents.count ?? 0, allTime: allEvents.count ?? 0 },
      users: { allTime: allUsers.count ?? 0, mauPlaceholder: allUsers.count ?? 0 },
      revenueCents: { thisMonth: sum(revenueMonth.data), allTime: sum(revenueAll.data) },
      slots: {
        total: slotsTotal.count ?? 0,
        filled: slotsFilled.count ?? 0,
        fillRate: slotsTotal.count ? ((slotsFilled.count ?? 0) / slotsTotal.count) * 100 : 0,
      },
    };
  });

export const adminListEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ status: z.enum(["all", "approved", "removed", "draft"]).default("all") }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("events")
      .select("id, title, coordinator_id, status, start_time, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const coordIds = Array.from(new Set((rows ?? []).map((r) => r.coordinator_id)));
    const { data: profs } = coordIds.length
      ? await context.supabase.from("profiles").select("id, display_name").in("id", coordIds)
      : { data: [] as { id: string; display_name: string | null }[] };
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
    return (rows ?? []).map((r) => ({ ...r, coordinator_name: nameById.get(r.coordinator_id) ?? "Unknown" }));
  });

export const adminRemoveEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), reason: z.string().min(1).max(500) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("events")
      .update({
        status: "removed",
        removed_reason: data.reason,
        removed_by: context.userId,
        removed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: "remove_event",
      table_name: "events",
      record_id: data.id,
      change_details: { reason: data.reason },
    });
    return { ok: true };
  });

export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ search: z.string().max(200).optional() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }
    const rows = users.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      roles: rolesByUser.get(u.id) ?? ["user"],
    }));
    if (data.search) {
      const q = data.search.toLowerCase();
      return rows.filter((r) => r.email.toLowerCase().includes(q));
    }
    return rows;
  });

export const adminListAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("admin_audit_log")
      .select("id, admin_id, action, table_name, record_id, change_details, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminSponsorshipStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const [{ count: available }, { count: reserved }, { count: paid }, { count: expired }] = await Promise.all([
      context.supabase.from("sponsored_slots").select("*", { count: "exact", head: true }).eq("status", "available"),
      context.supabase.from("sponsored_slots").select("*", { count: "exact", head: true }).eq("status", "reserved"),
      context.supabase.from("sponsored_slots").select("*", { count: "exact", head: true }).eq("status", "paid"),
      context.supabase.from("sponsored_slots").select("*", { count: "exact", head: true }).eq("status", "expired"),
    ]);
    // Simple 6-month revenue placeholder derived from billing
    const months: { month: string; revenue: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      const { data } = await context.supabase
        .from("billing")
        .select("amount_cents")
        .eq("status", "succeeded")
        .gte("created_at", d.toISOString())
        .lt("created_at", next.toISOString());
      months.push({
        month: d.toLocaleString("en", { month: "short" }),
        revenue: (data ?? []).reduce((a, r) => a + (r.amount_cents ?? 0), 0) / 100,
      });
    }
    return {
      slots: {
        available: available ?? 0,
        reserved: reserved ?? 0,
        paid: paid ?? 0,
        expired: expired ?? 0,
      },
      revenueTrend: months,
    };
  });