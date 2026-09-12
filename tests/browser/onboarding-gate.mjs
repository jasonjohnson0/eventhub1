/**
 * "Go live" used to complete onboarding with no calendar address at all --
 * clicked live on production, confirmed with slug='' in the database, and the
 * coordinator was told "Your calendar is live!" with nothing for /c/ to serve.
 * completeOnboarding() now refuses server-side; this checks the button itself
 * is disabled and explains why, so nobody has to find out by clicking through.
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
const UID = 'cccccccc-1111-4111-8111-111111111111'; // the mock's UNSLUGGED fixture
const now = Math.floor(Date.now() / 1000);
const jwt = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated',
        email: 'noslug@example.com', iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
  'c2lnbmF0dXJl',
].join('.');
const session = {
  access_token: jwt, token_type: 'bearer', expires_in: 3600,
  expires_at: now + 3600, refresh_token: 'fake-refresh',
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'noslug@example.com',
          app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1.5 });
await ctx.addInitScript(([k, v]) => {
  try { window.localStorage.setItem(k, v); } catch {}
}, ['sb-127-auth-token', JSON.stringify(session)]);
const errs = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const body = await page.innerText('body');
check('a profile with setup_step 7 and no slug lands on Review',
  body.includes('Review & activate'), body.slice(0, 300));
const addressLine = body.split('\n').find((l) => l.trim().startsWith('Address'));
check('the Address summary shows nothing chosen yet, not a fabricated one',
  !!addressLine && !addressLine.includes('.lovable.app'), addressLine ?? '(no Address line found)');
check('a visible warning explains why the calendar cannot go live',
  /choose a calendar address/i.test(body), body.slice(0, 500));
check('the warning links back to the Address step',
  (await page.locator('button:has-text("Go back to Address")').count()) > 0);

const goLive = page.locator('button:has-text("Go live")').first();
check('the Go live button is present', (await goLive.count()) > 0);
check('and it is disabled', await goLive.isDisabled(), 'button was clickable with no slug');

check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
