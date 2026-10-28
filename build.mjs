// Builds two outputs from the same source:
//   dist/artifact.html   page body for the claude.ai artifact (no <html>/<head>, downloads off)
//   dist/site/index.html full page for lithos.ge / Cloudflare (downloads on)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+Georgian:wght@400;500;600;700&family=Noto+Serif+Georgian:wght@500;600;700&display=swap';
const TITLE = 'ბინის დიზაინერი';
const DESC = 'ბინის ზუსტი გეგმა, მასალები საქართველოს ბაზრიდან და ხარჯთაღრიცხვა.';

async function bundle(site) {
  const r = await build({
    entryPoints: ['src/main.js'],
    bundle: true,
    format: 'iife',
    minify: true,
    target: ['es2020'],
    write: false,
    define: { __SITE__: site ? 'true' : 'false' },
    legalComments: 'none',
  });
  return r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
}

const css = readFileSync('src/styles.css', 'utf8');
const fontLinks = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">`;

mkdirSync('dist/site', { recursive: true });

const artJs = await bundle(false);
writeFileSync('dist/artifact.html', `<title>${TITLE}</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fontLinks}
<style>${css}</style>
<div id="app"></div>
<script>${artJs}</script>
`);

const siteJs = await bundle(true);
writeFileSync('dist/site/index.html', `<!doctype html>
<html lang="ka">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="${DESC}">
${fontLinks}
<style>html{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}${css}</style>
</head>
<body>
<div id="app"><p class="boot" role="status">ბინის დიზაინერი იტვირთება…</p></div>
<noscript><p class="boot">ბინის დიზაინერს JavaScript სჭირდება. ჩართე ის ბრაუზერის პარამეტრებში.</p></noscript>
<script>${siteJs}</script>
</body>
</html>
`);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log('artifact', kb(readFileSync('dist/artifact.html', 'utf8')), '· site', kb(readFileSync('dist/site/index.html', 'utf8')));
