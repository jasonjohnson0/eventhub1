import { useMemo } from "react";
import type { CalendarEvent } from "@/queries/events";
import { addDays, sameDay, startOfWeek } from "@/queries/events";
import { EventChip } from "./shared";

const START_HOUR = 8;
const END_HOUR = 22; // 10pm
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);

export function WeekView({ cursor, events }: { cursor: Date; events: CalendarEvent[] }) {
  const days = useMemo(() => {
    const s = startOfWeek(cursor);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [cursor]);

  const byCell = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const d = new Date(e.start_time);
      const hour = Math.min(Math.max(d.getHours(), START_HOUR), END_HOUR);
      const key = `${d.toDateString()}|${hour}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return map;
  }, [events]);

  const today = new Date();

  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
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
                  sameDay(d, today) ? "bg-fuchsia-500 text-white" : "text-slate-800"
                }`}
              >
                {d.getDate()}
              </div>
            </div>
          ))}
        </div>

        {HOURS.map((h) => (
          <div key={h} className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-slate-100 last:border-0">
            <div className="border-r border-slate-100 px-2 py-2 text-right text-[11px] font-medium text-slate-400">
              {h % 12 === 0 ? 12 : h % 12}
              {h < 12 ? "am" : "pm"}
            </div>
            {days.map((d) => {
              const items = byCell.get(`${d.toDateString()}|${h}`) ?? [];
              return (
                <div key={d.toISOString() + h} className="min-h-12 space-y-1 border-r border-slate-100 p-1 last:border-0">
                  {items.map((e) => (
                    <EventChip key={e.id} event={e} compact />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}