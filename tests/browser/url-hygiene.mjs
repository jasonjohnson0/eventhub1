/**
 * The canonical URL must stay canonical: no redirect on /c/<slug>, no default
 * params materialised into links, and every variant crediting the bare URL.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

// ---- no redirect on the URL an organizer hands out ---------------------------
for (const path of ['/c/riverside', '/c/riverside?view=list', '/c/riverside?on=2027-03-01']) {
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  check(`${path} is served, not redirected`, r.status === 200,
    `${r.status} -> ${r.headers.get('location')}`);
}

// ---- canonical consolidates every variant ------------------------------------
const canonOf = async (path) => {
  const html = await fetch(`${BASE}${path}`).then((r) => r.text());
  return /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/.exec(html)?.[1]
    ?? /<link[^>]*href="([^"]*)"[^>]*rel="canonical"/.exec(html)?.[1] ?? null;
};
const want = 'https://events.example/c/riverside';
for (const path of ['/c/riverside', '/c/riverside?view=photo', '/c/riverside?view=week&on=2027-03-01&q=jazz']) {
  check(`${path} credits the bare URL`, (await canonOf(path)) === want, String(await canonOf(path)));
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
const path = () => new URL(page.url()).pathname + new URL(page.url()).search;

// ---- links carry only what differs from the bare URL -------------------------
await page.goto(`${BASE}/c/riverside`, { waitUntil: 'networkidle' });
const hrefs = await page.$$eval('main a[href*="/c/riverside"]', (as) => as.map((a) => a.getAttribute('href')));
check('no link materialises an empty param',
  hrefs.every((h) => !/[?&](q|on|view)=(&|$)/.test(h)), hrefs.find((h) => /=(&|$)/.test(h)) || '');
check('the default view is not pinned into links',
  hrefs.every((h) => !h.includes('view=month')), hrefs.find((h) => h.includes('view=month')) || '');

await page.click('text=Photos');
await page.waitForTimeout(300);
check('a view switch yields exactly one param', path() === '/c/riverside?view=photo', path());

await page.click('text=Month');
await page.waitForTimeout(300);
check('switching back to the default returns to the bare URL', path() === '/c/riverside', path());

// ---- stepping months ---------------------------------------------------------
await page.click('button[aria-label="Next period"]');
await page.waitForTimeout(300);
check('stepping adds only the anchor', /^\/c\/riverside\?on=\d{4}-\d{2}-\d{2}$/.test(path()), path());

await page.goBack();
await page.waitForTimeout(300);
check('Back undoes a month step', path() === '/c/riverside', path());

// ---- a junk URL heals on the first click -------------------------------------
await page.goto(`${BASE}/c/riverside?view=bogus&on=nonsense`, { waitUntil: 'networkidle' });
check('a junk URL still renders', await page.locator('main').isVisible());
await page.click('button[aria-label="Next period"]');
await page.waitForTimeout(300);
check('junk params are dropped, not carried along',
  /^\/c\/riverside\?on=\d{4}-\d{2}-\d{2}$/.test(path()), path());

// ---- typing does not stack history entries -----------------------------------
await page.goto(`${BASE}/c/riverside`, { waitUntil: 'networkidle' });
const before = await page.evaluate(() => history.length);
await page.fill('input[aria-label="Search events"]', '');
await page.type('input[aria-label="Search events"]', 'jazz', { delay: 60 });
await page.waitForTimeout(400);
const after = await page.evaluate(() => history.length);
check('typing a 4-letter query does not add 4 history entries', after - before <= 1, `${before} -> ${after}`);
check('the query does reach the URL', page.url().includes('q=jazz'), path());

check('no uncaught errors', errs.length === 0, errs.join('; '));
await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
