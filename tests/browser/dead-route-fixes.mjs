/**
 * P0 QA pass (2026-09-16): /embed, /login and /signin all 404'd -- there was
 * no route at any of those URLs. This checks the fixes directly over HTTP
 * (no browser needed for a redirect/200 check) plus the embed code manager's
 * iframe-vs-preview URL match and its new height/border controls.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

// ---- /embed no longer 404s for a signed-out visitor -----------------------
const embedRes = await fetch(`${BASE}/embed`, { redirect: 'manual' });
check('/embed renders (not a 404) for a signed-out visitor', embedRes.status === 200, String(embedRes.status));

// ---- /login and /signin redirect to /auth, carrying next -------------------
for (const path of ['/login', '/signin']) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' });
  check(`${path} redirects (not a 404)`, res.status >= 300 && res.status < 400, String(res.status));
  const loc = res.headers.get('location') ?? '';
  check(`${path} redirects to /auth`, loc.startsWith('/auth'), loc);
}
const withNext = await fetch(`${BASE}/login?next=%2Fdashboard`, { redirect: 'manual' });
const nextLoc = withNext.headers.get('location') ?? '';
check('/login forwards a next= param to /auth', nextLoc.includes('next=') && nextLoc.includes('dashboard'), nextLoc);

// ---- the WordPress plugin is actually downloadable -------------------------
const zipRes = await fetch(`${BASE}/downloads/eventhub-calendar.zip`);
check('the WordPress plugin zip is served, not a 404', zipRes.status === 200, String(zipRes.status));
const zipBuf = Buffer.from(await zipRes.arrayBuffer());
check('the zip file is non-trivial in size', zipBuf.length > 1000, String(zipBuf.length));
check('the zip file has a real zip signature', zipBuf.slice(0, 2).toString('hex') === '504b', zipBuf.slice(0, 4).toString('hex'));

// ---- embed code manager: copy matches preview, options mutate the snippet --
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '11111111-1111-1111-1111-111111111111';
const now = Math.floor(Date.now() / 1000);
const jwt = [
  b64({ alg: 'HS256', typ: 'JWT' }),
  b64({ sub: UID, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com',
        iat: now, exp: now + 3600, iss: `${MOCK}/auth/v1` }),
  'c2lnbmF0dXJl',
].join('.');
const session = {
  access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
  refresh_token: 'fake-refresh',
  user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'coord@example.com',
          app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
};
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
await ctx.addInitScript(([k, v]) => {
  try { window.localStorage.setItem(k, v); } catch {}
}, ['sb-127-auth-token', JSON.stringify(session)]);
const page = await ctx.newPage();
await page.goto(`${BASE}/coordinator/settings/embed`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const iframeBox = page.locator('pre', { hasText: '<iframe' });
const snippet = await iframeBox.innerText();
check('the copyable iframe snippet points at /api/embed, not /c',
  snippet.includes('/api/embed/riverside') && !/src="[^"]*\/c\/riverside"/.test(snippet));

await page.fill('#embed-height', '500');
await page.click('label:has-text("Show a border")');
await page.waitForTimeout(300);
const updated = await iframeBox.innerText();
check('changing height updates the copyable snippet', updated.includes('height="500"'), updated);
check('toggling the border updates the copyable snippet', updated.includes('border:1px solid'), updated);

check('the WordPress hint links to a real download, not just instructions',
  (await page.innerText('body')).includes('EventHub Calendar plugin (.zip)'));

await browser.close();

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED'}`);
process.exit(failures ? 1 : 0);
