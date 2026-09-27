/**
 * When each holiday theme (see `holiday-themes.ts`) falls in a given year --
 * fixed dates, "nth weekday of the month" federal rules, and the Easter-based
 * moveable feasts -- so the styling page can show a date next to every theme
 * and point at what's coming up next.
 *
 * Pure date math, no `@/` imports and only type imports from elsewhere, so the
 * unit suite can import this file directly under Node's type stripping.
 *
 * Every date is a calendar day represented as a `Date` at UTC midnight. That
 * sidesteps DST and time zones entirely: "Easter 2026" is April 5 everywhere,
 * and callers convert "today" with `calendarDay()` before comparing.
 */
import type { HolidayId } from "./holiday-themes";

const DAY_MS = 86_400_000;

/** A calendar day (UTC midnight). `month` is 1-12. */
export function ymd(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** The visitor's local calendar day for an instant, as a UTC-midnight Date. */
export function calendarDay(d: Date): Date {
  return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/**
 * Western (Gregorian) Easter Sunday -- the Anonymous Gregorian algorithm
 * (Meeus/Jones/Butcher). Valid for every Gregorian year.
 */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** The nth (1-based) `weekday` (0 = Sunday) of a month. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = ymd(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}

/** The last `weekday` (0 = Sunday) of a month. */
export function lastWeekday(year: number, month: number, weekday: number): Date {
  const last = ymd(year, month + 1, 0);
  const back = (last.getUTCDay() - weekday + 7) % 7;
  return addDays(last, -back);
}

/** First Sunday of Advent: the fourth Sunday before Christmas, i.e. the
 *  Sunday falling between November 27 and December 3. */
export function adventSunday(year: number): Date {
  const christmas = ymd(year, 12, 25);
  const back = christmas.getUTCDay() === 0 ? 7 : christmas.getUTCDay();
  return addDays(christmas, -back - 21);
}

export type Occurrence = { start: Date; end: Date };

type Rule = {
  /** Human-readable rule, shown in the UI and documented in the PR. */
  rule: string;
  occurrence: (year: number) => Occurrence;
};

const day = (d: Date): Occurrence => ({ start: d, end: d });
const month = (y: number, m: number): Occurrence => ({ start: ymd(y, m, 1), end: ymd(y, m + 1, 0) });

const SUN = 0;
const MON = 1;
const THU = 4;

export const HOLIDAY_DATE_RULES: Record<HolidayId, Rule> = {
  // Seasonal
  autumn: {
    rule: "Fall: late September through November",
    occurrence: (y) => ({ start: ymd(y, 9, 22), end: ymd(y, 11, 30) }),
  },

  // Christian
  epiphany: { rule: "January 6", occurrence: (y) => day(ymd(y, 1, 6)) },
  "ash-wednesday": {
    rule: "Ash Wednesday (46 days before Easter) through Lent",
    // Lent runs to Holy Week; Palm Sunday and Good Friday take over from there.
    occurrence: (y) => ({ start: addDays(easterSunday(y), -46), end: addDays(easterSunday(y), -8) }),
  },
  "palm-sunday": { rule: "The Sunday before Easter", occurrence: (y) => day(addDays(easterSunday(y), -7)) },
  "good-friday": { rule: "The Friday before Easter", occurrence: (y) => day(addDays(easterSunday(y), -2)) },
  easter: {
    rule: "First Sunday after the first full moon on or after March 21 (Western/Gregorian)",
    occurrence: (y) => day(easterSunday(y)),
  },
  pentecost: { rule: "Seventh Sunday after Easter (Easter + 49 days)", occurrence: (y) => day(addDays(easterSunday(y), 49)) },
  "all-saints": { rule: "November 1", occurrence: (y) => day(ymd(y, 11, 1)) },
  advent: {
    rule: "Fourth Sunday before Christmas through Christmas Eve",
    occurrence: (y) => ({ start: adventSunday(y), end: ymd(y, 12, 24) }),
  },
  christmas: { rule: "December 25", occurrence: (y) => day(ymd(y, 12, 25)) },

  // National & widely observed
  "new-year": { rule: "January 1", occurrence: (y) => day(ymd(y, 1, 1)) },
  "mlk-day": { rule: "Third Monday in January", occurrence: (y) => day(nthWeekday(y, 1, MON, 3)) },
  valentines: { rule: "February 14", occurrence: (y) => day(ymd(y, 2, 14)) },
  "presidents-day": {
    rule: "Third Monday in February (Washington's Birthday)",
    occurrence: (y) => day(nthWeekday(y, 2, MON, 3)),
  },
  "st-patricks": { rule: "March 17", occurrence: (y) => day(ymd(y, 3, 17)) },
  "mothers-day": { rule: "Second Sunday in May", occurrence: (y) => day(nthWeekday(y, 5, SUN, 2)) },
  "memorial-day": { rule: "Last Monday in May", occurrence: (y) => day(lastWeekday(y, 5, MON)) },
  "fathers-day": { rule: "Third Sunday in June", occurrence: (y) => day(nthWeekday(y, 6, SUN, 3)) },
  juneteenth: { rule: "June 19", occurrence: (y) => day(ymd(y, 6, 19)) },
  "independence-day": { rule: "July 4", occurrence: (y) => day(ymd(y, 7, 4)) },
  "labor-day": { rule: "First Monday in September", occurrence: (y) => day(nthWeekday(y, 9, MON, 1)) },
  "columbus-indigenous-day": {
    rule: "Second Monday in October",
    occurrence: (y) => day(nthWeekday(y, 10, MON, 2)),
  },
  halloween: { rule: "October 31", occurrence: (y) => day(ymd(y, 10, 31)) },
  "veterans-day": { rule: "November 11", occurrence: (y) => day(ymd(y, 11, 11)) },
  thanksgiving: { rule: "Fourth Thursday in November", occurrence: (y) => day(nthWeekday(y, 11, THU, 4)) },

  // Monthly observances
  "month-january": { rule: "All of January", occurrence: (y) => month(y, 1) },
  "month-february": { rule: "All of February", occurrence: (y) => month(y, 2) },
  "month-march": { rule: "All of March", occurrence: (y) => month(y, 3) },
  "month-april": { rule: "All of April", occurrence: (y) => month(y, 4) },
  "month-may": { rule: "All of May", occurrence: (y) => month(y, 5) },
  "month-june": { rule: "All of June", occurrence: (y) => month(y, 6) },
  "month-july": { rule: "All of July", occurrence: (y) => month(y, 7) },
  "month-august": { rule: "All of August", occurrence: (y) => month(y, 8) },
  "month-september": {
    rule: "September 15 – October 15",
    occurrence: (y) => ({ start: ymd(y, 9, 15), end: ymd(y, 10, 15) }),
  },
  "month-october": { rule: "All of October", occurrence: (y) => month(y, 10) },
  "month-november": { rule: "All of November", occurrence: (y) => month(y, 11) },
  "month-december": { rule: "All of December", occurrence: (y) => month(y, 12) },
};

/** The current occurrence if `today` falls inside one, otherwise the next. */
export function nextOccurrence(id: HolidayId, today: Date): Occurrence {
  const t = calendarDay(today);
  const rule = HOLIDAY_DATE_RULES[id];
  for (const y of [t.getUTCFullYear() - 1, t.getUTCFullYear(), t.getUTCFullYear() + 1]) {
    const o = rule.occurrence(y);
    if (o.end.getTime() >= t.getTime()) return o;
  }
  // Unreachable: every rule recurs yearly.
  return rule.occurrence(t.getUTCFullYear() + 1);
}

export type Upcoming = Occurrence & { id: HolidayId; daysAway: number; active: boolean };

/**
 * Themes in the order they next come up from `today` -- anything happening
 * today first, then soonest start date. `ids` limits it to a subset (e.g.
 * leaving out the whole-season "autumn" entry).
 */
export function upcomingHolidays(today: Date, ids: HolidayId[]): Upcoming[] {
  const t = calendarDay(today);
  return ids
    .map((id) => {
      const o = nextOccurrence(id, t);
      const active = o.start.getTime() <= t.getTime();
      const daysAway = active ? 0 : Math.round((o.start.getTime() - t.getTime()) / DAY_MS);
      return { id, ...o, daysAway, active };
    })
    .sort((a, b) => a.daysAway - b.daysAway || a.start.getTime() - b.start.getTime());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function short(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** e.g. "Sun, Apr 5, 2026", "Oct 2026", "Sep 15 – Oct 15, 2026". */
export function formatOccurrence(o: Occurrence): string {
  const y = o.start.getUTCFullYear();
  if (o.start.getTime() === o.end.getTime()) {
    return `${WEEKDAYS[o.start.getUTCDay()]}, ${short(o.start)}, ${y}`;
  }
  const wholeMonth =
    o.start.getUTCDate() === 1 &&
    o.start.getUTCMonth() === o.end.getUTCMonth() &&
    addDays(o.end, 1).getUTCDate() === 1;
  if (wholeMonth) return `${MONTHS[o.start.getUTCMonth()]} ${y}`;
  return `${short(o.start)} – ${short(o.end)}, ${y}`;
}
