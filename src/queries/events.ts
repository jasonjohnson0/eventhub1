import { supabase } from "@/integrations/supabase/client";
import { safeTimeZone } from "@/lib/timezone";

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
  /** IANA zone the event is scheduled in (spec 03) -- what "6pm" means on
   *  the coordinator's own calendar, not the viewer's browser zone. */
  timezone: string;
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
    .select(sel("id, title, description, location, start_time, end_time, category, timezone"))
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
    timezone: string | null;
  };
  const { data: rows, error } = await q.returns<Row[]>();
  if (error) throw new Error(error.message);
  const base = rows ?? [];
  const ids = base.map((r) => r.id);
  const enriched = await enrich(ids);

  let out: CalendarEvent[] = base.map((r) => ({
    ...r,
    timezone: safeTimeZone(r.timezone),
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
/** Formats a time. With no `timeZone`, this is the viewer's own browser zone
 *  (the old, pre-spec-03 behavior, still used by call sites that don't yet
 *  carry an event's zone). Pass an event's `timezone` to render the time the
 *  way it actually reads on that event's own calendar -- spec 03's rule:
 *  "Saturday 6pm" means 6pm in that event's zone, not a silent conversion to
 *  whoever's looking. `abbr: true` appends the zone abbreviation, e.g. "6:00
 *  PM CDT" -- used where there's room (event page, list rows), not on a
 *  one-line month chip. */
export function fmtTime(iso: string | Date, timeZone?: string, opts: { abbr?: boolean } = {}) {
  const zone = timeZone ? safeTimeZone(timeZone) : undefined;
  const base = new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(zone ? { timeZone: zone } : {}),
  });
  if (!opts.abbr || !zone) return base;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(
    new Date(iso),
  );
  const abbr = parts.find((p) => p.type === "timeZoneName")?.value;
  return abbr ? `${base} ${abbr}` : base;
}

/** Local calendar dates (each a Date at local midnight) this event occupies,
 *  for calendar-view rendering. A short overnight event that just spills
 *  past midnight (a 10pm-1am show) still reads as one night's event, not
 *  two days on the calendar: "genuinely multi-day" here means either the
 *  event runs 12+ hours, or its end date lands 2+ calendar days after its
 *  start -- anything shorter that merely crosses one midnight boundary
 *  collapses back to its single start date. An end that falls at exactly
 *  local midnight is treated as ending "at the start of" that date, not
 *  spilling into it (typical calendar-app exclusive-end convention).
 *
 *  Spec 02's own F2 write-up is internally inconsistent: it states the
 *  answer to "does a 10pm-1am event paint two days?" is "No", but then
 *  separately recommends a literal rule ("exclude the end date only if
 *  it's exactly midnight") that would actually paint that same event
 *  across two days, contradicting its own stated answer and acceptance
 *  criterion. This implements the stated answer, not the contradictory
 *  literal rule -- see TEAMWORK.md. */
export function occupiesDates(event: { start_time: string; end_time: string }): Date[] {
  const start = startOfDay(new Date(event.start_time));
  const endRaw = new Date(event.end_time);
  const endIsExactMidnight =
    endRaw.getHours() === 0 &&
    endRaw.getMinutes() === 0 &&
    endRaw.getSeconds() === 0 &&
    endRaw.getMilliseconds() === 0;
  let end = startOfDay(endRaw);
  if (endIsExactMidnight && end.getTime() > start.getTime()) {
    end = addDays(end, -1);
  }
  if (end.getTime() <= start.getTime()) return [start];

  const durationHours =
    (new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 3_600_000;
  const dayGap = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (durationHours < 12 && dayGap < 2) return [start];

  const dates: Date[] = [];
  let cur = start;
  while (cur.getTime() <= end.getTime()) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

export function occupiesDay(event: { start_time: string; end_time: string }, day: Date): boolean {
  return occupiesDates(event).some((d) => sameDay(d, day));
}

export function isMultiDay(event: { start_time: string; end_time: string }): boolean {
  return occupiesDates(event).length > 1;
}

/** "Fri 3, 6:00 PM" for a single day, "Fri 3 – Sun 5" for a range with no
 *  meaningful start/end clock times to show, "Fri 3, 6:00 PM – Sun 5, 2:00 PM"
 *  when both matter. Used by List/Agenda/Summary/Photo so a multi-day event
 *  gets one row with a range, not one row per occupied day. */
export function fmtDateRange(
  event: { start_time: string; end_time: string },
  timeZone?: string,
): string {
  const dates = occupiesDates(event);
  const start = new Date(event.start_time);
  const zone = timeZone ? safeTimeZone(timeZone) : undefined;
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(zone ? { timeZone: zone } : {}),
  };
  if (dates.length === 1) {
    return `${start.toLocaleDateString(undefined, dateOpts)}, ${fmtTime(start, timeZone)}`;
  }
  const end = new Date(event.end_time);
  return `${start.toLocaleDateString(undefined, dateOpts)}, ${fmtTime(start, timeZone)} – ${end.toLocaleDateString(undefined, dateOpts)}, ${fmtTime(end, timeZone)}`;
}