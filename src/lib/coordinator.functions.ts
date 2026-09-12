import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/** The public face of a coordinator. Deliberately excludes contact_email,
 *  setup state and anything else a visitor has no business seeing. */
export type PublicCoordinator = {
  coordinator_id: string;
  slug: string;
  company_name: string | null;
  description: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  show_nearby_events: boolean;
};

// Same shape onboarding validates against, so a slug that can be claimed is a
// slug that can be resolved.
const slugSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/),
});

/**
 * Resolve a coordinator's public profile by slug.
 *
 * Goes through get_public_coordinator_profile() rather than selecting the
 * table. Production does not grant anon SELECT on coordinator_profiles -- the
 * repo's migrations say it does and the live database disagrees -- so a direct
 * select 404s every anonymous visitor. Granting the table would fix that and
 * overshare: RLS filters rows, not columns, so anon would also read
 * contact_email and custom_domain on every live profile.
 *
 * The function also enforces setup_completed_at IS NOT NULL, so a half-finished
 * onboarding is invisible by construction rather than by our remembering to
 * filter for it.
 */
export const getPublicCoordinator = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => slugSchema.parse(d))
  .handler(async ({ data }): Promise<PublicCoordinator | null> => {
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    const { data: rows, error } = await (supabase as any).rpc(
      "get_public_coordinator_profile",
      { p_slug: data.slug },
    );

    if (error) {
      console.error("getPublicCoordinator error", error);
      return null;
    }
    return ((rows as PublicCoordinator[] | null) ?? [])[0] ?? null;
  });
