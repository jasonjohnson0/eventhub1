/**
 * Gap-closure phase 3: private events end to end, through the real UI.
 *
 * The mock (tests/support/mock-supabase.mjs) emulates the two RLS rules that
 * matter here -- a private event row is visible only to its coordinator,
 * admins and ACCEPTED guests; event_invites rows only to the coordinator or
 * the guest themself -- with the service role bypassing both, exactly like
 * the real policies (proven against real Postgres in
 * tests/db/private-events-access.py).
 *
 *   anonymous              -> gated page that doesn't even confirm the event exists
 *   stranger (signed in)   -> "private" page -> request access -> coordinator approves -> sees it
 *   invitee (pending)      -> "you've been invited" -> accept link -> sees it
 *   wrong account + link   -> refused, told which address it was sent to (masked)
 *   revoked                -> loses access immediately
 *   coordinator            -> Private badge, guest list, invite by email
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + String(e).slice(0, 300)}`);
  if (!c) failures++;
};

const COORD = '11111111-1111-1111-1111-111111111111';
const STRANGER = '99999999-9999-9999-9999-999999999999';
const INVITEE = '77777777-7777-4777-8777-777777777777';
const EVENT = 'cccccccc-1111-4111-8111-111111111111';
const TITLE = 'Board Retreat (Private)';
const TOKEN = 'known-test-token-for-invitee-0123456789abcdef';
const OTHER_TOKEN = 'known-test-token-for-someone-else-0123456789';
const REVOKED_TOKEN = 'known-test-token-that-was-revoked-0123456789';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
async function contextFor(uid, email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  if (uid) {
    const jwt = [b64({ alg: 'HS256', typ: 'JWT' }),
      b64({ sub: uid, aud: 'authenticated', role: 'authenticated', email, iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
      'c2lnbmF0dXJl'].join('.');
    await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
      ['sb-127-auth-token', JSON.stringify({ access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r',
        user: { id: uid, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } })]);
  }
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  return { ctx, page, errs };
}
// Opt-in visual record: SHOTS_DIR=/some/dir tests/run.sh browser private-event
const shot = async (page, name) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/private-${name}.png`, fullPage: true });
};
const settle = (page, ms = 1200) => page.waitForLoadState('networkidle').then(() => page.waitForTimeout(ms));
const gateState = (page) => page.getAttribute('[data-private-gate]', 'data-private-gate', { timeout: 4000 }).catch(() => null);
const post = (path, body) => fetch(`${MOCK}${path}`, { method: 'POST', body: JSON.stringify(body ?? {}) });
const invites = async () => (await fetch(`${MOCK}/__private/invites`)).json();

await fetch(`${MOCK}/__private/reset`);
await fetch(`${MOCK}/__private/setup`);
await post('/__private/invite', { email: 'invitee@example.com', token: TOKEN, status: 'pending' });
await post('/__private/invite', { email: 'someone.else@example.com', token: OTHER_TOKEN, status: 'pending' });
await post('/__private/invite', { email: 'gone@example.com', token: REVOKED_TOKEN, status: 'revoked' });

// ---- anonymous -----------------------------------------------------------------
{
  const { ctx, page, errs } = await contextFor(null);
  await page.goto(`${BASE}/events/${EVENT}`);
  await settle(page);
  await shot(page, 'anon-gate');
  check('anon: the gated page is shown', (await gateState(page)) === 'signed_out', await gateState(page));
  const body = await page.innerText('body');
  check('anon: no title, description or location reaches the page', !body.includes('Board Retreat') && !body.includes('Lake House') && !body.includes('Strategy offsite'), body.slice(0, 300));
  check('anon: the page does not confirm the event exists (same copy as not-found)', /not found — or it's private/i.test(body), body.slice(0, 200));
  const html = await (await fetch(`${BASE}/events/${EVENT}`)).text();
  check('anon: server-rendered HTML carries no event details', !html.includes('Board Retreat') && !html.includes('Lake House'));
  for (const url of [`/c/riverside`, `/c/riverside?view=list`, `/events?view=list`, `/api/embed/riverside`]) {
    const t = await (await fetch(`${BASE}${url}`)).text();
    check(`anon: not listed on ${url}`, !t.includes('Board Retreat'));
  }
  check('anon: no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- stranger: request access ----------------------------------------------------
{
  const { ctx, page, errs } = await contextFor(STRANGER, 'other@example.com');
  await page.goto(`${BASE}/events/${EVENT}`);
  await settle(page);
  await shot(page, 'stranger-gate');
  check('stranger: told it is private and may request access', (await gateState(page)) === 'can_request', await gateState(page));
  check('stranger: still no event details', !(await page.innerText('body')).includes('Lake House'));
  await page.fill('textarea[aria-label^="Note to the organizer"]', 'I am on the planning committee.');
  await page.click('[data-request-access]');
  await page.waitForTimeout(800);
  check('stranger: request recorded, page says so', (await gateState(page)) === 'requested', await gateState(page));
  const rows = await invites();
  check('stranger: a "requested" row exists for their account', rows.some((r) => r.user_id === STRANGER && r.status === 'requested'), JSON.stringify(rows));
  await page.reload();
  await settle(page);
  check('stranger: still gated until approved (pending request grants nothing)', (await gateState(page)) === 'requested');
  check('stranger: no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- coordinator: guest list ---------------------------------------------------------
{
  const { ctx, page, errs } = await contextFor(COORD, 'coord@example.com');
  await page.goto(`${BASE}/events/${EVENT}/manage`);
  await settle(page, 1800);
  check('coordinator: Private badge on the manage page', (await page.locator('[data-private-badge]').count()) === 1);
  check('coordinator: guest list card is shown', (await page.locator('[data-guest-list]').count()) === 1);
  check('coordinator: the access request is flagged', (await page.locator('[data-access-requests="1"]').count()) === 1);
  const req = page.locator('[data-guest-status="requested"]');
  check('coordinator: the requester is listed with their note', (await req.count()) === 1 && (await req.innerText()).includes('planning committee'), await req.innerText().catch(() => ''));
  await req.locator('[data-guest-action="approve"]').click();
  await page.waitForTimeout(800);
  check('coordinator: approving moves them to Accepted', (await invites()).some((r) => r.user_id === STRANGER && r.status === 'accepted'));

  await page.fill('#guest-emails', 'New.Guest@Example.com, not-an-email, new.guest@example.com');
  await page.click('button:has-text("Send invites")');
  await page.waitForTimeout(1000);
  const rows = await invites();
  const created = rows.filter((r) => r.email === 'new.guest@example.com');
  check('coordinator: inviting creates one pending row, lowercased and de-duplicated', created.length === 1 && created[0].status === 'pending', JSON.stringify(created));
  check('coordinator: the invite stores only a SHA-256 token hash', /^[0-9a-f]{64}$/.test(created[0]?.token_hash ?? '') && !('token' in (created[0] ?? {})));
  await shot(page, 'guest-list');
  check('coordinator: the new guest shows as Invited', (await page.locator('[data-guest="new.guest@example.com"][data-guest-status="pending"]').count()) === 1);
  check('coordinator: no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- stranger after approval ---------------------------------------------------------
{
  const { ctx, page, errs } = await contextFor(STRANGER, 'other@example.com');
  await page.goto(`${BASE}/events/${EVENT}`);
  await settle(page);
  const body = await page.innerText('body');
  check('approved guest: now sees the event', body.includes(TITLE) && body.includes('Lake House'), body.slice(0, 300));
  check('approved guest: it is marked private', (await page.locator('[data-private-chip]').count()) === 1);
  check('approved guest: no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- invitee: accept via the emailed link ----------------------------------------------
{
  const { ctx, page, errs } = await contextFor(INVITEE, 'invitee@example.com');
  await page.goto(`${BASE}/events/${EVENT}`);
  await settle(page);
  check('invitee (pending): told they are invited, but not shown the event yet', (await gateState(page)) === 'invited_pending' && !(await page.innerText('body')).includes('Lake House'), await gateState(page));
  await page.goto(`${BASE}/private-invite/${TOKEN}`);
  await settle(page, 600);
  check('invite link: nothing is accepted just by opening it', (await invites()).some((r) => r.email === 'invitee@example.com' && r.status === 'pending'));
  await shot(page, 'invite-page');
  const meta = await page.getAttribute('meta[name="referrer"]', 'content').catch(() => null);
  check('invite link page sends no Referer (token stays private)', meta === 'no-referrer', meta);
  await page.click('[data-accept-invite]');
  await page.waitForURL(`**/events/${EVENT}`, { timeout: 8000 }).catch(() => {});
  await settle(page);
  const body = await page.innerText('body');
  check('invitee: accepting lands on the event, now visible', new URL(page.url()).pathname === `/events/${EVENT}` && body.includes(TITLE), page.url());
  const mine = (await invites()).find((r) => r.email === 'invitee@example.com');
  check('invitee: row is accepted and bound to their account', mine?.status === 'accepted' && mine?.user_id === INVITEE, JSON.stringify(mine));

  // Someone else's link, opened by this (wrong) account.
  await page.goto(`${BASE}/private-invite/${OTHER_TOKEN}`);
  await settle(page, 600);
  await page.click('[data-accept-invite]');
  await page.waitForTimeout(800);
  const err = await page.innerText('[data-invite-error]').catch(() => '');
  check('wrong account: refused', /different email address/i.test(err), err);
  check('wrong account: told the (masked) address it went to, not the full one', err.includes('@example.com') && !err.includes('someone.else@example.com'), err);
  check('wrong account: the other invite is untouched', (await invites()).some((r) => r.email === 'someone.else@example.com' && r.status === 'pending' && !r.user_id));

  await page.goto(`${BASE}/private-invite/${REVOKED_TOKEN}`);
  await settle(page, 600);
  await page.click('[data-accept-invite]');
  await page.waitForTimeout(800);
  check('revoked link: refused as withdrawn', /withdrawn/i.test(await page.innerText('[data-invite-error]').catch(() => '')));
  await page.goto(`${BASE}/private-invite/not-a-real-token-at-all-000000000000`);
  await settle(page, 600);
  await page.click('[data-accept-invite]');
  await page.waitForTimeout(800);
  check('bogus link: refused as invalid', /isn't valid/i.test(await page.innerText('[data-invite-error]').catch(() => '')));
  check('invitee: no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- the invite EMAIL works end to end ---------------------------------------------------
// Coordinator invites through the UI; the real server function generates the
// token, stores only its hash, and "sends" through the test outbox. The test
// then opens the link the email actually carried, as the invited person.
{
  const MAILBOX = '66666666-6666-4666-8666-666666666666';
  const ADDRESS = 'mailbox.guest@example.com';
  await fetch(`${MOCK}/__outbox/enable`);
  const coord = await contextFor(COORD, 'coord@example.com');
  await coord.page.goto(`${BASE}/events/${EVENT}/manage`);
  await settle(coord.page, 1800);
  await coord.page.fill('#guest-emails', ADDRESS);
  await coord.page.click('button:has-text("Send invites")');
  await coord.page.waitForTimeout(1200);
  await coord.ctx.close();

  const mail = ((await (await fetch(`${MOCK}/__outbox`)).json()) ?? []).filter((m) => m.to === ADDRESS);
  check('email: exactly one invitation was sent to the invitee', mail.length === 1, JSON.stringify(mail).slice(0, 300));
  const m = mail[0] ?? {};
  check('email: subject names the event', m.subject === `Private invitation: ${TITLE}`, m.subject);
  check('email: states the time in the event\'s zone', /UTC/.test(m.text ?? ''), m.text);
  const link = /https?:\/\/[^\s"]+\/private-invite\/([A-Za-z0-9_-]+)/.exec(`${m.text ?? ''} ${m.html ?? ''}`);
  check('email: carries an accept link', !!link, (m.text ?? '').slice(0, 300));
  const token = link?.[1] ?? '';
  const { createHash } = await import('node:crypto');
  const row = (await invites()).find((r) => r.email === ADDRESS);
  check('email: the link token hashes to the stored token_hash (and is not itself stored)',
    !!row && row.token_hash === createHash('sha256').update(token).digest('hex') && !JSON.stringify(row).includes(token));

  const { ctx, page, errs } = await contextFor(MAILBOX, ADDRESS);
  await page.goto(`${BASE}/private-invite/${token}`);
  await settle(page, 600);
  await page.click('[data-accept-invite]');
  await page.waitForURL(`**/events/${EVENT}**`, { timeout: 8000 }).catch(() => {});
  await settle(page);
  check('email: following the emailed link and accepting shows the event', (await page.innerText('body')).includes(TITLE), page.url());
  check('email: no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
  await fetch(`${MOCK}/__outbox/disable`);
}

// ---- revoke takes effect immediately ---------------------------------------------------
{
  const coord = await contextFor(COORD, 'coord@example.com');
  await coord.page.goto(`${BASE}/events/${EVENT}/manage`);
  await settle(coord.page, 1800);
  const row = coord.page.locator('[data-guest-status="accepted"]').filter({ hasText: 'other' }).first();
  const strangerRow = (await row.count()) ? row : coord.page.locator('[data-guest-status="accepted"]').first();
  await strangerRow.locator('[data-guest-action="revoke"]').click().catch(() => {});
  await coord.page.waitForTimeout(800);
  check('coordinator: revoke recorded', (await invites()).some((r) => r.user_id === STRANGER && r.status === 'revoked'), JSON.stringify(await invites()));
  await coord.ctx.close();

  const { ctx, page, errs } = await contextFor(STRANGER, 'other@example.com');
  await page.goto(`${BASE}/events/${EVENT}`);
  await settle(page);
  check('revoked guest: loses access at once, told the invitation is closed', (await gateState(page)) === 'closed' && !(await page.innerText('body')).includes('Lake House'), await gateState(page));
  check('revoked guest: no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

await fetch(`${MOCK}/__private/reset`);
await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
