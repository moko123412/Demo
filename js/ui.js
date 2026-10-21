'use strict';
// HTML interface: top bar, build palette, info panel, messages, dialogs.

const CATEGORIES = [
  { id: 'select',   icon: '👆', label: 'Select' },
  { id: 'terrain',  icon: '⛰️', label: 'Terrain' },
  { id: 'path',     icon: '🛤️', label: 'Paths' },
  { id: 'fence',    icon: '🚧', label: 'Fences' },
  { id: 'animal',   icon: '🦁', label: 'Animals' },
  { id: 'plants',   icon: '🌳', label: 'Plants' },
  { id: 'exhibit',  icon: '🪨', label: 'Exhibit' },
  { id: 'guest',    icon: '🍔', label: 'Food' },
  { id: 'rides',    icon: '🎡', label: 'Rides' },
  { id: 'decor',    icon: '🌷', label: 'Decor' },
  { id: 'staff',    icon: '🧢', label: 'Staff' },
  { id: 'bulldoze', icon: '🚜', label: 'Bulldoze' },
];

const $ = sel => document.querySelector(sel);
const pct = v => Math.round(clamp(v, 0, 100)) + '%';

function speciesBlurb(key) {
  const sp = SPECIES[key];
  const terr = Object.keys(sp.terrain).sort((a, b) => sp.terrain[b] - sp.terrain[a]).map(t => TERRAIN[t].name).join(', ');
  const parts = [`Terrain: ${terr}.`];
  if (sp.foliage.length) parts.push(`Plants: ${sp.foliage.map(f => OBJECTS[f].name).join(', ')}.`);
  if (sp.rock) parts.push(`Likes ${OBJECTS[sp.rock].name}s.`);
  if (sp.shelter) parts.push(`Needs ${article(OBJECTS[sp.shelter].name)}.`);
  if (sp.water) parts.push('Needs water.');
  parts.push(`Groups of ${sp.group[0]}–${sp.group[1]}, ${sp.space} tiles each. Eats ${DIETS[sp.diet].name.toLowerCase()}.`);
  if (sp.compatible.length) parts.push(`Can share with ${sp.compatible.map(c => SPECIES[c].plural.toLowerCase()).join(' and ')}.`);
  return parts.join(' ');
}

function paletteItems(cat) {
  const objs = pred => Object.keys(OBJECTS).filter(k => pred(OBJECTS[k])).map(k => ({
    kind: 'object', key: k, name: OBJECTS[k].name, cost: OBJECTS[k].cost, desc: objectBlurb(k),
  }));
  switch (cat) {
    case 'terrain': return TERRAIN_ORDER.map(k => ({ kind: 'terrain', key: k, name: TERRAIN[k].name, cost: TERRAIN[k].cost, desc: 'Click and drag to paint. Each species has favourite terrain.' }));
    case 'path': return [{ kind: 'path', key: 'path', name: 'Paved Path', cost: PATH_COST, desc: 'Click and drag to lay path. Guests only walk on paths, so connect everything back to the entrance.' }];
    case 'fence': return Object.keys(FENCES).map(k => ({ kind: 'fence', key: +k, name: FENCES[k].name, cost: FENCES[k].cost,
      desc: FENCES[k].gate ? 'A door in the fence that keepers use to get in and out of the exhibit. Tap a tile, then the side where the gate should go. New fences come with a gate already.'
        : 'Paint the tiles you want inside the exhibit, then press Build fence and it goes up around them, with a gate facing the path. Use Single pieces to add or remove one side at a time. A closed fence with no path inside becomes an exhibit.' }));
    case 'animal': return Object.keys(SPECIES).filter(k => speciesAllowed(k)).map(k => ({ kind: 'animal', key: k, name: SPECIES[k].name, cost: SPECIES[k].cost, desc: speciesBlurb(k) }));
    case 'plants': return objs(o => o.cat === 'foliage');
    case 'exhibit': return objs(o => o.cat === 'rock' || o.cat === 'shelter' || o.cat === 'toy');
    case 'guest': return objs(o => o.cat === 'building');
    case 'rides': return objs(o => o.cat === 'ride');
    case 'decor': return objs(o => o.cat === 'scenery');
    case 'staff': return Object.keys(STAFF_TYPES).map(k => ({
      kind: 'staff', key: k, name: 'Hire ' + STAFF_TYPES[k].name, cost: STAFF_TYPES[k].hire,
      desc: k === 'keeper' ? `Feeds animals, cleans exhibits, treats sick animals and recaptures escapees. Salary ${money(STAFF_TYPES[k].salary)}/month.` : `Sweeps litter and repairs worn fences. Salary ${money(STAFF_TYPES[k].salary)}/month.`,
    }));
  }
  return [];
}

function objectBlurb(k) {
  const o = OBJECTS[k];
  const fans = Object.keys(SPECIES).filter(s => SPECIES[s].foliage.includes(k) || SPECIES[s].rock === k || SPECIES[s].shelter === k);
  const who = fans.length ? ` Loved by ${fans.map(s => SPECIES[s].plural.toLowerCase()).join(', ')}.` : '';
  const up = o.upkeep ? ` Upkeep ${money(o.upkeep)}/month.` : '';
  if (o.use) {
    const u = o.use, what = {
      hunger: 'Feeds hungry guests', thirst: 'Quenches thirsty guests', bladder: 'Guests need restrooms!',
      energy: 'Tired guests rest here', fun: 'Bored guests come here for fun', souvenir: 'Happy guests buy souvenirs on their way out',
      map: 'Sells park maps that help guests find exhibits and facilities',
    }[u.need];
    const cap = u.capacity ? ` Holds ${u.capacity} riders.` : '';
    const kids = o.kids ? ' Children only.' : '';
    return `${what}. ${u.price ? `Default price ${money(u.price)}.` : 'Free to use.'}${cap}${kids}${up} Place next to a path.`;
  }
  if (k === 'trash') return 'Guests throw their wrappers away here instead of littering. Place next to a path.';
  if (k === 'donation') return 'Guests donate much more at exhibits near a donation box. Place next to a path.';
  if (o.light) return 'Lights up the paths at night and looks lovely. Place next to a path.';
  if (o.cat === 'scenery') return 'Pretty decoration that cheers up guests walking past. Place next to a path.';
  if (o.cat === 'toy') return 'Animals with toys are a little happier and more playful.';
  if (o.cat === 'shelter') return 'A place for animals to rest.' + who;
  return (o.cat === 'rock' ? 'Climbing rocks for exhibits.' : 'Exhibit foliage. Drag to plant several.') + who;
}

const UI = {
  tool: { mode: 'select', key: null, brush: 2, fenceMode: 'area' },
  fenceArea: new Set(), pieceTile: null,
  cat: 'select', sel: null, hover: null, follow: null, tip: '', tipBad: false, dragStart: null, showGrid: false,
  messagesDirty: true, infoT: 0, topT: 0, lastInfo: '', previewCost: 0,

  init() {
    const bar = $('#toolbar');
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.cat = c.id;
      b.innerHTML = `<span class="ico">${c.icon}</span><span class="lbl">${c.label}</span>`;
      const keyFor = { select: 'Q', terrain: 'T', path: 'P', fence: 'F', animal: 'N', plants: 'L', exhibit: 'E', guest: 'B', rides: 'R', decor: 'V', staff: 'H', bulldoze: 'X' };
      b.title = `${c.label} (${keyFor[c.id]})`;
      b.addEventListener('click', () => this.setCategory(this.cat === c.id && c.id !== 'select' ? 'select' : c.id));
      bar.appendChild(b);
    }
    $('#palette .close').addEventListener('click', () => this.setCategory('select'));
    document.querySelectorAll('[data-fmode]').forEach(b => b.addEventListener('click', () => {
      this.tool.fenceMode = b.dataset.fmode;
      this.fenceArea.clear();
      this.pieceTile = null;
      document.querySelectorAll('[data-fmode]').forEach(x => x.classList.toggle('on', x === b));
    }));
    $('#info').addEventListener('click', e => this.onInfoClick(e));
    $('#messages').addEventListener('click', e => {
      const m = e.target.closest('[data-msg]');
      if (!m) return;
      const msg = G.messages[+m.dataset.msg];
      if (msg && msg.at) centerOn(msg.at.x, msg.at.y);
    });
    document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => this.setSpeed(+b.dataset.speed)));
    document.querySelectorAll('[data-adm]').forEach(b => b.addEventListener('click', () => {
      G.admission = clamp(G.admission + +b.dataset.adm, 0, 99);
      this.refreshTop(true);
    }));
    $('#btn-status').addEventListener('click', () => this.toggleStatus());
    $('#touch-hint .done').addEventListener('click', () => this.setCategory('select'));
    $('#touch-hint .undo').addEventListener('click', () => undo());
    $('#touch-hint .build').addEventListener('click', () => buildFenceArea());
    $('#touch-hint .clear').addEventListener('click', () => this.fenceArea.clear());
    $('#btn-more').addEventListener('click', () => $('#topbar').classList.toggle('open'));
    document.querySelectorAll('#topbar .menu button').forEach(b => b.addEventListener('click', () => $('#topbar').classList.remove('open')));
    const soundBtns = () => {
      $('#btn-sound').textContent = Sound.muted ? '🔇' : '🔊';
      $('#btn-music').classList.toggle('off', !Sound.musicOn || Sound.muted);
    };
    $('#btn-sound').addEventListener('click', () => { Sound.start(); Sound.toggleMute(); soundBtns(); });
    $('#btn-music').addEventListener('click', () => { Sound.start(); Sound.toggleMusic(); soundBtns(); });
    setTimeout(soundBtns);
    $('#btn-save').addEventListener('click', () => saveGame());
    $('#btn-load').addEventListener('click', () => { if (loadGame()) this.afterLoad(); });
    $('#btn-new').addEventListener('click', () => this.showWelcome(true));
    $('#btn-help').addEventListener('click', () => this.showWelcome(false));
    $('#status .close').addEventListener('click', () => this.toggleStatus(false));
    $('#btn-goals').addEventListener('click', () => ($('#goals').hidden ? this.showGoals(false) : this.closeGoals()));
    $('#goals .close').addEventListener('click', () => this.closeGoals());
    $('#goals .go').addEventListener('click', () => this.closeGoals());
    $('#scenarios .close').addEventListener('click', () => { $('#scenarios').hidden = true; if (!$('#welcome').hidden) return; this.setSpeed(1); });
    this.setCategory('select');
  },

  afterLoad() {
    this.select(null);
    centerOn(ENTRANCE.x, ENTRANCE.y - 12);
    this.refreshTop(true);
  },

  setSpeed(s) {
    G.speed = s;
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', +b.dataset.speed === s));
  },

  setCategory(cat) {
    this.cat = cat;
    this.fenceArea.clear();
    this.pieceTile = null;
    document.querySelectorAll('#toolbar .tool').forEach(b => b.classList.toggle('on', b.dataset.cat === cat));
    const pal = $('#palette');
    if (cat === 'select' || cat === 'bulldoze') {
      pal.hidden = true;
      this.tool = { ...this.tool, mode: cat, key: null };
      return;
    }
    const items = paletteItems(cat);
    pal.hidden = false;
    $('#palette h2').textContent = CATEGORIES.find(c => c.id === cat).label;
    const grid = $('#palette .items');
    grid.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'item';
      const cv = document.createElement('canvas');
      drawThumb(cv, it.kind, it.key);
      b.appendChild(cv);
      b.insertAdjacentHTML('beforeend', `<span class="nm">${it.name}</span><span class="pr">${money(it.cost)}</span>`);
      b.addEventListener('click', () => {
        if (it.kind === 'staff') { hireStaff(it.key); this.renderStaffList(); this.refreshTop(true); return; }
        grid.querySelectorAll('.item').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        this.tool = { ...this.tool, mode: it.kind, key: it.key };
        if (it.kind === 'fence' && FENCES[it.key].gate && this.tool.fenceMode !== 'pieces') document.querySelector('[data-fmode="pieces"]').click();
        $('#palette .desc').textContent = it.desc;
      });
      b.addEventListener('pointerenter', () => { $('#palette .desc').textContent = it.desc; });
      grid.appendChild(b);
    }
    $('#palette .brush').hidden = cat !== 'terrain';
    $('#palette .fmode').hidden = cat !== 'fence';
    $('#palette .desc').textContent = items[0] ? items[0].desc : '';
    if (cat === 'staff') {
      this.tool = { ...this.tool, mode: 'select', key: null };
      this.renderStaffList();
    } else {
      $('#palette .extra').innerHTML = '';
      grid.firstChild.click();
    }
  },

  // Instructions for the active tool on touch screens and narrow windows.
  updateTouchHint() {
    const el = $('#touch-hint'), mode = this.tool.mode;
    const show = mode !== 'select' && (mode === 'fence' || matchMedia('(pointer: coarse)').matches || window.innerWidth < 720);
    if (!show) { if (!el.hidden) el.hidden = true; return; }
    const name = mode === 'terrain' ? TERRAIN[this.tool.key].name : mode === 'path' ? 'Path' : mode === 'fence' ? FENCES[this.tool.key].name :
      mode === 'animal' ? SPECIES[this.tool.key].name : mode === 'bulldoze' ? 'Bulldozer' : OBJECTS[this.tool.key].name;
    const paint = mode === 'terrain' || mode === 'path' || mode === 'bulldoze' || (mode === 'object' && ['foliage', 'rock'].includes(OBJECTS[this.tool.key].cat));
    const area = mode === 'fence' && this.tool.fenceMode !== 'pieces', n = area ? this.fenceArea.size : 0;
    const how = mode === 'fence' ? (area ? (n ? `${n} tile${n === 1 ? '' : 's'} painted · tap to add or remove` : 'Tap or drag over tiles to paint the exhibit') :
      this.pieceTile ? 'Tap a round button to add or remove that side' : 'Tap a tile, then a side (mouse: click an edge)') :
      paint ? 'Tap tiles, or drag to paint' : 'Tap a tile, or drag to position then lift';
    const html = `<b>${name}</b><span>${how}${matchMedia('(pointer: coarse)').matches ? ' · 2 fingers move the map' : ''}</span>`;
    const build = el.querySelector('.build'), clear = el.querySelector('.clear');
    build.hidden = clear.hidden = !(area && n);
    if (area && n) {
      const cost = money(areaSegs().length * FENCES[this.tool.key].cost);
      if (build.textContent !== `✓ Build fence ${cost}`) build.textContent = `✓ Build fence ${cost}`;
    }
    const body = el.querySelector('.txt');
    if (body.innerHTML !== html) body.innerHTML = html;
    el.hidden = false;
  },

  renderStaffList() {
    const k = G.staff.filter(s => s.role === 'keeper').length, m = G.staff.length - k;
    $('#palette .extra').innerHTML = `<p>You employ <b>${k}</b> zookeeper${k === 1 ? '' : 's'} and <b>${m}</b> maintenance worker${m === 1 ? '' : 's'}.</p>` +
      (k === 0 && G.animals.length ? '<p class="warn">Your animals have nobody to feed them!</p>' : '');
  },

  select(sel) {
    this.sel = sel;
    this.lastInfo = '';
    $('#info').hidden = !sel;
    if (sel) this.refreshInfo();
  },

  update(dt) {
    this.topT -= dt;
    if (this.topT <= 0) { this.topT = 0.25; this.refreshTop(); }
    this.infoT -= dt;
    if (this.infoT <= 0 && this.sel) { this.infoT = 0.4; this.refreshInfo(); }
    if (this.messagesDirty || Math.random() < 0.05) this.renderMessages();
    this.updateTouchHint();
    document.body.classList.toggle('tool-active', this.tool.mode !== 'select');
    if (!$('#status').hidden && Math.random() < 0.05) this.renderStatus();
    if (!$('#goals').hidden && Math.random() < 0.05) this.renderGoals(false);
  },

  refreshTop(force) {
    const set = (id, txt) => { const el = $(id); if (el.textContent !== txt || force) el.textContent = txt; };
    set('#st-money', money(G.money));
    $('#st-money').classList.toggle('neg', G.money < 0);
    set('#st-guests', String(G.guests.length));
    set('#st-animals', String(G.animals.length));
    set('#st-date', dateString());
    set('#st-adm', money(G.admission));
    $('#st-rating').style.width = pct(G.rating);
    $('#st-rating').style.background = G.rating > 66 ? '#5cc15c' : G.rating > 33 ? '#e6c040' : '#e05a4a';
    $('#st-rating-wrap').title = `Zoo rating: ${Math.round(G.rating)}/100`;
    const scn = scenarioById(G.scenarioId);
    $('#btn-goals').hidden = !scn;
    if (scn) {
      const left = monthsLeft();
      set('#st-goals', `${G.goalsDone.filter(Boolean).length}/${scn.goals.length}` + (left !== null && G.scnState === 'playing' ? ` · ⏳ ${left} mo` : ''));
    }
  },

  renderMessages() {
    this.messagesDirty = false;
    const now = performance.now();
    const html = G.messages.slice(0, 5).map((m, i) => {
      const age = (now - m.t) / 1000;
      if (age > 16) return '';
      return `<div class="msg ${m.kind}${m.at ? ' link' : ''}" data-msg="${i}" style="opacity:${Math.min(1, (16 - age) / 3).toFixed(2)}">${m.text}</div>`;
    }).join('');
    const el = $('#messages');
    if (el.innerHTML !== html) el.innerHTML = html;
  },

  refreshInfo() {
    const s = this.sel;
    let html = '';
    if (s.kind === 'animal') html = this.animalInfo(G.animals.find(a => a.id === s.id));
    else if (s.kind === 'guest') html = this.guestInfo(G.guests.find(g => g.id === s.id));
    else if (s.kind === 'staff') html = this.staffInfo(G.staff.find(x => x.id === s.id));
    else if (s.kind === 'exhibit') html = this.exhibitInfo(exhibitByKey(s.key));
    else if (s.kind === 'object') html = this.objectInfo(G.objects.get(s.id));
    if (!html) { this.select(null); return; }
    html = '<button class="close" data-act="close" aria-label="Close">×</button>' + html;
    if (html !== this.lastInfo) { $('#info').innerHTML = html; this.lastInfo = html; }
  },

  bar(label, v, inverse) {
    const val = clamp(v, 0, 100), good = inverse ? 100 - val : val;
    const col = good > 66 ? '#5cc15c' : good > 33 ? '#e6c040' : '#e05a4a';
    return `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${val.toFixed(0)}%;background:${col}"></i></div></div>`;
  },

  animalInfo(a) {
    if (!a) return '';
    const sp = SPECIES[a.sp], ex = exhibitAt(a.x, a.y), ev = ex && ex.evals[a.sp];
    const doing = a.escaped ? '<b class="bad">Escaped!</b>' : a.sick ? 'Feeling sick' :
      { walk: 'Wandering', pace: 'Pacing restlessly', toFood: 'Heading to food', eat: 'Eating', play: 'Playing', rest: 'Resting', idle: 'Looking around' }[a.state];
    const days = Math.floor((G.time - a.born) / DAY_SECONDS);
    let h = `<h3>${a.name}</h3><div class="sub">${sp.name} · ${a.sex === 'M' ? '♂ male' : '♀ female'}${a.baby ? ' · baby' : ''}</div>`;
    h += `<div class="doing">${doing}</div>`;
    h += `<p class="breed">${breedingStatus(a)}</p>`;
    h += this.bar('Happiness', a.happy) + this.bar('Hunger', 100 - a.hunger, true) + this.bar('Health', a.health);
    if (ev) {
      h += `<div class="sect">Exhibit suitability <b>${pct(ev.total * 100)}</b></div>`;
      h += ev.issues.length ? '<ul class="issues">' + ev.issues.slice(0, 5).map(i => `<li>${i}</li>`).join('') + '</ul>' : `<p class="good">The ${sp.plural.toLowerCase()} love their exhibit!</p>`;
      h += `<button data-act="exhibit" data-key="${ex.key}">View exhibit</button> `;
      h += this.followBtn(a.id);
    } else h += '<p class="bad">This animal is outside an exhibit!</p>';
    h += `<p class="dim">In your zoo for ${days} day${days === 1 ? '' : 's'}.</p>`;
    h += `<button data-act="sell" data-id="${a.id}">Sell for ${money(sp.cost * 0.5)}</button>`;
    return h;
  },

  followBtn(id) { return `<button data-act="follow" data-id="${id}">${this.follow === id ? '🎥 Stop following' : '🎥 Follow'}</button> `; },

  guestInfo(g) {
    if (!g) return '';
    let h = `<h3>${g.name}</h3><div class="sub">${g.kid ? 'Child' : 'Adult'} guest · ${money(g.cash)} in pocket</div>`;
    h += this.bar('Happiness', g.happy) + this.bar('Hunger', 100 - g.hunger, true) + this.bar('Thirst', 100 - g.thirst, true) +
      this.bar('Energy', g.energy) + this.bar('Restroom', 100 - g.bladder, true) + this.bar('Fun', g.fun);
    const extras = [g.map && '🗺️ has a park map', g.souvenir && `🎁 bought a ${g.souvenir === 'plush' ? 'plush toy' : g.souvenir === 'hat' ? 'safari hat' : 'balloon'}`, g.state === 'ride' && '🎡 on a ride'].filter(Boolean);
    if (extras.length) h += `<p>${extras.join(' · ')}</p>`;
    if (g.fav) h += `<p>Favourite animal: <b>${SPECIES[g.fav].name}</b></p>`;
    h += `<p class="dim">Exhibits seen: ${g.seen.length}</p>`;
    h += this.followBtn(g.id);
    h += '<div class="sect">Thoughts</div><ul class="thoughts">' + (g.thoughts.map(t => `<li>“${t}”</li>`).join('') || '<li class="dim">…</li>') + '</ul>';
    return h;
  },

  staffInfo(s) {
    if (!s) return '';
    const T = STAFF_TYPES[s.role];
    const t = s.task || '';
    const ex = t.startsWith('ex:') ? exhibitByKey(+t.slice(3)) : null;
    const cap = t.startsWith('cap:') ? G.animals.find(a => a.id === +t.slice(4)) : null;
    const doing = ex ? `Heading to the ${exhibitName(ex)}` : cap ? `Chasing ${cap.name} the escaped ${SPECIES[cap.sp].name.toLowerCase()}!` :
      t.startsWith('fence') ? 'Repairing a worn fence' : t === 'litter' ? 'Sweeping up litter' : 'Patrolling the paths';
    let h = `<h3>${s.name}</h3><div class="sub">${T.name} · ${money(T.salary)}/month</div>`;
    h += `<div class="doing">${doing}</div><p>Jobs done: <b>${s.done}</b></p>`;
    h += `<button data-act="fire" data-id="${s.id}">Fire</button>`;
    return h;
  },

  exhibitInfo(ex) {
    if (!ex) return '';
    const st = ex.stats;
    let h = `<h3>${exhibitName(ex)}</h3><div class="sub">${st.tiles} tiles · ${st.animals.length} animal${st.animals.length === 1 ? '' : 's'}</div>`;
    const terr = Object.keys(st.terrain).sort((a, b) => st.terrain[b] - st.terrain[a])
      .map(t => `<span class="chip" style="--c:${TERRAIN[t].color}">${TERRAIN[t].name} ${Math.round(st.terrain[t] / st.tiles * 100)}%</span>`).join('');
    h += `<div class="chips">${terr}</div>`;
    if (!ex.hasGate) h += '<p class="bad">⚠️ No gate: keepers can\'t get in to feed the animals. Add an Exhibit Gate.</p>';
    const clean = Math.max(0, 100 - st.dung / st.tiles * 400);
    h += this.bar('Cleanliness', clean);
    for (const spk in ex.evals) {
      const sp = SPECIES[spk], ev = ex.evals[spk];
      h += `<div class="sect">${sp.plural} (${st.bySpecies[spk]}) · suitability <b>${pct(ev.total * 100)}</b></div>`;
      const p = ev.parts;
      h += '<div class="parts">' + [['Terrain', p.terrain], ['Plants', p.foliage], ['Rocks', p.rocks], ['Shelter', p.shelter], ['Water', p.water], ['Space', p.space], ['Group', p.social], ['Toys', p.toys]]
        .map(([n, v]) => `<span class="part ${v > 0.8 ? 'ok' : v > 0.4 ? 'mid' : 'low'}">${n}</span>`).join('') + '</div>';
      if (ev.issues.length) h += '<ul class="issues">' + ev.issues.slice(0, 4).map(i => `<li>${i}</li>`).join('') + '</ul>';
    }
    if (st.animals.length) {
      h += '<div class="sect">Animals</div><ul class="animals">' + st.animals.map(a =>
        `<li><a data-act="animal" data-id="${a.id}">${a.name}</a> <span class="dim">${SPECIES[a.sp].name}${a.baby ? ' (baby)' : ''}</span> <span class="mood">${a.happy > 66 ? '😊' : a.happy > 33 ? '😐' : '😠'}</span></li>`).join('') + '</ul>';
    } else h += '<p>Pick an animal from the <b>Animals</b> menu and click inside this exhibit to adopt it.</p>';
    return h;
  },

  objectInfo(o) {
    if (!o) return '';
    const def = OBJECTS[o.type];
    let h = `<h3>${def.name}</h3><div class="sub">${objectBlurb(o.type)}</div>`;
    if (def.use && (def.use.price || o.price)) {
      const p = priceOf(o), fair = def.use.price;
      const verdict = p > fair * 1.6 ? '<span class="bad">Guests think this is a rip-off</span>' : p > fair * 1.2 ? '<span class="warn">A bit pricey</span>' : p < fair ? '<span class="good">A bargain</span>' : '<span class="good">Fair price</span>';
      h += `<div class="price-row">Price <button data-act="price" data-id="${o.id}" data-d="-0.5">−</button><b>${money(p)}</b><button data-act="price" data-id="${o.id}" data-d="0.5">+</button> ${verdict}</div>`;
    }
    if (def.use) h += `<p>Used <b>${o.uses || 0}</b> times · earned <b>${money(o.sales || 0)}</b> in total, <b>${money(o.monthSales || 0)}</b> this month.</p>`;
    if (def.cat === 'ride') h += `<p>Riders now: <b>${o.riders || 0}</b> / ${def.use.capacity}</p>`;
    if (o.type === 'donation') h += `<p>Donations collected: <b>${money(o.sales || 0)}</b></p>`;
    if (def.upkeep) h += `<p class="dim">Upkeep ${money(def.upkeep)} per month.</p>`;
    h += `<button data-act="remove" data-id="${o.id}">Remove (refund ${money(def.cost * 0.5)})</button>`;
    return h;
  },

  onInfoClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = +b.dataset.id;
    switch (b.dataset.act) {
      case 'close': this.select(null); break;
      case 'exhibit': this.select({ kind: 'exhibit', key: +b.dataset.key }); break;
      case 'animal': {
        const a = G.animals.find(x => x.id === id);
        if (a) { this.select({ kind: 'animal', id }); centerOn(a.x, a.y); }
        break;
      }
      case 'sell': {
        const a = G.animals.find(x => x.id === id);
        if (!a) break;
        G.animals.splice(G.animals.indexOf(a), 1);
        G.money += SPECIES[a.sp].cost * 0.5;
        notify(`${a.name} the ${SPECIES[a.sp].name} went to a new home.`);
        updateExhibitStats();
        this.select(null);
        break;
      }
      case 'fire': {
        const s = G.staff.find(x => x.id === id);
        if (s) { G.staff.splice(G.staff.indexOf(s), 1); notify(`${s.name} was let go.`); }
        this.select(null);
        break;
      }
      case 'price': {
        const o = G.objects.get(id);
        if (o) { o.price = clamp(Math.round((priceOf(o) + +b.dataset.d) * 2) / 2, 0, 50); this.lastInfo = ''; this.refreshInfo(); }
        break;
      }
      case 'follow':
        this.follow = this.follow === id ? null : id;
        this.lastInfo = '';
        this.refreshInfo();
        break;
      case 'remove': {
        const o = G.objects.get(id);
        if (o) bulldoze(o.x, o.y);
        this.select(null);
        break;
      }
    }
  },

  toggleStatus(show) {
    const el = $('#status');
    el.hidden = show === undefined ? !el.hidden : !show;
    if (!el.hidden) this.renderStatus();
  },

  renderStatus() {
    const r = G.ratingParts || { animalAvg: 0, guestAvg: 0, variety: 0, clean: 1 };
    const fin = (m, title) => {
      if (!m) return `<div class="fin"><h4>${title}</h4><p class="dim">No report yet.</p></div>`;
      const inc = m.admissions + m.sales + m.donations, exp = m.construction + m.animals + m.salaries + (m.upkeep || 0);
      return `<div class="fin"><h4>${title}</h4><table>
        <tr><td>Admissions</td><td>${money(m.admissions)}</td></tr>
        <tr><td>Concessions</td><td>${money(m.sales)}</td></tr>
        <tr><td>Donations</td><td>${money(m.donations)}</td></tr>
        <tr><td>Construction</td><td>-${money(m.construction)}</td></tr>
        <tr><td>Animals</td><td>-${money(m.animals)}</td></tr>
        <tr><td>Salaries</td><td>-${money(m.salaries)}</td></tr>
        <tr><td>Upkeep</td><td>-${money(m.upkeep || 0)}</td></tr>
        <tr class="tot"><td>Profit</td><td class="${inc - exp >= 0 ? 'good' : 'bad'}">${money(inc - exp)}</td></tr>
        <tr><td>Guests</td><td>${m.guests}</td></tr></table></div>`;
    };
    const species = [...new Set(G.animals.map(a => a.sp))].map(s => SPECIES[s].name).join(', ') || 'none yet';
    $('#status .body').innerHTML = `
      <div class="rating-big">Zoo rating <b>${Math.round(G.rating)}</b>/100</div>
      ${this.bar('Animal happiness', r.animalAvg)}${this.bar('Guest happiness', r.guestAvg)}
      ${this.bar('Variety', r.variety * 100)}${this.bar('Cleanliness', r.clean * 100)}
      <p>Fair admission for your zoo right now: about <b>${money(fairPrice())}</b>. You charge <b>${money(G.admission)}</b>.</p>
      <p>Species on show: ${species}.</p>
      <p>Total visitors: <b>${G.totalGuests.toLocaleString()}</b></p>
      <div class="fins">${fin(G.month, 'This month')}${fin(G.lastMonth, 'Last month')}</div>`;
  },

  showWelcome(isNew) {
    const dlg = $('#welcome');
    dlg.hidden = false;
    $('#welcome .continue').hidden = !hasSave();
    $('#welcome .resume').hidden = isNew !== false;
    G.speed = 0;
    const done = () => { dlg.hidden = true; this.setSpeed(1); };
    $('#welcome .start').onclick = () => { newGame(); this.afterLoad(); done(); notify('Welcome to your new zoo! Start by fencing in an exhibit with the 🚧 Fences tool.', 'good'); };
    $('#welcome .scenarios').onclick = () => { dlg.hidden = true; this.showScenarios(); };
    $('#welcome .continue').onclick = () => { if (loadGame()) this.afterLoad(); done(); };
    $('#welcome .resume').onclick = done;
  },

  showScenarios() {
    G.speed = 0;
    const done = completedScenarios();
    const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
    $('#scenarios .list').innerHTML = SCENARIOS.map((s, i) => {
      const open = scenarioUnlocked(i), won = done.includes(s.id);
      return `<button class="scn${open ? '' : ' locked'}" data-scn="${s.id}" ${open ? '' : 'disabled'}>
        <div class="top"><b>${open ? '' : '🔒 '}${s.name}</b>${won ? '<span class="won">🏆 Completed</span>' : ''}<span class="stars" title="Difficulty">${stars(s.difficulty)}</span></div>
        <p>${open ? s.blurb : `Complete <b>${SCENARIOS[i - 1].name}</b> to unlock.`}</p>
        ${open ? `<ul>${s.goals.map(g => `<li>${g.label}</li>`).join('')}</ul>
        <div class="meta">💰 ${money(s.money)} · ${s.months ? `⏳ ${s.months} months` : 'No time limit'}${s.animals ? ` · ${s.animals.length} species available` : ''}</div>` : ''}
      </button>`;
    }).join('');
    $('#scenarios .list').querySelectorAll('.scn:not(.locked)').forEach(b => b.addEventListener('click', () => {
      startScenario(b.dataset.scn);
      this.afterLoad();
      $('#scenarios').hidden = true;
      $('#welcome').hidden = true;
      this.showGoals(true);
    }));
    $('#scenarios').hidden = false;
  },

  showGoals(briefing) {
    this.briefing = briefing;
    if (briefing) this.setSpeed(0);
    this.renderGoals(briefing);
    $('#goals .go').hidden = !briefing;
    $('#goals').hidden = false;
  },

  closeGoals() {
    $('#goals').hidden = true;
    if (this.briefing) { this.briefing = false; this.setSpeed(1); }
  },

  renderGoals(briefing) {
    const scn = scenarioById(G.scenarioId);
    if (!scn) { $('#goals').hidden = true; return; }
    $('#goals h2').textContent = scn.name;
    const left = monthsLeft();
    const state = G.scnState === 'won' ? '<p class="good"><b>🏆 Scenario complete!</b></p>' :
      G.scnState === 'failed' ? '<p class="bad"><b>Time ran out on this scenario.</b></p>' :
      left !== null ? `<p>⏳ <b>${left}</b> month${left === 1 ? '' : 's'} left</p>` : '<p class="dim">No time limit.</p>';
    const html = (briefing ? `<p class="blurb">${scn.blurb}</p>` : '') + state +
      '<ul class="goal-list">' + scn.goals.map((g, i) => {
        const ok = G.goalsDone[i];
        return `<li class="${ok ? 'ok' : ''}"><span class="tick">${ok ? '✅' : '⬜'}</span><span>${g.label}</span><span class="prog">${ok ? 'Done' : progressText(g)}</span></li>`;
      }).join('') + '</ul>' +
      (scn.animals ? `<p class="dim">Available animals: ${scn.animals.map(a => SPECIES[a].name).join(', ')}.</p>` : '') +
      '<p class="dim">Goals tick off as soon as you reach them. Finish them all to win.</p>';
    const body = $('#goals .body');
    if (body.innerHTML !== html) body.innerHTML = html;
  },

  showResult(won) {
    const scn = scenarioById(G.scenarioId);
    this.setSpeed(0);
    $('#result .body').innerHTML = won
      ? `<h1>🏆 Congratulations!</h1><p>You completed <b>${scn.name}</b>!</p>` +
        (SCENARIOS.indexOf(scn) === SCENARIOS.length - 1 ? '<p>You have beaten every scenario. You are a true zoo tycoon!</p>'
          : SCENARIOS.indexOf(scn) >= 1 ? `<p>A new scenario has been unlocked: <b>${SCENARIOS[SCENARIOS.indexOf(scn) + 1].name}</b>.</p>` : '')
      : `<h1>⏳ Out of time</h1><p>You didn't finish all the goals for <b>${scn.name}</b> in time.</p><p>You can try again, or keep building this zoo just for fun.</p>`;
    $('#result .retry').hidden = won;
    $('#result').hidden = false;
    $('#result .keep').onclick = () => { $('#result').hidden = true; this.setSpeed(1); };
    $('#result .retry').onclick = () => { $('#result').hidden = true; startScenario(scn.id); this.afterLoad(); this.showGoals(true); };
    $('#result .next').onclick = () => { $('#result').hidden = true; this.showScenarios(); };
  },
};
