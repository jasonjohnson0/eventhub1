import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const categoryEnum = z.enum([
  "sports",
  "networking",
  "education",
  "social",
  "fundraiser",
  "workshop",
  "other",
]);

export const searchEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        query: z.string().max(200).optional().default(""),
        categories: z.array(categoryEnum).optional().default([]),
        startDate: z.string().datetime({ offset: true }).optional().nullable(),
        endDate: z.string().datetime({ offset: true }).optional().nullable(),
        latitude: z.number().optional().nullable(),
        longitude: z.number().optional().nullable(),
        radiusMiles: z.number().positive().max(500).optional().nullable(),
        limit: z.number().int().positive().max(100).optional().default(50),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Distance search path: use RPC then filter in-memory
    if (data.latitude != null && data.longitude != null && data.radiusMiles) {
      const meters = data.radiusMiles * 1609.34;
      const { data: rows, error } = await context.supabase.rpc("search_events_nearby", {
        _lat: data.latitude,
        _lng: data.longitude,
        _radius_meters: meters,
        _limit: data.limit,
      });
      if (error) throw new Error(error.message);
      const q = data.query.trim().toLowerCase();
      return (rows ?? []).filter((r) => {
        if (data.categories.length && !data.categories.includes(r.category)) return false;
        if (data.startDate && new Date(r.start_time) < new Date(data.startDate)) return false;
        if (data.endDate && new Date(r.start_time) > new Date(data.endDate)) return false;
        if (q && !(r.title.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q))) return false;
        return true;
      });
    }

    let qb = context.supabase
      .from("events")
      .select("id, title, description, location, start_time, end_time, status, coordinator_id, category, tags")
      .eq("status", "approved")
      .order("start_time", { ascending: true })
      .limit(data.limit);

    if (data.query.trim()) {
      const q = data.query.trim().replace(/[%,]/g, "");
      qb = qb.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
    }
    if (data.categories.length) qb = qb.in("category", data.categories);
    if (data.startDate) qb = qb.gte("start_time", data.startDate);
    if (data.endDate) qb = qb.lte("start_time", data.endDate);

    const { data: rows, error } = await qb;
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({ ...r, latitude: null, longitude: null, distance_meters: null }));
  });

export const getEventsByCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ category: categoryEnum, limit: z.number().int().positive().max(100).default(20) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("events")
      .select("id, title, description, location, start_time, end_time, status, category, tags")
      .eq("status", "approved")
      .eq("category", data.category)
      .order("start_time", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getCategoryCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("events")
      .select("category")
      .eq("status", "approved");
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  });

export const getMapEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("event_locations")
      .select("event_id, location_name, latitude, longitude, events!inner(id,title,start_time,category,status,location)")
      .eq("events.status", "approved");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.event_id,
      title: r.events.title,
      start_time: r.events.start_time,
      category: r.events.category,
      location: r.events.location,
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
    }));
  });

export const updateEventLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        eventId: z.string().uuid(),
        locationName: z.string().min(1).max(300),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("event_locations")
      .upsert(
        {
          event_id: data.eventId,
          location_name: data.locationName,
          latitude: data.latitude,
          longitude: data.longitude,
        },
        { onConflict: "event_id" },
      )
      .select("id, event_id, location_name, latitude, longitude, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateEventCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ eventId: z.string().uuid(), category: categoryEnum }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("events")
      .update({ category: data.category })
      .eq("id", data.eventId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateEventTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ eventId: z.string().uuid(), tags: z.array(z.string().min(1).max(40)).max(20) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("events")
      .update({ tags: data.tags })
      .eq("id", data.eventId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });