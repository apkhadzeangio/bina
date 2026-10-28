// App state, undo history and local saving.
import { sampleProject, migrateProject, cleanPlanImage } from '../core/model.js';

// The storage key keeps its v1 name: the project inside carries its own schema version
// and is migrated on load, so older saves open without any extra step.
const KEY = 'bina-designer:project:v1';
const IMG_KEY = 'bina-designer:plan-image:v1';
const BACKUP_KEY = 'bina-designer:project:unreadable-backup';
const SNAP_KEY = 'bina-designer:snap:v1';

function loadSnap() {
  const def = { walls: true, grid: false };
  try {
    const v = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
    return v && typeof v === 'object' ? { walls: v.walls !== false, grid: v.grid === true } : def;
  } catch (e) {
    return def;
  }
}

export const state = {
  project: null,
  draft: null, // temporary project while dragging; not in history
  selection: null, // { type: 'room' | 'opening' | 'furniture', id }
  snap: loadSnap(), // furniture snapping, a per-browser preference: { walls, grid }
  hoverEdge: null, // { roomId, edge } highlighted from the inspector
  tool: 'select',
  step: 'plan',
  planImage: null, // HTMLImageElement
  planImageData: null, // data URL
  saveError: null,
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(kind) {
  for (const fn of listeners) fn(kind);
}

export function current() {
  return state.draft || state.project;
}

const undoStack = [];
const redoStack = [];
const MAX_HISTORY = 120;

export function commit(next, { history = true } = {}) {
  if (history && state.project) {
    undoStack.push(JSON.stringify(state.project));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
  }
  state.project = next;
  state.draft = null;
  validateSelection();
  scheduleSave();
  emit('project');
}

export function preview(next) {
  state.draft = next;
  emit('draft');
}

export function cancelPreview() {
  if (state.draft) {
    state.draft = null;
    emit('project');
  }
}

export function canUndo() {
  return undoStack.length > 0;
}
export function canRedo() {
  return redoStack.length > 0;
}
export function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(state.project));
  state.project = JSON.parse(undoStack.pop());
  state.draft = null;
  validateSelection();
  scheduleSave();
  emit('project');
}
export function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(state.project));
  state.project = JSON.parse(redoStack.pop());
  state.draft = null;
  validateSelection();
  scheduleSave();
  emit('project');
}

export function resetHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
}

function validateSelection() {
  const s = state.selection;
  if (!s) return;
  const p = state.project;
  const list = s.type === 'room' ? p.rooms : s.type === 'furniture' ? p.furniture || [] : p.openings;
  if (!list.some((x) => x.id === s.id)) state.selection = null;
}

export function setSnap(patch) {
  state.snap = { ...state.snap, ...patch };
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify(state.snap));
  } catch (e) { /* the preference just is not remembered */ }
  emit('snap');
}

export function setSelection(sel) {
  state.selection = sel;
  emit('selection');
}

export function setTool(tool) {
  state.tool = tool;
  emit('tool');
}

export function setHoverEdge(h) {
  state.hoverEdge = h;
  emit('hover');
}

// --- saving -------------------------------------------------------------------------
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

export function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!state.project) return;
  const before = state.saveError;
  try {
    localStorage.setItem(KEY, JSON.stringify(state.project));
    state.saveError = null;
  } catch (e) {
    state.saveError = 'ბრაუზერმა პროექტი ვერ შეინახა. „პროექტი“ მენიუდან შეინახე ის ფაილად, რომ ნამუშევარი არ დაიკარგოს.';
  }
  if (state.saveError !== before) emit('save');
}

// Write any pending change right away (page hidden, closed or reloaded). On phones the
// page is often frozen without a beforeunload event, so visibility changes count too.
export function flushSave() {
  if (saveTimer) saveNow();
}

export function saveImage() {
  try {
    if (state.planImageData) localStorage.setItem(IMG_KEY, state.planImageData);
    else localStorage.removeItem(IMG_KEY);
    return true;
  } catch (e) {
    state.saveError = 'გეგმის სურათი ძალიან დიდია ბრაუზერში შესანახად. პროექტი შეინახება, სურათი კი შემდეგ გახსნაზე ხელახლა უნდა ატვირთო.';
    return false;
  }
}

// Returns the saved project (or the sample when there is none). A saved project that cannot
// be read is copied to BACKUP_KEY before anything overwrites it, so it can still be
// recovered by hand; `notice` then tells the user what happened.
export function loadSaved() {
  let project = null;
  let img = null;
  let notice = null;
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    img = cleanPlanImage(localStorage.getItem(IMG_KEY));
  } catch (e) {
    raw = null;
  }
  if (raw) {
    const report = {};
    try {
      project = migrateProject(JSON.parse(raw), report);
    } catch (e) {
      project = null;
    }
    if (!project) {
      try {
        localStorage.setItem(BACKUP_KEY, raw);
      } catch (e) { /* nothing more can be done */ }
      notice = 'შენახული პროექტი დაზიანებულია და ვერ გაიხსნა. ნაჩვენებია ნიმუში; ძველი მონაცემები ბრაუზერში სარეზერვოდ შენახულია.';
    } else if (report.rooms || report.openings || report.furniture) {
      notice = droppedNotice(report);
    }
  }
  return { project: project || sampleProject(), image: project ? img : null, notice };
}

export function droppedNotice(report) {
  const parts = [];
  if (report.rooms) parts.push(`${report.rooms} ოთახი`);
  if (report.openings) parts.push(`${report.openings} კარი/ფანჯარა`);
  if (report.furniture) parts.push(`${report.furniture} ავეჯი`);
  return parts.length ? `არასწორი მონაცემის გამო გამოტოვებულია: ${parts.join(', ')}.` : null;
}

export function setPlanImage(input) {
  const dataUrl = cleanPlanImage(input);
  return new Promise((resolve) => {
    if (!dataUrl) {
      state.planImage = null;
      state.planImageData = null;
      saveImage();
      emit('image');
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      state.planImage = img;
      state.planImageData = dataUrl;
      saveImage();
      emit('image');
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
