/**
 * Drives /submit-event against the mock Supabase: this is the P0 fix for the
 * tenant-routing bug where every public submission, regardless of whose site
 * it came from, silently landed in one unrelated coordinator's queue. Covers
 * both entry points -- a scoped link (?c=slug, locked to that coordinator)
 * and the bare route (a picker over every live coordinator) -- and confirms
 * the resulting row actually carries the right coordinator_id.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  return page.innerText('body');
};

const resetSubmissions = async () => {
  await fetch(`${MOCK}/__submissions/reset`);
};
const readSubmissions = async () => (await fetch(`${MOCK}/__submissions`)).json();

// The <Label>/<Input> pairs on this form are plain siblings with no
// htmlFor/id or wrapping, so getByLabel() can't resolve them -- fall back to
// "the input right after this label's text" instead.
const fieldByLabel = (text) =>
  page.locator(
    `xpath=//label[normalize-space(text())="${text}"]/following-sibling::*[self::input or self::textarea or self::button][1]`,
  );

async function fillAndSubmit() {
  await fieldByLabel('Your email').fill('visitor@example.com');
  await fieldByLabel('Event title').fill('Probe Event');
  await fieldByLabel('Date').fill('2027-05-01');
  await fieldByLabel('Start time').fill('18:00');
  await fieldByLabel('End time').fill('20:00');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await page.waitForTimeout(600);
}

// ---- scoped link: /submit-event?c=riverside -----------------------------------
await resetSubmissions();
let body = await go('/submit-event?c=riverside');
check('locked coordinator name renders', body.includes("Submitting to"), body.slice(0, 300));
check('shows the coordinator by name, not the raw slug', body.includes('Riverside Events Co.'), body.slice(0, 300));
check('no picker is shown when a coordinator is already scoped', !body.includes('Choose a community'));

await fillAndSubmit();
let landed = await page.innerText('body');
check('reached the thank-you screen', landed.includes('Thanks — we got it'), landed.slice(0, 200));

let subs = await readSubmissions();
check('exactly one submission recorded', subs.length === 1, JSON.stringify(subs));
check(
  'submission is tagged for the riverside coordinator, not some other one',
  subs[0]?.coordinator_id === '11111111-1111-1111-1111-111111111111',
  JSON.stringify(subs[0]),
);

// ---- bare route: /submit-event (the picker) -----------------------------------
await resetSubmissions();
body = await go('/submit-event');
check('the picker is shown with no ?c=', body.includes('Which community calendar is this for?'), body.slice(0, 300));

await fieldByLabel('Which community calendar is this for?').click();
await page.getByRole('option', { name: 'Riverside Events Co.' }).click();
await fillAndSubmit();

subs = await readSubmissions();
check('picker submission recorded exactly once', subs.length === 1, JSON.stringify(subs));
check(
  'picking Riverside from the list routes to the riverside coordinator',
  subs[0]?.coordinator_id === '11111111-1111-1111-1111-111111111111',
  JSON.stringify(subs[0]),
);

// ---- an unknown slug is a hard error, never a silent fallback -----------------
await resetSubmissions();
body = await go('/submit-event?c=does-not-exist');
// Previously getPublicCoordinator() returning null (not an error, for an
// unknown slug) fell through to displaying the raw slug text as if it were
// a real, locked-in coordinator -- "Submitting to does-not-exist's
// calendar" -- with nothing telling the visitor the address was invalid
// until the submit itself failed server-side.
check('an unknown slug is shown as not found, not as a fake locked-in coordinator',
  body.includes('could not be found'), body.slice(0, 400));
check('...and specifically not displayed as though it were real',
  !body.includes("Submitting to does-not-exist's calendar"), body.slice(0, 400));
// No coordinator was ever actually chosen, so Submit stays disabled from the
// start -- not just "fails after you click it".
const disabledSubmit = page.getByRole('button', { name: 'Submit for review' });
check('Submit is disabled outright, not just doomed to fail server-side',
  await disabledSubmit.isDisabled());
await fieldByLabel('Your email').fill('visitor@example.com');
await fieldByLabel('Event title').fill('Probe Event');
await fieldByLabel('Date').fill('2027-05-01');
await fieldByLabel('Start time').fill('18:00');
await fieldByLabel('End time').fill('20:00');
await disabledSubmit.click({ force: true }).catch(() => {});
await page.waitForTimeout(400);
subs = await readSubmissions();
check('...and even forcing the click server-side rejects it, inserting nothing',
  subs.length === 0, JSON.stringify(subs));

// ---- the coordinator's own page links here, scoped to itself -----------------
await go('/c/riverside');
const href = await page.getAttribute('a:has-text("Submit an event")', 'href');
check('the coordinator page links to its own scoped submit page', href === '/submit-event?c=riverside', href);

check('no uncaught errors', errors.length === 0, errors.join(' | '));

await browser.close();
console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
