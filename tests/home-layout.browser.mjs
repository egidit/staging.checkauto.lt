import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import(process.env.CHECKAUTO_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const server = http.createServer(async (req, res) => {
  try {
    let pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.endsWith('/')) pathname += 'index.html';
    const filename = path.resolve(root, '.' + pathname);
    if (!filename.startsWith(root)) throw new Error('Outside root');
    const data = await fs.readFile(filename);
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const base = `http://127.0.0.1:${server.address().port}`;

const text = value => value.replace(/\s+/g, ' ').trim();

async function translationKeys() {
  const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  const keys = new Set([...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map(match => match[1]));
  const english = {};
  for (const chunk of ['common', 'home']) Object.assign(english, JSON.parse(await fs.readFile(path.join(root, 'lang/en', chunk + '.json'), 'utf8')));
  const resolve = key => key.split('.').reduce((value, part) => value && value[part], english);
  return [...keys].filter(key => typeof resolve(key) !== 'string');
}

async function openHome(options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/');
  await page.evaluate(() => document.fonts.ready);
  return { context, page, errors };
}

try {
  assert.deepEqual(await translationKeys(), [], 'Every homepage key has an English translation');

  const { context, page, errors } = await openHome();
  await page.locator('[data-consent-reject]').click();

  for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    for (const lang of ['lt', 'en']) {
      await page.evaluate(lang => window.checkautoI18n.setLanguage(lang), lang);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const layout = await page.evaluate(() => {
        const stage = document.querySelector('.home-scope-stage').getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          titleBottom: document.querySelector('#home-title').getBoundingClientRect().bottom,
          ctaBottom: document.querySelector('[data-hero-actions] .btn-primary').getBoundingClientRect().bottom,
          ctaTop: document.querySelector('[data-hero-actions]').getBoundingClientRect().top,
          evidenceBottom: document.querySelector('[data-evidence]').getBoundingClientRect().bottom,
          spotsInside: [...document.querySelectorAll('.home-scope-stage > .home-spot')].every(spot => {
            const box = spot.getBoundingClientRect();
            const x = box.left + box.width / 2;
            const y = box.top + box.height / 2;
            return x >= stage.left && x <= stage.right && y >= stage.top && y <= stage.bottom;
          }),
        };
      });
      const label = `${width}px/${lang}`;
      assert.equal(layout.overflow, false, `${label}: horizontal overflow`);
      assert.ok(layout.spotsInside, `${label}: hotspots outside the illustration`);
      if (width !== 768) assert.ok(layout.titleBottom <= height, `${label}: headline below the first viewport`);
      if (width < 700) assert.ok(layout.ctaTop >= layout.evidenceBottom, `${label}: booking buttons above the odometer evidence`);
      else if (width !== 768) assert.ok(layout.ctaBottom <= height, `${label}: booking button below the first viewport`);
    }
  }

  await page.evaluate(() => window.checkautoI18n.setLanguage('lt'));
  await page.locator('[data-case="3"]').click();
  assert.equal(await page.locator('[data-case="3"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-case="9"]').getAttribute('aria-pressed'), 'false');
  assert.equal(text(await page.locator('[data-odo="shown"] .visually-hidden').textContent()), '215 000 km');
  assert.equal(text(await page.locator('[data-odo="actual"] .visually-hidden').textContent()), '319 000 km');
  assert.equal(text(await page.locator('[data-odo="delta"]').textContent()), '+104 000 km');
  assert.equal(await page.locator('[data-evidence-case="3"]').isVisible(), true);
  assert.equal(await page.locator('[data-evidence-case="9"]').isHidden(), true);

  await page.evaluate(() => window.checkautoI18n.setLanguage('en'));
  assert.equal(text(await page.locator('[data-odo="delta"]').textContent()), '+104,000 km');
  assert.equal(text(await page.locator('[data-case="12"]').textContent()), '+38,000');

  await page.locator('.home-scope-list li[data-spot="electronics"]').hover();
  assert.equal(await page.locator('.home-scope-stage > [data-spot="electronics"]').evaluate(el => el.classList.contains('is-active')), true);
  assert.equal(await page.locator('.home-scope-stage > [data-spot="body"]').evaluate(el => el.classList.contains('is-active')), false);

  await page.locator('[data-price-input]').fill('20000');
  assert.equal(text(await page.locator('[data-price-share]').textContent()), '0.500%');
  await page.locator('[data-price-input]').fill('59500');
  assert.equal(text(await page.locator('[data-price-share]').textContent()), '0.168%');
  await page.locator('[data-price-input]').fill('60000');
  assert.equal(text(await page.locator('[data-price-share]').textContent()), '0.167%', 'Share keeps changing at the top of the range');

  const road = await page.evaluate(() => {
    const line = document.querySelector('.home-route-line');
    const box = line.getBoundingClientRect();
    return {
      shown: getComputedStyle(line).display !== 'none',
      onRoad: [...document.querySelectorAll('.home-steps img')].every(img => {
        const step = img.getBoundingClientRect();
        return step.top < box.bottom && step.bottom > box.top;
      }),
    };
  });
  assert.ok(road.shown, 'Desktop: winding road shown');
  assert.ok(road.onRoad, 'Desktop: every step sits on the road');
  assert.deepEqual(errors, []);
  await context.close();

  const reduced = await openHome({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const strip = await reduced.page.evaluate(() => {
    const first = document.querySelector('[data-odo="actual"] .home-odo-strip');
    return {
      rolling: document.querySelector('[data-evidence]').classList.contains('is-rolling'),
      digit: first.style.getPropertyValue('--digit'),
      offset: new DOMMatrix(getComputedStyle(first).transform).m42,
      cell: first.parentElement.getBoundingClientRect().height,
    };
  });
  assert.equal(strip.rolling, false, 'Reduced motion: no rolling state');
  assert.equal(strip.digit, '3');
  assert.ok(Math.abs(strip.offset + 3 * strip.cell) < 1, 'Reduced motion: final digit shown immediately');
  assert.deepEqual(reduced.errors, []);
  await reduced.context.close();

  const mobile = await openHome({ viewport: { width: 390, height: 844 } });
  const sticky = mobile.page.locator('[data-sticky-cta]');
  await mobile.page.locator('.home-cases').scrollIntoViewIfNeeded();
  await mobile.page.waitForTimeout(100);
  assert.equal(await sticky.evaluate(el => el.classList.contains('is-visible')), false, 'Booking bar hidden while the cookie banner is open');
  await mobile.page.locator('[data-consent-reject]').click();
  await mobile.page.waitForTimeout(100);
  assert.equal(await sticky.evaluate(el => el.classList.contains('is-visible')), true, 'Booking bar shown between hero and final CTA');
  await mobile.page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await mobile.page.waitForTimeout(100);
  assert.equal(await sticky.evaluate(el => el.classList.contains('is-visible')), false, 'Booking bar hidden at the final CTA');
  await mobile.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await mobile.page.waitForTimeout(100);
  assert.equal(await sticky.evaluate(el => el.classList.contains('is-visible')), false, 'Booking bar hidden in the hero');
  const mobileRoad = await mobile.page.$$eval('.home-steps li', steps => steps.map(step => getComputedStyle(step, '::before').backgroundImage.includes('journey-mobile-route')));
  assert.deepEqual(mobileRoad, [true, true, false], 'Mobile: road links each step to the next');
  assert.deepEqual(mobile.errors, []);
  await mobile.context.close();

  console.log('Passed: homepage layout 390–1440px LT/EN, evidence cases, hotspots, price share, step road, reduced motion, booking bar.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
