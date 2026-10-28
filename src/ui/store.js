// App state, undo history and local saving.
import { sampleProject, migrateProject } from '../core/model.js';

const KEY = 'bina-designer:project:v1';
const IMG_KEY = 'bina-designer:plan-image:v1';

export const state = {
  project: null,
  draft: null, // temporary project while dragging; not in history
  selection: null, // { type: 'room' | 'opening', id }
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
  const ok = s.type === 'room' ? p.rooms.some((r) => r.id === s.id) : p.openings.some((o) => o.id === s.id);
  if (!ok) state.selection = null;
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
  try {
    localStorage.setItem(KEY, JSON.stringify(state.project));
    state.saveError = null;
  } catch (e) {
    state.saveError = 'ბრაუზერმა პროექტი ვერ შეინახა. გამოიყენე „ექსპორტი“, რომ ნამუშევარი არ დაიკარგოს.';
  }
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

export function loadSaved() {
  let project = null;
  let img = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) project = migrateProject(JSON.parse(raw));
    img = localStorage.getItem(IMG_KEY);
  } catch (e) {
    project = null;
  }
  return { project: project || sampleProject(), image: project ? img : null };
}

export function setPlanImage(dataUrl) {
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
