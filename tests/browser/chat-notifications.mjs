/**
 * Spec 08 (Slack/Discord coordinator notifications): the settings UI --
 * default toggle state, host-allowlist rejection at save time (the SSRF
 * gate itself is unit-tested directly; this proves the save path actually
 * calls through to it and surfaces the rejection to the coordinator), and
 * that a saved URL never renders in full again.
 *
 * The actual webhook POST (submission/RSVP/ticket/cancel -> Slack/Discord)
 * isn't exercised here -- by design those go to real external hosts
 * (hooks.slack.com / discord.com), which a browser test against this mock
 * can't intercept without weakening the allowlist itself. Covered instead
 * by tests/unit/webhook-allowlist.mjs (the allowlist/masking logic) and
 * code review of each of the four call sites.
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript(([k, v]) => { try { window.localStorage.setItem(k, v); } catch {} },
    ['sb-127-auth-token', JSON.stringify({
      access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600,
      refresh_token: 'r',
      user: { id: uid, aud: 'authenticated', role: 'authenticated', email,
              app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    })]);
  return ctx;
}

// ---- default state: nothing configured yet ----------------------------------
{
  const ctx = await signedInAs(COORD, 'coordinator@example.com');
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const body = await page.innerText('body');
  check('Slack / Discord notifications section present', body.includes('Slack / Discord notifications'), body.slice(0, 200));
  check('no "Send test" button before anything is configured', !(await page.locator('button:has-text("Send test")').count()));

  const checkboxes = page.locator('[role="checkbox"]');
  const states = await checkboxes.evaluateAll((els) => els.map((el) => el.getAttribute('data-state')));
  // Notification preferences (attendee) card has its own 2 checkboxes above
  // this one in the DOM -- the chat-hooks card's 4 are whatever the last 4 are.
  const last4 = states.slice(-4);
  check('defaults: submission on, rsvp_going off, ticket_sold on, event_cancelled on',
    last4[0] === 'checked' && last4[1] === 'unchecked' && last4[2] === 'checked' && last4[3] === 'checked',
    JSON.stringify(last4));

  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- an invalid host is rejected at save, nothing persisted -----------------
{
  const ctx = await signedInAs(COORD, 'coordinator@example.com');
  const page = await ctx.newPage();
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await page.locator('input[placeholder*="hooks.slack.com"]').fill('https://evil.example.com/steal-this');
  await page.locator('button:has-text("Save notification settings")').click();
  await page.waitForTimeout(500);

  // Sonner's toast renders but Playwright's actionability wait (used by
  // locator methods like .innerText()) doesn't reliably consider it
  // "visible" during its entry animation -- read the raw HTML instead of
  // going through a locator, same as every other check in this suite reads
  // rendered body/HTML content rather than asserting on a specific widget's
  // internal state.
  const toastHtml = await page.content();
  // "hooks.slack.com" alone would also match the (still-unconfigured) input's
  // own placeholder text, so match the specific phrasing of the thrown
  // validation error instead -- text that only ever appears in the toast.
  check('an off-allowlist host is rejected with a clear error, not silently accepted',
    /must be an https/i.test(toastHtml), toastHtml.includes('data-sonner-toast') ? '(toast present, wrong text)' : '(no toast rendered)');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  check('no "Send test" button appeared -- the bad URL was never saved',
    !(await page.locator('button:has-text("Send test")').count()));

  await ctx.close();
}

// ---- a valid host saves, then never renders in full again -------------------
{
  const ctx = await signedInAs(COORD, 'coordinator@example.com');
  const page = await ctx.newPage();
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const REAL_URL = 'https://hooks.slack.com/services/T0000000/B0000000/abcdefghijklmnopqrstuvwx';
  await page.locator('input[placeholder*="hooks.slack.com"]').fill(REAL_URL);
  await page.locator('button:has-text("Save notification settings")').click();
  await page.waitForTimeout(500);

  const toastHtml = await page.content();
  check('a real-shaped Slack URL saves successfully', /notification settings saved/i.test(toastHtml),
    toastHtml.includes('data-sonner-toast') ? '(toast present, wrong text)' : '(no toast rendered)');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const slackPlaceholder = await page.locator('input[placeholder*="hooks.slack.com"]').getAttribute('placeholder');
  const pageHtml = await page.content();
  check('the full URL (specifically the token) never renders after save, anywhere on the page',
    !pageHtml.includes('abcdefghijklmnopqrstuvwx'), pageHtml.length > 500 ? '(page html, token search failed)' : pageHtml);
  check('the Slack field now shows a masked host as its placeholder, not the raw URL',
    slackPlaceholder === 'hooks.slack.com/services/…', slackPlaceholder ?? '(no placeholder found)');
  check('a "Send test" button now appears for the configured Slack hook',
    (await page.locator('button:has-text("Send test")').count()) > 0);

  await ctx.close();
}

await browser.close();
console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
