# BINA Stage 05 delivery

Stage 05 adds a working AI Scene preparation step between Materials and Estimate:
select a room, choose a safe camera, review the geometry/materials/Georgian brief,
and download a complete provider-independent scene ZIP. No AI generation occurs.

Base: main `d946c30b6aa1651e1819d9b9444fccd41c137f2f`.
Branch: `feat/bina-05-scene-composer`.

## Architecture and contracts

- [Audit and architecture](architecture.md)
- [Complete JSON Schema](../../schemas/bina.ai-scene.v1.schema.json)
- [Schema and package contract](schema.md)
- [Limitations and Stage 06 requirements](stage06.md)

## Real example packages

- [4 × 5 m bedroom](examples/bedroom.zip): 160 × 200 cm bed, wardrobe, one door,
  one window, KT502 floor, saved custom camera; both PNG references included.
- [Sample kitchen-living room](examples/kitchen.zip): KT502 floor, Step-Latex sage
  walls, Calacatta Gold countertop; both PNG references included.
- [WebGL-unavailable example](examples/webgl-unavailable.zip): exact scene, 2D PNG,
  prompt and constraints retained; no blockout image, explicitly missing in manifest.

These packages are exported by the running application in automated Chromium,
not assembled from placeholder pictures. The bedroom and kitchen scene.json files
inside the ZIPs pass the committed JSON Schema. No retailer photographs are embedded.

## Actual implementation screenshots

- [Desktop bedroom](screenshots/desktop-bedroom.png)
- [Desktop kitchen](screenshots/desktop-kitchen.png)
- [Mobile bedroom](screenshots/mobile-bedroom.png)
- [Mobile full workflow](screenshots/mobile-bedroom-full.png)
- [Unavailable WebGL](screenshots/webgl-unavailable.png)

## Verification

- `npm ci`: passed from the lockfile.
- `npm test`: **105 passed, 0 failed** (92 existing tests plus 13 new scene tests).
- `npm run build`: passed; site and artifact built from source.
- `npm run test:e2e`: passed all Stage 03, Stage 04 and Stage 05 Chromium scripts.
- Stage 05 additionally passed actual WebGL context-loss/recovery export tests.
- Desktop: 1440 × 1000. Mobile: 390 × 844 with CDP-dispatched touch gestures.
- Real 1280 × 720 capture had 405 sampled colours; capture preserved camera state.
- 16:9, 4:3 and 1:1 preserve stored FOV; square export is 1280 × 1280.
- Camera save/reload, shared renderer identity, product changes, mandatory flags,
  estimator stability, exported schema, missing WebGL and retry all passed.
- No unexpected network requests, external image-generation requests or page errors.
- `git diff --check`: passed.

[Machine-readable browser results](verification/browser-acceptance.json),
[Node test log](verification/node-tests.txt),
[full workflow browser log](verification/full-browser-tests.txt), and
[context recovery test log](verification/context-recovery-tests.txt) are included.

Run locally with Node 18+:

```sh
npm ci
npx playwright install chromium
npm test
npm run build
npm run test:e2e
```

The browser tests serve pinned Three.js and fonts from dev dependencies; no live
CDN is required after installation. `BINA_CHROMIUM=/path/to/chromium` optionally
selects an existing Chromium executable. This environment used Chromium 133 with
SwiftShader. Tests generate their artifacts under ignored out/ or e2e-shots/.
The committed screenshots/examples above are the reviewed delivery evidence.

## Modified and added files

Added source modules:

- `src/core/scene.js`: pure compiler, constraints, content fingerprints and revisions.
- `src/core/scene-camera.js`: hosted openings, coordinate conversion, safe presets.
- `src/core/scene-prompt.js`: provider-independent English/Georgian briefs and text validation.
- `src/core/scene-package.js`: PNG/JSON/prompt/manifest ZIP export with fflate.
- `src/ui/scene-composer.js`: responsive scene preparation and existing material controls.
- `src/ui/scene-plan.js`: geometry-drawn room PNG with existing furniture symbols.

Modified source:

- `src/core/model.js`: validate optional compact scene settings during schema-2 load.
- `src/ui/view3d.js`: prepared cameras, fixed-eye look controls, safe PNG Blob capture,
  context-loss checks, and corrected ceiling plan-to-world transform.
- `src/ui/materials.js`: shared viewer/picker/board integration, one WebGL renderer.
- `src/ui/app.js`: AI Scene navigation and workflow step.
- `src/styles.css`: responsive scene preparation layout.

Supporting changes:

- `schemas/bina.ai-scene.v1.schema.json` and these delivery documents/evidence.
- `test/scene.test.js`, `test/fixtures/scene.js`, `test/e2e/scene.mjs`.
- Existing `test/e2e/acceptance.mjs` and `materials.mjs`: local dependency/browser
  support; wait for the rectangle tool and use an actionable canvas click to
  remove an existing onboarding timing race.
- `package.json` and lockfile: fflate runtime, reproducible browser/schema test tools,
  pinned local Three/fonts for offline tests, test scripts.
- `dist/site/index.html`: generated exclusively by `npm run build`.

No main merge, production deployment, Cloudflare configuration, or LITHOS changes.
