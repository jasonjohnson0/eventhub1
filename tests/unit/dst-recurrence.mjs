// DST-aware recurrence: src/lib/recurrence.ts computeOccurrences(), imported
// for real (it used to be hand-copied here from series.functions.ts, which is
// how an hour-early spring-forward bug went unnoticed -- see wallToInstant).
//
// The four cases the gap-closure spec names explicitly, plus the RFC 5545
// edge cases (gap, ambiguous hour) and a check that the result does not
// depend on the SERVER's timezone.
// Run: node tests/unit/dst-recurrence.mjs
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeOccurrences, MAX_OCCURRENCES } from "../../src/lib/recurrence.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + extra}`);
  if (!cond) failures++;
};

const wall = (d, tz) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(d);
const hm = (d, tz) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(d);
const utcH = (d) => d.toISOString().slice(11, 16);

// 1. Non-DST: a weekly Tuesday 7pm Chicago series entirely inside summer.
{
  const tz = "America/Chicago";
  const { dates } = computeOccurrences("FREQ=WEEKLY;COUNT=8", new Date("2026-06-03T00:00:00Z"), null, tz); // Tue Jun 2, 7pm CDT
  check("non-DST: 8 weekly occurrences", dates.length === 8, dates.length);
  check("non-DST: every occurrence is Tue 19:00 local", dates.every((d) => wall(d, tz).startsWith("Tue, 19:00")),
    dates.map((d) => wall(d, tz)).join(" | "));
  check("non-DST: every occurrence is 7 days (exactly 168h) apart",
    dates.every((d, i) => i === 0 || d - dates[i - 1] === 7 * 86_400_000));
}

// 2. Spring-forward crossing (US: Sun Mar 8 2026). Weekly Saturday 6pm.
{
  const tz = "America/Chicago";
  const { dates } = computeOccurrences("FREQ=WEEKLY;COUNT=6", new Date("2026-02-22T00:00:00Z"), null, tz); // Sat Feb 21, 6pm CST
  check("spring-forward: 6 weekly occurrences", dates.length === 6, dates.length);
  check("spring-forward: every occurrence stays Sat 18:00 local",
    dates.every((d) => hm(d, tz) === "18:00"), dates.map((d) => wall(d, tz)).join(" | "));
  check("spring-forward: before the change they are 18:00 CST (00:00Z)",
    dates.slice(0, 3).every((d) => utcH(d) === "00:00" && wall(d, tz).includes("CST")), dates.map(utcH).join(","));
  check("spring-forward: after the change they are 18:00 CDT (23:00Z)",
    dates.slice(3).every((d) => utcH(d) === "23:00" && wall(d, tz).includes("CDT")), dates.map(utcH).join(","));
  check("spring-forward: the week spanning the change is 167h, not 168h", dates[3] - dates[2] === 167 * 3_600_000,
    String((dates[3] - dates[2]) / 3_600_000));
}

// 3. Fall-back crossing (US: Sun Nov 1 2026). Weekly Saturday 6pm.
{
  const tz = "America/Chicago";
  const { dates } = computeOccurrences("FREQ=WEEKLY;COUNT=5", new Date("2026-10-17T23:00:00Z"), null, tz); // Sat Oct 17, 6pm CDT
  check("fall-back: every occurrence stays Sat 18:00 local",
    dates.every((d) => hm(d, tz) === "18:00"), dates.map((d) => wall(d, tz)).join(" | "));
  check("fall-back: before the change they are CDT (23:00Z)",
    dates.slice(0, 3).every((d) => utcH(d) === "23:00"), dates.map(utcH).join(","));
  check("fall-back: after the change they are CST (00:00Z)",
    dates.slice(3).every((d) => utcH(d) === "00:00"), dates.map(utcH).join(","));
  check("fall-back: the week spanning the change is 169h", dates[3] - dates[2] === 169 * 3_600_000,
    String((dates[3] - dates[2]) / 3_600_000));
}

// 4. A zone with no DST (Arizona), across BOTH US transitions: the UTC time
//    never moves, because Phoenix's clock never moves.
{
  const tz = "America/Phoenix";
  const { dates } = computeOccurrences("FREQ=WEEKLY;UNTIL=20261115T000000Z", new Date("2026-02-01T01:00:00Z"), null, tz); // Sat Jan 31, 6pm MST
  check("Arizona: a weekly series from Feb to mid-Nov", dates.length >= 40, dates.length);
  check("Arizona: always 18:00 local", dates.every((d) => hm(d, tz) === "18:00"));
  check("Arizona: always 01:00Z (no DST shift at either US transition)", dates.every((d) => utcH(d) === "01:00"),
    [...new Set(dates.map(utcH))].join(","));
  check("Arizona: always exactly 168h apart", dates.every((d, i) => i === 0 || d - dates[i - 1] === 168 * 3_600_000));
}

// 5. Daily 11pm across spring-forward -- the late-night case nearest a day
//    boundary, where "every 24h" drift is most visible.
{
  const tz = "America/New_York";
  const { dates } = computeOccurrences("FREQ=DAILY;COUNT=10", new Date("2026-03-04T04:00:00Z"), null, tz); // Mar 3, 11pm EST
  check("daily 11pm: never drifts off 23:00 across the change", dates.every((d) => hm(d, tz) === "23:00"),
    dates.map((d) => wall(d, tz)).join(" | "));
}

// 6. RFC 5545 §3.3.5: a wall time inside the spring-forward GAP uses the
//    offset before the gap (-> 03:30 CDT), not an hour earlier.
{
  const tz = "America/Chicago";
  const { dates } = computeOccurrences("FREQ=WEEKLY;COUNT=3", new Date("2026-03-01T08:30:00Z"), null, tz); // Sun 2:30am CST
  check("gap: the transition Sunday's 02:30 (never occurs) becomes 03:30 CDT, not 01:30 CST",
    hm(dates[1], tz) === "03:30" && wall(dates[1], tz).includes("CDT"), wall(dates[1], tz));
  check("gap: the weeks either side keep 02:30", hm(dates[0], tz) === "02:30" && hm(dates[2], tz) === "02:30");
  // Same rule east of UTC (the old code resolved these in opposite directions).
  const b = computeOccurrences("FREQ=WEEKLY;COUNT=3", new Date("2026-03-22T01:30:00Z"), null, "Europe/Berlin").dates; // Sun 2:30 CET
  check("gap (east of UTC): Berlin's transition Sunday 02:30 also becomes 03:30 CEST",
    hm(b[1], "Europe/Berlin") === "03:30", wall(b[1], "Europe/Berlin"));
}

// 7. RFC 5545: an AMBIGUOUS fall-back wall time is its first occurrence.
{
  const tz = "America/Chicago";
  const { dates } = computeOccurrences("FREQ=WEEKLY;COUNT=3", new Date("2026-10-25T06:30:00Z"), null, tz); // Sun 1:30am CDT
  check("ambiguous: 01:30 on fall-back night is the first (CDT) occurrence, 06:30Z",
    dates[1].toISOString() === "2026-11-01T06:30:00.000Z", dates[1].toISOString());
  const b = computeOccurrences("FREQ=WEEKLY;COUNT=3", new Date("2026-10-18T00:30:00Z"), null, "Europe/Berlin").dates; // Sun 2:30 CEST
  check("ambiguous (east of UTC): Berlin 02:30 on fall-back night is the first (CEST) one, 00:30Z",
    b[1].toISOString() === "2026-10-25T00:30:00.000Z", b[1].toISOString());
}

// 8. Southern hemisphere (DST ends in April): weekly Wednesday 7pm Sydney.
{
  const tz = "Australia/Sydney";
  const { dates } = computeOccurrences("FREQ=WEEKLY;COUNT=5", new Date("2026-03-18T08:00:00Z"), null, tz); // Wed Mar 18, 7pm AEDT
  check("southern hemisphere: stays Wed 19:00 local across April's change", dates.every((d) => hm(d, tz) === "19:00"),
    dates.map((d) => wall(d, tz)).join(" | "));
}

// 9. Cap still bounds a runaway rule.
{
  const { dates, truncated } = computeOccurrences("FREQ=HOURLY", new Date("2026-01-01T00:00:00Z"), null, "UTC");
  check("a runaway FREQ=HOURLY is capped and reported truncated", dates.length === MAX_OCCURRENCES && truncated);
}

// 10. The server's own zone is irrelevant: same inputs, same instants, whether
//     the process runs in UTC (Vercel), New York or Tokyo.
{
  const self = fileURLToPath(import.meta.url);
  if (process.env.DST_CHILD) {
    const r = computeOccurrences("FREQ=WEEKLY;COUNT=6", new Date("2026-02-22T00:00:00Z"), null, "America/Chicago");
    console.log(JSON.stringify(r.dates.map((d) => d.toISOString())));
    process.exit(0);
  }
  const run = (TZ) =>
    execFileSync(process.execPath, [self], { env: { ...process.env, TZ, DST_CHILD: "1" }, encoding: "utf8" }).trim();
  const utc = run("UTC"), ny = run("America/New_York"), tokyo = run("Asia/Tokyo");
  check("server zone independence: UTC, New York and Tokyo servers agree", utc === ny && ny === tokyo, `${utc}\n${ny}\n${tokyo}`);
}

console.log("\n" + (failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED"));
process.exit(failures ? 1 : 0);
