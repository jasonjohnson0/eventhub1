import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============================== TICKET TIERS ============================== */

export const listTicketTiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("event_tickets")
      .select("*")
      .eq("event_id", data.event_id)
      .order("price_cents", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      event_id: string;
      name: string;
      description: string | null;
      price_cents: number;
      quantity_available: number;
      quantity_sold: number;
      early_bird: boolean;
      early_bird_price_cents: number | null;
      valid_from: string | null;
      valid_until: string | null;
    }>;
  });

export const createTicketTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional().nullable(),
        price_cents: z.number().int().min(0),
        quantity_available: z.number().int().min(1).max(100000),
        early_bird: z.boolean().default(false),
        early_bird_price_cents: z.number().int().min(0).nullable().optional(),
        valid_from: z.string().datetime({ offset: true }).nullable().optional(),
        valid_until: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("event_tickets")
      .insert({
        event_id: data.event_id,
        name: data.name,
        description: data.description ?? null,
        price_cents: data.price_cents,
        quantity_available: data.quantity_available,
        early_bird: data.early_bird,
        early_bird_price_cents: data.early_bird_price_cents ?? null,
        valid_from: data.valid_from ?? null,
        valid_until: data.valid_until ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTicketTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ticket_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { error } = await sb.from("event_tickets").delete().eq("id", data.ticket_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ================================ PURCHASE ================================ */

export const purchaseTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(10).default(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: tier, error: tErr } = await sb
      .from("event_tickets")
      .select("*")
      .eq("id", data.ticket_id)
      .single();
    if (tErr || !tier) throw new Error(tErr?.message ?? "Ticket not found");
    if (tier.quantity_sold + data.quantity > tier.quantity_available) {
      throw new Error("Sold out");
    }
    const now = new Date();
    const useEarlyBird =
      tier.early_bird &&
      tier.early_bird_price_cents != null &&
      (!tier.valid_from || new Date(tier.valid_from) <= now) &&
      (!tier.valid_until || new Date(tier.valid_until) >= now);
    const unit = useEarlyBird ? tier.early_bird_price_cents : tier.price_cents;
    const amount = unit * data.quantity;
    // Gate on the platform Stripe Connect account configured in admin setup.
    const { data: cfg } = await sb
      .from("platform_config")
      .select("stripe_connect_account_id, stripe_connected")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const hasStripe =
      Boolean(cfg?.stripe_connected && cfg?.stripe_connect_account_id) &&
      Boolean(process.env.STRIPE_SECRET_KEY);
    if (amount > 0 && !cfg?.stripe_connect_account_id) {
      throw new Error("Stripe not configured. Please complete setup first.");
    }
    const { data: purchase, error } = await sb
      .from("ticket_purchases")
      .insert({
        ticket_id: tier.id,
        event_id: tier.event_id,
        user_id: context.userId,
        quantity: data.quantity,
        amount_cents: amount,
        status: hasStripe ? "pending" : "confirmed",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await sb
      .from("event_tickets")
      .update({ quantity_sold: tier.quantity_sold + data.quantity })
      .eq("id", tier.id);
    return {
      purchase,
      stripe_configured: hasStripe,
      message: hasStripe
        ? "Purchase pending — Stripe charge would happen here"
        : "Stripe not configured. Purchase recorded as demo.",
    };
  });

export const listMyPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    let q = sb
      .from("ticket_purchases")
      .select("id, ticket_id, event_id, quantity, amount_cents, status, qr_token, check_in_count, purchased_at")
      .eq("user_id", context.userId)
      .order("purchased_at", { ascending: false });
    if (data.event_id) q = q.eq("event_id", data.event_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ================================ QR CODES ================================ */

function qrImageUrl(token: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(token)}`;
}

export const generateQrCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ purchase_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("ticket_purchases")
      .select("qr_token, user_id, quantity, check_in_count")
      .eq("id", data.purchase_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Purchase not found");
    if (row.user_id !== context.userId) throw new Error("Forbidden");
    return {
      token: row.qr_token,
      image_url: qrImageUrl(row.qr_token),
      quantity: row.quantity,
      check_in_count: row.check_in_count,
    };
  });

export const checkInViaQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ qr_token: z.string().min(8).max(128) }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const sb = context.supabase as any;
    const { data: rows, error } = await sb.rpc("check_in_ticket", { _qr_token: data.qr_token });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("Check-in failed");
    return row as {
      purchase_id: string;
      event_id: string;
      user_id: string;
      check_in_count: number;
      quantity: number;
      ticket_name: string;
    };
  });

/* ================================= PHOTOS ================================= */

export const uploadEventPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        event_id: z.string().uuid(),
        photo_url: z.string().url().max(2000),
        caption: z.string().max(500).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("event_photos")
      .insert({
        event_id: data.event_id,
        uploaded_by: context.userId,
        photo_url: data.photo_url,
        caption: data.caption ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getEventPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: rows, error } = await sb
      .from("event_photos")
      .select("id, photo_url, caption, uploaded_at, uploaded_by")
      .eq("event_id", data.event_id)
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      photo_url: string;
      caption: string | null;
      uploaded_at: string;
      uploaded_by: string;
    }>;
  });

export const deleteEventPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ photo_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { error } = await sb.from("event_photos").delete().eq("id", data.photo_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =============================== ANALYTICS ================================ */

export type EventAnalyticsRow = {
  event_id: string;
  title: string;
  coordinator_id: string;
  start_time: string;
  max_capacity: number | null;
  view_count: number;
  rsvp_going: number;
  rsvp_interested: number;
  rsvp_declined: number;
  rsvp_waitlist: number;
  ticket_revenue_cents: number;
  check_ins: number;
  attendance_rate_pct: number;
};

export const getEventAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: view not in generated types yet
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("event_analytics")
      .select("*")
      .eq("event_id", data.event_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Event not found");
    // Views-over-time series from click_tracking (last 14 days, per day)
    const { data: clicks } = await sb
      .from("click_tracking")
      .select("clicked_at")
      .eq("event_id", data.event_id)
      .gte("clicked_at", new Date(Date.now() - 14 * 86400_000).toISOString());
    const daily = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      daily.set(d.toISOString().slice(0, 10), 0);
    }
    for (const c of (clicks ?? []) as Array<{ clicked_at: string }>) {
      const key = c.clicked_at.slice(0, 10);
      if (daily.has(key)) daily.set(key, (daily.get(key) ?? 0) + 1);
    }
    const series = Array.from(daily.entries()).map(([date, count]) => ({ date, count }));
    return { analytics: row as EventAnalyticsRow, viewsSeries: series };
  });

export const getCoordinatorAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: view not in generated types yet
    const sb = context.supabase as any;
    let q = sb.from("event_analytics").select("*").eq("coordinator_id", context.userId);
    if (data.from) q = q.gte("start_time", data.from);
    if (data.to) q = q.lte("start_time", data.to);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as EventAnalyticsRow[];
    const total_revenue_cents = list.reduce((s, r) => s + Number(r.ticket_revenue_cents ?? 0), 0);
    const total_views = list.reduce((s, r) => s + r.view_count, 0);
    const total_going = list.reduce((s, r) => s + r.rsvp_going, 0);
    const total_check_ins = list.reduce((s, r) => s + r.check_ins, 0);
    const avg_attendance_pct =
      total_going === 0 ? 0 : Math.round((total_check_ins / total_going) * 1000) / 10;
    const most_viewed = list.length
      ? list.reduce((a, b) => (b.view_count > a.view_count ? b : a))
      : null;
    return {
      events: list,
      total_revenue_cents,
      total_views,
      total_going,
      total_check_ins,
      avg_attendance_pct,
      most_viewed,
    };
  });