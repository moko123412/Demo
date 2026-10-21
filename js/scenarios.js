'use strict';
// Scenarios: preset starts with goals, optional time limits and unlocks.

const SCENARIOS = [
  {
    id: 'small', name: 'Small Zoo', difficulty: 1, money: 30000, months: 0,
    blurb: 'The town council has given you a patch of land and a little money. Build your first exhibit and open the gates!',
    goals: [
      { t: 'animal', sp: 'lion', n: 2, label: 'Adopt 2 African Lions' },
      { t: 'staff', role: 'keeper', n: 1, label: 'Hire a Zookeeper' },
      { t: 'guests', n: 20, label: 'Have 20 guests in your zoo' },
    ],
  },
  {
    id: 'family', name: 'Family Day Out', difficulty: 1, money: 40000, months: 12,
    blurb: 'Families want a fun day at the zoo. Give them variety, snacks and somewhere to rest their feet.',
    goals: [
      { t: 'species', n: 3, label: 'Show 3 different species' },
      { t: 'building', type: 'burger', n: 1, label: 'Build a Burger Stand' },
      { t: 'building', type: 'restroom', n: 1, label: 'Build a Restroom' },
      { t: 'guests', n: 40, label: 'Have 40 guests in your zoo' },
      { t: 'rating', n: 50, label: 'Reach a zoo rating of 50' },
    ],
  },
  {
    id: 'safari', name: 'Savannah Safari', difficulty: 2, money: 50000, months: 18,
    blurb: 'Recreate the African plains. Zebras, giraffes and elephants can share one big exhibit if you build it right.',
    animals: ['lion', 'cheetah', 'elephant', 'giraffe', 'zebra', 'rhino', 'hippo', 'flamingo'],
    goals: [
      { t: 'animal', sp: 'zebra', n: 4, happy: 70, label: '4 happy Plains Zebras' },
      { t: 'animal', sp: 'giraffe', n: 2, happy: 70, label: '2 happy Giraffes' },
      { t: 'animal', sp: 'elephant', n: 2, happy: 70, label: '2 happy Elephants' },
      { t: 'rating', n: 60, label: 'Reach a zoo rating of 60' },
    ],
  },
  {
    id: 'revive', name: 'Revitalize the Old Zoo', difficulty: 2, money: 8000, months: 24, setup: setupOldZoo,
    blurb: 'This tired old zoo is falling apart. The animals are miserable, the paths are filthy and the bank is nervous. Turn it around!',
    goals: [
      { t: 'avgHappy', n: 75, label: 'Average animal happiness of 75' },
      { t: 'rating', n: 70, label: 'Reach a zoo rating of 70' },
      { t: 'money', n: 30000, label: 'Have $30,000 in the bank' },
    ],
  },
  {
    id: 'arctic', name: 'Polar Paradise', difficulty: 3, money: 35000, months: 24,
    blurb: 'A cold-weather zoo. Build icy habitats that make penguins and polar bears feel at home, and they will raise families.',
    animals: ['penguin', 'polarbear', 'grizzly'],
    goals: [
      { t: 'births', sp: 'penguin', n: 3, label: '3 Penguin chicks born' },
      { t: 'animal', sp: 'polarbear', n: 2, happy: 75, label: '2 happy Polar Bears' },
      { t: 'guests', n: 80, label: 'Have 80 guests in your zoo' },
    ],
  },
  {
    id: 'island', name: 'Island Zoo', difficulty: 3, money: 45000, months: 30, setup: setupIsland,
    blurb: 'Your zoo is on a small island. Land is precious, so plan every exhibit carefully.',
    goals: [
      { t: 'species', n: 6, label: 'Show 6 different species' },
      { t: 'guests', n: 120, label: 'Have 120 guests in your zoo' },
      { t: 'rating', n: 75, label: 'Reach a zoo rating of 75' },
    ],
  },
  {
    id: 'endangered', name: 'Endangered Species', difficulty: 4, money: 60000, months: 36,
    blurb: 'Conservation groups need your help. Breed three rare animals by giving them perfect homes.',
    goals: [
      { t: 'births', sp: 'panda', n: 1, label: 'A Giant Panda cub is born' },
      { t: 'births', sp: 'rhino', n: 1, label: 'A Black Rhino calf is born' },
      { t: 'births', sp: 'tiger', n: 1, label: 'A Bengal Tiger cub is born' },
    ],
  },
  {
    id: 'tycoon', name: 'Zoo Tycoon Challenge', difficulty: 5, money: 25000, months: 48,
    blurb: 'Build the greatest zoo in the world from almost nothing. Only a true tycoon can manage this.',
    goals: [
      { t: 'money', n: 150000, label: 'Have $150,000 in the bank' },
      { t: 'species', n: 10, label: 'Show 10 different species' },
      { t: 'guests', n: 200, label: 'Have 200 guests in your zoo' },
      { t: 'rating', n: 85, label: 'Reach a zoo rating of 85' },
    ],
  },
];

function speciesAllowed(sp) {
  const scn = G && scenarioById(G.scenarioId);
  return !scn || !scn.animals || scn.animals.includes(sp);
}

function scenarioById(id) { return SCENARIOS.find(s => s.id === id) || null; }

// ---------- goal checks ----------
function goalProgress(g) {
  const free = G.animals.filter(a => !a.escaped);
  switch (g.t) {
    case 'guests': return [G.guests.length, g.n];
    case 'rating': return [Math.round(G.rating), g.n];
    case 'money': return [Math.round(G.money), g.n];
    case 'species': return [new Set(free.map(a => a.sp)).size, g.n];
    case 'animal': return [free.filter(a => a.sp === g.sp && !a.baby && a.happy >= (g.happy || 0)).length, g.n];
    case 'staff': return [G.staff.filter(s => s.role === g.role).length, g.n];
    case 'building': { let n = 0; for (const o of G.objects.values()) if (o.type === g.type) n++; return [n, g.n]; }
    case 'births': return [(G.births || {})[g.sp] || 0, g.n];
    case 'avgHappy': return [free.length >= 3 ? Math.round(free.reduce((s, a) => s + a.happy, 0) / free.length) : 0, g.n];
  }
  return [0, 1];
}

function progressText(g) {
  const [v, n] = goalProgress(g);
  return g.t === 'money' ? `${money(v)} / ${money(n)}` : `${Math.min(v, n)} / ${n}`;
}

function checkScenario() {
  const scn = scenarioById(G.scenarioId);
  if (!scn || G.scnState !== 'playing') return;
  scn.goals.forEach((g, i) => {
    if (G.goalsDone[i]) return;
    const [v, n] = goalProgress(g);
    if (v >= n) {
      G.goalsDone[i] = true;
      notify(`🎯 Goal complete: ${g.label}!`, 'good');
      Sound.play('goal');
    }
  });
  if (G.goalsDone.length === scn.goals.length && G.goalsDone.every(Boolean)) {
    G.scnState = 'won';
    markScenarioDone(scn.id);
    Sound.play('win');
    UI.showResult(true);
  } else if (scn.months && G.monthIndex >= scn.months) {
    G.scnState = 'failed';
    Sound.play('lose');
    UI.showResult(false);
  }
}

function monthsLeft() {
  const scn = scenarioById(G.scenarioId);
  return scn && scn.months ? Math.max(0, scn.months - G.monthIndex) : null;
}

// ---------- unlocks ----------
const SCN_KEY = 'menagerie-scenarios-v1';
function completedScenarios() {
  try { return JSON.parse(localStorage.getItem(SCN_KEY)) || []; } catch (e) { return []; }
}
function markScenarioDone(id) {
  const done = completedScenarios();
  if (!done.includes(id)) done.push(id);
  try { localStorage.setItem(SCN_KEY, JSON.stringify(done)); } catch (e) { /* storage unavailable */ }
}
function scenarioUnlocked(i) {
  return i < 2 || completedScenarios().includes(SCENARIOS[i - 1].id);
}

function startScenario(id) {
  const scn = scenarioById(id);
  newGame();
  G.scenarioId = id;
  G.scnState = 'playing';
  G.goalsDone = scn.goals.map(() => false);
  if (scn.setup) {
    G.money = 1e9;
    Sound.hold++;
    scn.setup();
    Sound.hold--;
    G.month = freshMonth();
  }
  G.money = scn.money;
  G.messages = [];
  computeExhibits();
  terrainDirty = true;
}

// ---------- special maps ----------
function setupOldZoo() {
  const fill = (x0, y0, x1, y1, t) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setTerrain(x, y, t); };
  placeFenceRect(17, 31, 22, 37, 1);
  fill(17, 31, 22, 37, 'grass');
  placeObject(18, 32, 'pine');
  placeFenceRect(25, 30, 31, 37, 2);
  fill(25, 30, 31, 37, 'dirt');
  placeObject(26, 31, 'pine'); placeObject(29, 34, 'oak');
  placeFenceRect(10, 32, 15, 37, 1);
  fill(10, 32, 15, 37, 'sand');
  for (let x = 10; x <= 15; x++) placePath(x, MAP_H - 10);
  placeAnimal(19, 34, 'lion'); placeAnimal(20, 35, 'lion');
  placeAnimal(27, 33, 'zebra'); placeAnimal(28, 35, 'zebra'); placeAnimal(30, 32, 'zebra');
  placeAnimal(12, 34, 'penguin'); placeAnimal(13, 35, 'penguin');
  for (const a of G.animals) { a.happy = 25; a.hunger = 45; }
  for (let i = 0; i < 45; i++) {
    const x = randi(10, 32), y = MAP_H - 10;
    G.litter.push({ x: x + Math.random(), y: y + Math.random(), c: randi(0, 2) });
    G.litterCount[idx(x, y)]++;
  }
  for (const ex of G.exhibits) for (let i = 0; i < 6; i++) {
    const t = pick(ex.tiles);
    G.dung.push({ x: (t % MAP_W) + Math.random(), y: ((t / MAP_W) | 0) + Math.random() });
  }
  G.rating = 15;
  G.admission = 18;
}

function setupIsland() {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const dx = (x - 24) / 15, dy = (y - 29) / 13;
      const wobble = hash2(x, y, 3) * 0.12;
      const land = dx * dx + dy * dy < 1 - wobble || (Math.abs(x - ENTRANCE.x) <= 2 && y >= 38);
      if (land) continue;
      const t = G.tiles[idx(x, y)];
      if (t.obj) { G.objects.delete(t.obj); t.obj = 0; }
      t.path = false;
      t.t = 'water';
    }
  }
  for (let y = MAP_H - 10; y < MAP_H; y++) G.tiles[idx(ENTRANCE.x, y)].path = true;
  for (let x = 16; x <= 32; x++) if (G.tiles[idx(x, MAP_H - 10)].t !== 'water') G.tiles[idx(x, MAP_H - 10)].path = true;
  for (let x = ENTRANCE.x - 2; x <= ENTRANCE.x + 2; x++) for (let y = 38; y < MAP_H; y++) if (G.tiles[idx(x, y)].t === 'water') G.tiles[idx(x, y)].t = 'sand';
}
