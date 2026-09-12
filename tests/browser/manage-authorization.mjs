/**
 * getEvent backs /events/$id/manage and /events/$id/checkin and had no
 * ownership check at all: any signed-in user could load either page for any
 * event by URL. RLS capped what the underlying tables gave a stranger, so
 * nothing leaked, but a stranger could still reach a "manage this event"
 * screen for an event that was never theirs.
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
const COORD = '11111111-1111-1111-1111-111111111111'; // owns EVENT
const STRANGER = '99999999-9999-9999-9999-999999999999'; // "belongs to a different coordinator"
// getEvent (and the attendee functions /checkin loads alongside it) validate
// `id` as a real UUID, same as production -- the short 'e1'-style ids used by
// the rest of the fixtures don't pass that check.
const EVENT = 'aaaaaaaa-1111-4111-8111-111111111111';

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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
    ['sb-127-auth-token', JSON.stringify({
      access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
      refresh_token: 'r',
      user: { id: uid, aud: 'authenticated', role: 'authenticated', email,
              app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    })]);
  return ctx;
}

// ---- the owner: unchanged, must still work -----------------------------------
{
  const ctx = await signedInAs(COORD, 'coord@example.com');
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/${EVENT}/manage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('the owner can still open their own event\'s management page',
    page.url().includes(`/events/${EVENT}/manage`),
    page.url());
  const body = await page.innerText('body');
  check('and it actually renders the event, not an error state',
    body.includes('Harvest Festival'), body.slice(0, 200));
  check('no uncaught errors', errs.length === 0, errs.slice(0, 2).join('; '));
  await ctx.close();
}

// ---- a stranger: must be redirected, not shown the management screen --------
{
  const ctx = await signedInAs(STRANGER, 'stranger@example.com');
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/${EVENT}/manage`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('a stranger is redirected away from someone else\'s management page',
    !page.url().includes('/manage'), page.url());
  check('...landing on the public event page instead',
    page.url().includes(`/events/${EVENT}`), page.url());
  const body = await page.innerText('body');
  check('and sees the public page, not a raw error box',
    body.includes('Harvest Festival') && !body.includes('Not authorized'), body.slice(0, 200));
  check('no uncaught errors', errs.length === 0, errs.slice(0, 2).join('; '));
  await ctx.close();
}

// ---- the same gate on check-in -------------------------------------------------
{
  const ctx = await signedInAs(STRANGER, 'stranger@example.com');
  const page = await ctx.newPage();
  await page.goto(`${BASE}/events/${EVENT}/checkin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('a stranger is redirected away from someone else\'s check-in page too',
    !page.url().includes('/checkin'), page.url());
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
