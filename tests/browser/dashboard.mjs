/** Renders the dashboard as a signed-in coordinator and checks the two new
 *  cards say the right things -- and, for the billing one, that it never
 *  overstates the situation. */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });
const errs = [];

// getClaims decodes the token before delegating verification to /auth/v1/user,
// so it has to be a structurally real JWT: three base64url parts with a JSON
// payload carrying a sub. "fake.jwt.token" has three parts and fails to decode,
// which surfaces as a server function that errors and retries rather than one
// that fails cleanly.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '11111111-1111-1111-1111-111111111111';
const now = Math.floor(Date.now() / 1000);
const jwt = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated',
        email: 'coord@example.com', iat: now, exp: now + 3600,
        iss: 'http://127.0.0.1:51993/auth/v1' }),
  'c2lnbmF0dXJl',
].join('.');

// supabase-js derives its storage key from the URL host's first label.
const session = {
  access_token: jwt, token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'fake-refresh',
  user: { id: UID, aud: 'authenticated',
          role: 'authenticated', email: 'coord@example.com',
          app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};
await ctx.addInitScript(([k, v]) => {
  try { window.localStorage.setItem(k, v); } catch {}
}, ['sb-127-auth-token', JSON.stringify(session)]);

const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const body = await page.innerText('body');
check('the dashboard rendered, not the sign-in page', !page.url().includes('/auth'), page.url());

// ---- billing card -------------------------------------------------------------
check('the fee state is stated plainly', body.includes('A monthly fee applies'), body.slice(0, 400));
check('the amount is shown as money, not cents',
  body.includes('$49.00') && !body.includes('4900'), body.slice(0, 400));
check('the reason is given', body.includes('No sponsor is currently running'));
check('the way out is given',
  /Sell a single sponsorship/i.test(body), 'no remedy offered');
check('it says nothing is charged yet',
  /Nothing is charged until/i.test(body), 'no reassurance about timing');
check('it does not threaten the calendar',
  !/suspend|disabled|shut off|terminated|blocked/i.test(body), 'threatening language');

// ---- sponsor performance ------------------------------------------------------
check('totals are formatted with separators', body.includes('1,204'), body.slice(0, 800));
check('the embed share is broken out', /Views on embeds/i.test(body) && body.includes('1,622'),
  'embed total wrong or missing');
check('the advertiser name keeps its own casing',
  body.includes("O'Brien & Sons Hardware"), 'name was mangled');
check('a click rate is computed', body.includes('7.3%'), 'expected 88/1204 = 7.3%');
check('a row with no unique viewers shows a dash rather than a divide-by-zero',
  body.includes('—') || body.includes('&mdash;'), 'no dash for the empty row');
check('the counting method is explained to the coordinator',
  /crawlers and link previews are excluded/i.test(body), 'no methodology note');

check('no uncaught errors', errs.length === 0, errs.slice(0, 2).join('; '));
await page.screenshot({ path: 'dashboard.png', fullPage: false });

// ---- the same dashboard, for accounts that are not a completed coordinator ---
//
// Every signed-in account used to land on this exact console -- billing nags,
// "Create an event", Venues, Submissions -- whether or not they had ever
// touched a calendar. There is no account-type flag anywhere in this app's
// signup flow, so "is this a coordinator" is derived instead: a
// coordinator_profiles row with setup_completed_at set (or accepted workspace
// staff) is complete; a row with no completed_at is pending; no row at all is
// "none". This also exercises the mock's own identity handling: /auth/v1/user
// used to return one fixed user no matter whose token was presented, which
// would have made every one of these checks silently test the same account.
async function asUser(uid, email) {
  const jwt2 = [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ sub: uid, aud: 'authenticated', role: 'authenticated', email, iat: now, exp: now + 3600,
          iss: 'http://127.0.0.1:51993/auth/v1' }),
    'c2lnbmF0dXJl',
  ].join('.');
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1.5 });
  await ctx2.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
    ['sb-127-auth-token', JSON.stringify({
      access_token: jwt2, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
      refresh_token: 'r',
      user: { id: uid, aud: 'authenticated', role: 'authenticated', email,
              app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    })]);
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1200);
  const t = await p2.innerText('body');
  return { ctx: ctx2, page: p2, body: t };
}

// pending: a coordinator_profiles row exists, setup_completed_at is null.
{
  const { ctx: c2, body } = await asUser('cccccccc-1111-4111-8111-111111111111', 'noslug@example.com');
  check('a pending coordinator is greeted by name, correctly identified',
    body.includes('Welcome back, noslug'), body.slice(0, 60));
  check('billing card is not shown before setup is finished',
    !body.includes('A monthly fee applies') && !body.includes('this calendar is free'), body.slice(0, 400));
  check('sponsor performance is not shown before setup is finished',
    !body.includes('Sponsor performance'), body.slice(0, 400));
  check('a clear way to finish setup is offered',
    /Finish setting up your calendar/i.test(body) && /Continue setup/i.test(body), body.slice(0, 500));
  check('the Coordinator nav group still shows -- config tools are usable pre-launch',
    body.includes('Submissions') && body.includes('Venues'), body.slice(0, 900));
  await c2.close();
}

// none: no coordinator_profiles row, not staff anywhere.
{
  const { ctx: c2, body } = await asUser('99999999-0000-4000-8000-000000000001', 'plainuser@example.com');
  check('a plain visitor is greeted by name, correctly identified',
    body.includes('Welcome back, plainuser'), body.slice(0, 60));
  check('billing card is not shown to a non-coordinator',
    !body.includes('A monthly fee applies') && !body.includes('this calendar is free'), body.slice(0, 400));
  check('sponsor performance is not shown to a non-coordinator',
    !body.includes('Sponsor performance'), body.slice(0, 400));
  check('browsing is offered as the primary action',
    /Browse events/i.test(body), body.slice(0, 400));
  check('becoming a coordinator is discoverable, not assumed',
    /Run your own calendar|Set up a calendar/i.test(body), body.slice(0, 500));
  check('the Coordinator-only nav group is hidden for a plain visitor',
    !body.includes('Submissions') && !body.includes('Venues') && !body.includes('Organizers')
      && !body.includes('Custom fields'), body.slice(0, 900));
  await c2.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
