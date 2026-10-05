import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { siteOrigin } from "@/lib/site-url";
import { isZip, quotePrice, type PricingRow, type SponsorScope } from "@/lib/sponsor-pricing";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = any;

const scopeEnum = z.enum(["event", "calendars", "network", "geo"]);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const httpsOrEmpty = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || /^https:\/\//i.test(v), { message: "Must start with https://" })
  .transform((v) => (v === "" ? null : v));

const targetingSchema = z.object({
  scope: scopeEnum,
  starts_on: dateStr,
  ends_on: dateStr,
  tz: z.string().min(1).max(64),
  event_id: z.string().uuid().nullable().default(null),
  calendar_ids: z.array(z.string().uuid()).max(200).default([]),
  center_zip: z.string().trim().nullable().default(null),
  radius_miles: z.number().int().min(1).max(100).nullable().default(null),
  zips: z.array(z.string().trim()).max(200).default([]),
});
type Targeting = z.infer<typeof targetingSchema>;

const draftSchema = targetingSchema.extend({
  id: z.string().uuid().nullable().default(null),
  contact_name: z.string().trim().max(120).default(""),
  contact_email: z.string().trim().max(254).default(""),
  creative: z.object({
    business_name: z.string().trim().min(1, "Business name is required").max(120),
    logo_url: httpsOrEmpty,
    link_url: httpsOrEmpty,
    headline: z.string().trim().max(120).default(""),
    body: z.string().trim().max(400).default(""),
  }),
});

function validateTargeting(t: Targeting) {
  if (t.ends_on < t.starts_on) throw new Error("End date must be on or after the start date.");
  if (t.scope === "event" && !t.event_id) throw new Error("Pick an event to sponsor.");
  if (t.scope === "calendars" && t.calendar_ids.length === 0) throw new Error("Pick at least one calendar.");
  if (t.scope === "geo") {
    const hasCenter = !!t.center_zip && !!t.radius_miles;
    if (!hasCenter && t.zips.length === 0) throw new Error("Enter a center ZIP and radius, or a list of ZIP codes.");
    if (t.center_zip && !isZip(t.center_zip)) throw new Error(`"${t.center_zip}" isn't a 5-digit ZIP code.`);
    const bad = t.zips.find((z) => !isZip(z));
    if (bad) throw new Error(`"${bad}" isn't a 5-digit ZIP code.`);
  }
}

async function requireAdmin(context: { supabase: Sb; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function loadPricing(sb: Sb): Promise<PricingRow[]> {
  const { data, error } = await sb.from("sponsor_pricing").select("scope, unit_cents, period, unit");
  if (error) throw new Error(error.message);
  return (data ?? []) as PricingRow[];
}

export type Quote = {
  price_cents: number;
  periods: number;
  units: number;
  calendars_reached: number;
  events_reached: number | null;
  unknown_zips: string[];
  pricing: PricingRow;
};

async function computeQuote(sb: Sb, t: Targeting): Promise<Quote> {
  validateTargeting(t);
  const pricing = (await loadPricing(sb)).find((p) => p.scope === t.scope);
  if (!pricing) throw new Error("Pricing is not configured for this option.");
  let calendars = 1;
  let events: number | null = null;
  let unknown: string[] = [];
  if (t.scope === "calendars") calendars = t.calendar_ids.length;
  if (t.scope === "geo") {
    const { data, error } = await sb.rpc("geo_reach", {
      p_center_zip: t.center_zip || null,
      p_radius_miles: t.center_zip ? t.radius_miles : null,
      p_zips: t.zips,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) ?? { calendars: 0, events: 0, unknown_zips: [] };
    calendars = row.calendars ?? 0;
    events = row.events ?? 0;
    unknown = row.unknown_zips ?? [];
  }
  const q = quotePrice(pricing, t.starts_on, t.ends_on, calendars);
  return {
    price_cents: q.cents,
    periods: q.periods,
    units: q.units,
    calendars_reached: calendars,
    events_reached: events,
    unknown_zips: unknown,
    pricing,
  };
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------
export const getSponsorPricing = createServerFn({ method: "GET" }).handler(async (): Promise<PricingRow[]> => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  return loadPricing(sb);
});

// ---------------------------------------------------------------------------
// Buyer
// ---------------------------------------------------------------------------
export const listTargetableCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ coordinator_id: string; name: string; slug: string }[]> => {
    // Only the public calendar name and address, same as the public calendar page shows.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as Sb)
      .from("coordinator_profiles")
      .select("coordinator_id, company_name, slug")
      .not("setup_completed_at", "is", null)
      .not("slug", "is", null)
      .order("company_name");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      coordinator_id: r.coordinator_id,
      name: r.company_name || r.slug,
      slug: r.slug,
    }));
  });

export const listTargetableEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as Sb)
      .from("events")
      .select("id, title, start_time, timezone")
      .eq("status", "approved")
      .eq("visibility", "public")
      .gte("end_time", new Date().toISOString())
      .order("start_time")
      .limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; title: string; start_time: string; timezone: string }[];
  });

export const quoteSponsorCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => targetingSchema.parse(d))
  .handler(async ({ data, context }) => computeQuote(context.supabase as Sb, data));

export const saveSponsorDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    validateTargeting(data);
    const sb = context.supabase as Sb;
    const row = {
      scope: data.scope,
      event_id: data.scope === "event" ? data.event_id : null,
      starts_on: data.starts_on,
      ends_on: data.ends_on,
      tz: data.tz,
      contact_name: data.contact_name || null,
      contact_email: data.contact_email || null,
    };
    let id = data.id;
    if (id) {
      const { data: upd, error } = await sb.from("sponsor_campaigns").update(row).eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!upd?.length) throw new Error("This sponsorship can no longer be edited.");
    } else {
      const { data: ins, error } = await sb
        .from("sponsor_campaigns")
        .insert({ ...row, buyer_user_id: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = ins.id as string;
    }
    const c = data.creative;
    const { error: cErr } = await sb.from("sponsor_campaign_creatives").upsert(
      {
        campaign_id: id,
        business_name: c.business_name,
        logo_url: c.logo_url,
        link_url: c.link_url,
        headline: c.headline || null,
        body: c.body || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campaign_id" },
    );
    if (cErr) throw new Error(cErr.message);

    await sb.from("sponsor_campaign_calendars").delete().eq("campaign_id", id);
    if (data.scope === "calendars") {
      const { error } = await sb
        .from("sponsor_campaign_calendars")
        .insert(data.calendar_ids.map((cid) => ({ campaign_id: id, coordinator_id: cid })));
      if (error) throw new Error(error.message);
    }
    await sb.from("sponsor_campaign_geo").delete().eq("campaign_id", id);
    if (data.scope === "geo") {
      const { error } = await sb.from("sponsor_campaign_geo").insert({
        campaign_id: id,
        center_zip: data.center_zip || null,
        radius_miles: data.center_zip ? data.radius_miles : null,
        zips: data.zips,
      });
      if (error) throw new Error(error.message);
    }
    return { id: id! };
  });

export type CampaignDetail = {
  id: string;
  scope: SponsorScope;
  status: string;
  event_id: string | null;
  starts_on: string;
  ends_on: string;
  tz: string;
  price_cents: number;
  paid_at: string | null;
  refunded_at: string | null;
  review_note: string | null;
  contact_name: string | null;
  contact_email: string | null;
  created_at: string;
  buyer_user_id: string;
  creative: {
    business_name: string;
    logo_url: string | null;
    link_url: string | null;
    headline: string | null;
    body: string | null;
  } | null;
  calendar_ids: string[];
  geo: { center_zip: string | null; radius_miles: number | null; zips: string[] } | null;
};

const detailSelect =
  "id, scope, status, event_id, starts_on, ends_on, tz, price_cents, paid_at, refunded_at, review_note, contact_name, contact_email, created_at, buyer_user_id, sponsor_campaign_creatives(business_name, logo_url, link_url, headline, body), sponsor_campaign_calendars(coordinator_id), sponsor_campaign_geo(center_zip, radius_miles, zips)";

function toDetail(r: any): CampaignDetail {
  const cr = Array.isArray(r.sponsor_campaign_creatives) ? r.sponsor_campaign_creatives[0] : r.sponsor_campaign_creatives;
  const geo = Array.isArray(r.sponsor_campaign_geo) ? r.sponsor_campaign_geo[0] : r.sponsor_campaign_geo;
  return {
    ...r,
    creative: cr ?? null,
    calendar_ids: (r.sponsor_campaign_calendars ?? []).map((k: any) => k.coordinator_id),
    geo: geo ?? null,
  };
}

export const listMyCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampaignDetail[]> => {
    const { data, error } = await (context.supabase as Sb)
      .from("sponsor_campaigns")
      .select(detailSelect)
      .eq("buyer_user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toDetail);
  });

export const getMyCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: row, error } = await sb.from("sponsor_campaigns").select(detailSelect).eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const { data: stats } = await sb.rpc("get_campaign_stats", { p_campaign_id: data.id });
    const s = (Array.isArray(stats) ? stats[0] : stats) ?? {};
    return {
      campaign: toDetail(row),
      stats: {
        views: Number(s.views ?? 0),
        unique_viewers: Number(s.unique_viewers ?? 0),
        clicks: Number(s.clicks ?? 0),
        unique_clickers: Number(s.unique_clickers ?? 0),
      },
    };
  });

export const deleteSponsorDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).from("sponsor_campaigns").delete().eq("id", data.id).eq("status", "draft");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createSponsorCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const sb = context.supabase as Sb;
    const { data: row, error } = await sb.from("sponsor_campaigns").select(detailSelect).eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row || row.buyer_user_id !== context.userId) throw new Error("Sponsorship not found.");
    const c = toDetail(row);
    if (c.status !== "draft" && c.status !== "pending_payment") throw new Error("This sponsorship has already been paid for.");
    if (!c.creative) throw new Error("Add your ad before paying.");

    // Re-quote on the server; the browser never sets the price.
    const quote = await computeQuote(sb, {
      scope: c.scope,
      starts_on: c.starts_on,
      ends_on: c.ends_on,
      tz: c.tz,
      event_id: c.event_id,
      calendar_ids: c.calendar_ids,
      center_zip: c.geo?.center_zip ?? null,
      radius_miles: c.geo?.radius_miles ?? null,
      zips: c.geo?.zips ?? [],
    });
    if (quote.unknown_zips.length) throw new Error(`ZIP not found: ${quote.unknown_zips.join(", ")}`);
    if (c.scope === "geo" && quote.calendars_reached === 0) {
      throw new Error("No calendars in that area carry local ads yet. Try a larger radius.");
    }
    if (quote.price_cents < 50) throw new Error("The price for this sponsorship is too low to charge.");

    const { getStripe } = await import("@/lib/stripe.server");
    const stripe = getStripe();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = siteOrigin();
    const email = (context.claims as { email?: string } | null)?.email ?? undefined;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: c.contact_email || email,
      client_reference_id: context.userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: quote.price_cents,
            product_data: {
              name: `Sponsorship: ${c.creative.business_name}`,
              description: `${c.scope} sponsorship, ${c.starts_on} to ${c.ends_on}`,
            },
          },
        },
      ],
      metadata: { kind: "sponsor_campaign", campaign_id: c.id },
      payment_intent_data: { metadata: { kind: "sponsor_campaign", campaign_id: c.id } },
      success_url: `${origin}/sponsorships/${c.id}?paid=1`,
      cancel_url: `${origin}/sponsorships/${c.id}?canceled=1`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");

    const { error: uErr } = await (supabaseAdmin as Sb)
      .from("sponsor_campaigns")
      .update({ status: "pending_payment", price_cents: quote.price_cents, stripe_checkout_session_id: session.id })
      .eq("id", c.id)
      .in("status", ["draft", "pending_payment"]);
    if (uErr) throw new Error(uErr.message);
    return { url: session.url };
  });

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const adminListCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CampaignDetail[]> => {
    await requireAdmin(context as any);
    const { data, error } = await (context.supabase as Sb)
      .from("sponsor_campaigns")
      .select(detailSelect)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toDetail);
  });

export const adminReviewCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject", "pause", "resume", "refund"]),
        note: z.string().trim().max(500).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as Sb;
    const { data: c, error } = await admin
      .from("sponsor_campaigns")
      .select("id, status, stripe_payment_intent_id, refunded_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Not found");

    const allowed: Record<string, string[]> = {
      approve: ["pending_review"],
      reject: ["pending_review", "active", "paused"],
      pause: ["active"],
      resume: ["paused"],
      refund: ["active", "paused", "ended", "pending_review"],
    };
    if (!allowed[data.action]!.includes(c.status)) throw new Error(`Can't ${data.action} a ${c.status} sponsorship.`);

    if ((data.action === "reject" || data.action === "refund") && c.stripe_payment_intent_id && !c.refunded_at) {
      const { getStripe } = await import("@/lib/stripe.server");
      await getStripe().refunds.create(
        { payment_intent: c.stripe_payment_intent_id },
        { idempotencyKey: `campaign-refund-${c.id}` },
      );
    }
    const next =
      data.action === "approve" ? "active"
      : data.action === "reject" ? "rejected"
      : data.action === "pause" ? "paused"
      : data.action === "resume" ? "active"
      : "refunded";
    const patch: Record<string, unknown> = {
      status: next,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };
    if (data.note) patch.review_note = data.note;
    if ((data.action === "reject" || data.action === "refund") && c.stripe_payment_intent_id && !c.refunded_at) {
      patch.refunded_at = new Date().toISOString();
    }
    const { error: uErr } = await admin.from("sponsor_campaigns").update(patch).eq("id", c.id);
    if (uErr) throw new Error(uErr.message);
    await admin.from("admin_audit_log").insert({
      admin_id: context.userId,
      action: `sponsor_campaign_${data.action}`,
      table_name: "sponsor_campaigns",
      record_id: c.id,
      change_details: { from: c.status, to: next, note: data.note || null },
    });
    return { ok: true, status: next };
  });

export const adminUpdatePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ scope: scopeEnum, unit_cents: z.number().int().min(0).max(10_000_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as Sb)
      .from("sponsor_pricing")
      .update({ unit_cents: data.unit_cents, updated_at: new Date().toISOString() })
      .eq("scope", data.scope);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminZipStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as any);
    const { count } = await (context.supabase as Sb).from("zip_centroids").select("zip", { count: "exact", head: true });
    return { count: count ?? 0 };
  });

const GAZETTEER_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip";

/** One-time, idempotent: downloads the Census ZCTA Gazetteer and upserts every
 *  ZIP centroid. Safe to run again (it just refreshes rows). */
export const adminImportZipCentroids = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context as any);
    const res = await fetch(GAZETTEER_URL);
    if (!res.ok) throw new Error(`Census download failed (${res.status})`);
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const name = Object.keys(files).find((n) => n.endsWith(".txt"));
    if (!name) throw new Error("Unexpected Census file format");
    const lines = strFromU8(files[name]!).split(/\r?\n/);
    const header = lines[0]!.split("\t").map((h) => h.trim());
    const iZip = header.indexOf("GEOID");
    const iLat = header.indexOf("INTPTLAT");
    const iLng = header.indexOf("INTPTLONG");
    if (iZip < 0 || iLat < 0 || iLng < 0) throw new Error("Unexpected Census columns");
    const rows: { zip: string; lat: number; lng: number }[] = [];
    for (const line of lines.slice(1)) {
      const p = line.split("\t");
      const zip = p[iZip]?.trim();
      const lat = Number(p[iLat]);
      const lng = Number(p[iLng]);
      if (zip && /^\d{5}$/.test(zip) && Number.isFinite(lat) && Number.isFinite(lng)) rows.push({ zip, lat, lng });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (let i = 0; i < rows.length; i += 2000) {
      const { error } = await (supabaseAdmin as Sb)
        .from("zip_centroids")
        .upsert(rows.slice(i, i + 2000), { onConflict: "zip" });
      if (error) throw new Error(error.message);
    }
    return { imported: rows.length };
  });

// ---------------------------------------------------------------------------
// Coordinator ad policy
// ---------------------------------------------------------------------------
export type AdSettings = {
  /** What the calendar has chosen. */
  ads_local: boolean;
  ads_network: boolean;
  /** What actually renders (a lapsed paid calendar with both off falls back). */
  effective_local: boolean;
  effective_network: boolean;
  is_paid: boolean;
};

export const getMyAdSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdSettings | null> => {
    const sb = context.supabase as Sb;
    const { data: row } = await sb
      .from("coordinator_profiles")
      .select("ads_local, ads_network")
      .eq("coordinator_id", context.userId)
      .maybeSingle();
    if (!row) return null;
    const [{ data: paid }, { data: eff }] = await Promise.all([
      sb.rpc("coordinator_is_paid", { _coordinator_id: context.userId }),
      sb.rpc("coordinator_effective_ads", { _coordinator_id: context.userId }),
    ]);
    const e = Array.isArray(eff) ? eff[0] : eff;
    return {
      ads_local: !!row.ads_local,
      ads_network: !!row.ads_network,
      effective_local: e ? !!e.local : !!row.ads_local,
      effective_network: e ? !!e.network : !!row.ads_network,
      is_paid: !!paid,
    };
  });

export const setMyAdFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ local: z.boolean(), network: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    if (!data.local && !data.network) {
      const { data: paid } = await sb.rpc("coordinator_is_paid", { _coordinator_id: context.userId });
      if (!paid) throw new Error("Free calendars must show local or network-wide ads (or both). Ad-free needs the paid plan.");
    }
    const { error } = await sb
      .from("coordinator_profiles")
      .update({ ads_local: data.local, ads_network: data.network })
      .eq("coordinator_id", context.userId);
    if (error) {
      throw new Error(
        /free calendar/i.test(error.message)
          ? "Free calendars must show local or network-wide ads (or both). Ad-free needs the paid plan."
          : error.message,
      );
    }
    return { ok: true };
  });

export const getCampaignsOnMyCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as Sb).rpc("get_campaigns_on_my_calendar", {
      p_coordinator_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      campaign_id: string;
      scope: SponsorScope;
      business_name: string;
      starts_on: string;
      ends_on: string;
      status: string;
    }[];
  });
