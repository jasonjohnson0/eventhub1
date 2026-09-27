/**
 * Timeline view: the 8th public calendar view. Proves each acceptance
 * criterion against the real rendered page, with geometry measured via
 * getBoundingClientRect/inline styles rather than text presence:
 *   - reachable from the same view switcher as the other views
 *   - a multi-day event is ONE continuous bar spanning its full duration
 *   - overlapping same-day events stack into separate, non-colliding lanes
 *   - Day/Week/Month zoom re-scales bars by exactly the density ratio
 *   - 250+ events: virtualized (few DOM bars) and scrolls without long tasks
 *   - mobile: no page-level horizontal overflow; the timeline scrolls itself
 *
 * Fixtures come from the mock's /__events/timeline hook, pinned to fixed days
 * of the *current* month (see the comment there for why not day(n)).
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};
// Opt-in visual record: SHOTS_DIR=/some/dir tests/run.sh browser timeline
const shot = async (page, name) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/timeline-${name}.png` });
};
const near = (a, b, eps = 1.5) => a !== null && b !== null && Math.abs(a - b) <= eps;

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const barBox = (page, id) =>
  page
    .locator(`[data-timeline-bar][data-event-id="${id}"]`)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: parseFloat(el.style.left), width: r.width, top: r.top, bottom: r.bottom, x: r.left, right: r.right, lane: Number(el.dataset.lane) };
    })
    .catch(() => null);

await fetch(`${MOCK}/__events/timeline/reset`);
await fetch(`${MOCK}/__events/timeline?n=0`);

// ---- view switcher, geometry, lanes, zoom, grouping, click-through ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'UTC' });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/c/riverside`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const timelineTab = page.locator('a:has-text("Timeline")').first();
  check('a Timeline tab is offered in the same switcher as the other views', (await timelineTab.count()) > 0);
  for (const other of ['Month', 'Week', 'Day', 'List']) {
    check(`...alongside ${other}`, (await page.locator(`a:has-text("${other}")`).count()) > 0);
  }
  await timelineTab.click();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-timeline-bar]', { timeout: 10000 }).catch(() => {});
  check('the URL reflects view=timeline', page.url().includes('view=timeline'), page.url());
  await shot(page, 'month');
  check('month zoom is the default', (await page.getAttribute('[data-timeline]', 'data-zoom')) === 'month');

  // Month zoom = 2px/hour. The fair runs day 10 18:00 -> day 13 14:00 = 68h.
  const multi = await barBox(page, 'tl-multi');
  check('a multi-day event renders as exactly one bar',
    (await page.locator('[data-timeline-bar][data-event-id="tl-multi"]').count()) === 1);
  check('the multi-day bar spans its full 68h duration (136px at month zoom)', near(multi?.width, 136), JSON.stringify(multi));
  check('the multi-day bar starts at day 10, 18:00 ((9*24+18)*2 = 468px)', near(multi?.left, 468), JSON.stringify(multi));

  const short = await barBox(page, 'tl-short');
  const overlap = await barBox(page, 'tl-overlap');
  check('a 4h same-day event is a short bar, not a full day (48px)', short && short.width < 48, JSON.stringify(short));
  check('overlapping same-day events are in different lanes', short && overlap && short.lane !== overlap.lane,
    `${short?.lane} vs ${overlap?.lane}`);
  check('overlapping bars do not visually collide (no vertical overlap)',
    short && overlap && (short.bottom <= overlap.top || overlap.bottom <= short.top), JSON.stringify({ short, overlap }));

  // Zoom: week (8px/h) and day (64px/h) re-scale exactly.
  await page.click('[data-zoom-button="week"]');
  await page.waitForTimeout(300);
  const multiW = await barBox(page, 'tl-multi');
  await shot(page, 'week');
  check('week zoom: the multi-day bar is 4x wider (544px)', near(multiW?.width, 544), JSON.stringify(multiW));
  check('week zoom: its start re-scales too (1872px)', near(multiW?.left, 1872), JSON.stringify(multiW));
  await page.click('[data-zoom-button="day"]');
  await page.waitForTimeout(300);
  // At day zoom the fair (x = 234h * 64 = 14976px) is far off-screen, so it
  // is correctly not in the DOM until scrolled to. Scroll there, then read
  // its inline left/width -- the ground truth for positioning.
  await page.evaluate(() => { document.querySelector('[data-timeline-scroller]').scrollLeft = 14976 - 200; });
  await page.waitForTimeout(300);
  const multiD = await page
    .locator('[data-timeline-bar][data-event-id="tl-multi"]')
    .evaluate((el) => ({ left: parseFloat(el.style.left), width: parseFloat(el.style.width) }))
    .catch(() => null);
  const shortD = await page
    .locator('[data-timeline-bar][data-event-id="tl-short"]')
    .evaluate((el) => ({ left: parseFloat(el.style.left), width: parseFloat(el.style.width) }))
    .catch(() => 'virtualized-out');
  check('day zoom: the multi-day bar is 32x the month width (4352px)', multiD && near(multiD.width, 4352), JSON.stringify(multiD));
  check('day zoom: a bar far off-screen is virtualized out of the DOM', shortD === 'virtualized-out', JSON.stringify(shortD));
  check('the zoom button reflects the active level', (await page.getAttribute('[data-zoom-button="day"]', 'aria-pressed')) === 'true');
  // Axis ticks at day zoom are hourly and line up with the bar: the 6 PM tick
  // on day 10 sits exactly at the fair's left edge.
  const tickAligned = await page.evaluate((barLeft) => {
    const ticks = [...document.querySelectorAll('[data-timeline] .sticky.top-0 > div')];
    return ticks.some((t) => t.textContent === '6 PM' && Math.abs(parseFloat(t.style.left) - barLeft) < 0.5);
  }, multiD?.left ?? -1);
  check('day zoom: the "6 PM" axis tick lines up with the 6pm bar start', tickAligned);
  await page.click('[data-zoom-button="month"]');
  await page.waitForTimeout(300);
  const back = await barBox(page, 'tl-multi');
  check('zooming back to month restores the original geometry', near(back?.width, 136) && near(back?.left, 468), JSON.stringify(back));

  // Group by venue (the fair carries venue-1).
  const groupToggle = page.locator('label:has-text("Group by venue") input[type=checkbox]');
  check('a "Group by venue" toggle is offered', (await groupToggle.count()) > 0);
  if (await groupToggle.count()) {
    await groupToggle.check();
    await page.waitForTimeout(300);
    const grouped = (await page.innerText('[data-timeline]')).toLowerCase();
    check('grouping shows the venue as a header', grouped.includes('riverfront park'), grouped.slice(0, 300));
    check('grouping shows a "No venue" bucket', grouped.includes('no venue'), grouped.slice(0, 300));
    await groupToggle.uncheck();
  }

  await page.locator('[data-timeline-bar][data-event-id="tl-short"]').click();
  await page.waitForLoadState('networkidle');
  check('clicking a bar opens the event', page.url().includes('/events/tl-short'), page.url());
  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- density: 250+ events ---------------------------------------------------
await fetch(`${MOCK}/__events/timeline/reset`);
await fetch(`${MOCK}/__events/timeline?n=250`);
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'UTC' });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push(e.duration); })
        .observe({ type: 'longtask', buffered: true });
    } catch {}
  });
  await page.goto(`${BASE}/c/riverside?view=timeline`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-timeline-bar]', { timeout: 10000 }).catch(() => {});
  const summary = await page.innerText('[data-timeline] p').catch(() => '');
  const total = Number(/(\d+) events? this month/.exec(summary)?.[1] ?? 0);
  await shot(page, 'dense-month');
  check('253+ events are laid out this month', total >= 253, summary);

  for (const zoom of ['month', 'week', 'day']) {
    await page.click(`[data-zoom-button="${zoom}"]`);
    await page.waitForTimeout(300);
    const domBars = await page.locator('[data-timeline-bar]').count();
    // At month zoom the whole month (1,440px) fits in one screen, so every
    // bar legitimately renders; the sweep below still has to be jank-free.
    if (zoom !== 'month') {
      check(`${zoom} zoom: only a window of bars is in the DOM (virtualized: ${domBars} of ${total})`,
        domBars > 0 && domBars < total, `${domBars}/${total}`);
    }
    // Sweep the whole axis in 40 steps, one frame each, and record frame gaps
    // and long tasks. "No jank" = no main-thread task over 100ms, and at most
    // a couple over 50ms across the whole sweep.
    await page.evaluate(() => { window.__longTasks = []; });
    const sweep = await page.evaluate(async () => {
      const el = document.querySelector('[data-timeline-scroller]');
      const max = el.scrollWidth - el.clientWidth;
      const gaps = [];
      let last = performance.now();
      const seen = new Set();
      for (let i = 0; i <= 40; i++) {
        el.scrollLeft = (max * i) / 40;
        el.scrollTop = ((el.scrollHeight - el.clientHeight) * (i % 5)) / 4;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const now = performance.now();
        gaps.push(now - last);
        last = now;
        document.querySelectorAll('[data-timeline-bar]').forEach((b) => seen.add(b.dataset.eventId));
      }
      gaps.sort((a, b) => a - b);
      return { p95: gaps[Math.floor(gaps.length * 0.95)], worst: gaps[gaps.length - 1], seen: seen.size, max };
    });
    const longTasks = await page.evaluate(() => window.__longTasks);
    if (zoom !== 'month') {
      check(`${zoom} zoom: scrolling the full axis re-renders the window (saw ${sweep.seen} distinct bars)`,
        sweep.seen > domBars, JSON.stringify(sweep));
    }
    check(`${zoom} zoom: no main-thread task over 100ms while scrolling`, longTasks.every((d) => d <= 100), JSON.stringify(longTasks));
    check(`${zoom} zoom: at most 2 tasks over 50ms across the sweep`, longTasks.filter((d) => d > 50).length <= 2, JSON.stringify(longTasks));
    check(`${zoom} zoom: p95 of two-frame scroll steps stays under 100ms`, sweep.p95 < 100, JSON.stringify(sweep));
  }
  // Nothing collides even at this density.
  await page.click('[data-zoom-button="month"]');
  await page.waitForTimeout(300);
  const collisions = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-timeline-bar]')].map((b) => b.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) n++;
      }
    return n;
  });
  check('250+ events: no two rendered bars overlap on screen', collisions === 0, String(collisions));
  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- mobile -----------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, timezoneId: 'UTC' });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/c/riverside?view=timeline`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-timeline-bar]', { timeout: 10000 }).catch(() => {});
  const m = await page.evaluate(() => {
    const el = document.querySelector('[data-timeline-scroller]');
    const zoom = document.querySelector('[data-zoom-button="day"]')?.getBoundingClientRect();
    return {
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      scrollerWidth: el?.clientWidth ?? 0,
      scrollerScrolls: el ? el.scrollWidth > el.clientWidth : false,
      zoomVisible: !!zoom && zoom.right <= window.innerWidth && zoom.width > 0,
    };
  });
  await shot(page, 'mobile');
  check('mobile: the page itself never scrolls sideways', m.pageOverflow <= 0, JSON.stringify(m));
  check('mobile: the timeline fits the screen and scrolls internally', m.scrollerWidth <= 375 && m.scrollerScrolls, JSON.stringify(m));
  check('mobile: zoom controls are on-screen', m.zoomVisible, JSON.stringify(m));
  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}
await fetch(`${MOCK}/__events/timeline/reset`);

// ---- /events: the same tab exists on the platform-wide page ----------------
{
  await fetch(`${MOCK}/__events/timeline?n=0`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'UTC' });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events?view=timeline`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const body = await page.innerText('body');
  check('the platform /events page also offers Timeline', body.includes('Timeline'), body.slice(0, 300));
  check('an event renders in the platform timeline too',
    (await page.locator('[data-timeline-bar]').count()) > 0, body.slice(0, 300));
  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
  await fetch(`${MOCK}/__events/timeline/reset`);
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
