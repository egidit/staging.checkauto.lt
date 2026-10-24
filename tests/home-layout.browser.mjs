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
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const layout = await page.evaluate(() => {
        const stage = document.querySelector('.home-scope-stage').getBoundingClientRect();
        const copy = document.querySelector('.home-hero-copy').getBoundingClientRect();
        const art = document.querySelector('[data-hero-art]').getBoundingClientRect();
        const card = document.querySelector('[data-evidence]').getBoundingClientRect();
        const leader = document.querySelector('[data-leader]');
        return {
          heroCopyCentre: (copy.top + copy.bottom) / 2,
          heroArtCentre: (art.top + art.bottom) / 2,
          heroGapBelow: art.bottom - copy.bottom,
          cardTop: card.top - art.top,
          leaderShown: leader.classList.contains('is-ready'),
          leaderDotY: Number(leader.querySelector('circle').getAttribute('cy')),
          leaderEndY: Number(leader.querySelector('path').getAttribute('d').split('V').pop()),
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
      if (width >= 1000) {
        assert.ok(layout.evidenceBottom <= height, `${label}: odometer card below the first viewport`);
        assert.ok(Math.abs(layout.heroCopyCentre - layout.heroArtCentre) <= 40, `${label}: hero text not centred against the illustration`);
        assert.ok(layout.heroGapBelow <= 160, `${label}: large empty space under the hero text`);
        assert.ok(layout.leaderShown, `${label}: connector line hidden`);
        assert.ok(layout.cardTop - layout.leaderDotY >= 24, `${label}: odometer card covers the connector start`);
        assert.ok(Math.abs(layout.leaderEndY - layout.cardTop) < 1, `${label}: connector line does not reach the card`);
      }
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

  const caseMedia = await page.$$eval('[data-case-image]', items => items.map(item => {
    const box = item.getBoundingClientRect();
    return Math.round(box.width / box.height * 100) / 100;
  }));
  assert.deepEqual(caseMedia, [1.6, 1.6], 'Case photos use the gallery 8:5 frame');
  const passatZoom = page.locator('[data-case-zoom]').first();
  await passatZoom.scrollIntoViewIfNeeded();
  await page.locator('[data-case-image]').first().hover();
  await passatZoom.click();
  const lightbox = page.locator('.gallery-lightbox');
  assert.equal(await lightbox.isVisible(), true, 'Case photo opens the lightbox');
  assert.match(await lightbox.locator('img').getAttribute('src'), /home-case-passat\.webp$/);
  const frame = lightbox.locator('.gallery-lightbox-frame');
  await lightbox.locator('img').evaluate(img => img.complete || new Promise(resolve => img.addEventListener('load', resolve, { once: true })));
  const zoomState = () => lightbox.locator('img').evaluate(img => ({ transform: img.style.transform, origin: img.style.transformOrigin }));
  const frameBox = await frame.boundingBox();
  await page.mouse.click(frameBox.x + frameBox.width * 0.25, frameBox.y + frameBox.height * 0.25);
  const zoomedIn = await zoomState();
  assert.equal(zoomedIn.transform, 'scale(2.5)', 'Clicking the enlarged photo zooms in');
  assert.match(zoomedIn.origin, /^25(\.\d+)?% 25(\.\d+)?%$/, 'Zoom centres on the clicked point');
  await page.mouse.move(frameBox.x + frameBox.width * 0.5, frameBox.y + frameBox.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(frameBox.x + frameBox.width * 0.3, frameBox.y + frameBox.height * 0.3, { steps: 5 });
  await page.mouse.move(frameBox.x - 40, frameBox.y - 40, { steps: 5 });
  await page.mouse.up();
  const panned = await zoomState();
  assert.equal(panned.transform, 'scale(2.5)', 'Dragging keeps the zoom');
  assert.notEqual(panned.origin, zoomedIn.origin, 'Dragging pans the zoomed photo');
  assert.equal(await lightbox.isVisible(), true, 'Releasing a drag outside the photo keeps the lightbox open');
  await page.mouse.click(frameBox.x + frameBox.width * 0.5, frameBox.y + frameBox.height * 0.5);
  assert.equal((await zoomState()).transform, '', 'Clicking again zooms out');
  await page.keyboard.press('Escape');
  assert.equal(await lightbox.isHidden(), true, 'Escape closes the lightbox');
  assert.equal(await passatZoom.evaluate(el => el === document.activeElement), true, 'Focus returns to the zoom button');

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
    const steps = [...document.querySelectorAll('.home-steps li')];
    const centre = box => box.left + box.width / 2;
    return steps.slice(0, -1).map((step, index) => {
      const style = getComputedStyle(step, '::before');
      const stepBox = step.getBoundingClientRect();
      const left = stepBox.left + parseFloat(style.left);
      const top = stepBox.top + parseFloat(style.top);
      const bottom = top + parseFloat(style.height);
      const here = step.querySelector('img').getBoundingClientRect();
      const next = steps[index + 1].querySelector('img').getBoundingClientRect();
      const labels = Math.min(step.querySelector('span').getBoundingClientRect().top, steps[index + 1].querySelector('span').getBoundingClientRect().top);
      return {
        winding: style.backgroundImage.includes('journey-desktop-route'),
        joinsSteps: Math.abs(left - centre(here)) < 1 && Math.abs(left + parseFloat(style.width) - centre(next)) < 1,
        atIslands: top > here.top && bottom < here.bottom + 40,
        clearOfLabels: top + parseFloat(style.height) * 110 / 120 < labels,
      };
    });
  });
  assert.deepEqual(road, Array(2).fill({ winding: true, joinsSteps: true, atIslands: true, clearOfLabels: true }), 'Desktop: the road winds from each step to the next, clear of the labels');
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

  const gallery = JSON.parse(await fs.readFile(path.join(root, 'data/gallery.json'), 'utf8'));
  const template = gallery.items.find(item => item.id === 9);
  const extra = [
    { ...template, id: 101, odometer: { shown: 150000, actual: 330000 } },
    ...[102, 103, 104, 105].map(id => ({ ...gallery.items.find(item => item.id === 1), id, recommended: true })),
  ];
  const figuresFor = async (items, lang) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/data/gallery.json*', route => items
      ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...gallery, items }) })
      : route.abort());
    const loaded = page.waitForResponse('**/data/gallery.json*').catch(() => null);
    await page.goto(base + '/');
    await loaded;
    await page.evaluate(lang => window.checkautoI18n.setLanguage(lang), lang);
    await page.waitForTimeout(50);
    const figures = await page.evaluate(() => {
      const clean = value => value.replace(/\s+/g, ' ').trim();
      return {
        tally: [...document.querySelectorAll('.home-tally-grid > div')].map(item => {
          const value = item.querySelector('dd .visually-hidden') || item.querySelector('dd');
          return clean(value.textContent) + ' | ' + clean(item.querySelector('dt').textContent);
        }),
        shares: [...document.querySelectorAll('[data-gallery-share]')].map(item => item.style.getPropertyValue('--share')),
        link: clean(document.querySelector('[data-gallery-copy="casesLink"]').textContent),
        offer: clean(document.querySelector('[data-gallery-copy="offer"]').textContent),
        buttons: [...document.querySelectorAll('.home-evidence-buttons [data-case]')].map(button => clean(button.textContent)),
        pressed: document.querySelector('.home-evidence-buttons [aria-pressed="true"]').dataset.case,
        car: clean(document.querySelector('.home-evidence-case:not([hidden]) .home-evidence-car').textContent),
        label: clean(document.querySelector('.home-evidence-buttons [data-case]').getAttribute('aria-label')),
      };
    });
    await context.close();
    assert.deepEqual(errors, []);
    return figures;
  };

  const grown = await figuresFor([...gallery.items, ...extra], 'lt');
  assert.deepEqual(grown.tally, ['180 000 km | daugiausiai nuslėptos ridos', '21 | paskelbta patikra', '9 | kartus patarėme nepirkti', '5 | kartus radome atsuktą ridą'], 'Tally follows gallery.json with Lithuanian plural forms');
  assert.deepEqual(grown.shares, ['100%', '42.9%', '23.8%'], 'Tally bars show each count as a share of all inspections');
  assert.equal(grown.link, '21 atvejis galerijoje');
  assert.match(grown.offer, /iki 180 000 km\./);
  assert.deepEqual(grown.buttons, ['+180 000', '+126 000', '+104 000'], 'Hero shows the three largest rollbacks');
  assert.equal(grown.pressed, '101');
  assert.equal(grown.car, template.lt.title);
  assert.equal(grown.label, `${template.lt.title}: nuslėpta 180 000 km`);

  const grownEnglish = await figuresFor([...gallery.items, ...extra], 'en');
  assert.deepEqual(grownEnglish.tally, ['180,000 km | the most mileage hidden', '21 | published inspections', '9 | times we advised not to buy', '5 | rolled-back odometers found']);
  assert.equal(grownEnglish.link, 'All 21 cases in the gallery');
  assert.match(grownEnglish.offer, /up to 180,000 km\./);
  assert.equal(grownEnglish.label, `${template.en.title}: 180,000 km hidden`);

  const unavailable = await figuresFor(null, 'en');
  assert.deepEqual(unavailable.tally, ['126,000 km | the most mileage hidden', '16 | published inspections', '8 | times we advised not to buy', '4 | rolled-back odometers found'], 'HTML figures remain when gallery.json cannot load');
  assert.deepEqual(unavailable.shares, ['100%', '50%', '25%']);
  assert.deepEqual(unavailable.buttons, ['+126,000', '+104,000', '+38,000']);

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
