// First-use welcome and the help dialog. Both are native <dialog> elements opened with
// showModal(), so focus is trapped inside, Esc closes them and the page behind is inert.
import { h, add, clear, icon } from './dom.js';

const WELCOMED_KEY = 'bina-designer:welcomed:v1';

export const JOURNEY = [
  { icon: 'upload', title: 'ატვირთე ან დახაზე ბინის გეგმა', text: 'დეველოპერის გეგმა (სურათი ან PDF) ან ოთახები ბადეზე, ზუსტი ზომებით.' },
  { icon: 'layers', title: 'შეარჩიე ინტერიერი და მასალები', text: 'სტილი, ბიუჯეტი და მასალა თითოეულ ზედაპირზე — 3D ხედით.' },
  { icon: 'coins', title: 'მიიღე ხარჯთაღრიცხვა', text: 'რა, რამდენი და სად იყიდო, მიახლოებითი ფასებით.' },
];

const GESTURES = [
  ['ოთახის ან კარის არჩევა', 'დააჭირე (ან შეეხე) მას'],
  ['კედლის ან კუთხის გადაწევა', 'არჩეულ ოთახზე გადაათრიე კედელი ან კუთხე'],
  ['ოთახის გადაადგილება', 'არჩეული ოთახი გადაათრიე; ტელეფონზე — ჯერ დააჭირე და გააჩერე თითი'],
  ['გეგმის გადაადგილება', 'ცარიელ ადგილზე გადათრევა; ტელეფონზე — ერთი ან ორი თითი'],
  ['გადიდება / დაპატარავება', 'მაუსის ბორბალი ან ორი თითის გაშლა'],
];

const SHORTCUTS = [
  ['V', 'არჩევა'],
  ['R', 'მართკუთხა ოთახი'],
  ['P', 'რთული ფორმა'],
  ['D', 'კარი'],
  ['W', 'ფანჯარა'],
  ['Ctrl + Z', 'დაბრუნება'],
  ['Ctrl + Shift + Z', 'გამეორება'],
  ['Delete', 'არჩეულის წაშლა'],
  ['← ↑ → ↓', 'არჩეულის გადაწევა 1 სმ-ით (Shift — 10 სმ)'],
  ['Space + გადათრევა', 'გეგმის გადაადგილება'],
  ['Enter', 'რთული ფორმის დახურვა'],
  ['Esc', 'გაუქმება'],
  ['?', 'ეს დახმარება'],
];

export function firstVisit() {
  try {
    return !localStorage.getItem(WELCOMED_KEY);
  } catch (e) {
    return false;
  }
}

function markWelcomed() {
  try {
    localStorage.setItem(WELCOMED_KEY, '1');
  } catch (e) { /* private mode: the welcome simply shows again next time */ }
}

function journeyList(cls) {
  return h('ol', { class: `journey ${cls || ''}` }, JOURNEY.map((s, i) => h('li', null,
    h('span', { class: 'journey-n', 'aria-hidden': 'true' }, String(i + 1)),
    h('span', { class: 'journey-ic' }, icon(s.icon, 22)),
    h('span', { class: 'journey-txt' }, h('b', null, s.title), h('span', null, s.text)))));
}

export function createOnboarding({ onUpload, onDraw, onSample }) {
  const dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'modal-title' });
  document.body.append(dlg);
  let afterClose = null;
  dlg.addEventListener('close', () => {
    const fn = afterClose;
    afterClose = null;
    fn?.();
  });
  // A click on the backdrop (outside the panel) closes the dialog.
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close();
  });

  function open(build) {
    clear(dlg);
    build();
    if (dlg.open) dlg.close();
    dlg.showModal();
    dlg.querySelector('[data-autofocus]')?.focus();
  }

  function closeThen(fn) {
    afterClose = fn;
    dlg.close();
  }

  function showWelcome() {
    open(() => {
      dlg.className = 'modal modal-welcome';
      add(dlg,
        h('div', { class: 'modal-body' },
          h('p', { class: 'eyebrow' }, 'ბინის დიზაინერი'),
          h('h2', { id: 'modal-title' }, 'სამი ნაბიჯი ბინის რემონტის ბიუჯეტამდე'),
          journeyList(),
          h('div', { class: 'welcome-actions' },
            h('button', { type: 'button', class: 'btn btn-accent btn-lg', 'data-autofocus': true, onclick: () => closeThen(onUpload) }, icon('upload', 18), 'ატვირთე გეგმა'),
            h('button', { type: 'button', class: 'btn btn-lg', onclick: () => closeThen(onDraw) }, icon('pencil', 18), 'დახაზე ბადეზე')),
          h('button', { type: 'button', class: 'link welcome-sample', onclick: () => closeThen(onSample) }, 'ჯერ ნიმუშს დავათვალიერებ'),
          h('p', { class: 'muted small' }, 'პროექტი ავტომატურად ინახება ამ ბრაუზერში. ანგარიში საჭირო არ არის.')),
      );
    });
    markWelcomed();
  }

  function showHelp() {
    open(() => {
      dlg.className = 'modal modal-help';
      add(dlg,
        h('div', { class: 'modal-head' },
          h('h2', { id: 'modal-title' }, 'დახმარება'),
          h('button', { type: 'button', class: 'btn btn-ghost icon-btn', 'aria-label': 'დახურვა', 'data-autofocus': true, onclick: () => dlg.close() }, icon('close', 20))),
        h('div', { class: 'modal-body' },
          h('section', null, h('h3', null, 'ნაბიჯები'), journeyList('journey-compact')),
          h('section', null, h('h3', null, 'გეგმაზე მუშაობა'),
            h('dl', { class: 'kv-list' }, GESTURES.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]))),
          h('section', { class: 'help-keys' }, h('h3', null, 'კლავიატურა'),
            h('dl', { class: 'kv-list keys' }, SHORTCUTS.map(([k, v]) => [h('dt', null, h('kbd', null, k)), h('dd', null, v)]))),
          h('section', null, h('h3', null, 'ზომები'),
            h('p', null, 'ოთახის კედლის ზუსტი სიგრძე ჩაწერე მარჯვენა (ტელეფონზე — ქვედა) პანელში. ატვირთულ გეგმაზე ჯერ დააყენე მასშტაბი: მონიშნე ცნობილი ზომის ორი წერტილი.')),
          h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn btn-sm', onclick: () => showWelcome() }, 'მისასალმებელი ეკრანი'))),
      );
    });
  }

  return { showWelcome, showHelp, get open() { return dlg.open; } };
}
