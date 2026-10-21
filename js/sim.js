'use strict';
// Simulation: animals, guests, staff, finances, zoo rating.

function gameDay() { return Math.floor(G.time / DAY_SECONDS); }
function dateString() {
  const d = gameDay(), m = Math.floor(d / DAYS_PER_MONTH);
  return `${MONTHS[m % 12]} ${(d % DAYS_PER_MONTH) + 1}, Year ${Math.floor(m / 12) + 1}`;
}

function step(dt) {
  G.time += dt;
  for (let i = G.animals.length - 1; i >= 0; i--) updateAnimal(G.animals[i], dt);
  for (let i = G.guests.length - 1; i >= 0; i--) updateGuest(G.guests[i], dt);
  for (const s of G.staff) updateStaff(s, dt);
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.t += dt;
    if (f.t > 2.2) G.floats.splice(i, 1);
  }
  G.food = G.food.filter(f => f.amount > 0);

  G.statT -= dt;
  if (G.statT <= 0) {
    G.statT = 1;
    updateExhibitStats();
    updateRating();
    spawnGuests();
    breedAnimals();
  }
  const m = Math.floor(gameDay() / DAYS_PER_MONTH);
  if (m !== G.monthIndex) endMonth(m);
}

// Move an entity along its tile path. Returns true when the path is finished.
function moveAlong(e, speed, dt) {
  if (!e.path.length) return true;
  const [tx, ty] = e.path[0];
  const gx = tx + 0.5, gy = ty + 0.5;
  const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy);
  const mv = speed * dt;
  if (Math.abs(dx - dy) > 0.01) e.face = dx - dy > 0 ? 1 : -1;
  e.anim += dt * speed * 9;
  if (d <= mv) { e.x = gx; e.y = gy; e.path.shift(); return !e.path.length; }
  e.x += dx / d * mv;
  e.y += dy / d * mv;
  return false;
}

function think(e, icon, text, dur = 3.5) {
  e.thought = icon;
  e.thoughtT = dur;
  if (text && e.thoughts) {
    if (e.thoughts[0] !== text) e.thoughts.unshift(text);
    if (e.thoughts.length > 6) e.thoughts.length = 6;
  }
}

// ---------- animals ----------
function animalStepper(a, ex) {
  const swims = SPECIES[a.sp].swims;
  return (x, y, nx, ny) => {
    if (fenceBetween(x, y, nx, ny)) return false;
    const i = idx(nx, ny);
    if (G.tiles[i].t === 'water' && !swims) return false;
    return ex ? G.exMap[i] === ex.id : true;
  };
}

function wanderTarget(a, ex, radius) {
  const ax = Math.floor(a.x), ay = Math.floor(a.y);
  for (let tries = 0; tries < 8; tries++) {
    const tx = ax + randi(-radius, radius), ty = ay + randi(-radius, radius);
    if (!inMap(tx, ty) || (tx === ax && ty === ay)) continue;
    const path = findPath(ax, ay, (x, y) => x === tx && y === ty, animalStepper(a, ex), 600);
    if (path) return path;
  }
  return null;
}

function updateAnimal(a, dt) {
  const sp = SPECIES[a.sp];
  const ex = exhibitAt(a.x, a.y);
  a.hunger = Math.max(0, a.hunger - dt * 0.2);
  a.keeperT = Math.max(0, a.keeperT - dt);
  a.thoughtT -= dt;

  a.escaped = !ex;
  if (a.escaped && !a.escNotified) {
    a.escNotified = true;
    notify(`${a.name} the ${sp.name} has escaped! Fence it back in.`, 'bad', { x: a.x, y: a.y });
  } else if (!a.escaped) a.escNotified = false;

  // happiness drifts toward what the exhibit can offer
  const ev = ex && ex.evals[a.sp];
  let target = ev ? ev.total * 100 : 10;
  if (a.hunger < 30) target -= 25;
  if (a.sick) target -= 15;
  if (a.keeperT > 0) target += 8;
  a.happy += (clamp(target, 0, 100) - a.happy) * Math.min(1, dt * 0.06);

  if (!a.sick && Math.random() < dt * 0.0003 * (a.happy < 40 ? 4 : 1)) {
    a.sick = true;
    notify(`${a.name} the ${sp.name} is sick.`, 'warn', { x: a.x, y: a.y });
  }
  const dirty = ex && ex.stats.dung / ex.stats.tiles > 0.2;
  if (a.hunger <= 0 || a.sick || dirty) a.health -= dt * (a.sick ? 0.25 : 0.35);
  else if (a.health < 100) a.health = Math.min(100, a.health + dt * 0.1);
  if (a.health <= 0) {
    G.animals.splice(G.animals.indexOf(a), 1);
    notify(`Sadly, ${a.name} the ${sp.name} has died.`, 'bad');
    G.rating = Math.max(0, G.rating - 8);
    if (UI.sel && UI.sel.id === a.id) UI.select(null);
    return;
  }
  if (a.baby && G.time - a.born > DAY_SECONDS * 20) {
    a.baby = false;
    notify(`${a.name} the ${sp.name} is all grown up!`, 'good', { x: a.x, y: a.y });
  }
  if (ex && Math.random() < dt * 0.01) G.dung.push({ x: a.x + rand(-0.15, 0.15), y: a.y + rand(-0.15, 0.15) });

  if (a.thoughtT < -6 + Math.random() * 3) {
    if (a.sick) think(a, '🤒');
    else if (a.hunger < 40) think(a, '🍖');
    else if (a.escaped) think(a, '❗');
    else if (a.happy < 35) think(a, '😠');
    else if (a.happy > 80) think(a, '❤️');
    else a.thoughtT = 0;
  }

  const speed = sp.speed * (a.baby ? 0.85 : 1) * (a.state === 'pace' ? 1.5 : 1);
  switch (a.state) {
    case 'walk': case 'pace':
      if (moveAlong(a, speed, dt)) { a.state = 'idle'; a.timer = rand(1, 4); }
      break;
    case 'toFood':
      if (moveAlong(a, speed, dt)) {
        a.state = 'eat';
        a.timer = 6;
      }
      break;
    case 'eat': {
      const f = G.food.find(f => f.diet === sp.diet && Math.hypot(f.x - a.x, f.y - a.y) < 1.2 && f.amount > 0);
      if (!f) { a.state = 'idle'; a.timer = 1; break; }
      a.hunger = Math.min(100, a.hunger + dt * 18);
      f.amount -= dt * 6;
      a.anim += dt * 3;
      a.timer -= dt;
      if (a.hunger >= 98 || a.timer <= 0) { a.state = 'idle'; a.timer = rand(1, 3); }
      break;
    }
    case 'play': case 'rest': case 'idle':
      a.timer -= dt;
      if (a.state === 'play') a.anim += dt * 6;
      if (a.timer <= 0) animalDecide(a, ex);
      break;
  }
}

function animalDecide(a, ex) {
  const sp = SPECIES[a.sp];
  if (a.escaped) {
    a.path = wanderTarget(a, null, 5) || [];
    a.state = a.path.length ? 'walk' : 'idle';
    a.timer = 1;
    return;
  }
  if (a.hunger < 60) {
    const food = G.food.filter(f => f.diet === sp.diet && f.amount > 0 && exhibitAt(f.x, f.y) === ex);
    if (food.length) {
      const f = food[0];
      const path = findPath(Math.floor(a.x), Math.floor(a.y), (x, y) => x === Math.floor(f.x) && y === Math.floor(f.y), animalStepper(a, ex), 800);
      if (path) { a.path = path; a.state = 'toFood'; return; }
    }
  }
  const r = Math.random();
  if (a.happy > 70 && r < 0.3) {
    a.state = 'play';
    a.timer = rand(2.5, 4);
    a.anim = 0;
    if (Math.random() < 0.4) floatText(a.x, a.y, sp.sound, '#fff');
    return;
  }
  if (a.happy < 35 && r < 0.5) {
    a.path = wanderTarget(a, ex, 6) || [];
    a.state = a.path.length ? 'pace' : 'idle';
    a.timer = 1;
    return;
  }
  if (r < 0.25) { a.state = 'rest'; a.timer = rand(5, 10); return; }
  a.path = wanderTarget(a, ex, 4) || [];
  a.state = a.path.length ? 'walk' : 'idle';
  a.timer = rand(1, 3);
}

function breedAnimals() {
  for (const ex of G.exhibits) {
    for (const spKey in ex.stats.bySpecies) {
      const sp = SPECIES[spKey];
      const group = ex.stats.animals.filter(a => a.sp === spKey);
      if (group.length >= sp.group[1]) continue;
      const adults = group.filter(a => !a.baby && a.happy > 75 && a.health > 60);
      const mom = adults.find(a => a.sex === 'F'), dad = adults.find(a => a.sex === 'M');
      if (!mom || !dad || Math.random() > 1 / (DAY_SECONDS * 45)) continue;
      const baby = createAnimal(spKey, mom.x, mom.y, true);
      baby.hunger = 100;
      G.animals.push(baby);
      notify(`A baby ${sp.name} was born! Say hello to ${baby.name}.`, 'good', { x: mom.x, y: mom.y });
      floatText(mom.x, mom.y, '🍼 New baby!', '#ffd6e7');
    }
  }
}

// ---------- guests ----------
function fairPrice() {
  const species = new Set(G.animals.filter(a => !a.escaped).map(a => a.sp)).size;
  return Math.min(60, 5 + species * 3 + G.animals.length * 0.25 + G.rating / 10);
}

function spawnGuests() {
  if (G.guests.length >= 350) return;
  const ratio = G.admission / fairPrice();
  const priceFactor = ratio <= 1 ? 1 : Math.max(0, 2 - ratio);
  const animalFactor = G.animals.length ? 1 : 0.25;
  const chance = (0.1 + 0.9 * Math.pow(G.rating / 100, 1.3)) * priceFactor * animalFactor;
  if (Math.random() < chance) spawnGuest(ratio);
  if (Math.random() < chance * 0.5) spawnGuest(ratio);
}

const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a26a42'];
const HAIRS = ['#2b1d12', '#5a3a1a', '#a5682a', '#e6c46a', '#1b1b1b', '#7b2d12', '#bbbbbb'];
function spawnGuest(priceRatio) {
  const kid = Math.random() < 0.3;
  const g = {
    id: G.nextId++, kind: 'guest', name: pick(GUEST_NAMES) + ' ' + pick(GUEST_LAST),
    x: ENTRANCE.x + 0.5, y: ENTRANCE.y + 0.5, path: [], prev: -1,
    hunger: rand(55, 100), thirst: rand(55, 100), energy: rand(75, 100), bladder: rand(60, 100),
    happy: rand(55, 75), cash: randi(25, 110), thoughts: [], seen: [], state: 'walk', timer: 0,
    kid, shirt: `hsl(${randi(0, 359)},${randi(45, 75)}%,${randi(40, 60)}%)`, pants: pick(['#2f3e5c', '#4a4a4a', '#6b5440', '#20304a']),
    skin: pick(SKINS), hair: pick(HAIRS), balloon: kid && Math.random() < 0.4 ? `hsl(${randi(0, 359)},80%,60%)` : null,
    carry: null, carryT: 0, timeIn: 0, maxTime: rand(DAY_SECONDS * 8, DAY_SECONDS * 18), fav: null, favScore: 0,
    face: 1, anim: Math.random() * 10, thought: null, thoughtT: 0, needCooldown: 0, goal: null,
  };
  if (g.cash < G.admission) return;
  g.cash -= G.admission;
  G.money += G.admission;
  G.month.admissions += G.admission;
  G.month.guests++;
  G.totalGuests++;
  if (priceRatio > 1.2) { g.happy -= 10; think(g, '💸', 'The admission price is a bit steep.'); }
  else think(g, '😀', "I can't wait to see the animals!");
  G.guests.push(g);
}

function removeGuest(g) {
  G.guests.splice(G.guests.indexOf(g), 1);
  if (UI.sel && UI.sel.id === g.id) UI.select(null);
}

function updateGuest(g, dt) {
  g.timeIn += dt;
  g.thoughtT -= dt;
  g.needCooldown -= dt;
  g.hunger -= dt * 0.3; g.thirst -= dt * 0.4; g.energy -= dt * 0.2; g.bladder -= dt * 0.28;
  for (const k of ['hunger', 'thirst', 'energy', 'bladder']) g[k] = clamp(g[k], 0, 100);
  if (g.hunger < 20 || g.thirst < 20 || g.bladder < 15) g.happy -= dt * 0.5;
  g.happy = clamp(g.happy, 0, 100);
  if (g.carry) {
    g.carryT -= dt;
    if (g.carryT <= 0) finishCarry(g);
  }

  switch (g.state) {
    case 'walk': case 'goto': case 'leave':
      if (moveAlong(g, g.state === 'leave' ? 1.5 : 1.25, dt)) guestArrive(g);
      break;
    case 'view': case 'use': case 'sit':
      g.timer -= dt;
      if (g.state === 'sit') g.energy = Math.min(100, g.energy + dt * 12);
      if (g.timer <= 0) { finishActivity(g); g.state = 'walk'; }
      break;
  }
}

function guestArrive(g) {
  const tx = Math.floor(g.x), ty = Math.floor(g.y), t = tileAt(tx, ty);
  if (!t || !t.path) { removeGuest(g); return; }
  if (g.state === 'leave') {
    if (tx === ENTRANCE.x && ty === ENTRANCE.y) removeGuest(g);
    else startLeaving(g);
    return;
  }

  if (G.litterCount[idx(tx, ty)] && Math.random() < 0.5) {
    g.happy -= 1.5;
    if (Math.random() < 0.3) think(g, '🗑️', 'This path is filthy!');
  }
  for (const a of G.animals) {
    if (a.escaped && Math.abs(a.x - g.x) + Math.abs(a.y - g.y) < 4) {
      g.happy -= 6;
      think(g, '😱', `Help! A loose ${SPECIES[a.sp].name.toLowerCase()}!`);
      break;
    }
  }
  for (const [dx, dy] of DIRS) {
    const o = objAt(tx + dx, ty + dy);
    if (o && OBJECTS[o.type].appeal && Math.random() < 0.3) g.happy += OBJECTS[o.type].appeal;
  }

  if (g.state === 'goto' && g.goal) { useBuilding(g); return; }

  const ex = unseenExhibitNear(g, tx, ty);
  if (ex) {
    g.seen.push(ex.key);
    g.state = 'view';
    g.timer = rand(3, 5);
    g.viewing = ex.key;
    const c = ex.tiles[(ex.tiles.length / 2) | 0];
    g.face = ((c % MAP_W) - tx) - (((c / MAP_W) | 0) - ty) > 0 ? 1 : -1;
    return;
  }

  if (g.timeIn > g.maxTime || g.energy < 8 || g.happy < 15) { startLeaving(g); return; }
  if (g.needCooldown <= 0 && seekNeed(g, tx, ty)) return;

  // random walk along the paths, avoiding doubling back
  const opts = [];
  for (const [dx, dy] of DIRS) {
    const nx = tx + dx, ny = ty + dy;
    if (!inMap(nx, ny) || !stepOnPath(tx, ty, nx, ny)) continue;
    if (nx === ENTRANCE.x && ny === ENTRANCE.y) continue;
    opts.push([nx, ny]);
  }
  let choices = opts.filter(([x, y]) => idx(x, y) !== g.prev);
  if (!choices.length) choices = opts;
  g.prev = idx(tx, ty);
  if (choices.length) { g.path = [pick(choices)]; g.state = 'walk'; }
  else { g.state = 'view'; g.timer = 1; }
}

function unseenExhibitNear(g, tx, ty) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!inMap(tx + dx, ty + dy)) continue;
      const e = G.exMap[idx(tx + dx, ty + dy)];
      if (e >= 0 && !g.seen.includes(G.exhibits[e].key)) return G.exhibits[e];
    }
  }
  return null;
}

const NEEDS = [
  { stat: 'thirst',  below: 40, match: o => OBJECTS[o.type].sells === 'drink', icon: '🥤', miss: "I'm thirsty, but there's nowhere to buy a drink." },
  { stat: 'hunger',  below: 40, match: o => OBJECTS[o.type].sells === 'food' || OBJECTS[o.type].sells === 'treat', icon: '🍔', miss: "I'm hungry! Where can I get some food?" },
  { stat: 'bladder', below: 35, match: o => o.type === 'restroom', icon: '🚻', miss: 'I really need a restroom!' },
  { stat: 'energy',  below: 35, match: o => o.type === 'bench', icon: '🪑', miss: 'My feet hurt. I wish there were benches.' },
];

function seekNeed(g, tx, ty) {
  const need = NEEDS.filter(n => g[n.stat] < n.below).sort((a, b) => g[a.stat] - g[b.stat])[0];
  if (!need) return false;
  let goal = null;
  const path = findPath(tx, ty, (x, y) => {
    if (!G.tiles[idx(x, y)].path) return false;
    for (const [dx, dy] of DIRS) {
      const o = objAt(x + dx, y + dy);
      if (o && need.match(o)) { goal = o; return true; }
    }
    return false;
  }, stepOnPath, 3000);
  if (path && goal) {
    g.path = path;
    g.goal = goal.id;
    g.state = 'goto';
    think(g, need.icon);
    if (!path.length) useBuilding(g);
    return true;
  }
  g.needCooldown = 8;
  g.happy -= 3;
  think(g, need.icon, need.miss);
  return false;
}

function useBuilding(g) {
  const o = G.objects.get(g.goal);
  g.goal = null;
  if (!o) { g.state = 'walk'; return; }
  const def = OBJECTS[o.type];
  if (def.price) {
    if (g.cash < def.price) { think(g, '💸', "I can't afford anything here."); g.state = 'walk'; return; }
    g.cash -= def.price;
    G.money += def.price;
    G.month.sales += def.price;
    o.sales = (o.sales || 0) + def.price;
    floatText(o.x + 0.5, o.y + 0.5, '+' + money(def.price), '#9be564');
  }
  g.useType = o.type;
  g.state = o.type === 'bench' ? 'sit' : 'use';
  g.timer = o.type === 'bench' ? 6 : 2;
  const dx = o.x - Math.floor(g.x), dy = o.y - Math.floor(g.y);
  g.face = dx - dy >= 0 ? 1 : -1;
}

function finishActivity(g) {
  switch (g.useType) {
    case 'burger': g.hunger = 100; g.happy += 4; g.carry = 'burger'; g.carryT = 6; think(g, '😋', 'That burger was delicious!'); break;
    case 'drinks': g.thirst = 100; g.happy += 3; g.carry = 'drink'; g.carryT = 6; think(g, '😋', 'Ahh, refreshing!'); break;
    case 'icecream': g.hunger = Math.min(100, g.hunger + 35); g.thirst = Math.min(100, g.thirst + 15); g.happy += 6; g.carry = 'icecream'; g.carryT = 5; think(g, '🍦', 'Ice cream! Best day ever.'); break;
    case 'restroom': g.bladder = 100; g.happy += 2; think(g, '😌', 'What a relief.'); break;
    case 'bench': g.happy += 2; think(g, '😌', 'Nice to sit down for a bit.'); break;
  }
  g.useType = null;
  if (g.viewing != null) { viewExhibit(g, exhibitByKey(g.viewing)); g.viewing = null; }
}

function finishCarry(g) {
  g.carry = null;
  const tx = Math.floor(g.x), ty = Math.floor(g.y);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const o = objAt(tx + dx, ty + dy);
    if (o && o.type === 'trash') return;
  }
  if (Math.random() < 0.35) {
    G.litter.push({ x: g.x + rand(-0.25, 0.25), y: g.y + rand(-0.25, 0.25), c: randi(0, 2) });
    G.litterCount[idx(tx, ty)]++;
    if (Math.random() < 0.3) think(g, '🗑️', "I couldn't find a trash can.");
  }
}

function viewExhibit(g, ex) {
  if (!ex) return;
  const animals = ex.stats.animals;
  if (!animals.length) { g.happy -= 1; think(g, '😕', 'Why is this exhibit empty?'); return; }
  let value = 0, avg = 0, player = null, baby = null, bestSp = null, bestV = 0;
  for (const a of animals) {
    const sp = SPECIES[a.sp], v = sp.appeal * (0.25 + 0.75 * a.happy / 100) * (a.baby ? 1.5 : 1);
    value += v;
    avg += a.happy;
    if (a.state === 'play') player = a;
    if (a.baby) baby = a;
    if (v > bestV) { bestV = v; bestSp = a.sp; }
  }
  avg /= animals.length;
  const sp = SPECIES[bestSp];
  let gain = Math.min(18, 3 + value * 0.45);
  if (avg < 35) {
    gain = -5;
    think(g, '😢', `The ${sp.plural.toLowerCase()} look miserable.`);
  } else if (player) {
    gain += 5;
    think(g, '🤩', `Look! The ${SPECIES[player.sp].name.toLowerCase()} is playing!`);
  } else if (baby) {
    gain += 3;
    think(g, '🥰', `Aww, a baby ${SPECIES[baby.sp].name.toLowerCase()}!`);
  } else if (gain > 8) {
    think(g, '😍', `I love the ${sp.plural.toLowerCase()}!`);
  } else {
    think(g, '🙂', `The ${sp.plural.toLowerCase()} are nice.`);
  }
  g.happy = clamp(g.happy + gain, 0, 100);
  if (bestV > g.favScore) { g.favScore = bestV; g.fav = bestSp; }
  if (g.happy > 65 && Math.random() < 0.35 && g.cash > 2) {
    const amt = Math.min(g.cash, randi(1, 2 + Math.floor(value / 8)));
    g.cash -= amt;
    G.money += amt;
    G.month.donations += amt;
    floatText(g.x, g.y, `+${money(amt)} donation`, '#9be564');
  }
}

function startLeaving(g) {
  const tx = Math.floor(g.x), ty = Math.floor(g.y);
  const path = findPath(tx, ty, (x, y) => x === ENTRANCE.x && y === ENTRANCE.y, stepOnPath, 4000);
  if (!path) { removeGuest(g); return; }
  if (g.state !== 'leave') think(g, g.happy > 60 ? '😊' : '😞', g.happy > 60 ? 'What a great zoo! Time to go home.' : "I'm not having fun. I'm leaving.");
  g.state = 'leave';
  g.path = path;
  if (!path.length) removeGuest(g);
}

// ---------- staff ----------
function updateStaff(s, dt) {
  s.thoughtT -= dt;
  if (s.state === 'go' || s.state === 'walk') {
    if (moveAlong(s, 1.6, dt)) {
      if (s.state === 'go') { s.state = 'work'; s.timer = 3; }
      else { s.state = 'idle'; s.timer = 0.3; }
    }
    return;
  }
  s.timer -= dt;
  if (s.state === 'work') s.anim += dt * 4;
  if (s.timer > 0) return;
  if (s.state === 'work') { s.role === 'keeper' ? keeperWork(s) : sweep(s); }
  s.role === 'keeper' ? keeperDecide(s) : maintDecide(s);
}

function keeperNeeds(ex) {
  const st = ex.stats, diets = [];
  for (const a of st.animals) {
    const diet = SPECIES[a.sp].diet;
    if (a.hunger < 70 && (st.food[diet] || 0) < 40 && !diets.includes(diet)) diets.push(diet);
  }
  const sick = st.animals.filter(a => a.sick).length;
  return { diets, sick, score: diets.length * 3 + st.dung * 0.4 + sick * 4 };
}

function keeperDecide(s) {
  const sx = Math.floor(s.x), sy = Math.floor(s.y);
  const taken = new Set(G.staff.filter(o => o !== s && o.task != null).map(o => o.task));
  let best = null, bestScore = 0.9;
  for (const ex of G.exhibits) {
    if (!ex.stats.animals.length || taken.has(ex.key)) continue;
    const need = keeperNeeds(ex).score;
    const c = ex.tiles[0], d = Math.abs((c % MAP_W) - sx) + Math.abs(((c / MAP_W) | 0) - sy);
    const score = need / (1 + d / 15);
    if (score > bestScore) { bestScore = score; best = ex; }
  }
  if (best) {
    const path = findPath(sx, sy, (x, y) => G.exMap[idx(x, y)] === best.id, stepOnLand, 3000);
    if (path) {
      s.task = best.key;
      // walk a few tiles into the exhibit so the keeper is visibly inside
      const [ix, iy] = path.length ? path[path.length - 1] : [sx, sy];
      const target = pick(best.tiles);
      const inner = findPath(ix, iy, (x, y) => idx(x, y) === target,
        (x, y, nx, ny) => G.exMap[idx(nx, ny)] === best.id && stepOnLand(x, y, nx, ny), 800);
      s.path = inner ? path.concat(inner.slice(0, 4)) : path;
      s.state = 'go';
      return;
    }
  }
  s.task = null;
  wanderStaff(s, sx, sy);
}

function keeperWork(s) {
  const ex = exhibitByKey(s.task);
  s.task = null;
  if (!ex) return;
  const need = keeperNeeds(ex);
  for (const diet of need.diets) G.food.push({ x: s.x + rand(-0.3, 0.3), y: s.y + rand(-0.3, 0.3), diet, amount: 100 });
  const before = G.dung.length;
  G.dung = G.dung.filter(d => exhibitAt(d.x, d.y) !== ex);
  for (const a of ex.stats.animals) {
    a.keeperT = DAY_SECONDS * 3;
    if (a.sick) { a.sick = false; a.health = Math.min(100, a.health + 40); notify(`${a.name} the ${SPECIES[a.sp].name} was treated and is recovering.`, 'good'); }
  }
  s.done++;
  think(s, need.diets.length ? '🍖' : before > G.dung.length ? '🧹' : '✔️', null, 2);
  updateExhibitStats();
}

function maintDecide(s) {
  const sx = Math.floor(s.x), sy = Math.floor(s.y);
  if (G.litterCount[idx(sx, sy)]) { s.state = 'work'; s.timer = 1.5; return; }
  const path = findPath(sx, sy, (x, y) => G.litterCount[idx(x, y)] > 0, stepOnPath, 2500);
  if (path) { s.path = path; s.state = 'go'; return; }
  wanderStaff(s, sx, sy);
}

function sweep(s) {
  const i = idx(Math.floor(s.x), Math.floor(s.y));
  if (!G.litterCount[i]) return;
  G.litter = G.litter.filter(l => idx(Math.floor(l.x), Math.floor(l.y)) !== i);
  G.litterCount[i] = 0;
  s.done++;
  think(s, '🧹', null, 1.5);
}

function wanderStaff(s, sx, sy) {
  const opts = DIRS.map(([dx, dy]) => [sx + dx, sy + dy]).filter(([x, y]) => inMap(x, y) && G.tiles[idx(x, y)].path);
  if (opts.length) { s.path = [pick(opts)]; s.state = 'walk'; }
  else {
    // off the path network: head back to the nearest path
    const p = findPath(sx, sy, (x, y) => G.tiles[idx(x, y)].path, stepOnLand, 2000);
    if (p && p.length) { s.path = p; s.state = 'walk'; } else { s.state = 'idle'; s.timer = 2; }
  }
}

// ---------- rating & finances ----------
function updateRating() {
  const free = G.animals.filter(a => !a.escaped);
  const animalAvg = free.length ? free.reduce((s, a) => s + a.happy, 0) / free.length : 0;
  const guestAvg = G.guests.length ? G.guests.reduce((s, g) => s + g.happy, 0) / G.guests.length : 60;
  const variety = Math.min(1, new Set(free.map(a => a.sp)).size / 6);
  const pathTiles = G.tiles.reduce((n, t) => n + (t.path ? 1 : 0), 0);
  const clean = 1 - Math.min(1, G.litter.length / Math.max(8, pathTiles * 0.25));
  const escaped = G.animals.length - free.length;
  const target = clamp(animalAvg * 0.35 + guestAvg * 0.3 + variety * 20 + clean * 15 - escaped * 10, 0, 100);
  G.rating += (target - G.rating) * 0.08;
  G.ratingParts = { animalAvg, guestAvg, variety, clean };
}

function endMonth(m) {
  const salaries = G.staff.reduce((s, st) => s + STAFF_TYPES[st.role].salary, 0);
  G.money -= salaries;
  G.month.salaries += salaries;
  const mo = G.month;
  const income = mo.admissions + mo.sales + mo.donations;
  const expenses = mo.construction + mo.animals + mo.salaries;
  G.lastMonth = { ...mo, income, expenses, name: MONTHS[G.monthIndex % 12] };
  notify(`${G.lastMonth.name} report: income ${money(income)}, expenses ${money(expenses)}, ${mo.guests} guests.`, income >= expenses ? 'good' : 'warn');
  if (G.rating >= 85) { G.money += 5000; notify('🏆 Your zoo won the Best Zoo Award! +$5,000', 'good'); }
  else if (G.rating >= 70) { G.money += 2000; notify('🏅 Your zoo won the Top Attraction Award! +$2,000', 'good'); }
  if (G.money < 0) notify('Your zoo is in debt! Raise admission or cut costs.', 'bad');
  G.monthIndex = m;
  G.month = freshMonth();
  if (m % 3 === 0) saveGame();
}
