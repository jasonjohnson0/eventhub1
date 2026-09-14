/**
 * Spec 03: an event's time is always labeled in the event's own zone, with a
 * secondary "your time" line only when the viewer is actually somewhere else.
 * The e1 fixture ("Harvest Festival", 6pm-10pm) is stamped America/Chicago in
 * tests/support/mock-supabase.mjs specifically for this.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

// ---- viewer in the same zone as the event: no secondary line --------------
{
  const ctx = await browser.newContext({ timezoneId: 'America/Chicago' });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/e1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const body = await page.innerText('body');

  check('the primary time carries the event zone abbreviation',
    /\d{1,2}:\d{2}\s?(AM|PM)\s?C[SD]T/.test(body), body.match(/\d{1,2}:\d{2}.{0,10}/)?.[0] ?? '(no time found)');
  check('no "your time" line when the viewer is in the event\'s own zone',
    !body.includes('your time'), body.slice(0, 400));
  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- viewer in a different zone: primary stays the event's zone, plus a ---
// ---- secondary "your time" line in the viewer's own zone -------------------
{
  const ctx = await browser.newContext({ timezoneId: 'America/New_York' });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/e1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const body = await page.innerText('body');

  check('the primary time is still labeled in the event\'s own zone (not silently converted)',
    /\d{1,2}:\d{2}\s?(AM|PM)\s?C[SD]T/.test(body), body.match(/\d{1,2}:\d{2}.{0,10}/)?.[0] ?? '(no time found)');
  check('a "your time" secondary line appears once the viewer is actually elsewhere',
    body.includes('your time'), body.slice(0, 400));
  check('the secondary line carries the viewer\'s own zone abbreviation, not the event\'s',
    /\d{1,2}:\d{2}\s?(AM|PM)\s?E[SD]T\s*your time/.test(body), body.slice(0, 400));
  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- month chips stay in the event's zone, without an abbreviation --------
// ---- (spec 03 F3: no room on a one-line chip) ------------------------------
{
  const ctx = await browser.newContext({ timezoneId: 'Pacific/Honolulu' });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/c/riverside`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const chipTitle = await page
    .locator('a', { hasText: 'Harvest Festival' })
    .first()
    .getAttribute('title')
    .catch(() => null);
  check('the month chip carries a title with a time (not empty/missing)', !!chipTitle, String(chipTitle));
  if (chipTitle) {
    // e1's start_time is 18:00 UTC, stamped timezone: America/Chicago --
    // 1:00 PM CDT. If the chip silently converted to the Honolulu viewer's
    // own zone instead (the exact bug spec 03 exists to prevent), it would
    // read 8:00 AM.
    check('the chip shows the event-zone time (1:00 PM CDT), not the viewer-zone conversion',
      /1:00\s?PM/.test(chipTitle), chipTitle);
    check('the chip does not silently convert to the Honolulu viewer\'s own local hour',
      !/8:00\s?AM/.test(chipTitle), chipTitle);
  }
  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
