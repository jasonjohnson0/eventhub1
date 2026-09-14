/**
 * The admin "Change address" flow on /settings: live availability checking
 * as you type (reusing the same is_slug_available RPC the onboarding wizard
 * uses), and Confirm stays locked until it resolves to an available address.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
const COORD = '11111111-1111-1111-1111-111111111111'; // the mock's riverside fixture, an admin by default

// This actually mutates the shared riverside fixture inside the one
// mock-supabase process the whole browser suite runs against -- unlike
// SUBMISSIONS/AD_LOG, coordinator_profiles has no reset endpoint, so a real
// change here would otherwise leak into every test file that runs after
// this one in the same suite (coordinator-page.mjs, url-hygiene.mjs,
// submit-event.mjs, the WordPress plugin suite -- all of them assume
// riverside still resolves). Restore it however this script exits.
async function restoreSlug() {
  await fetch(`${MOCK}/rest/v1/coordinator_profiles?coordinator_id=eq.${COORD}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug: 'riverside' }),
  }).catch(() => {});
}

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

try {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const body = await page.innerText('body');
  check('the current address is shown', body.includes('riverside.lovable.app'), body.slice(0, 300));

  await page.getByRole('button', { name: 'Change address' }).click();
  await page.waitForTimeout(300);
  const input = page.locator('#new-slug');

  // Retyping the calendar's own current address is refused, not treated as "available".
  await input.fill('riverside');
  await page.waitForTimeout(200);
  let dialogText = await page.innerText('[role="dialog"]');
  check('your own unchanged address is refused, not offered as a no-op change',
    dialogText.includes('already your current address'), dialogText.slice(0, 300));

  // An address already claimed by a different coordinator.
  await input.fill('obrien');
  await page.waitForTimeout(700);
  dialogText = await page.innerText('[role="dialog"]');
  check('a slug held by someone else reads as taken', dialogText.includes('Already taken'), dialogText.slice(0, 300));
  let confirmBtn = page.getByRole('button', { name: 'Change address' }).last();
  check('Confirm stays locked while taken', await confirmBtn.isDisabled());

  // A genuinely free address.
  await input.fill('brand-new-address');
  await page.waitForTimeout(700);
  dialogText = await page.innerText('[role="dialog"]');
  check('a free address is confirmed available', dialogText.includes('is available'), dialogText.slice(0, 300));
  confirmBtn = page.getByRole('button', { name: 'Change address' }).last();
  check('Confirm unlocks once it resolves available', !(await confirmBtn.isDisabled()));

  await confirmBtn.click();
  await page.waitForTimeout(600);
  const after = await page.innerText('body');
  check('the settings page now shows the new address', after.includes('brand-new-address.lovable.app'), after.slice(0, 300));
  check('the old address is no longer shown', !after.includes('riverside.lovable.app'), after.slice(0, 300));

  check('no uncaught errors', errs.length === 0, errs.slice(0, 2).join('; '));
} finally {
  await restoreSlug();
  await browser.close();
}

console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
