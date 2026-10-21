'use strict';
// World state: tiles, fences, objects, exhibits, pathfinding and construction.

let G = null;               // the whole game state (saved/loaded as one object)
let terrainDirty = true;    // set when the baked terrain layer needs redrawing

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function idx(x, y) { return y * MAP_W + x; }
function inMap(x, y) { return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H; }
function tileAt(x, y) { return inMap(x, y) ? G.tiles[idx(x, y)] : null; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function article(w) { return (/^[AEIOU]/i.test(w) ? 'an ' : 'a ') + w; }
function money(n) { return (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US'); }

// ---------- fences ----------
// hF: edge on the "north" side of tile (x,y), y in 0..MAP_H
// vF: edge on the "west" side of tile (x,y), x in 0..MAP_W
function hIdx(x, y) { return y * MAP_W + x; }
function vIdx(x, y) { return y * (MAP_W + 1) + x; }
function fenceBetween(x, y, nx, ny) {
  if (nx === x) return G.hF[hIdx(x, Math.max(y, ny))];
  return G.vF[vIdx(Math.max(x, nx), y)];
}

// ---------- new game ----------
function newGame() {
  G = {
    money: START_MONEY, time: 0, speed: 1, admission: 12,
    tiles: [], hF: new Uint8Array(MAP_W * (MAP_H + 1)), vF: new Uint8Array((MAP_W + 1) * MAP_H),
    objects: new Map(), animals: [], guests: [], staff: [], litter: [], dung: [], food: [], floats: [],
    exhibits: [], exMap: new Int32Array(MAP_W * MAP_H).fill(-1), litterCount: new Uint16Array(MAP_W * MAP_H),
    nextId: 1, rating: 30, monthIndex: 0, totalGuests: 0, statT: 0,
    month: freshMonth(), lastMonth: null, messages: [],
  };
  for (let i = 0; i < MAP_W * MAP_H; i++) G.tiles.push({ t: 'grass', path: false, obj: 0 });

  // entrance road and a starter loop
  for (let y = MAP_H - 1; y >= MAP_H - 10; y--) G.tiles[idx(ENTRANCE.x, y)].path = true;
  for (let x = 16; x <= 32; x++) G.tiles[idx(x, MAP_H - 10)].path = true;

  // natural woodland around the map border
  for (let i = 0; i < 260; i++) {
    const side = randi(0, 3), d = randi(0, 3);
    const p = randi(0, MAP_W - 1);
    const x = side === 0 ? p : side === 1 ? MAP_W - 1 - d : side === 2 ? p : d;
    const y = side === 0 ? d : side === 1 ? p : side === 2 ? MAP_H - 1 - d : p;
    if (Math.abs(x - ENTRANCE.x) < 4 && y > MAP_H - 6) continue;
    const t = G.tiles[idx(x, y)];
    if (t.path || t.obj) continue;
    addObject(pick(['oak', 'oak', 'pine', 'bush', 'bush']), x, y);
  }
  computeExhibits();
  terrainDirty = true;
}

function freshMonth() { return { admissions: 0, sales: 0, donations: 0, construction: 0, animals: 0, salaries: 0, guests: 0 }; }

function addObject(type, x, y) {
  const o = { id: G.nextId++, type, x, y, v: Math.random() };
  G.objects.set(o.id, o);
  G.tiles[idx(x, y)].obj = o.id;
  return o;
}
function objAt(x, y) { const t = tileAt(x, y); return t && t.obj ? G.objects.get(t.obj) : null; }

// ---------- exhibits ----------
// An exhibit is a fully fenced region (4-connected, not crossing fences) that
// has no path tiles and does not leak out of the map edge.
function computeExhibits() {
  G.exMap.fill(-1);
  G.exhibits = [];
  const N = MAP_W * MAP_H, seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (seen[s]) continue;
    const tiles = [], stack = [s];
    seen[s] = 1;
    let open = false, hasPath = false;
    while (stack.length) {
      const i = stack.pop(), x = i % MAP_W, y = (i / MAP_W) | 0;
      tiles.push(i);
      if (G.tiles[i].path) hasPath = true;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (fenceBetween(x, y, nx, ny)) continue;
        if (!inMap(nx, ny)) { open = true; continue; }
        const ni = idx(nx, ny);
        if (!seen[ni]) { seen[ni] = 1; stack.push(ni); }
      }
    }
    if (open || hasPath || tiles.length > 700) continue;
    const ex = { id: G.exhibits.length, key: Math.min(...tiles), tiles, stats: null, evals: {} };
    for (const i of tiles) G.exMap[i] = ex.id;
    G.exhibits.push(ex);
  }
  updateExhibitStats();
}

function exhibitAt(fx, fy) {
  const x = Math.floor(fx), y = Math.floor(fy);
  if (!inMap(x, y)) return null;
  const e = G.exMap[idx(x, y)];
  return e >= 0 ? G.exhibits[e] : null;
}
function exhibitByKey(key) { return G.exhibits.find(e => e.key === key) || null; }

function exhibitName(ex) {
  const st = ex.stats;
  if (!st || !st.animals.length) return 'Empty Exhibit';
  let best = null, n = 0;
  for (const sp in st.bySpecies) if (st.bySpecies[sp] > n) { n = st.bySpecies[sp]; best = sp; }
  return SPECIES[best].name + ' Exhibit';
}

function updateExhibitStats() {
  for (const ex of G.exhibits) {
    const st = { tiles: ex.tiles.length, terrain: {}, objs: {}, foliage: {}, animals: [], bySpecies: {}, dung: 0, food: {}, toys: 0 };
    for (const i of ex.tiles) {
      const t = G.tiles[i];
      st.terrain[t.t] = (st.terrain[t.t] || 0) + 1;
      if (t.obj) {
        const o = G.objects.get(t.obj);
        st.objs[o.type] = (st.objs[o.type] || 0) + 1;
        if (OBJECTS[o.type].cat === 'toy') st.toys++;
      }
    }
    ex.stats = st;
  }
  for (const a of G.animals) {
    const ex = exhibitAt(a.x, a.y);
    if (!ex) continue;
    ex.stats.animals.push(a);
    ex.stats.bySpecies[a.sp] = (ex.stats.bySpecies[a.sp] || 0) + 1;
  }
  for (const d of G.dung) { const ex = exhibitAt(d.x, d.y); if (ex) ex.stats.dung++; }
  for (const f of G.food) {
    const ex = exhibitAt(f.x, f.y);
    if (ex) ex.stats.food[f.diet] = (ex.stats.food[f.diet] || 0) + f.amount;
  }
  for (const ex of G.exhibits) {
    ex.evals = {};
    for (const sp in ex.stats.bySpecies) ex.evals[sp] = evaluateExhibit(ex, sp);
  }
}

// How well an exhibit suits a species: 0..1 total, per-factor scores, and
// plain-language complaints (the "the lions want more savannah" feedback).
function evaluateExhibit(ex, spKey) {
  const sp = SPECIES[spKey], st = ex.stats, n = st.tiles, issues = [];

  let terrain = 0, worstT = null, worstDef = 0;
  for (const t in sp.terrain) {
    const frac = (st.terrain[t] || 0) / n;
    terrain += Math.min(frac, sp.terrain[t]);
    const def = sp.terrain[t] - frac;
    if (def > worstDef) { worstDef = def; worstT = t; }
  }
  if (terrain < 0.85 && worstT) issues.push(`${sp.plural} want more ${TERRAIN[worstT].name} in their exhibit.`);

  let liked = 0, foreign = 0;
  for (const type in st.objs) {
    if (OBJECTS[type].cat !== 'foliage') continue;
    if (sp.foliage.includes(type)) liked += st.objs[type]; else foreign += st.objs[type];
  }
  let foliage = sp.foliageDensity ? Math.min(1, liked / n / sp.foliageDensity) : 1;
  if (sp.foliageDensity && foliage < 0.75) {
    issues.push(`${sp.plural} would like more ${sp.foliage.map(f => OBJECTS[f].name).join(' or ')}.`);
  }
  if (foreign / n > 0.02) {
    foliage -= Math.min(0.4, foreign / n * 4);
    issues.push(`${sp.plural} don't like the plants from other habitats.`);
  }
  foliage = Math.max(0, foliage);

  let rocks = 1;
  if (sp.rock) {
    rocks = Math.min(1, (st.objs[sp.rock] || 0) / n / sp.rockDensity);
    if (rocks < 0.7) issues.push(`${sp.plural} would like more ${OBJECTS[sp.rock].name}s to climb on.`);
  }

  let shelter = 1;
  if (sp.shelter && !st.objs[sp.shelter]) {
    shelter = 0;
    issues.push(`${sp.plural} need ${article(OBJECTS[sp.shelter].name)} to rest in.`);
  }

  let water = 1;
  if (sp.water && !st.terrain.water) {
    water = 0;
    issues.push(`${sp.plural} need some Fresh Water.`);
  }

  let needed = 0;
  for (const a of st.animals) needed += SPECIES[a.sp].space * (a.baby ? 0.5 : 1);
  const space = Math.min(1, n / Math.max(1, needed));
  if (space < 0.9) issues.push(`The exhibit is too crowded. ${sp.plural} need more space.`);

  const same = st.bySpecies[spKey] || 0, [gmin, gmax] = sp.group;
  let social = 1;
  if (same < gmin) {
    social = 0.5 + 0.5 * (same - 1) / Math.max(1, gmin - 1);
    issues.push(`${sp.plural} are lonely. They like groups of at least ${gmin}.`);
  } else if (same > gmax) {
    social = 0.7;
    issues.push(`There are too many ${sp.plural.toLowerCase()} together.`);
  }

  let company = 1;
  for (const other in st.bySpecies) {
    if (other === spKey || sp.compatible.includes(other)) continue;
    company = 0.55;
    issues.push(`${sp.plural} don't want to share with ${SPECIES[other].plural.toLowerCase()}.`);
  }

  const toys = st.toys ? 1 : 0.5;
  const clean = Math.max(0, 1 - (st.dung / n) * 4);
  if (clean < 0.6) issues.push(`The exhibit is dirty. Hire a Zookeeper!`);

  const total = (0.22 * terrain + 0.18 * foliage + 0.06 * rocks + 0.1 * shelter + 0.06 * water +
    0.16 * space + 0.1 * social + 0.04 * toys + 0.08 * clean) * company;
  return { total, parts: { terrain, foliage, rocks, shelter, water, space, social, toys, clean }, issues };
}

// ---------- pathfinding (BFS on the tile grid) ----------
let bfsPrev = new Int32Array(MAP_W * MAP_H);
function findPath(sx, sy, isGoal, canStep, maxNodes = 4000) {
  if (!inMap(sx, sy)) return null;
  if (isGoal(sx, sy)) return [];
  bfsPrev.fill(-2);
  const start = idx(sx, sy), queue = [start];
  bfsPrev[start] = -1;
  for (let head = 0; head < queue.length && queue.length < maxNodes; head++) {
    const cur = queue[head], cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inMap(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (bfsPrev[ni] !== -2 || !canStep(cx, cy, nx, ny)) continue;
      bfsPrev[ni] = cur;
      if (isGoal(nx, ny)) {
        const path = [];
        for (let p = ni; p !== start; p = bfsPrev[p]) path.push([p % MAP_W, (p / MAP_W) | 0]);
        return path.reverse();
      }
      queue.push(ni);
    }
  }
  return null;
}

const stepOnPath = (x, y, nx, ny) => G.tiles[idx(nx, ny)].path && !fenceBetween(x, y, nx, ny);
const stepOnLand = (x, y, nx, ny) => G.tiles[idx(nx, ny)].t !== 'water';

function adjacentToPath(x, y) {
  return DIRS.some(([dx, dy]) => { const t = tileAt(x + dx, y + dy); return t && t.path; });
}

// ---------- construction ----------
function spend(amount, bucket = 'construction') {
  if (G.money < amount) { notify(`Not enough money! You need ${money(amount)}.`, 'bad'); return false; }
  G.money -= amount;
  G.month[bucket] += amount;
  return true;
}

function setTerrain(x, y, type) {
  const t = tileAt(x, y);
  if (!t || t.t === type) return false;
  if (type === 'water' && (t.path || t.obj)) return false;
  if (!spend(TERRAIN[type].cost)) return false;
  t.t = type;
  terrainDirty = true;
  return true;
}

function placePath(x, y) {
  const t = tileAt(x, y);
  if (!t || t.path) return false;
  if (G.exMap[idx(x, y)] >= 0) { notify("Paths can't go inside an exhibit.", 'warn'); return false; }
  if (t.t === 'water' || t.obj) return false;
  if (!spend(PATH_COST)) return false;
  t.path = true;
  terrainDirty = true;
  return true;
}

function placeFenceRect(x0, y0, x1, y1, type) {
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];
  const segs = [];
  const bothPath = (ax, ay, bx, by) => { const a = tileAt(ax, ay), b = tileAt(bx, by); return a && b && a.path && b.path; };
  for (let x = x0; x <= x1; x++) {
    if (!bothPath(x, y0 - 1, x, y0)) segs.push(['h', hIdx(x, y0)]);
    if (!bothPath(x, y1, x, y1 + 1)) segs.push(['h', hIdx(x, y1 + 1)]);
  }
  for (let y = y0; y <= y1; y++) {
    if (!bothPath(x0 - 1, y, x0, y)) segs.push(['v', vIdx(x0, y)]);
    if (!bothPath(x1, y, x1 + 1, y)) segs.push(['v', vIdx(x1 + 1, y)]);
  }
  const todo = segs.filter(([k, i]) => (k === 'h' ? G.hF : G.vF)[i] !== type);
  if (!todo.length) return false;
  if (!spend(todo.length * FENCES[type].cost)) return false;
  for (const [k, i] of todo) (k === 'h' ? G.hF : G.vF)[i] = type;
  const before = G.exhibits.length;
  computeExhibits();
  if (G.exhibits.length > before) notify('New exhibit built! Add terrain, plants and animals.', 'good');
  return true;
}

function canPlaceObject(x, y, type) {
  const t = tileAt(x, y), def = OBJECTS[type];
  if (!t) return 'Out of bounds';
  if (t.obj) return 'Something is already there';
  if (t.path) return "Can't build on a path";
  if (t.t === 'water') return "Can't build on water";
  if (def.cat === 'building' || def.cat === 'scenery') {
    if (G.exMap[idx(x, y)] >= 0) return 'Guest buildings go outside exhibits';
    if (!adjacentToPath(x, y)) return 'Must be next to a path';
  }
  return null;
}

function placeObject(x, y, type) {
  const err = canPlaceObject(x, y, type);
  if (err) return err;
  if (!spend(OBJECTS[type].cost)) return 'Not enough money';
  addObject(type, x, y);
  return null;
}

function canPlaceAnimal(x, y, sp) {
  const t = tileAt(x, y);
  if (!t) return 'Out of bounds';
  if (G.exMap[idx(x, y)] < 0) return 'Animals must go inside a fenced exhibit';
  if (t.t === 'water' && !SPECIES[sp].swims) return "This animal can't swim";
  return null;
}

function placeAnimal(x, y, sp) {
  const err = canPlaceAnimal(x, y, sp);
  if (err) return err;
  if (!spend(SPECIES[sp].cost, 'animals')) return 'Not enough money';
  const a = createAnimal(sp, x + 0.5, y + 0.5);
  G.animals.push(a);
  updateExhibitStats();
  return null;
}

function createAnimal(sp, x, y, baby = false) {
  return {
    id: G.nextId++, kind: 'animal', sp, name: pick(ANIMAL_NAMES), sex: Math.random() < 0.5 ? 'M' : 'F',
    x, y, path: [], state: 'idle', timer: rand(0.5, 2), hunger: 85, health: 100, happy: 55,
    baby, born: G.time, sick: false, keeperT: 0, face: Math.random() < 0.5 ? 1 : -1, anim: 0,
    thought: null, thoughtT: 0, escaped: false, escNotified: false, breedT: 0,
  };
}

function bulldoze(x, y) {
  const t = tileAt(x, y);
  if (!t) return false;
  if (t.obj) {
    const o = G.objects.get(t.obj);
    G.objects.delete(t.obj);
    t.obj = 0;
    G.money += Math.round(OBJECTS[o.type].cost * 0.5);
    updateExhibitStats();
    return true;
  }
  if (t.path) {
    if (x === ENTRANCE.x && y === ENTRANCE.y) { notify("You can't remove the zoo entrance.", 'warn'); return false; }
    t.path = false;
    terrainDirty = true;
    computeExhibits();
    return true;
  }
  let removed = false;
  for (const i of [hIdx(x, y), hIdx(x, y + 1)]) if (G.hF[i]) { G.hF[i] = 0; removed = true; }
  for (const i of [vIdx(x, y), vIdx(x + 1, y)]) if (G.vF[i]) { G.vF[i] = 0; removed = true; }
  if (removed) computeExhibits();
  return removed;
}

function hireStaff(role) {
  if (!spend(STAFF_TYPES[role].hire)) return;
  G.staff.push({
    id: G.nextId++, kind: 'staff', role, name: pick(GUEST_NAMES) + ' ' + pick(GUEST_LAST),
    x: ENTRANCE.x + 0.5, y: ENTRANCE.y + 0.5, path: [], state: 'idle', timer: 0.5, task: null,
    face: 1, anim: 0, thought: null, thoughtT: 0, done: 0,
  });
  notify(`You hired a new ${STAFF_TYPES[role].name}.`, 'good');
}

// ---------- messages & floating text ----------
function notify(text, kind = 'info', at = null) {
  G.messages.unshift({ text, kind, at, t: performance.now() });
  if (G.messages.length > 30) G.messages.length = 30;
  if (typeof UI !== 'undefined') UI.messagesDirty = true;
}
function floatText(x, y, text, color = '#ffe066') { G.floats.push({ x, y, text, color, t: 0 }); }

// ---------- save / load ----------
const SAVE_KEY = 'menagerie-save-v1';
function saveGame() {
  const data = {
    v: 1, money: G.money, time: G.time, admission: G.admission, rating: G.rating, nextId: G.nextId,
    monthIndex: G.monthIndex, totalGuests: G.totalGuests, month: G.month, lastMonth: G.lastMonth,
    tiles: G.tiles.map(t => TERRAIN_ORDER.indexOf(t.t) + (t.path ? 16 : 0)),
    hF: Array.from(G.hF), vF: Array.from(G.vF),
    objects: [...G.objects.values()].map(o => [o.type, o.x, o.y, +o.v.toFixed(3)]),
    animals: G.animals.map(a => ({ ...a, path: [], state: 'idle', timer: 1 })),
    staff: G.staff.map(s => ({ ...s, path: [], state: 'idle', timer: 1, task: null })),
    food: G.food, dung: G.dung, litter: G.litter,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    notify('Zoo saved.', 'good');
  } catch (e) {
    notify("Couldn't save in this browser.", 'bad');
  }
}

function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

function loadGame() {
  let data;
  try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { data = null; }
  if (!data || data.v !== 1) { notify('No saved zoo found.', 'warn'); return false; }
  newGame();
  Object.assign(G, {
    money: data.money, time: data.time, admission: data.admission, rating: data.rating, nextId: data.nextId,
    monthIndex: data.monthIndex, totalGuests: data.totalGuests, month: data.month, lastMonth: data.lastMonth,
    hF: Uint8Array.from(data.hF), vF: Uint8Array.from(data.vF),
    animals: data.animals, staff: data.staff, food: data.food, dung: data.dung, litter: data.litter,
    guests: [], objects: new Map(), messages: [],
  });
  G.tiles.forEach((t, i) => { const v = data.tiles[i]; t.t = TERRAIN_ORDER[v & 15]; t.path = v >= 16; t.obj = 0; });
  for (const [type, x, y, v] of data.objects) { const o = addObject(type, x, y); o.v = v; }
  G.litterCount.fill(0);
  for (const l of G.litter) G.litterCount[idx(Math.floor(l.x), Math.floor(l.y))]++;
  computeExhibits();
  terrainDirty = true;
  notify('Zoo loaded. Welcome back!', 'good');
  return true;
}
