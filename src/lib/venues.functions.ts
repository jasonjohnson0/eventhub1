import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Venue = {
  id: string;
  coordinator_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
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
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  capacity: z.number().int().min(0).max(1_000_000).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  website: z.string().trim().max(300).optional().nullable(),
  photo_url: z.string().trim().max(1000).optional().nullable(),
  parking_info: z.string().trim().max(1000).optional().nullable(),
  accessibility_info: z.string().trim().max(1000).optional().nullable(),
});

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

export const createVenue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => venueInput.parse(d))
  .handler(async ({ data, context }): Promise<Venue> => {
    // biome-ignore lint/suspicious/noExplicitAny: types regenerate post-migration
    const sb = context.supabase as any;
    const { data: row, error } = await sb
      .from("venues")
      .insert({ ...data, coordinator_id: context.userId })
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
    const { data: row, error } = await sb
      .from("venues")
      .update(patch)
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