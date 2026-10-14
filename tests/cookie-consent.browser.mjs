import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.CHECKAUTO_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = http.createServer(async (req, res) => {
  try {
    let pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) throw new Error('Outside root');
    const body = await fs.readFile(filename);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' }).end(body);
  } catch (_) { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = process.env.CHECKAUTO_TEST_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const KEY = 'checkauto-cookie-consent';
const pages = ['/', '/paslaugos/', '/galerija/', '/apie/', '/duk/', '/kontaktai/', '/privatumo-politika/', '/taisykles-ir-salygos/', '/404.html', '/unsubscribe/', '/kainos/'];
async function context(options = {}) {
  const ctx = await browser.newContext(options);
  await ctx.route('**/*.supabase.co/**', route => route.fulfill({ contentType: 'application/json', body: '{"slots":[]}' }));
  await ctx.addInitScript(() => {
    window.optionalAccess = [];
    for (const method of ['getItem', 'setItem']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (key, ...args) {
        if (key === 'checkauto-lang') window.optionalAccess.push({ method, consent: window.checkautoConsent?.preferencesAllowed() === true });
        return original.call(this, key, ...args);
      };
    }
  });
  ctx.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return ctx;
}
async function language(page, lang) {
  assert.equal(await page.evaluate(lang => window.checkautoI18n.setLanguage(lang), lang), true);
  assert.equal(await page.locator('html').getAttribute('lang'), lang);
}
async function noOptionalAccess(page) {
  assert.deepEqual(await page.evaluate(() => window.optionalAccess.filter(item => !item.consent)), []);
}
try {
  // Direct entry on every public route must ask, with optional reads and writes blocked.
  for (const route of pages) {
    const ctx = await context();
    const page = await ctx.newPage();
    await page.goto(base + route);
    await page.locator('#cookie-consent').waitFor({ state: 'visible' });
    assert.equal(await page.locator('[data-consent-accept]').isVisible(), true);
    assert.equal(await page.locator('[data-consent-reject]').isVisible(), true);
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    await noOptionalAccess(page);
    await ctx.close();
  }
  console.log('Passed: fresh entry on all 11 public routes; no optional storage access.');

  const ctx = await context();
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await language(page, 'en');
  assert.equal(await page.locator('#cookie-consent-title').textContent(), 'Cookie choices');
  await noOptionalAccess(page);
  await page.getByRole('button', { name: 'Reject optional', exact: true }).click();
  assert.equal(await page.locator('#cookie-consent').isHidden(), true);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('checkauto-cookie-consent')).preferences), false);
  assert.equal(await page.evaluate(() => localStorage.length), 1);
  await language(page, 'lt');
  await language(page, 'en');
  await noOptionalAccess(page);
  await page.goto(base + '/apie/');
  assert.equal(await page.locator('html').getAttribute('lang'), 'lt');
  assert.equal(await page.locator('#cookie-consent').isHidden(), true);
  await page.locator('[data-cookie-settings]').click();
  assert.equal(await page.locator('[data-consent-status]').textContent(), 'Atmesti');
  assert.equal(await page.locator('[data-consent-reject]').evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-cookie-settings]').evaluate(el => el === document.activeElement), true);
  await language(page, 'en');
  await noOptionalAccess(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('checkauto-lang')), 'en');
  await page.goto(base + '/taisykles-ir-salygos/');
  await page.waitForFunction(() => window.checkautoI18n?.getLanguage() === 'en');
  assert.equal(await page.locator('.legal-document h1').textContent(), 'Terms and Conditions');

  const other = await ctx.newPage();
  await other.goto(base + '/privatumo-politika/');
  await other.waitForFunction(() => window.checkautoI18n?.getLanguage() === 'en');
  await page.locator('[data-cookie-settings]').click();
  await page.getByRole('button', { name: 'Reject optional', exact: true }).click();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'Withdrawal need not disrupt the current page language');
  assert.equal(await page.evaluate(() => localStorage.getItem('checkauto-lang')), null);
  await language(other, 'lt');
  await language(other, 'en');
  assert.equal(await other.evaluate(() => localStorage.getItem('checkauto-lang')), null);
  await other.reload();
  assert.equal(await other.locator('html').getAttribute('lang'), 'lt');
  console.log('Passed: reject, language switching, saved acceptance, keyboard controls, withdrawal and cross-tab enforcement.');

  // Rejection must not remove the necessary booking recovery capability.
  await page.goto(base + '/kontaktai/');
  await page.evaluate(() => sessionStorage.setItem('checkauto-booking-operation', JSON.stringify({ id: 'test-operation', fingerprint: 'test-fingerprint' })));
  await page.reload();
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('checkauto-booking-operation')).id), 'test-operation');
  assert.equal(await page.locator('#contact-name').isEnabled(), true);
  assert.equal(await page.locator('#contact-email').isEnabled(), true);
  await ctx.close();

  // Submit the real form after rejecting optional storage; only the API is mocked.
  const bookingCtx = await context();
  const bookingPage = await bookingCtx.newPage();
  let submitted;
  let operationAtSubmission;
  const start = new Date(Date.now() + 5 * 86400000).toISOString();
  await bookingCtx.route('**/functions/v1/public-booking**', async route => {
    const headers = { 'access-control-allow-origin': base, 'access-control-allow-headers': 'authorization,apikey,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
      operationAtSubmission = await bookingPage.evaluate(() => sessionStorage.getItem('checkauto-booking-operation'));
      return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ ok: true, reference: 'COOKIE-TEST', emailDelivery: 'queued', startAt: start, serviceCode: 'full_inspection' }) });
    }
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ slots: [{ slot_id: 'test-slot', start_at: start, end_at: new Date(Date.parse(start) + 7200000).toISOString() }] }) });
  });
  await bookingPage.goto(base + '/kontaktai/');
  await bookingPage.locator('[data-consent-reject]').click();
  await bookingPage.locator('[data-booking-service-trigger]').click();
  await bookingPage.locator('[data-service-option][data-value="full_inspection"]').click();
  await bookingPage.locator('[data-booking-slot-options] [role="radio"]').first().click();
  for (const [selector, value] of Object.entries({ '#contact-name': 'Consent test', '#contact-phone': '+37060000000', '#contact-email': 'consent@example.invalid', '#contact-vehicle': 'Fixture vehicle', '#contact-location': 'Fixture location' })) await bookingPage.locator(selector).fill(value);
  await bookingPage.locator('[data-terms-consent]').check();
  await bookingPage.locator('[data-contact-form-submit]').click();
  await bookingPage.locator('[data-contact-form-status]').getByText('COOKIE-TEST', { exact: true }).waitFor();
  assert.equal(submitted.privacyTextVersion, 'privacy-2026-10-14');
  assert.equal(submitted.termsTextVersion, 'terms-2026-10-14');
  assert.equal(JSON.parse(operationAtSubmission).id, submitted.operationId);
  assert.equal(await bookingPage.evaluate(() => sessionStorage.getItem('checkauto-booking-operation')), null);
  await noOptionalAccess(bookingPage);
  assert.equal(await bookingPage.evaluate(() => localStorage.length), 1);
  await bookingCtx.close();
  console.log('Passed: a booking submits after rejection with necessary recovery and current legal versions.');

  // An old language record without consent must be deleted without being read.
  for (const invalid of [null, '{invalid', JSON.stringify({ version: 'cookies-2026-10-14', preferences: true, savedAt: 1, expiresAt: 2 })]) {
    const invalidCtx = await context();
    const p = await invalidCtx.newPage();
    await p.goto(base + '/');
    await p.evaluate(({ key, invalid }) => {
      if (invalid === null) localStorage.removeItem(key); else localStorage.setItem(key, invalid);
      localStorage.setItem('checkauto-lang', 'en');
    }, { key: KEY, invalid });
    await p.reload();
    await p.locator('#cookie-consent').waitFor({ state: 'visible' });
    assert.equal(await p.locator('html').getAttribute('lang'), 'lt');
    await noOptionalAccess(p);
    assert.equal(await p.evaluate(() => localStorage.getItem('checkauto-lang')), null);
    await invalidCtx.close();
  }
  console.log('Passed: absent, corrupt and expired consent all fail closed; legacy language removed.');

  const blocked = await context();
  await blocked.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) Storage.prototype[method] = function () { throw new DOMException('Blocked', 'SecurityError'); };
  });
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(base + '/');
  await blockedPage.locator('[data-consent-accept]').click();
  assert.equal(await blockedPage.evaluate(() => window.checkautoConsent.preferencesAllowed()), false);
  assert.equal(await blockedPage.locator('[data-consent-error]').isVisible(), true);
  await language(blockedPage, 'en');
  await blocked.close();
  console.log('Passed: blocked storage leaves optional storage disabled and the site usable.');

  const writeBlocked = await context();
  const wb = await writeBlocked.newPage();
  await wb.goto(base + '/');
  await wb.locator('[data-consent-accept]').click();
  await language(wb, 'en');
  await wb.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Blocked', 'SecurityError'); }; });
  await wb.locator('[data-cookie-settings]').click();
  await wb.locator('[data-consent-reject]').click();
  assert.equal(await wb.evaluate(() => window.checkautoConsent.preferencesAllowed()), false);
  assert.equal(await wb.locator('[data-consent-error]').isVisible(), true);
  assert.equal(await wb.evaluate(() => localStorage.getItem('checkauto-cookie-consent')), null);
  assert.equal(await wb.evaluate(() => localStorage.getItem('checkauto-lang')), null);
  await writeBlocked.close();

  const visual = await context({ viewport: { width: 1280, height: 800 } });
  const v = await visual.newPage();
  await v.goto(base + '/privatumo-politika/');
  await v.screenshot({ path: '/private/tmp/checkauto-cookie-desktop.png' });
  for (const width of [320, 390, 768, 1280]) {
    await v.setViewportSize({ width, height: 800 });
    for (const lang of ['lt', 'en']) {
      await language(v, lang);
      const overflow = await v.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, elements: Array.from(document.querySelectorAll('body *')).filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map(el => ({ tag: el.tagName, className: el.className, right: el.getBoundingClientRect().right })) }));
      assert.ok(overflow.scrollWidth <= overflow.width, `Overflow at ${width}px in ${lang}: ${JSON.stringify(overflow)}`);
      const buttons = await v.locator('.cookie-banner-actions button').evaluateAll(els => els.map(el => ({ height: el.getBoundingClientRect().height, color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).border })));
      assert.ok(buttons.every(b => b.height >= 44));
      assert.deepEqual(buttons[0], buttons[1], 'Accept/reject must have equal presentation');
    }
  }
  await v.setViewportSize({ width: 390, height: 844 });
  await v.screenshot({ path: '/private/tmp/checkauto-cookie-mobile.png' });
  await v.evaluate(() => document.documentElement.style.fontSize = '200%');
  assert.equal(await v.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await v.locator('[data-consent-reject]').click();
  assert.equal(await v.locator('#cookie-consent').isHidden(), true);
  await visual.close();
  assert.deepEqual(errors, []);
  console.log('Passed: both languages, 320–1280px, enlarged text, equal buttons and no page errors.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
