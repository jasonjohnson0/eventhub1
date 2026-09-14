/**
 * Spec 07 (unified email logs): the Email log section on the event manage
 * page and the workspace-wide one on settings both show invitations,
 * announcements, updates and reminders together, filterable by type and
 * status, and scoped to the signed-in coordinator only.
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
const now = Math.floor(Date.now() / 1000);
const COORD = '11111111-1111-1111-1111-111111111111';
const HARVEST_UUID = 'aaaaaaaa-1111-4111-8111-111111111111';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

async function signedInAs(uid, email) {
  const jwt = [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ sub: uid, aud: 'authenticated', role: 'authenticated', email, iat: now, exp: now + 3600,
          iss: `${MOCK}/auth/v1` }),
    'c2lnbmF0dXJl',
  ].join('.');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
    ['sb-127-auth-token', JSON.stringify({
      access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
      refresh_token: 'r',
      user: { id: uid, aud: 'authenticated', role: 'authenticated', email,
              app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    })]);
  return ctx;
}

// ---- event manage page: scoped to this one event ---------------------------
{
  const ctx = await signedInAs(COORD, 'coordinator@example.com');
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/${HARVEST_UUID}/manage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const body = await page.innerText('body');
  check('Email log heading present', body.includes('Email log'), body.slice(0, 200));
  check('an invitation row shows (sent)', body.includes('guest1@example.com'));
  check('an announcement row shows (failed) with its error text', body.includes('attendee@example.com') && body.includes('SendGrid 401'));
  check('a reminder row shows (simulated)', body.includes('attendee2@example.com'));
  check('a skipped row with no email shows a placeholder, not blank', body.includes('(no email on file)'));
  check("a different event's row does not show here", !body.includes('farmer@example.com'), body.slice(0, 400));
  check("another coordinator's row never shows here", !body.includes('not-riversides@example.com'));

  // ---- filter by type -------------------------------------------------------
  const typeSelect = page.locator('button[role="combobox"]').first();
  await typeSelect.click();
  await page.locator('[role="option"]:has-text("Reminder")').click();
  await page.waitForTimeout(600);
  const afterTypeFilter = await page.innerText('body');
  check('type=Reminder keeps the reminder rows', afterTypeFilter.includes('attendee2@example.com'));
  check('type=Reminder drops the invitation row', !afterTypeFilter.includes('guest1@example.com'), afterTypeFilter.slice(0, 400));
  check('type=Reminder drops the announcement row', !afterTypeFilter.includes('attendee@example.com'));

  // reset to All types before testing status filter independently
  await typeSelect.click();
  await page.locator('[role="option"]:has-text("All types")').click();
  await page.waitForTimeout(400);

  // ---- filter by status ------------------------------------------------------
  const statusSelect = page.locator('button[role="combobox"]').nth(1);
  await statusSelect.click();
  await page.locator('[role="option"]:has-text("Failed")').click();
  await page.waitForTimeout(600);
  const afterStatusFilter = await page.innerText('body');
  check('status=Failed keeps the failed announcement', afterStatusFilter.includes('attendee@example.com'));
  check('status=Failed drops the sent invitation', !afterStatusFilter.includes('guest1@example.com'), afterStatusFilter.slice(0, 400));

  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- settings page: workspace-wide, across multiple events -----------------
{
  const ctx = await signedInAs(COORD, 'coordinator@example.com');
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const body = await page.innerText('body');
  check('Email log heading present on settings', body.includes('Email log'), body.slice(0, 200));
  check('a row from the Harvest Festival event shows', body.includes('guest1@example.com'));
  check("a row from a *different* event (Farmers Market) also shows -- workspace-wide, not event-scoped",
    body.includes('farmer@example.com'), body.slice(0, 600));
  check("another coordinator's row never shows here either", !body.includes('not-riversides@example.com'));

  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

await browser.close();
console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
