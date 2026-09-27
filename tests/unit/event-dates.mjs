// src/lib/event-dates.ts: every calendar view buckets events into day cells
// and hour rows with these helpers. Before the gap-closure fix they used the
// VIEWER's local clock while the labels used the EVENT's zone, so a 6pm
// Chicago event seen from Tokyo read "6:00 PM" but sat on Sunday's cell at
// 8am. These checks run the same assertions under several viewer zones
// (child processes with different TZ) and require identical answers.
// Run: node tests/unit/event-dates.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  eventWall,
  fmtDateRange,
  fmtEventDate,
  fmtTime,
  isMultiDay,
  occupiesDates,
  occupiesDay,
} from "../../src/lib/event-dates.ts";

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Everything a view derives from an event, as plain data.
function observe() {
  const chicago6pm = { start_time: "2026-09-19T23:00:00Z", end_time: "2026-09-20T03:00:00Z", timezone: "America/Chicago" }; // Sat 6-10pm CDT
  const tokyoMorning = { start_time: "2026-09-18T23:30:00Z", end_time: "2026-09-19T01:00:00Z", timezone: "Asia/Tokyo" }; // Sat 8:30-10am JST
  const laFest = { start_time: "2026-09-25T17:00:00Z", end_time: "2026-09-28T03:00:00Z", timezone: "America/Los_Angeles" }; // Fri 10am - Sun 8pm PDT
  const lateNightPacific = { start_time: "2026-09-19T06:00:00Z", end_time: "2026-09-19T08:00:00Z", timezone: "America/Los_Angeles" }; // Fri 11pm - Sat 1am PDT
  return {
    chicagoDays: occupiesDates(chicago6pm).map(ymd),
    chicagoHour: eventWall(chicago6pm.start_time, chicago6pm.timezone).getHours(),
    chicagoOnSat: occupiesDay(chicago6pm, new Date(2026, 8, 19)),
    chicagoOnSun: occupiesDay(chicago6pm, new Date(2026, 8, 20)),
    tokyoDays: occupiesDates(tokyoMorning).map(ymd),
    tokyoHour: eventWall(tokyoMorning.start_time, tokyoMorning.timezone).getHours(),
    festDays: occupiesDates(laFest).map(ymd),
    festMulti: isMultiDay(laFest),
    lateDays: occupiesDates(lateNightPacific).map(ymd),
    lateMulti: isMultiDay(lateNightPacific),
    chicagoLabel: `${fmtEventDate(chicago6pm.start_time, chicago6pm.timezone, { weekday: "short", timeZone: undefined })} ${fmtTime(chicago6pm.start_time, chicago6pm.timezone, { abbr: true })}`,
    lateLabel: fmtEventDate(lateNightPacific.start_time, lateNightPacific.timezone, { weekday: "long" }),
    festRange: fmtDateRange(laFest),
  };
}

if (process.env.EVENT_DATES_CHILD) {
  console.log(JSON.stringify(observe()));
  process.exit(0);
}

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + extra}`);
  if (!cond) failures++;
};

const self = fileURLToPath(import.meta.url);
const viewers = ["America/Chicago", "Asia/Tokyo", "Pacific/Honolulu", "Europe/London", "America/Phoenix"];
const results = Object.fromEntries(
  viewers.map((TZ) => [
    TZ,
    JSON.parse(execFileSync(process.execPath, [self], { env: { ...process.env, TZ, EVENT_DATES_CHILD: "1" }, encoding: "utf8" })),
  ]),
);

for (const tz of viewers) {
  const r = results[tz];
  check(`[viewer ${tz}] a Sat 6pm Chicago event is on Saturday's cell only`,
    JSON.stringify(r.chicagoDays) === '["2026-09-19"]' && r.chicagoOnSat && !r.chicagoOnSun, JSON.stringify(r));
  check(`[viewer ${tz}] ...in the 18:00 hour row`, r.chicagoHour === 18, String(r.chicagoHour));
  check(`[viewer ${tz}] a Sat 8:30am Tokyo event is Saturday, 08:00 row`,
    JSON.stringify(r.tokyoDays) === '["2026-09-19"]' && r.tokyoHour === 8, JSON.stringify(r));
  check(`[viewer ${tz}] a Fri-Sun LA festival occupies exactly Fri, Sat, Sun`,
    JSON.stringify(r.festDays) === '["2026-09-25","2026-09-26","2026-09-27"]' && r.festMulti, JSON.stringify(r.festDays));
  check(`[viewer ${tz}] an 11pm-1am Pacific show is one night (Friday), not two days`,
    JSON.stringify(r.lateDays) === '["2026-09-18"]' && !r.lateMulti, JSON.stringify(r.lateDays));
  check(`[viewer ${tz}] its date label says Friday, matching its cell`, r.lateLabel === "Friday", r.lateLabel);
  check(`[viewer ${tz}] labels carry the event's zone`, r.chicagoLabel.endsWith("6:00 PM CDT"), r.chicagoLabel);
}
const distinct = new Set(viewers.map((tz) => JSON.stringify(results[tz])));
check("every viewer zone derives byte-identical placement and labels", distinct.size === 1, [...distinct].join("\n"));

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
