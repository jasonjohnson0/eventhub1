/**
 * Spec 05: the Timeline view's horizontal date axis. A multi-day event is a
 * bar spanning several day columns; a same-day timed event is a short bar at
 * its actual time of day, not a full-day block. Group-by-venue is a toggle,
 * default off. Reuses the e1/e2/e5 fixtures from tests/support/mock-supabase.mjs
 * (e2 and e5 both carry venue_id: 'venue-1' specifically for this).
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

// ---- /c/riverside: tab, axis, bar widths, click-through --------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/c/riverside`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const timelineTab = page.locator('a:has-text("Timeline")').first();
  check('a Timeline tab is offered', (await timelineTab.count()) > 0);
  await timelineTab.click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  check('the URL reflects view=timeline', page.url().includes('view=timeline'), page.url());

  const body = await page.innerText('body');
  check('a single-day event appears as a row', body.includes('Harvest Festival'), body.slice(0, 300));
  check('a multi-day event appears as a row', body.includes('River Bend Music Fest'), body.slice(0, 300));

  // Day column width: measure the header's day cells, then compare bar widths.
  const dayColWidth = await page.evaluate(() => {
    const cells = document.querySelectorAll('.grid > div');
    // second header cell (first day column, after the sticky "Event" label)
    const el = [...cells].find((c) => /^\d+$/.test(c.textContent?.trim() ?? ''));
    return el ? el.getBoundingClientRect().width : null;
  });
  check('day columns actually rendered', dayColWidth !== null && dayColWidth > 0, String(dayColWidth));

  const multiDayBar = page.locator('a:has-text("River Bend Music Fest")').first();
  const multiWidth = await multiDayBar.evaluate((el) => el.getBoundingClientRect().width).catch(() => null);
  const singleDayBar = page.locator('a:has-text("Harvest Festival")').first();
  const singleWidth = await singleDayBar.evaluate((el) => el.getBoundingClientRect().width).catch(() => null);

  check('the 3-day event bar is much wider than one day column',
    multiWidth !== null && dayColWidth !== null && multiWidth > dayColWidth * 2,
    `multi=${multiWidth} dayCol=${dayColWidth}`);
  check('the 6pm-10pm same-day event bar is a short bar, not a full day column',
    singleWidth !== null && dayColWidth !== null && singleWidth < dayColWidth * 0.6,
    `single=${singleWidth} dayCol=${dayColWidth}`);

  // Group by venue toggle.
  const groupToggle = page.locator('input[type=checkbox]').first();
  check('a "Group by venue" toggle is offered (fixtures carry a venue)', (await groupToggle.count()) > 0);
  if (await groupToggle.count()) {
    await groupToggle.check();
    await page.waitForTimeout(300);
    // The group header is CSS uppercase()'d, so innerText renders it in caps.
    const grouped = (await page.innerText('body')).toLowerCase();
    check('grouping shows the shared venue as a header', grouped.includes('riverfront park'), grouped.slice(0, 400));
    check('grouping shows a "No venue" bucket for events without one', grouped.includes('no venue'), grouped.slice(0, 400));
  }

  // Click-through.
  await singleDayBar.click();
  await page.waitForLoadState('networkidle');
  check('clicking a bar opens the event', page.url().includes('/events/'), page.url());

  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- /events: the same tab exists on the platform-wide page ----------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events?view=timeline`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const body = await page.innerText('body');
  check('the platform /events page also offers Timeline', body.includes('Timeline'), body.slice(0, 300));
  check('an event renders in the platform timeline too', body.includes('Harvest Festival'), body.slice(0, 300));
  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
