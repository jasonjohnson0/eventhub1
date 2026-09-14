import { useMemo } from "react";
import type { CalendarEvent } from "@/queries/events";
import { addDays, isMultiDay, sameDay, startOfDay } from "@/queries/events";
import { EventChip, packWeek } from "./shared";

const MAX_LANES = 3;

export function MonthView({ cursor, events }: { cursor: Date; events: CalendarEvent[] }) {
  const weeks = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = addDays(startOfDay(first), -first.getDay());
    const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    return Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  }, [cursor]);

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
      {weeks.map((week, wi) => {
        const segs = packWeek(events, week);
        return (
          <div
            key={wi}
            className="grid"
            style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gridAutoRows: "min-content" }}
          >
            {/* per-day background/border, spanning every row in this week so
                cell boundaries stay correct regardless of how many lanes render */}
            {week.map((d, ci) => {
              const inMonth = d.getMonth() === cursor.getMonth();
              return (
                <div
                  key={`bg-${d.toISOString()}`}
                  style={{ gridColumn: ci + 1, gridRow: "1 / -1" }}
                  className={`min-h-28 border-b border-r border-slate-100 ${inMonth ? "" : "bg-slate-50/60"}`}
                />
              );
            })}
            {week.map((d, ci) => (
              <div key={`num-${d.toISOString()}`} style={{ gridColumn: ci + 1, gridRow: 1 }} className="p-1.5">
                <div
                  className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    sameDay(d, today)
                      ? "bg-fuchsia-500 text-white"
                      : d.getMonth() === cursor.getMonth()
                        ? "text-slate-700"
                        : "text-slate-300"
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
            ))}
            {segs
              .filter((s) => s.lane < MAX_LANES)
              .map((s) => (
                <div
                  key={s.event.id}
                  style={{ gridColumn: `${s.startCol + 1} / span ${s.span}`, gridRow: s.lane + 2 }}
                  className="px-1.5 pb-1"
                >
                  <EventChip event={s.event} compact spanning={isMultiDay(s.event) && s.span > 1} />
                </div>
              ))}
            {week.map((d, ci) => {
              const hidden = segs.filter(
                (s) => s.lane >= MAX_LANES && ci >= s.startCol && ci < s.startCol + s.span,
              ).length;
              if (hidden === 0) return null;
              return (
                <div
                  key={`more-${d.toISOString()}`}
                  style={{ gridColumn: ci + 1, gridRow: MAX_LANES + 2 }}
                  className="px-2 pb-1 text-[11px] font-semibold text-slate-400"
                >
                  +{hidden} more
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
