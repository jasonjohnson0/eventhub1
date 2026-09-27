/**
 * The holiday + monthly-observance theme expansion (2026-09):
 *   - /coordinator/settings/styling lists the new groups (Christian holidays,
 *     National holidays, Monthly observances) with a date next to each, and
 *     applying a monthly preset saves both colors and shows up on the public
 *     calendar and the embed;
 *   - a legacy low-contrast preset still round-trips unchanged, but the embed
 *     prints its dates in an AA-darkened shade;
 *   - the /events theme picker offers and applies a new theme, old stored
 *     ids still work, and Good Friday fires no confetti -- all without
 *     console errors.
 *
 * Opt-in visual record: SHOTS_DIR=/some/dir tests/run.sh browser holiday
 */
import { chromium } from 'playwright-core';

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:5199';
const MOCK = process.env.MOCK_URL ?? 'http://127.0.0.1:54199';
let failures = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${c ? '' : '  <-- ' + e}`);
  if (!c) failures++;
};
const shot = async (page, name, opts = {}) => {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/holiday-${name}.png`, ...opts });
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '11111111-1111-1111-1111-111111111111'; // COORD, slug=riverside, live
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

// =============================================================================
// Coordinator styling page
// =============================================================================
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
  await ctx.addInitScript(([k, v]) => {
    try { window.localStorage.setItem(k, v); } catch {}
  }, ['sb-127-auth-token', JSON.stringify(session)]);
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  // Saves go through a server function, so read back what the stub stored.
  const stored = () => fetch(`${MOCK}/rest/v1/coordinator_profiles?coordinator_id=eq.${UID}`, {
    headers: { apikey: 'test-service-key', authorization: 'Bearer test-service-key' },
  }).then((r) => r.json()).then((rows) => (Array.isArray(rows) ? rows[0] : rows) ?? {});

  await page.goto(`${BASE}/coordinator/settings/styling`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[role="tablist"]', { timeout: 15000 });

  const tabs = await page.locator('[role="tab"]').allInnerTexts();
  const tabText = tabs.join(' | ');
  for (const t of ['Coming up', 'Christian holidays', 'National holidays', 'Monthly observances', 'Seasonal']) {
    check(`the "${t}" tab is offered`, tabText.includes(t), tabText);
  }
  const upcomingSections = await page.locator('[role="tabpanel"][data-state="active"] section[data-holiday]').count();
  check('"Coming up" (the default tab) shows the next 4 holidays', upcomingSections === 4, String(upcomingSections));
  const upBody = await page.locator('[role="tabpanel"][data-state="active"]').innerText();
  check('each upcoming holiday shows how far off it is', /Now|Tomorrow|In \d+ days/.test(upBody), upBody.slice(0, 300));
  await shot(page, 'styling-coming-up', { fullPage: true });

  // Christian holidays: dates computed from Easter, shown next to each.
  await page.click('[role="tab"]:has-text("Christian holidays")');
  await page.waitForTimeout(200);
  const christian = await page.locator('[role="tabpanel"][data-state="active"]').innerText();
  for (const h of ['Epiphany', 'Ash Wednesday & Lent', 'Palm Sunday', 'Good Friday', 'Easter', 'Pentecost', "All Saints' Day", 'Advent', 'Christmas']) {
    check(`Christian holidays lists ${h}`, christian.includes(h));
  }
  check('Christmas keeps its original three presets',
    ['Classic Red & Green', 'Winter Frost', 'Golden Elegance'].every((l) => christian.includes(l)));
  check('Easter shows its rule', christian.includes('First Sunday after the first full moon'));
  check('a "Next up" marker is shown in the group', christian.includes('Next up'));
  await shot(page, 'styling-christian', { fullPage: true });

  await page.click('[role="tab"]:has-text("National holidays")');
  await page.waitForTimeout(200);
  const national = await page.locator('[role="tabpanel"][data-state="active"]').innerText();
  for (const h of ["New Year's Day", 'Martin Luther King Jr. Day', "Presidents' Day", 'Memorial Day', 'Juneteenth',
    'Independence Day', 'Labor Day', "Indigenous Peoples' Day", 'Veterans Day', 'Thanksgiving',
    "Valentine's Day", "St. Patrick's Day", "Mother's Day", "Father's Day", 'Halloween']) {
    check(`National holidays lists ${h}`, national.includes(h));
  }
  check('Memorial Day shows its rule', national.includes('Last Monday in May'));

  await page.click('[role="tab"]:has-text("Monthly observances")');
  await page.waitForTimeout(200);
  const monthly = await page.locator('[role="tabpanel"][data-state="active"]').innerText();
  const monthlyCount = await page.locator('[role="tabpanel"][data-state="active"] section[data-holiday^="month-"]').count();
  check('Monthly observances lists all 12 months', monthlyCount === 12, String(monthlyCount));
  check('October is Breast Cancer Awareness Month', monthly.includes('Breast Cancer Awareness Month'));
  check('June is Country Cooking & Iced Tea', monthly.includes('Country Cooking') && monthly.includes('Iced Tea'));
  await shot(page, 'styling-monthly', { fullPage: true });

  // ---- apply a monthly preset ---------------------------------------------
  await page.click('section[data-holiday="month-october"] button:has-text("Pink Ribbon")');
  await page.waitForTimeout(900);
  const saved = await stored();
  check('applying Pink Ribbon saves its primary color', saved.primary_color === '#be185d', JSON.stringify(saved));
  check('...and its secondary color', saved.secondary_color === '#f9a8d4', JSON.stringify(saved));
  const toastBody = await page.innerText('body');
  check('a confirmation toast shows', toastBody.includes('Calendar styled: Pink Ribbon'));
  check('the card is marked active',
    (await page.getAttribute('section[data-holiday="month-october"] button:has-text("Pink Ribbon")', 'aria-pressed')) === 'true');
  check('the summary names the current look', toastBody.includes('Currently using'));

  const [pubHtml, embedHtml] = await Promise.all([
    fetch(`${BASE}/c/riverside`).then((r) => r.text()),
    fetch(`${BASE}/api/embed/riverside`).then((r) => r.text()),
  ]);
  check('the public calendar shows the ribbon badge', pubHtml.includes('🎗️'));
  check('the embed uses the new brand color', embedHtml.includes('--ehx-brand:#be185d'));
  check('an AA color is used as-is for embed text', embedHtml.includes('--ehx-brand-text:#be185d'));

  // ---- a legacy preset still saves unchanged, but reads as AA text ---------
  await page.click('[role="tab"]:has-text("Seasonal")');
  await page.waitForTimeout(200);
  await page.click('section[data-holiday="autumn"] button:has-text("Golden Harvest")');
  await page.waitForTimeout(900);
  const legacySaved = await stored();
  check('Golden Harvest still saves its original #f59e0b', legacySaved.primary_color === '#f59e0b', JSON.stringify(legacySaved));
  const legacyEmbed = await fetch(`${BASE}/api/embed/riverside`).then((r) => r.text());
  const textColor = /--ehx-brand-text:(#[0-9a-f]{6})/i.exec(legacyEmbed)?.[1];
  check('the embed darkens it for date text', !!textColor && textColor !== '#f59e0b', String(textColor));
  check('embed date text reads the text variable', legacyEmbed.includes('var(--ehx-brand-text,var(--ehx-brand))'));

  check('no page or console errors on the styling page', errs.length === 0, errs.join('; '));

  // Put the shared fixture back the way other suites expect it.
  await fetch(`${MOCK}/rest/v1/coordinator_profiles?on_conflict=coordinator_id`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ coordinator_id: UID, primary_color: '#0f766e', secondary_color: '#f97316' }),
  });
  await ctx.close();
}

// =============================================================================
// /events visitor theme picker
// =============================================================================
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  // canvas-confetti's own full-screen overlay canvas (the map has canvases too).
  const CONFETTI = 'body > canvas[style*="pointer-events: none"]';
  const heroClass = () => page.locator('section').first().getAttribute('class');
  const heading = () => page.locator('h1').first().innerText();

  await page.goto(`${BASE}/events`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('eh:holiday-theme'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  check('the default look fires its confetti burst (control)', (await page.locator(CONFETTI).count()) > 0);

  await page.click('button[aria-label="Choose a holiday theme"]');
  await page.waitForTimeout(200);
  const menu = await page.locator('[role="menu"]').innerText();
  check('the picker has a "Coming up" section', menu.includes('Coming up'));
  for (const g of ['Christian holidays', 'National holidays', 'Monthly observances', 'Seasonal']) {
    check(`the picker offers ${g}`, menu.includes(g), menu);
  }
  await page.click('[role="menuitem"]:has-text("Monthly observances")');
  await page.waitForTimeout(300);
  await page.click('[role="menuitem"]:has-text("October: Breast Cancer Awareness Month")');
  await page.waitForTimeout(400);
  check('choosing it stores the new theme id',
    (await page.evaluate(() => localStorage.getItem('eh:holiday-theme'))) === 'month-october');
  check('the hero switches to the pink theme', (await heroClass())?.includes('from-pink-100'), await heroClass());
  check('the heading shows the ribbon', (await heading()).includes('🎗️'));
  await shot(page, 'events-october');

  // Screenshots of a spread of the new heroes, and the solemn-day rules.
  const looks = ['easter', 'good-friday', 'ash-wednesday', 'month-june', 'independence-day', 'new-year',
    'juneteenth', 'st-patricks', 'month-march', 'veterans-day'];
  for (const id of looks) {
    await page.evaluate((v) => localStorage.setItem('eh:holiday-theme', v), id);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    if (id === 'good-friday' || id === 'ash-wednesday') {
      check(`${id} fires no confetti`, (await page.locator(CONFETTI).count()) === 0,
        await page.evaluate(() => [...document.querySelectorAll('canvas')].map((c) => c.outerHTML).join(' ')));
    }
    await shot(page, `events-${id}`);
  }
  await page.evaluate(() => localStorage.setItem('eh:holiday-theme', 'good-friday'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check('Good Friday renders the dark gradient', (await heroClass())?.includes('from-slate-900'), await heroClass());
  const logoClass = await page.locator('header a[href="/events"]').first().getAttribute('class');
  check('the top bar turns light over a dark hero', logoClass?.includes('text-white'), logoClass);

  // Backward compatibility: an id saved before this change still resolves.
  await page.evaluate(() => localStorage.setItem('eh:holiday-theme', 'halloween'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check('a previously saved "halloween" still applies', (await heading()).includes('🎃'));
  await page.evaluate(() => {
    localStorage.setItem('eh:holiday-theme', 'christmas');
    localStorage.setItem('eh:christmas-variant', 'ruby');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  check('a saved Christmas variant still renders the Christmas hero', (await page.innerText('body')).length > 0 && !(await heroClass())?.includes('from-red-100'));

  check('no page or console errors on /events', errs.length === 0, errs.join('; '));
  await ctx.close();
}

await browser.close();
console.log(`\n${failures ? `${failures} FAILURE(S)` : 'ALL CHECKS PASSED'}`);
process.exit(failures ? 1 : 0);
