# Limitations and Stage 06 integration

## Current limits

- This is scene preparation. There is no image-generation provider, API call,
  server upload, payment, generation button, or completed photorealistic render.
- The 3D asset is a simplified blockout from the existing renderer. Material
  colours, textures, furniture details and lighting are illustrative. Product
  identity, scale, assignments and constraints remain recorded separately.
- Lighting mood and creative instructions are future-render preferences; they do
  not turn the blockout into a photorealistic lighting simulation.
- Camera candidates are geometry-derived, with bounded grid sampling for unusual
  polygons. Highly cramped rooms may have no safe position. Missing entrances,
  windows or unsafe saved custom cameras produce an explicit fallback; a fully
  obstructed room keeps the 2D/structured package and records 3D as missing.
- Drag/touch adjusts orientation about a safe fixed eye; preset selection changes
  the eye position. This is intentionally a simple interior workflow.
- Shared openings follow the existing host-wall matching tolerance (0.5 m maximum
  gap). An opening extending beyond its wall/ceiling retains recorded dimensions
  and a clipping warning instead of inventing corrected measurements.
- Unknown selected products remain unresolved. They are never silently replaced in
  the scene package. Existing Materials visuals may still show their style fallback;
  Scene review explicitly flags the unresolved ID.
- The catalog currently has no licensed product photographs. ZIPs embed none;
  material samples are synthetic approximations. Future licensed paths remain
  metadata only unless a later asset-packaging stage verifies and includes bytes.
- FNV-1a revision IDs identify content; they are not cryptographic integrity checks.
- Browser acceptance uses Chromium 133 with SwiftShader in this environment,
  desktop 1440×1000 and touch 390×844. Stage 03/04 also cover 1280-wide desktop and
  the same phone size. Physical iOS/Android GPU testing is still useful before release.
- Image models and text prompts cannot guarantee measured architectural accuracy.

## Stage 06 contract

1. Validate scene.json against the v1 JSON Schema and enforce cross-field semantic
   checks documented in schema.md. Consume its geometry directly; do not rebuild
   the apartment by interpreting the prompt or guessing from the reference images.
2. Check manifest.assets and included ZIP files. Missing blockouts must remain
   explicit. Treat unresolved mandatory materials as requiring user correction.
3. Keep source coordinates (plan X/Y, height Z) and vertical FOV/aspect unchanged.
   Match every asset to sceneRevision, roomId and projectFingerprint before use.
4. Adapt the provider-independent scene/prompt/constraint manifest to a provider
   behind an isolated adapter. Apply limits, request validation, authentication,
   costs, storage, cancellation and retry behavior in that future stage.
5. Never send uploaded plan images, project titles, pricing or arbitrary project
   fields by default. The current ZIP deliberately excludes those root fields.
   Room labels and optional user instructions are intentional scene content and
   should remain reviewable by the user before any future external request.
6. Include product photos only when usage rights and attribution have been checked;
   preserve exact-product vs preference and approximate-sample distinctions.
7. Validate future output against geometry, openings, furniture and mandatory
   materials. Report deviations instead of presenting generated imagery as a
   construction document or an exact measured result.

No main merge, hosting deployment or Cloudflare settings change is part of this PR.
