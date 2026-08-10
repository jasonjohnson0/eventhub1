import { useMemo } from "react";
import type { CalendarEvent } from "@/queries/events";
import { addDays, sameDay, startOfDay } from "@/queries/events";
import { EventChip } from "./shared";

export function MonthView({ cursor, events }: { cursor: Date; events: CalendarEvent[] }) {
  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = addDays(startOfDay(first), -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const k = new Date(e.start_time).toDateString();
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return map;
  }, [events]);

  const today = new Date();

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/80 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const items = byDay.get(d.toDateString()) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div
              key={d.toISOString()}
              className={`min-h-28 space-y-1 border-b border-r border-slate-100 p-1.5 ${
                inMonth ? "" : "bg-slate-50/60"
              }`}
            >
              <div
                className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  sameDay(d, today) ? "bg-fuchsia-500 text-white" : inMonth ? "text-slate-700" : "text-slate-300"
                }`}
              >
                {d.getDate()}
              </div>
              {items.slice(0, 3).map((e) => (
                <EventChip key={e.id} event={e} compact />
              ))}
              {items.length > 3 && (
                <div className="px-2 text-[11px] font-semibold text-slate-400">+{items.length - 3} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}