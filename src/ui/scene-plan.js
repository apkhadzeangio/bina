// A room image drawn from geometry, never a screenshot of the application.
import { drawFurnitureSymbol } from './furniture-draw.js';
import { labelPoint } from '../core/geometry.js';
export function drawScenePlan(canvas, scene) {
  canvas.width = 1200;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  const b = scene.room.bounds;
  const scale = Math.min(1040 / b.w, 760 / b.h);
  const ox = (1200 - b.w * scale) / 2 - b.minX * scale;
  const oy = 100 + (760 - b.h * scale) / 2 - b.minY * scale;
  ctx.fillStyle = '#fafaf7'; ctx.fillRect(0, 0, 1200, 1000);
  ctx.fillStyle = '#243d38'; ctx.font = '600 30px "Noto Sans Georgian", sans-serif';
  ctx.fillText(scene.room.name, 52, 52);
  ctx.font = '20px sans-serif'; ctx.fillStyle = '#60746e';
  ctx.fillText(`${scene.room.bounds.w.toFixed(2)} × ${scene.room.bounds.h.toFixed(2)} m · ${scene.room.areaM2.toFixed(2)} m² · H ${scene.room.ceilingHeight} m`, 52, 86);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(scale, scale);
  const line = (a, z) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(z.x, z.y); ctx.stroke(); };
  ctx.beginPath(); scene.room.polygon.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#243d38'; ctx.lineWidth = 8 / scale; ctx.lineJoin = 'miter'; ctx.stroke();
  for (const o of scene.openings) {
    const wall = scene.room.walls[o.edge];
    const ux = (wall.end.x - wall.start.x) / wall.length, uy = (wall.end.y - wall.start.y) / wall.length;
    const at = (u) => ({ x: wall.start.x + ux * u, y: wall.start.y + uy * u });
    const a = at(o.visibleSpan.start), z = at(o.visibleSpan.end);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12 / scale; line(a, z);
    ctx.lineWidth = 3 / scale;
    ctx.strokeStyle = ['window', 'balcony'].includes(o.type) ? '#40869b' : '#b28a55';
    line(a, z);
    if (['window', 'balcony'].includes(o.type)) {
      line({ x: a.x + wall.inward.x * 0.05, y: a.y + wall.inward.y * 0.05 }, { x: z.x + wall.inward.x * 0.05, y: z.y + wall.inward.y * 0.05 });
    } else if (o.type !== 'arch') {
      const tip = { x: a.x + wall.inward.x * (o.visibleSpan.end - o.visibleSpan.start), y: a.y + wall.inward.y * (o.visibleSpan.end - o.visibleSpan.start) };
      line(a, tip);
      ctx.save(); ctx.setLineDash([6 / scale, 4 / scale]); line(tip, z); ctx.restore();
    }
  }
  for (const f of scene.furniture) {
    ctx.save(); ctx.translate(f.position.x, f.position.y); ctx.rotate(f.rotation * Math.PI / 180);
    drawFurnitureSymbol(ctx, f.type, f.size.width, f.size.depth, { ink: '#667c72', fill: '#e7ede5', lw: 1.8 / scale });
    ctx.restore();
  }
  const mid = labelPoint(scene.room.polygon);
  ctx.font = `${20 / scale}px "Noto Sans Georgian", sans-serif`; ctx.textAlign = 'center';
  ctx.fillStyle = '#243d38';
  ctx.fillText(scene.room.type, mid.x, mid.y);
  if (scene.camera.status === 'ready') {
    const p = scene.camera.position, t = scene.camera.target;
    const a = Math.atan2(t.y - p.y, t.x - p.x);
    ctx.fillStyle = '#285fd1'; ctx.beginPath(); ctx.arc(p.x, p.y, 7 / scale, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = '#285fd1'; ctx.lineWidth = 2.5 / scale;
    for (const angle of [a - 0.25, a + 0.25]) line(p, { x: p.x + Math.cos(angle) * 0.55, y: p.y + Math.sin(angle) * 0.55 });
  }
  ctx.restore();
  ctx.textAlign = 'left'; ctx.font = '19px sans-serif'; ctx.fillStyle = '#60746e';
  ctx.fillText('BINA · Architectural plan · metres · blue = camera / window · ochre = door / opening', 52, 958);
}
export const planPNG = (canvas) => new Promise((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Plan PNG unavailable')), 'image/png'));
