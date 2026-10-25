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

async function geometry(page) {
  return page.evaluate(() => {
    const box = el => {
      const { x, width } = el.getBoundingClientRect();
      return { x, width };
    };
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      groups: [...document.querySelectorAll('.faq-group')].map(group => ({
        heading: box(group),
        list: box(group.querySelector('.faq-list')),
        rows: [...group.querySelectorAll('details, summary')].map(box),
      })),
    };
  });
}

function assertStable(expected, actual, label) {
  assert.equal(actual.overflow, false, `${label}: horizontal overflow`);
  for (let i = 0; i < expected.groups.length; i++) {
    const before = expected.groups[i];
    const after = actual.groups[i];
    for (const key of ['heading', 'list']) {
      assert.ok(Math.abs(before[key].x - after[key].x) < 1, `${label}: ${key} shifted`);
      assert.ok(Math.abs(before[key].width - after[key].width) < 1, `${label}: ${key} resized`);
    }
    for (let j = 0; j < before.rows.length; j++) {
      assert.ok(Math.abs(before.rows[j].x - after.rows[j].x) < 1, `${label}: row shifted`);
      assert.ok(Math.abs(before.rows[j].width - after.rows[j].width) < 1, `${label}: row resized`);
    }
  }
}

try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ hasTouch: touch });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/duk/');
    await page.locator('[data-consent-reject]').click();
    await page.evaluate(() => document.fonts.ready);
    for (const width of touch ? [390] : [320, 390, 640, 768, 1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      for (const lang of ['lt', 'en']) {
        await page.evaluate(lang => window.checkautoI18n.setLanguage(lang), lang);
        const collapsed = await geometry(page);
        for (const group of collapsed.groups) {
          assert.ok(Math.abs(group.list.x - group.heading.x - 8) < 1, 'Questions sit inside the topic panel');
          assert.ok(Math.abs(group.heading.width - group.list.width - 16) < 1, 'Questions fill the topic panel');
          if (width >= 1024) assert.equal(group.heading.width, 768, 'Full desktop FAQ width');
        }
        const summaries = page.locator('.faq-item summary');
        const screenshot = !touch && width === 1280 && lang === 'lt' && process.env.CHECKAUTO_FAQ_SCREENSHOTS;
        const screenshotStyle = '.site-header { visibility: hidden !important; }';
        if (screenshot) await page.locator('.faq-group').first().screenshot({ path: '/private/tmp/checkauto-faq-collapsed.png', style: screenshotStyle });
        for (let i = 0; i < await summaries.count(); i++) {
          const summary = summaries.nth(i);
          if (touch) await summary.tap(); else await summary.click();
          assert.equal(await summary.evaluate(el => el.parentElement.open), true);
          assertStable(collapsed, await geometry(page), `${width}/${lang}/${i} expanded`);
          if (screenshot && i === 0) await page.locator('.faq-group').first().screenshot({ path: '/private/tmp/checkauto-faq-expanded.png', style: screenshotStyle });
          if (touch) await summary.tap(); else await summary.click();
          assertStable(collapsed, await geometry(page), `${width}/${lang}/${i} collapsed`);
        }
        await page.evaluate(() => document.querySelectorAll('.faq-item').forEach(item => item.open = true));
        assertStable(collapsed, await geometry(page), `${width}/${lang} all expanded`);
        await page.evaluate(() => document.querySelectorAll('.faq-item').forEach(item => item.open = false));
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => document.documentElement.style.fontSize = '200%');
    const enlarged = await geometry(page);
    await page.locator('.faq-item summary').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.faq-item').first().evaluate(el => el.open), true);
    assertStable(enlarged, await geometry(page), '200% text / keyboard expanded');
    await page.keyboard.press('Enter');
    assertStable(enlarged, await geometry(page), '200% text / keyboard collapsed');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Passed: all FAQ widths unchanged on expand/collapse, 320–1920px, LT/EN, pointer/touch/keyboard, 200% text.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
