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
  limit?: number;
};

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
  if (filters.category) q = q.eq("category", filters.category);
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
  if (!ids.length) return { images, counts, organizers };

  const [detailsRes, rsvpRes, orgRes] = await Promise.all([
    supabase.from("event_details").select("event_id, landscape_image_url, portrait_image_url").in("event_id", ids),
    supabase.from("event_rsvps").select("event_id").in("event_id", ids).eq("status", "going"),
    supabase.from("event_organizers").select("event_id, organizers(name)").in("event_id", ids),
  ]);

  for (const d of detailsRes.data ?? []) {
    images.set(d.event_id, d.landscape_image_url ?? d.portrait_image_url ?? null);
  }
  for (const r of rsvpRes.data ?? []) counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
  for (const o of (orgRes.data ?? []) as { event_id: string; organizers: { name: string } | null }[]) {
    if (!o.organizers?.name) continue;
    organizers.set(o.event_id, [...(organizers.get(o.event_id) ?? []), o.organizers.name]);
  }
  return { images, counts, organizers };
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