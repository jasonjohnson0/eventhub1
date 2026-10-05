/**
 * Bulk event import: pure parsing for CSV and iCalendar (.ics) sources.
 * Runs in the browser for the preview; the server re-validates every row
 * before inserting (see event-import.functions.ts). No imports beyond the
 * dependency-free timezone helpers and rrule, so it is unit-testable in Node.
 */
import * as rruleNs from "rrule";
import { isValidTimeZone, safeTimeZone, toFloating, wallToInstant } from "./timezone.ts";

// biome-ignore lint/suspicious/noExplicitAny: bridging two module shapes of one package
const rrule: typeof import("rrule") = (rruleNs as any).rrulestr ? rruleNs : (rruleNs as any).default;

export const MAX_IMPORT_ROWS = 500;
export const RECURRENCE_HORIZON_MONTHS = 12;

export const IMPORT_CATEGORIES = [
  "sports",
  "networking",
  "education",
  "social",
  "fundraiser",
  "workshop",
  "other",
] as const;
export type ImportCategory = (typeof IMPORT_CATEGORIES)[number];
export type ImportStatus = "draft" | "approved";
export type ImportVisibility = "public" | "unlisted" | "private";

export type ImportRow = {
  /** Stable key for the preview table. */
  key: string;
  /** 1-based source line (CSV) or event number (iCal), for messages. */
  source: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string | null; // ISO instant
  end_time: string | null; // ISO instant
  category: ImportCategory;
  tags: string[];
  /** null = use the default chosen on the import screen. */
  status: ImportStatus | null;
  visibility: ImportVisibility;
  errors: string[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export const CSV_TEMPLATE_HEADERS = [
  "title",
  "start",
  "end",
  "description",
  "location",
  "category",
  "tags",
  "status",
  "visibility",
] as const;

export function csvTemplate(): string {
  return (
    CSV_TEMPLATE_HEADERS.join(",") +
    "\n" +
    [
      "Fall Festival",
      "2026-10-08 11:00",
      "2026-10-08 15:00",
      '"Food, music and games for the whole family"',
      "Town Square",
      "social",
      '"family, outdoors"',
      "approved",
      "public",
    ].join(",") +
    "\n"
  );
}

/** RFC 4180-ish parser: quoted fields, doubled quotes, CRLF/LF, BOM.
 *  The delimiter (comma, semicolon or tab) is detected from the header line. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 } as Record<string, number>;
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delim = best[1] > 0 ? best[0] : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") inQuotes = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (inQuotes) throw new Error("The file has an unclosed quote (\") — check that every quoted value is closed.");
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Fields a CSV column can be mapped to. start_date/start_clock etc. support
 *  spreadsheets that keep the date and the time in separate columns. */
export const IMPORT_FIELDS = [
  { key: "title", label: "Title", required: true },
  { key: "start", label: "Start (date + time)" },
  { key: "start_date", label: "Start date" },
  { key: "start_clock", label: "Start time" },
  { key: "end", label: "End (date + time)" },
  { key: "end_date", label: "End date" },
  { key: "end_clock", label: "End time" },
  { key: "description", label: "Description" },
  { key: "location", label: "Location" },
  { key: "category", label: "Category" },
  { key: "tags", label: "Tags" },
  { key: "status", label: "Status" },
  { key: "visibility", label: "Visibility" },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<ImportField, number>>;

const GUESSES: [ImportField, RegExp][] = [
  ["title", /^(title|event( ?name| ?title)?|name|summary|subject)$/],
  ["start_date", /^(date|start ?date|event ?date|day)$/],
  ["start_clock", /^(time|start ?time|starts? at|from)$/],
  ["end_date", /^(end ?date)$/],
  ["end_clock", /^(end ?time|ends? at|to|until)$/],
  ["start", /^(start|starts|start ?datetime|start ?date ?time|begin|begins|when|datetime|date ?time|dtstart)$/],
  ["end", /^(end|ends|end ?datetime|end ?date ?time|finish|dtend)$/],
  ["description", /^(description|details?|desc|about|notes?|body)$/],
  ["location", /^(location|venue|place|address|where|venue ?name)$/],
  ["category", /^(category|type|event ?type|kind)$/],
  ["tags", /^(tags?|keywords?|labels?|categories)$/],
  ["status", /^(status|state)$/],
  ["visibility", /^(visibility|privacy|access)$/],
];

/** Best-effort header -> field guess. Each field and each column used once. */
export function guessMapping(headers: string[]): ColumnMapping {
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " "));
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const [field, re] of GUESSES) {
    const idx = norm.findIndex((h, i) => !used.has(i) && re.test(h));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  // Without a separate date column, "Start Time"/"End Time" hold the full value.
  if (mapping.start === undefined && mapping.start_date === undefined && mapping.start_clock !== undefined) {
    mapping.start = mapping.start_clock;
    delete mapping.start_clock;
  }
  if (mapping.end === undefined && mapping.end_date === undefined && mapping.start_date === undefined && mapping.end_clock !== undefined) {
    mapping.end = mapping.end_clock;
    delete mapping.end_clock;
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Date/time parsing
// ---------------------------------------------------------------------------

type Ymd = { y: number; m: number; d: number };
type Hm = { h: number; min: number; s: number };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function monthOf(name: string): number | undefined {
  const n = name.toLowerCase();
  return MONTHS[n.slice(0, 4)] ?? MONTHS[n.slice(0, 3)];
}

function validYmd(v: Ymd): Ymd | null {
  if (v.m < 1 || v.m > 12 || v.d < 1 || v.d > 31 || v.y < 1900 || v.y > 2200) return null;
  const dt = new Date(Date.UTC(v.y, v.m - 1, v.d));
  return dt.getUTCDate() === v.d ? v : null;
}

export function parseDatePart(raw: string): Ymd | null {
  const s = raw.trim().replace(/^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*,?\s+/i, "");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s) || /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m) return validYmd({ y: +m[1], m: +m[2], d: +m[3] });
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s); // US month/day/year
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return validYmd({ y, m: +m[1], d: +m[2] });
  }
  m = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i.exec(s); // Oct 8, 2026
  if (m) {
    const mon = monthOf(m[1]);
    if (mon) return validYmd({ y: +m[3], m: mon, d: +m[2] });
  }
  m = /^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$/i.exec(s); // 8 Oct 2026
  if (m) {
    const mon = monthOf(m[2]);
    if (mon) return validYmd({ y: +m[3], m: mon, d: +m[1] });
  }
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return validYmd({ y: +m[1], m: +m[2], d: +m[3] });
  return null;
}

export function parseTimePart(raw: string): Hm | null {
  const s = raw.trim().toLowerCase().replace(/\./g, "");
  if (s === "noon") return { h: 12, min: 0, s: 0 };
  if (s === "midnight") return { h: 0, min: 0, s: 0 };
  const m = /^(\d{1,2})(?::?(\d{2}))?(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const sec = m[3] ? +m[3] : 0;
  const ap = m[4];
  if (!m[2] && !ap) return null; // a bare "11" is too ambiguous
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap.startsWith("p") && h !== 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
  }
  if (h > 23 || min > 59 || sec > 59) return null;
  return { h, min, s: sec };
}

export type ParsedWhen = { instant: Date; dateOnly: boolean };

/** Parses a date/time string. Values carrying their own offset ("Z",
 *  "+02:00") are exact; everything else is wall-clock time in `zone`. */
export function parseDateTime(raw: string, zone: string): ParsedWhen | null {
  const s = raw.trim();
  if (!s) return null;
  // ISO 8601 with an explicit offset.
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s.replace(" ", "T").replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    return Number.isNaN(d.getTime()) ? null : { instant: d, dateOnly: false };
  }
  const date = parseDatePart(s);
  if (date) return { instant: wall(date, { h: 0, min: 0, s: 0 }, zone), dateOnly: true };
  // Split into date + time: "2026-10-08T11:00", "10/8/2026 11:00 AM", "Oct 8, 2026 7pm".
  const m =
    /^(\d{4}[-/]\d{1,2}[-/]\d{1,2})(?:T|\s+(?:at\s+)?)(\d{1,2}(?::\d{2}){0,2}(?:\.\d+)?\s*(?:[ap]\.?m?\.?)?)$/i.exec(s) ||
    /^(.*?\d{4})(?:T|\s+(?:at\s+)?|,\s*)(\d{1,2}(?::\d{2}){0,2}\s*(?:[ap]\.?m?\.?)?)$/i.exec(s) ||
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/.exec(s);
  if (m) {
    const dp = parseDatePart(m[1].replace(/,\s*$/, ""));
    const tp = parseTimePart(m[2].replace(/\.\d+$/, ""));
    if (dp && tp) return { instant: wall(dp, tp, zone), dateOnly: false };
  }
  return null;
}

function wall(d: Ymd, t: Hm, zone: string): Date {
  return wallToInstant(new Date(Date.UTC(d.y, d.m - 1, d.d, t.h, t.min, t.s)), safeTimeZone(zone));
}

// ---------------------------------------------------------------------------
// Field normalizers
// ---------------------------------------------------------------------------

const CATEGORY_SYNONYMS: Record<string, ImportCategory> = {
  sport: "sports", athletics: "sports", game: "sports", games: "sports",
  network: "networking", business: "networking", meetup: "networking",
  class: "education", classes: "education", lecture: "education", learning: "education", talk: "education", seminar: "education",
  party: "social", community: "social", festival: "social", music: "social", concert: "social",
  fundraising: "fundraiser", charity: "fundraiser", benefit: "fundraiser", gala: "fundraiser",
  training: "workshop", workshops: "workshop", course: "workshop",
};

export function normalizeCategory(raw: string | null | undefined): { value: ImportCategory; unknown: boolean } {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return { value: "other", unknown: false };
  if ((IMPORT_CATEGORIES as readonly string[]).includes(s)) return { value: s as ImportCategory, unknown: false };
  if (CATEGORY_SYNONYMS[s]) return { value: CATEGORY_SYNONYMS[s], unknown: false };
  return { value: "other", unknown: true };
}

export function normalizeTags(raw: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : (raw ?? "").split(/[,;]/);
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim().replace(/\s+/g, " ").slice(0, 40);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, 20);
}

export function normalizeStatus(raw: string | null | undefined): ImportStatus | null | "unknown" {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["approved", "published", "publish", "live", "active", "confirmed", "yes"].includes(s)) return "approved";
  if (["draft", "pending", "unpublished", "hidden", "tentative", "no"].includes(s)) return "draft";
  return "unknown";
}

export function normalizeVisibility(raw: string | null | undefined): ImportVisibility | "unknown" {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s || s === "public") return "public";
  if (s === "unlisted") return "unlisted";
  if (s === "private" || s === "invite only" || s === "invite-only") return "private";
  return "unknown";
}

/** Final per-row checks shared by both sources. Mutates and returns `row`. */
function finish(row: ImportRow): ImportRow {
  if (!row.title) row.errors.push("Missing title");
  if (row.title.length > 200) {
    row.title = row.title.slice(0, 200);
    row.warnings.push("Title shortened to 200 characters");
  }
  if (row.description && row.description.length > 4000) {
    row.description = row.description.slice(0, 4000);
    row.warnings.push("Description shortened to 4,000 characters");
  }
  if (row.location && row.location.length > 300) {
    row.location = row.location.slice(0, 300);
    row.warnings.push("Location shortened to 300 characters");
  }
  if (row.start_time && row.end_time && new Date(row.end_time) <= new Date(row.start_time)) {
    row.errors.push("End is not after start");
  }
  if (row.start_time && new Date(row.start_time).getTime() < Date.now() - 86_400_000) {
    row.warnings.push("Starts in the past");
  }
  return row;
}

const HOUR = 3_600_000;

export function rowsFromCsv(
  table: string[][],
  mapping: ColumnMapping,
  zone: string,
): { rows: ImportRow[]; truncated: boolean } {
  const body = table.slice(1);
  const truncated = body.length > MAX_IMPORT_ROWS;
  const cell = (r: string[], f: ImportField) => {
    const i = mapping[f];
    return i === undefined ? "" : (r[i] ?? "").trim();
  };
  const rows = body.slice(0, MAX_IMPORT_ROWS).map((r, i): ImportRow => {
    const row: ImportRow = {
      key: `csv-${i}`,
      source: `Row ${i + 2}`,
      title: cell(r, "title"),
      description: cell(r, "description") || null,
      location: cell(r, "location") || null,
      start_time: null,
      end_time: null,
      category: "other",
      tags: normalizeTags(cell(r, "tags")),
      status: null,
      visibility: "public",
      errors: [],
      warnings: [],
    };
    const startRaw = cell(r, "start") || [cell(r, "start_date"), cell(r, "start_clock")].filter(Boolean).join(" ");
    const start = startRaw ? parseDateTime(startRaw, zone) : null;
    if (!startRaw) row.errors.push("Missing start");
    else if (!start) row.errors.push(`Couldn't read start "${startRaw}"`);

    let endRaw = cell(r, "end");
    if (!endRaw && (cell(r, "end_date") || cell(r, "end_clock"))) {
      endRaw = [cell(r, "end_date") || cell(r, "start_date"), cell(r, "end_clock")].filter(Boolean).join(" ");
    }
    // A bare time in the end column ("3:00 PM") means the start's day.
    const endClockOnly = endRaw ? parseTimePart(endRaw) : null;
    let end: ParsedWhen | null = null;
    if (endClockOnly && start) {
      const f = toFloating(start.instant, safeTimeZone(zone));
      end = {
        instant: wall({ y: f.getUTCFullYear(), m: f.getUTCMonth() + 1, d: f.getUTCDate() }, endClockOnly, zone),
        dateOnly: false,
      };
    } else if (endRaw) end = parseDateTime(endRaw, zone);
    if (endRaw && !end) row.errors.push(`Couldn't read end "${endRaw}"`);

    if (start) {
      row.start_time = start.instant.toISOString();
      if (end) {
        // A date-only end means "through that day".
        const endInstant = end.dateOnly ? new Date(end.instant.getTime() + 24 * HOUR) : end.instant;
        row.end_time = endInstant.toISOString();
      } else if (!endRaw) {
        row.end_time = new Date(start.instant.getTime() + (start.dateOnly ? 24 * HOUR : HOUR)).toISOString();
        row.warnings.push(start.dateOnly ? "No time given — imported as all day" : "No end — set to 1 hour after start");
      }
      if (start.dateOnly && end && !end.dateOnly) row.warnings.push("Start has no time — midnight used");
    }

    const cat = normalizeCategory(cell(r, "category"));
    row.category = cat.value;
    if (cat.unknown) row.warnings.push(`Unknown category "${cell(r, "category")}" — using Other`);
    const st = normalizeStatus(cell(r, "status"));
    if (st === "unknown") row.warnings.push(`Unknown status "${cell(r, "status")}" — using the default`);
    else row.status = st;
    const vis = normalizeVisibility(cell(r, "visibility"));
    if (vis === "unknown") row.warnings.push(`Unknown visibility "${cell(r, "visibility")}" — using Public`);
    else row.visibility = vis;
    return finish(row);
  });
  return { rows, truncated };
}

// ---------------------------------------------------------------------------
// iCalendar
// ---------------------------------------------------------------------------

type IcsProp = { name: string; params: Record<string, string>; value: string };

function unfold(text: string): string[] {
  return text.replace(/^\uFEFF/, "").replace(/\r\n[ \t]|\n[ \t]|\r[ \t]/g, "").split(/\r\n|\n|\r/);
}

function parseLine(line: string): IcsProp | null {
  // NAME;PARAM=VAL;PARAM="quoted:val":VALUE -- first colon outside quotes.
  let inQ = false;
  let idx = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQ = !inQ;
    else if (line[i] === ":" && !inQ) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;
  const head = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const parts = head.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name, params, value };
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

/** A few Windows zone names Outlook writes into TZID. */
const WINDOWS_ZONES: Record<string, string> = {
  "eastern standard time": "America/New_York",
  "central standard time": "America/Chicago",
  "mountain standard time": "America/Denver",
  "us mountain standard time": "America/Phoenix",
  "pacific standard time": "America/Los_Angeles",
  "alaskan standard time": "America/Anchorage",
  "hawaiian standard time": "Pacific/Honolulu",
  "gmt standard time": "Europe/London",
  "w. europe standard time": "Europe/Berlin",
  "romance standard time": "Europe/Paris",
  "utc": "UTC",
};

function resolveTzid(tzid: string | undefined, fallback: string): { zone: string; known: boolean } {
  if (!tzid) return { zone: fallback, known: true };
  const cleaned = tzid.replace(/^\/[^/]+\/[^/]+\//, ""); // "/mozilla.org/20050126_1/America/New_York"
  if (isValidTimeZone(cleaned)) return { zone: cleaned, known: true };
  const win = WINDOWS_ZONES[cleaned.toLowerCase()];
  if (win) return { zone: win, known: true };
  return { zone: fallback, known: false };
}

type IcsWhen = { instant: Date; allDay: boolean; zone: string; tzUnknown: boolean };

function parseIcsDate(p: IcsProp, fallbackZone: string): IcsWhen | null {
  const v = p.value.trim().split(",")[0];
  const allDay = p.params.VALUE === "DATE" || /^\d{8}$/.test(v);
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (allDay) {
    return {
      instant: wallToInstant(new Date(Date.UTC(y, mo - 1, d)), fallbackZone),
      allDay: true,
      zone: fallbackZone,
      tzUnknown: false,
    };
  }
  const [h, mi, s] = [+(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)];
  if (m[7]) {
    return { instant: new Date(Date.UTC(y, mo - 1, d, h, mi, s)), allDay: false, zone: "UTC", tzUnknown: false };
  }
  const tz = resolveTzid(p.params.TZID, fallbackZone);
  return {
    instant: wallToInstant(new Date(Date.UTC(y, mo - 1, d, h, mi, s)), tz.zone),
    allDay: false,
    zone: tz.zone,
    tzUnknown: !tz.known,
  };
}

function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim());
  if (!m) return null;
  const ms =
    (+(m[2] ?? 0) * 7 * 24 + +(m[3] ?? 0) * 24 + +(m[4] ?? 0)) * HOUR + +(m[5] ?? 0) * 60_000 + +(m[6] ?? 0) * 1000;
  return m[1] === "-" ? null : ms;
}

type VEvent = Record<string, IcsProp[]>;

export type IcsSummary = {
  rows: ImportRow[];
  truncated: boolean;
  eventsInFile: number;
  recurringSeries: number;
  occurrencesAdded: number;
  cancelledSkipped: number;
};

export function rowsFromIcs(text: string, workspaceZone: string, now: Date = new Date()): IcsSummary {
  const lines = unfold(text);
  if (!lines.some((l) => /^BEGIN:VCALENDAR/i.test(l))) {
    throw new Error("This doesn't look like an iCal file (no BEGIN:VCALENDAR line).");
  }
  const events: VEvent[] = [];
  let cur: VEvent | null = null;
  let depth = 0; // skip VALARM etc. nested inside VEVENT
  for (const line of lines) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      cur = {};
      depth = 0;
      continue;
    }
    if (/^END:VEVENT$/i.test(line)) {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    if (/^BEGIN:/i.test(line)) depth++;
    else if (/^END:/i.test(line)) depth--;
    else if (depth === 0) {
      const p = parseLine(line);
      if (p) (cur[p.name] ??= []).push(p);
    }
  }
  if (events.length === 0) throw new Error("No events were found in this calendar.");

  const horizon = new Date(now);
  horizon.setMonth(horizon.getMonth() + RECURRENCE_HORIZON_MONTHS);
  const one = (e: VEvent, k: string) => e[k]?.[0];

  // Overrides of single occurrences (RECURRENCE-ID), keyed by UID + instant.
  const overrides = new Set<string>();
  for (const e of events) {
    const rid = one(e, "RECURRENCE-ID");
    const uid = one(e, "UID")?.value;
    if (rid && uid) {
      const w = parseIcsDate(rid, workspaceZone);
      if (w) overrides.add(`${uid}|${w.instant.getTime()}`);
    }
  }

  const out: ImportRow[] = [];
  let recurringSeries = 0;
  let occurrencesAdded = 0;
  let cancelledSkipped = 0;
  let truncated = false;

  events.forEach((e, i) => {
    if ((one(e, "STATUS")?.value ?? "").toUpperCase() === "CANCELLED") {
      cancelledSkipped++;
      return;
    }
    const base = {
      title: unescapeText(one(e, "SUMMARY")?.value ?? ""),
      description: unescapeText(one(e, "DESCRIPTION")?.value ?? "") || null,
      location: unescapeText(one(e, "LOCATION")?.value ?? "") || null,
      tags: normalizeTags((e.CATEGORIES ?? []).flatMap((c) => unescapeText(c.value).split(","))),
    };
    const source = `Event ${i + 1}`;
    const dtProp = one(e, "DTSTART");
    const start = dtProp ? parseIcsDate(dtProp, workspaceZone) : null;
    const mk = (startAt: Date | null, endAt: Date | null, extra: Partial<ImportRow> = {}): ImportRow => ({
      key: `ics-${i}-${startAt?.getTime() ?? "x"}`,
      source,
      ...base,
      start_time: startAt?.toISOString() ?? null,
      end_time: endAt?.toISOString() ?? null,
      category: "other",
      status: null,
      visibility: (one(e, "CLASS")?.value ?? "").toUpperCase() === "PRIVATE" ? "private" : "public",
      errors: [],
      warnings: [],
      ...extra,
    });
    if (!start) {
      out.push(finish(mk(null, null, { errors: [dtProp ? `Couldn't read DTSTART "${dtProp.value}"` : "Missing DTSTART"] })));
      return;
    }
    const warnings: string[] = [];
    if (start.tzUnknown) warnings.push(`Unknown time zone "${dtProp?.params.TZID}" — workspace time zone used`);

    let durationMs: number;
    const dtEnd = one(e, "DTEND");
    const end = dtEnd ? parseIcsDate(dtEnd, workspaceZone) : null;
    const dur = one(e, "DURATION") ? parseDuration(one(e, "DURATION")!.value) : null;
    if (end) durationMs = end.instant.getTime() - start.instant.getTime();
    else if (dur !== null) durationMs = dur;
    else if (start.allDay) durationMs = 24 * HOUR;
    else {
      durationMs = HOUR;
      warnings.push("No end — set to 1 hour after start");
    }
    if (start.allDay) warnings.push("All-day event");

    const rruleProp = one(e, "RRULE");
    if (!rruleProp || one(e, "RECURRENCE-ID")) {
      out.push(finish(mk(start.instant, new Date(start.instant.getTime() + durationMs), { warnings })));
      return;
    }

    // Recurring: expand occurrences from now through the horizon, on the
    // series' own wall clock so "every Tuesday 7pm" stays 7pm across DST.
    recurringSeries++;
    const zone = start.allDay ? workspaceZone : start.zone;
    const exdates = new Set(
      (e.EXDATE ?? []).flatMap((p) =>
        p.value.split(",").map((v) => parseIcsDate({ ...p, value: v }, workspaceZone)?.instant.getTime() ?? -1),
      ),
    );
    const uid = one(e, "UID")?.value ?? "";
    let dates: Date[] = [];
    try {
      const fStart = toFloating(start.instant, zone);
      const stamp = fStart.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const rule = rrule.rrulestr(`DTSTART:${stamp}\nRRULE:${rruleProp.value}`, { forceset: false }) as InstanceType<
        typeof rrule.RRule
      >;
      const from = toFloating(now > start.instant ? now : start.instant, zone);
      dates = rule
        .between(from, toFloating(horizon, zone), true)
        .slice(0, MAX_IMPORT_ROWS + 1)
        .map((f) => wallToInstant(f, zone));
    } catch {
      out.push(finish(mk(start.instant, new Date(start.instant.getTime() + durationMs), {
        warnings: [...warnings, `Couldn't read the repeat rule — only the first date was imported`],
      })));
      return;
    }
    dates = dates.filter((d) => !exdates.has(d.getTime()) && !overrides.has(`${uid}|${d.getTime()}`));
    for (const d of dates) {
      occurrencesAdded++;
      out.push(
        finish(mk(d, new Date(d.getTime() + durationMs), { warnings: [...warnings, "Repeating event — one date of the series"] })),
      );
    }
  });

  if (out.length > MAX_IMPORT_ROWS) truncated = true;
  return {
    rows: out.slice(0, MAX_IMPORT_ROWS),
    truncated,
    eventsInFile: events.length,
    recurringSeries,
    occurrencesAdded,
    cancelledSkipped,
  };
}

/** Case-insensitive title + exact start instant: the duplicate key. */
export function duplicateKey(title: string, startIso: string): string {
  return `${title.trim().toLowerCase()}|${new Date(startIso).getTime()}`;
}
