import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Ticket } from "lucide-react";
import { fetchMyEvents, fmtTime, type CalendarEvent, type EventFilters } from "@/queries/events";
import { CategoryTag, EmptyState } from "./shared";
import { Button } from "@/components/ui/button";

type MyEvent = CalendarEvent & { rsvp_status: string };

export function AgendaView({ signedIn, filters }: { signedIn: boolean; filters?: EventFilters }) {
  const [rows, setRows] = useState<MyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(filters ?? {});

  useEffect(() => {
    let cancelled = false;
    if (!signedIn) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchMyEvents(JSON.parse(key) as EventFilters)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, key]);

  const grouped = useMemo(() => {
    const map = new Map<string, MyEvent[]>();
    for (const e of [...rows].sort((a, b) => a.start_time.localeCompare(b.start_time))) {
      const label = new Date(e.start_time).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      map.set(label, [...(map.get(label) ?? []), e]);
    }
    return Array.from(map.entries());
  }, [rows]);

  if (!signedIn) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/60 p-12 text-center">
        <div className="text-5xl">🎟️</div>
        <h3 className="mt-3 text-lg font-bold text-slate-900">Your personal agenda</h3>
        <p className="mt-1 text-sm text-slate-500">Sign in to see the events you&apos;ve registered for.</p>
        <Button asChild className="mt-5 rounded-full">
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  if (!grouped.length) return <EmptyState label="You haven't registered for any events yet." />;

  return (
    <div className="space-y-8">
      {grouped.map(([label, items]) => (
        <div key={label}>
          <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-400">{label}</h3>
          <div className="space-y-3">
            {items.map((e) => (
              <Link
                key={e.id}
                to="/events/$id"
                params={{ id: e.id }}
                className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="w-20 shrink-0 text-sm font-bold text-slate-900">{fmtTime(e.start_time)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-bold text-slate-900">{e.title}</span>
                    <CategoryTag category={e.category} />
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                      <Ticket className="h-3 w-3" />
                      {e.rsvp_status}
                    </span>
                  </div>
                  {e.location && (
                    <div className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3" />
                      {e.location}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}