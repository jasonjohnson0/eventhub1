import { Link } from "@tanstack/react-router";
import { categoryClasses, categoryLabel } from "@/lib/categories";
import type { CalendarEvent } from "@/queries/events";
import { fmtTime, occupiesDates, sameDay } from "@/queries/events";

export type WeekSeg = { event: CalendarEvent; startCol: number; span: number; lane: number };

/** Greedy interval-scheduling pack: events touching this 7-day window are
 *  laid into the fewest lanes such that no two overlapping events share a
 *  lane. Sorted by start column, then longest-first, which keeps multi-day
 *  bars from fragmenting behind shorter events starting the same day. Used
 *  by MonthView (every event) and WeekView (its all-day lane only). */
export function packWeek(events: CalendarEvent[], week: Date[]): WeekSeg[] {
  const raw = events
    .map((e) => {
      const dates = occupiesDates(e);
      let startCol = -1;
      let endCol = -1;
      week.forEach((d, i) => {
        if (dates.some((od) => sameDay(od, d))) {
          if (startCol === -1) startCol = i;
          endCol = i;
        }
      });
      if (startCol === -1) return null;
      return { event: e, startCol, span: endCol - startCol + 1 };
    })
    .filter((x): x is { event: CalendarEvent; startCol: number; span: number } => x !== null)
    .sort((a, b) => a.startCol - b.startCol || b.span - a.span);

  const laneEnd: number[] = [];
  return raw.map((iv) => {
    let lane = laneEnd.findIndex((end) => end <= iv.startCol);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(0);
    }
    laneEnd[lane] = iv.startCol + iv.span;
    return { ...iv, lane };
  });
}

export function EventChip({
  event,
  compact = false,
  spanning = false,
}: {
  event: CalendarEvent;
  compact?: boolean;
  /** A multi-day bar occupying more than one grid cell — squared-off ends
   *  instead of a pill, so it reads as one continuous run across days
   *  rather than a stretched single-day chip. */
  spanning?: boolean;
}) {
  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      title={`${event.title} · ${fmtTime(event.start_time)}`}
      className={`block truncate px-2 py-1 text-xs font-semibold transition-transform hover:scale-[1.01] ${
        spanning ? "rounded-md" : "rounded-lg"
      } ${categoryClasses(event.category)}`}
    >
      {!compact && <span className="mr-1 opacity-70">{fmtTime(event.start_time)}</span>}
      {event.title}
    </Link>
  );
}

export function CategoryTag({ category }: { category: string | null }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${categoryClasses(category)}`}>
      {categoryLabel(category ?? "other")}
    </span>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-slate-200 bg-white/50 p-12 text-center">
      <div className="text-5xl">🗓️</div>
      <p className="mt-3 text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}