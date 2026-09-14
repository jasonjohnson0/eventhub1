// Standalone verification of occupiesDates()/occupiesDay()/isMultiDay() in
// src/queries/events.ts (spec 02, multi-day rendering). Copied verbatim
// (no app-specific imports) since that file isn't loadable outside the
// Vite/TanStack build. If the real implementation changes, mirror the
// change here too.
// Run: node tests/unit/occupies-dates.mjs

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function occupiesDates(event) {
  const start = startOfDay(new Date(event.start_time));
  const endRaw = new Date(event.end_time);
  const endIsExactMidnight =
    endRaw.getHours() === 0 && endRaw.getMinutes() === 0 && endRaw.getSeconds() === 0 && endRaw.getMilliseconds() === 0;
  let end = startOfDay(endRaw);
  if (endIsExactMidnight && end.getTime() > start.getTime()) {
    end = addDays(end, -1);
  }
  if (end.getTime() <= start.getTime()) return [start];

  const durationHours = (new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 3_600_000;
  const dayGap = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (durationHours < 12 && dayGap < 2) return [start];

  const dates = [];
  let cur = start;
  while (cur.getTime() <= end.getTime()) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}
function occupiesDay(event, day) {
  return occupiesDates(event).some((d) => sameDay(d, day));
}
function isMultiDay(event) {
  return occupiesDates(event).length > 1;
}

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + extra}`);
  if (!cond) failures++;
};

const iso = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).toISOString();

// ---- the headline 3-day case ---------------------------------------------
{
  const ev = { start_time: iso(2027, 6, 4, 18, 0), end_time: iso(2027, 6, 6, 14, 0) }; // Fri 6pm - Sun 2pm
  const dates = occupiesDates(ev);
  check("Fri 6pm - Sun 2pm occupies exactly 3 dates", dates.length === 3, dates.map((d) => d.getDate()));
  check("...Friday", dates[0].getDate() === 4);
  check("...Saturday", dates[1].getDate() === 5);
  check("...Sunday", dates[2].getDate() === 6);
  check("isMultiDay is true", isMultiDay(ev));
  check("occupiesDay is true for the Saturday in between", occupiesDay(ev, new Date(2027, 5, 5)));
  check("occupiesDay is false for the day before", !occupiesDay(ev, new Date(2027, 5, 3)));
  check("occupiesDay is false for the day after", !occupiesDay(ev, new Date(2027, 5, 7)));
}

// ---- overnight single-day show: must NOT span two days -------------------
// This is the case spec 02's own acceptance criteria calls out explicitly.
{
  const ev = { start_time: iso(2027, 6, 4, 22, 0), end_time: iso(2027, 6, 5, 1, 0) }; // 10pm - 1am
  const dates = occupiesDates(ev);
  check("a 10pm-1am overnight event occupies exactly 1 date, not 2", dates.length === 1, dates.length);
  check("...and it's the start date, not the end date", dates[0].getDate() === 4);
  check("isMultiDay is false", !isMultiDay(ev));
}

// ---- ordinary single-day event --------------------------------------------
{
  const ev = { start_time: iso(2027, 6, 4, 14, 0), end_time: iso(2027, 6, 4, 16, 0) };
  const dates = occupiesDates(ev);
  check("a same-day 2pm-4pm event occupies exactly 1 date", dates.length === 1);
  check("isMultiDay is false", !isMultiDay(ev));
}

// ---- exact-midnight end: exclusive, doesn't spill into the next date -----
{
  const ev = { start_time: iso(2027, 6, 4, 20, 0), end_time: iso(2027, 6, 5, 0, 0) }; // 8pm - exactly midnight
  const dates = occupiesDates(ev);
  check("an event ending at exactly midnight occupies only its start date", dates.length === 1 && dates[0].getDate() === 4, dates.length);
}

// ---- exact-midnight end across a real multi-day span ----------------------
{
  const ev = { start_time: iso(2027, 6, 4, 20, 0), end_time: iso(2027, 6, 7, 0, 0) }; // 8pm Fri - exactly midnight Mon
  const dates = occupiesDates(ev);
  check("Fri 8pm - Mon midnight (exclusive) occupies Fri/Sat/Sun, not Monday",
    dates.length === 3 && dates[2].getDate() === 6, dates.map((d) => d.getDate()));
}

// ---- a 40-day event: still enumerable, not an explosion guard needed here (the
// view layer is responsible for clipping to the visible grid) --------------
{
  const ev = { start_time: iso(2027, 6, 1, 9, 0), end_time: iso(2027, 7, 11, 9, 0) };
  const dates = occupiesDates(ev);
  check("a 40-day event returns 41 dates (inclusive both ends)", dates.length === 41, dates.length);
}

// ---- recurring-occurrence independence: two occurrences of the same series
// don't influence each other (occupiesDates is pure per-event) ------------
{
  const occ1 = { start_time: iso(2027, 6, 7, 18, 0), end_time: iso(2027, 6, 8, 22, 0) };
  const occ2 = { start_time: iso(2027, 6, 14, 18, 0), end_time: iso(2027, 6, 15, 22, 0) };
  check("occurrence 1 does not occupy occurrence 2's dates", !occupiesDay(occ1, new Date(2027, 5, 14)));
  check("occurrence 2 does not occupy occurrence 1's dates", !occupiesDay(occ2, new Date(2027, 5, 7)));
}

console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`));
process.exit(failures === 0 ? 0 : 1);
