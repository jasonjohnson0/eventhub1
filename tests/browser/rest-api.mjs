/**
 * Spec 09 (general REST API): the actual /api/v1 endpoints over real HTTP,
 * authenticated with a coordinator API key created through the settings UI
 * (same key a real Zapier/Make/curl integration would use) -- not just the
 * settings UI itself. Covers CRUD for events/venues/tickets, RSVP reads,
 * cross-coordinator isolation (404, not 403 -- don't leak existence),
 * revocation, and the 60/min rate limit.
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
const HARVEST_UUID = 'aaaaaaaa-1111-4111-8111-111111111111'; // owned by COORD
const OTHER_EVENT = 'x1'; // owned by OTHER, not COORD -- for the 404-not-403 check

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

const jwt = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: COORD, aud: 'authenticated', role: 'authenticated', email: 'coordinator@example.com',
        iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
  'c2lnbmF0dXJl',
].join('.');
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
  ['sb-127-auth-token', JSON.stringify({
    access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
    refresh_token: 'r',
    user: { id: COORD, aud: 'authenticated', role: 'authenticated', email: 'coordinator@example.com',
            app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  })]);
const page = await ctx.newPage();
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

await page.locator('input[placeholder*="Zapier"]').fill('rest-api test key');
await page.locator('button:has-text("Create key")').click();
await page.waitForTimeout(800);
const secretText = await page.locator('[data-testid="api-key-secret"]').innerText().catch(() => '');
check('a real-shaped secret was created through the settings UI', secretText.startsWith('eh_live_'), secretText);
const SECRET = secretText.trim();

const api = (path, init = {}) =>
  fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${SECRET}` },
  });

// ---- unauthenticated index -------------------------------------------------
{
  const res = await fetch(`${BASE}/api/v1`);
  check('GET /api/v1 needs no auth and 200s', res.status === 200, String(res.status));
  const body = await res.json();
  check('the index lists the documented resources', Array.isArray(body.resources) && body.resources.length > 0);
}

// ---- missing/invalid auth ---------------------------------------------------
{
  const res = await fetch(`${BASE}/api/v1/events`);
  check('GET /api/v1/events with no Authorization header is 401', res.status === 401, String(res.status));
  const res2 = await fetch(`${BASE}/api/v1/events`, { headers: { authorization: 'Bearer eh_live_totallymadeup' } });
  check('a well-formed but wrong key is 401, not a crash', res2.status === 401, String(res2.status));
}

// ---- events: list, create, read, patch ---------------------------------------
let createdEventId = null;
{
  const listRes = await api('/api/v1/events');
  check('GET /api/v1/events with a real key is 200', listRes.status === 200, String(listRes.status));
  const listBody = await listRes.json();
  check('the list includes this coordinator\'s existing fixture event (Harvest Festival)',
    listBody.data.some((e) => e.id === HARVEST_UUID), JSON.stringify(listBody).slice(0, 300));

  const createRes = await api('/api/v1/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'API-created Meetup',
      start_time: '2027-06-01T18:00:00.000Z',
      end_time: '2027-06-01T20:00:00.000Z',
      category: 'social',
    }),
  });
  check('POST /api/v1/events creates and returns 201', createRes.status === 201, String(createRes.status));
  const created = await createRes.json();
  createdEventId = created.data?.id;
  check('the created event has an id and echoes the title', !!createdEventId && created.data.title === 'API-created Meetup', JSON.stringify(created));

  const getRes = await api(`/api/v1/events/${createdEventId}`);
  const getBody = await getRes.json();
  check('GET /api/v1/events/:id returns the just-created event', getRes.status === 200 && getBody.data.id === createdEventId, JSON.stringify(getBody));

  const patchRes = await api(`/api/v1/events/${createdEventId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Renamed Meetup' }),
  });
  const patchBody = await patchRes.json();
  check('PATCH /api/v1/events/:id updates the title', patchRes.status === 200 && patchBody.data.title === 'Renamed Meetup', JSON.stringify(patchBody));

  const badPatchRes = await api(`/api/v1/events/${createdEventId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ start_time: 'not-a-date' }),
  });
  check('a validation error on PATCH is 422, not 500 or a silent 200',
    badPatchRes.status === 422, String(badPatchRes.status));
  const badPatchBody = await badPatchRes.json();
  check('the validation error has the documented {error:{code,message}} shape',
    badPatchBody.error?.code === 'validation_error', JSON.stringify(badPatchBody));
}

// ---- cross-coordinator isolation: 404, never 403 ----------------------------
{
  const res = await api(`/api/v1/events/${OTHER_EVENT}`);
  check("another coordinator's event id is 404, not 403 or a leaked row (spec's own edge case)",
    res.status === 404, String(res.status));
  const patchRes = await api(`/api/v1/events/${OTHER_EVENT}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'hijacked' }),
  });
  check('PATCHing another coordinator\'s event is also 404, not a silent success', patchRes.status === 404, String(patchRes.status));
}

// ---- venues + ticket tiers + rsvps -------------------------------------------
let createdVenueId = null;
{
  const createRes = await api('/api/v1/venues', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'API Test Hall', capacity: 100 }),
  });
  const created = await createRes.json();
  createdVenueId = created.data?.id;
  check('POST /api/v1/venues creates and returns 201', createRes.status === 201 && !!createdVenueId, JSON.stringify(created));

  const listRes = await api('/api/v1/venues');
  const listBody = await listRes.json();
  check('the new venue shows up in GET /api/v1/venues', listBody.data.some((v) => v.id === createdVenueId), JSON.stringify(listBody).slice(0, 300));

  const deleteRes = await api(`/api/v1/venues/${createdVenueId}`, { method: 'DELETE' });
  check('DELETE /api/v1/venues/:id succeeds', deleteRes.status === 200, String(deleteRes.status));
  const afterDelete = await api(`/api/v1/venues/${createdVenueId}`);
  check('...and the venue is actually gone afterward, not just soft-flagged', afterDelete.status === 404, String(afterDelete.status));
}

let createdTierId = null;
{
  const createRes = await api(`/api/v1/events/${createdEventId}/tickets`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'General', price_cents: 2500, quantity_available: 50 }),
  });
  const created = await createRes.json();
  createdTierId = created.data?.id;
  check('POST /api/v1/events/:id/tickets creates a tier', createRes.status === 201 && !!createdTierId, JSON.stringify(created));

  const listRes = await api(`/api/v1/events/${createdEventId}/tickets`);
  const listBody = await listRes.json();
  check('the tier shows up on GET', listBody.data.some((t) => t.id === createdTierId));

  const otherEventTiersRes = await api(`/api/v1/events/${OTHER_EVENT}/tickets`);
  check("listing tickets for another coordinator's event is 404, not an empty leak-free 200 either",
    otherEventTiersRes.status === 404, String(otherEventTiersRes.status));

  const deleteRes = await api(`/api/v1/events/${createdEventId}/tickets/${createdTierId}`, { method: 'DELETE' });
  check('DELETE the ticket tier succeeds', deleteRes.status === 200, String(deleteRes.status));
}

{
  const res = await api(`/api/v1/events/${createdEventId}/rsvps`);
  check('GET /api/v1/events/:id/rsvps is 200 (read-only, no public write in this resource)', res.status === 200, String(res.status));
  const body = await res.json();
  check('the response is a data array', Array.isArray(body.data));
}

// ---- /me ---------------------------------------------------------------------
{
  const res = await api('/api/v1/me');
  const body = await res.json();
  check('GET /api/v1/me returns this coordinator\'s own slug', res.status === 200 && body.slug === 'riverside', JSON.stringify(body));
}

// ---- revocation ---------------------------------------------------------------
{
  page.once('dialog', (d) => d.accept());
  const row = page
    .locator('div.flex.items-center.gap-3.p-3', { has: page.getByText('rest-api test key', { exact: true }) })
    .last();
  await row.locator('button').click();
  await page.waitForTimeout(600);
  const res = await api('/api/v1/events');
  check('a revoked key is 401 on its very next request', res.status === 401, String(res.status));
}

await browser.close();

// ---- rate limit (61st request in the window is 429) --------------------------
// Uses a *fresh* key so this block's own ~61 requests can't be starved by
// whatever the checks above already consumed against the first key.
{
  const jwt2 = [
    b64({ alg: 'HS256', typ: 'JWT' }),
    b64({ sub: COORD, aud: 'authenticated', role: 'authenticated', email: 'coordinator@example.com',
          iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
    'c2lnbmF0dXJl',
  ].join('.');
  const browser2 = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const ctx2 = await browser2.newContext();
  await ctx2.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
    ['sb-127-auth-token', JSON.stringify({
      access_token: jwt2, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
      refresh_token: 'r',
      user: { id: COORD, aud: 'authenticated', role: 'authenticated', email: 'coordinator@example.com',
              app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    })]);
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page2.waitForTimeout(800);
  await page2.locator('input[placeholder*="Zapier"]').fill('rate-limit test key');
  await page2.locator('button:has-text("Create key")').click();
  await page2.waitForTimeout(800);
  const secret2 = (await page2.locator('[data-testid="api-key-secret"]').innerText().catch(() => '')).trim();
  await browser2.close();

  let last = null;
  for (let i = 0; i < 61; i++) {
    last = await fetch(`${BASE}/api/v1/events`, { headers: { authorization: `Bearer ${secret2}` } });
  }
  check('the 61st request in the window is 429', last.status === 429, String(last.status));
  check('a 429 carries a Retry-After header', !!last.headers.get('retry-after'), last.headers.get('retry-after'));
  const body = await last.json();
  check('the 429 has the documented error shape', body.error?.code === 'rate_limited', JSON.stringify(body));
}

console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
