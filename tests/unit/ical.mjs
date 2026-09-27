// src/lib/ical.ts: per-event-zone iCalendar output.
//
// The acceptance bar is "opens correctly in Apple/Google/Outlook with the
// right zone". Those apps resolve DTSTART;TZID=<zone>:<local time> through
// the VTIMEZONE block in the same file (Outlook relies on it entirely), so
// the property that matters is: resolving every event's local DTSTART/DTEND
// through the emitted VTIMEZONE -- using ONLY the text of the file, with a
// resolver written independently of the generator -- yields the original
// instant. That is checked for every event below, across DST in both
// hemispheres and a no-DST zone, plus RFC 5545 structural rules.
// Run: node tests/unit/ical.mjs
import { buildIcs, fold, zoneTransitions } from "../../src/lib/ical.ts";

let failures = 0;
const check = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  <-- " + String(extra).slice(0, 400)}`);
  if (!cond) failures++;
};

const events = [
  // Chicago, before and after both US transitions.
  { id: "c1", title: "Winter mixer", start_time: "2026-02-21T00:00:00Z", end_time: "2026-02-21T03:00:00Z", timezone: "America/Chicago" },
  { id: "c2", title: "Spring mixer", start_time: "2026-03-14T23:00:00Z", end_time: "2026-03-15T02:00:00Z", timezone: "America/Chicago" },
  { id: "c3", title: "Fall mixer", start_time: "2026-11-07T00:00:00Z", end_time: "2026-11-07T03:00:00Z", timezone: "America/Chicago" },
  // Ends after the fall-back instant: DTEND local must use the other offset.
  { id: "c4", title: "Overnight across fall-back", start_time: "2026-11-01T03:00:00Z", end_time: "2026-11-01T09:00:00Z", timezone: "America/Chicago" },
  // Arizona: no DST at all.
  { id: "a1", title: "Phoenix summer", start_time: "2026-07-11T01:00:00Z", end_time: "2026-07-11T03:00:00Z", timezone: "America/Phoenix" },
  { id: "a2", title: "Phoenix winter", start_time: "2026-12-12T01:00:00Z", end_time: "2026-12-12T03:00:00Z", timezone: "America/Phoenix" },
  // Southern hemisphere and a half-hour zone.
  { id: "s1", title: "Sydney autumn", start_time: "2026-04-01T08:00:00Z", end_time: "2026-04-01T10:00:00Z", timezone: "Australia/Sydney" },
  { id: "s2", title: "Sydney after DST ends", start_time: "2026-04-15T09:00:00Z", end_time: "2026-04-15T11:00:00Z", timezone: "Australia/Sydney" },
  { id: "k1", title: "Kolkata +05:30", start_time: "2026-06-01T13:30:00Z", end_time: "2026-06-01T15:00:00Z", timezone: "Asia/Kolkata" },
  // UTC: plain Z time, no VTIMEZONE.
  { id: "u1", title: "UTC call", start_time: "2026-05-05T15:00:00Z", end_time: "2026-05-05T16:00:00Z", timezone: "UTC" },
  // Escaping and multi-byte folding.
  { id: "m1", title: "Café Crème, Jazz; Night — ünïcödé 🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷🎷", description: "Line one\nLine two, with; punctuation\\", location: "Main St, Suite 5", start_time: "2026-09-19T23:00:00Z", end_time: "2026-09-20T03:00:00Z", timezone: "America/Chicago" },
].map((e) => ({ description: null, location: null, ...e }));

const ics = buildIcs("Riverside — Test", events, new Date("2026-09-27T12:00:00Z"));

// ---- RFC 5545 structure ------------------------------------------------------
{
  const raw = ics.split("\r\n");
  check("uses CRLF line endings throughout (no bare LF)", !/[^\r]\n/.test(ics));
  const enc = new TextEncoder();
  const long = raw.filter((l) => enc.encode(l).length > 75);
  check("no physical line exceeds 75 octets (multi-byte titles included)", long.length === 0, long.join(" | "));
  check("begins with BEGIN:VCALENDAR and ends with END:VCALENDAR", raw[0] === "BEGIN:VCALENDAR" && raw.at(-2) === "END:VCALENDAR");
  // Folding never splits a UTF-8 character: unfolded text round-trips.
  const unfolded = ics.replace(/\r\n /g, "");
  check("folding round-trips the emoji title exactly", unfolded.includes("🎷".repeat(20)));
  check("fold() leaves short lines alone", fold("SUMMARY:x") === "SUMMARY:x");
}

const unfolded = ics.replace(/\r\n /g, "").split("\r\n");

// ---- independent VTIMEZONE resolver ---------------------------------------------
const parseLocal = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));
const parseOff = (s) => (s[0] === "-" ? -1 : 1) * (+s.slice(1, 3) * 60 + +s.slice(3, 5)) * 60_000;
const zones = {};
for (let i = 0; i < unfolded.length; i++) {
  if (unfolded[i] !== "BEGIN:VTIMEZONE") continue;
  const tzid = unfolded[i + 1].replace("TZID:", "");
  const obs = [];
  let cur = null;
  for (let j = i + 1; unfolded[j] !== "END:VTIMEZONE"; j++) {
    const l = unfolded[j];
    if (l === "BEGIN:STANDARD" || l === "BEGIN:DAYLIGHT") cur = { kind: l.slice(6) };
    else if (l.startsWith("DTSTART:")) cur.local = parseLocal(l.slice(8));
    else if (l.startsWith("TZOFFSETFROM:")) cur.from = parseOff(l.slice(13));
    else if (l.startsWith("TZOFFSETTO:")) cur.to = parseOff(l.slice(11));
    else if (l.startsWith("TZNAME:")) cur.name = l.slice(7);
    else if (l.startsWith("END:") && cur) { obs.push({ ...cur, onset: cur.local - cur.from }); cur = null; }
  }
  zones[tzid] = obs.sort((a, b) => a.onset - b.onset);
}
// RFC 5545: a local time is governed by the observance whose onset is the
// latest one at or before it. Try each observance's offset and keep the one
// that is self-consistent.
function resolve(tzid, local) {
  const obs = zones[tzid];
  if (!obs) return null;
  for (let k = obs.length - 1; k >= 0; k--) {
    const instant = local - obs[k].to;
    const governing = obs.filter((o) => o.onset <= instant).at(-1);
    if (governing === obs[k]) return instant;
  }
  return null;
}

check("a VTIMEZONE is emitted for each non-UTC zone used",
  ["America/Chicago", "America/Phoenix", "Australia/Sydney", "Asia/Kolkata"].every((z) => zones[z]), Object.keys(zones).join(","));
check("no VTIMEZONE for UTC", !zones.UTC && !zones["Etc/UTC"]);
check("Arizona's VTIMEZONE has no DAYLIGHT observance", zones["America/Phoenix"]?.every((o) => o.kind === "STANDARD"));
check("Chicago's VTIMEZONE includes the 2026 spring-forward onset (20260308T020000, -0600 -> -0500)",
  ics.includes("DTSTART:20260308T020000\r\nTZOFFSETFROM:-0600\r\nTZOFFSETTO:-0500"));
check("...and the 2026 fall-back onset (20261101T020000, -0500 -> -0600)",
  ics.includes("DTSTART:20261101T020000\r\nTZOFFSETFROM:-0500\r\nTZOFFSETTO:-0600"));
check("Kolkata's half-hour offset is written as +0530", ics.includes("TZOFFSETTO:+0530"));

const vevents = [];
for (let i = 0; i < unfolded.length; i++) {
  if (unfolded[i] !== "BEGIN:VEVENT") continue;
  const ev = {};
  for (let j = i + 1; unfolded[j] !== "END:VEVENT"; j++) {
    const [k, v] = [unfolded[j].slice(0, unfolded[j].indexOf(":")), unfolded[j].slice(unfolded[j].indexOf(":") + 1)];
    ev[k.split(";")[0]] = { params: k, value: v };
  }
  vevents.push(ev);
}
check("one VEVENT per event", vevents.length === events.length, vevents.length);

for (const src of events) {
  const ev = vevents.find((v) => v.UID.value === `${src.id}@eventhub`);
  for (const [prop, iso] of [["DTSTART", src.start_time], ["DTEND", src.end_time]]) {
    const p = ev[prop];
    let resolved;
    if (p.value.endsWith("Z")) {
      resolved = Date.UTC(+p.value.slice(0, 4), +p.value.slice(4, 6) - 1, +p.value.slice(6, 8), +p.value.slice(9, 11), +p.value.slice(11, 13), +p.value.slice(13, 15));
    } else {
      const tzid = /TZID=([^;:]+)/.exec(p.params)?.[1];
      resolved = resolve(tzid, parseLocal(p.value));
    }
    check(`${src.id} ${prop}: resolving through the file's own VTIMEZONE gives the original instant`,
      resolved === Date.parse(iso), `${p.params}:${p.value} -> ${resolved && new Date(resolved).toISOString()} vs ${iso}`);
  }
  if (src.timezone !== "UTC") {
    check(`${src.id}: written in its own zone (TZID=${src.timezone})`, ev.DTSTART.params === `DTSTART;TZID=${src.timezone}`, ev.DTSTART.params);
  }
}
const c2 = vevents.find((v) => v.UID.value === "c2@eventhub");
check("a 6pm CDT event reads 180000 local, not the UTC 230000", c2.DTSTART.value === "20260314T180000", c2.DTSTART.value);
const u1 = vevents.find((v) => v.UID.value === "u1@eventhub");
check("a UTC event is a plain Z time", u1.DTSTART.params === "DTSTART" && u1.DTSTART.value === "20260505T150000Z");
const m1 = vevents.find((v) => v.UID.value === "m1@eventhub");
check("text escaping: commas, semicolons, backslashes and newlines",
  m1.SUMMARY.value.includes("Crème\\, Jazz\\; Night") && m1.DESCRIPTION.value === "Line one\\nLine two\\, with\\; punctuation\\\\");

// ---- transition finder ---------------------------------------------------------
{
  const tr = zoneTransitions("America/New_York", Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1));
  check("finds exactly 2 New York transitions in 2026", tr.length === 2, JSON.stringify(tr));
  check("...at exactly 2026-03-08T07:00Z and 2026-11-01T06:00Z",
    tr[0]?.at === Date.UTC(2026, 2, 8, 7) && tr[1]?.at === Date.UTC(2026, 10, 1, 6), tr.map((t) => new Date(t.at).toISOString()).join(","));
  check("finds none for Phoenix", zoneTransitions("America/Phoenix", Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1)).length === 0);
  // Window bounds that are not minute-aligned must not stall the bisection.
  const odd = zoneTransitions("Europe/London", Date.UTC(2026, 2, 28, 23, 59, 59, 123), Date.UTC(2026, 2, 29, 12, 0, 0, 7));
  check("unaligned window bounds still find London's transition at 01:00Z", odd.length === 1 && odd[0].at === Date.UTC(2026, 2, 29, 1), JSON.stringify(odd));
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
