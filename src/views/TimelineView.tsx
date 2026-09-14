import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { CalendarEvent } from "@/queries/events";
import { addDays, fmtTime, occupiesDates, sameDay, startOfDay } from "@/queries/events";
import { categoryClasses } from "@/lib/categories";
import { EmptyState } from "@/components/CalendarViews/shared";

const DAY_MS = 86_400_000;
const NO_VENUE = "No venue";

function monthDays(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  return Array.from({ length: count }, (_, i) => addDays(first, i));
}

type TimelineRow = {
  event: CalendarEvent;
  startCol: number;
  span: number;
  /** A genuinely single-day event gets a short bar positioned at its actual
   *  time of day within that one column, not a full-day block (spec 05's
   *  own acceptance criterion: "a 2-hour Friday event is a short bar on
   *  Friday, not a 3-day bar"). A multi-day event fills whole day columns
   *  instead, same occupiesDates rule spec 02 already established. */
  timed: boolean;
  fracStart: number;
  fracEnd: number;
};

/** Positions every event that touches the visible month on the day axis.
 *  Unlike MonthView's packWeek, this is deliberately one row per event (no
 *  lane-packing) -- duration being visible top-to-bottom next to every
 *  other event's duration is the entire point of this view. */
function layoutTimeline(events: CalendarEvent[], days: Date[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  for (const event of events) {
    const dates = occupiesDates(event);
    let startCol = -1;
    let endCol = -1;
    days.forEach((d, i) => {
      if (dates.some((od) => sameDay(od, d))) {
        if (startCol === -1) startCol = i;
        endCol = i;
      }
    });
    if (startCol === -1) continue; // doesn't touch the visible month at all
    const timed = dates.length === 1;
    let fracStart = 0;
    let fracEnd = 1;
    if (timed) {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);
      const dayStart = startOfDay(start).getTime();
      fracStart = Math.max(0, Math.min(1, (start.getTime() - dayStart) / DAY_MS));
      // A minimum visible width -- a 15-minute event would otherwise render
      // as a sliver nobody could click or read.
      fracEnd = Math.max(fracStart + 0.03, Math.min(1, (end.getTime() - dayStart) / DAY_MS));
    }
    rows.push({ event, startCol, span: endCol - startCol + 1, timed, fracStart, fracEnd });
  }
  return rows.sort((a, b) => +new Date(a.event.start_time) - +new Date(b.event.start_time));
}

function TimelineBar({ row }: { row: TimelineRow }) {
  const { event, timed, fracStart, fracEnd } = row;
  const rangeLabel = timed
    ? `${fmtTime(event.start_time, event.timezone)} – ${fmtTime(event.end_time, event.timezone)}`
    : `${new Date(event.start_time).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: event.timezone })} – ${new Date(event.end_time).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: event.timezone })}`;
  const tooltip = [event.title, rangeLabel, event.venue_name ?? event.location].filter(Boolean).join(" · ");

  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      title={tooltip}
      className={`block h-full truncate rounded-md px-2 py-1 text-xs font-semibold shadow-sm transition-transform hover:scale-[1.02] ${categoryClasses(event.category)}`}
      style={
        timed
          ? { position: "absolute", left: `${fracStart * 100}%`, width: `${(fracEnd - fracStart) * 100}%` }
          : undefined
      }
    >
      {event.title}
    </Link>
  );
}

export function TimelineView({ cursor, events }: { cursor: Date; events: CalendarEvent[] }) {
  const [groupByVenue, setGroupByVenue] = useState(false);
  const days = useMemo(() => monthDays(cursor), [cursor]);
  const today = new Date();

  const rows = useMemo(() => layoutTimeline(events, days), [events, days]);

  const groups = useMemo(() => {
    if (!groupByVenue) return [{ label: null as string | null, rows }];
    const map = new Map<string, TimelineRow[]>();
    for (const r of rows) {
      const key = r.event.venue_name ?? NO_VENUE;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === NO_VENUE ? 1 : b === NO_VENUE ? -1 : a.localeCompare(b)))
      .map(([label, rows]) => ({ label, rows }));
  }, [groupByVenue, rows]);

  const hasVenues = useMemo(() => events.some((e) => e.venue_name), [events]);

  if (rows.length === 0) return <EmptyState label="No events on the timeline for this month." />;

  const gridTemplateColumns = `180px repeat(${days.length}, minmax(28px, 1fr))`;

  return (
    <section className="space-y-3">
      {hasVenues && (
        <label className="flex w-fit items-center gap-2 text-sm font-semibold text-slate-600">
          <input
            type="checkbox"
            checked={groupByVenue}
            onChange={(e) => setGroupByVenue(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Group by venue
        </label>
      )}

      {/* Horizontal scroll is deliberate here -- the axis is the point. Row
          labels stay sticky left so a long scroll never loses context. */}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="min-w-[720px]">
          <div
            className="grid border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-10 bg-slate-50/80 px-3 py-2">Event</div>
            {days.map((d) => (
              <div
                key={d.toISOString()}
                className={`px-1 py-2 text-center ${sameDay(d, today) ? "text-fuchsia-600" : ""}`}
              >
                {d.getDate()}
              </div>
            ))}
          </div>

          {groups.map((group) => (
            <div key={group.label ?? "__flat"}>
              {group.label && (
                <div className="border-b border-slate-100 bg-slate-50/50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                  {group.label}
                </div>
              )}
              {group.rows.map((row) => (
                <div
                  key={row.event.id}
                  className="grid items-center border-b border-slate-100 last:border-0"
                  style={{ gridTemplateColumns }}
                >
                  <div className="sticky left-0 z-10 truncate bg-white px-3 py-2 text-sm font-semibold text-slate-800">
                    {row.event.title}
                  </div>
                  <div
                    className="relative h-8 self-center px-0.5"
                    style={{
                      gridColumn: row.timed
                        ? `${row.startCol + 2} / span 1`
                        : `${row.startCol + 2} / span ${row.span}`,
                    }}
                  >
                    <TimelineBar row={row} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TimelineView;
