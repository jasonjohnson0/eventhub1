/**
 * Admin force publish/unpublish (P1 backlog item 6): adminRemoveEvent
 * already had a confirm dialog and an audit-logged reason -- verified
 * against the real code before assuming a gap existed. The actual gap was
 * the other direction: there was no way to force-publish a removed event
 * back, at all. Adds adminRestoreEvent (same confirm-dialog-plus-audit
 * shape as remove) and checks both directions here, end to end through
 * the real UI and the real admin_audit_log table.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
const COORD = '11111111-1111-1111-1111-111111111111'; // riverside, admin by default in this mock
const TITLE = 'Founders Day Picnic'; // dedicated fixture (real UUID id, unshared by any other suite)
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 1.5 });
await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} },
  ['sb-127-auth-token', JSON.stringify(session)]);
const errs = [];
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));

await page.goto(`${BASE}/admin/moderation`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
check('the moderation page rendered for an admin', !page.url().includes('/auth'), page.url());

// The "All" tab issues no status filter at all (same as a public listing
// query's implicit "approved only"), so this stays on the Approved/Removed
// tabs throughout -- each of those does send an explicit status filter,
// which is what actually distinguishes an admin's request from a public one.
await page.getByRole('button', { name: /^approved$/i }).click();
await page.waitForTimeout(400);
let body = await page.innerText('body');
check('the approved fixture event is listed', body.includes(TITLE), body.slice(0, 300));

// ---- remove: confirm dialog + reason required + audit-logged --------------
const row = page.locator('tr', { hasText: TITLE });
await row.getByRole('button', { name: 'Remove' }).click();
await page.waitForTimeout(300);
let dialogText = await page.innerText('[role="dialog"]');
check('the remove dialog names the event', dialogText.includes(TITLE), dialogText.slice(0, 200));

let removeBtn = page.getByRole('button', { name: 'Remove event' });
check('remove is locked until a reason is given', await removeBtn.isDisabled());
await page.fill('#reason', 'Duplicate listing, same event as another one');
check('...and unlocks once one is', !(await removeBtn.isDisabled()));
await removeBtn.click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^removed$/i }).click();
await page.waitForTimeout(400);

body = await page.innerText('body');
const removedRow = page.locator('tr', { hasText: TITLE });
check('a removed event shows up under the Removed tab with Restore, not Remove',
  (await removedRow.getByRole('button', { name: 'Restore' }).count()) > 0, body.slice(0, 300));

let auditBody = await (await page.goto(`${BASE}/admin/audit`, { waitUntil: 'networkidle' }), page.innerText('body'));
check('the removal is in the audit log', auditBody.includes('remove_event') && auditBody.includes('Duplicate listing'),
  auditBody.slice(0, 400));

// ---- restore: same shape, the other direction -----------------------------
await page.goto(`${BASE}/admin/moderation`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^removed$/i }).click();
await page.waitForTimeout(400);
const removedRowAgain = page.locator('tr', { hasText: TITLE });
await removedRowAgain.getByRole('button', { name: 'Restore' }).click();
await page.waitForTimeout(300);
dialogText = await page.innerText('[role="dialog"]');
check('the restore dialog explains what will happen',
  dialogText.includes('force-published') || dialogText.includes(TITLE), dialogText.slice(0, 200));

const restoreBtn = page.getByRole('button', { name: 'Restore event' });
check('restore is also locked until a reason is given', await restoreBtn.isDisabled());
await page.fill('#restore-reason', 'Confirmed it is a distinct event after all');
check('...and unlocks once one is', !(await restoreBtn.isDisabled()));
await restoreBtn.click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^approved$/i }).click();
await page.waitForTimeout(400);

body = await page.innerText('body');
const approvedRowAgain = page.locator('tr', { hasText: TITLE });
check('the restored event shows Remove again, not Restore, under the Approved tab',
  (await approvedRowAgain.getByRole('button', { name: 'Remove' }).count()) > 0, body.slice(0, 300));

auditBody = await (await page.goto(`${BASE}/admin/audit`, { waitUntil: 'networkidle' }), page.innerText('body'));
check('the restore is also in the audit log',
  auditBody.includes('restore_event') && auditBody.includes('distinct event after all'), auditBody.slice(0, 400));

check('no uncaught page errors', errs.length === 0, errs.slice(0, 3).join('; '));

await browser.close();

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED'}`);
process.exit(failures ? 1 : 0);
