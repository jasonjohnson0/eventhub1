/**
 * Shared IANA-timezone helpers (spec 03). Client-safe (only `Intl`, no
 * server-only imports), so both server functions and browser components can
 * use it -- unlike series.functions.ts's rrule-adjacent helpers, which this
 * module now backs instead of duplicating.
 */

export const DEFAULT_TIMEZONE = "America/Chicago";

/** Common US zones first (what almost every coordinator on this platform
 *  actually needs), then everything else `Intl` knows about. */
export const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "Pacific/Honolulu",
  "UTC",
] as const;

export const ALL_TIMEZONES: string[] = (() => {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: supportedValuesOf isn't in every lib.dom target yet
    const all: string[] = (Intl as any).supportedValuesOf?.("timeZone") ?? [];
    const common = new Set<string>(COMMON_TIMEZONES);
    return [...COMMON_TIMEZONES, ...all.filter((z) => !common.has(z))];
  } catch {
    return [...COMMON_TIMEZONES];
  }
})();

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** An unknown/deprecated IANA name falls back to UTC rather than throwing or
 *  silently mis-rendering (spec 03's stated edge case). */
export function safeTimeZone(tz: string | null | undefined): string {
  return isValidTimeZone(tz) ? tz : "UTC";
}

/** Offset (ms) to ADD to a real instant to get a Date whose UTC getters read
 *  as that instant's wall-clock time in `timeZone`. Moved here from
 *  series.functions.ts (which now imports it) so client components can share
 *  it too. */
export function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = offsetFormatter(timeZone).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  // Intl reports whole seconds; drop the instant's sub-second part too so a
  // .500 timestamp doesn't come back with a spurious -500ms "offset".
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Constructing an Intl.DateTimeFormat costs far more than using one (it
 *  loads locale and zone data each time), and tzOffsetMs runs twice per
 *  event per render in every calendar view. One cached formatter per zone
 *  took laying out 2,000 timeline events from ~430ms to a few ms; the set
 *  of zones in play is tiny, so the cache never needs evicting. Previously
 *  this function also called formatToParts once per field (six times). */
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
function offsetFormatter(timeZone: string): Intl.DateTimeFormat {
  let dtf = offsetFormatters.get(timeZone);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    offsetFormatters.set(timeZone, dtf);
  }
  return dtf;
}

/** A real instant -> a "floating" Date whose UTC getters read as that
 *  instant's wall-clock time in `timeZone`. */
export function toFloating(instant: Date, timeZone: string): Date {
  return new Date(instant.getTime() + tzOffsetMs(instant, timeZone));
}

/** The inverse of toFloating: a floating wall-clock Date -> the real instant
 *  in `timeZone`. Re-derives the offset from the candidate instant itself,
 *  not the floating guess, since the two can disagree right at a DST
 *  boundary. */
export function fromFloating(floating: Date, timeZone: string): Date {
  const guessOffset = tzOffsetMs(floating, timeZone);
  const candidate = floating.getTime() - guessOffset;
  const offset = tzOffsetMs(new Date(candidate), timeZone);
  return new Date(floating.getTime() - offset);
}

/** A floating wall-clock Date -> its real instant in `timeZone`, resolving the
 *  two DST edge cases exactly as RFC 5545 §3.3.5 specifies (so recurrence
 *  here agrees with Google/Apple/Outlook reading the same RRULE):
 *   - a wall time in a spring-forward GAP (never occurs) is interpreted with
 *     the UTC offset in effect *before* the gap, landing just after it
 *     (02:30 on a US spring-forward night -> 03:30 daylight time);
 *   - an AMBIGUOUS fall-back wall time (occurs twice) is its *first*
 *     occurrence (01:30 on a US fall-back night -> 01:30 daylight time).
 *  fromFloating alone gets both wrong in a hemisphere-dependent way: for
 *  zones west of UTC it resolved gaps an hour *backward* (a weekly 2:30am
 *  series produced 1:30am CST on the transition Sunday), and for zones east
 *  of UTC it picked the *second* occurrence of ambiguous times.
 *
 *  The offsets one day either side of the wall time bracket any single
 *  transition (a floating value is never more than ~14h from its instant,
 *  and no zone changes offset twice within two days). */
export function wallToInstant(floating: Date, timeZone: string): Date {
  const zone = safeTimeZone(timeZone);
  const f = floating.getTime();
  const before = tzOffsetMs(new Date(f - 86_400_000), zone);
  const after = tzOffsetMs(new Date(f + 86_400_000), zone);
  const withBefore = new Date(f - before);
  // Valid under the pre-transition offset: the normal case before a
  // transition, and the FIRST occurrence of an ambiguous time.
  if (toFloating(withBefore, zone).getTime() === f) return withBefore;
  const withAfter = new Date(f - after);
  if (toFloating(withAfter, zone).getTime() === f) return withAfter;
  // Neither offset reproduces this wall time: it's in a gap. RFC 5545 says
  // use the offset before the gap, which lands the instant after it.
  return withBefore;
}

/** Composes a "YYYY-MM-DDTHH:mm" wall-clock string (what a `datetime-local`
 *  input produces) with an IANA zone into the real instant it names. If that
 *  wall time falls in a DST spring-forward gap (it never actually occurs in
 *  that zone), snaps forward one hour and reports `snapped: true` so the
 *  caller can warn the coordinator on save, per spec 03's edge case. */
export function zonedWallTimeToInstant(
  wallTime: string,
  timeZone: string,
): { instant: Date; snapped: boolean } {
  const zone = safeTimeZone(timeZone);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wallTime);
  if (!m) throw new Error("Invalid datetime-local value");
  const floating = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0));
  // wallToInstant resolves gaps forward and ambiguous times to their first
  // occurrence (RFC 5545), the same rule recurring series use. A wall time
  // that doesn't round-trip was in a spring-forward gap: report it so the
  // form can warn the coordinator that their time moved.
  const instant = wallToInstant(floating, zone);
  const snapped = toFloating(instant, zone).getTime() !== floating.getTime();
  return { instant, snapped };
}

/** The inverse composition: a real instant -> the "YYYY-MM-DDTHH:mm" string
 *  a `datetime-local` input should show for it in `timeZone`. Replaces the
 *  browser-local-only `toLocalInput` helpers duplicated in event-modal.tsx
 *  and events.$id.manage.tsx. */
export function instantToWallTimeInput(instant: Date, timeZone: string): string {
  const floating = toFloating(instant, safeTimeZone(timeZone));
  return floating.toISOString().slice(0, 16);
}

/** Zone abbreviation at this instant, e.g. "CDT" (DST-aware). Falls back to
 *  the IANA name itself if the environment can't produce a short form. */
export function zoneAbbr(iso: string | Date, timeZone: string): string {
  const zone = safeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(
    new Date(iso),
  );
  return parts.find((p) => p.type === "timeZoneName")?.value ?? zone;
}

/** The viewer's own browser timezone -- used only to decide whether to show
 *  a secondary "your time" line, never to silently convert the primary
 *  display (spec 03 F2: a community calendar is a place, not a viewer). */
export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
