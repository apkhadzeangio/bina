// Stable ids for rooms, openings and furniture. Ids are kept when a project is saved and
// opened again, so other programs (and later AI requests) can refer to the same object.
let idCounter = 0;

export function newId(prefix) {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}
