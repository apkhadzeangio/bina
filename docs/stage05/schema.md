# Scene and package contracts

The complete machine-readable JSON Schema is
[`schemas/bina.ai-scene.v1.schema.json`](../../schemas/bina.ai-scene.v1.schema.json)
(JSON Schema Draft 7). `scene.json` is `bina.ai-scene`, version 1. AJV validates the
bedroom, kitchen, irregular, migrated, unavailable-camera and exported examples.

## Fields and semantic rules

- `coordinates`: metres; X right, Y down in plan, Z up. Conversion to Three.js is
  `(x,z,y)`; the inverse is identical. Furniture rotates clockwise in plan; Three
  uses negative world-Y radians. FOV is vertical degrees; aspect is width/height.
- `room`: original polygon and wall endpoints/normals, bounding box dimensions
  (not an assertion that the room is rectangular), area and inherited ceiling
  height with its source. Room coordinates are never translated into a new origin.
- `openings`: owner and hosted status, selected-room wall/offset, exact recorded
  width/height/sill, endpoints and known connected room. `visibleSpan` reports the
  clipping applied by the existing renderer at wall ends and ceiling; a warning
  preserves this discrepancy instead of altering the factual dimensions.
- `furniture`: ID, type, centre, width/depth/height, rotation and four footprint
  vertices computed with the existing furniture engine. No automatic placement.
- `finishRegions`: measured kitchen-run geometry and tile-height overrides;
  standard counter/backsplash dimensions are explicitly application conventions.
- `materials`: selected surface keys and mandatory flags from Stage 04. Resolved
  entries retain product/preference kinds, identity, tint-vs-product distinction,
  unit scale, direction and approximate colour. Price/availability is excluded
  from this visual-only profile. Unknown explicit selections have status
  `unresolved`, their original ID, null product/visual fields, and no substitution.
- `camera`: selected room, preset, position/target, FOV, aspect, fallback and the
  associated scene revision. Ready cameras require a safe interior position and
  a finite nonzero look direction. Unavailable cameras have null position/target.
- `preferences`: existing style, enumerated mood and optional NFC-normalized text
  limited to 1200 JS characters. Control/bidirectional override codes are removed.
  The prompt quotes free text and explicitly subordinates it to hard constraints.
- `constraints`: authoritative geometry JSON pointers, mandatory material keys,
  flexible material keys, allowed styling and explicit negative constraints.
- `references`: `pending` before capture; `included` with exact filename after
  successful capture; `missing` for failure; `omitted` for deliberate exclusion.
  Only included assets have filenames. No fabricated blockout is accepted.
- `warnings`: unresolved products, opening clipping and camera fallback reasons.

Schema validation is structural. Consumers must also enforce cross-field rules:
polygon/wall agreement; opening edge bounds; matching room IDs and camera/revision;
footprints derived from furniture; asset filename/file availability. The pure
compiler enforces these relationships for valid migrated BINA projects, and
browser tests check actual renderer/camera/asset agreement.

## Identity and determinism

`projectFingerprint` is UTF-8 FNV-1a 64 of canonical whitelisted apartment model
facts and finish settings, excluding title, uploaded plan, arbitrary root fields
and camera/creative preferences. `revision` hashes the selected-room semantic
specification, excluding projectFingerprint, reference capture status and the
self-referential camera.sceneRevision. Arrays preserve model order; object keys
are sorted. This is a reproducibility identifier, not a security/authenticity hash.
A material or camera change updates the revision. A price-only catalog change does
not. Unrelated-room changes can update projectFingerprint without changing revision.

## ZIP

`bina-scene/` contains scene.json, material-references.json, plan-reference.png,
rendering-prompt.txt, rendering-brief-ka.txt, constraints.json and manifest.json.
blockout-reference.png is present only on real capture success. The material file
is a documented visual-only profile of material reference v1 (including explicit
unresolved records), not an estimator/price export. No product image bytes are
embedded; even licensed paths are metadata, with omission recorded in manifest.

The manifest records scene/application versions, revision, fingerprint,
coordinates, timestamps, every included file, missing/omitted assets, and
`imageGenerationExecuted: false`, `provider: null`. `readyForGeneration` requires
both references and no unresolved mandatory material. This is preparation
readiness, not a guarantee of generated-image geometric fidelity.

Only manifest.generatedAt is nondeterministic. With that timestamp fixed, ZIPs
also repeat byte for byte; ZIP entry times are fixed. Images live in temporary
Blobs/export files and never in the project save. Stored scene preferences and
camera state are validated by the existing schema-2 migration.
