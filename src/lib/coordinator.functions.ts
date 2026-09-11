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
 * Reads through the anon client rather than the service-role one, so the
 * "Public can view live coordinator profiles" policy
 * (setup_completed_at IS NOT NULL) does the gating. A half-finished onboarding
 * is therefore invisible here by construction rather than by our remembering to
 * filter for it.
 */
export const getPublicCoordinator = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => slugSchema.parse(d))
  .handler(async ({ data }): Promise<PublicCoordinator | null> => {
    const { data: row, error } = await supabase
      .from("coordinator_profiles")
      .select(
        "coordinator_id, slug, company_name, description, logo_url, favicon_url, primary_color, secondary_color",
      )
      .eq("slug", data.slug)
      .maybeSingle();

    if (error) {
      console.error("getPublicCoordinator error", error);
      return null;
    }
    return (row as PublicCoordinator | null) ?? null;
  });
