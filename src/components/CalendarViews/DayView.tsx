import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Users } from "lucide-react";
import type { CalendarEvent } from "@/queries/events";
import { fmtTime, sameDay } from "@/queries/events";
import { CategoryTag, EmptyState } from "./shared";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayView({ cursor, events }: { cursor: Date; events: CalendarEvent[] }) {
  const dayEvents = useMemo(
    () =>
      events
        .filter((e) => sameDay(new Date(e.start_time), cursor))
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [events, cursor],
  );

  const byHour = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const e of dayEvents) {
      const h = new Date(e.start_time).getHours();
      map.set(h, [...(map.get(h) ?? []), e]);
    }
    return map;
  }, [dayEvents]);

  if (!dayEvents.length) return <EmptyState label="No events scheduled for this day." />;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {HOURS.map((h) => {
        const items = byHour.get(h) ?? [];
        return (
          <div key={h} className="flex border-b border-slate-100 last:border-0">
            <div className="w-20 shrink-0 border-r border-slate-100 px-3 py-3 text-right text-xs font-medium text-slate-400">
              {h % 12 === 0 ? 12 : h % 12}
              {h < 12 ? "am" : "pm"}
            </div>
            <div className="flex-1 space-y-2 p-2">
              {items.map((e) => {
                const mins = Math.max(
                  30,
                  (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000,
                );
                return (
                  <Link
                    key={e.id}
                    to="/events/$id"
                    params={{ id: e.id }}
                    className="block rounded-2xl bg-gradient-to-r from-fuchsia-50 to-amber-50 p-3 ring-1 ring-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-md"
                    style={{ minHeight: `${Math.min(220, 44 + (mins / 60) * 26)}px` }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{e.title}</span>
                      <CategoryTag category={e.category} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>
                        {fmtTime(e.start_time)} – {fmtTime(e.end_time)} · {Math.round(mins)} min
                      </span>
                      {e.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {e.location}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {e.going_count} going
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}