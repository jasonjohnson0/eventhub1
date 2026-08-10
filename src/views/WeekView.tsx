import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { CalendarEvent } from "@/queries/events";
import { fmtTime } from "@/queries/events";
import { categoryClasses } from "@/lib/categories";
import { useWeekView, WEEK_START_HOUR, WEEK_END_HOUR } from "@/hooks/useWeekView";

/**
 * 7-day grid with hourly slots. Mobile-first: stacks into day columns
 * on small screens, full grid from `md` up.
 */
export function WeekView({
  events,
  cursor,
  onCursorChange,
}: {
  events: CalendarEvent[];
  cursor?: Date;
  onCursorChange?: (d: Date) => void;
}) {
  const week = useWeekView(cursor);
  const days = week.days;

  const byCell = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = new Date(e.start_time);
      const hour = Math.min(Math.max(d.getHours(), WEEK_START_HOUR), WEEK_END_HOUR);
      const key = `${d.toDateString()}|${hour}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = new Date(e.start_time).toDateString();
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events]);

  function move(delta: number) {
    const next = new Date(week.start);
    next.setDate(next.getDate() + delta * 7);
    week.setCursor(next);
    onCursorChange?.(next);
  }

  return (
    <section className="space-y-4">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <h3 className="min-w-0 truncate text-lg font-bold text-slate-900">{week.label}</h3>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => move(-1)}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            ←
          </button>
          <button
            onClick={() => {
              week.today();
              onCursorChange?.(new Date());
            }}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Today
          </button>
          <button
            onClick={() => move(1)}
            className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            →
          </button>
        </div>
      </header>

      {/* Mobile: day-by-day stack */}
      <div className="space-y-3 md:hidden">
        {days.map((d) => {
          const items = (byDay.get(d.toDateString()) ?? []).sort(
            (a, b) => +new Date(a.start_time) - +new Date(b.start_time),
          );
          return (
            <div
              key={d.toISOString()}
              className={`rounded-2xl border p-3 ${week.isToday(d) ? "border-fuchsia-300 bg-fuchsia-50/50" : "border-slate-200 bg-white"}`}
            >
              <div className="mb-2 text-sm font-bold text-slate-800">
                {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-slate-400">No events</p>
              ) : (
                <ul className="space-y-1">
                  {items.map((e) => (
                    <li key={e.id}>
                      <Slot event={e} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop: hourly grid */}
      <div className="hidden overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-slate-200 bg-slate-50/80">
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className="px-2 py-3 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {d.toLocaleDateString(undefined, { weekday: "short" })}
                </div>
                <div
                  className={`mx-auto mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
                    week.isToday(d) ? "bg-fuchsia-500 text-white" : "text-slate-800"
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
            ))}
          </div>

          {week.hours.map((h) => (
            <div
              key={h}
              className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-slate-100 last:border-0"
            >
              <div className="border-r border-slate-100 px-2 py-2 text-right text-[11px] font-medium text-slate-400">
                {h % 12 === 0 ? 12 : h % 12}
                {h < 12 ? "am" : "pm"}
              </div>
              {days.map((d) => (
                <div
                  key={d.toISOString() + h}
                  className={`min-h-12 min-w-0 space-y-1 overflow-hidden border-r border-slate-100 p-1 last:border-0 ${
                    week.isToday(d) ? "bg-fuchsia-50/40" : ""
                  }`}
                >
                  {(byCell.get(`${d.toDateString()}|${h}`) ?? []).map((e) => (
                    <Slot key={e.id} event={e} compact />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Slot({ event, compact = false }: { event: CalendarEvent; compact?: boolean }) {
  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      title={`${event.title} · ${fmtTime(event.start_time)}`}
      className={`block truncate rounded-lg px-2 py-1 text-xs font-semibold transition-transform hover:scale-[1.02] ${categoryClasses(event.category)}`}
    >
      {!compact && <span className="mr-1 opacity-70">{fmtTime(event.start_time)}</span>}
      {event.title}
    </Link>
  );
}

export default WeekView;