/**
 * Re-confirming promote-to-coordinator still behaves (P1 backlog item 7,
 * originally fixed once as M1 -- see TEAMWORK.md). Checked the real code
 * first: the confirm dialog, the "already a coordinator" guard, and the
 * audit log write (action: "promote_user") were all already there and
 * correct -- nothing was actually broken. What was missing was a permanent
 * regression test, so this is that: a real click-through of the admin
 * Users page, not just a read of the source.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
const COORD = '11111111-1111-1111-1111-111111111111'; // admin, seeded in USER_ROLES
const TARGET_EMAIL = 'other@example.com'; // OTHER -- starts with no coordinator role
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const jwt = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: COORD, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com',
        iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
  'c2lnbmF0dXJl',
].join('.');
const session = {
  access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r',
  user: { id: COORD, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com',
          app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1.5 });
await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} },
  ['sb-127-auth-token', JSON.stringify(session)]);
const errs = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
check('the users page rendered for an admin', !page.url().includes('/auth'), page.url());

let body = await page.innerText('body');
check('the target user is listed', body.includes(TARGET_EMAIL), body.slice(0, 300));

const row = page.locator('tr', { hasText: TARGET_EMAIL });
await row.getByRole('button', { name: 'Promote to coordinator' }).click();
await page.waitForTimeout(300);

const dialogText = await page.innerText('[role="dialog"]');
check('the confirm dialog names the target user', dialogText.includes(TARGET_EMAIL), dialogText.slice(0, 200));
check('it explains what promotion actually grants',
  /coordinator workspace|publish events|sell sponsorships/i.test(dialogText), dialogText.slice(0, 300));
check('cancel is offered as well as confirm', (await page.getByRole('button', { name: 'Cancel' }).count()) > 0);

// Cancel path: nothing should happen.
await page.getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(300);
check('cancelling closes the dialog without acting', (await page.locator('[role="dialog"]').count()) === 0);
body = await page.innerText('body');
check('the user is still not a coordinator after cancelling', !/Coordinator/.test(
  (await row.innerText())), await row.innerText());

// Confirm path: the actual promotion.
await row.getByRole('button', { name: 'Promote to coordinator' }).click();
await page.waitForTimeout(300);
const confirmBtn = page.getByRole('button', { name: 'Confirm promotion' });
await confirmBtn.click();
await page.waitForTimeout(600);

body = await page.innerText('body');
check('a success confirmation shows', body.includes(`${TARGET_EMAIL} promoted to coordinator`), body.slice(0, 300));
const rowAfter = page.locator('tr', { hasText: TARGET_EMAIL });
check('the user now shows a Coordinator badge', /Coordinator/i.test(await rowAfter.innerText()), await rowAfter.innerText());

// Re-opening for an already-promoted user should short-circuit, not
// re-open the confirm dialog -- openPromote()'s own guard.
await rowAfter.getByRole('button', { name: 'Promote to coordinator' }).click();
await page.waitForTimeout(300);
check('promoting an already-promoted user is refused rather than re-confirmed',
  (await page.locator('[role="dialog"]').count()) === 0);

check('no uncaught page errors', errs.length === 0, errs.slice(0, 3).join('; '));

await browser.close();
console.log(`\n${failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED'}`);
process.exit(failures ? 1 : 0);
