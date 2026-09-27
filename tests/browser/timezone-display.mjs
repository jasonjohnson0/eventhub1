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

// ---- gap closure: every view places events on the EVENT's wall clock ---------
// Pinned fixtures (mock /__events/tz): "Chicago Six PM" 18:00-22:00 Chicago on
// the 15th, "Tokyo Morning" 08:30 Tokyo on the 16th, "Phoenix Evening" 18:00
// Phoenix on the 17th -- all of the current month. Before the fix, every
// view bucketed by the VIEWER's clock: a Tokyo viewer saw the Chicago event
// on the 16th in the 8am row, while its label said 6:00 PM.
{
  const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
  await fetch(`${MOCK}/__events/tz/reset`);
  await fetch(`${MOCK}/__events/tz`);
  const n = new Date();
  const ym = `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}`;
  const D = (d) => `${ym}-${String(d).padStart(2, '0')}`;

  for (const viewer of ['Asia/Tokyo', 'America/Chicago', 'Pacific/Honolulu']) {
    const ctx = await browser.newContext({ timezoneId: viewer, viewport: { width: 1280, height: 1000 } });
    const errs = [];
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(String(e)));
    const go = async (qs) => {
      await page.goto(`${BASE}/c/riverside?${qs}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
    };
    const tag = `[viewer ${viewer}]`;
    const differs = viewer !== 'America/Chicago';

    // Month: the day cell each chip starts in.
    await go(`on=${D(15)}`);
    const monthDate = async (id) =>
      page.getAttribute(`[data-month-event="${id}"]`, 'data-start-date', { timeout: 3000 }).catch(() => null);
    check(`${tag} month: Chicago 6pm event sits on the 15th`, (await monthDate('tz-chi')) === D(15), await monthDate('tz-chi'));
    check(`${tag} month: Tokyo 8:30am event sits on the 16th`, (await monthDate('tz-tok')) === D(16), await monthDate('tz-tok'));
    check(`${tag} month: Phoenix 6pm event sits on the 17th`, (await monthDate('tz-phx')) === D(17), await monthDate('tz-phx'));
    const chipTitle = await page.getAttribute('[data-month-event="tz-chi"] a', 'title', { timeout: 3000 }).catch(() => '');
    check(`${tag} month: chip tooltip states the event's zone`, /6:00\s?PM C[DS]T/.test(chipTitle ?? ''), chipTitle);

    // Week: exact (day, hour) cell.
    await go(`view=week&on=${D(15)}`);
    const cellOf = async (id) =>
      page.locator(`[data-cell] [data-event-id="${id}"]`).first()
        .evaluate((el) => el.closest('[data-cell]').dataset.cell, null, { timeout: 3000 }).catch(() => null);
    check(`${tag} week: Chicago event in the 15th's 6pm row`, (await cellOf('tz-chi')) === `${D(15)}|18`, await cellOf('tz-chi'));
    const weekBadge = await page.locator('[data-cell] [data-event-id="tz-chi"] [data-tz-badge]').count();
    check(`${tag} week: compact slot carries a zone badge only when the viewer is elsewhere`,
      differs ? weekBadge === 1 : weekBadge === 0, String(weekBadge));

    // Day: present on its own day in the 18:00 row, absent from the next day.
    await go(`view=day&on=${D(15)}`);
    const hourOf = async (id) =>
      page.locator(`[data-hour] [data-event-id="${id}"]`).first()
        .evaluate((el) => el.closest('[data-hour]').dataset.hour, null, { timeout: 3000 }).catch(() => null);
    check(`${tag} day: Chicago event on the 15th in the 6pm row`, (await hourOf('tz-chi')) === '18', await hourOf('tz-chi'));
    const chiBadge = page.locator('[data-hour] [data-event-id="tz-chi"] [data-tz-badge]');
    check(`${tag} day: zone badge on the Chicago event ${differs ? 'shown (viewer elsewhere)' : 'hidden (same zone)'}`,
      differs ? (await chiBadge.count()) === 1 : (await chiBadge.count()) === 0, String(await chiBadge.count()));
    if (differs) {
      const txt = await chiBadge.innerText({ timeout: 3000 }).catch(() => '');
      check(`${tag} day: the badge names the event's zone (CDT/CST)`, /^C[DS]T$/.test(txt.trim()), txt);
    }
    await go(`view=day&on=${D(16)}`);
    check(`${tag} day: the Chicago event is NOT on the 16th`, (await page.locator('[data-event-id="tz-chi"]').count()) === 0);
    check(`${tag} day: Tokyo event on the 16th in the 8am row`, (await hourOf('tz-tok')) === '8', await hourOf('tz-tok'));

    // List: explicit zone label on the time.
    await go('view=list');
    const listText = await page.innerText('body');
    check(`${tag} list: Chicago event reads 6:00 PM in its own zone`, /6:00\s?PM C[DS]T/.test(listText), listText.slice(0, 200));
    check(`${tag} list: Phoenix event reads 6:00 PM MST (no DST)`, /6:00\s?PM MST/.test(listText), listText.slice(0, 200));

    // Summary + Photo: badges next to times for events whose zone differs.
    // Every viewer here differs from at least the Tokyo and Phoenix events.
    for (const v of ['summary', 'photo']) {
      await go(`view=${v}`);
      const badges = await page.locator('[data-tz-badge]').count();
      check(`${tag} ${v}: zone badges appear for events in other zones`, badges > 0, String(badges));
    }

    // Timeline (day zoom so bars are wide enough to carry the badge).
    await go(`view=timeline&on=${D(15)}`);
    await page.click('[data-zoom-button="day"]', { timeout: 3000 }).catch(() => {});
    await page.evaluate((x) => { const el = document.querySelector('[data-timeline-scroller]'); if (el) el.scrollLeft = x; }, (14 * 24 + 17) * 64);
    await page.waitForTimeout(400);
    const bar = page.locator('[data-timeline-bar][data-event-id="tz-chi"]');
    const barLeft = await bar.evaluate((el) => parseFloat(el.style.left), null, { timeout: 3000 }).catch(() => null);
    check(`${tag} timeline: Chicago bar starts at 18:00 on the 15th`, barLeft === (14 * 24 + 18) * 64, String(barLeft));
    const barBadge = await bar.locator('[data-tz-badge]').count().catch(() => 0);
    check(`${tag} timeline: bar badge ${differs ? 'shown' : 'hidden'}`, differs ? barBadge === 1 : barBadge === 0, String(barBadge));

    check(`${tag} no uncaught errors (incl. hydration mismatches)`, errs.length === 0, errs.slice(0, 3).join('; '));
    await ctx.close();
  }

  // The badge is client-only: server HTML must never contain one (the server
  // can't know the viewer's zone), which is also what keeps hydration clean.
  const html = await (await fetch(`${BASE}/c/riverside?view=list`)).text();
  check('server-rendered HTML contains no zone badge', !html.includes('data-tz-badge'));
  await fetch(`${MOCK}/__events/tz/reset`);
}

// ---- gap closure: searchable IANA picker on the edit form ---------------------
{
  const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const COORD = '11111111-1111-1111-1111-111111111111';
  const jwt = [b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ sub: COORD, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com', iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
    'c2lnbmF0dXJl'].join('.');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'America/Chicago' });
  await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
    ['sb-127-auth-token', JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r',
      user: { id: COORD, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } })]);
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/aaaaaaaa-1111-4111-8111-111111111111/manage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^Edit$/ }).first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const trigger = page.locator('[data-timezone-picker]');
  check('edit form offers the searchable timezone picker', (await trigger.count()) === 1);
  if (await trigger.count()) {
    await trigger.click();
    await page.keyboard.type('london');
    await page.waitForTimeout(300);
    const options = await page.locator('[cmdk-item]').allInnerTexts();
    check('searching "london" finds Europe/London (not in the old 7-zone list)', options.some((o) => o.includes('Europe/London')), options.slice(0, 5).join(' | '));
    await page.locator('[cmdk-item]', { hasText: 'Europe/London' }).first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
    check('picking it updates the field', (await trigger.getAttribute('data-timezone-picker')) === 'Europe/London',
      await trigger.getAttribute('data-timezone-picker'));
    await trigger.click();
    await page.keyboard.type('CDT');
    await page.waitForTimeout(300);
    const byAbbr = await page.locator('[cmdk-item]').allInnerTexts();
    check('searching by abbreviation ("CDT") finds America/Chicago', byAbbr.some((o) => o.includes('America/Chicago')), byAbbr.slice(0, 5).join(' | '));
    await page.keyboard.press('Escape');
  }
  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
