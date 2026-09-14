/**
 * Spec 04: an unlisted event is omitted from every listing surface but still
 * opens by direct link, and the coordinator's manage page can toggle
 * visibility with the right confirm-dialog behavior. The `bbbbbbbb-…`
 * fixture ("Backyard BBQ") in tests/support/mock-supabase.mjs is unlisted
 * specifically for this.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const UNLISTED_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const COORD = '11111111-1111-1111-1111-111111111111';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

// ---- omitted from the public coordinator page -------------------------------
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/c/riverside`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const body = await page.innerText('body');
  check('the unlisted event does not appear on the public coordinator page',
    !body.includes('Backyard BBQ'), body.slice(0, 200));
  check('a public sibling event still does', body.includes('Harvest Festival'));
  await ctx.close();
}

// ---- omitted from the embed, in both month and list view --------------------
{
  const monthRes = await fetch(`${BASE}/api/embed/riverside?view=month`);
  const monthHtml = await monthRes.text();
  check('the unlisted event is not in the embed month view',
    !monthHtml.includes('Backyard BBQ'), 'found it');

  const listRes = await fetch(`${BASE}/api/embed/riverside?view=list`);
  const listHtml = await listRes.text();
  check('the unlisted event is not in the embed list view',
    !listHtml.includes('Backyard BBQ'), 'found it');
}

// ---- still opens by direct link, with a quiet "Unlisted event" chip ---------
{
  const ctx = await browser.newContext();
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/${UNLISTED_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const body = await page.innerText('body');
  check('the unlisted event still opens by direct link', body.includes('Backyard BBQ'), body.slice(0, 200));
  check('a quiet "Unlisted event" chip is shown', body.includes('Unlisted event'), body.slice(0, 300));
  check('RSVP is still offered, not gated', /RSVP/i.test(body), body.slice(0, 300));
  check('no uncaught errors', errs.length === 0, errs.slice(0, 2).join('; '));
  await ctx.close();
}

// ---- the manage page: badge, toggle, and the RSVP-aware confirm dialog ------
{
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const jwt = [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ sub: COORD, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com',
          iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
    'c2lnbmF0dXJl',
  ].join('.');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
    ['sb-127-auth-token', JSON.stringify({
      access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
      refresh_token: 'r',
      user: { id: COORD, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com',
              app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    })]);
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/${UNLISTED_ID}/manage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const body = await page.innerText('body');
  check('the manage page shows the Unlisted badge', body.includes('Unlisted'), body.slice(0, 300));

  const makePublicBtn = page.locator('button:has-text("Make public")').first();
  check('a "Make public" action is offered for an unlisted event', (await makePublicBtn.count()) > 0);
  if (await makePublicBtn.count()) {
    await makePublicBtn.click();
    await page.waitForTimeout(500);
    // This fixture has 0 RSVPs, so spec 04 says: no confirm dialog, just a
    // same-click flip -- the dialog should not appear.
    const dialogVisible = await page.locator('[role=dialog]:has-text("Make this event public")').count();
    check('going public with zero RSVPs skips the confirm dialog (spec 04)', dialogVisible === 0);
    await page.waitForTimeout(800);
    const afterBody = await page.innerText('body');
    check('the badge is gone after making it public', !afterBody.includes('Unlisted'), afterBody.slice(0, 300));

    // Flip it back to unlisted -- this direction always confirms.
    const makeUnlistedBtn = page.locator('button:has-text("Make unlisted")').first();
    check('the button now offers "Make unlisted"', (await makeUnlistedBtn.count()) > 0);
    if (await makeUnlistedBtn.count()) {
      await makeUnlistedBtn.click();
      await page.waitForTimeout(500);
      const confirmDialog = page.locator('[role=dialog]:has-text("Make this event unlisted")');
      check('making unlisted always shows a confirm dialog', (await confirmDialog.count()) > 0);
      if (await confirmDialog.count()) {
        await confirmDialog.getByRole('button', { name: 'Make unlisted' }).click();
        await page.waitForTimeout(800);
        const finalBody = await page.innerText('body');
        check('the badge is back after confirming', finalBody.includes('Unlisted'), finalBody.slice(0, 300));
      }
    }
  }

  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
