/**
 * Pure layout math for the Timeline view (TimelineView.tsx). No React, no
 * `@/` alias imports -- only a relative `.ts` import -- so the unit suite can
 * load this exact file under Node's type stripping instead of keeping a
 * hand-copied duplicate in sync (the previous tests/unit/timeline-layout.mjs
 * did that and could silently drift from the real implementation).
 *
 * Coordinate system: every x position is measured on a "floating wall-clock"
 * axis -- milliseconds whose UTC getters read as the event's own local wall
 * time (see toFloating in lib/timezone.ts). That is what makes a 6pm event in
 * Chicago sit at the 6pm mark no matter which zone the viewer's browser is in,
 * the same "a community calendar is a place, not a viewer" rule every other
 * calendar view follows.
 */
import { toFloating, safeTimeZone } from "../lib/timezone.ts";

export type TimelineZoom = "day" | "week" | "month";
export const TIMELINE_ZOOMS: readonly TimelineZoom[] = ["day", "week", "month"];

/** Axis density per zoom level. Fixed pixel scales (rather than "fit the
 *  viewport") keep bar geometry deterministic -- a bar is exactly as wide on
 *  a phone as on a desktop, the phone just scrolls further -- and make the
 *  zoom levels read as what their names promise: at "day" one day is ~1.5k
 *  px (an hour is 64px), at "week" a day is 192px so a week is about one
 *  desktop screen, at "month" a day is 48px so a 31-day month is ~1.5k px. */
export const PX_PER_HOUR: Record<TimelineZoom, number> = { day: 64, week: 8, month: 2 };

/** Smallest a bar is ever drawn, so a 15-minute event at month zoom (0.5px
 *  of real duration) is still something a finger can hit. Lane packing
 *  uses this padded width, not the true duration, which is what guarantees
 *  two short events never visually collide even when their real times
 *  don't overlap. */
export const MIN_BAR_PX = 28;
/** Horizontal breathing room required between two bars sharing a lane. */
export const LANE_GAP_PX = 4;
export const LANE_HEIGHT_PX = 34;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type TimelineInput = {
  id: string;
  start_time: string;
  end_time: string;
  timezone?: string | null;
};

export type TimelineBar<T extends TimelineInput = TimelineInput> = {
  event: T;
  /** px from the axis origin (range start) */
  left: number;
  width: number;
  lane: number;
  /** The event started before / ends after the visible range, so the bar is
   *  cut at that edge -- the view draws a continuation marker there instead
   *  of pretending the event begins on the 1st. */
  clippedStart: boolean;
  clippedEnd: boolean;
  /** Wall-clock span (floating ms) -- used by tooltips and tests. */
  startWall: number;
  endWall: number;
};

export type TimelineLayout<T extends TimelineInput = TimelineInput> = {
  bars: TimelineBar<T>[];
  laneCount: number;
  totalWidth: number;
};

/** The floating-wall-clock [start, end) of the calendar month containing
 *  `cursor` (read with the cursor's own local getters, same as MonthView). */
export function monthRange(cursor: Date): { start: number; end: number } {
  return {
    start: Date.UTC(cursor.getFullYear(), cursor.getMonth(), 1),
    end: Date.UTC(cursor.getFullYear(), cursor.getMonth() + 1, 1),
  };
}

/** An event's [start, end) on the floating wall-clock axis, in its own zone. */
export function wallSpan(e: TimelineInput): { start: number; end: number } {
  const zone = safeTimeZone(e.timezone);
  const start = toFloating(new Date(e.start_time), zone).getTime();
  const endRaw = toFloating(new Date(e.end_time), zone).getTime();
  // A malformed row with end < start is treated as a zero-length event at
  // its start rather than a negative-width bar.
  return { start, end: Math.max(start, endRaw) };
}

/**
 * Positions every event that intersects [rangeStart, rangeEnd) and packs
 * overlapping ones into lanes.
 *
 * Lane packing is greedy interval-graph colouring: sort by start (longer
 * first on ties, so a multi-day bar claims the top lane rather than being
 * pushed under a short one that happens to start the same minute), then put
 * each bar in the lowest lane whose previous bar ends -- in *pixels*,
 * including MIN_BAR_PX padding and LANE_GAP_PX -- before this one starts.
 * Greedy-by-start is optimal for interval graphs (lane count == max overlap
 * depth), so this never wastes vertical space.
 *
 * This replaces spec 05's original one-row-per-event layout: the gap-closure
 * spec asks for lane stacking explicitly, and at 200+ events one row per
 * event is a 7,000px-tall page where nothing is comparable at a glance.
 */
export function layoutTimeline<T extends TimelineInput>(
  events: T[],
  rangeStart: number,
  rangeEnd: number,
  pxPerHour: number,
): TimelineLayout<T> {
  const pxPerMs = pxPerHour / HOUR_MS;
  const totalWidth = Math.round((rangeEnd - rangeStart) * pxPerMs);

  type Placed = Omit<TimelineBar<T>, "lane">;
  const placed: Placed[] = [];
  for (const event of events) {
    const { start, end } = wallSpan(event);
    // Half-open intersection; a zero-length event exactly at rangeStart counts.
    if (end < rangeStart || start >= rangeEnd || (end === rangeStart && start !== end)) continue;
    const clippedStart = start < rangeStart;
    const clippedEnd = end > rangeEnd;
    const left = (Math.max(start, rangeStart) - rangeStart) * pxPerMs;
    const right = (Math.min(end, rangeEnd) - rangeStart) * pxPerMs;
    // Never let the minimum width push a bar past the axis end.
    const width = Math.min(Math.max(right - left, MIN_BAR_PX), Math.max(totalWidth - left, 1));
    placed.push({ event, left, width, clippedStart, clippedEnd, startWall: start, endWall: end });
  }

  placed.sort((a, b) => a.left - b.left || b.width - a.width || a.event.id.localeCompare(b.event.id));

  const laneEnds: number[] = [];
  const bars: TimelineBar<T>[] = placed.map((p) => {
    let lane = laneEnds.findIndex((endPx) => endPx + LANE_GAP_PX <= p.left);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = p.left + p.width;
    return { ...p, lane };
  });

  return { bars, laneCount: laneEnds.length, totalWidth };
}

/**
 * Bars intersecting the horizontal window [x0, x1] and lane window
 * [lane0, lane1] -- the virtualization query. `bars` must be sorted by
 * `left` (layoutTimeline's output is): a binary search drops everything that
 * starts after the window, and only bars starting before it are checked for
 * their right edge. At 1,000 bars this is a few hundred comparisons per
 * scroll frame and only the visible handful ever reach the DOM.
 */
export function visibleBars<T extends TimelineInput>(
  bars: TimelineBar<T>[],
  x0: number,
  x1: number,
  lane0 = 0,
  lane1 = Number.POSITIVE_INFINITY,
): TimelineBar<T>[] {
  let lo = 0;
  let hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (bars[mid].left <= x1) lo = mid + 1;
    else hi = mid;
  }
  const out: TimelineBar<T>[] = [];
  for (let i = 0; i < lo; i++) {
    const b = bars[i];
    if (b.left + b.width >= x0 && b.lane >= lane0 && b.lane <= lane1) out.push(b);
  }
  return out;
}

export type TimelineTick = { x: number; label: string; major: boolean };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** Axis ticks for a zoom level. Majors are day boundaries at every zoom
 *  (labelled with the date); minors are hours at "day" zoom and 6-hour marks
 *  at "week" zoom. Month zoom has day majors only -- at 48px/day anything
 *  finer is noise. All positions are on the same floating axis as the bars,
 *  so a tick and a bar at "6 PM" line up exactly. */
export function axisTicks(rangeStart: number, rangeEnd: number, zoom: TimelineZoom): TimelineTick[] {
  const pxPerMs = PX_PER_HOUR[zoom] / HOUR_MS;
  const minorStepH = zoom === "day" ? 1 : zoom === "week" ? 6 : 24;
  const ticks: TimelineTick[] = [];
  for (let t = rangeStart; t < rangeEnd; t += minorStepH * HOUR_MS) {
    const d = new Date(t);
    const major = d.getUTCHours() === 0;
    const label = major
      ? zoom === "month"
        ? String(d.getUTCDate())
        : `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()}`
      : hourLabel(d.getUTCHours());
    ticks.push({ x: (t - rangeStart) * pxPerMs, label, major });
  }
  return ticks;
}

/** Keeps the moment under the viewport centre fixed across a zoom change:
 *  returns the new scrollLeft. Without this, switching month -> day would
 *  keep the old pixel offset and land on an unrelated hour of day 1. */
export function anchoredScrollLeft(
  oldScrollLeft: number,
  viewportWidth: number,
  oldPxPerHour: number,
  newPxPerHour: number,
): number {
  const centreMs = ((oldScrollLeft + viewportWidth / 2) / oldPxPerHour) * HOUR_MS;
  return Math.max(0, (centreMs / HOUR_MS) * newPxPerHour - viewportWidth / 2);
}

export { DAY_MS, HOUR_MS };
