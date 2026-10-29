# Stage 05 architecture audit and integration

Audited base: main d946c30b6aa1651e1819d9b9444fccd41c137f2f (Stage 04).

## Existing systems

- `core/model.js`: schema 2; separate furniture array; v1 kitchen-run migration;
  unknown material IDs deliberately survive migration. Scene preferences must be an
  optional validated field, preserving schema 2 and the existing storage key.
- `geometry.js`: metre units, clockwise screen polygons, edge inward normals,
  polygon containment, distances, bounds and label points. Reuse these primitives.
- `furniture.js`: centre coordinates; w/d/h in metres; clockwise degrees, local
  +Y is front; `corners()` is the authoritative footprint.
- `measure.js`: room height inheritance, opening hosts on BOTH sides of shared
  walls, offset measured at opening centre, and kitchen finish regions. Compile
  from these functions instead of filtering openings only by owner room.
- `finishes.js`, `products.js`, `references.js`: room/global/style resolution,
  mandatory preferences, orientation, product identity and licensed-image checks;
  material reference v1 distinguishes product-image/product-approx/preference.
  Unknown explicit selections fall back visually today: scene export must instead
  mark them unresolved and never silently substitute a mandatory material.
- `view3d.js`: one renderer, Three r128 on demand, full-height room view, wall
  cutouts, ceilings, furniture and orbit/touch controls. Existing snapshot uses
  a data URL; Stage 05 adds immediate-render PNG Blob capture, with restoration.
- `materials.js`, `material-board.js`: reuse product picker and board preferences;
  share/move the existing viewer rather than allocate another WebGL context.
- `plan-editor.js`: existing editor owns editing, canvas/touch hit-testing and
  mobile sheet interaction. Stage 05 is a separate simple workflow step; it does
  not add CAD tools or change the estimator.
- `store.js`, `app.js`: immutable commit/history, debounced local save, hash-based
  steps. Persist only compact settings; references and capture Blobs are temporary.
- `build.mjs`: esbuild produces artifact and site from source. Never edit generated
  HTML. Existing Node tests and Chromium furniture/material tests remain required.

## Coordinates

Serialized scene: metres, X right on plan, Y down on plan, Z height above floor.
Three world: `(X, Y, Z) = (plan.x, height, plan.y)`. Conversion is an explicit swap
of Y and Z (its own inverse), not a sign inversion. Furniture rotation is clockwise
in plan; Three group rotation about world Y is `-rot * PI/180`. Camera FOV is
vertical degrees, aspect is width/height; aspect changes do not alter FOV.

## Implementation strategy

Pure core modules handle room camera candidates/validation, semantic hashing,
scene compilation, constraints and provider-independent prompts. A JSON Schema
validates all exported scene fields. Opening geometry retains raw dimensions and
records clipped visible spans when the model overlaps a wall end/ceiling.

A scene UI shares the existing material viewer, shows a geometry-drawn room PNG,
allows camera/style-lighting instructions, reuses material controls, and exports a
ZIP using fflate. A revision covers selected-room semantic content, settings and
camera (excluding its self-referential revision field); a separate project content
fingerprint covers all relevant apartment facts without project title, uploaded
plan or price data. Export metadata timestamps are isolated in the manifest.

Camera candidates use inward-offset polygon vertices/edges plus a bounded grid;
reject walls, exterior positions and tall furniture. Entrance and window modes
use hosted openings. Missing features fall back explicitly to a safe interior
candidate. No safe candidate yields an unavailable camera and missing 3D asset,
while 2D and structured exports remain valid. A custom look rotates around a fixed
safe eye position, preserving existing orbit controls outside scene preparation.

Stage 06 consumes scene.json, constraints.json, prompts and manifest asset statuses.
No provider SDK, paid inference, upload, production deployment or main merge belongs
in this stage. Generative image models cannot guarantee architectural precision.

## Final integration notes

The implementation keeps the estimator and editor unchanged. A single material
viewer canvas moves between Materials and AI Scene. Capture renders immediately,
copies the frame into a temporary 2D canvas, restores renderer dimensions/pixel
ratio/FOV/aspect in `finally`, and then encodes a PNG Blob. No second WebGL context
or persistent base64 image is needed. Pointer look uses a fixed safe eye in Scene;
overview/top/room orbit controls in Materials retain their existing behavior.

Two integration details are covered by browser acceptance: the shared product
picker is mounted under body so a hidden Materials step cannot hide it; settings
commits are coalesced to avoid reentrant rendering caused by textarea blur events.

An existing ceiling transform was corrected: shapes were built from `(x,-planY)`
but rotated in the opposite direction from floors, placing ceilings over negative
world Z. Both floor and ceiling now use the same plan-to-world transform; the
ceiling material is double-sided. Scene mode also suppresses the viewer's legacy
implicit bathroom vanity, because it is absent from the authoritative furniture
array. Normal material/estimate views retain that legacy illustration.
