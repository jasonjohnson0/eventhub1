import { supabase } from "@/integrations/supabase/client";

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  category: string | null;
  image_url: string | null;
  going_count: number;
  organizers: string[];
  latitude: number | null;
  longitude: number | null;
};

export type EventFilters = {
  /** ISO string — only events ending at/after this moment */
  from?: string | null;
  /** ISO string — only events starting at/before this moment */
  to?: string | null;
  category?: string | null;
  /** free text over title/description/location */
  q?: string | null;
  /** substring match on location */
  location?: string | null;
  organizer?: string | null;
  /** Restrict to one coordinator's events. Drives per-coordinator pages and embeds. */
  coordinator?: string | null;
  limit?: number;
};

/* ---------- geo helpers ---------- */
export const RADIUS_OPTIONS = [5, 10, 25, 50] as const;

export function distanceMiles(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export type GeocodeResult = { label: string; latitude: number; longitude: number };

/** Geocode a free-form address or ZIP code (OpenStreetMap Nominatim). */
export async function geocodeAddress(input: string): Promise<GeocodeResult | null> {
  const q = input.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  const hit = rows[0];
  if (!hit) return null;
  return { label: hit.display_name, latitude: Number(hit.lat), longitude: Number(hit.lon) };
}

const sel = (s: string): string => s;

/**
 * Single source of truth for calendar event reads.
 * All views (Month / Week / Day / List / Agenda) go through this.
 */
export async function fetchEvents(filters: EventFilters = {}): Promise<CalendarEvent[]> {
  const limit = filters.limit ?? 300;
  let q = supabase
    .from("events")
    .select(sel("id, title, description, location, start_time, end_time, category"))
    .eq("status", "approved")
    .order("start_time", { ascending: true })
    .limit(limit);

  if (filters.from) q = q.gte("end_time", filters.from);
  if (filters.to) q = q.lte("start_time", filters.to);
  if (filters.category) q = q.eq("category", filters.category as never);
  if (filters.coordinator) q = q.eq("coordinator_id", filters.coordinator);
  if (filters.location) q = q.ilike("location", `%${filters.location.replace(/[%,]/g, "")}%`);

  type Row = {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    start_time: string;
    end_time: string;
    category: string | null;
  };
  const { data: rows, error } = await q.returns<Row[]>();
  if (error) throw new Error(error.message);
  const base = rows ?? [];
  const ids = base.map((r) => r.id);
  const enriched = await enrich(ids);

  let out: CalendarEvent[] = base.map((r) => ({
    ...r,
    image_url: enriched.images.get(r.id) ?? null,
    going_count: enriched.counts.get(r.id) ?? 0,
    organizers: enriched.organizers.get(r.id) ?? [],
    latitude: enriched.coords.get(r.id)?.lat ?? null,
    longitude: enriched.coords.get(r.id)?.lng ?? null,
  }));

  const text = filters.q?.trim().toLowerCase();
  if (text) {
    out = out.filter((e) =>
      `${e.title} ${e.description ?? ""} ${e.location ?? ""}`.toLowerCase().includes(text),
    );
  }
  if (filters.organizer) {
    out = out.filter((e) => e.organizers.includes(filters.organizer as string));
  }
  return out;
}

/** Events the signed-in user is registered for (RSVP going/interested). */
export async function fetchMyEvents(filters: EventFilters = {}): Promise<
  (CalendarEvent & { rsvp_status: string })[]
> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return [];

  const { data: rsvps, error } = await supabase
    .from("event_rsvps")
    .select("event_id, status")
    .eq("user_id", userId)
    .neq("status", "declined");
  if (error) throw new Error(error.message);
  const statusById = new Map((rsvps ?? []).map((r) => [r.event_id, r.status as string]));
  if (statusById.size === 0) return [];

  const all = await fetchEvents({ ...filters, limit: filters.limit ?? 500 });
  return all
    .filter((e) => statusById.has(e.id))
    .map((e) => ({ ...e, rsvp_status: statusById.get(e.id) as string }));
}

async function enrich(ids: string[]) {
  const images = new Map<string, string | null>();
  const counts = new Map<string, number>();
  const organizers = new Map<string, string[]>();
  const coords = new Map<string, { lat: number; lng: number }>();
  if (!ids.length) return { images, counts, organizers, coords };

  const [detailsRes, rsvpRes, orgRes, locRes] = await Promise.all([
    supabase.from("event_details").select("event_id, landscape_image_url, portrait_image_url").in("event_id", ids),
    // event_rsvps' own RLS only lets a caller read their own row (or an
    // event's staff/admin see everyone's), so a direct count here read as zero
    // for almost every visitor -- including signed-in attendees who are not
    // staff -- on the "going" badge shown across every calendar view. This RPC
    // returns the true aggregate for many events in one call, without exposing
    // who is attending any of them.
    // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
    (supabase as any).rpc("get_event_rsvp_counts_bulk", { p_event_ids: ids }),
    supabase.from("event_organizers").select("event_id, organizers(name)").in("event_id", ids),
    supabase.from("event_locations").select("event_id, latitude, longitude").in("event_id", ids),
  ]);

  for (const d of detailsRes.data ?? []) {
    images.set(d.event_id, d.landscape_image_url ?? d.portrait_image_url ?? null);
  }
  for (const r of (rsvpRes.data ?? []) as { event_id: string; going: number }[]) {
    counts.set(r.event_id, r.going);
  }
  for (const o of (orgRes.data ?? []) as { event_id: string; organizers: { name: string } | null }[]) {
    if (!o.organizers?.name) continue;
    organizers.set(o.event_id, [...(organizers.get(o.event_id) ?? []), o.organizers.name]);
  }
  for (const l of locRes.data ?? []) {
    if (l.latitude == null || l.longitude == null) continue;
    coords.set(l.event_id, { lat: Number(l.latitude), lng: Number(l.longitude) });
  }
  return { images, counts, organizers, coords };
}

export type NearbyEvent = {
  id: string;
  title: string;
  coordinator_id: string;
  start_time: string;
  location: string | null;
  category: string | null;
  distance_meters: number;
};

/**
 * Other coordinators' approved events near a point, via the search_events_nearby
 * RPC. Used for the opt-in "also happening nearby" cross-promotion on a
 * coordinator's own public calendar -- deliberately excludes that
 * coordinator's own events, since the calendar already shows those.
 */
export async function fetchNearbyEvents(opts: {
  lat: number;
  lng: number;
  radiusMiles?: number;
  excludeCoordinator: string;
  limit?: number;
}): Promise<NearbyEvent[]> {
  const radiusMeters = (opts.radiusMiles ?? 25) * 1609.34;
  // biome-ignore lint/suspicious/noExplicitAny: RPC not in generated types yet
  const { data, error } = await (supabase as any).rpc("search_events_nearby", {
    _lat: opts.lat,
    _lng: opts.lng,
    _radius_meters: radiusMeters,
    _limit: (opts.limit ?? 6) + 20, // headroom since the caller's own events get filtered out below
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as NearbyEvent[];
  return rows
    .filter((r) => r.coordinator_id !== opts.excludeCoordinator)
    .slice(0, opts.limit ?? 6);
}

/* ---------- shared date helpers used by the views ---------- */
export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}
export function fmtTime(iso: string | Date) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}