/**
 * The public event page: three real bugs shipped here in one session, and
 * none of them had a test. This is that test.
 *
 * 1. "N going" used a direct count against event_rsvps, which that table's own
 *    RLS only lets a caller read for their own row -- so it silently read as
 *    zero for nearly every visitor. Fixed with a SECURITY DEFINER RPC; this
 *    checks the page actually renders that RPC's number, not a fallback zero.
 * 2. The RSVP button sent a signed-in visitor to the coordinator's management
 *    page instead of RSVPing them.
 * 3. "Become a sponsor" did the same thing for anyone who was not the event's
 *    owner.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

// ---- anonymous visitor: the going count must be real, not a fallback zero -----
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 1.5 });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/e1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const body = await page.innerText('body');

  check('the page rendered the event', body.includes('Harvest Festival'), body.slice(0, 200));
  check('the going count is the mocked RPC value, not zero',
    body.includes('42 going'), body.match(/\d+ going/)?.[0] ?? '(no "N going" text found)');
  check('anon sees "Sign in to RSVP", not a live RSVP control',
    body.includes('Sign in to RSVP'), body.slice(0, 400));

  // ---- "Become a sponsor" for an anonymous visitor must not misroute --------
  const sponsorBtn = page.locator('button:has-text("Become a sponsor")').first();
  check('a sponsor slot with its own CTA is present', (await sponsorBtn.count()) > 0);
  if (await sponsorBtn.count()) {
    await sponsorBtn.click();
    await page.waitForTimeout(600);
    check('clicking it does not navigate to the management page',
      !page.url().includes('/manage'), page.url());
    const dialogText = await page.locator('[role=dialog]').innerText().catch(() => '');
    check('it opens a dialog that actually talks about sponsoring',
      /sponsor/i.test(dialogText), dialogText.slice(0, 200));
  }

  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- signed-in, non-owner visitor: RSVP must RSVP, sponsor must not misroute -
{
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const UID = '22222222-2222-2222-2222-222222222222'; // not the event's coordinator
  const now = Math.floor(Date.now() / 1000);
  const jwt = [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ sub: UID, aud: 'authenticated', role: 'authenticated',
          email: 'attendee@example.com', iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
    'c2lnbmF0dXJl',
  ].join('.');
  const session = {
    access_token: jwt, token_type: 'bearer', expires_in: 3600,
    expires_at: now + 3600, refresh_token: 'fake-refresh',
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'attendee@example.com',
            app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript(([k, v]) => {
    try { window.localStorage.setItem(k, v); } catch {}
  }, ['sb-127-auth-token', JSON.stringify(session)]);
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/e1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const rsvpBtn = page.locator('button:has-text("RSVP now")').first();
  check('a signed-in visitor sees a real RSVP button', (await rsvpBtn.count()) > 0);
  if (await rsvpBtn.count()) {
    await rsvpBtn.click();
    await page.waitForTimeout(1500);
    check('clicking RSVP does not navigate to the management page',
      !page.url().includes('/manage'), page.url());
  }

  const sponsorBtn = page.locator('button:has-text("Become a sponsor")').first();
  if (await sponsorBtn.count()) {
    await sponsorBtn.click();
    await page.waitForTimeout(600);
    check('a signed-in non-owner clicking "Become a sponsor" is not sent to /manage',
      !page.url().includes('/manage'), page.url());
  }

  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
