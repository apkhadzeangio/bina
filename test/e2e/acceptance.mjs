// Browser acceptance test for the furniture sketch (stage 03), on the built page
// dist/site/index.html, with a mouse on a desktop screen and with touch on a phone:
//
//   draw a 4 × 5 m bedroom → add a 160 × 200 cm bed and a wardrobe → move and rotate
//   them → open the 3D view → reload → the arrangement is still there.
//
// Needs Playwright with Chromium (not a dependency of this project):
//   npm run build && node test/e2e/acceptance.mjs [screenshot folder]
// three.js and the fonts come from their CDNs. Without internet, point BINA_LIBS at a
// node_modules folder holding three@0.128.0, pdfjs-dist@3.11.174 and the @fontsource
// fonts, and they are served from there.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

// require() also finds a globally installed Playwright (NODE_PATH), which import does not.
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const OUT = resolve(process.argv[2] || join(ROOT, 'e2e-shots'));
const LIBS = process.env.BINA_LIBS || join(ROOT, 'node_modules');
mkdirSync(OUT, { recursive: true });
const PAGE = readFileSync(join(ROOT, 'dist/site/index.html'), 'utf8');
const URL0 = 'http://bina.test/';

function fontCss() {
  const geo = 'U+0589,U+10A0-10FF,U+1C90-1CBA,U+1CBD-1CBF,U+2D00-2D2F';
  const lat = 'U+0000-00FF,U+2000-206F,U+20AC,U+20BE,U+2212';
  const face = (fam, w, file, range) => `@font-face{font-family:'${fam}';font-weight:${w};src:url(https://fonts.gstatic.com/local/${file}) format('woff2');unicode-range:${range};}`;
  const out = [];
  for (const w of [400, 500, 600, 700]) {
    out.push(face('Noto Sans Georgian', w, `@fontsource/noto-sans-georgian/files/noto-sans-georgian-georgian-${w}-normal.woff2`, geo));
    if (w < 700) out.push(face('Noto Sans Georgian', w, `@fontsource/noto-sans-georgian/files/noto-sans-georgian-latin-${w}-normal.woff2`, lat));
  }
  for (const w of [500, 600, 700]) out.push(face('Noto Serif Georgian', w, `@fontsource/noto-serif-georgian/files/noto-serif-georgian-georgian-${w}-normal.woff2`, geo));
  for (const w of [400, 500]) out.push(face('IBM Plex Mono', w, `@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${w}-normal.woff2`, lat));
  return out.join('\n');
}

async function route(r) {
  const url = r.request().url();
  if (url.startsWith(URL0)) return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE });
  if (LIBS) {
    const local = (p) => r.fulfill({ status: 200, body: readFileSync(join(LIBS, p)) });
    if (url.startsWith('https://fonts.googleapis.com/css2')) return r.fulfill({ status: 200, contentType: 'text/css', body: fontCss() });
    if (url.startsWith('https://fonts.gstatic.com/local/')) return local(url.split('/local/')[1]);
    if (url.includes('/three.js/r128/three.min.js')) return local('three/build/three.min.js');
    if (url.includes('/pdf.js/3.11.174/pdf.min.js')) return local('pdfjs-dist/build/pdf.min.js');
    if (url.includes('/pdf.js/3.11.174/pdf.worker.min.js')) return local('pdfjs-dist/build/pdf.worker.min.js');
    if (!url.startsWith('data:') && !url.startsWith('blob:')) return r.abort();
  }
  return r.continue();
}

const saved = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('bina-designer:project:v1') || 'null'));
const piece = async (pg, type) => (await saved(pg)).furniture.find((f) => f.type === type);
const settle = (pg, ms = 450) => pg.waitForTimeout(ms); // saving is debounced by 300 ms

async function screen(pg, x, y) {
  return pg.evaluate(([px, py]) => {
    const p = window.__binaEditor.toScreen({ x: px, y: py });
    const r = document.querySelector('canvas.plan').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [x, y]);
}

const errors = [];
const browser = await chromium.launch({ executablePath: process.env.BINA_CHROMIUM || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });

// seed: a project to find in the browser's storage on the first visit of this context.
async function newPage(opts, seed = null) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts });
  await ctx.route('**/*', route);
  await ctx.addInitScript(() => { window.__BINA_DEBUG__ = true; });
  if (seed) {
    await ctx.addInitScript((proj) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('bina-designer:welcomed:v1', '1');
      localStorage.setItem('bina-designer:project:v1', proj);
    }, JSON.stringify(seed));
  }
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return pg;
}

const report = {};

// ------------------------------------------------------------------ desktop, mouse
{
  const pg = await newPage({ viewport: { width: 1280, height: 800 } });
  await pg.goto(`${URL0}#plan`);
  await pg.waitForSelector('dialog.modal-welcome[open]');
  await pg.getByRole('button', { name: 'დახაზე ბადეზე' }).click();
  await pg.waitForSelector('button[data-tool="rect"][aria-pressed="true"]');

  // a 4 × 5 m room with typed sizes, then its purpose
  const c = await pg.locator('canvas.plan').boundingBox();
  await pg.locator('canvas.plan').click({ position: { x: c.width * 0.3, y: c.height * 0.25 } });
  await pg.fill('#rect-w', '4');
  await pg.fill('#rect-h', '5');
  await pg.press('#rect-h', 'Enter');
  await pg.click('#pop-bedroom');
  await settle(pg);
  let p = await saved(pg);
  assert.equal(p.rooms.length, 1);
  assert.equal(p.rooms[0].purpose, 'bedroom');
  const xs = p.rooms[0].points.map((q) => q.x);
  const ys = p.rooms[0].points.map((q) => q.y);
  assert.equal(+(Math.max(...xs) - Math.min(...xs)).toFixed(3), 4);
  assert.equal(+(Math.max(...ys) - Math.min(...ys)).toFixed(3), 5);

  // the bed from the library, set to 160 × 200 in the panel
  await pg.click('#furniture-btn');
  await pg.click('.lib-card[data-type="bed_double"] >> nth=0');
  await pg.fill('#f-w', '160');
  await pg.press('#f-w', 'Enter');
  await pg.fill('#f-d', '200');
  await pg.press('#f-d', 'Enter');
  await settle(pg);
  let bed = await piece(pg, 'bed_double');
  assert.deepEqual([bed.w, bed.d], [1.6, 2.0]);
  assert.equal(bed.roomId, p.rooms[0].id);
  // and a wardrobe
  await pg.click('#furniture-btn');
  await pg.click('.lib-card[data-type="wardrobe"] >> nth=0');
  await settle(pg);
  let wr = await piece(pg, 'wardrobe');
  assert.ok(wr, 'wardrobe added');
  assert.equal(await pg.locator('#inspector .warn-sec').count(), 0, 'placed without problems');
  await pg.screenshot({ path: join(OUT, 'a1-desktop-placed.png') });

  // drag the bed 60 cm along its wall
  const from = await screen(pg, bed.x, bed.y);
  const ux = Math.cos((bed.rot * Math.PI) / 180);
  const uy = Math.sin((bed.rot * Math.PI) / 180);
  const to = await screen(pg, bed.x + ux * 0.6, bed.y + uy * 0.6);
  await pg.mouse.move(from.x, from.y);
  await pg.mouse.down();
  for (let k = 1; k <= 8; k++) await pg.mouse.move(from.x + ((to.x - from.x) * k) / 8, from.y + ((to.y - from.y) * k) / 8);
  await pg.mouse.up();
  await settle(pg);
  const bed2 = await piece(pg, 'bed_double');
  assert.ok(Math.hypot(bed2.x - bed.x, bed2.y - bed.y) > 0.5, 'bed moved');
  assert.equal(bed2.rot, bed.rot, 'still parallel to the wall');

  // turn the wardrobe a quarter, then back against the nearest wall
  const wpos = await screen(pg, wr.x, wr.y);
  await pg.mouse.click(wpos.x, wpos.y);
  await pg.click('#f-rot-r');
  await settle(pg);
  const wr2 = await piece(pg, 'wardrobe');
  assert.equal(wr2.rot, (wr.rot + 90) % 360);
  await pg.click('#f-wall');
  await settle(pg);
  wr = await piece(pg, 'wardrobe');
  // undo and redo the last step
  await pg.locator('canvas.plan').focus();
  await pg.keyboard.press('Control+z');
  await settle(pg);
  assert.equal((await piece(pg, 'wardrobe')).rot, wr2.rot, 'undo');
  await pg.keyboard.press('Control+Shift+z');
  await settle(pg);
  assert.deepEqual(await piece(pg, 'wardrobe'), wr, 'redo');
  await pg.screenshot({ path: join(OUT, 'a2-desktop-arranged.png') });

  // the 3D view, also from inside the room
  await pg.click('button[aria-label="3D ხედი"]');
  await pg.waitForFunction(() => !!window.__binaView, null, { timeout: 20000 });
  await settle(pg, 1500);
  await pg.screenshot({ path: join(OUT, 'a3-desktop-3d.png') });
  await pg.click('.seg-float [data-view="room"]');
  await settle(pg, 1000);
  await pg.screenshot({ path: join(OUT, 'a4-desktop-3d-room.png') });
  const cam = await pg.evaluate(() => window.__binaView.cameraState());
  assert.equal(cam.kind, 'room');
  assert.ok(Math.abs(cam.position.z - 1.6) < 1e-6, 'eye height');

  // reload: everything is where it was
  const before = (await saved(pg)).furniture;
  await pg.reload();
  await pg.waitForSelector('canvas.plan', { state: 'attached' });
  await settle(pg, 800);
  const after = (await saved(pg)).furniture;
  assert.deepEqual(after, before);
  await pg.goto(`${URL0}#plan`);
  await settle(pg, 500);
  await pg.screenshot({ path: join(OUT, 'a5-desktop-reloaded.png') });
  report.desktop = { bed: after.find((f) => f.type === 'bed_double'), wardrobe: after.find((f) => f.type === 'wardrobe') };
  report.project = await saved(pg);
  await pg.context().close();
}

// ------------------------------------------------------------------ phone, touch
{
  const pg = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, report.project);
  await pg.goto(`${URL0}#plan`);
  await pg.waitForSelector('canvas.plan');
  await settle(pg, 800);
  const bed = await piece(pg, 'bed_double');
  assert.equal(bed.id, report.desktop.bed.id, 'the project drawn on the desktop');
  const at = await screen(pg, bed.x, bed.y);
  await pg.touchscreen.tap(at.x, at.y);
  await settle(pg, 500);
  assert.equal(await pg.locator('.sheet').getAttribute('data-sheet'), 'half', 'bottom sheet opens');
  assert.match(await pg.locator('.sheet-title').innerText(), /საწოლი/);
  await pg.screenshot({ path: join(OUT, 'b1-phone-selected.png') });

  // one-finger drag of the selected bed (positions after the sheet panned the plan)
  const b0 = await piece(pg, 'bed_double');
  const s0 = await screen(pg, b0.x, b0.y);
  const cdp = await pg.context().newCDPSession(pg);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', s0.x, s0.y);
  for (let k = 1; k <= 10; k++) await touch('touchMove', s0.x, s0.y + k * 3);
  await touch('touchEnd');
  await settle(pg);
  const b1 = await piece(pg, 'bed_double');
  assert.ok(Math.hypot(b1.x - b0.x, b1.y - b0.y) > 0.1, 'moved by touch');
  // turn it with the round handle in front of it: swing the handle a quarter turn
  const b2 = await piece(pg, 'bed_double');
  const hp = await pg.evaluate(([bx, by, rot, d]) => {
    const a = (rot * Math.PI) / 180;
    const fx = -Math.sin(a);
    const fy = Math.cos(a); // the front direction
    const ed = window.__binaEditor;
    const c = ed.toScreen({ x: bx, y: by });
    const f = ed.toScreen({ x: bx + fx * d / 2, y: by + fy * d / 2 });
    const r = document.querySelector('canvas.plan').getBoundingClientRect();
    return { cx: r.left + c.x, cy: r.top + c.y, hx: r.left + f.x + fx * 34, hy: r.top + f.y + fy * 34 };
  }, [b2.x, b2.y, b2.rot, b2.d]);
  const R = Math.hypot(hp.hx - hp.cx, hp.hy - hp.cy);
  const a0 = Math.atan2(hp.hy - hp.cy, hp.hx - hp.cx);
  await touch('touchStart', hp.hx, hp.hy);
  for (let k = 1; k <= 12; k++) {
    const a = a0 + (Math.PI / 2) * (k / 12);
    await touch('touchMove', hp.cx + Math.cos(a) * R, hp.cy + Math.sin(a) * R);
  }
  await touch('touchEnd');
  await settle(pg);
  const b3 = await piece(pg, 'bed_double');
  assert.equal(b3.rot, (b2.rot + 90) % 360, 'turned by the handle');
  // and back with the sheet's button
  await pg.locator('.sheet-handle').tap();
  await settle(pg, 300);
  if ((await pg.locator('.sheet').getAttribute('data-sheet')) === 'peek') await pg.locator('.sheet-handle').tap();
  await pg.locator('#f-rot-l').tap();
  await settle(pg);
  assert.equal((await piece(pg, 'bed_double')).rot, b2.rot, 'turned back by the button');
  await pg.screenshot({ path: join(OUT, 'b2-phone-rotated.png') });
  const width = await pg.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(width[0] <= width[1], `no sideways scrolling (${width})`);
  report.phone = { bed: await piece(pg, 'bed_double') };
  await pg.context().close();
}

await browser.close();
assert.deepEqual(errors, [], errors.join('\n'));
console.log(JSON.stringify({ ok: true, screenshots: OUT, desktop: report.desktop, phone: report.phone }, null, 1));
