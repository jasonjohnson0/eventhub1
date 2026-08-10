import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarEvent } from "@/queries/events";
import { distanceMiles } from "@/queries/events";

export type EventFilterState = {
  category: string | null;
  from: string | null; // yyyy-mm-dd
  to: string | null; // yyyy-mm-dd
  venue: string | null;
  q: string;
};

const EMPTY: EventFilterState = { category: null, from: null, to: null, venue: null, q: "" };
const KEY = "eventhub:filters";

function read(): EventFilterState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<EventFilterState>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Category / date-range / venue filters, persisted to localStorage. */
export function useEventFilters(events: CalendarEvent[] = []) {
  const [filters, setFilters] = useState<EventFilterState>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFilters(read());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(filters));
    } catch {
      /* storage unavailable */
    }
  }, [filters, hydrated]);

  const set = useCallback(
    (patch: Partial<EventFilterState>) => setFilters((f) => ({ ...f, ...patch })),
    [],
  );
  const reset = useCallback(() => setFilters(EMPTY), []);

  const venues = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) if (e.location) s.add(e.location);
    return [...s].sort();
  }, [events]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const fromT = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
    const toT = filters.to ? new Date(`${filters.to}T23:59:59`).getTime() : null;
    return events.filter((e) => {
      if (filters.category && e.category !== filters.category) return false;
      if (filters.venue && e.location !== filters.venue) return false;
      const start = new Date(e.start_time).getTime();
      if (fromT != null && start < fromT) return false;
      if (toT != null && start > toT) return false;
      if (q && !`${e.title} ${e.description ?? ""} ${e.location ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [events, filters]);

  const activeCount = useMemo(
    () =>
      [filters.category, filters.from, filters.to, filters.venue, filters.q.trim() || null].filter(
        Boolean,
      ).length,
    [filters],
  );

  /** Optional geo narrowing, matching the existing geo-filter contract. */
  const withinRadius = useCallback(
    (list: CalendarEvent[], lat: number | null, lng: number | null, radius: number) =>
      lat == null || lng == null
        ? list
        : list.filter(
            (e) =>
              e.latitude != null &&
              e.longitude != null &&
              distanceMiles(lat, lng, e.latitude, e.longitude) <= radius,
          ),
    [],
  );

  return { filters, set, reset, filtered, venues, activeCount, withinRadius };
}