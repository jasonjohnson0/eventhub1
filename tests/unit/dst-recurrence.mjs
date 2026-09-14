// Standalone verification of the DST-aware recurrence math in
// series.functions.ts computeOccurrences(). Copied verbatim (these helpers
// have no app-specific imports) rather than imported, since that file is a
// createServerFn module that isn't loadable outside the Vite/TanStack build.
// If tzOffsetMs/toFloating/fromFloating/computeOccurrences change there,
// mirror the change here too.
// Run: node tests/unit/dst-recurrence.mjs
import pkg from "rrule";
const { rrulestr } = pkg;

const MAX_OCCURRENCES = 400;

function tzOffsetMs(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const get = (t) => Number(dtf.formatToParts(instant).find((p) => p.type === t)?.value ?? "0");
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asIfUtc - instant.getTime();
}
function toFloating(instant, timeZone) {
  return new Date(instant.getTime() + tzOffsetMs(instant, timeZone));
}
function fromFloating(floating, timeZone) {
  const guessOffset = tzOffsetMs(floating, timeZone);
  const candidate = floating.getTime() - guessOffset;
  const offset = tzOffsetMs(new Date(candidate), timeZone);
  return new Date(floating.getTime() - offset);
}
function computeOccurrences(rrule, dtstart, until, timezone) {
  const floatingStart = toFloating(dtstart, timezone);
  const rule = rrulestr(
    `DTSTART:${floatingStart.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}\nRRULE:${rrule}`,
    { forceset: false },
  );
  const floatingHardCap = until
    ? toFloating(until, timezone)
    : new Date(floatingStart.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
  const all = rule.between(floatingStart, floatingHardCap, true);
  return {
    dates: all.slice(0, MAX_OCCURRENCES).map((f) => fromFloating(f, timezone)),
    truncated: all.length > MAX_OCCURRENCES,
  };
}

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + extra}`);
  if (!cond) failures++;
};

const localHour = (d, tz) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(d);

// US Eastern: spring-forward 2027-03-14 02:00 -> 03:00; fall-back 2027-11-07 02:00 -> 01:00.
const TZ = "America/New_York";

// A daily 11pm series starting a week before the March 2027 spring-forward,
// running three weeks past it -- every single occurrence must still read as
// 23:00 in America/New_York, even though the UTC offset changes underneath it.
{
  const dtstart = new Date(Date.UTC(2027, 2, 7, 4, 0, 0)); // 2027-03-06 23:00 EST (UTC-5)
  const until = new Date(Date.UTC(2027, 2, 28, 23, 0, 0));
  const { dates } = computeOccurrences("FREQ=DAILY", dtstart, until, TZ);
  check("spring-forward: produced the expected number of daily occurrences", dates.length === 22, dates.length);
  const wrongHour = dates.filter((d) => localHour(d, TZ) !== "23:00");
  check(
    "spring-forward: every occurrence still reads 23:00 local time",
    wrongHour.length === 0,
    wrongHour.map((d) => `${d.toISOString()} -> ${localHour(d, TZ)}`).join(", "),
  );
  // The naive (pre-fix) approach added exactly 24h in UTC each day, so the
  // occurrence on/after the transition would land on 00:00 local, not 23:00.
  const afterTransition = dates.find((d) => d.getTime() > Date.UTC(2027, 2, 14, 7, 0, 0));
  check("a post-transition occurrence exists to check", !!afterTransition);
  if (afterTransition) {
    check(
      "...and specifically is not the pre-fix bug (00:00 local)",
      localHour(afterTransition, TZ) === "23:00",
      localHour(afterTransition, TZ),
    );
  }
}

// Same test across the November 2027 fall-back.
{
  const dtstart = new Date(Date.UTC(2027, 10, 1, 3, 0, 0)); // 2027-10-31 23:00 EDT (UTC-4)
  const until = new Date(Date.UTC(2027, 10, 21, 23, 0, 0));
  const { dates } = computeOccurrences("FREQ=DAILY", dtstart, until, TZ);
  const wrongHour = dates.filter((d) => localHour(d, TZ) !== "23:00");
  check(
    "fall-back: every occurrence still reads 23:00 local time",
    wrongHour.length === 0,
    wrongHour.map((d) => `${d.toISOString()} -> ${localHour(d, TZ)}`).join(", "),
  );
}

// A non-DST timezone (Arizona doesn't observe it) should be unaffected either way.
{
  const TZ2 = "America/Phoenix";
  const dtstart = new Date(Date.UTC(2027, 2, 7, 6, 0, 0)); // 2027-03-06 23:00 MST (UTC-7, no DST)
  const until = new Date(Date.UTC(2027, 2, 21, 23, 0, 0));
  const { dates } = computeOccurrences("FREQ=DAILY", dtstart, until, TZ2);
  const wrongHour = dates.filter((d) => localHour(d, TZ2) !== "23:00");
  check("a non-DST zone is unaffected", wrongHour.length === 0, wrongHour.join(", "));
}

console.log("\n" + (failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED"));
process.exit(failures ? 1 : 0);
