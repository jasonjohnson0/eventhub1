/**
 * Drives /c/$slug against the mock Supabase: coordinator scoping, every view,
 * date navigation, search, and the not-found path.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
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

// ---- scoping -----------------------------------------------------------------
let body = await go('/c/riverside');
check('coordinator name renders', body.includes('Riverside Events Co.'));
check('description renders', body.includes('Community festivals'));
check('shows this coordinator\'s events', ['Harvest Festival', 'Farmers Market', 'Jazz on the Water'].every((t) => body.includes(t)), body.slice(0, 200));
check('hides another coordinator\'s event', !body.includes('Somebody'), 'leaked another coordinator');

// ---- every view --------------------------------------------------------------
for (const view of ['month', 'week', 'day', 'list', 'photo', 'summary', 'agenda']) {
  body = await go(`/c/riverside?view=${view}`);
  const broke = body.includes('No calendar here') || /Unexpected|Cannot read|is not a function/i.test(body);
  check(`view=${view} renders`, !broke, body.slice(0, 160));
}

// ---- the view switcher is real links (crawlable, works without JS) -----------
await go('/c/riverside?view=month');
const hrefs = await page.$$eval('a[href*="view="]', (as) => as.map((a) => a.getAttribute('href')));
check('view switcher uses real hrefs', hrefs.length >= 6, `${hrefs.length} links`);
check('switcher links carry the slug', hrefs.every((h) => h.includes('/c/riverside')), hrefs.slice(0, 2).join(' '));

// ---- date navigation writes a shareable URL ----------------------------------
await go('/c/riverside?view=month');
const labelBefore = await page.textContent('main span.text-lg');
await page.click('button[aria-label="Next period"]');
await page.waitForTimeout(400);
const labelAfter = await page.textContent('main span.text-lg');
const url = page.url();
check('next period changes the label', labelBefore !== labelAfter, `${labelBefore} -> ${labelAfter}`);
check('next period is reflected in the URL', /[?&]on=\d{4}-\d{2}-\d{2}/.test(url), url);

// A crawler hitting that URL cold must get the same month.
const deep = await go(`/c/riverside?view=month&on=${/on=([\d-]+)/.exec(url)[1]}`);
check('anchored URL renders the same month', deep.includes(labelAfter.trim()), labelAfter);

// ---- search ------------------------------------------------------------------
body = await go('/c/riverside?view=list&q=jazz');
check('search narrows the list', body.includes('Jazz on the Water') && !body.includes('Farmers Market'), body.slice(0, 200));

// ---- unknown slug ------------------------------------------------------------
body = await go('/c/does-not-exist');
check('unknown slug shows the not-found page', body.includes('No calendar here'), body.slice(0, 160));

// ---- SSR: events must be in the HTML, not injected after hydration -----------
const ssr = await fetch(`${BASE}/c/riverside?view=list`).then((r) => r.text());
check('SSR html contains the events', ssr.includes('Harvest Festival'), 'events missing from server HTML');
check('SSR html has the coordinator title', /<title>Riverside Events Co\. — Events<\/title>/.test(ssr));

check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join('; '));

// ---- header background image --------------------------------------------
// Mutates the shared riverside fixture the rest of this suite assumes is
// unmodified (same reasoning as edit-calendar-slug.mjs's restoreSlug) --
// restored in a finally so no test that runs after this one sees it.
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
const COORD = '11111111-1111-1111-1111-111111111111';
const TEST_HEADER_URL = 'https://cdn.example.com/branding/header-test.jpg';
try {
  await fetch(`${MOCK}/rest/v1/coordinator_profiles?coordinator_id=eq.${COORD}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ header_image_url: TEST_HEADER_URL }),
  });
  const withHeader = await go('/c/riverside');
  const headerHtml = await page.locator('header').first().innerHTML();
  check('the header renders the uploaded background image', headerHtml.includes(TEST_HEADER_URL), headerHtml.slice(0, 300));
  check('page content still renders normally alongside the header image',
    withHeader.includes('Riverside Events Co.') && withHeader.includes('Harvest Festival'), withHeader.slice(0, 200));

  await fetch(`${MOCK}/rest/v1/coordinator_profiles?coordinator_id=eq.${COORD}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ header_image_url: null }),
  });
  await go('/c/riverside');
  const gradientHtml = await page.locator('header').first().innerHTML();
  const gradientStyle = await page.locator('header').first().getAttribute('style').catch(() => null);
  check('clearing it falls back to the color gradient, not a broken image',
    !gradientHtml.includes(TEST_HEADER_URL) && gradientStyle?.includes('gradient'), (gradientStyle ?? '') + gradientHtml.slice(0, 200));
} finally {
  await fetch(`${MOCK}/rest/v1/coordinator_profiles?coordinator_id=eq.${COORD}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ header_image_url: null }),
  }).catch(() => {});
}

await go('/c/riverside?view=month');
await page.screenshot({ path: 'coordinator-page.png', fullPage: false });

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
