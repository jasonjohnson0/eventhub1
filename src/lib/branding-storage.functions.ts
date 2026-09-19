import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Matches supabase/migrations/20260919153218_header_image_and_branding_quota.sql. */
export const BRANDING_TOTAL_QUOTA_BYTES = 12 * 1024 * 1024;
export const BRANDING_PER_FILE_CAP_BYTES = 2 * 1024 * 1024;

export type BrandingHeaderImage = {
  path: string;
  size_bytes: number;
  created_at: string;
  url: string;
};

export type BrandingStorageUsage = {
  used_bytes: number;
  total_bytes: number;
  header_images: BrandingHeaderImage[];
};

/**
 * Everything a coordinator has stored in their own branding folder --
 * logo, favicon, and every header image they've uploaded -- with a fresh
 * signed URL per header image so the settings page can offer a real
 * "switch back to one you already uploaded" picker without re-uploading.
 *
 * Server-side (service-role) rather than the client listing its own
 * folder directly: one reliable place to compute total usage against the
 * same 12 MB the database trigger enforces, rather than trusting the
 * client to sum bytes correctly.
 */
export const getBrandingStorageUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BrandingStorageUsage> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    const { data: files, error } = await supabaseAdmin.storage.from("branding").list(uid, {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) throw new Error(error.message);

    const all = files ?? [];
    const used_bytes = all.reduce((sum, f) => sum + (f.metadata?.size ?? 0), 0);
    const headerFiles = all.filter((f) => f.name.startsWith("header-"));

    const header_images: BrandingHeaderImage[] = [];
    for (const f of headerFiles) {
      const path = `${uid}/${f.name}`;
      const { data: signed } = await supabaseAdmin.storage
        .from("branding")
        .createSignedUrl(path, 60 * 60);
      if (!signed?.signedUrl) continue;
      header_images.push({
        path,
        size_bytes: f.metadata?.size ?? 0,
        created_at: f.created_at ?? new Date().toISOString(),
        url: signed.signedUrl,
      });
    }

    return { used_bytes, total_bytes: BRANDING_TOTAL_QUOTA_BYTES, header_images };
  });

/**
 * Mints the long-lived (1 year, same as onboarding.tsx's logo/favicon
 * uploads) signed URL for a header image the coordinator just picked as
 * active, so coordinator_profiles.header_image_url doesn't go stale the
 * way the short 1-hour listing URLs above would.
 */
export const activateHeaderImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    // The path must live in the caller's own folder -- storage RLS already
    // guarantees this for the object itself, but signed-URL minting has no
    // RLS of its own, so this is the one place that has to check by hand.
    if (!data.path.startsWith(`${uid}/`)) {
      throw new Error("Not your file");
    }
    const { data: signed, error } = await supabaseAdmin.storage
      .from("branding")
      .createSignedUrl(data.path, 60 * 60 * 24 * 365);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Could not activate image");

    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const { error: updateErr } = await (supabaseAdmin as any)
      .from("coordinator_profiles")
      .update({ header_image_url: signed.signedUrl })
      .eq("coordinator_id", uid);
    if (updateErr) throw new Error(updateErr.message);

    return { url: signed.signedUrl };
  });

/** Deletes one header image and clears header_image_url if it was the active one. */
export const deleteHeaderImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    if (!data.path.startsWith(`${uid}/`)) {
      throw new Error("Not your file");
    }
    const { error } = await supabaseAdmin.storage.from("branding").remove([data.path]);
    if (error) throw new Error(error.message);

    // Clearing header_image_url only when it actually pointed at the file
    // just deleted -- a signed URL embeds the path, so a substring match is
    // exact enough here without parsing the URL.
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const { data: profile } = await (supabaseAdmin as any)
      .from("coordinator_profiles")
      .select("header_image_url")
      .eq("coordinator_id", uid)
      .maybeSingle();
    const activeUrl = (profile as { header_image_url?: string | null } | null)?.header_image_url;
    if (activeUrl?.includes(encodeURIComponent(data.path).replace(/%2F/g, "/")) || activeUrl?.includes(data.path)) {
      // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
      await (supabaseAdmin as any)
        .from("coordinator_profiles")
        .update({ header_image_url: null })
        .eq("coordinator_id", uid);
    }

    return { ok: true };
  });
