import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const data = JSON.parse(await fs.readFile(path.join(root, 'data/gallery.json'), 'utf8'));
const html = await fs.readFile(path.join(root, 'index.html'), 'utf8');

const CATEGORIES = ['body', 'engine', 'mileage', 'electrical'];
const TEXT_FIELDS = ['tag', 'title', 'seller', 'found', 'verdict'];
const isKilometres = value => Number.isInteger(value) && value > 0;

assert.ok(Array.isArray(data.items) && data.items.length, 'gallery.json has no "items" list');

const errors = [];
const ids = new Set();
for (const [index, item] of data.items.entries()) {
  const name = `Entry ${index + 1} (id ${item.id})`;
  if (!Number.isInteger(item.id)) errors.push(`${name}: "id" must be a whole number without quotes`);
  else if (ids.has(item.id)) errors.push(`${name}: "id" ${item.id} is used more than once`);
  ids.add(item.id);
  if (!CATEGORIES.includes(item.category)) errors.push(`${name}: "category" must be one of ${CATEGORIES.join(', ')}`);
  if (typeof item.recommended !== 'boolean') errors.push(`${name}: "recommended" must be true or false without quotes`);
  for (const lang of ['lt', 'en']) {
    for (const field of TEXT_FIELDS) {
      if (typeof item[lang]?.[field] !== 'string' || !item[lang][field].trim()) errors.push(`${name}: "${lang}.${field}" is missing`);
    }
  }

  const odometer = item.odometer;
  if (item.category === 'mileage' && !odometer) {
    errors.push(`${name}: mileage cases need "odometer": { "shown": …, "actual": … } (use "shown": null if the dashboard reading is unknown)`);
  }
  if (odometer) {
    if (item.category !== 'mileage') errors.push(`${name}: "odometer" belongs only on "mileage" cases`);
    if (!Object.hasOwn(odometer, 'shown')) errors.push(`${name}: "odometer.shown" is missing; write "shown": null if the dashboard reading is unknown`);
    else if (odometer.shown !== null && !isKilometres(odometer.shown)) errors.push(`${name}: "odometer.shown" must be a whole number of km without quotes or spaces, or null`);
    if (!isKilometres(odometer.actual)) errors.push(`${name}: "odometer.actual" must be a whole number of km without quotes or spaces`);
    if (isKilometres(odometer.shown) && isKilometres(odometer.actual) && odometer.actual <= odometer.shown) {
      errors.push(`${name}: "odometer.actual" (${odometer.actual}) must be larger than "odometer.shown" (${odometer.shown})`);
    }
  }
}
assert.deepEqual(errors, [], 'gallery.json has errors:\n  ' + errors.join('\n  '));

/* The same figures js/home.js computes; index.html keeps them as the no-JavaScript fallback. */
const rollbacks = data.items.filter(item => item.category === 'mileage');
const measured = rollbacks
  .filter(item => isKilometres(item.odometer.shown))
  .map(item => ({ id: item.id, shown: item.odometer.shown, actual: item.odometer.actual, hidden: item.odometer.actual - item.odometer.shown }))
  .sort((a, b) => b.hidden - a.hidden || a.id - b.id);
const expected = {
  total: data.items.length,
  notRecommended: data.items.filter(item => item.recommended === false).length,
  rollbacks: rollbacks.length,
  maxHidden: measured[0]?.hidden,
};

const fallback = Object.fromEntries([...html.matchAll(/data-gallery-figure="(\w+)">([^<]*)</g)]
  .map(([, key, value]) => [key, Number(value.replace(/\D/g, ''))]));
for (const [key, value] of Object.entries(expected)) {
  if (value === undefined) continue;
  assert.equal(fallback[key], value, `index.html shows ${fallback[key]} for "${key}" but gallery.json gives ${value}; update the number in index.html`);
}

const fallbackShares = Object.fromEntries([...html.matchAll(/data-gallery-share="(\w+)" style="--share: ([\d.]+)%"/g)]
  .map(([, key, value]) => [key, Number(value)]));
for (const [key, value] of Object.entries(fallbackShares)) {
  const share = Math.round(expected[key] / expected.total * 1000) / 10;
  assert.equal(value, share, `index.html draws the "${key}" bar at ${value}% but gallery.json gives ${share}%; update --share in index.html`);
}

const fallbackCases = [...html.matchAll(/data-case="(\d+)" data-shown="(\d+)" data-actual="(\d+)"/g)]
  .map(([, id, shown, actual]) => ({ id: Number(id), shown: Number(shown), actual: Number(actual) }));
assert.deepEqual(fallbackCases, measured.slice(0, 3).map(({ id, shown, actual }) => ({ id, shown, actual })),
  'The hero odometer cases in index.html differ from the three largest rollbacks in gallery.json; update the buttons in index.html');

console.log(`Passed: ${data.items.length} gallery entries valid; homepage fallback figures ${JSON.stringify(expected)} and hero cases match gallery.json.`);
