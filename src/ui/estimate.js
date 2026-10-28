// Step 3: purchase list, room measurement sheet and the assumptions behind them.
import { state, current, subscribe } from './store.js';
import { PURPOSES, roomLabel } from '../core/model.js';
import { MATERIAL_LIST, CATEGORIES, UNITS, SHOPS, PRICES_CHECKED, priceLabel, shopLabel, CATALOG_NOTE } from '../core/catalog.js';
import { computeEstimate, CONSUMPTION } from '../core/quantities.js';
import { GEOMETRY_RULES } from '../core/measure.js';
import { SURFACES, GLOBAL_SURFACES } from '../core/finishes.js';
import { h, add, clear, icon, fmtNum, fmtArea, fmtLen, fmtMoney, copyText, toast } from './dom.js';

/* global __SITE__ */ // true only in the lithos.ge build, where file downloads work

function netLabel(l) {
  const m = l.material;
  switch (m.measure) {
    case 'area':
    case 'paint': return fmtArea(l.net.area);
    case 'length': return fmtLen(l.net.length, 1);
    case 'count': return `${fmtNum(l.net.count, 0)} ${m.cat.startsWith('sanitary') ? 'კომპლ.' : 'ც'}`;
    case 'pack': return `${fmtNum(l.net.base, 1)} ${UNITS[m.baseUnit]}`;
    default: return '';
  }
}

function buyLabel(l) {
  const m = l.material;
  if (m.measure === 'count') return netLabel(l);
  if (l.packs !== null && l.packs !== undefined) {
    if (m.pack.label === UNITS[m.pack.unit]) return `${fmtNum(l.amount, 0)} ${UNITS[l.unit]}`; // sold by the unit
    const amount = m.measure === 'length' ? fmtLen(l.amount, 1) : `${fmtNum(l.amount, m.measure === 'area' ? 2 : 0)} ${UNITS[l.unit]}`;
    return `${l.packs} ${m.pack.label} · ${amount}`;
  }
  return m.measure === 'length' ? fmtLen(l.amount, 1) : fmtArea(l.amount);
}

function whereLabel(l, p) {
  if (l.material.cat === 'consumable') return '—';
  if (!l.rooms.length) {
    const s = l.surfaces[0];
    return GLOBAL_SURFACES[s]?.label || '—';
  }
  const names = l.rooms.map((id) => p.rooms.find((r) => r.id === id)).filter(Boolean).map((r) => roomLabel(r, p.rooms));
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
}

export function estimateTSV(est, p) {
  const rows = [['ჯგუფი', 'მასალა', 'სპეციფიკაცია', 'სად', 'საჭირო', 'შესაძენი', 'ერთეულის ფასი', 'ჯამი, ₾', 'მაღაზია', 'ბმული', 'შენიშვნა']];
  for (const g of est.groups) {
    for (const l of g.lines) {
      const m = l.material;
      rows.push([g.label, m.name, m.spec, whereLabel(l, p), netLabel(l), buyLabel(l), priceLabel(m), Math.round(l.cost), shopLabel(m), m.source?.url || '', m.source?.note || '']);
    }
  }
  rows.push(['', '', '', '', '', '', 'სულ', Math.round(est.total), '', '', `ფასები: ${PRICES_CHECKED}`]);
  return rows.map((r) => r.map((c) => String(c).replace(/[\t\n]/g, ' ').replace(/[  ]/g, ' ')).join('\t')).join('\n');
}

function download(name, mime, text) {
  const blob = new Blob(['﻿' + text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function createEstimateStep({ el, onGoPlan }) {
  let tab = 'buy';
  const fallback = h('textarea', { class: 'copy-fallback', hidden: true, 'aria-label': 'დასაკოპირებელი ტექსტი', readonly: true });

  function render() {
    clear(el);
    const p = current();
    if (!p.rooms.length) {
      add(el, h('div', { class: 'empty' },
        h('h2', null, 'ჯერ ოთახები არ არის'),
        h('p', null, 'ხარჯთაღრიცხვა ბინის გეგმიდან ითვლება.'),
        h('button', { type: 'button', class: 'btn btn-accent', onclick: onGoPlan }, 'გეგმაზე დაბრუნება')));
      return;
    }
    const est = computeEstimate(p);
    const T = est.measured.totals;

    const copyBtn = h('button', {
      type: 'button',
      class: 'btn btn-sm',
      onclick: async () => {
        const ok = await copyText(estimateTSV(est, p), fallback);
        toast(ok ? 'ცხრილი დაკოპირდა. ჩასვი Excel-ში ან Google Sheets-ში.' : 'მონიშნული ტექსტი დააკოპირე ხელით (Ctrl+C).', ok ? 'ok' : 'info');
      },
    }, icon('copy', 16), 'კოპირება Excel-ისთვის');
    const csvBtn = __SITE__ ? h('button', {
      type: 'button',
      class: 'btn btn-sm',
      onclick: () => download(`${p.name || 'bina'} - xarjtaghricxva.csv`, 'text/csv;charset=utf-8', estimateTSV(est, p).split('\n').map((r) => r.split('\t').map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')),
    }, icon('download', 16), 'CSV') : null;

    const metric = (label, value) => h('div', { class: 'metric' }, h('span', null, label), h('b', { class: 'num' }, value));
    add(el, 
      h('header', { class: 'est-head' },
        h('div', { class: 'est-total' },
          h('div', { class: 'eyebrow' }, 'მასალების სავარაუდო ღირებულება'),
          h('div', { class: 'total num' }, fmtMoney(est.total)),
          h('p', { class: 'muted small' }, 'სამუშაო არ შედის, გარდა ჭიმვადი და თაბაშირ-მუყაოს ჭერისა, რომელთა ფასი მონტაჟით არის. ქვის ფასს ჭრა და მონტაჟი ემატება. ', CATALOG_NOTE)),
        h('div', { class: 'metrics' },
          metric('საცხოვრებელი ფართი', fmtArea(T.interiorArea)),
          T.outdoorArea > 0 ? metric('აივანი / ლოჯია', fmtArea(T.outdoorArea)) : null,
          metric('შესაღები კედლები', fmtArea(T.wallPaintArea)),
          metric('ფილა კედლებზე', fmtArea(T.wallTileArea)),
          metric('ჭერი', fmtArea(T.ceilingArea)),
          metric('პლინტუსი', fmtLen(T.skirtingLength, 1)),
          metric('კარები / ფანჯრები', `${T.doorCount} / ${T.windowCount}`)),
        h('div', { class: 'est-actions' }, copyBtn, csvBtn),
        fallback),
      h('div', { class: 'tabs tabs-lg', role: 'tablist' },
        [['buy', 'შესაძენი სია'], ['rooms', 'ფართობები ოთახებით'], ['rules', 'როგორ ითვლება']].map(([k, label]) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', class: `tab${tab === k ? ' on' : ''}`, onclick: () => { tab = k; render(); },
        }, label))),
    );

    if (tab === 'buy') add(el, buyTable(est, p));
    if (tab === 'rooms') add(el, roomsTable(est, p));
    if (tab === 'rules') add(el, rules());
  }

  function buyTable(est, p) {
    const body = [];
    for (const g of est.groups) {
      body.push(h('tr', { class: 'grp' }, h('th', { colspan: '6', scope: 'rowgroup' }, g.label), h('td', { class: 'num r' }, fmtMoney(g.cost))));
      for (const l of g.lines) {
        const m = l.material;
        body.push(h('tr', null,
          h('td', null,
            h('div', { class: 'cell-name' }, m.name),
            h('div', { class: 'cell-spec' }, m.spec),
            m.source?.note ? h('div', { class: 'cell-note' }, m.source.note) : null),
          h('td', { class: 'cell-where' }, whereLabel(l, p)),
          h('td', { class: 'num' }, netLabel(l)),
          h('td', { class: 'num' }, buyLabel(l)),
          h('td', { class: 'num muted' }, priceLabel(m)),
          h('td', null, m.source?.url
            ? h('a', { class: 'shop', href: m.source.url, target: '_blank', rel: 'noopener noreferrer' }, shopLabel(m))
            : shopLabel(m)),
          h('td', { class: 'num r' }, h('b', null, fmtMoney(l.cost)))));
      }
    }
    body.push(h('tr', { class: 'sum' }, h('th', { colspan: '6', scope: 'row' }, 'სულ მასალები'), h('td', { class: 'num r' }, fmtMoney(est.total))));
    return h('div', { class: 'table-wrap' },
      h('table', { class: 'est-table' },
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, 'მასალა'), h('th', { scope: 'col' }, 'სად'), h('th', { scope: 'col' }, 'საჭირო'),
          h('th', { scope: 'col' }, 'შესაძენი, დანაკარგით'), h('th', { scope: 'col' }, 'ფასი'), h('th', { scope: 'col' }, 'მაღაზია'), h('th', { scope: 'col', class: 'r' }, 'ჯამი'))),
        h('tbody', null, body)));
  }

  function roomsTable(est, p) {
    const rows = est.measured.rooms.map((m) => {
      const r = p.rooms.find((x) => x.id === m.id);
      const pur = PURPOSES[m.purpose];
      return h('tr', null,
        h('td', null, roomLabel(r, p.rooms)),
        h('td', { class: 'num' }, fmtNum(m.area, 2)),
        h('td', { class: 'num' }, pur.outdoor ? '—' : fmtNum(m.height, 2)),
        h('td', { class: 'num' }, pur.outdoor ? '—' : fmtNum(m.wallNet, 2)),
        h('td', { class: 'num' }, m.wallPaintArea > 0 ? fmtNum(m.wallPaintArea, 2) : '—'),
        h('td', { class: 'num' }, m.wallTileArea > 0 ? fmtNum(m.wallTileArea, 2) : '—'),
        h('td', { class: 'num' }, m.backsplashArea > 0 ? fmtNum(m.backsplashArea, 2) : '—'),
        h('td', { class: 'num' }, m.ceilingArea > 0 ? fmtNum(m.ceilingArea, 2) : '—'),
        h('td', { class: 'num' }, m.skirtingLength > 0 ? fmtNum(m.skirtingLength, 2) : '—'));
    });
    const T = est.measured.totals;
    const sum = (k) => est.measured.rooms.reduce((s, m) => s + m[k], 0);
    rows.push(h('tr', { class: 'sum' },
      h('th', { scope: 'row' }, 'სულ'),
      h('td', { class: 'num' }, fmtNum(T.area, 2)), h('td', null, ''),
      h('td', { class: 'num' }, fmtNum(T.wallNet, 2)), h('td', { class: 'num' }, fmtNum(T.wallPaintArea, 2)),
      h('td', { class: 'num' }, fmtNum(T.wallTileArea, 2)), h('td', { class: 'num' }, fmtNum(sum('backsplashArea'), 2)),
      h('td', { class: 'num' }, fmtNum(T.ceilingArea, 2)), h('td', { class: 'num' }, fmtNum(T.skirtingLength, 2))));
    return h('div', null,
      h('p', { class: 'muted small' }, 'ფართობები მ²-ში, სიგრძეები მეტრებში. კედლები ითვლება კარების, ღიობების და ფანჯრების გამოკლებით, დანაკარგის გარეშე. ეს ცხრილი ხელოსანს ან სამშენებლო კომპანიას შეგიძლია გადასცე.'),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'est-table rooms-table' },
          h('thead', null, h('tr', null,
            ['ოთახი', 'იატაკი', 'სიმაღლე', 'კედლები', 'შეღებვა', 'ფილა', 'ფარტუხი', 'ჭერი', 'პლინტუსი, მ'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', null, rows))));
  }

  function rules() {
    const wastes = new Map();
    for (const m of MATERIAL_LIST) {
      if (!m.waste) continue;
      const k = CATEGORIES[m.cat];
      if (!wastes.has(k)) wastes.set(k, new Set());
      wastes.get(k).add(Math.round(m.waste * 100));
    }
    const G = GEOMETRY_RULES;
    const C = CONSUMPTION;
    const li = (t) => h('li', null, t);
    return h('div', { class: 'rules' },
      h('section', null, h('h3', null, 'გაზომვა'), h('ul', null,
        li('იატაკი და ჭერი: ოთახის შიდა კონტურის ფართი.'),
        li('კედლები: პერიმეტრი × ჭერის სიმაღლე, მინუს კარები, ღიობები და ფანჯრები. კარი ორივე ოთახის კედელს აკლდება.'),
        li('სველ წერტილებში ფილა ჭერამდე, თუ ოთახში სხვა სიმაღლე არ არის მითითებული.'),
        li(`სამზარეულო: გეგმაზე დახატული ქვედა კარადები. კედელთან მდგომს სამუშაო ზედაპირის სიღრმე ${fmtNum(G.counterDepth, 2)} მ და ფარტუხი ${fmtNum(G.backsplashHeight, 2)} მ ზედაპირის ზემოთ; კუნძულს — ზედაპირი მთელ კარადაზე, ფარტუხის გარეშე.`),
        li(`ნიჟარის ზედაპირი: აბაზანაში დახატული ნიჟარის კარადების ფართი, ან ერთი სტანდარტული ${fmtNum(G.vanityLength * 100, 0)} × ${fmtNum(G.vanityDepth * 100, 0)} სმ.`),
        li(`პლინტუსი: პერიმეტრი, მინუს კარები და სამზარეულოს ავეჯი. სველ წერტილებში და აივანზე არ ითვლება.`),
        li(`ფანჯრის რაფა: ფანჯრის სიგანე + ${fmtNum(G.sillExtra * 100, 0)} სმ, სიღრმე ${fmtNum(G.sillDepth * 100, 0)} სმ.`),
        li(`ჰიდროიზოლაცია: სველი ოთახის იატაკი და კედლები ${fmtNum(G.waterproofUpturn * 100, 0)} სმ სიმაღლეზე.`))),
      h('section', null, h('h3', null, 'დანაკარგი'), h('ul', null,
        [...wastes].map(([k, set]) => li(`${k}: ${[...set].sort((a, b) => a - b).join('–')}%`)),
        li('რაოდენობა მრგვალდება მთელ შეკვრამდე. ერთი და იგივე მასალა რამდენიმე ოთახში ჯერ ჯამდება, მერე მრგვალდება.'))),
      h('section', null, h('h3', null, 'ხარჯვის ნორმები'), h('ul', null,
        li('საღებავი: 2 ფენა, 10 მ²/ლ ერთ ფენაზე (ჭერი 9 მ²/ლ), +5%.'),
        li(`ფილის წებო: იატაკზე ${C.adhesiveFloor} კგ/მ², კედელზე ${C.adhesiveWall} კგ/მ².`),
        li(`ფუგა: ${C.grout} კგ/მ². გრუნტი: ${C.primer} ლ/მ². საფინიშო შპაკლი: ${C.putty} კგ/მ².`),
        li(`ჰიდროიზოლაცია: ${C.waterproof} კგ/მ² (2 ფენა). ქვესაგები: +${C.underlayExtra * 100}% გადაფარვა.`))),
      h('section', null, h('h3', null, 'ფასების წყარო'),
        h('p', { class: 'muted small' }, CATALOG_NOTE),
        h('ul', { class: 'shops' }, [...new Set(MATERIAL_LIST.map((m) => m.source?.shop).filter(Boolean))].map((k) => h('li', null,
          h('a', { href: SHOPS[k].url, target: '_blank', rel: 'noopener noreferrer' }, SHOPS[k].label))))),
    );
  }

  subscribe((kind) => {
    if (state.step === 'estimate' && kind === 'project') render();
  });
  return { show: render, render };
}
