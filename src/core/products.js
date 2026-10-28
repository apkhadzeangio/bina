// Product identity and provenance for every catalog entry.
//
// The catalog (catalog.js) holds what the estimate needs: price, measure, packs. This module
// adds what a buyer and the interior renderer need to trust a choice: who makes it, which
// shop page it comes from, when the price was read, whether that was re-checked, and what
// kind of picture exists for it. Nothing here is guessed: a field that the source does not
// state stays null and is shown as "not stated".
//
// Verification levels (strongest first):
//   verified    the product page was re-read on `checked`: name, code, price, unit and stock
//               matched what is recorded in VERIFIED below
//   listed      a page for this exact product was recorded with its price, not re-read since
//   indicative  the price comes from a category or collection page, or is a "from" price;
//               the exact product still has to be chosen in the shop
//   estimate    assembled from several products or calculated (sets, systems, articles)
//   preference  not a shop product: a described look (colour, surface, pattern)
//
// Pictures. The catalog ships NO product photographs. Retailer photos are not licensed for
// reuse, so they are neither copied nor hot-linked; the product page is linked instead.
// Every on-screen sample is drawn by the program from the recorded colour and size and is
// labelled as an approximation. A licensed photo can be attached through `IMAGES` once the
// rights are documented (see validateImage); the renderer then gets it as the real picture.
import { MATERIAL_LIST, MATERIALS, SHOPS, CATEGORIES, PRICES_CHECKED } from './catalog.js';

export const VERIFICATION = {
  verified: { rank: 0, label: 'გადამოწმებული', short: 'გადამოწმებული', desc: 'პროდუქტის გვერდი ხელახლა წავიკითხეთ: სახელი, კოდი, ფასი, ერთეული და მარაგი ემთხვევა.' },
  listed: { rank: 1, label: 'მაღაზიის გვერდიდან', short: 'მაღაზიიდან', desc: 'ფასი ამ კონკრეტული პროდუქტის გვერდიდანაა, მაგრამ ხელახლა არ გადამოწმებულა.' },
  indicative: { rank: 2, label: 'საორიენტაციო', short: 'საორიენტაციო', desc: 'ფასი კატეგორიის ან კოლექციის გვერდიდანაა ან „-დან“ ფასია. კონკრეტული პროდუქტი მაღაზიაში დასაზუსტებელია.' },
  estimate: { rank: 3, label: 'შეფასება', short: 'შეფასება', desc: 'შედგენილია რამდენიმე პროდუქტიდან ან გამოთვლილია. ეს ერთი კონკრეტული პროდუქტი არ არის.' },
  preference: { rank: 4, label: 'დიზაინის არჩევანი', short: 'არჩევანი', desc: 'მაღაზიის პროდუქტი არ არის: აღწერს სასურველ ფერს, ზედაპირს და ფაქტურას.' },
};

export const AVAILABILITY = {
  in_stock: 'მარაგშია',
  out_of_stock: 'მარაგში არ არის',
  unknown: 'მარაგი არ შემოწმებულა',
};

// --------------------------------------------------------------------------------- evidence
// Pages re-read on 28.10.2026. `fields` is what the page itself showed; anything the page
// did not state is left out rather than filled in.
const V = (o) => ({ checked: '2026-10-28', currency: 'GEL', availability: 'in_stock', ...o });
export const VERIFIED = {
  lam_kt502: V({ retailerCode: '5068978', price: 24.5, unit: 'm2', fields: { name: 'Laminate flooring KT 502 LUSSAC ASH', brand: 'Kastamonu Entegre', size: '8 × 197 × 1205 მმ', grade: '31', perPack: '10 ფილა' }, note: 'შეკვრის ფართი გვერდზე არ წერია; 2.374 მ² იგივე ზომის KT503-ის გვერდიდანაა.' }),
  lam_kt503: V({ retailerCode: '5068979', price: 24.5, unit: 'm2', fields: { name: 'KT503 08X197X1205 BOZ YAZI OTN 31 Class 2.374 მ²', brand: 'Kastamonu Entegre', origin: 'თურქეთი', size: '8 × 197 × 1205 მმ', grade: '31', perPack: '10 ფილა, 2.374 მ²' } }),
  lam_kt405: V({ retailerCode: '5053746', price: 25.5, unit: 'm2', fields: { name: 'KT405 08X197X1205 CANYON MEŞE OTN 32 Class 1.899 მ²', brand: 'Kastamonu Entegre', origin: 'თურქეთი', size: '8 × 197 × 1205 მმ', grade: '32', perPack: '8 ფილა' } }),
  lam_se002: V({ retailerCode: '5080102', price: 38.5, unit: 'm2', fields: { name: 'STEPXL SE002 12X195X1202 AC5 CANYON OAK (OTN) 33 class', brand: 'Kastamonu Entegre', size: '12 × 195 × 1202', grade: '33, AC5', perPack: '8 ფილა, 1.87 მ²' } }),
  lam_se010: V({ retailerCode: '5080260', price: 38.5, unit: 'm2', fields: { name: 'STEPXL SE010 12X195X1202 AC5 TOKYO (OTN) 33 class', brand: 'Kastamonu Entegre', size: '12 × 195 × 1202', grade: '33, AC5', perPack: '8 ფილა, 1.87 მ²' } }),
  paint_mid_white: V({ retailerCode: '01-ΣΛX-10', price: 200, unit: 'bucket', fields: { name: 'STEP-LATEX HIGH LEVEL WHITE 10LT', brand: 'CHROMODOMI', volume: '10 ლ' }, note: 'დაფარვის ნორმა გვერდზე რიცხვით არ წერია; გამოთვლაში 10 მ²/ლ არის დაშვება.' }),
  // The tinted colours below are this base with a colour chosen in the shop.
  paint_mid_greige: V({ retailerCode: '03-XΛ3-10', price: 180, unit: 'bucket', base: true, fields: { name: 'STEP-LATEX HIGH LEVEL (BASE TR) 10LT', brand: 'CHROMODOMI', volume: '10 ლ' } }),
};
// Every tinted mid-range colour is the same verified base product.
for (const id of ['paint_mid_warm', 'paint_mid_sage', 'paint_mid_clay', 'paint_mid_blue', 'paint_mid_graphite']) VERIFIED[id] = VERIFIED.paint_mid_greige;

// --------------------------------------------------------------------------------- identity
// Manufacturer as named by the product page or the product name; null when not stated.
const MAKER = {
  lam_kt205: 'Kastamonu Entegre', lam_kt502: 'Kastamonu Entegre', lam_kt503: 'Kastamonu Entegre', lam_kt405: 'Kastamonu Entegre',
  lam_se002: 'Kastamonu Entegre', lam_se010: 'Kastamonu Entegre',
  pg_rock: 'Jordan Tile', pg_jambo: 'Goldis', pg_milenario: 'Bien', pg_alexix: 'Bien', pg_castagna: 'Majorca', pg_rovere: 'Kütahya Seramik',
  wt_void_bone: 'Bien', wt_enzo: 'Bien', wt_metro: 'Vitra',
  paint_mid_white: 'Chromodomi', paint_mid_warm: 'Chromodomi', paint_mid_greige: 'Chromodomi', paint_mid_sage: 'Chromodomi',
  paint_mid_clay: 'Chromodomi', paint_mid_blue: 'Chromodomi', paint_mid_graphite: 'Chromodomi',
  paint_prem_white: 'Marshall', paint_prem_warm: 'Marshall',
  cons_adhesive: 'Weber', cons_grout: 'Weber', cons_putty: 'Knauf', cons_waterproof: 'FOX', cons_primer: 'FW',
};

// What the recorded source page is. Default: a page for this exact product ('product').
const SOURCE_KIND = {
  eng_f4e: 'collection', eng_herring: 'collection', eng_wide: 'category',
  st_volcano: 'category', st_juliet: 'category', st_sahara: 'category', st_nero_mist: 'category', st_fairy: 'category',
  st_calacatta: 'category', st_carrara: 'category', st_taj: 'category', st_marquina: 'category',
  st_acrylic: 'article', ceil_gypsum: 'computed', ceil_stretch: 'price-list',
  san_bath_econ: 'composite', san_bath_mid: 'composite', san_bath_prem: 'composite',
  san_wc_econ: 'composite', san_wc_mid: 'composite', san_wc_prem: 'composite',
  cons_grout: 'category', cons_putty: 'category',
  // The three skirting profiles were recorded with the same page (the "Simple" one).
  sk_greece: 'shared-page', sk_modern: 'shared-page',
};

// A single named product (true) or a type of material / a set / a service (false).
const GENERIC = new Set(['eng_herring', 'eng_wide', 'st_acrylic', 'ceil_gypsum', 'ceil_stretch',
  'san_bath_econ', 'san_bath_mid', 'san_bath_prem', 'san_wc_econ', 'san_wc_mid', 'san_wc_prem']);

// Licensed product photographs, by material id. Empty on purpose: see the header comment.
export const IMAGES = {};

// Where a licensed image may live: inside this site's own asset folder, never on a
// retailer's server (links there break and the right to reuse them is not ours).
export const ASSET_PREFIX = '/assets/materials/';
export const IMAGE_LICENSES = {
  own: 'საკუთარი ფოტო',
  permission: 'მწარმოებლის/მაღაზიის წერილობითი ნებართვა',
  'cc-by': 'CC BY',
  cc0: 'CC0',
};

// An image record is usable only with a local path, a licence, the rights holder and the
// date the permission was checked. Returns a list of problems (empty = valid).
export function validateImage(img) {
  const problems = [];
  if (!img || typeof img !== 'object') return ['ჩანაწერი არ არის'];
  if (typeof img.path !== 'string' || !img.path.startsWith(ASSET_PREFIX) || /\.\.|^\/\//.test(img.path)) problems.push('path must be inside ' + ASSET_PREFIX);
  if (!/\.(jpe?g|png|webp)$/i.test(img.path || '')) problems.push('raster image only');
  if (!IMAGE_LICENSES[img.license]) problems.push('unknown licence');
  if (!img.holder) problems.push('rights holder missing');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(img.checked || '')) problems.push('permission date missing');
  if (img.license === 'permission' && !img.permissionRef) problems.push('permission reference missing');
  return problems;
}

// --------------------------------------------------------------------------------- derived look
function rgb(hex) {
  const h = String(hex || '#888888').replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function hsl(hex) {
  const [r, g, b] = rgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { h: hue, s, l };
}

export const COLOR_FAMILIES = {
  white: { label: 'თეთრი', en: 'white' },
  beige: { label: 'ღია / ბეჟი', en: 'light beige' },
  wood: { label: 'ხის ტონი', en: 'wood-toned' },
  grey: { label: 'ნაცრისფერი', en: 'grey' },
  dark: { label: 'მუქი', en: 'dark' },
  color: { label: 'ფერადი', en: 'coloured' },
};

// Colour family of the drawn sample; used for filtering, not as a product fact.
export function colorFamily(hex, kind) {
  const { h, s, l } = hsl(hex);
  if (l < 0.33) return 'dark';
  // Wood and wood-look finishes: split by lightness so "light oak" and "walnut" differ.
  if (kind === 'plank' || kind === 'herringbone' || kind === 'wood') return l > 0.7 ? 'beige' : l < 0.42 ? 'dark' : 'wood';
  if (l > 0.9 && s < 0.25) return 'white';
  if (s < 0.1) return 'grey';
  if (h >= 18 && h <= 52 && s < 0.55) return l < 0.68 ? 'wood' : 'beige';
  if (s < 0.1) return 'grey';
  return 'color';
}

const PATTERN = {
  plank: { label: 'ფიცარი', en: 'wood planks' },
  herringbone: { label: 'ნაძვისებრი', en: 'herringbone wood' },
  tile: { label: 'ფილა', en: 'tiles' },
  stone: { label: 'ქვა', en: 'stone slab' },
  paint: { label: 'ღებვა', en: 'painted surface' },
  flat: { label: 'ერთფეროვანი', en: 'plain surface' },
};
const TILE_PATTERN = {
  plain: 'plain', marble: 'marble-look', stone: 'stone-look', concrete: 'concrete-look', wood: 'wood-look', zellige: 'glazed handmade-look',
};
const STONE_PATTERN = { speckle: 'fine speckled', marble: 'veined marble-look', travertine: 'travertine-look' };

function finishOf(m) {
  const t = `${m.name} ${m.spec}`.toLowerCase();
  if (m.look?.gloss || /პრიალა|glossy|brillo/.test(t)) return { key: 'gloss', label: 'პრიალა', en: 'glossy' };
  if (/გაპრიალებ|lap|polished/.test(t)) return { key: 'polished', label: 'გაპრიალებული', en: 'polished' };
  if (/დაქლიბ/.test(t)) return { key: 'honed', label: 'დაქლიბული', en: 'honed' };
  if (/მატი|matt|mat\b|mate\b/.test(t)) return { key: 'matt', label: 'მატი', en: 'matt' };
  return null; // not stated
}

function thicknessMm(m) {
  const x = /(\d+(?:[.,]\d+)?)\s*მმ/.exec(m.spec || '');
  return x ? Number(x[1].replace(',', '.')) : null;
}

// Size of one plank / tile / panel in metres, as recorded (null for continuous surfaces).
export function unitSize(m) {
  const k = m.look?.kind;
  if (k === 'plank' || k === 'herringbone') return { length: m.look.l, width: m.look.w };
  if (k === 'tile') return { length: Math.max(m.look.w, m.look.h), width: Math.min(m.look.w, m.look.h) };
  return null;
}

function sellUnit(m) {
  switch (m.measure) {
    case 'area':
      if (m.pack?.label === 'შეკვრა') return { key: 'pack', label: `შეკვრა ${m.pack.size} მ²; ფასი მ²-ზე` };
      if (m.pack?.label === 'ფილა') return { key: 'tile', label: 'მთელი ფილა; ფასი მ²-ზე' };
      return { key: 'm2', label: 'მ²' };
    case 'paint': return { key: 'bucket', label: `ვედრო ${m.pack.size} ლ` };
    case 'length': return { key: 'm', label: 'გრძივი მეტრი' };
    case 'count': return { key: m.cat.startsWith('sanitary') ? 'set' : 'pcs', label: m.cat.startsWith('sanitary') ? 'კომპლექტი' : 'ცალი' };
    case 'pack': return { key: 'pack', label: m.pack.label };
    default: return { key: 'none', label: 'შეკვეთით' };
  }
}

function priceBasis(m, kind) {
  const note = m.source?.note || '';
  if (m.price === null || m.price === undefined) return null;
  if (kind === 'composite' || kind === 'computed') return 'computed';
  if (/ფასდაკლებით/.test(note)) return 'discounted';
  if (/„-დან“|-დან/.test(note)) return 'from';
  return 'list';
}

const PRICE_BASIS = { list: 'ფასი', discounted: 'ფასდაკლებით', from: '„-დან“ ფასი', computed: 'გამოთვლილი' };

function verificationOf(m, kind) {
  if (m.preference) return 'preference';
  if (VERIFIED[m.id]) return 'verified';
  if (kind === 'composite' || kind === 'computed' || kind === 'article') return 'estimate';
  if (kind === 'category' || kind === 'collection' || kind === 'price-list' || kind === 'shared-page') return 'indicative';
  if (/„-დან“/.test(m.source?.note || '')) return 'indicative';
  return 'listed';
}

// --------------------------------------------------------------------------------- records
function build(m) {
  const kind = m.preference ? null : (SOURCE_KIND[m.id] || 'product');
  const status = verificationOf(m, kind);
  const ev = VERIFIED[m.id] || null;
  const look = m.look || {};
  const family = colorFamily(look.base, look.kind === 'tile' && look.pattern === 'wood' ? 'wood' : look.kind);
  const fin = finishOf(m);
  const pattern = PATTERN[look.kind] || PATTERN.flat;
  const image = IMAGES[m.id] && validateImage(IMAGES[m.id]).length === 0 ? IMAGES[m.id] : null;
  const shop = m.source ? { key: m.source.shop, label: SHOPS[m.source.shop]?.label || m.source.shop, url: SHOPS[m.source.shop]?.url || null } : null;
  return Object.freeze({
    id: m.id,
    name: m.name,
    category: m.cat,
    categoryLabel: CATEGORIES[m.cat],
    manufacturer: MAKER[m.id] || (ev?.fields?.brand ?? null),
    retailerCode: ev?.retailerCode || null,
    description: m.spec,
    singleProduct: !m.preference && !GENERIC.has(m.id) && kind !== 'composite',
    sellUnit: sellUnit(m),
    size: m.cat === 'cabinet_front' ? null : unitSize(m), // metres; fronts are made to size
    thicknessMm: thicknessMm(m),
    color: { hex: look.base || null, family, familyLabel: COLOR_FAMILIES[family].label, approximate: true },
    finish: fin,
    pattern: {
      kind: look.kind || 'flat',
      label: pattern.label,
      en: m.cat === 'cabinet_front' ? (look.kind === 'plank' ? 'wood-grain panels' : 'flat panels')
        : look.kind === 'tile' ? `${TILE_PATTERN[look.pattern] || 'plain'} tiles` : look.kind === 'stone' ? `${STONE_PATTERN[look.pattern] || ''} stone`.trim() : pattern.en,
      stagger: !!look.stagger,
      veinHex: look.vein || null,
    },
    retailer: shop,
    sourceUrl: m.source?.url || null,
    sourceKind: kind,
    sourceNote: m.source?.note || null,
    price: m.price === null || m.price === undefined ? null : {
      amount: m.price,
      currency: 'GEL',
      basis: priceBasis(m, kind),
      basisLabel: PRICE_BASIS[priceBasis(m, kind)],
      checked: ev?.checked || m.source?.checked || PRICES_CHECKED,
    },
    verification: {
      status,
      label: VERIFICATION[status].label,
      checked: ev?.checked || null,
      evidence: ev ? { fields: ev.fields, note: ev.note || null, base: !!ev.base } : null,
    },
    availability: ev ? { status: ev.availability, checked: ev.checked } : { status: 'unknown', checked: null },
    image, // licensed photo or null
    // The retailer's own photo: only linked (on its product page), never copied.
    retailerPhoto: kind === 'product' && m.source?.url ? { linkOnly: true, pageUrl: m.source.url } : null,
    swatch: { synthetic: true },
    tier: m.tier,
    styles: m.styles || [],
  });
}

export const PRODUCTS = Object.freeze(Object.fromEntries(MATERIAL_LIST.map((m) => [m.id, build(m)])));

export function product(id) {
  return PRODUCTS[id] || null;
}

// The three kinds of visual reference the renderer must keep apart.
export const REF_KINDS = {
  'product-image': { label: 'რეალური პროდუქტი, ფოტოთი', desc: 'კონკრეტული პროდუქტი ლიცენზირებული ფოტოთი.' },
  'product-approx': { label: 'რეალური პროდუქტი, მიახლოებითი ნიმუში', desc: 'კონკრეტული პროდუქტი; ნიმუში დახატულია ფერისა და ზომის მიხედვით, ფოტო არ არის.' },
  preference: { label: 'დიზაინის არჩევანი', desc: 'სასურველი ფერი და ფაქტურა, კონკრეტული პროდუქტის გარეშე.' },
};

export function refKind(p) {
  if (!p) return 'preference';
  if (p.image) return 'product-image';
  if (p.singleProduct && ['verified', 'listed', 'indicative'].includes(p.verification.status)) return 'product-approx';
  return 'preference';
}

// Ids kept stable forever: saved projects reference them. A renamed product gets an alias.
export const ALIASES = {};
export function resolveId(id) {
  return MATERIALS[id] ? id : ALIASES[id] || null;
}
