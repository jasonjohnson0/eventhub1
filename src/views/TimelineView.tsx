import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { CalendarEvent } from "@/queries/events";
import { fmtTime } from "@/queries/events";
import { categoryClasses } from "@/lib/categories";
import { toFloating, viewerTimeZone } from "@/lib/timezone";
import { EmptyState } from "@/components/CalendarViews/shared";
import {
  LANE_HEIGHT_PX,
  PX_PER_HOUR,
  TIMELINE_ZOOMS,
  anchoredScrollLeft,
  axisTicks,
  layoutTimeline,
  monthRange,
  visibleBars,
  type TimelineBar,
  type TimelineZoom,
} from "@/views/timeline-layout";

const NO_VENUE = "No venue";
const AXIS_HEIGHT_PX = 36;
const GROUP_HEADER_PX = 30;
/** Rendered beyond each viewport edge so a fast fling never shows a blank
 *  strip before the next scroll frame's render lands. */
const OVERSCAN_PX = 600;
/** Server render has no viewport to measure; this is a typical desktop
 *  window, so the crawler-visible HTML contains the first screenful of bars
 *  rather than none. The first client scroll/resize event corrects it. */
const SSR_VIEWPORT = { left: 0, top: 0, width: 1280, height: 800 };
/** The render window moves in blocks of this many px, not per scroll pixel:
 *  scrolling within a block changes nothing React can see, so a scroll frame
 *  costs no render at all unless it crosses a block edge. OVERSCAN_PX is
 *  larger than a block, so the rendered window always covers the viewport. */
const BLOCK_PX = 512;

const ZOOM_LABEL: Record<TimelineZoom, string> = { day: "Day", week: "Week", month: "Month" };

// useLayoutEffect warns during SSR; on the server there's no DOM to measure
// anyway, so a plain effect is the correct no-op stand-in.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Group = {
  label: string | null;
  top: number;
  height: number;
  laneCount: number;
  bars: TimelineBar<CalendarEvent>[];
};

function rangeLabel(event: CalendarEvent, multiDay: boolean): string {
  if (!multiDay) {
    return `${fmtTime(event.start_time, event.timezone)} – ${fmtTime(event.end_time, event.timezone, { abbr: true })}`;
  }
  const d = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: event.timezone });
  return `${d(event.start_time)} – ${d(event.end_time)}`;
}

// Memoized: bar objects come out of a useMemo'd layout with stable identity,
// so when the render window moves only the bars entering it render -- not
// every bar already on screen (which, as TanStack Links, cost 150-290ms per
// scroll frame at 250 events before this).
const Bar = memo(function Bar({ bar, top }: { bar: TimelineBar<CalendarEvent>; top: number }) {
  const { event, left, width, clippedStart, clippedEnd } = bar;
  const multiDay = bar.endWall - bar.startWall >= 20 * 3_600_000;
  const range = rangeLabel(event, multiDay);
  const tooltip = [event.title, range, event.venue_name ?? event.location].filter(Boolean).join(" · ");
  return (
    <Link
      to="/events/$id"
      params={{ id: event.id }}
      title={tooltip}
      aria-label={tooltip}
      data-timeline-bar=""
      data-event-id={event.id}
      data-lane={bar.lane}
      className={`absolute flex items-center gap-1 overflow-hidden whitespace-nowrap px-2 text-xs font-semibold shadow-sm transition-[filter] hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fuchsia-500 ${
        clippedStart ? "rounded-l-none border-l-2 border-dashed" : "rounded-l-md"
      } ${clippedEnd ? "rounded-r-none border-r-2 border-dashed" : "rounded-r-md"} ${categoryClasses(event.category)}`}
      style={{ left, width, top: top + 3, height: LANE_HEIGHT_PX - 6 }}
    >
      {clippedStart && <span aria-hidden>‹</span>}
      {/* Under ~48px a title truncates to "D." -- noise, not information.
          A plain coloured pill reads better; the full title is still in the
          tooltip and the accessible name. */}
      {width >= 48 && <span className="truncate">{event.title}</span>}
      {width > 150 && <span className="shrink-0 font-normal opacity-70">{range}</span>}
      {clippedEnd && <span aria-hidden className="ml-auto">›</span>}
    </Link>
  );
});

export function TimelineView({ cursor, events }: { cursor: Date; events: CalendarEvent[] }) {
  const [zoom, setZoom] = useState<TimelineZoom>("month");
  const [groupByVenue, setGroupByVenue] = useState(false);
  const [viewport, setViewport] = useState(SSR_VIEWPORT);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => monthRange(cursor), [cursor]);
  const pxPerHour = PX_PER_HOUR[zoom];

  const hasVenues = useMemo(() => events.some((e) => e.venue_name), [events]);

  const { groups, totalWidth, totalHeight, eventCount } = useMemo(() => {
    const buckets = new Map<string | null, CalendarEvent[]>();
    if (groupByVenue) {
      for (const e of events) {
        const key = e.venue_name ?? NO_VENUE;
        buckets.set(key, [...(buckets.get(key) ?? []), e]);
      }
    } else {
      buckets.set(null, events);
    }
    const ordered = [...buckets.entries()].sort(([a], [b]) =>
      a === NO_VENUE ? 1 : b === NO_VENUE ? -1 : (a ?? "").localeCompare(b ?? ""),
    );
    let y = AXIS_HEIGHT_PX;
    let width = 0;
    let count = 0;
    const out: Group[] = [];
    for (const [label, evs] of ordered) {
      const layout = layoutTimeline(evs, range.start, range.end, pxPerHour);
      width = layout.totalWidth;
      if (layout.bars.length === 0) continue;
      count += layout.bars.length;
      const header = label ? GROUP_HEADER_PX : 0;
      const height = header + layout.laneCount * LANE_HEIGHT_PX;
      out.push({ label, top: y, height, laneCount: layout.laneCount, bars: layout.bars });
      y += height;
    }
    return {
      groups: out,
      totalWidth: width || layoutTimeline([], range.start, range.end, pxPerHour).totalWidth,
      totalHeight: y,
      eventCount: count,
    };
  }, [events, groupByVenue, range, pxPerHour]);

  const ticks = useMemo(() => axisTicks(range.start, range.end, zoom), [range, zoom]);

  // "Now" on the viewer's own wall clock -- the only place the viewer's zone
  // is used, and only to mark where today is, never to move an event.
  const nowX = useMemo(() => {
    const now = toFloating(new Date(), viewerTimeZone()).getTime();
    if (now < range.start || now >= range.end) return null;
    return ((now - range.start) / 3_600_000) * pxPerHour;
  }, [range, pxPerHour]);

  // --- virtualization: track the scroller's viewport, one update per frame.
  const frame = useRef(0);
  const syncViewport = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const next = {
      left: Math.floor(el.scrollLeft / BLOCK_PX) * BLOCK_PX,
      top: Math.floor(el.scrollTop / BLOCK_PX) * BLOCK_PX,
      width: el.clientWidth + BLOCK_PX,
      height: el.clientHeight + BLOCK_PX,
    };
    setViewport((v) =>
      v.left === next.left && v.top === next.top && v.width === next.width && v.height === next.height ? v : next,
    );
  }, []);
  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      syncViewport();
    });
  }, [syncViewport]);
  // The scroller only mounts once there is something to draw, so the
  // observer is (re)attached when that flips.
  const hasBars = eventCount > 0;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(syncViewport);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [syncViewport, hasBars]);

  // Open at the month's first day, unless that would leave "today" off-
  // screen -- then bring today into view a third of the way in. Re-runs
  // only when the month changes, not on zoom.
  useIsoLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollLeft = nowX !== null && nowX > el.clientWidth * 0.85 ? Math.max(0, nowX - el.clientWidth / 3) : 0;
    syncViewport();
  }, [range.start]);

  // Zoom keeps the moment at the viewport centre fixed (anchoredScrollLeft).
  // Runs in a layout effect so the new scrollLeft lands in the same paint as
  // the re-scaled axis -- no one-frame flash of the wrong hour.
  const prevPxPerHour = useRef(pxPerHour);
  useIsoLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || prevPxPerHour.current === pxPerHour) return;
    el.scrollLeft = anchoredScrollLeft(el.scrollLeft, el.clientWidth, prevPxPerHour.current, pxPerHour);
    prevPxPerHour.current = pxPerHour;
    syncViewport();
  }, [pxPerHour, syncViewport]);

  if (eventCount === 0) return <EmptyState label="No events on the timeline for this month." />;

  const x0 = viewport.left - OVERSCAN_PX;
  const x1 = viewport.left + viewport.width + OVERSCAN_PX;
  const y0 = viewport.top - OVERSCAN_PX;
  const y1 = viewport.top + viewport.height + OVERSCAN_PX;
  const visibleTicks = ticks.filter((t) => t.x >= x0 - 200 && t.x <= x1);

  return (
    <section className="space-y-3" data-timeline="" data-zoom={zoom}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Timeline zoom"
          className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1"
        >
          {TIMELINE_ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              data-zoom-button={z}
              aria-pressed={zoom === z}
              onClick={() => setZoom(z)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                zoom === z ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {ZOOM_LABEL[z]}
            </button>
          ))}
        </div>
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
      </div>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        data-timeline-scroller=""
        className="relative max-h-[70vh] overflow-auto overscroll-x-contain rounded-3xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="relative" style={{ width: totalWidth, height: totalHeight }}>
          {/* Axis: sticky to the top of the scroller, so the dates stay
              readable however far down a dense month's lanes go. */}
          <div
            className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/95 backdrop-blur"
            style={{ height: AXIS_HEIGHT_PX, width: totalWidth }}
          >
            {visibleTicks.map((t) => (
              <div
                key={t.x}
                className={`absolute top-0 h-full border-l pl-1 pt-2 text-[11px] font-semibold uppercase tracking-wide ${
                  t.major ? "border-slate-200 text-slate-500" : "border-slate-100 text-slate-300"
                }`}
                style={{ left: t.x }}
              >
                {t.label}
              </div>
            ))}
          </div>

          {/* Day gridlines behind the bars (majors only -- cheap, and what
              the eye actually uses to read "which day is this bar on"). */}
          {visibleTicks
            .filter((t) => t.major)
            .map((t) => (
              <div
                key={`g${t.x}`}
                aria-hidden
                className="absolute border-l border-slate-100"
                style={{ left: t.x, top: AXIS_HEIGHT_PX, height: totalHeight - AXIS_HEIGHT_PX }}
              />
            ))}

          {nowX !== null && (
            <div
              aria-hidden
              className="absolute z-10 w-px bg-fuchsia-500/70"
              style={{ left: nowX, top: 0, height: totalHeight }}
            />
          )}

          {groups.map((g) => {
            if (g.top > y1 || g.top + g.height < y0) return null;
            const header = g.label ? GROUP_HEADER_PX : 0;
            const lane0 = Math.floor((y0 - g.top - header) / LANE_HEIGHT_PX);
            const lane1 = Math.ceil((y1 - g.top - header) / LANE_HEIGHT_PX);
            return (
              <div key={g.label ?? "__all"}>
                {g.label && (
                  <div
                    className="absolute left-0 right-0 border-b border-t border-slate-100 bg-slate-50/70"
                    style={{ top: g.top, height: GROUP_HEADER_PX }}
                  >
                    <span className="sticky left-0 inline-block px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {g.label}
                    </span>
                  </div>
                )}
                {visibleBars(g.bars, x0, x1, lane0, lane1).map((bar) => (
                  <Bar key={bar.event.id} bar={bar} top={g.top + header + bar.lane * LANE_HEIGHT_PX} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-400">
        Times shown in each event&apos;s own timezone. {eventCount} event{eventCount === 1 ? "" : "s"} this month.
      </p>
    </section>
  );
}

export default TimelineView;
