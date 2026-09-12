import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase } from "@/integrations/supabase/client";
import { geocodeAddress } from "@/queries/events";

export type Venue = {
  id: string;
  coordinator_id: string;
  name: string;
  address: string | null;
  /** Suite / unit / building, for an address shared by more than one venue. */
  unit: string | null;
  lat: number | null;
  lng: number | null;
  /** True once `address` has round-tripped through a real geocoder. */
  address_verified: boolean;
  /** The geocoder's own label for the matched address, if verified. */
  verified_label: string | null;
  capacity: number | null;
  phone: string | null;
  website: string | null;
  photo_url: string | null;
  parking_info: string | null;
  accessibility_info: string | null;
  created_at: string;
};

const venueInput = z.object({
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().max(300).optional().nullable(),
  unit: z.string().trim().max(60).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  capacity: z.number().int().min(0).max(1_000_000).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  website: z.string().trim().max(300).optional().nullable(),
  photo_url: z.string().trim().max(1000).optional().nullable(),
  parking_info: z.string().trim().max(1000).optional().nullable(),
  accessibility_info: z.string().trim().max(1000).optional().nullable(),
});

/**
 * A venue needs to actually be findable: either its address checks out
 * against a real geocoder, or someone has manually pinned coordinates.
 * Throws rather than silently saving a venue nobody's "near me" search
 * could ever match.
 */
async function resolveLocation(input: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): Promise<{
  lat: number | null;
  lng: number | null;
  address_verified: boolean;
  verified_label: string | null;
}> {
  const address = input.address?.trim() || null;
  const manualLat = input.lat ?? null;
  const manualLng = input.lng ?? null;

  if (address) {
    const hit = await geocodeAddress(address).catch(() => null);
    if (hit) {
      return {
        lat: manualLat ?? hit.latitude,
        lng: manualLng ?? hit.longitude,
        address_verified: true,
        verified_label: hit.label,
      };
    }
    if (manualLat != null && manualLng != null) {
      // Geocoding failed but someone pinned it by hand -- save it, just not
      // marked verified, so "near me" search can still find it honestly.
      return { lat: manualLat, lng: manualLng, address_verified: false, verified_label: null };
    }
    throw new Error(
      "We couldn't verify that address. Check it for typos, or enter latitude/longitude manually below.",
    );
  }

  if (manualLat != null && manualLng != null) {
    return { lat: manualLat, lng: manualLng, address_verified: false, verified_label: null };
  }

  throw new Error("A venue needs an address or manual coordinates so it can be found on the map.");
}

export const listVenues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Venue[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("venues")
      .select("*")
      .eq("coordinator_id", context.userId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as Venue[];
  });

export const searchVenues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().max(120) }).parse(d))
  .handler(async ({ data, context }): Promise<Venue[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    let query = sb.from("venues").select("*").eq("coordinator_id", context.userId);
    if (data.q) query = query.or(`name.ilike.%${data.q}%,address.ilike.%${data.q}%`);
    const { data: rows, error } = await query.order("name").limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Venue[];
  });

/**
 * Search venues across every coordinator, not just the caller's own -- venues
 * are public rows by design (a school gym or a county park doesn't belong to
 * whichever organizer typed it in first), so a coordinator creating an event
 * sees "this address is already a saved venue" even the first time they use
 * it. No auth required, same as the public calendar reads.
 */
export const searchVenuesPublic = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data }): Promise<Venue[]> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = supabase as any;
    const { data: rows, error } = await sb
      .from("venues")
      .select("*")
      .or(`name.ilike.%${data.q}%,address.ilike.%${data.q}%`)
      .order("name")
      .limit(20);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Venue[];
  });

export const createVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => venueInput.parse(d))
  .handler(async ({ data, context }): Promise<Venue> => {
    const location = await resolveLocation(data);
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("venues")
      .insert({ ...data, ...location, coordinator_id: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as Venue;
  });

export const updateVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => venueInput.partial().extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Venue> => {
    const { id, ...patch } = data;
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    let finalPatch: Record<string, unknown> = { ...patch };
    if ("address" in patch || "lat" in patch || "lng" in patch) {
      const { data: existing, error: readErr } = await sb
        .from("venues")
        .select("address, lat, lng")
        .eq("id", id)
        .eq("coordinator_id", context.userId)
        .maybeSingle();
      if (readErr) throw new Error(readErr.message);
      if (!existing) throw new Error("Venue not found");
      const location = await resolveLocation({
        address: "address" in patch ? patch.address : existing.address,
        lat: "lat" in patch ? patch.lat : existing.lat,
        lng: "lng" in patch ? patch.lng : existing.lng,
      });
      finalPatch = { ...finalPatch, ...location };
    }
    const { data: row, error } = await sb
      .from("venues")
      .update(finalPatch)
      .eq("id", id)
      .eq("coordinator_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as Venue;
  });

export const deleteVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { error } = await sb
      .from("venues")
      .delete()
      .eq("id", data.id)
      .eq("coordinator_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
