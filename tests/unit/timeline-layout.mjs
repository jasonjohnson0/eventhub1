// Standalone verification of layoutTimeline() in src/views/TimelineView.tsx
// (spec 05). Copied verbatim (no app-specific imports) since that file isn't
// loadable outside the Vite/TanStack build. If the real implementation
// changes, mirror the change here too.
// Run: node tests/unit/timeline-layout.mjs

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
  if (endIsExactMidnight && end.getTime() > start.getTime()) end = addDays(end, -1);
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

const DAY_MS = 86_400_000;

function layoutTimeline(events, days) {
  const rows = [];
  for (const event of events) {
    const dates = occupiesDates(event);
    let startCol = -1;
    let endCol = -1;
    days.forEach((d, i) => {
      if (dates.some((od) => sameDay(od, d))) {
        if (startCol === -1) startCol = i;
        endCol = i;
      }
    });
    if (startCol === -1) continue;
    const timed = dates.length === 1;
    let fracStart = 0;
    let fracEnd = 1;
    if (timed) {
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);
      const dayStart = startOfDay(start).getTime();
      fracStart = Math.max(0, Math.min(1, (start.getTime() - dayStart) / DAY_MS));
      fracEnd = Math.max(fracStart + 0.03, Math.min(1, (end.getTime() - dayStart) / DAY_MS));
    }
    rows.push({ event, startCol, span: endCol - startCol + 1, timed, fracStart, fracEnd });
  }
  return rows.sort((a, b) => +new Date(a.event.start_time) - +new Date(b.event.start_time));
}

let failures = 0;
const check = (n, c, e = "") => {
  console.log(`${c ? "PASS" : "FAIL"}  ${n}${c ? "" : "  <-- " + e}`);
  if (!c) failures++;
};

// A 30-day axis anchored at day 0.
const AXIS_START = startOfDay(new Date("2026-09-01T12:00:00"));
const days = Array.from({ length: 30 }, (_, i) => addDays(AXIS_START, i));
const at = (dayIdx, hour, min = 0) => {
  const d = new Date(AXIS_START);
  d.setDate(d.getDate() + dayIdx);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};

// ---- a same-day timed event: a short bar at the right time of day --------
{
  const [row] = layoutTimeline([{ start_time: at(4, 18, 0), end_time: at(4, 20, 0) }], days);
  check("a same-day event lands on the right column", row.startCol === 4, String(row.startCol));
  check("a same-day event occupies exactly one column", row.span === 1, String(row.span));
  check("a same-day event is marked timed", row.timed === true);
  check("6pm start is 75% into the day", Math.abs(row.fracStart - 0.75) < 0.001, String(row.fracStart));
  check("8pm end is ~83% into the day", Math.abs(row.fracEnd - 0.8333) < 0.001, String(row.fracEnd));
  check("the bar is short, not a full-day block", row.fracEnd - row.fracStart < 0.2, String(row.fracEnd - row.fracStart));
}

// ---- a very short event still gets a minimum visible width ---------------
{
  const [row] = layoutTimeline([{ start_time: at(4, 12, 0), end_time: at(4, 12, 5) }], days);
  check("a 5-minute event still has a clickable minimum width", row.fracEnd - row.fracStart >= 0.03, String(row.fracEnd - row.fracStart));
}

// ---- a genuinely multi-day event spans full day columns -------------------
{
  const [row] = layoutTimeline([{ start_time: at(2, 18, 0), end_time: at(4, 14, 0) }], days);
  check("a 3-day event is not marked timed", row.timed === false);
  check("a 3-day event spans 3 day columns", row.span === 3, String(row.span));
  check("a 3-day event's bar fills the full column width (frac 0 to 1)", row.fracStart === 0 && row.fracEnd === 1);
}

// ---- an overnight event that only crosses one midnight stays single-day --
{
  const [row] = layoutTimeline([{ start_time: at(6, 22, 0), end_time: at(7, 1, 0) }], days);
  check("a 10pm-1am overnight event is timed (single day), not a 2-day bar", row.timed === true, JSON.stringify(row));
  check("...and it lands on its start day", row.startCol === 6, String(row.startCol));
}

// ---- an event entirely outside the visible axis is excluded ---------------
{
  const rows = layoutTimeline([{ start_time: at(-5, 18, 0), end_time: at(-5, 20, 0) }], days);
  check("an event before the visible window produces no row", rows.length === 0, String(rows.length));
}

// ---- events are sorted by start time --------------------------------------
{
  const rows = layoutTimeline(
    [
      { title: "second", start_time: at(10, 12, 0), end_time: at(10, 13, 0) },
      { title: "first", start_time: at(2, 12, 0), end_time: at(2, 13, 0) },
    ],
    days,
  );
  check("rows come back sorted by start time", rows[0].event.title === "first" && rows[1].event.title === "second",
    JSON.stringify(rows.map((r) => r.event.title)));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
