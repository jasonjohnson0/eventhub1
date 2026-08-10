import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import type { CalendarEvent } from "@/queries/events";
import { fmtTime, startOfWeek, addDays } from "@/queries/events";
import { categoryClasses } from "@/lib/categories";

/** Top 5 events happening this week, in compact card format. */
export function WeekEventsWidget({ events, limit = 5 }: { events: CalendarEvent[]; limit?: number }) {
  const items = useMemo(() => {
    const start = startOfWeek(new Date()).getTime();
    const end = addDays(startOfWeek(new Date()), 7).getTime();
    return events
      .filter((e) => {
        const t = +new Date(e.start_time);
        return t >= start && t < end;
      })
      .sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time))
      .slice(0, limit);
  }, [events, limit]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <h4 className="text-sm font-black uppercase tracking-wide text-slate-500">This week</h4>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">Nothing on the calendar this week.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((e) => (
            <li key={e.id}>
              <Link
                to="/events/$id"
                params={{ id: e.id }}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-slate-100 p-2 transition-colors hover:bg-slate-50"
              >
                <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-slate-100 text-center">
                  <span className="text-[10px] font-bold uppercase text-slate-500">
                    {new Date(e.start_time).toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className="text-sm font-black leading-none text-slate-900">
                    {new Date(e.start_time).getDate()}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-900">{e.title}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-2">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${categoryClasses(e.category)}`}
                    >
                      {e.category ?? "other"}
                    </span>
                    <span className="truncate text-xs text-slate-500">{fmtTime(e.start_time)}</span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default WeekEventsWidget;