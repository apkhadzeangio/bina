import { zipSync, strToU8 } from 'fflate';
import { compilePrompt } from './scene-prompt.js';

const asset = (blob, filename, reason, omitted) => blob
  ? { status: 'included', filename, reason: null }
  : { status: omitted ? 'omitted' : 'missing', filename: null, reason };

// All images must be real captures. No fallback bitmap or product photo is fabricated.
export async function scenePackage(scene, { plan = null, blockout = null, blockoutReason = 'WebGL capture unavailable; retry in a supported browser.', omitBlockout = false, generatedAt = new Date().toISOString() } = {}) {
  if (!plan || plan.type !== 'image/png') throw new Error('A real 2D PNG plan is required');
  if (blockout && blockout.type !== 'image/png') throw new Error('Blockout must be a PNG capture');
  const exported = { ...scene, references: {
    plan: asset(plan, 'plan-reference.png', '2D capture unavailable.', false),
    blockout: asset(blockout, 'blockout-reference.png', blockoutReason, omitBlockout),
  } };
  const prompt = compilePrompt(exported);
  const json = (v) => strToU8(`${JSON.stringify(v, null, 2)}\n`);
  const files = {
    'scene.json': json(exported),
    'material-references.json': json({ format: 'bina.material-references', version: 1,
      profile: 'scene-visual-only', sceneRevision: scene.revision, references: scene.materials }),
    'rendering-prompt.txt': strToU8(prompt.english),
    'rendering-brief-ka.txt': strToU8(prompt.georgian),
    'constraints.json': json(scene.constraints),
    'plan-reference.png': new Uint8Array(await plan.arrayBuffer()),
  };
  if (blockout) files['blockout-reference.png'] = new Uint8Array(await blockout.arrayBuffer());
  const manifest = {
    format: 'bina.ai-scene-package', version: 1, applicationVersion: scene.applicationVersion,
    generatedAt, sceneRevision: scene.revision, projectFingerprint: scene.projectFingerprint,
    coordinates: scene.coordinates, provider: null, imageGenerationExecuted: false,
    assets: exported.references, files: [...Object.keys(files), 'manifest.json'].sort(),
    materialImages: { status: 'omitted', reason: 'No product photographs are embedded. Recorded licensed paths are metadata only; all swatches are approximate.' },
    readyForGeneration: !!blockout && !scene.materials.some((r) => r.mandatory && r.status === 'unresolved'),
    limitations: [scene.constraints.limitation, ...scene.warnings],
  };
  files['manifest.json'] = json(manifest);
  // Fixed ZIP timestamp makes repeat exports byte-identical with the same generatedAt.
  const entries = Object.fromEntries(Object.entries(files).map(([name, data]) => [`bina-scene/${name}`, [data, { mtime: new Date('2020-01-01T00:00:00Z') }]]));
  return { blob: new Blob([zipSync(entries, { level: 6 })], { type: 'application/zip' }), scene: exported, manifest, files };
}
