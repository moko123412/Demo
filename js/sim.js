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
    wearFences();
    checkScenario();
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
    else if (a.pregnant && Math.random() < 0.5) think(a, '💕');
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
    case 'toShelter':
      if (moveAlong(a, speed, dt)) { a.state = 'shelter'; a.timer = darkness() > 0.5 ? rand(18, 30) : rand(8, 16); think(a, '💤', null, 3); }
      break;
    case 'toWater':
      if (moveAlong(a, speed, dt)) { a.state = 'drink'; a.timer = rand(3, 5); }
      break;
    case 'toToy':
      if (moveAlong(a, speed, dt)) {
        a.state = 'play';
        a.timer = rand(3, 5);
        a.anim = 0;
        const toy = objAt(Math.floor(a.x), Math.floor(a.y)) || nearObject(a.x, a.y, 'ball', 1) || nearObject(a.x, a.y, 'log', 1);
        if (toy && toy.type === 'ball') { toy.kvx = (toy.kvx || 0) + a.face * rand(30, 60); toy.kvy = (toy.kvy || 0) + rand(-20, 20); }
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
    case 'play': case 'rest': case 'idle': case 'shelter': case 'drink':
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
  const r = Math.random(), st = ex && ex.stats;
  const goTo = (isGoal, state) => {
    const path = findPath(Math.floor(a.x), Math.floor(a.y), isGoal, animalStepper(a, ex), 900);
    if (!path) return false;
    a.path = path; a.state = state; a.timer = 0;
    if (!path.length) moveAlong(a, 1, 0);
    return true;
  };
  // play with a toy if there is one
  if (a.happy > 60 && r < 0.3 && st && st.toyTiles.length && Math.random() < 0.6) {
    const tiles = new Set(st.toyTiles);
    if (goTo((x, y) => tiles.has(idx(x, y)), 'toToy')) return;
  }
  // a drink from the pond
  if (st && st.terrain.water && !sp.swims && r > 0.85) {
    const wet = (x, y) => DIRS.some(([dx, dy]) => { const t = tileAt(x + dx, y + dy); return t && t.t === 'water'; });
    if (goTo((x, y) => G.tiles[idx(x, y)].t !== 'water' && wet(x, y), 'toWater')) return;
  }
  if (a.happy > 70 && r < 0.3) {
    a.state = 'play';
    a.timer = rand(2.5, 4);
    a.anim = 0;
    if (Math.random() < 0.4) { floatText(a.x, a.y, sp.sound, '#fff'); Sound.animal(a); }
    return;
  }
  if (a.happy < 35 && r < 0.5) {
    a.path = wanderTarget(a, ex, 6) || [];
    a.state = a.path.length ? 'pace' : 'idle';
    a.timer = 1;
    return;
  }
  if ((darkness() > 0.5 && r < 0.75) || r < 0.25) {
    // tired animals head into their shelter if they have one
    if (st && st.shelterTiles.length && Math.random() < (darkness() > 0.5 ? 0.8 : 0.45)) {
      const tiles = new Set(st.shelterTiles);
      if (goTo((x, y) => tiles.has(idx(x, y)), 'toShelter')) return;
    }
    a.state = 'rest';
    a.timer = darkness() > 0.5 ? rand(8, 16) : rand(5, 10);
    return;
  }
  const mom = a.baby && a.mom && G.animals.find(m => m.id === a.mom);
  if (mom && exhibitAt(mom.x, mom.y) === ex) {
    const mx = Math.floor(mom.x), my = Math.floor(mom.y);
    a.path = findPath(Math.floor(a.x), Math.floor(a.y), (x, y) => Math.abs(x - mx) + Math.abs(y - my) <= 1, animalStepper(a, ex), 600) || [];
  } else a.path = wanderTarget(a, ex, 4) || [];
  a.state = a.path.length ? 'walk' : 'idle';
  a.timer = rand(1, 3);
}

const PREGNANCY_DAYS = 6;
function breedAnimals() {
  // due mothers give birth
  for (const mom of G.animals) {
    if (!mom.pregnant || G.time - mom.pregnant < DAY_SECONDS * PREGNANCY_DAYS) continue;
    mom.pregnant = 0;
    const sp = SPECIES[mom.sp], n = mom.sp === 'penguin' || mom.sp === 'flamingo' || mom.sp === 'lion' || mom.sp === 'cheetah' ? randi(1, 2) : 1;
    for (let k = 0; k < n; k++) {
      const baby = createAnimal(mom.sp, mom.x + rand(-0.2, 0.2), mom.y + rand(-0.2, 0.2), true);
      baby.hunger = 100;
      baby.mom = mom.id;
      G.animals.push(baby);
      G.births[mom.sp] = (G.births[mom.sp] || 0) + 1;
      notify(`A baby ${sp.name} was born to ${mom.name}! Say hello to ${baby.name}.`, 'good', { x: mom.x, y: mom.y });
    }
    floatText(mom.x, mom.y, n > 1 ? '🍼 Twins!' : '🍼 New baby!', '#ffd6e7');
    Sound.play('baby');
  }
  // happy pairs may conceive
  for (const ex of G.exhibits) {
    for (const spKey in ex.stats.bySpecies) {
      const sp = SPECIES[spKey];
      const group = ex.stats.animals.filter(a => a.sp === spKey);
      if (group.length + group.filter(a => a.pregnant).length >= sp.group[1]) continue;
      const adults = group.filter(a => !a.baby && a.happy > 72 && a.health > 60);
      const mom = adults.find(a => a.sex === 'F' && !a.pregnant && G.time - (a.lastBirth || -1e9) > DAY_SECONDS * 20);
      const dad = adults.find(a => a.sex === 'M');
      if (!mom || !dad || Math.random() > 1 / (DAY_SECONDS * 22)) continue;
      mom.pregnant = G.time;
      mom.lastBirth = G.time;
      notify(`${mom.name} the ${sp.name} is expecting a baby!`, 'good', { x: mom.x, y: mom.y });
      floatText(mom.x, mom.y, '💕', '#ffd6e7');
    }
  }
}

// Why an adult animal is or isn't able to have babies, for the info panel.
function breedingStatus(a) {
  if (a.baby) return 'Growing up';
  if (a.pregnant) {
    const left = Math.max(0, Math.ceil(PREGNANCY_DAYS - (G.time - a.pregnant) / DAY_SECONDS));
    return `🤰 Expecting a baby in ${left} day${left === 1 ? '' : 's'}!`;
  }
  const ex = exhibitAt(a.x, a.y);
  if (!ex) return 'Must be in an exhibit to breed';
  const mates = ex.stats.animals.filter(o => o.sp === a.sp && !o.baby && o.sex !== a.sex);
  if (!mates.length) return `Needs a ${a.sex === 'F' ? 'male' : 'female'} mate to have babies`;
  if (a.happy <= 72) return 'Will have babies once happiness is above 72';
  if (ex.stats.animals.filter(o => o.sp === a.sp).length >= SPECIES[a.sp].group[1]) return 'The group is full, so no more babies';
  return '💕 Ready to start a family';
}

// ---------- time of day ----------
const DAY_CYCLE = DAY_SECONDS * 8;   // one full day/night cycle
function dayPhase() { return (G.time % DAY_CYCLE) / DAY_CYCLE; }
// 0 in daylight, 1 in the middle of the night
function darkness() {
  const p = dayPhase(), d = Math.min(Math.abs(p - 0.85), 1 - Math.abs(p - 0.85));
  return clamp((0.17 - d) / 0.08, 0, 1);
}
// warm sunrise / sunset glow
function duskGlow() {
  const p = dayPhase(), bell = (c, w) => Math.max(0, 1 - Math.min(Math.abs(p - c), 1 - Math.abs(p - c)) / w);
  return Math.max(bell(0.68, 0.06), bell(0.02, 0.05));
}

// ---------- guests ----------
function fairPrice() {
  const species = new Set(G.animals.filter(a => !a.escaped).map(a => a.sp)).size;
  let rides = 0;
  for (const o of G.objects.values()) if (OBJECTS[o.type].cat === 'ride') rides++;
  return Math.min(70, 5 + species * 3 + G.animals.length * 0.25 + G.rating / 10 + Math.min(rides, 4) * 2);
}

function spawnGuests() {
  if (G.guests.length >= 400) return;
  const ratio = G.admission / fairPrice();
  const priceFactor = ratio <= 1 ? 1 : Math.max(0, 2 - ratio);
  const animalFactor = G.animals.length ? 1 : 0.25;
  const night = 1 - 0.85 * darkness();
  const chance = (0.1 + 0.9 * Math.pow(G.rating / 100, 1.3)) * priceFactor * animalFactor * night;
  if (Math.random() < chance) spawnGuest(ratio);
  if (Math.random() < chance * 0.5) spawnGuest(ratio);
}

const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a26a42'];
const HAIRS = ['#2b1d12', '#5a3a1a', '#a5682a', '#e6c46a', '#1b1b1b', '#7b2d12'];
function spawnGuest(priceRatio) {
  const kid = Math.random() < 0.3, elder = !kid && Math.random() < 0.15;
  const g = {
    id: G.nextId++, kind: 'guest', name: pick(GUEST_NAMES) + ' ' + pick(GUEST_LAST),
    x: ENTRANCE.x + 0.5, y: ENTRANCE.y + 0.5, path: [], prev: -1,
    hunger: rand(55, 100), thirst: rand(55, 100), energy: rand(75, 100), bladder: rand(60, 100), fun: rand(50, 85),
    happy: rand(55, 75), cash: randi(25, 120), thoughts: [], seen: [], state: 'walk', timer: 0,
    kid, elder, shirt: hslHex(randi(0, 359), randi(45, 75), randi(40, 60)), pants: pick(['#2f3e5c', '#4a4a4a', '#6b5440', '#20304a', '#6a7a8a']),
    skin: pick(SKINS), hair: elder ? pick(['#d8d8d8', '#bbbbbb', '#eeeeee']) : pick(HAIRS),
    hat: !kid && Math.random() < 0.15 ? 'sun' : null,
    balloon: kid && Math.random() < 0.25 ? hslHex(randi(0, 359), 80, 60) : null,
    carry: null, carryT: 0, timeIn: 0, maxTime: rand(DAY_SECONDS * 8, DAY_SECONDS * 18), fav: null, favScore: 0,
    face: 1, anim: Math.random() * 10, thought: null, thoughtT: 0, needCooldown: 0, goal: null,
    map: false, souvenir: null,
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
  if (g.onRide) { const o = G.objects.get(g.onRide); if (o) o.riders = Math.max(0, (o.riders || 0) - 1); }
  G.guests.splice(G.guests.indexOf(g), 1);
  if (UI.sel && UI.sel.id === g.id) UI.select(null);
}

function guestSpeed(g) {
  if (g.state === 'leave') return 1.5;
  return g.elder ? 0.95 : g.kid ? 1.4 : 1.25;
}

function updateGuest(g, dt) {
  g.timeIn += dt;
  g.thoughtT -= dt;
  if (g.flashT > 0) g.flashT -= dt;
  g.needCooldown -= dt;
  g.hunger -= dt * 0.3; g.thirst -= dt * 0.4; g.bladder -= dt * 0.28;
  g.energy -= dt * (g.elder ? 0.3 : 0.2);
  if (g.state !== 'ride') g.fun -= dt * (g.kid ? 0.32 : 0.2);
  for (const k of ['hunger', 'thirst', 'energy', 'bladder', 'fun']) g[k] = clamp(g[k], 0, 100);
  if (g.hunger < 20 || g.thirst < 20 || g.bladder < 15) g.happy -= dt * 0.5;
  if (g.fun < 15) g.happy -= dt * 0.25;
  g.happy = clamp(g.happy, 0, 100);
  if (g.carry) {
    g.carryT -= dt;
    if (g.carryT <= 0) finishCarry(g);
  }

  switch (g.state) {
    case 'walk': case 'goto': case 'leave':
      if (moveAlong(g, guestSpeed(g), dt)) guestArrive(g);
      break;
    case 'view': case 'use': case 'sit': case 'ride':
      g.timer -= dt;
      if (g.state === 'sit') g.energy = Math.min(100, g.energy + dt * 6);
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
  if (darkness() > 0.6 && Math.random() < 0.03) {
    startLeaving(g);
    think(g, '🌙', "It's getting dark. Time to head home.");
    return;
  }
  if (g.needCooldown <= 0 && seekNeed(g, tx, ty)) return;
  if (tryImpulse(g, tx, ty)) return;

  // guests with a map head for exhibits they haven't seen yet
  if (g.map && Math.random() < 0.5) {
    const path = findPath(tx, ty, (x, y) => G.tiles[idx(x, y)].path && !!unseenExhibitNear(g, x, y), stepOnPath, 2500);
    if (path && path.length) { g.path = path.slice(0, 12); g.state = 'walk'; g.prev = idx(tx, ty); return; }
  }

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

function priceOf(o) { const u = OBJECTS[o.type].use; return o.price != null ? o.price : u ? u.price : 0; }

// Would this guest use this facility right now?
function guestWants(g, o, need) {
  const def = OBJECTS[o.type];
  if (!def.use || def.use.need !== need) return false;
  if (def.kids && !g.kid) return false;
  return priceOf(o) <= g.cash;
}

const NEEDS = [
  { stat: 'bladder', below: 35, icon: '🚻', miss: 'I really need a restroom!' },
  { stat: 'thirst',  below: 40, icon: '🥤', miss: "I'm thirsty, but there's nowhere to get a drink." },
  { stat: 'hunger',  below: 40, icon: '🍔', miss: "I'm hungry! Where can I get some food?" },
  { stat: 'energy',  below: 35, icon: '🪑', miss: 'My feet hurt. I wish there were benches.' },
  { stat: 'fun',     below: 30, icon: '🎡', miss: "I'm bored. There's nothing fun to do here." },
];

function seekNeed(g, tx, ty) {
  const need = NEEDS.filter(n => g[n.stat] < n.below).sort((a, b) => g[a.stat] - g[b.stat])[0];
  if (!need) return false;
  let goal = null;
  const path = findPath(tx, ty, (x, y) => {
    if (!G.tiles[idx(x, y)].path) return false;
    for (const [dx, dy] of DIRS) {
      const o = objAt(x + dx, y + dy);
      if (o && guestWants(g, o, need.stat)) { goal = o; return true; }
    }
    return false;
  }, stepOnPath, g.map ? 4500 : 1500);
  if (path && goal) {
    g.path = path;
    g.goal = goal.id;
    g.state = 'goto';
    think(g, need.icon);
    if (!path.length) useBuilding(g);
    return true;
  }
  g.needCooldown = 8;
  if (need.stat !== 'fun' || g.fun < 15) g.happy -= 3;
  think(g, need.icon, need.miss);
  return false;
}

// Spur-of-the-moment visits: gift shops, info kiosks, rides they walk past.
function tryImpulse(g, tx, ty) {
  for (const [dx, dy] of DIRS) {
    const o = objAt(tx + dx, ty + dy);
    if (!o) continue;
    const def = OBJECTS[o.type];
    if (!def.use) continue;
    const n = def.use.need;
    const want = (n === 'souvenir' && !g.souvenir && g.happy > 55 && g.timeIn > g.maxTime * 0.4 && Math.random() < 0.5) ||
      (n === 'map' && !g.map && Math.random() < 0.6) ||
      (n === 'fun' && g.fun < 70 && Math.random() < 0.35);
    if (want && guestWants(g, o, n)) { g.goal = o.id; useBuilding(g); return true; }
  }
  return false;
}

function useBuilding(g) {
  const o = G.objects.get(g.goal);
  g.goal = null;
  if (!o || !OBJECTS[o.type].use) { g.state = 'walk'; return; }
  const def = OBJECTS[o.type], u = def.use, price = priceOf(o);
  if (def.cat === 'ride' && (o.riders || 0) >= u.capacity) {
    think(g, '⏳', `The line for the ${def.name} is too long.`);
    g.state = 'walk';
    return;
  }
  if (price > g.cash) { think(g, '💸', "I can't afford that."); g.state = 'walk'; g.needCooldown = 6; return; }
  // guests compare the price to what they think it's worth
  const urgent = u.need !== 'fun' && u.need !== 'souvenir' && u.need !== 'map' && g[u.need] < 15;
  if (u.price > 0 && price > u.price * 1.6 && !(urgent && price < u.price * 2.5)) {
    think(g, '😤', `${money(price)} at the ${def.name}? That's way too expensive!`);
    g.happy -= 2;
    g.state = 'walk';
    g.needCooldown = 10;
    return;
  }
  if (u.price === 0 && price > 0 && price > 2) {
    think(g, '😤', `Paying ${money(price)} for the ${def.name.toLowerCase()}? No thanks.`);
    g.state = 'walk';
    g.needCooldown = 10;
    return;
  }
  if (price > 0) {
    g.cash -= price;
    G.money += price;
    G.month.sales += price;
    o.sales = (o.sales || 0) + price;
    o.monthSales = (o.monthSales || 0) + price;
    floatText(o.x + 0.5, o.y + 0.5, '+' + money(price), '#9be564');
    Sound.coinAt(o.x + 0.5, o.y + 0.5);
    if (u.price && price > u.price * 1.2) g.happy -= 2;
  }
  o.uses = (o.uses || 0) + 1;
  g.useType = o.type;
  g.useObj = o.id;
  g.state = def.cat === 'ride' ? 'ride' : u.sit ? 'sit' : 'use';
  g.timer = u.time;
  if (def.cat === 'ride') { o.riders = (o.riders || 0) + 1; g.onRide = o.id; }
  const dx = o.x - Math.floor(g.x), dy = o.y - Math.floor(g.y);
  g.face = dx - dy >= 0 ? 1 : -1;
}

function finishActivity(g) {
  const o = G.objects.get(g.useObj), def = g.useType && OBJECTS[g.useType];
  if (g.onRide) {
    if (o) o.riders = Math.max(0, (o.riders || 0) - 1);
    g.onRide = null;
  }
  if (def && def.use) {
    const u = def.use;
    for (const k in u.restore) g[k] = clamp(g[k] + u.restore[k], 0, 100);
    if (u.carry) { g.carry = u.carry; g.carryT = 6; }
    if (u.need === 'souvenir') {
      g.souvenir = pick(g.kid ? ['balloon', 'plush', 'plush'] : ['plush', 'hat', 'balloon']);
      if (g.souvenir === 'balloon') g.balloon = hslHex(randi(0, 359), 80, 60);
      if (g.souvenir === 'hat') g.hat = 'safari';
    }
    if (u.need === 'map') g.map = true;
    think(g, def.cat === 'ride' ? '🤩' : u.need === 'hunger' ? '😋' : '😌', u.thought);
  }
  g.useType = null;
  g.useObj = null;
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

function nearObject(x, y, type, r) {
  const tx = Math.floor(x), ty = Math.floor(y);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const o = objAt(tx + dx, ty + dy);
    if (o && o.type === type) return o;
  }
  return null;
}

function viewExhibit(g, ex) {
  if (!ex) return;
  const animals = ex.stats.animals;
  if (!animals.length) { g.happy -= 1; think(g, '😕', 'Why is this exhibit empty?'); return; }
  let value = 0, avg = 0, player = null, baby = null, bestSp = null, bestV = 0, sleeping = 0;
  for (const a of animals) {
    const sp = SPECIES[a.sp], v = sp.appeal * (0.25 + 0.75 * a.happy / 100) * (a.baby ? 1.5 : 1);
    value += v;
    avg += a.happy;
    if (a.state === 'play') player = a;
    if (a.state === 'rest' || a.state === 'shelter') sleeping++;
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
  } else if (sleeping === animals.length) {
    gain *= 0.6;
    think(g, '😴', `The ${sp.plural.toLowerCase()} are all asleep.`);
  } else if (gain > 8) {
    think(g, '😍', `I love the ${sp.plural.toLowerCase()}!`);
  } else {
    think(g, '🙂', `The ${sp.plural.toLowerCase()} are nice.`);
  }
  g.happy = clamp(g.happy + gain, 0, 100);
  g.fun = clamp(g.fun + Math.max(0, gain) * 1.1, 0, 100);
  if (gain > 8 && Math.random() < 0.3) { g.flashT = 0.3; think(g, '📸', `I got a great photo of the ${sp.plural.toLowerCase()}!`); }
  if (bestV > g.favScore) { g.favScore = bestV; g.fav = bestSp; }
  const box = nearObject(g.x, g.y, 'donation', 4);
  if (g.happy > 65 && Math.random() < (box ? 0.6 : 0.3) && g.cash > 2) {
    const amt = Math.min(g.cash, randi(1, 2 + Math.floor(value / (box ? 5 : 8))));
    g.cash -= amt;
    G.money += amt;
    G.month.donations += amt;
    if (box) box.sales = (box.sales || 0) + amt;
    floatText(g.x, g.y, `+${money(amt)} donation`, '#9be564');
    Sound.coinAt(g.x, g.y);
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
// s.task is a string so tasks can be reserved: 'ex:<key>', 'cap:<animal id>', 'fence:h<i>'
function updateStaff(s, dt) {
  s.thoughtT -= dt;
  if (s.state === 'go' || s.state === 'walk') {
    if (moveAlong(s, 1.6, dt)) {
      if (s.state === 'go') { s.state = 'work'; s.timer = s.task && s.task.startsWith('fence') ? 2.5 : 3; }
      else { s.state = 'idle'; s.timer = 0.3; }
    }
    return;
  }
  s.timer -= dt;
  if (s.state === 'work') s.anim += dt * 4;
  if (s.timer > 0) return;
  if (s.state === 'work') { s.role === 'keeper' ? keeperWork(s) : maintWork(s); }
  s.role === 'keeper' ? keeperDecide(s) : maintDecide(s);
}

function takenTasks(s) { return new Set(G.staff.filter(o => o !== s && o.task).map(o => o.task)); }

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
  const sx = Math.floor(s.x), sy = Math.floor(s.y), taken = takenTasks(s);
  // escaped animals come first
  for (const a of G.animals) {
    if (!a.escaped || taken.has('cap:' + a.id)) continue;
    const ax = Math.floor(a.x), ay = Math.floor(a.y);
    const path = findPath(sx, sy, (x, y) => Math.abs(x - ax) + Math.abs(y - ay) <= 1, stepStaff, 4000);
    if (path) {
      s.task = 'cap:' + a.id;
      s.path = path;
      s.state = 'go';
      think(s, '🎯', null, 2);
      return;
    }
  }
  let best = null, bestScore = 0.9;
  for (const ex of G.exhibits) {
    if (!ex.stats.animals.length || taken.has('ex:' + ex.key)) continue;
    const need = keeperNeeds(ex).score;
    const c = ex.tiles[0], d = Math.abs((c % MAP_W) - sx) + Math.abs(((c / MAP_W) | 0) - sy);
    const score = need / (1 + d / 15);
    if (score > bestScore) { bestScore = score; best = ex; }
  }
  if (best && !best.hasGate) {
    G.gateWarned = G.gateWarned || {};
    if (!G.gateWarned[best.key]) {
      G.gateWarned[best.key] = true;
      const c = best.tiles[0];
      notify(`The ${exhibitName(best)} has no gate, so keepers can't get in! Add one with the Exhibit Gate fence.`, 'bad', { x: (c % MAP_W) + 0.5, y: ((c / MAP_W) | 0) + 0.5 });
    }
  }
  if (best) {
    const path = findPath(sx, sy, (x, y) => G.exMap[idx(x, y)] === best.id, stepStaff, 3000);
    if (path) {
      s.task = 'ex:' + best.key;
      // walk a few tiles into the exhibit so the keeper is visibly inside
      const [ix, iy] = path.length ? path[path.length - 1] : [sx, sy];
      const target = pick(best.tiles);
      const inner = findPath(ix, iy, (x, y) => idx(x, y) === target,
        (x, y, nx, ny) => G.exMap[idx(nx, ny)] === best.id && stepStaff(x, y, nx, ny), 800);
      s.path = inner ? path.concat(inner.slice(0, 4)) : path;
      s.state = 'go';
      return;
    }
  }
  s.task = null;
  wanderStaff(s, sx, sy);
}

// Where a recaptured animal goes: an exhibit with its own kind, else any exhibit.
function homeFor(a) {
  const own = G.exhibits.filter(e => e.stats.bySpecies[a.sp]);
  const options = own.length ? own : G.exhibits.filter(e => !e.stats.animals.length);
  const ex = options[0] || G.exhibits[0];
  if (!ex) return null;
  const tiles = ex.tiles.filter(i => G.tiles[i].t !== 'water' || SPECIES[a.sp].swims);
  return tiles.length ? pick(tiles) : null;
}

function keeperWork(s) {
  const task = s.task;
  s.task = null;
  if (!task) return;
  if (task.startsWith('cap:')) {
    const a = G.animals.find(x => x.id === +task.slice(4));
    if (!a || !a.escaped) return;
    if (Math.hypot(a.x - s.x, a.y - s.y) > 2) return;
    const home = homeFor(a);
    if (home == null) { think(s, '❓', null, 2); notify(`Build an exhibit so ${a.name} can be returned!`, 'warn'); return; }
    a.x = (home % MAP_W) + 0.5;
    a.y = ((home / MAP_W) | 0) + 0.5;
    a.path = [];
    a.state = 'idle';
    a.timer = 2;
    a.escaped = false;
    s.done++;
    think(s, '✔️', null, 2);
    notify(`${s.name} caught ${a.name} the ${SPECIES[a.sp].name} and returned it to an exhibit.`, 'good', { x: a.x, y: a.y });
    updateExhibitStats();
    return;
  }
  const ex = exhibitByKey(+task.slice(3));
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

// Tiles on either side of a fence segment.
function fenceSides(k, i) {
  if (k === 'h') { const x = i % MAP_W, y = (i / MAP_W) | 0; return [[x, y], [x, y - 1]]; }
  const x = i % (MAP_W + 1), y = (i / (MAP_W + 1)) | 0;
  return [[x, y], [x - 1, y]];
}

function maintDecide(s) {
  const sx = Math.floor(s.x), sy = Math.floor(s.y);
  if (G.litterCount[idx(sx, sy)]) { s.task = 'litter'; s.state = 'work'; s.timer = 1.5; return; }
  const path = findPath(sx, sy, (x, y) => G.litterCount[idx(x, y)] > 0, stepOnPath, 1200);
  if (path) { s.task = 'litter'; s.path = path; s.state = 'go'; return; }
  // repair the most worn fence nearby
  const taken = takenTasks(s);
  let best = null, bestScore = Infinity;
  for (const [k, F, C] of [['h', G.hF, G.hC], ['v', G.vF, G.vC]]) {
    for (let i = 0; i < F.length; i++) {
      if (!F[i] || C[i] > 60 || taken.has('fence:' + k + i)) continue;
      const [[x, y]] = fenceSides(k, i);
      const score = C[i] + (Math.abs(x - sx) + Math.abs(y - sy)) * 1.5;
      if (score < bestScore) { bestScore = score; best = [k, i]; }
    }
  }
  if (best) {
    const sides = fenceSides(best[0], best[1]).filter(([x, y]) => inMap(x, y) && G.tiles[idx(x, y)].t !== 'water');
    const p = findPath(sx, sy, (x, y) => sides.some(([a, b]) => a === x && b === y), stepStaff, 4000);
    if (p) { s.task = 'fence:' + best[0] + best[1]; s.path = p; s.state = 'go'; return; }
  }
  s.task = null;
  wanderStaff(s, sx, sy);
}

function maintWork(s) {
  const task = s.task;
  s.task = null;
  if (task === 'litter') {
    const i = idx(Math.floor(s.x), Math.floor(s.y));
    if (!G.litterCount[i]) return;
    G.litter = G.litter.filter(l => idx(Math.floor(l.x), Math.floor(l.y)) !== i);
    G.litterCount[i] = 0;
    s.done++;
    think(s, '🧹', null, 1.5);
  } else if (task && task.startsWith('fence:')) {
    const k = task[6], i = +task.slice(7), F = k === 'h' ? G.hF : G.vF, C = k === 'h' ? G.hC : G.vC;
    if (!F[i]) return;
    C[i] = 100;
    s.done++;
    think(s, '🔧', null, 2);
    Sound.play('fence');
  }
}

function wanderStaff(s, sx, sy) {
  const opts = DIRS.map(([dx, dy]) => [sx + dx, sy + dy]).filter(([x, y]) => inMap(x, y) && G.tiles[idx(x, y)].path);
  if (opts.length) { s.path = [pick(opts)]; s.state = 'walk'; }
  else {
    // off the path network: head back to the nearest path
    const p = findPath(sx, sy, (x, y) => G.tiles[idx(x, y)].path, stepStaff, 2000) || findPath(sx, sy, (x, y) => G.tiles[idx(x, y)].path, stepOnLand, 2000);
    if (p && p.length) { s.path = p; s.state = 'walk'; } else { s.state = 'idle'; s.timer = 2; }
  }
}

// ---------- fence wear ----------
const STRONG = ['lion', 'tiger', 'elephant', 'rhino', 'hippo', 'grizzly', 'polarbear', 'gorilla'];
const FENCE_WEAR = { 1: 0.07, 2: 0.05, 3: 0.02, 4: 0.04 };
function wearFences() {
  let broke = null;
  for (const [k, F, C] of [['h', G.hF, G.hC], ['v', G.vF, G.vC]]) {
    for (let i = 0; i < F.length; i++) {
      if (!F[i]) continue;
      C[i] -= FENCE_WEAR[F[i]] * rand(0.5, 1.5);
      if (C[i] <= 0) { F[i] = 0; C[i] = 0; broke = fenceSides(k, i)[0]; }
    }
  }
  // unhappy, powerful animals bash the fences around them
  for (const a of G.animals) {
    if (a.escaped || a.happy > 40 || a.baby || !STRONG.includes(a.sp) || Math.random() > 0.3) continue;
    const x = Math.floor(a.x), y = Math.floor(a.y);
    const edges = [['h', hIdx(x, y)], ['h', hIdx(x, y + 1)], ['v', vIdx(x, y)], ['v', vIdx(x + 1, y)]];
    for (const [k, i] of edges) {
      const F = k === 'h' ? G.hF : G.vF, C = k === 'h' ? G.hC : G.vC;
      if (!F[i]) continue;
      C[i] -= 4 / F[i];
      if (Math.random() < 0.1) floatText(a.x, a.y, 'BANG!', '#ffb0a0');
      if (C[i] <= 0) { F[i] = 0; C[i] = 0; broke = [x, y]; }
    }
  }
  if (broke) {
    computeExhibits();
    notify('A fence has collapsed! Maintenance workers repair worn fences.', 'bad', { x: broke[0] + 0.5, y: broke[1] + 0.5 });
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
  let upkeep = 0;
  for (const o of G.objects.values()) { upkeep += OBJECTS[o.type].upkeep || 0; o.monthSales = 0; }
  G.money -= salaries + upkeep;
  G.month.salaries += salaries;
  G.month.upkeep = (G.month.upkeep || 0) + upkeep;
  const mo = G.month;
  const income = mo.admissions + mo.sales + mo.donations;
  const expenses = mo.construction + mo.animals + mo.salaries + mo.upkeep;
  G.lastMonth = { ...mo, income, expenses, name: MONTHS[G.monthIndex % 12] };
  notify(`${G.lastMonth.name} report: income ${money(income)}, expenses ${money(expenses)}, ${mo.guests} guests.`, income >= expenses ? 'good' : 'warn');
  Sound.play('chime');
  if (G.rating >= 85) { G.money += 5000; notify('🏆 Your zoo won the Best Zoo Award! +$5,000', 'good'); }
  else if (G.rating >= 70) { G.money += 2000; notify('🏅 Your zoo won the Top Attraction Award! +$2,000', 'good'); }
  if (G.money < 0) notify('Your zoo is in debt! Raise admission or cut costs.', 'bad');
  G.monthIndex = m;
  G.month = freshMonth();
  if (m % 3 === 0) saveGame();
}
