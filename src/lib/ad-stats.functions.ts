import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** One sponsored placement and how it performed. */
export type AdStatRow = {
  slot_id: string;
  event_id: string;
  event_title: string;
  business_name: string;
  position: number;
  slot_type: string;
  starts_at: string | null;
  ends_at: string | null;
  /** Every view, including repeat views by the same person that day. */
  views: number;
  /** Distinct people. The number an advertiser will actually believe. */
  unique_viewers: number;
  clicks: number;
  unique_clickers: number;
  /** How much of the reach came from calendars embedded on other websites. */
  views_on_embeds: number;
};

export type BillingStatus = {
  coordinator_id: string;
  state: "free_sponsored" | "grace" | "free_no_fee" | "fee_due";
  reason: string;
  sponsored_enabled: boolean;
  active_sponsorships: number;
  monthly_fee_cents: number;
  amount_due_cents: number;
  grace_ends_at: string | null;
  grace_days_left: number;
  next_assessment_on: string;
};

const windowSchema = z.object({
  /** Defaults to a month, which is the period a sponsorship is sold in. */
  days: z.number().int().min(1).max(365).optional(),
  coordinator_id: z.string().uuid().optional(),
});

/**
 * Sponsor performance for a coordinator's own calendar.
 *
 * The coordinator id defaults to the caller. Passing one is for workspace staff
 * and admins; the RPC decides whether that is allowed, rather than this
 * function guessing -- one authority for the rule, in SQL, next to the data.
 */
export const getSponsorAdStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => windowSchema.parse(data ?? {}))
  .handler(async ({ data, context }): Promise<AdStatRow[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const { data: rows, error } = await (context.supabase as any).rpc("get_sponsor_ad_stats", {
      p_coordinator_id: data.coordinator_id ?? context.userId,
      p_days: data.days ?? 30,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as AdStatRow[];
  });

/** The same figures from the buying side, for someone who sponsored an event. */
export const getMySponsorshipStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => windowSchema.pick({ days: true }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const { data: rows, error } = await (context.supabase as any).rpc("get_my_sponsorship_stats", {
      p_days: data.days ?? 30,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<
      Omit<AdStatRow, "position" | "slot_type" | "views_on_embeds"> & { event_start: string }
    >;
  });

/** Whether this calendar is free this month, and why. */
export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => windowSchema.pick({ coordinator_id: true }).parse(data ?? {}))
  .handler(async ({ data, context }): Promise<BillingStatus | null> => {
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const { data: rows, error } = await (context.supabase as any).rpc(
      "get_coordinator_billing_status",
      { p_coordinator_id: data.coordinator_id ?? context.userId },
    );
    if (error) throw new Error(error.message);
    return ((rows ?? [])[0] as BillingStatus) ?? null;
  });

/**
 * Closes a month's billing across the platform.
 *
 * Nothing schedules this yet. Rather than leave enforcement inert until a cron
 * exists -- a rule nobody runs is not a rule -- it is exposed as an admin
 * action, so the month can be closed deliberately and the ledger is real from
 * the first month.
 *
 * Safe to press twice, or to press after a partly-failed run: the unique index
 * on (coordinator_id, period_month) means a coordinator cannot be billed for
 * the same month more than once. Whatever eventually automates this -- a cron,
 * an edge function -- inherits the same guarantee by calling the same function.
 */
export const closeBillingMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        /** YYYY-MM-01. Defaults to the month that just ended. */
        month: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    // The service role, because assess_all_coordinator_billing writes the
    // ledger for every coordinator, not just the caller's own.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const { data: rows, error } = await (supabaseAdmin as any).rpc(
      "assess_all_coordinator_billing",
      { p_month: data.month ?? null },
    );
    if (error) throw new Error(error.message);
    const row = (rows ?? [])[0] ?? { coordinators_billed: 0, total_cents: 0 };
    return {
      coordinators_billed: Number(row.coordinators_billed ?? 0),
      total_cents: Number(row.total_cents ?? 0),
    };
  });

export type AdminBillingRow = {
  coordinator_id: string;
  company_name: string | null;
  slug: string | null;
  email: string | null;
  state: BillingStatus["state"];
  sponsored_enabled: boolean;
  active_sponsorships: number;
  monthly_fee_cents: number;
  amount_due_cents: number;
  grace_ends_at: string | null;
  approved_events: number;
  /** Already invoiced and not settled — the figure you chase someone over. */
  unpaid_cents: number;
  has_billing_row: boolean;
};

/** Every coordinator's commercial position, for the admin side. */
export const adminListBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminBillingRow[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const { data, error } = await (context.supabase as any).rpc("get_all_coordinator_billing");
    if (error) throw new Error(error.message);
    return (data ?? []) as AdminBillingRow[];
  });

/**
 * Prices a coordinator, or takes them off a price.
 *
 * Runs through the caller's own client so the "Admins manage billing settings"
 * policy is what authorises it, rather than a second check here that could
 * drift from the policy. Upserts, because the normal state for an account
 * nobody has priced yet is no row at all.
 */
export const adminSetCoordinatorBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        coordinator_id: z.string().uuid(),
        /** Whole currency units, as typed into the form. */
        monthly_fee_cents: z.number().int().min(0).max(1_000_000),
        sponsored_enabled: z.boolean(),
        /** Extend or end the getting-started window. Null clears it. */
        grace_ends_at: z.string().datetime().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const row: Record<string, unknown> = {
      coordinator_id: data.coordinator_id,
      monthly_fee_cents: data.monthly_fee_cents,
      sponsored_enabled: data.sponsored_enabled,
    };
    if (data.grace_ends_at !== undefined) row.grace_ends_at = data.grace_ends_at;

    // biome-ignore lint/suspicious/noExplicitAny: grace_ends_at not in generated types yet
    const { error } = await (context.supabase as any)
      .from("coordinator_billing_settings")
      .upsert(row, { onConflict: "coordinator_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** The fee ledger: what has been invoiced, and whether it settled. */
export const adminListFeeLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The client is cast, not the table name: billing is in the generated types
    // but period_month is not, and casting the name defeats inference entirely.
    // biome-ignore lint/suspicious/noExplicitAny: column not in generated types yet
    const { data, error } = await (supabaseAdmin as any)
      .from("billing")
      .select("id, coordinator_id, amount_cents, status, period_month, description, created_at")
      .not("period_month", "is", null)
      .order("period_month", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      coordinator_id: string;
      amount_cents: number;
      status: string;
      period_month: string;
      description: string | null;
      created_at: string;
    }>;
  });
