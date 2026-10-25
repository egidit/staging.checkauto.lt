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
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp' };
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const base = `http://127.0.0.1:${server.address().port}`;

const html = await fs.readFile(path.join(root, 'apie/index.html'), 'utf8');
const english = {};
for (const chunk of ['common', 'about']) Object.assign(english, JSON.parse(await fs.readFile(path.join(root, 'lang/en', chunk + '.json'), 'utf8')));
const resolve = key => key.split('.').reduce((value, part) => value && value[part], english);
const keys = [...new Set([...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map(match => match[1]))];
assert.deepEqual(keys.filter(key => typeof resolve(key) !== 'string'), [], 'Every about page key has an English translation');
for (const name of ['not_recommended_label', 'recommended_label']) {
  for (const form of ['one', 'other']) assert.equal(typeof resolve(`about.proof.${name}_${form}`), 'string', `English ${name}_${form}`);
}

const gallery = JSON.parse(await fs.readFile(path.join(root, 'data/gallery.json'), 'utf8'));

const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

/* A different gallery: the figures and their Lithuanian plural forms follow the data. */
const items = [
  ...Array.from({ length: 21 }, (_, index) => ({ ...gallery.items[0], id: 100 + index, recommended: false })),
  ...Array.from({ length: 2 }, (_, index) => ({ ...gallery.items[0], id: 200 + index, recommended: true })),
];
await page.route('**/data/gallery.json*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...gallery, items }) }));
const loaded = page.waitForResponse('**/data/gallery.json*');
await page.goto(base + '/apie/');
await loaded;
await page.locator('[data-consent-reject]').click();
const proof = () => page.evaluate(() => [...document.querySelectorAll('.about-proof .home-tally-stat')]
  .map(stat => `${stat.querySelector('dd').textContent} | ${stat.querySelector('dt').textContent}`));
await page.waitForFunction(() => document.querySelector('[data-about-figure="notRecommended"]').textContent === '21');
assert.deepEqual(await proof(), ['21 | kartą patarėme nepirkti', '2 | kartus patarėme pirkti']);
await page.evaluate(() => window.checkautoI18n.setLanguage('en'));
await page.waitForFunction(() => document.documentElement.lang === 'en' && /times/.test(document.querySelector('[data-about-copy="recommended"]').textContent));
assert.deepEqual(await proof(), ['21 | times we advised not to buy', '2 | times we advised to buy']);

for (const lang of ['lt', 'en']) {
  await page.evaluate(lang => window.checkautoI18n.setLanguage(lang), lang);
  for (const [width, height] of [[320, 640], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      values: [...document.querySelectorAll('.about-value')].map(card => Math.round(card.getBoundingClientRect().top)),
    }));
    assert.equal(layout.overflow, false, `No horizontal scroll at ${width}px (${lang})`);
    const sameRow = new Set(layout.values).size === 1;
    assert.equal(sameRow, width >= 900, `Value panels ${width >= 900 ? 'share a row' : 'stack'} at ${width}px`);
  }
}

assert.deepEqual(errors, []);
await browser.close();
server.close();
console.log('Passed: about page translations, gallery-driven verdict counts with plural forms, 320–1440px LT/EN without overflow.');
