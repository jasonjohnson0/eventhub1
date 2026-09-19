import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeCustomCss } from "@/lib/sanitize-css";

export type CoordinatorProfile = {
  coordinator_id: string;
  full_name: string | null;
  contact_email: string | null;
  company_name: string | null;
  description: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  /** Coordinator-authored CSS, sanitized on write, injected after theme
   *  tokens on `/c/$slug` and `/api/embed/$slug` (P0 QA: presets alone
   *  can't express a font or layout tweak). Null/empty means none set. */
  custom_css: string | null;
  slug: string | null;
  custom_domain: string | null;
  email_provider: "lovable" | "sendgrid" | "postmark" | "mailgun" | "none";
  dns_records_acknowledged: boolean;
  /** Cross-promote other nearby organizers' events on this coordinator's own
   *  public calendar. On by default -- more for a visitor to discover, more
   *  reach for every organizer on the platform. Either side can opt out. */
  show_nearby_events: boolean;
  /** IANA zone (spec 03) -- defaults new one-off events' timezone picker. */
  timezone: string;
  setup_step: number;
  setup_completed_at: string | null;
  updated_at: string;
};

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color")
  .optional()
  .nullable();

// Shared with the client's own live-check in onboarding.tsx and settings.tsx.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

const profileSchema = z.object({
  full_name: z.string().trim().max(120).optional().nullable(),
  contact_email: z.string().trim().email().max(254).optional().nullable().or(z.literal("")),
  company_name: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  logo_url: z.string().trim().max(1000).optional().nullable(),
  favicon_url: z.string().trim().max(1000).optional().nullable(),
  primary_color: hex,
  secondary_color: hex,
  custom_css: z
    .string()
    .max(20000, "Keep custom CSS under 20,000 characters")
    .optional()
    .nullable()
    .transform((v) => (v ? sanitizeCustomCss(v) : v)),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, "3-40 chars: letters, numbers, hyphens")
    .optional()
    .nullable()
    .or(z.literal("")),
  custom_domain: z.string().trim().max(253).optional().nullable(),
  email_provider: z.enum(["lovable", "sendgrid", "postmark", "mailgun", "none"]).optional(),
  dns_records_acknowledged: z.boolean().optional(),
  show_nearby_events: z.boolean().optional(),
  setup_step: z.number().int().min(1).max(7).optional(),
});

/** Read (and lazily create) the signed-in coordinator's onboarding profile. */
export const getCoordinatorProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CoordinatorProfile> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("coordinator_profiles")
      .select("*")
      .eq("coordinator_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as CoordinatorProfile;

    const { data: created, error: insertError } = await sb
      .from("coordinator_profiles")
      .insert({
        coordinator_id: context.userId,
        contact_email: (context.claims as { email?: string } | null)?.email ?? null,
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);
    return created as CoordinatorProfile;
  });

/** Auto-save any subset of wizard fields. */
export const saveCoordinatorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => profileSchema.parse(d))
  .handler(async ({ data, context }): Promise<CoordinatorProfile> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      patch[k] = v === "" ? null : v;
    }
    if (Object.keys(patch).length === 0) {
      return (await getCoordinatorProfile()) as CoordinatorProfile;
    }
    const { data: row, error } = await sb
      .from("coordinator_profiles")
      .upsert({ coordinator_id: context.userId, ...patch }, { onConflict: "coordinator_id" })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("That address is already taken");
      throw new Error(error.message);
    }
    return row as CoordinatorProfile;
  });

export const checkSlugAvailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ slug: z.string().trim().toLowerCase().min(3).max(40).regex(SLUG_RE) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Slug availability is a server-side lookup; the RPC is no longer callable by clients.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = supabaseAdmin as any;
    const { data: ok, error } = await sb.rpc("is_slug_available", {
      _slug: data.slug,
      _coordinator_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { available: !!ok };
  });

/** Final step — marks the calendar live. */
// Must match the client's own check in onboarding.tsx, and is re-checked here
// because that is the only check that actually stops anything: the "Go live"
// button was never gated on the slug at all, so a coordinator could -- and
// one did -- complete onboarding with no calendar address and be told
// "Your calendar is live!" while /c/ had nothing to serve.
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: existing, error: readErr } = await sb
      .from("coordinator_profiles")
      .select("slug")
      .eq("coordinator_id", context.userId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!SLUG_RE.test((existing?.slug as string | null) ?? "")) {
      throw new Error(
        "Choose a calendar address before going live -- go back to the Address step.",
      );
    }

    const { data: row, error } = await sb
      .from("coordinator_profiles")
      .update({ setup_step: 7, setup_completed_at: new Date().toISOString() })
      .eq("coordinator_id", context.userId)
      .select("slug")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, slug: (row?.slug as string | null) ?? null };
  });

/**
 * Deletes the caller's own calendar (coordinator workspace) -- every event,
 * venue, organizer, series, billing record and submission queue entry
 * belonging to it, releasing its slug -- without touching the caller's
 * account. They keep their login; they just stop being a coordinator.
 * Requires the calendar's own address typed back as confirmation.
 *
 * A coordinator is the authority over their own calendar -- this does not
 * require the platform-wide admin role. The _coordinator_id passed to
 * delete_own_calendar() (a SECURITY DEFINER function granted only to
 * service_role) is always the caller's own id, never client-supplied, so
 * there is no path for one account to delete another's calendar through
 * this function regardless of role.
 */
export const deleteMyCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ confirm_slug: z.string().trim().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const { data: result, error } = await (supabaseAdmin as any).rpc("delete_own_calendar", {
      _coordinator_id: context.userId,
      _confirm_slug: data.confirm_slug,
    });
    if (error) throw new Error(error.message);
    const row = (result as { deleted_slug: string; deleted_events: number }[] | null)?.[0];
    return { ok: true, deleted_slug: row?.deleted_slug ?? null };
  });

/**
 * Changes a live calendar's address without touching anything else it owns
 * -- the lighter-weight sibling of deleteMyCalendar for the same "a slug is
 * stuck on a stale calendar" problem: re-slug it instead of deleting all its
 * data. The old address stops resolving the moment this commits (nothing
 * points at it anymore) and is immediately available for anyone else to
 * claim; the embed/WordPress snippets and /c/$slug link pick up the new one
 * on their next load, since they all read the profile live rather than
 * caching the slug anywhere. Same ownership scope as deleteMyCalendar -- a
 * coordinator is the authority over their own calendar's address, admin
 * role or not.
 */
export const updateCalendarSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ new_slug: z.string().trim().toLowerCase().min(3).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    if (!SLUG_RE.test(data.new_slug)) {
      throw new Error("3–40 characters, lowercase letters, numbers and hyphens");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const sb = supabaseAdmin as any;
    const { data: available, error: availErr } = await sb.rpc("is_slug_available", {
      _slug: data.new_slug,
      _coordinator_id: context.userId,
    });
    if (availErr) throw new Error(availErr.message);
    if (!available) throw new Error("That address is already taken");

    const { data: row, error } = await sb
      .from("coordinator_profiles")
      .update({ slug: data.new_slug })
      .eq("coordinator_id", context.userId)
      .select("slug")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("That address is already taken");
      throw new Error(error.message);
    }
    return { ok: true, slug: row.slug as string };
  });
