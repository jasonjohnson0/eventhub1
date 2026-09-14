/**
 * The admin "delete my calendar" danger zone on /settings: visible only to
 * a completed coordinator who is also an admin, gated behind a dialog that
 * requires typing the calendar's own address back before Confirm unlocks.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const COORD = '11111111-1111-1111-1111-111111111111'; // the mock's riverside fixture, an admin by default

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const jwt = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: COORD, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com', iat: now, exp: now + 3600,
        iss: 'http://127.0.0.1:54199/auth/v1' }),
  'c2lnbmF0dXJl',
].join('.');
const session = {
  access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r',
  user: { id: COORD, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com',
          app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1.5 });
await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
  ['sb-127-auth-token', JSON.stringify(session)]);

const errs = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));

let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

const body = await page.innerText('body');
check('the danger zone is shown to an admin coordinator', body.includes('Danger zone'), body.slice(0, 300));
check('it names what gets deleted', /every event, venue, organizer/i.test(body));
check('it reassures the account itself is unaffected', /account and sign-in are not/i.test(body));

await page.getByRole('button', { name: 'Delete my calendar' }).click();
await page.waitForTimeout(300);
let dialogText = await page.innerText('[role="dialog"]');
check('the dialog names the actual calendar address', dialogText.includes('riverside.lovable.app'), dialogText.slice(0, 200));

const confirmBtn = page.getByRole('button', { name: 'Delete calendar' });
check('Confirm starts disabled with nothing typed', await confirmBtn.isDisabled());

const confirmInput = page.locator('#delete-confirm');
await confirmInput.fill('wrong-slug');
check('Confirm stays disabled for the wrong text', await confirmBtn.isDisabled());

await confirmInput.fill('riverside');
check('Confirm unlocks once the exact slug is typed', !(await confirmBtn.isDisabled()));

await confirmBtn.click();
await page.waitForLoadState('networkidle');
await page.waitForTimeout(500);
check('deleting redirects to the dashboard', page.url().endsWith('/dashboard'), page.url());

check('no uncaught errors', errs.length === 0, errs.slice(0, 2).join('; '));

await browser.close();
console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
