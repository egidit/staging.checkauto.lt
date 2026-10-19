import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local fixtures only: never submit a booking or send mail through the real API.
const { chromium } = await import(process.env.CHECKAUTO_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = 'early-service-consent-2026-10-19';
const archive = JSON.parse(await fs.readFile(path.join(root, 'data/legal-consents.json'), 'utf8'));
const server = http.createServer(async (req, res) => {
  try {
    let pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root + path.sep)) throw new Error('Outside root');
    const body = await fs.readFile(filename);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
async function language(page, lang) {
  await page.waitForFunction(() => window.checkautoI18n);
  assert.equal(await page.evaluate(lang => window.checkautoI18n.setLanguage(lang), lang), true);
  assert.equal(await page.locator('html').getAttribute('lang'), lang);
}
try {
  for (const lang of ['lt', 'en']) {
    for (const width of [320, 390, 768, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 390 });
      const page = await ctx.newPage();
      page.on('pageerror', error => errors.push(error.message));
      const submissions = [];
      const start = new Date(Date.now() + (width === 320 ? 30 : 5) * 86400000).toISOString();
      await ctx.route('**/*.supabase.co/**', async route => {
        const headers = { 'access-control-allow-origin': base, 'access-control-allow-headers': 'authorization,apikey,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (route.request().method() === 'POST') {
          submissions.push(route.request().postDataJSON());
          const failed = submissions.length === 1;
          return route.fulfill({ status: failed ? 503 : 200, headers, contentType: 'application/json', body: JSON.stringify(failed ? { error: 'Fixture failure' } : { ok: true, reference: 'LEGAL-TEST', emailDelivery: 'queued', startAt: start, serviceCode: 'full_inspection' }) });
        }
        return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ slots: [{ slot_id: 'legal-test-slot', start_at: start, end_at: new Date(Date.parse(start) + 7200000).toISOString() }] }) });
      });
      await page.goto(base + '/kontaktai/');
      await page.locator('[data-consent-reject]').click();
      await language(page, lang);
      const early = page.locator('[data-early-service-consent]');
      const terms = page.locator('[data-terms-consent]');
      const submit = page.locator('[data-contact-form-submit]');
      assert.equal(await early.isChecked(), false);
      assert.equal(await early.getAttribute('checked'), null);
      assert.equal(await early.getAttribute('required'), '');
      assert.equal(await page.locator('[data-i18n="contact.form.early_service_consent"]').textContent(), archive[version][lang]);
      await page.locator('[data-booking-service-trigger]').click();
      await page.locator('[data-service-option][data-value="full_inspection"]').click();
      await page.locator('[data-booking-slot-options] [role="radio"]').first().click();
      for (const [selector, value] of Object.entries({ '#contact-name': 'Legal consent fixture', '#contact-phone': '+37060000000', '#contact-email': 'legal@example.invalid', '#contact-vehicle': 'Fixture vehicle', '#contact-location': 'Fixture location' })) await page.locator(selector).fill(value);
      await terms.check();
      assert.equal(await early.isChecked(), false, 'Terms acceptance must not imply early-service consent');
      assert.equal(await submit.isDisabled(), true);
      await page.locator('[data-contact-form]').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      await page.waitForFunction(() => document.activeElement?.hasAttribute('data-early-service-consent'));
      assert.equal(submissions.length, 0);
      assert.equal(await early.getAttribute('aria-invalid'), 'true');
      assert.equal(await page.locator('#contact-legal-error').isVisible(), true);
      await early.focus();
      await page.keyboard.press('Space');
      assert.equal(await early.isChecked(), true);
      assert.equal(await submit.isEnabled(), true);
      await early.uncheck();
      assert.equal(await submit.isDisabled(), true);
      const label = page.locator('label[for="contact-early-service-consent"]');
      if (width === 390) await label.tap(); else await label.click();
      await terms.uncheck();
      assert.equal(await submit.isDisabled(), true, 'Early request must not replace terms acceptance');
      await terms.check();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}/${lang}: page overflow at normal text size`);
      if (width === 320) await page.evaluate(() => document.documentElement.style.fontSize = '200%');
      // Scope enlarged-text checks to the changed controls, not unrelated support cards.
      const consentOverflow = await page.locator('[data-legal-consents]').evaluate(group => [group, ...group.querySelectorAll('*')].some(el => {
        const box = el.getBoundingClientRect();
        return box.width && (box.right > innerWidth + 1 || box.left < -1);
      }));
      assert.equal(consentOverflow, false, `${width}/${lang}: consent controls overflow`);
      assert.equal(await page.locator('[data-legal-consents]').evaluate(el => el.scrollWidth > el.clientWidth + 1), false, 'Consent text must wrap without clipping');
      if (width === 320 || width === 390 || width === 1280) {
        await page.locator('[data-legal-consents]').screenshot({ path: `/private/tmp/checkauto-legal-${lang}-${width}.png`, style: '.site-header, .skip-link { visibility: hidden !important; }' });
      }
      await submit.click();
      await page.locator('[data-contact-form-status].is-error').waitFor();
      assert.equal(submissions.length, 1);
      assert.equal(await early.isChecked(), true, 'Keep an explicit choice on retry');
      await submit.click();
      await page.getByText('LEGAL-TEST', { exact: true }).waitFor();
      assert.equal(submissions.length, 2);
      assert.deepEqual(submissions[0], submissions[1], 'Unchanged retry must retain operation ID and legal evidence');
      const payload = submissions[1];
      assert.equal(payload.earlyServiceConsent, true);
      assert.equal(payload.earlyServiceConsentTextVersion, version);
      assert.equal(payload.termsTextVersion, 'terms-2026-10-19');
      assert.equal(payload.privacyTextVersion, 'privacy-2026-10-19');
      assert.equal(payload.language, lang);
      assert.equal(payload.marketingConsent, false);
      assert.equal(await page.evaluate(() => window.checkautoConsent.preferencesAllowed()), false);
      assert.equal(await page.evaluate(() => localStorage.getItem('checkauto-lang')), null);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('checkauto-booking-operation')), null);
      assert.equal(await early.isChecked(), false, 'Successful submission resets the checkbox');
      await ctx.close();
    }
  }
  console.log('Passed: separate unchecked request, validation/focus, LT/EN wording archive, opt-out independence, retry evidence, reset, touch/keyboard, 320–1280px and 200% text.');

  const page = await browser.newPage();
  for (const lang of ['lt', 'en']) {
    await page.goto(base + '/privatumo-politika/');
    await language(page, lang);
    const policy = page.locator('.legal-document');
    const text = await policy.innerText();
    for (const removed of ['Hostinger', 'Google Search Console', 'DPA:', '4.6.', 'paslėpto apsaugos', 'hidden anti-automation', 'Atsarginės kopijos', 'Backups -', 'Administratoriaus pastabos', 'Administrator notes', 'Viešoje svetainėje nenaudojami', 'Server secret keys', 'pseudonimizavimas nėra', 'pseudonymization is not']) assert.equal(text.includes(removed), false, removed);
    assert.ok(text.includes(lang === 'lt' ? 'Techniniai saugumo įrašai - apie 25 valandas' : 'Technical security records - about 25 hours'));
    assert.ok(text.includes(lang === 'lt' ? 'paprastai 3 metus' : 'usually 3 years'));
    assert.ok(text.includes(lang === 'lt' ? 'Lankytojų IP adresai' : "Visitors' IP addresses"));
    assert.ok(text.includes(lang === 'lt' ? 'apsaugos priemones ir jų kopiją' : 'safeguards and a copy'));
    assert.deepEqual(await policy.locator('li strong').allTextContents(), ['Supabase', 'Resend', 'GitHub Pages', 'iCloud Mail']);
    assert.equal(await policy.locator('a[href^="https://"]').count(), 2, 'Only GitHub privacy and VDAI external links');
    assert.equal(await policy.locator('a[href="https://vdai.lrv.lt/"]').count(), 1);
    assert.ok((await policy.locator('.legal-meta').innerText()).includes('2026-10-19'));
    assert.ok(text.includes('privacy-2026-10-19'));
    await page.goto(base + '/taisykles-ir-salygos/');
    await language(page, lang);
    const terms = await page.locator('.legal-document').innerText();
    assert.ok(terms.includes('terms-2026-10-19'));
    assert.ok(terms.includes(lang === 'lt' ? 'iš anksto nepažymėtu' : 'initially unchecked'));
    assert.ok(terms.includes(lang === 'lt' ? 'visiškai suteikus paslaugą' : 'once the service is fully provided'));
  }
  assert.deepEqual(errors, []);
  console.log('Passed: approved privacy cleanup and withdrawal terms render consistently in LT and EN.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
