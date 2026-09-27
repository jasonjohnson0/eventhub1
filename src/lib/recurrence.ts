/**
 * DST-aware RRULE expansion for recurring series. Moved out of
 * series.functions.ts (a createServerFn module Node can't load outside the
 * Vite build) so tests/unit/dst-recurrence.mjs exercises this exact code
 * instead of a hand-copied duplicate of it.
 *
 * toFloating/fromFloating convert between a real instant and a "floating"
 * Date whose UTC getters read as that instant's wall-clock time in a given
 * IANA zone. rrule only does calendar arithmetic on UTC getters, so expansion
 * runs entirely on floating dates in the SERIES' zone and each occurrence is
 * converted back to a real instant afterwards. Otherwise "every Tuesday at
 * 7pm" would really mean "every 168 hours" and land at 6pm or 8pm local after
 * a DST change -- in the event's zone, and regardless of which zone the
 * server happens to run in.
 */
import * as rruleNs from "rrule";
import { safeTimeZone, toFloating, wallToInstant } from "./timezone.ts";

// rrule ships CommonJS as `main` and ESM as `module`. Vite resolves the ESM
// build (named exports on the namespace); plain Node, which the unit suite
// uses, resolves the CommonJS build, where named imports fail and the exports
// live on `default`. Reading through the namespace works in both.
// biome-ignore lint/suspicious/noExplicitAny: bridging two module shapes of one package
const rrule: typeof import("rrule") = (rruleNs as any).rrulestr ? rruleNs : (rruleNs as any).default;

// A year of daily events is 365 occurrences, and coordinators schedule a year
// ahead, so 100 cut those series off after about fourteen weeks. The cap still
// exists to bound a runaway rule like FREQ=HOURLY, which would otherwise try to
// insert tens of thousands of rows.
export const MAX_OCCURRENCES = 400;

/** Real start instants of every occurrence of `rruleText` from `dtstart`, in
 *  `timezone`, up to `until` (inclusive) or two years out. Per RFC 5545 (see
 *  wallToInstant): a wall time in a spring-forward gap lands just after the
 *  gap, and an ambiguous fall-back wall time is its first occurrence. */
export function computeOccurrences(
  rruleText: string,
  dtstart: Date,
  until: Date | null,
  timezone: string,
): { dates: Date[]; truncated: boolean } {
  const zone = safeTimeZone(timezone);
  const floatingStart = toFloating(dtstart, zone);
  const rule = rrule.rrulestr(
    `DTSTART:${floatingStart.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}\nRRULE:${rruleText}`,
    { forceset: false },
  ) as InstanceType<typeof rrule.RRule>;
  const floatingHardCap = until
    ? toFloating(until, zone)
    : new Date(floatingStart.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
  const all = rule.between(floatingStart, floatingHardCap, true);
  return {
    dates: all.slice(0, MAX_OCCURRENCES).map((f) => wallToInstant(f, zone)),
    truncated: all.length > MAX_OCCURRENCES,
  };
}
