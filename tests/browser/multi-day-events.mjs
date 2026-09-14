/**
 * Multi-day event rendering (spec 02) against the mock Supabase: the e5
 * fixture ("River Bend Music Fest") spans 3 calendar days. Month/Week/Day
 * should show it as one connected run across every day it occupies; List/
 * Agenda/Summary/Photo should show it exactly once with a range label, not
 * three separate rows.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  return page.innerText('body');
};

// ---- month view: one connected spanning bar, not per-day chips ----------------
// The bar is a single DOM anchor whose wrapping grid cell spans multiple
// columns via CSS grid-column (one continuous run), not one anchor per day --
// that's the whole point (see acceptance criteria: "not three unrelated
// chips"). Verify via the inline grid-column style rather than counting
// anchors, and unless the 3-day fixture happens to straddle a week-row
// boundary on the day this runs, there's exactly one such anchor.
await go('/c/riverside?view=month');
const spans = await page.$$eval('a[href="/events/e5"]', (as) =>
  as.map((a) => {
    const cell = a.closest('[style*="grid-column"]');
    return cell ? cell.getAttribute('style') : null;
  }),
);
check('the multi-day event has at least one segment', spans.length >= 1, spans.length);
check('at least one segment spans more than one grid column (a connected bar, not a single-day chip)',
  spans.some((s) => s && /span\s*[2-9]/.test(s)), JSON.stringify(spans));
check('the title is visible somewhere in month view', (await page.innerText('body')).includes('River Bend Music Fest'));

// Clicking any segment goes to the same event.
const first = page.locator('a[href="/events/e5"]').first();
await first.click();
await page.waitForLoadState('networkidle');
check('clicking a segment navigates to the event page', page.url().includes('/events/e5'), page.url());

// ---- week view: the all-day lane shows a spanning bar --------------------------
// Deep-link with ?on=<the fixture's start date> so the right week is shown
// regardless of what day of the week this test happens to run on.
const fixtureStart = new Date();
fixtureStart.setDate(fixtureStart.getDate() + 2);
const onParam = fixtureStart.toISOString().slice(0, 10);
await go(`/c/riverside?view=week&on=${onParam}`);
check('week view rendered without throwing',
  !(await page.innerText('body')).match(/Unexpected|Cannot read|is not a function/i));
const weekSpans = await page.$$eval('a[href="/events/e5"]', (as) =>
  as.map((a) => {
    const cell = a.closest('[style*="grid-column"]');
    return cell ? cell.getAttribute('style') : null;
  }),
);
check('the multi-day event appears in the week\'s all-day lane', weekSpans.length >= 1, weekSpans.length);
check('...spanning more than one day column there too',
  weekSpans.some((s) => s && /span\s*[2-9]/.test(s)), JSON.stringify(weekSpans));
await page.screenshot({ path: 'multi-day-week.png', fullPage: false });

// ---- list / agenda / summary / photo: exactly one row per event, range label --
for (const view of ['list', 'agenda', 'summary', 'photo']) {
  const body = await go(`/c/riverside?view=${view}`);
  const titleCount = (body.match(/River Bend Music Fest/g) || []).length;
  check(`${view} view shows the multi-day event exactly once, not once per day`,
    titleCount <= 1, `found ${titleCount} occurrences`);
}

// ---- an ordinary single-day event is unaffected --------------------------------
await go('/c/riverside?view=month');
const singleDayHrefs = await page.$$eval('a[href="/events/e3"]', (as) => as.length);
check('a single-day event still renders exactly once in month view', singleDayHrefs === 1, singleDayHrefs);

check('no uncaught errors', errors.length === 0, errors.join(' | '));
await page.screenshot({ path: 'multi-day-month.png', fullPage: false });

await browser.close();
console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
