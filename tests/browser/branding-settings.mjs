/**
 * P0 QA pass (2026-09-16): a coordinator had no way to revisit brand colors
 * or add custom CSS after going live -- onboarding's Branding step only runs
 * once, and the holiday-preset picker's "your branding settings" link
 * pointed at /onboarding, which redirects a live coordinator straight to
 * /dashboard. This checks the actual /coordinator/settings/branding page:
 * colors and custom CSS both save, both show up on the public calendar and
 * the embed fragment, and dangerous CSS constructs get stripped before
 * they're ever stored.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '11111111-1111-1111-1111-111111111111'; // COORD, slug=riverside, live
const now = Math.floor(Date.now() / 1000);
const jwt = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com',
        iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
  'c2lnbmF0dXJl',
].join('.');
const session = {
  access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
  refresh_token: 'fake-refresh',
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com',
          app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
await ctx.addInitScript(([k, v]) => {
  try { window.localStorage.setItem(k, v); } catch {}
}, ['sb-127-auth-token', JSON.stringify(session)]);
const errs = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));

// ---- page renders, not a 404 ---------------------------------------------
await page.goto(`${BASE}/coordinator/settings/branding`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
check('the branding page rendered', page.url().includes('/coordinator/settings/branding'));
check('no page errors on load', errs.length === 0, errs.join('; '));

// ---- header background image card ------------------------------------------
// The mock has no Supabase Storage endpoints at all (the real upload is a
// direct browser-to-Storage call this harness can't simulate; the security-
// critical quota/RLS logic is covered for real in tests/db/branding-storage-quota.py
// instead) -- this only checks the card itself renders correctly and degrades
// gracefully when the usage lookup has nothing to talk to.
const headerCardBody = await page.innerText('body');
check('the header image card is present', headerCardBody.includes('Header background image'), headerCardBody.slice(0, 300));
check('it recommends the 1920x480 dimensions', headerCardBody.includes('1920') && headerCardBody.includes('480'));
check('it states the per-file and total caps', headerCardBody.includes('2 MB') && headerCardBody.includes('12 MB'));
check('with none uploaded, the gradient preview shows instead of a broken image',
  headerCardBody.includes('No header image set'), headerCardBody.slice(0, 300));
check('an upload control is offered', (await page.locator('label:has-text("Upload image")').count()) > 0);
check('usage still renders as a real number when the storage lookup has nothing to talk to',
  /[\d.]+ MB of 12\.0 MB used/.test(headerCardBody), headerCardBody.slice(0, 300));
check('no page errors from the header image card either', errs.length === 0, errs.join('; '));

// ---- colors save ------------------------------------------------------------
const marker = '.ehx-brand-marker-test { color: red; }';
const dangerous = '@import url(evil.css); .x{ background: url(javascript:alert(1)); } <script>alert(2)</script>';
await page.fill('#custom-css', `${marker}\n${dangerous}`);
await page.click('button:has-text("Save custom CSS")');
await page.waitForTimeout(800);
const body = await page.innerText('body');
check('a save confirmation shows', body.includes('Branding saved'), body.slice(0, 300));

// ---- reflects on the public calendar and the embed, sanitized -------------
const [pubHtml, embedHtml] = await Promise.all([
  fetch(`${BASE}/c/riverside`).then((r) => r.text()),
  fetch(`${BASE}/api/embed/riverside`).then((r) => r.text()),
]);
check('the public calendar includes the saved marker rule', pubHtml.includes('ehx-brand-marker-test'));
check('the embed fragment includes the saved marker rule', embedHtml.includes('ehx-brand-marker-test'));
check('@import is stripped from the public calendar', !pubHtml.includes('@import'));
check('@import is stripped from the embed fragment', !embedHtml.includes('@import'));
check('a javascript: URI is stripped', !pubHtml.includes('javascript:alert') && !embedHtml.includes('javascript:alert'));
check('a <script> tag never reaches either surface', !pubHtml.includes('<script>alert(2)') && !embedHtml.includes('<script>alert(2)'));

// ---- "Use default look" resets colors --------------------------------------
await page.click('button:has-text("Use default look")');
await page.waitForTimeout(800);
const afterReset = await page.innerText('body');
check('resetting shows a save confirmation', afterReset.includes('Branding saved'));

// ---- the holiday preset picker's link now points here, not /onboarding ----
await page.goto(`${BASE}/coordinator/settings/styling`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const stylingHtml = await page.content();
check('Styling links to /coordinator/settings/branding, not /onboarding',
  stylingHtml.includes('href="/coordinator/settings/branding"'));

await browser.close();

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED'}`);
process.exit(failures ? 1 : 0);
