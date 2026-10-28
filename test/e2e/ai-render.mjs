// Browser integration test for stage 06 (AI rendering), on the built page:
//
//   draw a 4 × 5 m bedroom → place a bed and a wardrobe → choose the floor and the walls →
//   open "AI დიზაინის გენერაცია" → confirm room, viewpoint, materials, style, cost →
//   generate → see the labelled result → save it with its scene revision → change the plan
//   → the saved render shows as out of date. Also: service not configured, provider errors,
//   timeout, quota and cancellation, as the user sees them.
//
// The page talks to the REAL render handler (server/render/handler.js) with a test D1
// database. Only the image provider is a MOCK: it returns the layout sketch it received
// as its "image". This test proves the integration, not image quality; live generation
// needs real credentials (docs/stage-06/VERIFICATION.md).
//
//   npm run build && node test/e2e/ai-render.mjs [screenshot folder]
// Offline: BINA_LIBS=<folder with three/build/three.min.js>.
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { handleRender, handleConfig } from '../../server/render/handler.js';
import { memoryD1 } from '../helpers/d1.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const OUT = resolve(process.argv[2] || join(ROOT, 'e2e-shots'));
const LIBS = process.env.BINA_LIBS;
mkdirSync(OUT, { recursive: true });
const PAGE = readFileSync(join(ROOT, 'dist/site/index.html'), 'utf8');
const ORIGIN = 'https://bina.lithos.ge';
const URL0 = `${ORIGIN}/`;
const settle = (pg, ms = 450) => pg.waitForTimeout(ms);
const saved = (pg) => pg.evaluate(() => JSON.parse(localStorage.getItem('bina-designer:project:v1') || 'null'));
const piece = async (pg, type) => (await saved(pg)).furniture.find((f) => f.type === type);
const errors = [];

// ------------------------------------------------------------------ server side of the test
let env = {};
let provider = null; // (body) => Response | Promise<Response>   — the MOCK provider
let deps = {};
const providerCalls = [];

function serverEnv(over = {}) {
  return {
    RENDER_ENABLED: 'true', OPENAI_API_KEY: 'sk-test-not-real', RENDER_MONTHLY_BUDGET_USD: '5', RENDER_SALT: 'e2e',
    RENDER_ACCESS_CODES: 'bina-test-code', RENDER_DAILY_PER_USER: '10', RENDER_RATE_PER_MINUTE: '30', BINA_DB: memoryD1(), ...over,
  };
}
const mockFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  providerCalls.push({ url, body });
  return provider(body, init);
};
const echoSketch = (body) => new Response(JSON.stringify({
  output_format: 'jpeg',
  data: [{ b64_json: body.images[0].image_url.split(',')[1] }], // MOCK: the sketch comes back as the "render"
  usage: { input_tokens: 5000, input_tokens_details: { text_tokens: 1000, image_tokens: 4000 }, output_tokens: 1584 },
}), { status: 200 });

async function route(r) {
  const req = r.request();
  const url = req.url();
  if (url.startsWith(`${ORIGIN}/api/render`)) {
    const headers = { ...req.headers(), 'cf-connecting-ip': '198.51.100.9' };
    const request = new Request(url, { method: req.method(), headers, body: req.method() === 'POST' ? req.postData() : undefined });
    try {
      const res = url.endsWith('/config') ? await handleConfig(request, env) : await handleRender(request, env, {}, { fetch: mockFetch, log: () => {}, ...deps });
      await r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    } catch (e) {
      // the browser may have cancelled the request while the handler was running
      if (!/closed|Target|aborted/i.test(String(e))) throw e;
    }
    return;
  }
  if (url === URL0 || url.startsWith(`${URL0}#`)) return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE });
  if (LIBS && url.includes('/three.js/r128/three.min.js')) {
    const f = join(LIBS, 'three/build/three.min.js');
    if (existsSync(f)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: readFileSync(f) });
  }
  if (LIBS && !url.startsWith('data:') && !url.startsWith('blob:')) return r.abort();
  return r.continue();
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, acceptDownloads: true, viewport: { width: 1280, height: 860 }, ...opts });
  await ctx.route('**/*', route);
  await ctx.addInitScript(() => { window.__BINA_DEBUG__ = true; localStorage.setItem('bina-designer:welcomed:v1', '1'); });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|status of 4\d\d|status of 5\d\d/.test(m.text())) errors.push(`console: ${m.text()}`); });
  return pg;
}

async function choose(pg, roomId, surfaceLabel, name) {
  await pg.locator(`.room-sec[data-room="${roomId}"] .mat-row`).filter({ hasText: surfaceLabel }).first().click();
  await pg.waitForSelector('#picker[open]');
  await pg.locator('#picker .seg-btn').filter({ hasText: 'მხოლოდ:' }).click();
  await pg.locator('#picker .pick-card').filter({ hasText: name }).locator('.pick-main').click();
  await settle(pg);
}

async function openAi(pg) {
  await pg.click('#ai-render-btn');
  await pg.waitForSelector('dialog.ai-dialog[open]');
  await settle(pg, 600);
}

async function confirmAndGenerate(pg, { code = 'bina-test-code' } = {}) {
  const boxes = pg.locator('dialog.ai-dialog .ai-consent input[type=checkbox]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  if (code !== null && await pg.locator('#ai-code').count()) await pg.fill('#ai-code', code);
  assert.equal(await pg.locator('#ai-submit').isDisabled(), false, 'generate is enabled after confirming');
  await pg.click('#ai-submit');
}

const report = {};

// ------------------------------------------------------------------ 1. service not configured
{
  env = {}; // nothing set: the button exists, generation is not possible
  const pg = await newPage();
  await pg.goto(`${URL0}#materials`);
  await pg.waitForSelector('#ai-render-btn');
  await pg.waitForFunction(() => !!window.__binaView, null, { timeout: 20000 });
  await openAi(pg);
  await pg.waitForSelector('dialog.ai-dialog .status.warn');
  const msg = await pg.textContent('dialog.ai-dialog .status.warn');
  assert.match(msg, /ჯერ ჩართული არ არის/);
  const boxes = pg.locator('dialog.ai-dialog .ai-consent input[type=checkbox]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  assert.equal(await pg.locator('#ai-submit').isDisabled(), true, 'no generation without a configured service');
  assert.ok(await pg.locator('dialog.ai-dialog .ai-sketch img').count(), 'the sketch is still prepared');
  await pg.screenshot({ path: join(OUT, 'r0-not-configured.png') });
  assert.equal(providerCalls.length, 0);
  await pg.context().close();
}

// ------------------------------------------------------------------ 2. the acceptance path
{
  env = serverEnv();
  provider = echoSketch;
  deps = {};
  const pg = await newPage();
  await pg.goto(`${URL0}#plan`);
  // a 4 × 5 m bedroom, typed
  await pg.click('#menu-btn');
  await pg.click('text=ახალი ცარიელი პროექტი');
  await pg.click('[data-tool=rect]');
  const c = await pg.locator('canvas.plan').boundingBox();
  await pg.mouse.click(c.x + c.width * 0.3, c.y + c.height * 0.25);
  await pg.fill('#rect-w', '4');
  await pg.fill('#rect-h', '5');
  await pg.press('#rect-h', 'Enter');
  await pg.click('#pop-bedroom');
  await settle(pg);
  // a 160 × 200 bed and a wardrobe from the library
  await pg.click('#furniture-btn');
  await pg.click('.lib-card[data-type="bed_double"] >> nth=0');
  await pg.fill('#f-w', '160');
  await pg.press('#f-w', 'Enter');
  await pg.fill('#f-d', '200');
  await pg.press('#f-d', 'Enter');
  await settle(pg);
  await pg.click('#furniture-btn');
  await pg.click('.lib-card[data-type="wardrobe"] >> nth=0');
  await settle(pg);
  let p = await saved(pg);
  const roomId = p.rooms[0].id;
  assert.ok(await piece(pg, 'bed_double') && await piece(pg, 'wardrobe'));

  // the floor and the wall finish
  await pg.click('a[data-step=materials]');
  await pg.waitForFunction(() => !!window.__binaView, null, { timeout: 20000 });
  await choose(pg, roomId, 'იატაკი', 'KT502');
  await choose(pg, roomId, 'კედლები', 'სალბისფერი');
  p = await saved(pg);
  assert.deepEqual(p.finish.rooms[roomId], { floor: 'lam_kt502', walls: 'paint_mid_sage' });
  const before = JSON.stringify({ ...p, renders: undefined });

  // the dialog: room, viewpoint, materials, style, cost
  await openAi(pg);
  assert.equal(await pg.locator('dialog.ai-dialog select').inputValue(), roomId);
  const mats = await pg.textContent('dialog.ai-dialog .ai-mats');
  assert.match(mats, /KT502/);
  assert.match(mats, /სალბისფერი/);
  await pg.click('dialog.ai-dialog >> text=სხვა კუთხე');
  await settle(pg, 400);
  await pg.click('dialog.ai-dialog .tab >> text=სკანდინავიური');
  const cost = await pg.textContent('dialog.ai-dialog .ai-cost');
  assert.match(cost, /≈ \$0\.\d+/);
  assert.match(cost, /gpt-image-2\.5-sunburst/);
  await pg.screenshot({ path: join(OUT, 'r1-dialog.png') });
  await confirmAndGenerate(pg);
  await pg.waitForSelector('dialog.ai-dialog .ai-result img', { timeout: 20000 });
  await settle(pg, 500);
  await pg.screenshot({ path: join(OUT, 'r2-result.png') });

  // what the server sent to the (mock) provider
  assert.equal(providerCalls.length, 1);
  const call = providerCalls[0].body;
  assert.equal(call.model, 'gpt-image-2.5-sunburst');
  assert.equal(call.size, '1536x1024');
  assert.match(call.images[0].image_url, /^data:image\/jpeg;base64,/);
  assert.ok(call.images.length >= 3, 'sketch plus material samples');
  assert.match(call.prompt, /Room: 4\.00 m × 5\.00 m/);
  assert.match(call.prompt, /double bed, 1\.60 m × 2\.00 m/);
  assert.match(call.prompt, /tall wardrobe/);
  assert.match(call.prompt, /KT502 Lussac Ash/);
  assert.match(call.prompt, /Scandinavian/);
  const sketchBytes = Buffer.from(call.images[0].image_url.split(',')[1], 'base64');
  assert.ok(sketchBytes.length > 20000, 'a real rendered sketch, not an empty canvas');

  // the result is labelled and tied to the scene revision
  const label = await pg.textContent('dialog.ai-dialog .ai-label');
  assert.match(label, /AI კონცეფცია — არა ზუსტი ნახაზი/);
  const rev = await pg.textContent('dialog.ai-dialog .facts code');
  assert.match(rev, /^s1-[0-9a-f]{14}$/);
  await pg.click('dialog.ai-dialog >> text=პროექტში შენახვა');
  await settle(pg);
  p = await saved(pg);
  assert.equal(p.renders.length, 1);
  assert.equal(p.renders[0].sceneRevision, rev);
  assert.equal(p.renders[0].roomId, roomId);
  assert.equal(p.renders[0].style, 'scandi');
  assert.equal(p.renders[0].costBasis, 'usage');
  assert.equal(JSON.stringify({ ...p, renders: undefined }), before, 'the plan and the products are unchanged by the result');
  const stored = await pg.evaluate((id) => new Promise((res) => {
    const rq = indexedDB.open('bina-designer', 1);
    rq.onsuccess = () => {
      const g = rq.result.transaction('renders').objectStore('renders').get(id);
      g.onsuccess = () => res(g.result ? g.result.blob.size : 0);
    };
  }), p.renders[0].id);
  assert.ok(stored > 20000, 'the image is stored in the browser');
  report.render = { revision: rev, cost: p.renders[0].costUsd };

  // download carries the label in the image
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('dialog.ai-dialog >> text=ჩამოტვირთვა')]);
  assert.match(dl.suggestedFilename(), /^bina-ai-s1-[0-9a-f]{14}-.+\.jpg$/);
  await pg.keyboard.press('Escape');

  // reload: the render is still there; after a change of the plan it shows as out of date
  await pg.reload();
  await pg.waitForFunction(() => !!window.__binaView, null, { timeout: 20000 });
  await choose(pg, roomId, 'იატაკი', 'SE002');
  await openAi(pg);
  await pg.waitForSelector('dialog.ai-dialog .ai-thumb');
  assert.match(await pg.textContent('dialog.ai-dialog .ai-thumb'), /გეგმა შეიცვალა/);
  await pg.screenshot({ path: join(OUT, 'r3-gallery-outdated.png') });
  await pg.keyboard.press('Escape');
  await pg.context().close();
}

// ------------------------------------------------------------------ 3. failures as the user sees them
async function failureCase(name, setup, expect) {
  env = serverEnv(setup.env || {});
  provider = setup.provider || echoSketch;
  deps = setup.deps || {};
  const pg = await newPage();
  await pg.goto(`${URL0}#materials`);
  await pg.waitForFunction(() => !!window.__binaView, null, { timeout: 20000 });
  await openAi(pg);
  await confirmAndGenerate(pg, setup.confirm || {});
  if (setup.cancelAfterMs) {
    await pg.waitForSelector('dialog.ai-dialog .ai-running');
    await pg.screenshot({ path: join(OUT, `r-${name}-running.png`) });
    await pg.waitForTimeout(setup.cancelAfterMs);
    await pg.click('dialog.ai-dialog >> text=გაუქმება');
    await pg.waitForSelector('#ai-submit');
    const t = await pg.textContent('#toast');
    assert.match(t, /გაუქმდა/, name);
  } else {
    await pg.waitForSelector('dialog.ai-dialog .status.warn[role=alert]', { timeout: 20000 });
    const text = await pg.textContent('dialog.ai-dialog .status.warn[role=alert]');
    assert.match(text, expect, `${name}: ${text}`);
    await pg.screenshot({ path: join(OUT, `r-${name}.png`) });
  }
  const p = await saved(pg);
  assert.equal((p?.renders || []).length, 0, `${name}: nothing saved`);
  await pg.context().close();
}

await failureCase('bad-key', { provider: () => new Response(JSON.stringify({ error: { message: 'Incorrect API key', code: 'invalid_api_key' } }), { status: 401 }) }, /გასაღები/);
await failureCase('wrong-code', { confirm: { code: 'nope' } }, /კოდი არასწორია/);
await failureCase('provider-busy', { provider: () => new Response(JSON.stringify({ error: { message: 'rate', code: 'rate_limit_exceeded' } }), { status: 429, headers: { 'retry-after': '15' } }) }, /გადატვირთულია/);
await failureCase('provider-down', { provider: () => new Response('{}', { status: 500 }) }, /შეცდომა/);
await failureCase('timeout', { provider: (b, init) => new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('x', 'AbortError')))), deps: { timeoutMs: 1500 } }, /დროულად ვერ/);
{
  // the daily quota: the second request of the same user is refused
  env = serverEnv({ RENDER_DAILY_PER_USER: '1' });
  provider = echoSketch;
  deps = {};
  const pg = await newPage();
  await pg.goto(`${URL0}#materials`);
  await pg.waitForFunction(() => !!window.__binaView, null, { timeout: 20000 });
  await openAi(pg);
  await confirmAndGenerate(pg);
  await pg.waitForSelector('dialog.ai-dialog .ai-result img', { timeout: 20000 });
  await pg.click('dialog.ai-dialog >> text=თავიდან გენერაცია');
  await confirmAndGenerate(pg);
  await pg.waitForSelector('dialog.ai-dialog .status.warn[role=alert]');
  assert.match(await pg.textContent('dialog.ai-dialog .status.warn[role=alert]'), /ლიმიტი ამოიწურა/);
  await pg.context().close();
}
await failureCase('cancel', { provider: (b, init) => new Promise((res) => setTimeout(() => res(echoSketch(b)), 4000)), cancelAfterMs: 800 }, null);

await browser.close();
assert.deepEqual(errors, [], errors.join('\n'));
console.log(JSON.stringify({ ok: true, providerCalls: providerCalls.length, ...report }, null, 2));
