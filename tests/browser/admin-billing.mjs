/**
 * The admin billing page: that an operator can see who owes what, tell the
 * states apart, and price a coordinator who has no price yet.
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
const UID = '11111111-1111-1111-1111-111111111111';
const now = Math.floor(Date.now() / 1000);
const jwt = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com',
        iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
  'c2lnbmF0dXJl',
].join('.');

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1500 }, deviceScaleFactor: 2 });
await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} },
  ['sb-127-auth-token', JSON.stringify({
    access_token: jwt, token_type: 'bearer', expires_in: 3600,
    expires_at: now + 3600, refresh_token: 'r',
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'admin@example.com',
            app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  })]);

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`${BASE}/admin/billing`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const body = await page.innerText('body');
check('the page rendered for an admin', !page.url().includes('/auth'), page.url());

// ---- the numbers an operator acts on ----------------------------------------
check('billable this month is totalled', body.includes('$49.00'), body.slice(0, 500));
check('unpriced coordinators are counted', /No price set/i.test(body));
check('unpaid invoices are surfaced', /unpaid/i.test(body), 'no unpaid figure');

// ---- states are distinguishable ---------------------------------------------
for (const s of ['Fee due', 'Free — sponsored', 'No price set']) {
  check(`state "${s}" is shown`, body.includes(s), body.slice(0, 700));
}

// ---- a coordinator with no price can be priced ------------------------------
const rows = await page.$$('div.rounded-lg.border.p-3');
check('one row per coordinator', rows.length === 3, `${rows.length} rows`);

const feeInputs = await page.$$('input[aria-label="Monthly fee"]');
check('every coordinator has an editable fee', feeInputs.length === 3, `${feeInputs.length} inputs`);
const values = await Promise.all(feeInputs.map((i) => i.inputValue()));
check('fees show in dollars, not cents', values.includes('49') && values.includes('0'),
  JSON.stringify(values));

// Save is inert until something actually changes.
const saveButtons = await page.$$('button:has-text("Save")');
check('Save is disabled until an edit is made',
  (await Promise.all(saveButtons.map((b) => b.isDisabled()))).every(Boolean));

await feeInputs[2].fill('29');
await page.waitForTimeout(200);
check('Save enables once a price is typed', !(await saveButtons[2].isDisabled()));

await feeInputs[2].fill('-5');
await page.waitForTimeout(200);
check('a negative fee cannot be saved', await saveButtons[2].isDisabled(), 'negative accepted');

// ---- the ledger -------------------------------------------------------------
check('the fee ledger lists what was invoiced',
  body.includes('2026-08') && /no sponsor running/i.test(body), 'ledger row missing');

// ---- closing a month is behind a confirmation -------------------------------
check('closing a month is offered', /Close the month/i.test(body));
await page.click('text=Close the month');
await page.waitForTimeout(300);
check('it asks before writing charges',
  /nobody can be billed twice/i.test(await page.innerText('body')), 'no confirmation step');

check('no uncaught errors', errs.length === 0, errs.slice(0, 2).join('; '));
await page.screenshot({ path: '/tmp/admin-billing.png', fullPage: false });
await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
