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
          spotsOnImage: (() => {
            const image = document.querySelector('.home-scope-stage img').getBoundingClientRect();
            return [...document.querySelectorAll('.home-scope-stage > .home-spot')].every(spot => {
              const box = spot.getBoundingClientRect();
              const x = (box.left + box.width / 2 - image.left) / image.width * 100;
              const y = (box.top + box.height / 2 - image.top) / image.height * 100;
              return Math.abs(x - parseFloat(spot.style.getPropertyValue('--x'))) < 0.5 && Math.abs(y - parseFloat(spot.style.getPropertyValue('--y'))) < 0.5;
            });
          })(),
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
      assert.ok(layout.spotsOnImage, `${label}: hotspots drift from their place on the illustration`);
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
  assert.equal(text(await page.locator('[data-case="3"]').textContent()), '+104 000');
  assert.equal(await page.locator('[data-evidence-case="3"]').isVisible(), true);
  assert.equal(await page.locator('[data-evidence-case="9"]').isHidden(), true);

  await page.evaluate(() => window.checkautoI18n.setLanguage('en'));
  assert.equal(text(await page.locator('[data-case="3"]').textContent()), '+104,000');
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

  const tip = id => page.locator(`#home-scope-tip-${id}`);
  await page.locator('#home-spot-electronics').hover();
  assert.equal(await tip('electronics').isVisible(), true, 'Hovering a hotspot opens its popover');
  assert.equal(await page.locator('#home-spot-electronics').getAttribute('aria-expanded'), 'true');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  assert.equal(await tip('electronics').isHidden(), true, 'Moving the mouse away closes the popover');
  await page.locator('#home-spot-drive').click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  assert.equal(await tip('drive').isVisible(), true, 'A click keeps the popover open');
  await page.keyboard.press('Escape');
  assert.equal(await tip('drive').isHidden(), true, 'Escape closes the popover');
  await page.locator('#home-spot-body').hover();
  const driveBox = await page.locator('#home-spot-drive').boundingBox();
  await page.mouse.move(driveBox.x + driveBox.width / 2, driveBox.y + driveBox.height / 2);
  assert.equal(await tip('drive').isVisible(), true, 'Hovering a dot under a hover popover switches to it');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  await page.locator('#home-spot-body').click();
  await page.mouse.move(0, 0);
  await page.locator('#home-spot-mechanics').click();
  assert.equal(await tip('mechanics').isVisible(), true, 'Clicking another hotspot switches the popover');
  await page.keyboard.press('Escape');
  await page.locator('#home-spot-drive').click();
  assert.equal(await tip('drive').isVisible(), true, 'Clicking another hotspot switches the popover');
  assert.equal(await tip('body').isHidden(), true);
  await page.locator('#home-spot-drive').focus();
  await page.keyboard.press('Tab');
  assert.equal(await tip('drive').isHidden(), true, 'Tabbing to the next hotspot closes the popover');

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
    ...[102, 103, 104].map(id => ({ ...gallery.items.find(item => item.id === 1), id, recommended: true })),
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
        link: clean(document.querySelector('[data-gallery-copy="casesLink"]').textContent),
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
  assert.deepEqual(grown.tally, ['180 000 km | daugiausiai nuslėptos ridos', '31 | paskelbta patikra', '16 | kartų patarėme nepirkti', '5 | kartus radome atsuktą ridą'], 'Tally follows gallery.json with Lithuanian plural forms');
  assert.equal(grown.link, '31 atvejis galerijoje');
  assert.deepEqual(grown.buttons, ['+180 000', '+126 000', '+104 000'], 'Hero shows the three largest rollbacks');
  assert.equal(grown.pressed, '101');
  assert.equal(grown.car, template.lt.title);
  assert.equal(grown.label, `${template.lt.title}: nuslėpta 180 000 km`);

  const grownEnglish = await figuresFor([...gallery.items, ...extra], 'en');
  assert.deepEqual(grownEnglish.tally, ['180,000 km | the most mileage hidden', '31 | published inspections', '16 | times we advised not to buy', '5 | rolled-back odometers found']);
  assert.equal(grownEnglish.link, 'All 31 cases in the gallery');
  assert.equal(grownEnglish.label, `${template.en.title}: 180,000 km hidden`);

  const unavailable = await figuresFor(null, 'en');
  assert.deepEqual(unavailable.tally, ['126,000 km | the most mileage hidden', '27 | published inspections', '15 | times we advised not to buy', '4 | rolled-back odometers found'], 'HTML figures remain when gallery.json cannot load');
  assert.deepEqual(unavailable.buttons, ['+126,000', '+104,000', '+38,000']);

  const touch = await openHome({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await touch.page.locator('[data-consent-reject]').click();
  const touchTip = touch.page.locator('#home-scope-tip-mechanics');
  const isOpen = () => touchTip.evaluate(el => !el.hidden);
  await touch.page.locator('#home-spot-mechanics').tap();
  assert.equal(await isOpen(), true, 'Tapping a hotspot opens its popover');
  const tipBox = await touchTip.boundingBox();
  assert.ok(tipBox.x >= 0 && tipBox.x + tipBox.width <= 390, 'Popover stays on screen');
  await touch.page.touchscreen.tap(tipBox.x + tipBox.width / 2, tipBox.y + tipBox.height / 2);
  assert.equal(await isOpen(), true, 'Tapping inside the popover keeps it open');
  await touch.page.locator('#home-spot-mechanics').tap();
  assert.equal(await isOpen(), true, 'Tapping the open hotspot again keeps the popover open');
  const cdp = await touch.context.newCDPSession(touch.page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tipBox.x + 20, y: tipBox.y + 20 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 4, y: tipBox.y + 20 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.equal(await isOpen(), true, 'Pressing inside and releasing outside keeps the popover open');
  await touch.page.touchscreen.tap(4, tipBox.y + tipBox.height + 40);
  assert.equal(await isOpen(), false, 'Tapping outside closes the popover');
  for (const block of ['start', 'end']) {
    await touch.page.locator('.home-scope-stage').evaluate((stage, block) => stage.scrollIntoView({ block, behavior: 'instant' }), block);
    await touch.page.waitForTimeout(100);
    for (const id of ['body', 'mechanics', 'electronics', 'drive', 'report']) {
      const clear = await touch.page.evaluate(id => {
        const button = document.querySelector(`[data-spot="${id}"]`);
        const headerBottom = document.querySelector('.site-header').getBoundingClientRect().bottom;
        const bar = document.querySelector('[data-sticky-cta]');
        const barTop = bar.classList.contains('is-visible') ? bar.getBoundingClientRect().top : innerHeight;
        const spot = button.getBoundingClientRect();
        if (spot.top < headerBottom || spot.bottom > barTop) return true;
        button.click();
        const box = document.getElementById(`home-scope-tip-${id}`).getBoundingClientRect();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return box.top >= headerBottom - 1 && box.bottom <= barTop + 1;
      }, id);
      assert.ok(clear, `Popover ${id} opens clear of the header and booking bar (illustration at ${block})`);
    }
  }
  assert.deepEqual(touch.errors, []);
  await touch.context.close();

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
