// Material catalog: products sold in Georgia, with the price, the shop and the page it
// was read from. Prices were collected on 28 October 2026 and change over time.
// Colour swatches are approximations made from the product name and description.
//
// measure:  'area'   → priced per m², bought in whole packs (or whole tiles) when pack is set
//           'paint'  → priced per bucket; litres = area × coats / coverage
//           'length' → priced per metre
//           'count'  → priced per piece / set
//           'pack'   → consumable priced per pack; quantity comes from the rules in quantities.js

export const PRICES_CHECKED = '2026-10-28';
export const CATALOG_NOTE = 'ფასები აღებულია მაღაზიების საიტებიდან 28.10.2026-ს და დროთა განმავლობაში იცვლება. ყიდვამდე გადაამოწმე. ფერის ნიმუში მიახლოებითია.';

export const SHOPS = {
  citadeli: { label: 'ციტადელი', url: 'https://citadeli.com' },
  nova: { label: 'ნოვა', url: 'https://nova.ge' },
  gorgia: { label: 'გორგია', url: 'https://gorgia.ge' },
  zodi: { label: 'ზოდი', url: 'https://zodi.ge' },
  allstone: { label: 'Allstone', url: 'https://allstone.ge' },
  parketi: { label: 'Parketi.ge', url: 'https://parketi.ge' },
  muxa: { label: 'Muxa.ge', url: 'https://muxa.ge' },
  vitra: { label: 'Vitra', url: 'https://vitra.com.ge' },
  wpc: { label: 'WPC.ge', url: 'https://wpc.ge' },
  cherihome: { label: 'Cherihome', url: 'https://cherihome.ge' },
  genabuild: { label: 'Genabuild', url: 'https://www.genabuild.com' },
  coridoor: { label: 'Coridoor', url: 'https://coridoor.ge' },
  homeis: { label: 'Home is. (სტატია)', url: 'https://www.homeis.ge' },
};

export const STYLES = {
  modern: { label: 'თანამედროვე', desc: 'ნეიტრალური ნაცრისფერი და თეთრი, დიდი ფორმატის ფილა, სუფთა ხაზები', cabinet: '#e9e8e4' },
  scandi: { label: 'სკანდინავიური', desc: 'ღია მუხა, თეთრი კედლები, ბევრი სინათლე', cabinet: '#f2f1ec' },
  warm: { label: 'თბილი ნატურალური', desc: 'ნატურალური მუხა, ბეჟი ქვა და თიხისფერი ტონები', cabinet: '#cdb79a' },
  classic: { label: 'ნეოკლასიკა', desc: 'ნაძვისებრი პარკეტი, მარმარილო, თბილი თეთრი', cabinet: '#ece6da' },
  loft: { label: 'ლოფტი', desc: 'ბეტონი, მუქი ხე, გრაფიტი და შავი დეტალები', cabinet: '#3e3f42' },
};
export const STYLE_ORDER = ['modern', 'scandi', 'warm', 'classic', 'loft'];

export const TIERS = {
  econ: { label: 'ეკონომი', desc: 'გამძლე, ხელმისაწვდომი მასალები' },
  mid: { label: 'საშუალო', desc: 'უკეთესი ხარისხი და ფორმატი' },
  prem: { label: 'პრემიუმი', desc: 'ნატურალური და დიდი ფორმატის მასალები' },
};
export const TIER_ORDER = ['econ', 'mid', 'prem'];

export const CATEGORIES = {
  floor_wood: 'ხის საფარი',
  tile_floor: 'კერამოგრანიტი',
  outdoor: 'გარე საფარი',
  tile_wall: 'კედლის ფილა',
  paint: 'საღებავი',
  ceiling: 'ჭერი',
  stone: 'ქვის ზედაპირი',
  door: 'კარი',
  skirting: 'პლინტუსი',
  sanitary_bath: 'სანტექნიკა — აბაზანა',
  sanitary_wc: 'სანტექნიკა — საპირფარეშო',
  consumable: 'დამხმარე მასალა',
};

export const UNITS = { m2: 'მ²', m: 'მ', pcs: 'ც', l: 'ლ', kg: 'კგ', set: 'კომპლ.' };

const ALL = ['modern', 'scandi', 'warm', 'classic', 'loft'];

const plank = (base, dark, w, l) => ({ kind: 'plank', base, dark, w, l });
const herring = (base, dark, w, l) => ({ kind: 'herringbone', base, dark, w, l });
const tile = (pattern, base, grout, w, h, extra = {}) => ({ kind: 'tile', pattern, base, grout, w, h, ...extra });
const paint = (base) => ({ kind: 'paint', base });
const flat = (base) => ({ kind: 'flat', base });
const stone = (pattern, base, extra = {}) => ({ kind: 'stone', pattern, base, ...extra });

const src = (shop, url, note) => ({ shop, url, checked: PRICES_CHECKED, note });

const M = [];
const add = (m) => M.push({ waste: 0, styles: [], pack: null, ...m });

// A tile sold by the square metre is still bought as whole tiles.
const perTile = (w, h) => ({ size: Math.round(w * h * 10000) / 10000, unit: 'm2', label: 'ფილა' });
const box = (size) => ({ size, unit: 'm2', label: 'შეკვრა' });

// ------------------------------------------------------------------ laminate, vinyl, parquet
const CIT_LAM = 'https://citadeli.com/products/29-laminati-da-aqsesuarebi/81-laminati/';
add({ id: 'lam_kt205', cat: 'floor_wood', name: 'ლამინატი Kastamonu KT205 Devine Meşe', spec: '8 მმ, 31 კლასი, 1205×197, შეკვრა 2.374 მ²', tier: 'econ', styles: ['warm', 'classic', 'scandi'], measure: 'area', price: 22.5, pack: box(2.374), waste: 0.07, underlay: true, look: plank('#c6a27a', '#9f7a52', 0.197, 1.205), source: src('citadeli', `${CIT_LAM}20921-laminirebuli-iataki-kt205-08x197x1205-ac3-devine-mese-otn-31-class-2374-m2`) });
add({ id: 'lam_kt502', cat: 'floor_wood', name: 'ლამინატი Kastamonu KT502 Lissac Ash', spec: '8 მმ, 31 კლასი, 1205×197, შეკვრა 2.374 მ²', tier: 'econ', styles: ['scandi', 'modern'], measure: 'area', price: 24.5, pack: box(2.374), waste: 0.07, underlay: true, look: plank('#d6c9b4', '#b3a48d', 0.197, 1.205), source: src('citadeli', `${CIT_LAM}20912-laminirebuli-iataki-kt502-08x197x1205-lissac-ash-otn-31-class-2374-m2`) });
add({ id: 'lam_kt503', cat: 'floor_wood', name: 'ლამინატი Kastamonu KT503 Boz Yazı', spec: '8 მმ, 31 კლასი, 1205×197, შეკვრა 2.374 მ²', tier: 'econ', styles: ['loft', 'modern'], measure: 'area', price: 24.5, pack: box(2.374), waste: 0.07, underlay: true, look: plank('#a59e95', '#857d73', 0.197, 1.205), source: src('citadeli', `${CIT_LAM}20913-laminirebuli-iataki-kt503-08x197x1205-boz-yazi-otn-31-class-2374-m2`) });
add({ id: 'lam_kt405', cat: 'floor_wood', name: 'ლამინატი Kastamonu KT405 Canyon Meşe', spec: '8 მმ, 32 კლასი, 1205×197, შეკვრა 1.899 მ²', tier: 'mid', styles: ['warm', 'classic'], measure: 'area', price: 25.5, pack: box(1.899), waste: 0.07, underlay: true, look: plank('#b98a5a', '#8d6339', 0.197, 1.205), source: src('citadeli', `${CIT_LAM}20917-laminirebuli-iataki-kt405-08x197x1205-canyon-mese-otn-32-class-1899-m2`) });
add({ id: 'lam_se002', cat: 'floor_wood', name: 'ლამინატი Kastamonu Step XL SE002 Canyon Oak', spec: '12 მმ, 33 კლასი, 1202×195, შეკვრა 1.87 მ²', tier: 'mid', styles: ['scandi', 'warm'], measure: 'area', price: 38.5, pack: box(1.87), waste: 0.07, underlay: true, look: plank('#c39b6e', '#9b7448', 0.195, 1.202), source: src('citadeli', `${CIT_LAM}25790-lamonirebuli-iataki-stepxl-se002-12x195x1202-canyon-oak-otn-33-class-187-m2`) });
add({ id: 'lam_se010', cat: 'floor_wood', name: 'ლამინატი Kastamonu Step XL SE010 Tokyo', spec: '12 მმ, 33 კლასი, 1202×195, შეკვრა 1.87 მ²', tier: 'mid', styles: ['loft', 'modern'], measure: 'area', price: 38.5, pack: box(1.87), waste: 0.07, underlay: true, look: plank('#8a7f74', '#6a5f55', 0.195, 1.202), source: src('citadeli', `${CIT_LAM}25791-laminirebuli-iataki-stepxl-se010-12x195x1202-tokyo-otn-33-class-187-m2`) });
add({ id: 'lam_herring_l8602', cat: 'floor_wood', name: 'ლამინატი, ნაძვისებრი EIR L8602', spec: '10 მმ, 33 კლასი AC5, 606×101, ფასკით', tier: 'mid', styles: ['classic', 'warm'], measure: 'area', price: 35.9, waste: 0.12, underlay: true, look: herring('#c09468', '#97704a', 0.101, 0.606), source: src('nova', 'https://nova.ge/ka/laminati/laminirebuli-iataki-class33-ac5-hdf-eir-l8602-cvilit-shovit-606x101x10mm', 'შეკვრის ზომა საიტზე არ არის მითითებული') });
add({ id: 'spc_41302', cat: 'floor_wood', name: 'SPC ვინილის იატაკი 413-02', spec: '5 მმ, ზედა ფენა 0.55 მმ, 1219×181, წყალგამძლე', tier: 'mid', styles: ['scandi', 'modern'], measure: 'area', price: 55.7, waste: 0.06, look: plank('#d4bf9c', '#b49c78', 0.181, 1.219), source: src('nova', 'https://nova.ge/ka/vinilis-iataki/vinilis-iataki-1811x12192-5mm-055mm-i4f-413-02-vinil-parquet-spc', 'შეკვრის ზომა საიტზე არ არის მითითებული') });
add({ id: 'eng_f4e', cat: 'floor_wood', name: 'საინჟინრო პარკეტი F4E, მუხა', spec: '14 მმ, 1900×190, მუხის ფენა 3–4 მმ', tier: 'prem', styles: ['scandi', 'modern', 'loft'], measure: 'area', price: 179, waste: 0.08, underlay: true, look: plank('#dcc6a2', '#bea27c', 0.19, 1.9), source: src('parketi', 'https://parketi.ge/en/collections/3-layer-parquet-1', 'საწყისი ფასი („-დან“)') });
add({ id: 'eng_herring', cat: 'floor_wood', name: 'სამშრიანი მუხის პარკეტი, ნაძვისებრი', spec: 'საინჟინრო, მუხა', tier: 'prem', styles: ['classic', 'warm'], measure: 'area', price: 189, waste: 0.12, underlay: true, look: herring('#c7a073', '#9e7649', 0.09, 0.6), source: src('parketi', 'https://parketi.ge/en/collections/herringbone-chevron') });
add({ id: 'eng_wide', cat: 'floor_wood', name: 'სამშრიანი პარკეტი, ფართო ფიცარი', spec: '14–15 მმ, 2200×180–220, ხის ფენა 3–6 მმ', tier: 'prem', styles: ['warm', 'loft'], measure: 'area', price: 120, waste: 0.08, underlay: true, look: plank('#b48a5e', '#8a6440', 0.2, 2.2), source: src('muxa', 'https://muxa.ge/produqcia/samshiani-parketi/', 'საწყისი ფასი („-დან“)') });

// ------------------------------------------------------------------ porcelain floor tiles
add({ id: 'pg_evin', cat: 'tile_floor', name: 'კერამოგრანიტი New Evin Light 60×120', spec: 'ირანი, 8 მმ, გლუვი, თეთრი', tier: 'econ', styles: ['scandi', 'modern', 'classic'], measure: 'area', price: 29.5, pack: perTile(0.6, 1.2), waste: 0.12, look: tile('plain', '#e8e6e0', '#d2cfc8', 1.2, 0.6), source: src('gorgia', 'https://gorgia.ge/ka/remonti/keramikuli-filebi/keramogranitis-fila/%E1%83%99%E1%83%94%E1%83%A0%E1%83%90%E1%83%9B%E1%83%9D%E1%83%92%E1%83%A0%E1%83%90%E1%83%9C%E1%83%98%E1%83%A2%E1%83%98-new-evin-light-60x120/') });
add({ id: 'pg_rock', cat: 'tile_floor', name: 'კერამოგრანიტი Rock Dark Gray 60×60', spec: 'ირანი (Jordan Tile), მატი', tier: 'econ', styles: ['loft', 'modern'], measure: 'area', price: 30.3, pack: perTile(0.6, 0.6), waste: 0.1, look: tile('concrete', '#6e6d6a', '#5b5a57', 0.6, 0.6), source: src('nova', 'https://nova.ge/ka/keramo-graniti/keramograniti-rock-dark-gray-matt-60x60') });
add({ id: 'pg_seattle', cat: 'tile_floor', name: 'კერამოგრანიტი Seattle Gray 60×60', spec: 'ნაცრისფერი', tier: 'econ', styles: ['modern', 'loft', 'scandi'], measure: 'area', price: 22.9, pack: perTile(0.6, 0.6), waste: 0.1, look: tile('stone', '#b5b3ae', '#9d9b96', 0.6, 0.6), source: src('gorgia', 'https://gorgia.ge/ka/remonti/keramikuli-filebi/keramogranitis-fila/%E1%83%99%E1%83%94%E1%83%A0%E1%83%90%E1%83%9B%E1%83%9D%E1%83%92%E1%83%A0%E1%83%90%E1%83%9C%E1%83%98%E1%83%A2%E1%83%98-seattle-gray-60x60/') });
add({ id: 'pg_jambo', cat: 'tile_floor', name: 'კერამოგრანიტი Jambo Beige 20×120', spec: 'ირანი (Goldis), 10.2 მმ, მატი, ხის იმიტაცია', tier: 'econ', styles: ['warm', 'scandi', 'classic'], measure: 'area', price: 25.9, pack: perTile(0.2, 1.2), waste: 0.1, look: tile('wood', '#cdb08a', '#ad9070', 1.2, 0.2, { stagger: true }), source: src('nova', 'https://nova.ge/ka/keramo-graniti/keramograniti-20x120-jambo-beige-matt-102mm-grade-a', 'ფასდაკლებით; სრული ფასი 37.30 ₾/მ²') });
add({ id: 'pg_statuario', cat: 'tile_floor', name: 'კერამოგრანიტი Statuario 60×60', spec: 'ჩინეთი, მატი, მარმარილოს იმიტაცია', tier: 'mid', styles: ['classic', 'modern'], measure: 'area', price: 40.6, pack: perTile(0.6, 0.6), waste: 0.1, look: tile('marble', '#ebe9e4', '#d8d5cf', 0.6, 0.6, { vein: '#9ea2a6' }), source: src('nova', 'https://nova.ge/ka/keramo-graniti/keramograniti-60x60-statuario-matt-f61014w-08') });
add({ id: 'pg_andezit', cat: 'tile_floor', name: 'კერამოგრანიტი Andezit Antracite 60×60', spec: 'ანტრაციტი', tier: 'mid', styles: ['loft'], measure: 'area', price: 45.7, pack: perTile(0.6, 0.6), waste: 0.1, look: tile('stone', '#4f4f50', '#3d3d3e', 0.6, 0.6), source: src('gorgia', 'https://gorgia.ge/ka/remonti/keramikuli-filebi/keramogranitis-fila/%E1%83%99%E1%83%94%E1%83%A0%E1%83%90%E1%83%9B%E1%83%9D%E1%83%92%E1%83%A0%E1%83%90%E1%83%9C%E1%83%98%E1%83%A2%E1%83%98-andezit-antracite-6060/') });
add({ id: 'pg_milenario', cat: 'tile_floor', name: 'კერამოგრანიტი Milenario Brown 20×120', spec: 'თურქეთი (Bien), ხის იმიტაცია', tier: 'mid', styles: ['warm', 'classic'], measure: 'area', price: 48.3, pack: perTile(0.2, 1.2), waste: 0.1, look: tile('wood', '#8f6a4b', '#735339', 1.2, 0.2, { stagger: true }), source: src('nova', 'https://nova.ge/ka/keramo-graniti/keramograniti-20x120-sm-milenario-brown-1-bien') });
add({ id: 'pg_alexix', cat: 'tile_floor', name: 'კერამოგრანიტი Alexix 60×120', spec: 'თურქეთი (Bien), 7 მმ, გაპრიალებული', tier: 'mid', styles: ['modern', 'classic'], measure: 'area', price: 49.9, pack: perTile(0.6, 1.2), waste: 0.12, look: tile('marble', '#e6e3dd', '#d3cfc8', 1.2, 0.6, { vein: '#b3aca2', gloss: true }), source: src('nova', 'https://nova.ge/ka/keramo-graniti/keramograniti-60x120-07-sm-alexix-rec-full-lap1-bien', 'ფერი საიტზე არ არის აღწერილი, გადაამოწმე მაღაზიაში') });
add({ id: 'pg_castagna', cat: 'tile_floor', name: 'კერამოგრანიტი Castagna Bianco 20×120', spec: 'ესპანეთი (Majorca), 7 მმ, ხის იმიტაცია', tier: 'prem', styles: ['scandi', 'modern'], measure: 'area', price: 56.4, pack: perTile(0.2, 1.2), waste: 0.1, look: tile('wood', '#d9c7ad', '#bfac91', 1.2, 0.2, { stagger: true }), source: src('nova', 'https://nova.ge/ka/keramo-graniti/keramograniti-20x120x07-castagna-bianco-rec-1-majorca') });
add({ id: 'pg_rovere', cat: 'tile_floor', name: 'კერამოგრანიტი Rovere Mat Ceviz 19.2×120', spec: 'Kütahya Seramik, 8 მმ, მატი, კაკლის იმიტაცია', tier: 'prem', styles: ['warm', 'classic', 'loft'], measure: 'area', price: 104, pack: perTile(0.192, 1.2), waste: 0.1, look: tile('wood', '#7b5a3f', '#634732', 1.2, 0.192, { stagger: true }), source: src('gorgia', 'https://gorgia.ge/ka/remonti/keramikuli-filebi/keramogranitis-fila/%E1%83%99%E1%83%94%E1%83%A0%E1%83%90%E1%83%9B%E1%83%9D%E1%83%92%E1%83%A0%E1%83%90%E1%83%9C%E1%83%98%E1%83%A2%E1%83%98-rovere-mat-ceviz-rec-19.2120/') });

// ------------------------------------------------------------------ wall tiles
const GOR_WALL = 'https://gorgia.ge/ka/remonti/keramikuli-filebi/kedlis-fila/';
add({ id: 'wt_kobak', cat: 'tile_wall', name: 'კაფელი Kobak Cream Dark 30×60', spec: 'კრემისფერი', tier: 'econ', styles: ['warm', 'classic'], measure: 'area', price: 13.9, pack: perTile(0.3, 0.6), waste: 0.1, look: tile('stone', '#d9c8ad', '#c4b397', 0.6, 0.3), source: src('gorgia', `${GOR_WALL}kafeli-kobak-cream-dark-3060/`) });
add({ id: 'wt_white', cat: 'tile_wall', name: 'კაფელი Plain White Glossy 30×60', spec: 'თეთრი, პრიალა', tier: 'econ', styles: ['scandi', 'modern', 'classic'], measure: 'area', price: 19.5, pack: perTile(0.3, 0.6), waste: 0.1, look: tile('plain', '#f1f0ec', '#d8d6d1', 0.6, 0.3, { gloss: true }), source: src('gorgia', `${GOR_WALL}კაფელი-plain-white-glossy-30x60/`) });
add({ id: 'wt_gumus', cat: 'tile_wall', name: 'კაფელი Gümüş Gri 30×60 (ND)', spec: 'ნაცრისფერი', tier: 'econ', styles: ['loft', 'modern'], measure: 'area', price: 26.37, pack: perTile(0.3, 0.6), waste: 0.1, look: tile('concrete', '#a9a7a3', '#93918d', 0.6, 0.3), source: src('gorgia', `${GOR_WALL}კაფელი-gumus-gri-3060-nd/`) });
add({ id: 'wt_void_bone', cat: 'tile_wall', name: 'კაფელი Void Bone Rec 30×60 (Bien)', spec: '7 მმ, რექტიფიცირებული, ძვლისფერი', tier: 'mid', styles: ['warm', 'scandi'], measure: 'area', price: 29.52, pack: perTile(0.3, 0.6), waste: 0.1, look: tile('stone', '#ddd2bf', '#c9bca6', 0.6, 0.3), source: src('gorgia', `${GOR_WALL}კაფელი-void-bone-rec-30600-7-bien/`) });
add({ id: 'wt_enzo', cat: 'tile_wall', name: 'კაფელი Enzo Anthracite 30×90 (Bien)', spec: '7 მმ, რექტიფიცირებული, ანტრაციტი', tier: 'mid', styles: ['loft'], measure: 'area', price: 29.76, pack: perTile(0.3, 0.9), waste: 0.1, look: tile('stone', '#4f5052', '#3e3f41', 0.9, 0.3), source: src('gorgia', `${GOR_WALL}კაფელი-enzo-anthracite-30x90x0-7-bien/`) });
add({ id: 'wt_portland', cat: 'tile_wall', name: 'კაფელი Portland Madox Gris 20×60', spec: 'ნაცრისფერი, ბეტონის იმიტაცია', tier: 'mid', styles: ['loft', 'modern'], measure: 'area', price: 36.66, pack: perTile(0.2, 0.6), waste: 0.1, look: tile('concrete', '#9c9a96', '#878581', 0.6, 0.2), source: src('gorgia', `${GOR_WALL}კაფელი-portland-madox-gris-20x60/`) });
add({ id: 'wt_blanco', cat: 'tile_wall', name: 'კაფელი Blanco Liso Brillo 20×20', spec: 'თეთრი, პრიალა', tier: 'mid', styles: ['classic', 'scandi'], measure: 'area', price: 36.5, pack: perTile(0.2, 0.2), waste: 0.1, look: tile('plain', '#f4f4f1', '#d9d7d2', 0.2, 0.2, { gloss: true }), source: src('gorgia', `${GOR_WALL}კაფელი-blanco-liso-brillo-20x20/`) });
add({ id: 'wt_marfil', cat: 'tile_wall', name: 'კაფელი Marfil Liso Mate 20×20', spec: 'სპილოსძვლისფერი, მატი', tier: 'mid', styles: ['warm', 'classic'], measure: 'area', price: 40.43, pack: perTile(0.2, 0.2), waste: 0.1, look: tile('plain', '#e8dcc6', '#d2c5ad', 0.2, 0.2), source: src('gorgia', `${GOR_WALL}კაფელი-marfil-liso-mate-20x20/`) });
add({ id: 'wt_piscina', cat: 'tile_wall', name: 'კაფელი Piscina Liso Brillo 10×10', spec: 'ცისფერი, პრიალა', tier: 'prem', styles: [], measure: 'area', price: 64.19, pack: perTile(0.1, 0.1), waste: 0.1, look: tile('zellige', '#9fc4cc', '#86aab2', 0.1, 0.1, { gloss: true }), source: src('gorgia', `${GOR_WALL}კაფელი-piscina-liso-brillo-taco-10x10/`) });
add({ id: 'wt_stravaganza', cat: 'tile_wall', name: 'კაფელი Stravaganza-R Verde 45×120', spec: 'მწვანე, დიდი ფორმატი', tier: 'prem', styles: ['warm', 'modern'], measure: 'area', price: 84.9, pack: perTile(0.45, 1.2), waste: 0.12, look: tile('stone', '#7f9a86', '#6c8673', 1.2, 0.45), source: src('gorgia', 'https://gorgia.ge/ka/remonti/keramikuli-filebi/keramogranitis-fila/%E1%83%99%E1%83%90%E1%83%A4%E1%83%94%E1%83%9A%E1%83%98-stravaganza-r-verde-45x120/') });
add({ id: 'wt_metro', cat: 'tile_wall', name: 'კაფელი Vitra Miniworx Metro 10×20', spec: 'თეთრი, პრიალა, „მეტრო“', tier: 'prem', styles: ['scandi', 'classic', 'loft'], measure: 'area', price: 120, pack: perTile(0.1, 0.2), waste: 0.1, look: tile('plain', '#f4f3ef', '#c4bfb7', 0.2, 0.1, { gloss: true, stagger: true }), source: src('vitra', 'https://vitra.com.ge/en/product/14412-floor-and-wall-tile-10x20-miniworx-metro-white-glossy-k53773300001vte0/') });

// ------------------------------------------------------------------ paint (priced per bucket)
const bucket = (size) => ({ size, unit: 'l', label: 'ვედრო' });
const PAINT_ECON = src('gorgia', 'https://gorgia.ge/ka/remonti/laq-sagebavebi/sagebavi/kedlis-da-cheris-sagebavi/interieris-wyalemulsia-plastik-15lt-tetri/');
const PAINT_MID = src('citadeli', 'https://citadeli.com/products/77-laq-saghebavebi-da-aqsesuarebi/34-interieris-saghebavi/26960-emulsiuri-saghebavi-shida-samushaoebistvis-step-latex-high-level-base-tr-10lt', 'შეფერვის ბაზა; შეფერვის ფასი არ შედის');
const PAINT_PREM = src('gorgia', 'https://gorgia.ge/ka/remonti/laq-sagebavebi/sagebavi/kedlis-da-cheris-sagebavi/%E1%83%A1%E1%83%90%E1%83%A6%E1%83%94%E1%83%91%E1%83%90%E1%83%95%E1%83%98-%E1%83%98%E1%83%9C%E1%83%A2%E1%83%94%E1%83%A0%E1%83%98%E1%83%94%E1%83%A0%E1%83%98%E1%83%A1-silicone-mat-marshall-15%E1%83%9A%E1%83%A2-%E1%83%97%E1%83%94%E1%83%97%E1%83%A0%E1%83%98/');
const P = (id, name, spec, tier, styles, price, size, color, source) =>
  add({ id, cat: 'paint', name, spec, tier, styles, measure: 'paint', price, pack: bucket(size), coverage: 10, coats: 2, waste: 0.05, look: paint(color), source });
P('paint_econ_white', 'წყალემულსია Plastik, თეთრი', 'ინტერიერის, 15 ლ', 'econ', ['modern', 'scandi', 'loft'], 132.4, 15, '#f4f4f1', PAINT_ECON);
P('paint_econ_warm', 'წყალემულსია Plastik, თბილი თეთრი', 'ინტერიერის, 15 ლ, შეფერილი', 'econ', ['warm', 'classic'], 132.4, 15, '#f1ebe0', { ...PAINT_ECON, note: 'შეფერვის ფასი არ შედის' });
P('paint_mid_white', 'Chromodomi Step-Latex, თეთრი', 'ლატექსი, რეცხვადი, 10 ლ', 'mid', ['modern', 'scandi', 'loft'], 180, 10, '#f5f5f2', PAINT_MID);
P('paint_mid_warm', 'Chromodomi Step-Latex, თბილი თეთრი', 'ლატექსი, რეცხვადი, 10 ლ, შეფერილი', 'mid', ['warm', 'classic'], 180, 10, '#efe8dc', PAINT_MID);
P('paint_mid_greige', 'Chromodomi Step-Latex, გრეიჯი', 'ლატექსი, 10 ლ, შეფერილი', 'mid', [], 180, 10, '#d6cfc4', PAINT_MID);
P('paint_mid_sage', 'Chromodomi Step-Latex, სალბისფერი', 'ლატექსი, 10 ლ, შეფერილი', 'mid', [], 180, 10, '#b7bfa8', PAINT_MID);
P('paint_mid_clay', 'Chromodomi Step-Latex, თიხისფერი', 'ლატექსი, 10 ლ, შეფერილი', 'mid', [], 180, 10, '#c99a7e', PAINT_MID);
P('paint_mid_blue', 'Chromodomi Step-Latex, მტვრიანი ლურჯი', 'ლატექსი, 10 ლ, შეფერილი', 'mid', [], 180, 10, '#9aa8b5', PAINT_MID);
P('paint_mid_graphite', 'Chromodomi Step-Latex, გრაფიტი', 'ლატექსი, 10 ლ, შეფერილი', 'mid', [], 180, 10, '#4a4c4f', PAINT_MID);
P('paint_prem_white', 'Marshall Silicone Mat, თეთრი', 'სილიკონიანი, მატი, 15 ლ', 'prem', ['modern', 'scandi', 'loft'], 322, 15, '#f6f6f3', PAINT_PREM);
P('paint_prem_warm', 'Marshall Silicone Mat, თბილი თეთრი', 'სილიკონიანი, მატი, 15 ლ, შეფერილი', 'prem', ['warm', 'classic'], 322, 15, '#eee6d8', { ...PAINT_PREM, note: 'შეფერვის ფასი არ შედის' });

// ------------------------------------------------------------------ ceilings
add({ id: 'ceil_paint_econ', cat: 'ceiling', name: 'შეღებილი ჭერი — წყალემულსია Plastik', spec: '15 ლ ვედრო; შპაკლი და გრუნტი ცალკე ითვლება', tier: 'econ', styles: ALL, measure: 'paint', price: 132.4, pack: bucket(15), coverage: 9, coats: 2, waste: 0.05, look: flat('#f7f7f5'), source: PAINT_ECON });
add({ id: 'ceil_stretch', cat: 'ceiling', name: 'ჭიმვადი ჭერი, მატი', spec: 'მასალა და მონტაჟი, 15 მ²-ზე მეტ ოთახში', tier: 'mid', styles: ALL, measure: 'area', price: 27, waste: 0, look: flat('#f3f3f1'), source: src('cherihome', 'https://cherihome.ge/gasachimi-cheris-pasebi/', '15 მ²-მდე ოთახში 30 ₾/მ²; სანათის წერტილი +15 ₾') });
add({ id: 'ceil_paint_mid', cat: 'ceiling', name: 'შეღებილი ჭერი — წყალემულსია Plus', spec: '15 ლ ვედრო; შპაკლი და გრუნტი ცალკე ითვლება', tier: 'mid', styles: ALL, measure: 'paint', price: 209.6, pack: bucket(15), coverage: 9, coats: 2, waste: 0.05, look: flat('#f7f7f5'), source: src('gorgia', 'https://gorgia.ge/ka/remonti/laq-sagebavebi/sagebavi/kedlis-da-cheris-sagebavi/interieris-wyalemulsia-plus-15lt-tetri/') });
add({ id: 'ceil_gypsum', cat: 'ceiling', name: 'თაბაშირ-მუყაოს ჭერი', spec: 'Knauf ფილა და პროფილები, მონტაჟი, შეღებვა', tier: 'prem', styles: ALL, measure: 'area', price: 38, waste: 0.05, look: flat('#f6f6f4'), source: src('citadeli', 'https://citadeli.com/99-tabashir-muyao/101-profilebi-da-aqsesuarebi', 'გამოთვლილი: ფილა 15.50 ₾ / 3 მ², CD პროფილი 11 ₾ / 3 მ, ხელობა 13–15 ₾/მ² (homeis.ge, 2024)') });

// ------------------------------------------------------------------ stone (countertops, vanity tops, window sills)
const STONE_NOTE = 'ფასი 1 მ² ქვაზე; ჭრა, კიდის დამუშავება და მონტაჟი ცალკე';
const ZQ = 'https://zodi.ge/product-category/%E1%83%99%E1%83%95%E1%83%90%E1%83%A0%E1%83%AA%E1%83%98/';
const ZM = 'https://zodi.ge/product-category/ბუნებრივი-ქვა/მარმარილო/';
const ZG = 'https://zodi.ge/product-category/ბუნებრივი-ქვა/გრანიტი/';
add({ id: 'st_volcano', cat: 'stone', name: 'კვარცი Volcano Black', spec: 'შავი', tier: 'econ', styles: ['loft'], measure: 'area', price: 355, waste: 0.15, look: stone('speckle', '#2c2c2e', { fleck: '#55555a' }), source: src('zodi', ZQ, STONE_NOTE) });
add({ id: 'st_juliet', cat: 'stone', name: 'კვარცი Juliet White', spec: 'თეთრი', tier: 'econ', styles: ['scandi', 'modern'], measure: 'area', price: 375, waste: 0.15, look: stone('speckle', '#f1f0ec', { fleck: '#dcd9d2' }), source: src('zodi', ZQ, STONE_NOTE) });
add({ id: 'st_sahara', cat: 'stone', name: 'კვარცი Sahara Beige', spec: 'ბეჟი', tier: 'econ', styles: ['warm', 'classic'], measure: 'area', price: 380, waste: 0.15, look: stone('speckle', '#ddd0bb', { fleck: '#c6b69c' }), source: src('zodi', ZQ, STONE_NOTE) });
add({ id: 'st_nero_mist', cat: 'stone', name: 'გრანიტი Nero Mist, დაქლიბული', spec: 'ბუნებრივი გრანიტი', tier: 'mid', styles: ['loft'], measure: 'area', price: 325, waste: 0.18, look: stone('speckle', '#3a3a3c', { fleck: '#6a6a6e' }), source: src('zodi', ZG, STONE_NOTE) });
add({ id: 'st_hierapolis', cat: 'stone', name: 'კვარცი 100 Hierapolis', spec: '20 მმ, სლები 152×310', tier: 'mid', styles: ['warm', 'scandi'], measure: 'area', price: 400, waste: 0.15, look: stone('travertine', '#e3d9c8'), source: src('allstone', 'https://allstone.ge/ka/product/detail/169/%E1%83%99%E1%83%95%E1%83%90%E1%83%A0%E1%83%AA%E1%83%98-100-hierapolis', `${STONE_NOTE}; ფერი მიახლოებითია`) });
add({ id: 'st_fairy', cat: 'stone', name: 'კვარცი Fairy White', spec: '20 მმ, სლები 310×152', tier: 'mid', styles: ['modern', 'scandi'], measure: 'area', price: 420, waste: 0.15, look: stone('speckle', '#f3f2ee', { fleck: '#e2e0da' }), source: src('zodi', ZQ, STONE_NOTE) });
add({ id: 'st_calacatta', cat: 'stone', name: 'მარმარილო Calacatta Gold', spec: 'ბუნებრივი მარმარილო', tier: 'mid', styles: ['classic', 'modern'], measure: 'area', price: 420, waste: 0.18, look: stone('marble', '#f2efe9', { vein: '#b49a72' }), source: src('zodi', ZM, STONE_NOTE) });
add({ id: 'st_acrylic', cat: 'stone', name: 'აკრილის ქვა', spec: 'საშუალო საბაზრო ფასი', tier: 'mid', styles: [], measure: 'area', price: 480, waste: 0.15, look: stone('speckle', '#f1f0ec', { fleck: '#d9d6cf' }), source: src('homeis', 'https://www.homeis.ge/iaphi-samzareulos-zedapiri/', '2022 წლის სტატიის მონაცემი, „-დან“') });
add({ id: 'st_carrara', cat: 'stone', name: 'მარმარილო Bianco Carrara', spec: 'ბუნებრივი მარმარილო', tier: 'prem', styles: ['classic', 'modern'], measure: 'area', price: 495, waste: 0.18, look: stone('marble', '#f1eeea', { vein: '#8f8a85' }), source: src('zodi', ZM, STONE_NOTE) });
add({ id: 'st_taj', cat: 'stone', name: 'კვარცი Taj Mahal', spec: 'ახალი თაობის კვარცი, სლები 330×165', tier: 'prem', styles: ['warm', 'classic', 'scandi'], measure: 'area', price: 650, waste: 0.15, look: stone('marble', '#e7dccb', { vein: '#b89e78' }), source: src('zodi', ZQ, STONE_NOTE) });
add({ id: 'st_marquina', cat: 'stone', name: 'კვარცი Marquina Tierra', spec: 'მუქი, ძარღვებით', tier: 'prem', styles: ['loft'], measure: 'area', price: 750, waste: 0.15, look: stone('marble', '#2e2d2f', { vein: '#8b847a' }), source: src('zodi', ZQ, STONE_NOTE) });

// ------------------------------------------------------------------ interior doors (with frame)
add({ id: 'door_nov016', cat: 'door', name: 'ხის კარი NOV016', spec: 'ჩარჩოთი და ქრომის სახელურით, 2165×745', tier: 'econ', styles: ALL, measure: 'count', price: 275, look: flat('#b58a5c'), source: src('nova', 'https://nova.ge/ka/karebi/khis-kari-charchoti-2165x745x40-qromirebuli-sakhelurit-nov016-ky1-5', 'ფასდაკლებით; სრული ფასი 390 ₾') });
add({ id: 'door_roma_grey', cat: 'door', name: 'შეღებილი MDF კარი ROMA 2, ღია ნაცრისფერი', spec: 'კომპლექტი, 800×2150', tier: 'mid', styles: ['modern', 'loft', 'scandi'], measure: 'count', price: 650, look: flat('#c9cacb'), source: src('gorgia', 'https://gorgia.ge/ka/remonti/kari/mdf-kari/შეღებილი-მდფ-კარი-roma-2-light-grey-800x2150-lr-კომპლექტი/') });
add({ id: 'door_model1_white', cat: 'door', name: 'შეღებილი MDF კარი Model 1, თეთრი', spec: 'კომპლექტი, 800×2150', tier: 'mid', styles: ['classic', 'scandi', 'modern'], measure: 'count', price: 680, look: flat('#f1f0ec'), source: src('gorgia', 'https://gorgia.ge/ka/remonti/kari/mdf-kari/შეღებილი-მდფ-კარი-model-1-white-800x2150-lr-კომპლექტი/') });
add({ id: 'door_roma_mocco', cat: 'door', name: 'შეღებილი MDF კარი ROMA 1, Mocco', spec: 'კომპლექტი, 800×2150', tier: 'mid', styles: ['warm'], measure: 'count', price: 650, look: flat('#7a5c47'), source: src('gorgia', 'https://gorgia.ge/ka/remonti/kari/mdf-kari/შეღებილი-მდფ-კარი-roma-1-mocco-800x2150-lr-კომპლექტი/') });
add({ id: 'door_hidden', cat: 'door', name: 'ფარული MDF კარი', spec: 'შეღებვადი, ფარული ჩარჩოთი', tier: 'prem', styles: ['modern', 'loft', 'scandi'], measure: 'count', price: 1200, look: flat('#efefec'), source: src('genabuild', 'https://www.genabuild.com/product-page/ფარული-კარი-მდფ') });
add({ id: 'door_estet', cat: 'door', name: 'ფარული კარი ESTET', spec: 'ალუმინის ფარული ჩარჩო, 3D ანჯამები', tier: 'prem', styles: ['classic', 'warm'], measure: 'count', price: 1100, look: flat('#ece6da'), source: src('coridoor', 'https://coridoor.ge/faruli-kari-estet/') });

// ------------------------------------------------------------------ skirting (per metre, made to length)
add({ id: 'sk_simple', cat: 'skirting', name: 'შეღებილი MDF პლინტუსი Simple', spec: 'სასურველ ზომაზე, ფერი არჩევით', tier: 'econ', styles: ['modern', 'scandi', 'loft', 'warm'], measure: 'length', price: 12, waste: 0.08, look: flat('#f1f0ec'), source: src('genabuild', 'https://www.genabuild.com/product-page/%E1%83%A8%E1%83%94%E1%83%A6%E1%83%94%E1%83%91%E1%83%98%E1%83%9A%E1%83%98-%E1%83%9B%E1%83%93%E1%83%A4-%E1%83%9E%E1%83%9A%E1%83%98%E1%83%9C%E1%83%A2%E1%83%A3%E1%83%A1%E1%83%98') });
add({ id: 'sk_greece', cat: 'skirting', name: 'შეღებილი MDF პლინტუსი Greece', spec: 'კლასიკური პროფილი, სასურველ ზომაზე', tier: 'econ', styles: ['classic', 'warm'], measure: 'length', price: 12, waste: 0.08, look: flat('#f1ede4'), source: src('genabuild', 'https://www.genabuild.com/product-page/%E1%83%A8%E1%83%94%E1%83%A6%E1%83%94%E1%83%91%E1%83%98%E1%83%9A%E1%83%98-%E1%83%9B%E1%83%93%E1%83%A4-%E1%83%9E%E1%83%9A%E1%83%98%E1%83%9C%E1%83%A2%E1%83%A3%E1%83%A1%E1%83%98') });
add({ id: 'sk_modern', cat: 'skirting', name: 'შეღებილი MDF პლინტუსი Modern', spec: 'მაღალი, სასურველ ზომაზე', tier: 'mid', styles: ALL, measure: 'length', price: 18, waste: 0.08, look: flat('#f3f2ee'), source: src('genabuild', 'https://www.genabuild.com/product-page/%E1%83%A8%E1%83%94%E1%83%A6%E1%83%94%E1%83%91%E1%83%98%E1%83%9A%E1%83%98-%E1%83%9B%E1%83%93%E1%83%A4-%E1%83%9E%E1%83%9A%E1%83%98%E1%83%9C%E1%83%A2%E1%83%A3%E1%83%A1%E1%83%98') });

// ------------------------------------------------------------------ sanitary sets, assembled from single items
const GSAN = 'https://gorgia.ge/ka/santeqnika/';
add({ id: 'san_bath_econ', cat: 'sanitary_bath', name: 'აბაზანის ნაკრები — სტანდარტი', spec: 'უნიტაზი ავზით RIGA 222 ₾, ავეჯი ნიჟარით BIANCA 65 397 ₾, ნიჟარის შემრევი BBC2A 61 ₾, საშხაპე სისტემა RONDO LUX 197 ₾', tier: 'econ', styles: ALL, measure: 'count', price: 877, look: flat('#ffffff'), source: src('gorgia', GSAN, 'საშხაპე ტრაპი, ტიხარი და აბაზანა არ შედის') });
add({ id: 'san_bath_mid', cat: 'sanitary_bath', name: 'აბაზანის ნაკრები — ჩამონტაჟებული', spec: 'კიდული უნიტაზი TP325 321 ₾, ინსტალაცია GR5003 376 ₾, ავეჯი Domino 65 434 ₾, შემრევი BBC2A 61 ₾, ჩასაშენებელი შხაპი BAG7P 317 ₾', tier: 'mid', styles: ALL, measure: 'count', price: 1509, look: flat('#ffffff'), source: src('gorgia', GSAN, 'საშხაპე ტრაპი და ტიხარი არ შედის') });
add({ id: 'san_bath_prem', cat: 'sanitary_bath', name: 'აბაზანის ნაკრები — პრემიუმი', spec: 'კიდული უნიტაზი FREE FE320 350 ₾, ინსტალაცია GR5003 376 ₾, ავეჯი KNIDOS 90 1401 ₾, შავი შემრევი LIPPI 259 ₾, ჩასაშენებელი შხაპი BAG7P 317 ₾', tier: 'prem', styles: ALL, measure: 'count', price: 2703, look: flat('#ffffff'), source: src('gorgia', GSAN, 'საშხაპე ტრაპი და ტიხარი არ შედის') });
add({ id: 'san_wc_econ', cat: 'sanitary_wc', name: 'საპირფარეშოს ნაკრები — სტანდარტი', spec: 'უნიტაზი ავზით RIGA 222 ₾ (გორგია), ხელსაბანი 79 ₾ (ნოვა), შემრევი BBC2A 61 ₾', tier: 'econ', styles: ALL, measure: 'count', price: 362, look: flat('#ffffff'), source: src('gorgia', GSAN) });
add({ id: 'san_wc_mid', cat: 'sanitary_wc', name: 'საპირფარეშოს ნაკრები — ჩამონტაჟებული', spec: 'კიდული უნიტაზი TP320 188 ₾, ინსტალაცია NKP 313 ₾, ხელსაბანი 79 ₾ (ნოვა), შემრევი 61 ₾', tier: 'mid', styles: ALL, measure: 'count', price: 641, look: flat('#ffffff'), source: src('gorgia', GSAN) });
add({ id: 'san_wc_prem', cat: 'sanitary_wc', name: 'საპირფარეშოს ნაკრები — პრემიუმი', spec: 'კიდული უნიტაზი FREE FE320 350 ₾, ინსტალაცია GR5003 376 ₾, დასადები ნიჟარა SZ58 218 ₾ (ნოვა), შემრევი LIPPI 259 ₾', tier: 'prem', styles: ALL, measure: 'count', price: 1203, look: flat('#ffffff'), source: src('gorgia', GSAN) });

// ------------------------------------------------------------------ balcony floors
add({ id: 'out_r11', cat: 'outdoor', name: 'კერამოგრანიტი 60×60 R11, მატი', spec: 'მოცურების საწინააღმდეგო R11', tier: 'econ', styles: ALL, measure: 'area', price: 39.5, pack: perTile(0.6, 0.6), waste: 0.1, look: tile('stone', '#a7a199', '#8f897f', 0.6, 0.6), source: src('nova', 'https://nova.ge/ka/keramo-graniti/keramograniti-600x600-r11-matt-jbr6176hr') });
add({ id: 'out_michel', cat: 'outdoor', name: 'კერამოგრანიტი Michel Dark Gray 60×60, 15 მმ', spec: 'რუსტიკული, მატი, სქელი', tier: 'mid', styles: ALL, measure: 'area', price: 42.6, pack: perTile(0.6, 0.6), waste: 0.1, look: tile('stone', '#5f5e5c', '#4c4b49', 0.6, 0.6), source: src('nova', 'https://nova.ge/ka/keramo-graniti/keramograniti-60x60-michel-dark-gray-matt-rustic-15mm-grade-a') });
add({ id: 'out_wpc', cat: 'outdoor', name: 'WPC დეკი Poolpro', spec: '2800×150×25, სამაგრები შედის', tier: 'prem', styles: ALL, measure: 'area', price: 134.9, waste: 0.1, look: plank('#8d6e52', '#6f5440', 0.15, 2.8), source: src('wpc', 'https://wpc.ge/deck/', 'ლაგები (საყრდენი) არ შედის') });

// ------------------------------------------------------------------ consumables
add({ id: 'cons_adhesive', cat: 'consumable', name: 'ფილის წებო weber.kol flex porselen', spec: '25 კგ, ყინვაგამძლე, საშუალო და დიდი ფილისთვის', tier: 'mid', measure: 'pack', baseUnit: 'kg', price: 32, pack: { size: 25, unit: 'kg', label: 'ტომარა' }, look: flat('#c9c6c0'), source: src('citadeli', 'https://citadeli.com/products/102-saremonto-masalebi/6-samsheneblo-fkhvnili/65-tsebo-tsementi/3018-tsebo-tsementi-weberkol-flex-porselen-gri-25-kg-yinvagamdzle-sashualo-da-didi-zomis-filebistvis') });
add({ id: 'cons_grout', cat: 'consumable', name: 'ფუგა Weber Joint Sil', spec: '2 კგ', tier: 'mid', measure: 'pack', baseUnit: 'kg', price: 9.6, pack: { size: 2, unit: 'kg', label: 'შეკვრა' }, look: flat('#d0ccc4'), source: src('citadeli', 'https://citadeli.com/102-repair-materials/6-construction-powder/66-tile-grout') });
add({ id: 'cons_primer', cat: 'consumable', name: 'გრუნტი FW Gypsum Primer', spec: 'ინტერიერის, 20 ლ', tier: 'mid', measure: 'pack', baseUnit: 'l', price: 110, pack: { size: 20, unit: 'l', label: 'ვედრო' }, look: flat('#e8ecef'), source: src('nova', 'https://nova.ge/ka/laq-saghebavis-praimeri/20lt-interieris-mza-grunti-fw-gypsum-primer') });
add({ id: 'cons_putty', cat: 'consumable', name: 'საფინიშო შპაკლი Knauf SatenGips', spec: '25 კგ', tier: 'mid', measure: 'pack', baseUnit: 'kg', price: 18, pack: { size: 25, unit: 'kg', label: 'ტომარა' }, look: flat('#f0efeb'), source: src('citadeli', 'https://citadeli.com/102-repair-materials/6-construction-powder/67-putty') });
add({ id: 'cons_underlay', cat: 'consumable', name: 'ქვესაგები ლამინატისთვის, 3 მმ', spec: 'იყიდება მეტრობით', tier: 'mid', measure: 'pack', baseUnit: 'm2', price: 1.5, pack: { size: 1, unit: 'm2', label: 'მ²' }, look: flat('#8fa1a8'), source: src('citadeli', 'https://citadeli.com/products/29-laminati-da-aqsesuarebi/82-qveshsagebi/28369-qveshsagebi-3-mm-roli') });
add({ id: 'cons_waterproof', cat: 'consumable', name: 'ჰიდროიზოლაცია FOX Multiseal FS478', spec: 'სრულად ელასტიური, 30 კგ', tier: 'mid', measure: 'pack', baseUnit: 'kg', price: 175, pack: { size: 30, unit: 'kg', label: 'ვედრო' }, look: flat('#6f8aa6'), source: src('citadeli', 'https://citadeli.com/products/5-hidroizolatsia/135-hidro-tsasasmeli/27239-srulad-elastiuri-hidrosaizolatsio-masala-fox-multiseal-fs478-30kg') });

export const MATERIALS = Object.fromEntries(M.map((m) => [m.id, m]));
export const MATERIAL_LIST = M;

export function materialsInCats(cats) {
  return M.filter((m) => cats.includes(m.cat));
}

// Default choice for a category given a style and budget tier. Style fit matters most,
// then the closest tier, then catalog order.
export function pick(cat, style, tier) {
  const want = TIER_ORDER.indexOf(tier);
  let best = null;
  let bestScore = Infinity;
  for (const m of M) {
    if (m.cat !== cat) continue;
    const s = (m.styles.includes(style) ? 0 : 10) + Math.abs(TIER_ORDER.indexOf(m.tier) - want) * 3;
    if (s < bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

export function priceLabel(m) {
  const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(m.price);
  switch (m.measure) {
    case 'area': return `${n} ₾/მ²`;
    case 'length': return `${n} ₾/მ`;
    case 'count': return `${n} ₾/${m.cat.startsWith('sanitary') ? 'კომპლ.' : 'ც'}`;
    case 'paint':
    case 'pack': return m.pack.label === 'მ²' ? `${n} ₾/მ²` : `${n} ₾/${m.pack.label}`;
    default: return `${n} ₾`;
  }
}

export function shopLabel(m) {
  return m.source ? SHOPS[m.source.shop]?.label || m.source.shop : '';
}
