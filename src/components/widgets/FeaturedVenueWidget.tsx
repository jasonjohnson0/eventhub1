import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { CalendarEvent } from "@/queries/events";
import { MapPin, Sparkles } from "lucide-react";

type Venue = {
  name: string;
  image: string | null;
  count: number;
  next: CalendarEvent | null;
};

/** Rotating venue spotlight derived from the events feed. */
export function FeaturedVenueWidget({
  events,
  intervalMs = 8000,
}: {
  events: CalendarEvent[];
  intervalMs?: number;
}) {
  const venues = useMemo<Venue[]>(() => {
    const map = new Map<string, Venue>();
    const now = Date.now();
    for (const e of events) {
      if (!e.location) continue;
      const v = map.get(e.location) ?? { name: e.location, image: null, count: 0, next: null };
      v.count += 1;
      if (!v.image && e.image_url) v.image = e.image_url;
      const t = +new Date(e.start_time);
      if (t > now && (!v.next || t < +new Date(v.next.start_time))) v.next = e;
      map.set(e.location, v);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [events]);

  const [i, setI] = useState(0);
  useEffect(() => {
    if (venues.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % venues.length), intervalMs);
    return () => clearInterval(t);
  }, [venues.length, intervalMs]);

  const venue = venues[i % Math.max(venues.length, 1)];
  if (!venue) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        No venues to spotlight yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="relative h-32 bg-gradient-to-br from-cyan-300 via-sky-200 to-fuchsia-200">
        {venue.image && (
          <img
            src={venue.image}
            alt={venue.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-fuchsia-600">
          <Sparkles className="h-3 w-3" /> Venue spotlight
        </span>
      </div>
      <div className="space-y-2 p-4">
        <h4 className="flex min-w-0 items-start gap-1.5 text-base font-black text-slate-900">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
          <span className="min-w-0 break-words">{venue.name}</span>
        </h4>
        <p className="text-xs font-semibold text-slate-500">
          {venue.count} {venue.count === 1 ? "event" : "events"} listed
        </p>
        {venue.next && (
          <Link
            to="/events/$id"
            params={{ id: venue.next.id }}
            className="block truncate text-sm font-bold text-fuchsia-600 hover:underline"
          >
            Next: {venue.next.title}
          </Link>
        )}
        {venues.length > 1 && (
          <div className="flex gap-1 pt-1">
            {venues.map((v, idx) => (
              <button
                key={v.name}
                aria-label={`Show ${v.name}`}
                onClick={() => setI(idx)}
                className={`h-1.5 rounded-full transition-all ${idx === i ? "w-5 bg-fuchsia-500" : "w-1.5 bg-slate-300"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default FeaturedVenueWidget;