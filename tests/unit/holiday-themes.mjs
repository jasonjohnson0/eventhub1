// Verification of the holiday / monthly-observance themes: the date rules in
// src/lib/holiday-dates.ts (Easter via the Anonymous Gregorian algorithm and
// everything hung off it, the "nth weekday" federal rules), and the
// organizer presets in src/lib/organizer-presets.ts (distinct colors, WCAG AA
// contrast, one per month). Imports the real TypeScript modules under Node's
// built-in type stripping.
// Run: node tests/unit/holiday-themes.mjs
import {
  HOLIDAY_DATE_RULES,
  adventSunday,
  easterSunday,
  formatOccurrence,
  nextOccurrence,
  upcomingHolidays,
} from '../../src/lib/holiday-dates.ts';
import {
  HOLIDAY_GROUP_ORDER,
  HOLIDAY_ORDER,
  HOLIDAY_THEMES,
} from '../../src/lib/holiday-themes.ts';
import {
  LEGACY_PRESET_IDS,
  ORGANIZER_PRESETS,
  contrastRatio,
  findPresetByColor,
  presetsByHoliday,
  readableTextColor,
} from '../../src/lib/organizer-presets.ts';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  <-- ' + extra}`);
  if (!cond) failures++;
};
const iso = (d) => d.toISOString().slice(0, 10);
const on = (id, year) => iso(HOLIDAY_DATE_RULES[id].occurrence(year).start);

// ---- Easter (published tables: USCCB liturgical calendars, timeanddate) ----
const EASTER = {
  2000: '2000-04-23', 2008: '2008-03-23', 2011: '2011-04-24', 2019: '2019-04-21',
  2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28',
  2028: '2028-04-16', 2029: '2029-04-01', 2030: '2030-04-21', 2038: '2038-04-25',
  2285: '2285-03-22', // the earliest possible date
};
for (const [y, want] of Object.entries(EASTER)) {
  check(`Easter ${y} is ${want}`, iso(easterSunday(Number(y))) === want, iso(easterSunday(Number(y))));
}

// ---- Easter-relative feasts --------------------------------------------------
const MOVING = [
  ['ash-wednesday', 2026, '2026-02-18'], ['ash-wednesday', 2027, '2027-02-10'],
  ['palm-sunday', 2026, '2026-03-29'], ['palm-sunday', 2027, '2027-03-21'],
  ['good-friday', 2026, '2026-04-03'], ['good-friday', 2027, '2027-03-26'],
  ['pentecost', 2026, '2026-05-24'], ['pentecost', 2027, '2027-05-16'], ['pentecost', 2025, '2025-06-08'],
  // Advent: the Sunday between Nov 27 and Dec 3
  ['advent', 2022, '2022-11-27'], ['advent', 2025, '2025-11-30'],
  ['advent', 2026, '2026-11-29'], ['advent', 2027, '2027-11-28'], ['advent', 2028, '2028-12-03'],
  // Federal "nth weekday" rules (5 U.S.C. 6103), checked against OPM's tables
  ['mlk-day', 2026, '2026-01-19'], ['mlk-day', 2027, '2027-01-18'],
  ['presidents-day', 2026, '2026-02-16'], ['presidents-day', 2027, '2027-02-15'],
  ['memorial-day', 2026, '2026-05-25'], ['memorial-day', 2027, '2027-05-31'],
  ['labor-day', 2026, '2026-09-07'], ['labor-day', 2027, '2027-09-06'],
  ['columbus-indigenous-day', 2026, '2026-10-12'], ['columbus-indigenous-day', 2027, '2027-10-11'],
  ['thanksgiving', 2026, '2026-11-26'], ['thanksgiving', 2027, '2027-11-25'],
  ['mothers-day', 2026, '2026-05-10'], ['mothers-day', 2027, '2027-05-09'],
  ['fathers-day', 2026, '2026-06-21'], ['fathers-day', 2027, '2027-06-20'],
  // Fixed dates
  ['epiphany', 2026, '2026-01-06'], ['all-saints', 2026, '2026-11-01'],
  ['juneteenth', 2026, '2026-06-19'], ['independence-day', 2026, '2026-07-04'],
  ['veterans-day', 2026, '2026-11-11'], ['christmas', 2026, '2026-12-25'],
];
for (const [id, y, want] of MOVING) check(`${id} ${y} is ${want}`, on(id, y) === want, on(id, y));

for (let y = 1990; y <= 2100; y++) {
  const a = adventSunday(y);
  if (a.getUTCDay() !== 0 || !((a.getUTCMonth() === 10 && a.getUTCDate() >= 27) || (a.getUTCMonth() === 11 && a.getUTCDate() <= 3))) {
    check(`Advent ${y} is a Sunday between Nov 27 and Dec 3`, false, iso(a));
  }
  const e = easterSunday(y);
  if (e.getUTCDay() !== 0 || e < new Date(Date.UTC(y, 2, 22)) || e > new Date(Date.UTC(y, 3, 25))) {
    check(`Easter ${y} is a Sunday between Mar 22 and Apr 25`, false, iso(e));
  }
}
check('Advent and Easter stay in range for 1990-2100', true);

// ---- next / upcoming ---------------------------------------------------------
const today = new Date(2026, 8, 27, 15, 30); // Sep 27 2026, local time
check('an occurrence in progress is returned, not next year\'s',
  iso(nextOccurrence('month-september', today).start) === '2026-09-15');
check('a date already past rolls to next year',
  iso(nextOccurrence('easter', today).start) === '2027-03-28', iso(nextOccurrence('easter', today).start));
const up = upcomingHolidays(today, HOLIDAY_ORDER.filter((id) => id !== 'autumn'));
check('Hispanic Heritage Month is active on Sep 27', up[0].id === 'month-september' && up[0].active, JSON.stringify(up[0]));
const firstFuture = up.find((u) => !u.active);
check('Breast Cancer Awareness Month is next, 4 days out',
  firstFuture.id === 'month-october' && firstFuture.daysAway === 4, JSON.stringify(firstFuture));
check('upcoming is sorted by days away', up.every((u, i) => i === 0 || up[i - 1].daysAway <= u.daysAway));
check('New Year\'s Eve looks ahead to Jan 1 as 1 day away',
  upcomingHolidays(new Date(2026, 11, 31), ['new-year'])[0].daysAway === 1);

check('single day formats with weekday', formatOccurrence(HOLIDAY_DATE_RULES.easter.occurrence(2027)) === 'Sun, Mar 28, 2027',
  formatOccurrence(HOLIDAY_DATE_RULES.easter.occurrence(2027)));
check('a whole month formats as the month', formatOccurrence(HOLIDAY_DATE_RULES['month-october'].occurrence(2026)) === 'Oct 2026');
check('February in a leap year still formats as a month', formatOccurrence(HOLIDAY_DATE_RULES['month-february'].occurrence(2028)) === 'Feb 2028');
check('a range formats start – end', formatOccurrence(HOLIDAY_DATE_RULES['month-september'].occurrence(2026)) === 'Sep 15 – Oct 15, 2026');

// ---- theme catalogue -----------------------------------------------------------
const ids = Object.keys(HOLIDAY_THEMES);
check('every theme is in exactly one group', ids.length === HOLIDAY_ORDER.length && new Set(HOLIDAY_ORDER).size === ids.length);
for (const id of ids) {
  const t = HOLIDAY_THEMES[id];
  if (t.id !== id) check(`${id} carries its own id`, false, t.id);
  if (t.floatingEmojis.length !== 6) check(`${id} has the six floating emoji slots the hero lays out`, false, String(t.floatingEmojis.length));
  if (!HOLIDAY_DATE_RULES[id]) check(`${id} has a date rule`, false);
  if (!(presetsByHoliday()[id]?.length)) check(`${id} has at least one organizer preset`, false);
}
check('the original four ids still exist', ['autumn', 'halloween', 'thanksgiving', 'christmas'].every((id) => HOLIDAY_THEMES[id]));
check('12 monthly observances', HOLIDAY_GROUP_ORDER.monthly.length === 12);
check('Good Friday has no confetti', HOLIDAY_THEMES['good-friday'].confettiStyle === 'none');
check('Ash Wednesday has no confetti', HOLIDAY_THEMES['ash-wednesday'].confettiStyle === 'none');
check('Good Friday has no bunnies or eggs',
  !HOLIDAY_THEMES['good-friday'].floatingEmojis.some((e) => ['🐰', '🐇', '🥚', '🍫'].includes(e)));
check('Easter leads with a cross and a dove', HOLIDAY_THEMES.easter.floatingEmojis.slice(0, 2).join('') === '✝️🕊️');
check('October is Breast Cancer Awareness Month', /Breast Cancer/.test(HOLIDAY_THEMES['month-october'].observance));
check('June is Country Cooking + Iced Tea', /Country Cooking/.test(HOLIDAY_THEMES['month-june'].observance)
  && /Iced Tea/.test(HOLIDAY_THEMES['month-june'].observance));

// ---- organizer presets ---------------------------------------------------------
const hexes = ORGANIZER_PRESETS.map((p) => p.hex.toLowerCase());
const dupes = hexes.filter((h, i) => hexes.indexOf(h) !== i);
check('every preset hex is distinct (findPresetByColor depends on it)', dupes.length === 0, dupes.join(','));
check('no preset uses the default #f97316', !hexes.includes('#f97316'));
check('no preset uses the embed fallback #0f766e', !hexes.includes('#0f766e'));
check('preset ids are distinct', new Set(ORGANIZER_PRESETS.map((p) => p.id)).size === ORGANIZER_PRESETS.length);
for (const m of HOLIDAY_GROUP_ORDER.monthly) {
  const n = presetsByHoliday()[m]?.length ?? 0;
  if (n !== 1) check(`${m} has exactly one preset`, false, String(n));
}
check('every preset points at a real theme', ORGANIZER_PRESETS.every((p) => HOLIDAY_THEMES[p.holiday]));
check('legacy presets are unchanged (Golden Harvest still #f59e0b)', findPresetByColor('#F59E0B')?.id === 'autumn-golden-harvest');

check('contrast: black on white is 21', Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
check('contrast: #767676 on white is ~4.54', Math.abs(contrastRatio('#767676', '#fff') - 4.54) < 0.01);

let lowNew = [];
let lowRendered = [];
for (const p of ORGANIZER_PRESETS) {
  const own = contrastRatio(p.hex, '#ffffff');
  if (!LEGACY_PRESET_IDS.has(p.id) && own < 4.5) lowNew.push(`${p.id} ${p.hex} ${own.toFixed(2)}`);
  const text = readableTextColor(p.hex);
  const r = contrastRatio(text, '#ffffff');
  if (r < 4.5) lowRendered.push(`${p.id} ${text} ${r.toFixed(2)}`);
}
check('every new preset\'s own color meets WCAG AA (4.5:1) on white', lowNew.length === 0, lowNew.join('; '));
check('every preset, as rendered text, meets WCAG AA on white', lowRendered.length === 0, lowRendered.join('; '));
const legacyBelow = ORGANIZER_PRESETS.filter((p) => LEGACY_PRESET_IDS.has(p.id) && contrastRatio(p.hex, '#fff') < 4.5);
console.log(`      (legacy presets relying on readableTextColor: ${legacyBelow.map((p) => `${p.label} ${p.hex} ${contrastRatio(p.hex, '#fff').toFixed(2)}`).join(', ')})`);
check('readableTextColor leaves an AA color alone', readableTextColor('#1e3a8a') === '#1e3a8a');
check('readableTextColor darkens amber to AA', contrastRatio(readableTextColor('#f59e0b'), '#fff') >= 4.5);
check('readableTextColor handles 3-digit hex', contrastRatio(readableTextColor('#fc0'), '#fff') >= 4.5);
check('readableTextColor passes non-hex through', readableTextColor('rebeccapurple') === 'rebeccapurple');

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED'}`);
process.exit(failures ? 1 : 0);
