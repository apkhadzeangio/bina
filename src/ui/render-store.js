// Saved AI images, kept in this browser (IndexedDB) under the render id that the project
// records. Images are large, so they are not part of the project JSON or localStorage.
// When the browser refuses storage (private windows, blocked site data), images live only
// in memory until the page is closed, and the caller is told so.
const DB = 'bina-designer';
const STORE = 'renders';
const memory = new Map();
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Returns true when stored durably, false when only kept in memory.
export async function putRender(id, blob) {
  memory.set(id, blob);
  const db = await open();
  if (!db) return false;
  try {
    await tx(db, 'readwrite', (s) => s.put({ id, blob, savedAt: new Date().toISOString() }));
    return true;
  } catch (e) {
    return false;
  }
}

export async function getRender(id) {
  if (memory.has(id)) return memory.get(id);
  const db = await open();
  if (!db) return null;
  try {
    const row = await tx(db, 'readonly', (s) => s.get(id));
    return row?.blob || null;
  } catch (e) {
    return null;
  }
}

export async function deleteRender(id) {
  memory.delete(id);
  const db = await open();
  if (!db) return;
  try {
    await tx(db, 'readwrite', (s) => s.delete(id));
  } catch (e) { /* already gone */ }
}

export function base64ToBlob(data, mime) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
