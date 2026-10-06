/**
 * Feed ads follow each calendar's Local / Network-wide setting for free,
 * paid and lapsed calendars. The mock's campaign RPC applies the same rule as
 * coordinator_effective_ads (the rule itself is tested in
 * tests/db/calendar-ad-flags.py); this suite checks the feed shows exactly
 * what that rule allows, most specific first, capped at two, and nothing
 * when nothing qualifies. Impression pixels are intercepted so nothing counts.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.route('**/api/ad/i/**', (r) => r.fulfill({ status: 200, contentType: 'image/gif', body: '' }));
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const BAKERY = 'Main Street Bakery';   // calendar-scope, named this calendar
const LOCAL = 'County Hardware';       // geo
const NETWORK = 'Statewide Credit Union';

async function adsOn(slug) {
  await page.goto(`${BASE}/c/${slug}?view=feed`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const breaks = await page.locator('[data-feed-ad-break]').count();
  const text = breaks ? await page.locator('[data-feed-ad-break]').first().innerText() : '';
  const names = [BAKERY, LOCAL, NETWORK].filter((n) => text.includes(n));
  return { breaks, names };
}

const cases = [
  ['free, Local only', 'ads-free-local', [BAKERY, LOCAL]],
  ['free, Network-wide only', 'ads-free-network', [BAKERY, NETWORK]],
  ['free, both on (capped at two, most specific first)', 'ads-free-both', [BAKERY, LOCAL]],
  ['paid, both off: only the campaign that picked this calendar', 'ads-paid-off', [BAKERY]],
  ['paid, both off, no campaign picked it: ad-free', 'ads-paid-off-unnamed', []],
  ['paid, Network-wide only', 'ads-paid-network', [NETWORK]],
  ['lapsed from ad-free: restores last choice (Network-wide)', 'ads-lapsed', [BAKERY, NETWORK]],
  ['lapsed with no remembered choice: falls back to Local', 'ads-lapsed-default', [LOCAL]],
];

for (const [label, slug, expected] of cases) {
  const { breaks, names } = await adsOn(slug);
  const ok = expected.length === 0
    ? breaks === 0
    : breaks === 1 && JSON.stringify(names) === JSON.stringify(expected);
  check(label, ok, `breaks=${breaks} shown=[${names.join(', ')}] expected=[${expected.join(', ')}]`);
}

// Order: the calendar-scope ad comes first in the break.
await page.goto(`${BASE}/c/ads-free-both?view=feed`, { waitUntil: 'networkidle' });
const first = await page.locator('[data-feed-ad]').first().innerText().catch(() => '');
check('most specific ad is listed first', first.includes(BAKERY), first.slice(0, 80));
const hrefs = await page.$$eval('[data-feed-ad] a', (as) => as.map((a) => a.getAttribute('href')));
check('feed ad clicks are tracked with the feed surface', hrefs.length > 0 && hrefs.every((h) => h.includes('?s=feed')), hrefs.join(' '));

check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join('; '));
await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
