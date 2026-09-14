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
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const get = (t: string) => Number(dtf.formatToParts(instant).find((p) => p.type === t)?.value ?? "0");
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asIfUtc - instant.getTime();
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
  const instant = fromFloating(floating, zone);
  // Round-trip check: format the candidate instant back into the zone's wall
  // clock. If it doesn't match what was asked for, that wall time never
  // existed (a spring-forward gap) -- nudge an hour later and resolve again,
  // which lands after every real-world gap.
  const roundTrip = toFloating(instant, zone);
  if (roundTrip.getTime() === floating.getTime()) return { instant, snapped: false };
  const nudged = new Date(floating.getTime() + 60 * 60_000);
  return { instant: fromFloating(nudged, zone), snapped: true };
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
