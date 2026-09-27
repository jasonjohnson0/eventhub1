/**
 * iCalendar (RFC 5545) serialization, shared by the coordinator feed
 * (/api/public/ical/$token) and the per-event "Add to Calendar" download.
 * Pure (only a relative import of the dependency-free timezone module), so
 * tests/unit/ical.mjs imports it directly.
 *
 * Times are written in each event's OWN zone -- DTSTART;TZID=America/Chicago:
 * 20260919T180000 -- with a VTIMEZONE block per zone describing its offsets.
 * The previous output was bare UTC (DTSTART:20260919T230000Z): the same
 * instant, but calendar apps then show the event in the subscriber's zone
 * with no link to the zone it was scheduled in, and edits made there drift
 * across DST. A generated VTIMEZONE (not just a TZID name) matters for
 * Outlook, which does not resolve IANA names on its own.
 */
import { safeTimeZone, tzOffsetMs, zoneAbbr } from "./timezone.ts";

export type IcalEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  timezone?: string | null;
  event_format?: string | null;
  virtual_link?: string | null;
};

function pad(n: number, w = 2): string {
  return String(Math.abs(n)).padStart(w, "0");
}

/** A Date as an iCalendar UTC timestamp: YYYYMMDDTHHMMSSZ */
export function toIcalDate(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/** An instant as local wall time in `zone`: YYYYMMDDTHHMMSS (no Z). */
export function toIcalLocal(d: Date, zone: string): string {
  return toIcalDate(new Date(d.getTime() + tzOffsetMs(d, zone))).slice(0, -1);
}

/** Escape a text value per RFC 5545 §3.3.11 */
export function icalEscape(v: string | null | undefined): string {
  if (!v) return "";
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();
/** Fold to 75 OCTETS per line (RFC 5545 §3.1), continuation lines starting
 *  with one space. The previous version counted UTF-16 code units, so a
 *  title with accents or emoji produced lines over the limit; this never
 *  splits inside a multi-byte character. */
export function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = encoder.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74; // the leading space of a continuation line counts
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function fmtOffset(ms: number): string {
  const sign = ms < 0 ? "-" : "+";
  const mins = Math.round(Math.abs(ms) / 60_000);
  return `${sign}${pad(Math.floor(mins / 60))}${pad(mins % 60)}`;
}

type Transition = { at: number; from: number; to: number };

/** Every UTC-offset change in `zone` within [from, to), found by stepping a
 *  day at a time and bisecting each change down to the minute. Driven purely
 *  by Intl, so it knows exactly what the runtime's tz database knows. */
export function zoneTransitions(zone: string, from: number, to: number): Transition[] {
  const DAY = 86_400_000;
  const out: Transition[] = [];
  let t = from;
  let off = tzOffsetMs(new Date(t), zone);
  while (t < to) {
    const next = Math.min(t + DAY, to);
    const nextOff = tzOffsetMs(new Date(next), zone);
    if (nextOff !== off) {
      // Invariant: offset(lo) is the old one, offset(hi) the new one, so the
      // change happens in (lo, hi]. Halve until that is at most a minute.
      let lo = t;
      let hi = next;
      while (hi - lo > 60_000) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (tzOffsetMs(new Date(mid), zone) === off) lo = mid;
        else hi = mid;
      }
      // Real transitions fall on whole minutes, and a half-open interval of
      // at most a minute contains exactly one: the last minute mark <= hi.
      const at = Math.floor(hi / 60_000) * 60_000;
      out.push({ at, from: off, to: nextOff });
      off = nextOff;
    }
    t = next;
  }
  return out;
}

/** A VTIMEZONE for `zone` valid across [from, to). One observance per actual
 *  transition in that window (explicit DTSTARTs rather than an RRULE: exact
 *  for any zone's history, including zones that changed rules), plus a
 *  leading observance fixing the offset in force at the window start. A
 *  zone with no transitions (Arizona, UTC+x) gets a single STANDARD block. */
export function buildVtimezone(zone: string, from: number, to: number): string[] {
  const startOff = tzOffsetMs(new Date(from), zone);
  const lines = ["BEGIN:VTIMEZONE", `TZID:${zone}`, `X-LIC-LOCATION:${zone}`];
  const obs = (kind: "STANDARD" | "DAYLIGHT", dtstartLocal: string, fromOff: number, toOff: number, name: string) => {
    lines.push(
      `BEGIN:${kind}`,
      `DTSTART:${dtstartLocal}`,
      `TZOFFSETFROM:${fmtOffset(fromOff)}`,
      `TZOFFSETTO:${fmtOffset(toOff)}`,
      fold(`TZNAME:${icalEscape(name)}`),
      `END:${kind}`,
    );
  };
  // Leading observance: RFC 5545 needs an onset at or before every time the
  // calendar uses, and 1970-01-01 local is the conventional "since forever".
  obs("STANDARD", "19700101T000000", startOff, startOff, zoneAbbr(new Date(from), zone));
  for (const tr of zoneTransitions(zone, from, to)) {
    // DTSTART is the onset in local time as read on the clock BEFORE the
    // change (i.e. using TZOFFSETFROM): US spring-forward is 20260308T020000.
    const onsetLocal = toIcalDate(new Date(tr.at + tr.from)).slice(0, -1);
    obs(tr.to > tr.from ? "DAYLIGHT" : "STANDARD", onsetLocal, tr.from, tr.to, zoneAbbr(new Date(tr.at), zone));
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

/** True for zones that are just UTC, which RFC 5545 writes as a "Z" time
 *  with no VTIMEZONE at all. */
function isUtc(zone: string): boolean {
  return zone === "UTC" || zone === "Etc/UTC" || zone === "Etc/GMT" || zone === "GMT";
}

export function buildIcs(calendarName: string, events: IcalEvent[], now: Date = new Date()): string {
  const stamp = toIcalDate(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EventHub//Distribution//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${icalEscape(calendarName)}`),
  ];

  // One VTIMEZONE per distinct zone, covering a year either side of that
  // zone's events -- enough for any client to resolve every time used, and
  // for edits a few months out, without shipping decades of history.
  const YEAR = 365 * 86_400_000;
  const spans = new Map<string, { min: number; max: number }>();
  for (const ev of events) {
    const zone = safeTimeZone(ev.timezone ?? "UTC");
    if (isUtc(zone)) continue;
    const s = new Date(ev.start_time).getTime();
    const e = new Date(ev.end_time).getTime();
    const cur = spans.get(zone);
    spans.set(zone, { min: Math.min(cur?.min ?? s, s), max: Math.max(cur?.max ?? e, e) });
  }
  for (const [zone, { min, max }] of [...spans.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(...buildVtimezone(zone, min - YEAR, max + YEAR));
  }

  for (const ev of events) {
    const zone = safeTimeZone(ev.timezone ?? "UTC");
    const start = new Date(ev.start_time);
    const end = new Date(ev.end_time);
    const dt = (prop: string, d: Date) =>
      isUtc(zone) ? `${prop}:${toIcalDate(d)}` : `${prop};TZID=${zone}:${toIcalLocal(d, zone)}`;
    const descParts: string[] = [];
    if (ev.description) descParts.push(ev.description);
    if (ev.virtual_link) descParts.push(`Join: ${ev.virtual_link}`);
    const description = descParts.join("\n\n");
    lines.push("BEGIN:VEVENT");
    lines.push(fold(`UID:${ev.id}@eventhub`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(fold(dt("DTSTART", start)));
    lines.push(fold(dt("DTEND", end)));
    lines.push(fold(`SUMMARY:${icalEscape(ev.title)}`));
    if (description) lines.push(fold(`DESCRIPTION:${icalEscape(description)}`));
    if (ev.location) lines.push(fold(`LOCATION:${icalEscape(ev.location)}`));
    if (ev.virtual_link) lines.push(fold(`URL:${icalEscape(ev.virtual_link)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
