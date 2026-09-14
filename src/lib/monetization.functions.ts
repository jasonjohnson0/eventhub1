import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { siteOrigin } from "@/lib/site-url";
import { getStripe } from "@/lib/stripe.server";

/** Confirms the caller owns (or staffs) the ticket's event, for the refund
 *  endpoint. Same is_workspace_member pattern events.functions.ts uses. */
async function assertOwnsTicketEvent(
  // biome-ignore lint/suspicious/noExplicitAny: context.supabase's generic client type
  supabase: any,
  userId: string,
  purchaseId: string,
): Promise<{ eventId: string; coordinatorId: string }> {
  const { data: purchase, error } = await supabase
    .from("ticket_purchases")
    .select("event_id")
    .eq("id", purchaseId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!purchase) throw new Error("Purchase not found");
  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("coordinator_id")
    .eq("id", purchase.event_id)
    .maybeSingle();
  if (evErr) throw new Error(evErr.message);
  if (!event) throw new Error("Event not found");
  const { data: isMember } = await supabase.rpc("is_workspace_member", {
    _user_id: userId,
    _coord_id: event.coordinator_id,
  });
  if (!isMember) throw new Error("Not authorized to manage this event's tickets");
  return { eventId: purchase.event_id as string, coordinatorId: event.coordinator_id as string };
}

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

// biome-ignore lint/suspicious/noExplicitAny: event_tickets row shape, types regenerate post-migration
function effectiveUnitCents(tier: any): number {
  const now = new Date();
  const useEarlyBird =
    tier.early_bird &&
    tier.early_bird_price_cents != null &&
    (!tier.valid_from || new Date(tier.valid_from) <= now) &&
    (!tier.valid_until || new Date(tier.valid_until) >= now);
  return useEarlyBird ? tier.early_bird_price_cents : tier.price_cents;
}

/** Free tiers only (price_cents effectively 0, including an active
 *  early-bird price of 0). Paid tiers go through createTicketCheckout --
 *  this used to silently "confirm" a paid purchase with no Stripe charge
 *  behind it whenever the platform key wasn't configured; that demo path
 *  is gone. */
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
    const unit = effectiveUnitCents(tier);
    if (unit > 0) {
      throw new Error("This ticket requires payment — use checkout, not purchaseTicket");
    }
    if (tier.quantity_sold + data.quantity > tier.quantity_available) {
      throw new Error("Sold out");
    }
    const { data: purchase, error } = await sb
      .from("ticket_purchases")
      .insert({
        ticket_id: tier.id,
        event_id: tier.event_id,
        user_id: context.userId,
        quantity: data.quantity,
        amount_cents: 0,
        status: "confirmed",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await sb
      .from("event_tickets")
      .update({ quantity_sold: tier.quantity_sold + data.quantity })
      .eq("id", tier.id);
    return { purchase, checkout_url: null as string | null };
  });

/** Paid tiers. Reserves inventory (a 30-minute hold, race-safe against
 *  concurrent buyers via reserve_ticket's row lock), then starts a Stripe
 *  Checkout Session -- the webhook confirms the hold once Stripe reports
 *  payment succeeded (see api/stripe.webhook.ts). No charge happens on
 *  this page; the buyer is redirected to Stripe's hosted Checkout.
 *
 *  v1 uses the platform's own Stripe account (STRIPE_SECRET_KEY) for
 *  every coordinator -- there is no per-coordinator Stripe Connect account
 *  yet, so every dollar lands in the platform's Stripe, not the
 *  coordinator's. That's a real payout/business decision, not an
 *  implementation detail -- flagged in TEAMWORK.md, needs explicit
 *  sign-off before this runs with real (non-test-mode) cards. */
export const createTicketCheckout = createServerFn({ method: "POST" })
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
      .select("*, events!inner(id, title, coordinator_id, status)")
      .eq("id", data.ticket_id)
      .single();
    if (tErr || !tier) throw new Error(tErr?.message ?? "Ticket not found");
    if (tier.events.status !== "approved") {
      throw new Error("This event isn't open for ticket sales");
    }
    const unit = effectiveUnitCents(tier);
    if (unit <= 0) {
      throw new Error("This ticket is free — use purchaseTicket, not checkout");
    }
    const amount = unit * data.quantity;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as typeof sb;

    // Idempotent per (user, ticket): reuse an unexpired hold's session
    // rather than creating a second one on a duplicate click.
    const { data: existing } = await admin
      .from("ticket_purchases")
      .select("id, stripe_checkout_session_id, reserved_until")
      .eq("ticket_id", data.ticket_id)
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .gt("reserved_until", new Date().toISOString())
      .order("purchased_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.stripe_checkout_session_id) {
      const session = await getStripe().checkout.sessions.retrieve(
        existing.stripe_checkout_session_id,
      );
      if (session.status === "open" && session.url) {
        return { checkout_url: session.url };
      }
      // Session expired/completed server-side but our row hasn't caught up
      // yet (webhook lag) -- fall through and reserve a fresh hold.
    }

    const HOLD_MINUTES = 30;
    const { data: hold, error: holdErr } = await admin.rpc("reserve_ticket", {
      _ticket_id: data.ticket_id,
      _user_id: context.userId,
      _quantity: data.quantity,
      _amount_cents: amount,
      _hold_minutes: HOLD_MINUTES,
    });
    if (holdErr) throw new Error(holdErr.message);
    const purchase = Array.isArray(hold) ? hold[0] : hold;

    const { data: profile } = await admin
      .from("coordinator_profiles")
      .select("currency")
      .eq("coordinator_id", tier.events.coordinator_id)
      .maybeSingle();
    const currency = (profile?.currency ?? "USD").toLowerCase();

    const email = (context.claims as { email?: string } | null)?.email ?? undefined;
    let session: Awaited<ReturnType<ReturnType<typeof getStripe>["checkout"]["sessions"]["create"]>>;
    try {
      session = await getStripe().checkout.sessions.create({
        mode: "payment",
        customer_email: email,
        client_reference_id: context.userId,
        expires_at: Math.floor(Date.now() / 1000) + HOLD_MINUTES * 60,
        line_items: [
          {
            quantity: data.quantity,
            price_data: {
              currency,
              unit_amount: unit,
              product_data: {
                name: `${tier.events.title} — ${tier.name}`,
                description: tier.description ?? undefined,
              },
            },
          },
        ],
        metadata: {
          kind: "ticket_purchase",
          purchase_id: purchase.id,
          event_id: tier.events.id,
          coordinator_id: tier.events.coordinator_id,
        },
        success_url: `${siteOrigin()}/events/${tier.events.id}?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteOrigin()}/events/${tier.events.id}?purchase=canceled`,
      });
    } catch (err) {
      // Session creation failed -- release the hold rather than leaving a
      // pending row with no Checkout behind it eating inventory for 30 min.
      await admin.rpc("release_ticket_hold", { _purchase_id: purchase.id });
      throw err instanceof Error ? err : new Error("Could not start checkout");
    }

    if (!session.url) {
      await admin.rpc("release_ticket_hold", { _purchase_id: purchase.id });
      throw new Error("Stripe did not return a checkout URL");
    }

    await admin
      .from("ticket_purchases")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", purchase.id);

    return { checkout_url: session.url };
  });

/** Coordinator-initiated refund of a single confirmed purchase. Calls
 *  Stripe first (the source of truth for whether money actually moved),
 *  only marks the DB row refunded once Stripe confirms it -- the reverse
 *  order would let a refund "succeed" in our own records while the buyer
 *  never actually got their money back. */
export const refundTicketPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ purchase_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOwnsTicketEvent(context.supabase, context.userId, data.purchase_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const admin = supabaseAdmin as any;
    const { data: purchase, error } = await admin
      .from("ticket_purchases")
      .select("status, stripe_charge_id")
      .eq("id", data.purchase_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!purchase) throw new Error("Purchase not found");
    if (purchase.status === "refunded") return { ok: true, already_refunded: true };
    if (purchase.status !== "confirmed") {
      throw new Error(`Cannot refund a purchase that is ${purchase.status}`);
    }
    if (!purchase.stripe_charge_id) {
      throw new Error("No charge on record for this purchase — nothing to refund via Stripe");
    }
    const refund = await getStripe().refunds.create({
      payment_intent: purchase.stripe_charge_id,
    });
    const { error: markErr } = await admin.rpc("mark_ticket_refunded", {
      _purchase_id: data.purchase_id,
      _refund_stripe_id: refund.id,
    });
    if (markErr) throw new Error(markErr.message);
    return { ok: true, already_refunded: false };
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: RPC signature not in generated types yet
    const sb = supabaseAdmin as any;
    const { data: rows, error } = await sb.rpc("check_in_ticket", {
      _qr_token: data.qr_token,
      _actor_id: context.userId,
    });
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

/* ============================ EVENT-CANCEL REFUNDS ========================= */

/** Called from deleteMyEvent and adminRemoveEvent when an event with sold
 *  tickets gets cancelled/removed -- EventHub shouldn't hold money for an
 *  event that isn't happening. Paid confirmed purchases get a real Stripe
 *  refund + an email; free confirmed "purchases" just cancel, no Stripe
 *  call needed since no money moved. Never throws -- a refund failure
 *  here shouldn't block the coordinator from actually cancelling their
 *  event; failures are logged for follow-up instead, same tradeoff the
 *  webhook handler already makes. */
export async function autoRefundConfirmedTickets(
  eventId: string,
  eventTitle: string,
  eventStartTime: string,
): Promise<{ refunded: number; cancelled: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
  const admin = supabaseAdmin as any;
  const { data: purchases, error } = await admin
    .from("ticket_purchases")
    .select("id, user_id, amount_cents, stripe_charge_id")
    .eq("event_id", eventId)
    .eq("status", "confirmed");
  if (error) {
    console.error(`[auto-refund] could not list purchases for event ${eventId}:`, error.message);
    return { refunded: 0, cancelled: 0, failed: 0 };
  }

  let refunded = 0;
  let cancelled = 0;
  let failed = 0;
  const { sendPlatformEmails } = await import("@/lib/platform-mailer.server");
  const { ticketRefundTemplate } = await import("@/lib/email-templates");

  for (const p of purchases ?? []) {
    if (p.amount_cents > 0) {
      if (!p.stripe_charge_id) {
        console.error(`[auto-refund] purchase ${p.id} is paid/confirmed but has no charge id`);
        failed++;
        continue;
      }
      try {
        const refund = await getStripe().refunds.create({ payment_intent: p.stripe_charge_id });
        const { error: markErr } = await admin.rpc("mark_ticket_refunded", {
          _purchase_id: p.id,
          _refund_stripe_id: refund.id,
        });
        if (markErr) throw new Error(markErr.message);
        refunded++;
        const { data: userRes } = await admin.auth.admin.getUserById(p.user_id);
        const email = userRes?.user?.email;
        if (email) {
          const tpl = ticketRefundTemplate({
            event: { id: eventId, title: eventTitle, start_time: eventStartTime, location: null },
            amountCents: p.amount_cents,
            reason: "event_cancelled",
          });
          await sendPlatformEmails([{ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text }]);
        }
      } catch (err) {
        console.error(`[auto-refund] refund failed for purchase ${p.id}:`, err);
        failed++;
      }
    } else {
      const { error: cancelErr } = await admin
        .from("ticket_purchases")
        .update({ status: "cancelled" })
        .eq("id", p.id);
      if (cancelErr) {
        console.error(`[auto-refund] could not cancel free purchase ${p.id}:`, cancelErr.message);
        failed++;
      } else {
        cancelled++;
      }
    }
  }
  return { refunded, cancelled, failed };
}