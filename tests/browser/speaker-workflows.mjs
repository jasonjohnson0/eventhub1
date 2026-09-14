/**
 * Spec 06 (speaker workflows): the event page's Organized-by/Speakers split,
 * the /c/$slug/speakers directory, and the /c/$slug/p/$id person page --
 * including that an unlisted event a speaker is also assigned to never
 * leaks onto their public person page.
 */
import { chromium } from 'playwright-core';
import { ORG_SPEAKER } from '../support/mock-supabase.mjs';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const HARVEST_UUID = 'aaaaaaaa-1111-4111-8111-111111111111';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});

// ---- event page: Organized-by / Speakers split -----------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 1.5 });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/events/${HARVEST_UUID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const body = await page.innerText('body');

  check('Organized by heading present', body.includes('Organized by'), body.slice(0, 300));
  check('Speakers heading present', body.includes('Speakers'), body.slice(0, 300));
  check('the organizer-only profile shows under Organized by', body.includes('Riley Organizer'));
  check('the speaker-only profile shows (Jamie Speaker)', body.includes('Jamie Speaker'));
  check('the both-role profile shows (Sam Both)', body.includes('Sam Both'));

  // Jamie Speaker's chip should link to their person page.
  const jamieLink = page.locator('a:has-text("Jamie Speaker")').first();
  check('Jamie Speaker is a link to their person page', (await jamieLink.count()) > 0);
  if (await jamieLink.count()) {
    const href = await jamieLink.getAttribute('href');
    check('the link points at /c/riverside/p/<id>', href === `/c/riverside/p/${ORG_SPEAKER}`, href ?? '');
  }

  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- speakers directory: only kind speaker/both shows ----------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 1.5 });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/c/riverside/speakers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const body = await page.innerText('body');

  check('page heading is Speakers', body.includes('Speakers'), body.slice(0, 200));
  check('Jamie Speaker (kind speaker) is listed', body.includes('Jamie Speaker'));
  check('Sam Both (kind both) is listed', body.includes('Sam Both'));
  check('Riley Organizer (kind organizer only) is NOT listed', !body.includes('Riley Organizer'), body.slice(0, 400));

  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- person page: bio/credentials/socials + upcoming events, no leaks ------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1200 }, deviceScaleFactor: 1.5 });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/c/riverside/p/${ORG_SPEAKER}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const body = await page.innerText('body');

  check('name renders', body.includes('Jamie Speaker'), body.slice(0, 200));
  check('bio renders', body.includes('Keynote on river ecology.'));
  check('credentials render', body.includes('PhD, State University'));
  check('the public event (Harvest Festival) is listed as upcoming', body.includes('Harvest Festival'));
  check('the unlisted event (Backyard BBQ) does NOT leak onto the person page',
    !body.includes('Backyard BBQ'), body.slice(0, 600));

  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

// ---- unknown person id 404s rather than crashing ----------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${BASE}/c/riverside/p/99999999-0000-4000-8000-000000000000`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const body = await page.innerText('body');
  check('shows the not-found state', body.includes('No profile here'), body.slice(0, 200));
  check('no uncaught errors', errs.length === 0, errs.slice(0, 3).join('; '));
  await ctx.close();
}

await browser.close();
console.log('\n' + (failures ? `${failures} CHECK(S) FAILED` : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
