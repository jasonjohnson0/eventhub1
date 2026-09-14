import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { MapPin, Users } from "lucide-react";
import type { CalendarEvent } from "@/queries/events";
import { fmtTime, occupiesDates, occupiesDay, sameDay } from "@/queries/events";
import { CategoryTag, EmptyState } from "./shared";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Where cursor falls within a (possibly multi-day) event's occupied dates. */
function dayInfo(e: CalendarEvent, cursor: Date) {
  const dates = occupiesDates(e);
  const idx = dates.findIndex((d) => sameDay(d, cursor));
  return { dayNum: idx + 1, totalDays: dates.length, isStartDay: idx === 0, isEndDay: idx === dates.length - 1 };
}

export function DayView({ cursor, events }: { cursor: Date; events: CalendarEvent[] }) {
  const dayEvents = useMemo(
    () =>
      events
        .filter((e) => occupiesDay(e, cursor))
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [events, cursor],
  );

  // A middle day of a multi-day event (neither its start nor its end) has no
  // natural hour to sit at -- shown in an all-day banner instead, same idea
  // as Week's spanning lane.
  const allDayMiddle = useMemo(
    () => dayEvents.filter((e) => { const info = dayInfo(e, cursor); return !info.isStartDay && !info.isEndDay; }),
    [dayEvents, cursor],
  );
  const timed = useMemo(
    () => dayEvents.filter((e) => { const info = dayInfo(e, cursor); return info.isStartDay || info.isEndDay; }),
    [dayEvents, cursor],
  );

  const byHour = useMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const e of timed) {
      const info = dayInfo(e, cursor);
      // Its start hour if cursor is the actual start day; otherwise this is
      // the end day of an event that started earlier, so it reads as
      // running from midnight up to its end time today.
      const h = info.isStartDay ? new Date(e.start_time).getHours() : 0;
      map.set(h, [...(map.get(h) ?? []), e]);
    }
    return map;
  }, [timed, cursor]);

  if (!dayEvents.length) return <EmptyState label="No events scheduled for this day." />;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {allDayMiddle.length > 0 && (
        <div className="space-y-2 border-b border-slate-100 bg-slate-50/60 p-3">
          {allDayMiddle.map((e) => {
            const info = dayInfo(e, cursor);
            return (
              <Link
                key={e.id}
                to="/events/$id"
                params={{ id: e.id }}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2.5 ring-1 ring-slate-200 transition-transform hover:-translate-y-0.5"
              >
                <span className="font-bold text-slate-900">{e.title}</span>
                <CategoryTag category={e.category} />
                <span className="text-xs font-semibold text-slate-400">
                  Day {info.dayNum} of {info.totalDays} · all day
                </span>
              </Link>
            );
          })}
        </div>
      )}
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
                const info = dayInfo(e, cursor);
                // For an end-day segment of an event that started on an
                // earlier day, the "start" for this card's height/label is
                // midnight of the currently-viewed day, not the event's
                // real start_time (which would make the card absurdly tall
                // and the label read as spanning back into the wrong day).
                const effectiveStart = info.isStartDay
                  ? new Date(e.start_time)
                  : new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
                const mins = Math.max(
                  30,
                  (new Date(e.end_time).getTime() - effectiveStart.getTime()) / 60000,
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
                      {info.totalDays > 1 && (
                        <span className="text-[11px] font-semibold text-slate-400">
                          Day {info.dayNum} of {info.totalDays}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>
                        {info.isStartDay && info.isEndDay ? (
                          <>
                            {fmtTime(e.start_time)} – {fmtTime(e.end_time)} · {Math.round(mins)} min
                          </>
                        ) : info.isStartDay ? (
                          <>{fmtTime(e.start_time)} – continues</>
                        ) : (
                          <>until {fmtTime(e.end_time)} today</>
                        )}
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