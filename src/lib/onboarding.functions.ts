import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  slug: string | null;
  custom_domain: string | null;
  email_provider: "lovable" | "sendgrid" | "postmark" | "mailgun" | "none";
  dns_records_acknowledged: boolean;
  setup_step: number;
  setup_completed_at: string | null;
  updated_at: string;
};

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color")
  .optional()
  .nullable();

const profileSchema = z.object({
  full_name: z.string().trim().max(120).optional().nullable(),
  contact_email: z.string().trim().email().max(254).optional().nullable().or(z.literal("")),
  company_name: z.string().trim().max(160).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  logo_url: z.string().trim().max(1000).optional().nullable(),
  favicon_url: z.string().trim().max(1000).optional().nullable(),
  primary_color: hex,
  secondary_color: hex,
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/, "3-40 chars: letters, numbers, hyphens")
    .optional()
    .nullable()
    .or(z.literal("")),
  custom_domain: z.string().trim().max(253).optional().nullable(),
  email_provider: z.enum(["lovable", "sendgrid", "postmark", "mailgun", "none"]).optional(),
  dns_records_acknowledged: z.boolean().optional(),
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
  .inputValidator((d) => z.object({ slug: z.string().trim().min(3).max(40) }).parse(d))
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
export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("coordinator_profiles")
      .update({ setup_step: 7, setup_completed_at: new Date().toISOString() })
      .eq("coordinator_id", context.userId)
      .select("slug")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, slug: (row?.slug as string | null) ?? null };
  });