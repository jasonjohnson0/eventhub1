/**
 * Calendar date math for events, evaluated on each event's OWN wall clock.
 *
 * Moved out of queries/events.ts (which re-exports everything here, so no call
 * site changed its import) for two reasons:
 *  1. It had a real bug. occupiesDates() bucketed events by the *viewer's*
 *     local date, while every label printed the *event's* zone. A 6pm Chicago
 *     event seen from Tokyo read "6:00 PM" but sat on the next day's cell --
 *     and Day/Week views positioned it at 8am via getHours(). Everything here
 *     now goes through eventWall(), so the cell, the hour slot and the label
 *     all agree: "Saturday 6pm" is Saturday 6pm wherever you're looking from.
 *  2. This module is pure (only a relative import of the dependency-free
 *     timezone module), so the unit suite imports it directly rather than
 *     keeping a hand-copied duplicate in sync.
 */
import { safeTimeZone, toFloating } from "./timezone.ts";

type Timed = { start_time: string; end_time: string; timezone?: string | null };

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** An instant as a Date whose LOCAL getters (getDate, getHours, ...) read the
 *  event's wall-clock time in `timeZone` -- the currency every calendar grid
 *  in this app compares in, since grid cells are built from local Dates. With
 *  no zone it is just the instant in the viewer's zone (pre-spec-03 callers).
 *
 *  One known edge: if that wall time doesn't exist in the *viewer's* zone (a
 *  2:30am event on the viewer's own spring-forward night), the Date
 *  constructor rolls it to 3:30. It only ever moves an hour-slot position by
 *  one hour on one night a year, and never the day. */
export function eventWall(iso: string | Date, timeZone?: string | null): Date {
  if (!timeZone) return new Date(iso);
  const f = toFloating(new Date(iso), safeTimeZone(timeZone));
  return new Date(
    f.getUTCFullYear(),
    f.getUTCMonth(),
    f.getUTCDate(),
    f.getUTCHours(),
    f.getUTCMinutes(),
    f.getUTCSeconds(),
    f.getUTCMilliseconds(),
  );
}

/** Calendar dates (each a local-midnight Date) this event occupies, on its own
 *  wall clock. A short overnight event that just spills past midnight (a
 *  10pm-1am show) still reads as one night's event: "genuinely multi-day"
 *  means the event runs 12+ hours, or its end date lands 2+ calendar days
 *  after its start. An end at exactly midnight is exclusive (ends "at the
 *  start of" that date, the usual calendar convention).
 *
 *  Spec 02's own F2 write-up is internally inconsistent (its stated answer vs
 *  its literal recommended rule disagree on the 10pm-1am case); this
 *  implements the stated answer -- see TEAMWORK.md. */
export function occupiesDates(event: Timed): Date[] {
  const startWall = eventWall(event.start_time, event.timezone);
  const endRaw = eventWall(event.end_time, event.timezone);
  const start = startOfDay(startWall);
  const endIsExactMidnight =
    endRaw.getHours() === 0 && endRaw.getMinutes() === 0 && endRaw.getSeconds() === 0 && endRaw.getMilliseconds() === 0;
  let end = startOfDay(endRaw);
  if (endIsExactMidnight && end.getTime() > start.getTime()) end = addDays(end, -1);
  if (end.getTime() <= start.getTime()) return [start];

  // Real elapsed duration (instants, not wall times), so a DST night doesn't
  // make an 11.5h event look like 12.5h.
  const durationHours = (new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 3_600_000;
  const dayGap = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (durationHours < 12 && dayGap < 2) return [start];

  const dates: Date[] = [];
  let cur = start;
  while (cur.getTime() <= end.getTime()) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

export function occupiesDay(event: Timed, day: Date): boolean {
  return occupiesDates(event).some((d) => sameDay(d, day));
}

export function isMultiDay(event: Timed): boolean {
  return occupiesDates(event).length > 1;
}

/** Formats a time. With no `timeZone`, this is the viewer's own browser zone
 *  (pre-spec-03 behavior, still used by call sites that don't carry an
 *  event's zone). Pass an event's `timezone` to render it the way it reads on
 *  that event's own calendar -- "Saturday 6pm" means 6pm in that event's
 *  zone, not a silent conversion to whoever's looking. `abbr: true` appends
 *  the zone abbreviation ("6:00 PM CDT") where there's room. */
export function fmtTime(iso: string | Date, timeZone?: string | null, opts: { abbr?: boolean } = {}) {
  const zone = timeZone ? safeTimeZone(timeZone) : undefined;
  const base = new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(zone ? { timeZone: zone } : {}),
  });
  if (!opts.abbr || !zone) return base;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(
    new Date(iso),
  );
  const abbr = parts.find((p) => p.type === "timeZoneName")?.value;
  return abbr ? `${base} ${abbr}` : base;
}

/** A date label in the event's own zone. Several views formatted the start
 *  date with no zone while formatting the time with one, so an 11pm Pacific
 *  event read "Fri" + "11:00 PM" to a Pacific viewer and "Sat" + "11:00 PM"
 *  to an Eastern one. */
export function fmtEventDate(
  iso: string | Date,
  timeZone: string | null | undefined,
  opts: Intl.DateTimeFormatOptions,
): string {
  return new Date(iso).toLocaleDateString(undefined, {
    ...opts,
    ...(timeZone ? { timeZone: safeTimeZone(timeZone) } : {}),
  });
}

/** "Fri 3, 6:00 PM" for a single day, "Fri 3, 6:00 PM – Sun 5, 2:00 PM" for a
 *  range. Used by List/Agenda/Summary/Photo so a multi-day event gets one row
 *  with a range, not one row per occupied day. */
export function fmtDateRange(event: Timed, timeZone?: string | null): string {
  const zone = timeZone ?? event.timezone ?? undefined;
  const dates = occupiesDates({ ...event, timezone: zone });
  const dateOpts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const start = `${fmtEventDate(event.start_time, zone, dateOpts)}, ${fmtTime(event.start_time, zone)}`;
  if (dates.length === 1) return start;
  return `${start} – ${fmtEventDate(event.end_time, zone, dateOpts)}, ${fmtTime(event.end_time, zone)}`;
}
