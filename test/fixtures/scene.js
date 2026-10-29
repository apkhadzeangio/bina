import { emptyProject, makeRoom, makeOpening, sampleProject } from '../../src/core/model.js';
import { rectPoints } from '../../src/core/geometry.js';
import { makeFurniture } from '../../src/core/furniture.js';
import { setFinish } from '../../src/core/finishes.js';
export function bedroomProject() {
  let p = emptyProject();
  p.name = 'საძინებელი — 4 × 5 მ';
  const r = makeRoom(rectPoints(0, 0, 4, 5), 'bedroom', { id: 'bedroom', name: 'საძინებელი' });
  p.rooms = [r];
  p.openings = [
    { ...makeOpening(r.id, 2, 0.7, 'door'), id: 'entrance' },
    { ...makeOpening(r.id, 0, 2, 'window'), id: 'window' },
  ];
  p.furniture = [makeFurniture('bed_double', 2.6, 1.2, 0, { id: 'bed', roomId: r.id, w: 1.6, d: 2 }),
    makeFurniture('wardrobe', 0.3, 1.6, 270, { id: 'wardrobe', roomId: r.id })];
  p = setFinish(p, r, 'floor', 'lam_kt502', 'room');
  return p;
}
export function kitchenProject() {
  let p = sampleProject();
  const map = new Map(p.rooms.map((r, i) => [r.id, `room-${i}`]));
  p.rooms = p.rooms.map((r) => ({ ...r, id: map.get(r.id) }));
  p.openings = p.openings.map((o, i) => ({ ...o, id: `opening-${i}`, roomId: map.get(o.roomId) }));
  p.furniture = p.furniture.map((f, i) => ({ ...f, id: `furniture-${i}`, roomId: map.get(f.roomId) }));
  const r = p.rooms[0];
  for (const [surface, id] of Object.entries({ floor: 'lam_kt502', walls: 'paint_mid_sage', countertop: 'st_calacatta' })) p = setFinish(p, r, surface, id, 'room');
  p.name = 'სამზარეულო და მისაღები';
  return p;
}
