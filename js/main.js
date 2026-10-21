'use strict';
// Boot, input handling and the main loop.

const keys = new Set();
const pointers = new Map();
let pan = null, pinch = null, painting = false, lastPaint = null, strokeStart = true;

function tileFromScreen(sx, sy) {
  const t = screenToTile(sx, sy);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
}

function clampCamera() {
  cam.zoom = clamp(cam.zoom, 0.35, 2.5);
  cam.x = clamp(cam.x, -MAP_H * TW / 2, MAP_W * TW / 2);
  cam.y = clamp(cam.y, 0, (MAP_W + MAP_H) * TH / 2);
}

function zoomAt(sx, sy, factor) {
  const before = screenToWorld(sx, sy);
  cam.zoom = clamp(cam.zoom * factor, 0.35, 2.5);
  const after = screenToWorld(sx, sy);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  clampCamera();
}

// Paint every tile between the last painted tile and this one so fast drags
// still leave a connected path.
function paintTo(t) {
  const from = lastPaint || t;
  let { x, y } = from;
  const cells = [[x, y]];
  while (x !== t.x || y !== t.y) {
    if (x !== t.x) x += Math.sign(t.x - x); else y += Math.sign(t.y - y);
    cells.push([x, y]);
  }
  if (lastPaint) cells.shift();
  lastPaint = t;
  for (const [cx, cy] of cells) applyAt(cx, cy);
}

function applyAt(x, y) {
  if (!inMap(x, y)) return;
  const tool = UI.tool;
  switch (tool.mode) {
    case 'terrain': for (const [bx, by] of brushTiles(x, y)) setTerrain(bx, by, tool.key); break;
    case 'path': placePath(x, y); break;
    case 'bulldoze': bulldoze(x, y); break;
    case 'object': {
      const err = placeObject(x, y, tool.key);
      if (err && strokeStart) notify(err, 'warn');
      break;
    }
    case 'animal': {
      const err = placeAnimal(x, y, tool.key);
      if (err) notify(err, 'warn');
      else notify(`You adopted ${article(SPECIES[tool.key].name)}!`, 'good');
      break;
    }
  }
  strokeStart = false;
}

function clickSelect(sx, sy) {
  let best = null, bestD = 22;
  for (const list of [G.animals, G.staff, G.guests]) {
    for (const e of list) {
      const p = tileToScreen(e.x, e.y);
      const size = e.kind === 'animal' ? SPECIES[e.sp].size * (e.baby ? 0.6 : 1) : 0.8;
      const d = Math.hypot(p.x - sx, p.y - 12 * size * cam.zoom - sy) * (e.kind === 'guest' ? 1.15 : 1);
      if (d < bestD) { bestD = d; best = e; }
    }
  }
  if (best) { UI.select({ kind: best.kind, id: best.id }); return; }
  const t = tileFromScreen(sx, sy);
  const o = objAt(t.x, t.y);
  if (o) { UI.select({ kind: 'object', id: o.id }); return; }
  const ex = inMap(t.x, t.y) ? exhibitAt(t.x, t.y) : null;
  UI.select(ex ? { kind: 'exhibit', key: ex.key } : null);
}

function setupInput() {
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      pan = null; painting = false; UI.dragStart = null;
      return;
    }
    const mode = UI.tool.mode;
    if (e.button === 1 || e.button === 2 || mode === 'select') {
      pan = { sx: e.offsetX, sy: e.offsetY, cx: cam.x, cy: cam.y, moved: false, button: e.button };
      return;
    }
    const t = tileFromScreen(e.offsetX, e.offsetY);
    UI.hover = t;
    beginUndo();
    if (mode === 'fence') { UI.dragStart = t; return; }
    strokeStart = true;
    lastPaint = null;
    if (mode === 'animal') { applyAt(t.x, t.y); endUndo(); return; }
    if (mode === 'object' && !['foliage', 'rock'].includes(OBJECTS[UI.tool.key].cat)) { applyAt(t.x, t.y); endUndo(); return; }
    painting = true;
    paintTo(t);
  });
  canvas.addEventListener('pointermove', e => {
    mouse = { x: e.offsetX, y: e.offsetY, inside: true, type: e.pointerType };
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.x -= (mx - pinch.mx) / cam.zoom;
      cam.y -= (my - pinch.my) / cam.zoom;
      zoomAt(mx, my, d / Math.max(1, pinch.d));
      pinch = { d, mx, my };
      return;
    }
    const t = tileFromScreen(e.offsetX, e.offsetY);
    UI.hover = t;
    if (pan) {
      const dx = e.offsetX - pan.sx, dy = e.offsetY - pan.sy;
      if (Math.abs(dx) + Math.abs(dy) > 5) pan.moved = true;
      if (pan.moved) { cam.x = pan.cx - dx / cam.zoom; cam.y = pan.cy - dy / cam.zoom; clampCamera(); UI.follow = null; }
      return;
    }
    if (painting && (!lastPaint || lastPaint.x !== t.x || lastPaint.y !== t.y)) paintTo(t);
  });
  const end = e => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; pan = null; return; }
    if (pan) {
      if (!pan.moved && pan.button === 0) clickSelect(e.offsetX, e.offsetY);
      // a right-click without dragging cancels the current tool
      if (!pan.moved && pan.button === 2 && UI.tool.mode !== 'select') UI.setCategory('select');
      pan = null;
    }
    if (UI.dragStart && UI.hover) {
      const a = UI.dragStart, b = UI.hover;
      if (inMap(a.x, a.y) && inMap(b.x, b.y)) placeFenceRect(a.x, a.y, b.x, b.y, UI.tool.key);
      UI.dragStart = null;
    }
    if (G.pendingUndo) endUndo();
    painting = false;
    lastPaint = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!pointers.size) UI.hover = null; mouse.inside = false; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    keys.add(e.key.toLowerCase());
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const toolKeys = { q: 'select', t: 'terrain', p: 'path', f: 'fence', n: 'animal', l: 'plants', e: 'exhibit', b: 'guest', r: 'rides', v: 'decor', h: 'staff', x: 'bulldoze' };
    const tk = toolKeys[e.key.toLowerCase()];
    if (tk) { UI.setCategory(UI.cat === tk && tk !== 'select' ? 'select' : tk); return; }
    switch (e.key) {
      case 'Home': centerOn(ENTRANCE.x, ENTRANCE.y - 12); break;
      case 'm': case 'M': $('#minimap').classList.toggle('off'); break;
      case 'Delete': UI.setCategory('bulldoze'); break;
      case 'Escape': UI.setCategory('select'); UI.select(null); UI.toggleStatus(false); break;
      case ' ': UI.setSpeed(G.speed ? 0 : 1); e.preventDefault(); break;
      case '1': UI.setSpeed(1); break;
      case '2': UI.setSpeed(2); break;
      case '3': UI.setSpeed(4); break;
      case 'g': case 'G': UI.showGrid = !UI.showGrid; break;
      case '+': case '=': zoomAt(viewW / 2, viewH / 2, 1.2); break;
      case '-': zoomAt(viewW / 2, viewH / 2, 1 / 1.2); break;
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('resize', resizeCanvas);
  document.querySelectorAll('[data-brush]').forEach(b => b.addEventListener('click', () => {
    UI.tool.brush = +b.dataset.brush;
    document.querySelectorAll('[data-brush]').forEach(x => x.classList.toggle('on', x === b));
  }));
}

let minimapTick = () => {};
let mouse = { x: 0, y: 0, inside: false, type: 'mouse' };
let lastFrame = performance.now(), acc = 0;

function setupMinimap() {
  const mc = $('#minimap');
  let info = null, dragging = false;
  const jump = e => {
    if (!info) return;
    const r = mc.getBoundingClientRect();
    const wx = (e.clientX - r.left) / info.k - TERR_OFF_X, wy = (e.clientY - r.top - info.oy) / info.k;
    cam.x = wx; cam.y = wy;
    UI.follow = null;
    clampCamera();
  };
  mc.addEventListener('pointerdown', e => { dragging = true; mc.setPointerCapture(e.pointerId); jump(e); });
  mc.addEventListener('pointermove', e => { if (dragging) jump(e); });
  mc.addEventListener('pointerup', () => { dragging = false; });
  let t = 0;
  return dt => {
    t -= dt;
    if (t > 0 || mc.classList.contains('off') || !mc.offsetParent) return;
    t = 0.25;
    info = renderMinimap(mc);
  };
}

function updateCursorTip() {
  const tip = $('#cursor-tip');
  const text = mouse.inside && !pan && UI.tool.mode !== 'select' ? UI.tip : '';
  if (!text || mouse.type === 'touch') { tip.hidden = true; return; }
  tip.hidden = false;
  if (tip.textContent !== text) tip.textContent = text;
  tip.classList.toggle('bad', !!UI.tipBad);
  tip.style.left = Math.min(viewW - tip.offsetWidth - 4, mouse.x + 16) + 'px';
  tip.style.top = (mouse.y + 18) + 'px';
}
const STEP = 1 / 20;
function frame(now) {
  const rdt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const pv = 700 / cam.zoom * rdt;
  if (keys.has('arrowleft') || keys.has('a')) cam.x -= pv;
  if (keys.has('arrowright') || keys.has('d')) cam.x += pv;
  if (keys.has('arrowup') || keys.has('w')) cam.y -= pv;
  if (keys.has('arrowdown') || keys.has('s')) cam.y += pv;
  // scroll when the mouse rests at the edge of the screen
  if (mouse.inside && mouse.type === 'mouse' && !pan && !pointers.size) {
    const m = 14, ev = 600 / cam.zoom * rdt;
    if (mouse.x < m) cam.x -= ev; else if (mouse.x > viewW - m) cam.x += ev;
    if (mouse.y < m) cam.y -= ev; else if (mouse.y > viewH - m) cam.y += ev;
  }
  if (UI.follow) {
    const f = G.animals.find(a => a.id === UI.follow) || G.guests.find(g => g.id === UI.follow);
    if (f) { cam.x += (isoX(f.x, f.y) - cam.x) * Math.min(1, rdt * 4); cam.y += (isoY(f.x, f.y) - 20 - cam.y) * Math.min(1, rdt * 4); }
    else UI.follow = null;
  }
  clampCamera();
  if (G.speed > 0) {
    acc += rdt * G.speed;
    let n = 0;
    while (acc >= STEP && n < 12) { step(STEP); acc -= STEP; n++; }
    if (n === 12) acc = 0;
  }
  render(now);
  UI.update(rdt);
  minimapTick(rdt);
  updateCursorTip();
  Sound.update(rdt);
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('view');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  newGame();
  UI.init();
  setupInput();
  minimapTick = setupMinimap();
  $('#btn-undo').addEventListener('click', () => undo());
  $('#btn-zoomin').addEventListener('click', () => zoomAt(viewW / 2, viewH / 2, 1.25));
  $('#btn-zoomout').addEventListener('click', () => zoomAt(viewW / 2, viewH / 2, 0.8));
  $('#btn-home').addEventListener('click', () => { UI.follow = null; centerOn(ENTRANCE.x, ENTRANCE.y - 12); });
  $('#btn-map').addEventListener('click', () => $('#minimap').classList.toggle('off'));
  Sound.init();
  document.addEventListener('click', e => { if (e.target.closest('button')) Sound.play('click'); });
  centerOn(ENTRANCE.x, ENTRANCE.y - 12);
  UI.showWelcome(true);
  requestAnimationFrame(frame);
});
