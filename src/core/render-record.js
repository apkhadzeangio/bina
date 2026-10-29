// Saved AI visualizations and the scene they came from.
//
// A record keeps the Stage 05 scene revision of its image plus the settings and camera that
// produced it. Recompiling the scene from today's project with those settings tells whether
// the image still shows the plan: any change to the room, its openings, furniture, chosen
// finishes, camera, style or lighting gives a different revision. A change in another room
// does not. Nothing here ever changes the project.
import { compileScene } from './scene.js';

const FRAME_KEY = [['16:9', 16 / 9], ['4:3', 4 / 3], ['1:1', 1]];
export const frameKey = (aspect) => FRAME_KEY.find(([, a]) => Math.abs(a - aspect) < 1e-8)?.[0] || null;

// The scene a record was made from, as the project stands now (throws when it can no
// longer be built, e.g. the room was deleted or the saved camera is now inside furniture).
export function recordScene(project, meta) {
  const settings = { ...meta.settings, custom: meta.camera };
  return compileScene(project, meta.roomId, settings, meta.camera);
}

export function renderIsCurrent(project, meta) {
  if (!project.rooms.some((r) => r.id === meta.roomId)) return false;
  try {
    return recordScene(project, meta).revision === meta.sceneRevision;
  } catch (e) {
    return false;
  }
}

// The record for one image of a server response. `scene` is the scene that was sent and
// `settings` the room's scene settings at that moment.
export function makeRecord({ response, scene, settings, index = 0 }) {
  const c = scene.camera;
  return {
    id: index ? `${response.id}-${index}` : response.id,
    roomId: scene.room.id,
    sceneRevision: response.sceneRevision,
    projectFingerprint: scene.projectFingerprint,
    createdAt: response.createdAt,
    provider: response.provider,
    model: response.model,
    quality: response.quality,
    aspect: frameKey(c.aspect),
    style: scene.preferences.style,
    costUsd: response.cost?.actualUsd ?? response.cost?.estimatedUsd ?? null,
    costBasis: response.cost?.basis === 'usage' ? 'usage' : 'estimate',
    fallbackUsed: !!response.fallbackUsed,
    camera: { status: c.status, roomId: c.roomId, preset: c.preset, position: { ...c.position }, target: { ...c.target }, fov: c.fov, aspect: c.aspect, fallback: c.fallback },
    settings: {
      preset: c.preset, aspect: c.aspect, fov: c.fov,
      lighting: scene.preferences.lighting, instructions: scene.preferences.instructions,
      ...(settings?.style ? { style: settings.style } : {}),
    },
  };
}
