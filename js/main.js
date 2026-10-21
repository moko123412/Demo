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
    if (mode === 'fence') { UI.dragStart = t; return; }
    strokeStart = true;
    lastPaint = null;
    if (mode === 'animal') { applyAt(t.x, t.y); return; }
    if (mode === 'object' && !['foliage', 'rock'].includes(OBJECTS[UI.tool.key].cat)) { applyAt(t.x, t.y); return; }
    painting = true;
    paintTo(t);
  });
  canvas.addEventListener('pointermove', e => {
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
      if (pan.moved) { cam.x = pan.cx - dx / cam.zoom; cam.y = pan.cy - dy / cam.zoom; clampCamera(); }
      return;
    }
    if (painting && (!lastPaint || lastPaint.x !== t.x || lastPaint.y !== t.y)) paintTo(t);
  });
  const end = e => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; pan = null; return; }
    if (pan) {
      if (!pan.moved && pan.button === 0) clickSelect(e.offsetX, e.offsetY);
      pan = null;
    }
    if (UI.dragStart && UI.hover) {
      const a = UI.dragStart, b = UI.hover;
      if (inMap(a.x, a.y) && inMap(b.x, b.y)) placeFenceRect(a.x, a.y, b.x, b.y, UI.tool.key);
      UI.dragStart = null;
    }
    painting = false;
    lastPaint = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { if (!pointers.size) UI.hover = null; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    keys.add(e.key.toLowerCase());
    switch (e.key) {
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

let lastFrame = performance.now(), acc = 0;
const STEP = 1 / 20;
function frame(now) {
  const rdt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const pv = 700 / cam.zoom * rdt;
  if (keys.has('arrowleft') || keys.has('a')) cam.x -= pv;
  if (keys.has('arrowright') || keys.has('d')) cam.x += pv;
  if (keys.has('arrowup') || keys.has('w')) cam.y -= pv;
  if (keys.has('arrowdown') || keys.has('s')) cam.y += pv;
  clampCamera();
  if (G.speed > 0) {
    acc += rdt * G.speed;
    let n = 0;
    while (acc >= STEP && n < 12) { step(STEP); acc -= STEP; n++; }
    if (n === 12) acc = 0;
  }
  render(now);
  UI.update(rdt);
  requestAnimationFrame(frame);
}

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('view');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  newGame();
  UI.init();
  setupInput();
  centerOn(ENTRANCE.x, ENTRANCE.y - 12);
  UI.showWelcome(true);
  requestAnimationFrame(frame);
});
