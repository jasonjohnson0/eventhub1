/**
 * Verifies the embed fragment: it is a fragment, it is scoped, it escapes
 * everything, it rejects hostile URLs, and it is navigable without JavaScript.
 * Then it mounts the fragment inside a hostile host page and checks nothing
 * executes and nothing bleeds.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const EMBED = `${BASE}/api/embed/riverside`;

let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const get = async (u) => {
  const r = await fetch(u);
  return { status: r.status, headers: r.headers, html: await r.text() };
};

// ---- shape -------------------------------------------------------------------
let r = await get(EMBED);
check('200 for a known slug', r.status === 200, String(r.status));
check('is a fragment, not a document',
  !/<!doctype|<html|<head|<body/i.test(r.html), 'fragment contains document tags');
check('carries its own scoped styles', r.html.startsWith('<style>') && r.html.includes('.ehx{'));
check('every style rule is scoped under .ehx',
  (r.html.match(/^\.(?!ehx)/gm) || []).length === 0, 'unscoped selector found');
check('served as html', (r.headers.get('content-type') || '').includes('text/html'));
check('cacheable by shared caches', /s-maxage=\d+/.test(r.headers.get('cache-control') || ''));
check('has a stale-while-revalidate window', /stale-while-revalidate/.test(r.headers.get('cache-control') || ''));
check('fetchable cross-origin', r.headers.get('access-control-allow-origin') === '*');
check('fragment itself is noindex', (r.headers.get('x-robots-tag') || '').includes('noindex'));

// ---- content -----------------------------------------------------------------
check('shows this coordinator\'s events',
  ['Harvest Festival', 'Farmers Market', 'Jazz on the Water'].every((t) => r.html.includes(t)));
check('hides another coordinator\'s events', !r.html.includes('Somebody'), 'leaked');
check('links back to the canonical page', r.html.includes('/c/riverside'));
check('event links point at the app', r.html.includes('https://events.example/events/e1'));

// ---- escaping ----------------------------------------------------------------
check('hostile event title is escaped',
  r.html.includes('&lt;img src=x onerror=') && !r.html.includes('<img src=x onerror='),
  'raw img tag present');
check('hostile sponsor name is escaped',
  r.html.includes('&lt;script&gt;') && !r.html.includes('<script>window.__XSS2'),
  'raw script tag present');
check('apostrophes are escaped', r.html.includes('O&#39;Brien') || !r.html.includes("O'Brien"));
check('ampersands in copy are escaped', r.html.includes('save 20%.') && r.html.includes('festival &amp;'));

// ---- hostile URLs ------------------------------------------------------------
check('javascript: sponsor link is not rendered as an href',
  !/href="javascript:/i.test(r.html), 'javascript: href emitted');
check('javascript: logo is not rendered as a src',
  !/src="javascript:/i.test(r.html), 'javascript: src emitted');
check('the good sponsor still renders', r.html.includes('Riverside Auto'));
check('sponsor link discloses paid placement',
  /rel="noopener noreferrer sponsored"/.test(r.html), 'missing rel=sponsored');

// ---- ad tracking -------------------------------------------------------------
// The advertiser's own URL must NOT appear: clicks go through our redirect so
// they can be counted, and so the destination is resolved from the database
// rather than from a URL anyone can rewrite.
check('the click goes through the tracking redirect',
  /href="[^"]*\/api\/ad\/c\/[0-9a-f-]{36}\?s=embed"/.test(r.html), 'no tracked click link');
check('the advertiser URL is not in the markup',
  !r.html.includes('https://riverside.example/offer'),
  'destination leaked into the link, so it could be rewritten');
check('an impression pixel is present',
  /<img class="ehx-px" src="[^"]*\/api\/ad\/i\/[0-9a-f-]{36}\?s=embed"/.test(r.html), 'no pixel');
check('the pixel is lazy, so unseen ads are not billed as views',
  /class="ehx-px"[^>]*loading="lazy"/.test(r.html), 'pixel loads eagerly');
check('the pixel is hidden from assistive tech',
  /class="ehx-px"[^>]*aria-hidden="true"/.test(r.html) && /class="ehx-px"[^>]*alt=""/.test(r.html));
check('a sponsor with no link gets no tracked anchor',
  (r.html.match(/\/api\/ad\/c\//g) || []).length
    <= (r.html.match(/\/api\/ad\/i\//g) || []).length,
  'more click links than ads');

// ---- navigable without JavaScript -------------------------------------------
for (const view of ['month', 'week', 'list', 'agenda']) {
  const v = await get(`${EMBED}?view=${view}`);
  check(`view=${view} renders`, v.status === 200 && v.html.includes('class="ehx"'), String(v.status));
}

// ---- multi-day events (spec 02): the e5 fixture spans 3 days -----------------
const monthWithMulti = await get(`${EMBED}?view=month`);
const multiChipCount = (monthWithMulti.html.match(/River Bend Music Fest/g) || []).length;
check('the multi-day event appears more than once in month view (once per occupied day)',
  multiChipCount >= 2, `found ${multiChipCount}`);
check('a continuation day is marked distinctly, not as a coincidentally-identical second event',
  monthWithMulti.html.includes('ehx-chip-cont'), 'no continuation marker found');
check('the continuation label references the same event, not a duplicate title standing alone',
  /→ River Bend Music Fest/.test(monthWithMulti.html), 'no "→" continuation label found');

const listWithMulti = await get(`${EMBED}?view=list`);
const listTitleCount = (listWithMulti.html.match(/River Bend Music Fest/g) || []).length;
check('list view shows the multi-day event exactly once, not once per day',
  listTitleCount === 1, `found ${listTitleCount}`);
const multiListItem = /<li class="ehx-item">(?:(?!<\/li>).)*River Bend Music Fest(?:(?!<\/li>).)*<\/li>/s.exec(
  listWithMulti.html,
);
check('list view shows a date range for the multi-day event, not just the start date',
  !!multiListItem && multiListItem[0].includes('–'), 'no range dash found in the item');
const next = /href="[^"]*view=month&amp;on=(\d{4}-\d{2}-\d{2})"/.exec(r.html);
check('month nav exposes a real anchored URL', !!next, 'no ?on= link found');
if (next) {
  const paged = await get(`${EMBED}?view=month&on=${next[1]}`);
  const month = new Date(`${next[1]}T12:00:00`).toLocaleString('en-US', { month: 'long' });
  check('anchored URL renders that month', paged.html.includes(month), month);
}

const missing = await get(`${BASE}/api/embed/no-such-calendar`);
check('unknown slug returns 404', missing.status === 404, String(missing.status));
check('404 body is still a safe fragment', missing.html.includes('Calendar not found'));

// ---- mounted in a hostile host page -----------------------------------------
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
await ctx.route('https://cdn.example.com/**', (route) =>
  route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
await ctx.route('https://host.example/**', (route) =>
  route.fulfill({
    status: 200, contentType: 'text/html',
    body: `<!doctype html><html><head><meta charset="utf-8"><title>A WordPress site</title>
<style>/* a hostile host theme */
div,a,p{background:red!important;color:red!important;font-size:60px!important}</style>
</head><body><h1>Local news</h1><main>${r.html}</main>
<p id="probe">host paragraph</p></body></html>`,
  }));

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('https://host.example/events/', { waitUntil: 'load' });
await page.waitForTimeout(500);

const xss = await page.evaluate(() => [window.__XSS, window.__XSS2]);
check('no injected script executed in the host page', xss.every((v) => v === undefined), JSON.stringify(xss));

const probe = await page.evaluate(() => {
  const s = getComputedStyle(document.getElementById('probe'));
  return { hostFont: s.fontSize, hostColor: s.color };
});
check('embed does not restyle the host page',
  probe.hostFont === '60px' && probe.hostColor === 'rgb(255, 0, 0)',
  JSON.stringify(probe));

// The direction the first version of this test missed: a hostile theme
// reaching INTO the embed. The screenshot was entirely red.
const inside = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    return { color: s.color, background: s.backgroundColor, fontSize: s.fontSize };
  };
  return { root: pick('.ehx'), chip: pick('.ehx-chip'), tab: pick('.ehx-views a'), ad: pick('.ehx-ad') };
});
check('host theme cannot recolour the embed text',
  inside.root && inside.root.color !== 'rgb(255, 0, 0)', JSON.stringify(inside.root));
check('host theme cannot resize the embed text',
  inside.root && inside.root.fontSize !== '60px', JSON.stringify(inside.root));
check('event chips keep their own styling',
  inside.chip && inside.chip.background !== 'rgb(255, 0, 0)', JSON.stringify(inside.chip));
check('view tabs keep their own styling',
  inside.tab && inside.tab.color !== 'rgb(255, 0, 0)', JSON.stringify(inside.tab));
check('sponsor card keeps its own styling',
  inside.ad && inside.ad.background !== 'rgb(255, 0, 0)', JSON.stringify(inside.ad));

// A long event title must not widen its column; all seven days stay equal.
const widths = await page.evaluate(() =>
  [...document.querySelectorAll('.ehx-grid .ehx-dow')].map((e) => Math.round(e.getBoundingClientRect().width)));
check('a long title does not blow out the day columns',
  widths.length === 7 && new Set(widths).size === 1, JSON.stringify(widths));

check('no uncaught errors in the host page', errs.length === 0, errs.join('; '));
await page.locator('.ehx').screenshot({ path: 'embed-fragment.png' });

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
