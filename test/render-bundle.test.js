// The Pages Function bundles for the Workers runtime, and no provider credential or
// provider endpoint ends up in the browser bundle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { build } from 'esbuild';

test('the render functions bundle for the Workers runtime (no Node built-ins)', async () => {
  for (const entry of ['functions/api/render/index.js', 'functions/api/render/config.js']) {
    const r = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' });
    const code = r.outputFiles[0].text;
    assert.ok(code.length > 1000, entry);
    assert.doesNotMatch(code, /require\(["']node:/, `${entry}: no Node modules`);
    assert.match(code, entry.endsWith('index.js') ? /onRequestPost/ : /onRequestGet/);
  }
});

test('the browser bundle calls only its own server, never a provider', () => {
  const page = 'dist/site/index.html';
  assert.ok(existsSync(page), 'run npm run build first');
  const html = readFileSync(page, 'utf8');
  for (const s of ['api.openai.com', 'generativelanguage.googleapis.com', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'Bearer ', 'x-goog-api-key']) {
    assert.ok(!html.includes(s), `found ${s} in the page`);
  }
  assert.ok(html.includes('/api/render'), 'the page talks to /api/render');
});
