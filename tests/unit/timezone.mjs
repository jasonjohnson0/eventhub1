// Standalone verification of src/lib/timezone.ts's wall-time <-> instant
// composition (spec 03). Copied verbatim (Intl-only, no app imports) rather
// than imported, matching tests/unit/dst-recurrence.mjs's approach -- that
// file isn't loadable outside the Vite/TanStack build either. If
// tzOffsetMs/toFloating/fromFloating/zonedWallTimeToInstant/safeTimeZone
// change in src/lib/timezone.ts, mirror the change here too.
// Run: node tests/unit/timezone.mjs

function isValidTimeZone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
function safeTimeZone(tz) {
  return isValidTimeZone(tz) ? tz : "UTC";
}
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
function zonedWallTimeToInstant(wallTime, timeZone) {
  const zone = safeTimeZone(timeZone);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wallTime);
  if (!m) throw new Error("Invalid datetime-local value");
  const floating = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0));
  const instant = fromFloating(floating, zone);
  const roundTrip = toFloating(instant, zone);
  if (roundTrip.getTime() === floating.getTime()) return { instant, snapped: false };
  const nudged = new Date(floating.getTime() + 60 * 60_000);
  return { instant: fromFloating(nudged, zone), snapped: true };
}
function instantToWallTimeInput(instant, timeZone) {
  const floating = toFloating(instant, safeTimeZone(timeZone));
  return floating.toISOString().slice(0, 16);
}
function zoneAbbr(iso, timeZone) {
  const zone = safeTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(
    new Date(iso),
  );
  return parts.find((p) => p.type === "timeZoneName")?.value ?? zone;
}

let failures = 0;
const check = (n, c, e = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  <-- " + e}`);
  if (!c) failures++;
};

// ---- basic composition --------------------------------------------------
{
  // 6:00 PM America/Chicago in July is CDT (UTC-5).
  const { instant, snapped } = zonedWallTimeToInstant("2026-07-04T18:00", "America/Chicago");
  check("composes a summer wall time to the right UTC instant", instant.toISOString() === "2026-07-04T23:00:00.000Z", instant.toISOString());
  check("no DST snap for an ordinary time", snapped === false);
}
{
  // 6:00 PM America/Chicago in January is CST (UTC-6).
  const { instant } = zonedWallTimeToInstant("2026-01-04T18:00", "America/Chicago");
  check("composes a winter wall time to the right UTC instant", instant.toISOString() === "2026-01-05T00:00:00.000Z", instant.toISOString());
}
{
  const { instant } = zonedWallTimeToInstant("2026-07-04T18:00", "UTC");
  check("UTC composition is a straight pass-through", instant.toISOString() === "2026-07-04T18:00:00.000Z", instant.toISOString());
}

// ---- round trip -----------------------------------------------------------
for (const [wall, zone] of [
  ["2026-03-01T09:30", "America/New_York"],
  ["2026-12-25T20:15", "America/Los_Angeles"],
  ["2026-06-15T00:05", "Pacific/Honolulu"],
]) {
  const { instant } = zonedWallTimeToInstant(wall, zone);
  const back = instantToWallTimeInput(instant, zone);
  check(`round-trips ${wall} in ${zone}`, back === wall, back);
}

// ---- DST spring-forward gap ------------------------------------------------
{
  // US spring-forward 2026: clocks jump from 1:59:59 AM to 3:00:00 AM on
  // March 8 in America/Chicago -- 2:30 AM that day never happens.
  const { instant, snapped } = zonedWallTimeToInstant("2026-03-08T02:30", "America/Chicago");
  check("a spring-forward gap is detected", snapped === true);
  const backOut = instantToWallTimeInput(instant, "America/Chicago");
  check("the snapped instant lands after the gap, not before it", backOut >= "2026-03-08T03:00", backOut);
}
{
  // An ordinary time on the same day, well clear of the gap, is untouched.
  const { snapped } = zonedWallTimeToInstant("2026-03-08T10:00", "America/Chicago");
  check("a normal time on a DST-transition day is not flagged", snapped === false);
}

// ---- fall-back (ambiguous, not a gap) -- must not spuriously "snap" -------
{
  // US fall-back 2026: 1:30 AM occurs twice in America/Chicago on Nov 1.
  // It's ambiguous, not nonexistent, so this must resolve to *some* real
  // instant without being reported as a gap.
  const { instant, snapped } = zonedWallTimeToInstant("2026-11-01T01:30", "America/Chicago");
  check("an ambiguous fall-back time is not reported as a DST gap", snapped === false);
  check("an ambiguous fall-back time still resolves to a real instant", !Number.isNaN(instant.getTime()));
}

// ---- unknown zone falls back to UTC, not a throw --------------------------
{
  const { instant } = zonedWallTimeToInstant("2026-07-04T18:00", "Nowhere/Fake");
  check("an unknown IANA zone falls back to UTC rather than throwing", instant.toISOString() === "2026-07-04T18:00:00.000Z", instant.toISOString());
  check("safeTimeZone itself falls back to UTC for an unknown zone", safeTimeZone("Nowhere/Fake") === "UTC");
  check("safeTimeZone passes through a valid zone unchanged", safeTimeZone("America/Denver") === "America/Denver");
}

// ---- zone abbreviations vary with DST --------------------------------------
{
  const summer = zoneAbbr("2026-07-04T18:00:00Z", "America/Chicago");
  const winter = zoneAbbr("2026-01-04T18:00:00Z", "America/Chicago");
  check("summer abbreviation is CDT", summer === "CDT", summer);
  check("winter abbreviation is CST", winter === "CST", winter);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
