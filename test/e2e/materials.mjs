// Browser acceptance test for stage 04 (material selection and AI references), on the
// built page dist/site/index.html:
//
//   a kitchen-living room → choose a specific floor, wall colour and countertop in the
//   picker (with filters) → the project stores the three product ids → the room's board
//   shows them with their provenance → the exported reference package carries them →
//   changing the floor changes only the floor → the estimate equals the core calculation.
//
// Needs Playwright with Chromium (not a dependency of this project):
//   npm run build && node test/e2e/materials.mjs [screenshot folder]
// Offline: BINA_LIBS=<folder with three/build/three.min.js> (fonts are then skipped).
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { emptyProject, makeRoom } from '../../src/core/model.js';
import { rectPoints } from '../../src/core/geometry.js';
import { computeEstimate } from '../../src/core/quantities.js';
import { migrateProject } from '../../src/core/model.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const OUT = resolve(process.argv[2] || join(ROOT, 'e2e-shots'));
const LIBS = process.env.BINA_LIBS;
mkdirSync(OUT, { recursive: true });
const PAGE = readFileSync(join(ROOT, 'dist/site/index.html'), 'utf8');
const URL0 = 'http://bina.test/';

async function route(r) {
  const url = r.request().url();
  if (url.startsWith(URL0)) return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE });
  if (LIBS) {
    const file = url.includes('/three.js/r128/three.min.js') ? join(LIBS, 'three/build/three.min.js') : null;
    if (file && existsSync(file)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(file) });
    if (!url.startsWith('data:') && !url.startsWith('blob:')) return r.abort();
  }
  return r.continue();
}

function seedProject() {
  const p = emptyProject();
  p.name = 'მასალების ტესტი';
  p.style = 'modern';
  p.tier = 'mid';
  p.rooms = [
    makeRoom(rectPoints(0, 0, 5, 4), 'kitchenLiving', { id: 'k' }),
    makeRoom(rectPoints(5.12, 0, 9.12, 3), 'bedroom', { id: 'b' }),
  ];
  return p;
}

const saved = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('bina-designer:project:v1') || 'null'));
const settle = (pg, ms = 450) => pg.waitForTimeout(ms);
const errors = [];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

async function newPage(opts) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, acceptDownloads: true, ...opts });
  await ctx.route('**/*', route);
  await ctx.addInitScript((proj) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('bina-designer:welcomed:v1', '1');
    localStorage.setItem('bina-designer:project:v1', proj);
  }, JSON.stringify(seedProject()));
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return pg;
}

// Opens the picker of a surface in a room, narrows it to "only this room", and picks the
// product whose card contains `name`.
async function choose(pg, roomId, surfaceLabel, name, { verifiedOnly = false } = {}) {
  await pg.locator(`.room-sec[data-room="${roomId}"] .mat-row`).filter({ hasText: surfaceLabel }).first().click();
  await pg.waitForSelector('#picker[open]');
  await pg.locator('#picker .seg-btn').filter({ hasText: 'მხოლოდ:' }).click();
  if (verifiedOnly) await pg.locator('#picker .filters input[type=checkbox]').check();
  const card = pg.locator('#picker .pick-card').filter({ hasText: name });
  assert.equal(await card.count(), 1, `one card for ${name}`);
  await card.locator('.pick-main').click();
  await settle(pg);
}

async function exportPackage(pg) {
  const [dl] = await Promise.all([
    pg.waitForEvent('download'),
    pg.locator('dialog.board[open] .btn-accent').click(),
  ]);
  return JSON.parse(readFileSync(await dl.path(), 'utf8'));
}

const report = {};

// ------------------------------------------------------------------ desktop
{
  const pg = await newPage({ viewport: { width: 1280, height: 860 } });
  await pg.goto(`${URL0}#materials`);
  await pg.waitForSelector('.room-sec[data-room="k"]');

  // the filters work: verified-only floor list holds only verified products
  await pg.locator('.room-sec[data-room="k"] .mat-row').filter({ hasText: 'იატაკი' }).first().click();
  await pg.locator('#picker .filters input[type=checkbox]').check();
  const badges = await pg.locator('#picker .pick-card .badge').allTextContents();
  assert.ok(badges.length > 0 && badges.every((t) => t.startsWith('გადამოწმებული')), `verified only: ${badges}`);
  await pg.screenshot({ path: join(OUT, 'm1-picker-verified.png') });
  await pg.locator('#picker .filters input[type=checkbox]').uncheck();
  await pg.keyboard.press('Escape');

  await choose(pg, 'k', 'იატაკი', 'KT502', { verifiedOnly: true });
  await choose(pg, 'k', 'კედლები', 'სალბისფერი');
  await choose(pg, 'k', 'სამუშაო ზედაპირი', 'Calacatta');
  let p = await saved(pg);
  assert.deepEqual(p.finish.rooms.k, { floor: 'lam_kt502', walls: 'paint_mid_sage', countertop: 'st_calacatta' });
  report.storedIds = p.finish.rooms.k;

  // the board of the room
  await pg.locator('.room-sec[data-room="k"] .board-btn').click();
  await pg.waitForSelector('dialog.board[open]');
  const names = await pg.locator('dialog.board .board-card h3').allTextContents();
  for (const n of ['KT502', 'სალბისფერი', 'Calacatta']) assert.ok(names.some((x) => x.includes(n)), `board shows ${n}`);
  const kinds = await pg.locator('dialog.board .badge').allTextContents();
  assert.ok(kinds.some((t) => t.includes('დიზაინის არჩევანი')), 'cabinet fronts are shown as a preference');
  assert.ok(kinds.some((t) => t.includes('მიახლოებითი ნიმუში')), 'products are shown with an approximate sample');
  await pg.screenshot({ path: join(OUT, 'm2-board.png') });

  // walls become flexible for the renderer
  await pg.locator('dialog.board .board-card').filter({ hasText: 'სალბისფერი' }).locator('input[type=checkbox]').uncheck();
  await settle(pg);
  p = await saved(pg);
  assert.deepEqual(p.finish.refs['k|walls'], { mandatory: false });

  const pkg1 = await exportPackage(pg);
  const r1 = Object.fromEntries(pkg1.references.map((r) => [r.key, r]));
  assert.equal(pkg1.format, 'bina.material-references');
  assert.equal(r1['k|floor'].materialId, 'lam_kt502');
  assert.equal(r1['k|walls'].materialId, 'paint_mid_sage');
  assert.equal(r1['k|countertop'].materialId, 'st_calacatta');
  assert.equal(r1['k|walls'].mandatory, false);
  assert.equal(r1['k|floor'].mandatory, true);
  assert.equal(r1['k|floor'].identity.verification, 'verified');

  // change only the floor, from the board
  await pg.locator('dialog.board .board-card').filter({ hasText: 'KT502' }).getByRole('button', { name: 'შეცვლა' }).click();
  await pg.waitForSelector('#picker[open]');
  await pg.locator('#picker .seg-btn').filter({ hasText: 'მხოლოდ:' }).click();
  await pg.locator('#picker .pick-card').filter({ hasText: 'SE002' }).locator('.pick-main').click();
  await settle(pg);
  p = await saved(pg);
  assert.deepEqual(p.finish.rooms.k, { floor: 'lam_se002', walls: 'paint_mid_sage', countertop: 'st_calacatta' });

  await pg.locator('.room-sec[data-room="k"] .board-btn').click();
  const pkg2 = await exportPackage(pg);
  const r2 = Object.fromEntries(pkg2.references.map((r) => [r.key, r]));
  for (const key of Object.keys(r1)) {
    if (key === 'k|floor') continue;
    assert.deepEqual(r2[key], r1[key], `${key} unchanged`);
  }
  assert.equal(r2['k|floor'].materialId, 'lam_se002');
  await pg.keyboard.press('Escape');

  // the estimate on screen equals the core calculation for the saved project
  await pg.click('a[data-step=estimate]');
  await pg.waitForSelector('.est-total .total');
  const shown = Number((await pg.textContent('.est-total .total')).replace(/[^\d]/g, ''));
  const expected = Math.round(computeEstimate(migrateProject(p)).total);
  assert.equal(shown, expected, 'estimate on screen');
  report.estimate = shown;
  const rowsWithBadge = await pg.locator('.est-table .cell-name + .cell-spec ~ .prov').count();
  assert.ok(rowsWithBadge > 5, 'purchase lines show their provenance');
  await pg.screenshot({ path: join(OUT, 'm3-estimate.png'), fullPage: true });
  await pg.context().close();
}

// ------------------------------------------------------------------ phone
{
  const pg = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await pg.goto(`${URL0}#materials`);
  await pg.waitForSelector('.room-sec[data-room="k"]');
  await choose(pg, 'k', 'კარადის ფასადები', 'კაკლის');
  let p = await saved(pg);
  assert.equal(p.finish.rooms.k.cabinet, 'cf_walnut');
  await pg.locator('.room-sec[data-room="k"] .board-btn').click();
  await pg.waitForSelector('dialog.board[open]');
  await pg.screenshot({ path: join(OUT, 'm4-board-phone.png') });
  const sw = await pg.evaluate(() => document.querySelector('dialog.board').scrollWidth - document.querySelector('dialog.board').clientWidth);
  assert.ok(sw <= 1, 'board fits the phone width');
  await pg.context().close();
}

await browser.close();
assert.deepEqual(errors, [], errors.join('\n'));
console.log(JSON.stringify({ ok: true, ...report }, null, 2));
