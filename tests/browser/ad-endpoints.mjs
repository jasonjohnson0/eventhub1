/**
 * The impression pixel and the click redirect: that they count the right
 * things, decline to count machines, and cannot be turned into an open
 * redirect.
 */
const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
const LIVE = 'dddddddd-1111-4111-8111-111111111111';
const HOSTILE = 'dddddddd-2222-4222-8222-222222222222';
const DEAD = 'dddddddd-9999-4999-8999-999999999999';
const BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const log = async () => (await fetch(`${MOCK}/__adlog`)).json();
const reset = async () => { await fetch(`${MOCK}/__adlog/reset`); };
const hit = (path, headers = {}) =>
  fetch(`${BASE}${path}`, { redirect: 'manual', headers: { 'user-agent': BROWSER, ...headers } });

// ---- the pixel ---------------------------------------------------------------
await reset();
let r = await hit(`/api/ad/i/${LIVE}?s=embed`);
const bytes = new Uint8Array(await r.arrayBuffer());
check('pixel returns 200', r.status === 200, String(r.status));
check('pixel is a gif', r.headers.get('content-type') === 'image/gif', r.headers.get('content-type'));
check('pixel is the 42-byte transparent gif', bytes.length === 42, String(bytes.length));
check('pixel starts with the GIF magic',
  String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a', String.fromCharCode(...bytes.slice(0, 6)));
check('pixel is never cached', /no-store/.test(r.headers.get('cache-control') || ''),
  r.headers.get('cache-control'));
check('pixel is not indexed', (r.headers.get('x-robots-tag') || '').includes('noindex'));

let entries = await log();
check('a browser view is counted', entries.length === 1, JSON.stringify(entries));
check('it is recorded as an embed impression',
  entries[0]?.p_kind === 'impression' && entries[0]?.p_surface === 'embed', JSON.stringify(entries[0]));
check('no raw address is sent to the database',
  !JSON.stringify(entries[0]).includes('127.0.0.1'), JSON.stringify(entries[0]));
check('the visitor hash is an opaque fixed-length digest',
  /^[0-9a-f]{32}$/.test(entries[0]?.p_visitor_hash ?? ''), entries[0]?.p_visitor_hash);

// surface defaults to the site when not stated
await reset();
await hit(`/api/ad/i/${LIVE}`);
check('surface defaults to site', (await log())[0]?.p_surface === 'site');

// A browser must actually decode it; a malformed GIF would show a broken-image
// icon in the middle of a customer's page.
{
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  });
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/api/embed/riverside`);
  const dims = await page.evaluate(async (u) => {
    const img = new Image();
    img.src = u;
    try { await img.decode(); } catch { return null; }
    return [img.naturalWidth, img.naturalHeight];
  }, `${BASE}/api/ad/i/${LIVE}?s=embed`);
  check('a real browser decodes the pixel', JSON.stringify(dims) === '[1,1]', JSON.stringify(dims));
  await browser.close();
}

// ---- machines are not impressions --------------------------------------------
for (const [ua, who] of [
  ['Googlebot/2.1 (+http://www.google.com/bot.html)', 'a search crawler'],
  ['facebookexternalhit/1.1', 'a link unfurler'],
  ['curl/8.4.0', 'a shell script'],
  ['Mozilla/5.0 HeadlessChrome/120', 'a headless browser'],
  ['', 'a request with no user agent'],
]) {
  await reset();
  const res = await hit(`/api/ad/i/${LIVE}?s=embed`, { 'user-agent': ua });
  const got = await log();
  check(`${who} is not counted`, got.length === 0, JSON.stringify(got));
  check(`${who} still gets a valid image`, res.status === 200 && res.headers.get('content-type') === 'image/gif');
}

for (const [h, v, who] of [
  ['sec-purpose', 'prefetch;anonymous-client-ip', 'a Chrome prefetch'],
  ['purpose', 'prefetch', 'an older prefetch'],
  ['sec-purpose', 'prerender', 'a prerender'],
]) {
  await reset();
  await hit(`/api/ad/i/${LIVE}?s=embed`, { [h]: v });
  check(`${who} is not counted`, (await log()).length === 0);
}

// ---- a placement that is not live --------------------------------------------
await reset();
r = await hit(`/api/ad/i/${DEAD}?s=embed`);
check('an unknown slot still returns an image', r.status === 200);
check('an unknown slot counts nothing', (await log()).length === 0);

await reset();
r = await hit('/api/ad/i/not-a-uuid?s=embed');
check('a malformed slot id returns an image rather than an error', r.status === 200, String(r.status));
check('a malformed slot id never reaches the database', (await log()).length === 0);

// ---- the click redirect -------------------------------------------------------
await reset();
r = await hit(`/api/ad/c/${LIVE}?s=embed`);
check('click redirects', r.status === 302, String(r.status));
check('click lands on the advertiser',
  r.headers.get('location') === 'https://riverside.example/offer', r.headers.get('location'));
check('the redirect is never cached', /no-store/.test(r.headers.get('cache-control') || ''));
check('the redirect leaks no referrer', r.headers.get('referrer-policy') === 'no-referrer');
entries = await log();
check('the click is counted', entries.length === 1 && entries[0].p_kind === 'click', JSON.stringify(entries));

// ---- open redirect ------------------------------------------------------------
// The whole reason the destination is resolved from the slot.
for (const evil of [
  '&to=https://evil.example/phish',
  '&url=https://evil.example/phish',
  '&redirect=//evil.example',
  '&next=https%3A%2F%2Fevil.example',
]) {
  r = await hit(`/api/ad/c/${LIVE}?s=embed${evil}`);
  check(`a destination in the query string is ignored (${evil.slice(1, 12)}…)`,
    r.headers.get('location') === 'https://riverside.example/offer', r.headers.get('location'));
}
r = await hit('/api/ad/c/https:%2F%2Fevil.example');
check('a URL in place of the slot id falls back to our own site',
  (r.headers.get('location') || '').startsWith('https://events.example/'), r.headers.get('location'));

// ---- a slot whose advertiser gave no link --------------------------------------
r = await hit(`/api/ad/c/${HOSTILE}?s=embed`);
check('a javascript: destination is never issued as a redirect',
  !/^javascript:/i.test(r.headers.get('location') || ''), r.headers.get('location'));
check('it falls back to somewhere useful',
  r.headers.get('location') === 'https://events.example/events', r.headers.get('location'));

r = await hit(`/api/ad/c/${DEAD}`);
check('a click on an ended campaign is not a dead end',
  r.headers.get('location') === 'https://events.example/events', r.headers.get('location'));

// ---- the fingerprint separates visitors without identifying them ---------------
await reset();
await hit(`/api/ad/i/${LIVE}`, { 'x-forwarded-for': '203.0.113.5' });
await hit(`/api/ad/i/${LIVE}`, { 'x-forwarded-for': '203.0.113.5' });
await hit(`/api/ad/i/${LIVE}`, { 'x-forwarded-for': '198.51.100.9' });
entries = await log();
const hashes = entries.map((e) => e.p_visitor_hash);
check('the same visitor hashes the same way', hashes[0] === hashes[1], hashes.join(' '));
check('a different visitor hashes differently', hashes[0] !== hashes[2], hashes.join(' '));
await reset();
await hit(`/api/ad/i/${LIVE}`, { 'x-forwarded-for': '203.0.113.5', 'user-agent': BROWSER + ' Edg/120' });
check('a different browser on one address is a different visitor',
  (await log())[0].p_visitor_hash !== hashes[0]);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
