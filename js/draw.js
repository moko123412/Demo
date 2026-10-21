'use strict';
// Rendering: isometric camera, baked terrain layer, procedural sprites.

let canvas, ctx, dpr = 1, viewW = 0, viewH = 0;
const cam = { x: 0, y: 0, zoom: 1 };
let terrainCanvas = null;
const TERR_OFF_X = MAP_H * TW / 2;

function isoX(x, y) { return (x - y) * TW / 2; }
function isoY(x, y) { return (x + y) * TH / 2; }
function screenToWorld(sx, sy) { return { x: (sx - viewW / 2) / cam.zoom + cam.x, y: (sy - viewH / 2) / cam.zoom + cam.y }; }
function worldToTile(wx, wy) { const a = wx / (TW / 2), b = wy / (TH / 2); return { x: (a + b) / 2, y: (b - a) / 2 }; }
function screenToTile(sx, sy) { const w = screenToWorld(sx, sy); return worldToTile(w.x, w.y); }
function tileToScreen(x, y) {
  return { x: (isoX(x, y) - cam.x) * cam.zoom + viewW / 2, y: (isoY(x, y) - cam.y) * cam.zoom + viewH / 2 };
}
function centerOn(x, y) { cam.x = isoX(x, y); cam.y = isoY(x, y); }

function resizeCanvas() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  viewW = canvas.clientWidth;
  viewH = canvas.clientHeight;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
}

// ---------- primitives ----------
// ---------- colour & shading ----------
// While SHADE is on, ellipses with a hex colour are drawn with a radial gradient
// lit from the upper left, which gives sprites a rounded, pre-rendered look.
let SHADE = false;
const rgbCache = new Map();
function hexRgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    const n = parseInt(h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}
function tint(hex, t) {
  const [r, g, b] = hexRgb(hex), k = t >= 0 ? 255 : 0, a = Math.abs(t);
  return '#' + [r, g, b].map(v => Math.round(v + (k - v) * a).toString(16).padStart(2, '0')).join('');
}
const gradCache = new WeakMap();
function shadeGrad(c, hex) {
  let m = gradCache.get(c);
  if (!m) { m = new Map(); gradCache.set(c, m); }
  let g = m.get(hex);
  if (!g) {
    g = c.createRadialGradient(-0.4, -0.5, 0.05, -0.15, -0.2, 1.3);
    g.addColorStop(0, tint(hex, 0.32));
    g.addColorStop(0.45, hex);
    g.addColorStop(1, tint(hex, -0.38));
    m.set(hex, g);
  }
  return g;
}
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const f = n => {
    const k = (n + h / 30) % 12, v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

function ell(c, x, y, rx, ry, fill, rot = 0) {
  if (SHADE && typeof fill === 'string' && fill.charCodeAt(0) === 35 && rx > 0.8) {
    c.save();
    c.translate(x, y);
    if (rot) c.rotate(rot);
    c.scale(Math.abs(rx), Math.abs(ry) || 0.01);
    c.beginPath();
    c.arc(0, 0, 1, 0, Math.PI * 2);
    c.fillStyle = shadeGrad(c, fill);
    c.fill();
    c.restore();
    return;
  }
  c.beginPath();
  c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}
function circ(c, x, y, r, fill) { ell(c, x, y, r, r, fill); }
const shadowCache = new WeakMap();
function shadow(c, x, y, rx, ry = rx / 2.4) {
  let g = shadowCache.get(c);
  if (!g) {
    g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(0,0,0,0.34)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    shadowCache.set(c, g);
  }
  c.save();
  c.translate(x, y);
  c.scale(Math.max(0.1, rx * 1.15), Math.max(0.1, ry * 1.15));
  c.beginPath();
  c.arc(0, 0, 1, 0, Math.PI * 2);
  c.fillStyle = g;
  c.fill();
  c.restore();
}
function poly(c, pts, fill, stroke, lw = 1) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function line(c, x1, y1, x2, y2, color, w = 1) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.stroke();
}
function curve(c, x1, y1, cx, cy, x2, y2, color, w = 1) {
  c.beginPath();
  c.moveTo(x1, y1);
  c.quadraticCurveTo(cx, cy, x2, y2);
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.stroke();
}
function diamond(c, px, py, hw = TW / 2, hh = TH / 2) {
  c.beginPath();
  c.moveTo(px, py - hh); c.lineTo(px + hw, py); c.lineTo(px, py + hh); c.lineTo(px - hw, py);
  c.closePath();
}
function isoBox(c, px, py, hw, h, top, left, right, hh = hw / 2) {
  poly(c, [[px - hw, py], [px, py + hh], [px, py + hh - h], [px - hw, py - h]], left);
  poly(c, [[px, py + hh], [px + hw, py], [px + hw, py - h], [px, py + hh - h]], right);
  poly(c, [[px, py - hh - h], [px + hw, py - h], [px, py + hh - h], [px - hw, py - h]], top);
}
// Leafy crown made of many shaded clumps, drawn back to front.
function canopy(c, cx, cy, rx, ry, n, base, seed, flat = 1) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = hash2(k, seed) * Math.PI * 2, r = Math.sqrt(hash2(k, seed + 1));
    pts.push([cx + Math.cos(a) * r * rx * 0.8, cy + Math.sin(a) * r * ry * 0.8, (0.34 + hash2(k, seed + 2) * 0.26) * Math.min(rx, ry * 1.7)]);
  }
  pts.sort((p, q) => p[1] - q[1]);
  ell(c, cx, cy + ry * 0.15, rx, ry, tint(base, -0.25));
  for (const [x, y, r] of pts) ell(c, x, y, r, r * flat, y < cy - ry * 0.3 ? tint(base, 0.08) : base);
}
function trunk(c, x0, y0, x1, y1, w, color) {
  const g = c.createLinearGradient(x0 - w, 0, x0 + w, 0);
  g.addColorStop(0, tint(color, 0.25));
  g.addColorStop(0.6, color);
  g.addColorStop(1, tint(color, -0.35));
  c.beginPath();
  c.moveTo(x0 - w, y0);
  c.quadraticCurveTo((x0 + x1) / 2 - w * 0.8, (y0 + y1) / 2, x1 - w * 0.6, y1);
  c.lineTo(x1 + w * 0.6, y1);
  c.quadraticCurveTo((x0 + x1) / 2 + w * 0.8, (y0 + y1) / 2, x0 + w, y0);
  c.closePath();
  c.fillStyle = g;
  c.fill();
}
// Polygon lit from the upper left.
function polyLit(c, pts, hex, stroke) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, tint(hex, 0.3));
  g.addColorStop(0.5, hex);
  g.addColorStop(1, tint(hex, -0.4));
  poly(c, pts, g, stroke);
}

function pyramidRoof(c, px, py, hw, h, rh, left, right, hh = hw / 2) {
  const apex = [px, py - h - rh];
  poly(c, [[px - hw, py - h], [px, py + hh - h], apex], left);
  poly(c, [[px, py + hh - h], [px + hw, py - h], apex], right);
}

// tile corners in world space, edge per DIRS index: N, E, S, W neighbour
function tileCorners(x, y, ox = 0) {
  return [[isoX(x, y) + ox, isoY(x, y)], [isoX(x + 1, y) + ox, isoY(x + 1, y)],
    [isoX(x + 1, y + 1) + ox, isoY(x + 1, y + 1)], [isoX(x, y + 1) + ox, isoY(x, y + 1)]];
}
function edgeOf(corners, d) { return [corners[d], corners[(d + 1) % 4]]; }

// ---------- terrain layer (baked) ----------
function seeded(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seamless 128px textures for each terrain, generated once.
const TEX = 128;
let texCanvases = null;
function buildTextures() {
  texCanvases = {};
  for (const key of [...TERRAIN_ORDER, 'path']) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = TEX;
    const t = cv.getContext('2d'), R = seeded(key.length * 7919 + key.charCodeAt(0) * 31);
    const base = key === 'path' ? '#8c7a60' : TERRAIN[key].color;
    t.fillStyle = base;
    t.fillRect(0, 0, TEX, TEX);
    // draw fn at (x, y) and at its wrapped copies so the texture tiles seamlessly
    const at = (x, y, fn) => {
      for (const ox of [0, -TEX, TEX]) for (const oy of [0, -TEX, TEX]) {
        if ((ox && Math.abs(x + ox - TEX / 2) > TEX / 2 + 12) || (oy && Math.abs(y + oy - TEX / 2) > TEX / 2 + 12)) continue;
        fn(x + ox, y + oy);
      }
    };
    const blade = (x, y, len, col, lean) => {
      t.strokeStyle = col; t.lineWidth = 1;
      t.beginPath(); t.moveTo(x, y); t.lineTo(x + lean, y - len); t.stroke();
    };
    // soft colour blotches
    for (let i = 0; i < 40; i++) {
      const x = R() * TEX, y = R() * TEX, r = 6 + R() * 16;
      at(x, y, (px, py) => {
        t.fillStyle = R() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
        t.beginPath(); t.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2); t.fill();
      });
    }
    switch (key) {
      case 'grass':
        for (let i = 0; i < 1300; i++) {
          const x = R() * TEX, y = R() * TEX, len = 2 + R() * 3, col = ['#5c973c', '#7bb555', '#4c8634', '#8ec668', '#6aa848'][(R() * 5) | 0], lean = R() * 2 - 1;
          at(x, y, (px, py) => blade(px, py, len, col, lean));
        }
        for (let i = 0; i < 14; i++) at(R() * TEX, R() * TEX, (px, py) => { t.fillStyle = ['#f4f4f0', '#f2d24a', '#c9a0e8'][i % 3]; t.fillRect(px, py, 1.5, 1.5); });
        break;
      case 'savannah':
        for (let i = 0; i < 1000; i++) {
          const x = R() * TEX, y = R() * TEX, len = 3 + R() * 5, col = ['#d6c06a', '#b39a48', '#c9b25c', '#9a9a4a', '#e0cd84'][(R() * 5) | 0], lean = R() * 3 - 1.5;
          at(x, y, (px, py) => blade(px, py, len, col, lean));
        }
        break;
      case 'dirt':
        for (let i = 0; i < 2500; i++) at(R() * TEX, R() * TEX, (px, py) => { t.fillStyle = R() < 0.5 ? '#9b7b54' : '#755638'; t.fillRect(px, py, 1, 1); });
        for (let i = 0; i < 160; i++) {
          const x = R() * TEX, y = R() * TEX, r = 0.6 + R() * 1.4, col = ['#a8896a', '#6b5038', '#b8a080'][(R() * 3) | 0];
          at(x, y, (px, py) => { t.fillStyle = col; t.beginPath(); t.ellipse(px, py, r, r * 0.7, 0, 0, Math.PI * 2); t.fill(); });
        }
        break;
      case 'sand':
        for (let i = 0; i < 3500; i++) at(R() * TEX, R() * TEX, (px, py) => { t.fillStyle = R() < 0.5 ? '#efdeac' : '#c9b277'; t.fillRect(px, py, 1, 1); });
        for (let i = 0; i < 18; i++) {
          const x = R() * TEX, y = R() * TEX, w = 10 + R() * 14;
          at(x, y, (px, py) => { t.strokeStyle = 'rgba(160,130,70,0.25)'; t.lineWidth = 1; t.beginPath(); t.moveTo(px, py); t.quadraticCurveTo(px + w / 2, py - 2, px + w, py); t.stroke(); });
        }
        break;
      case 'rainforest':
        for (let i = 0; i < 420; i++) {
          const x = R() * TEX, y = R() * TEX, r = 1.2 + R() * 2, rot = R() * 3, col = ['#2f5524', '#4d7a33', '#5d5a26', '#3b6a2c', '#6b4f2a'][(R() * 5) | 0];
          at(x, y, (px, py) => { t.fillStyle = col; t.beginPath(); t.ellipse(px, py, r, r * 0.45, rot, 0, Math.PI * 2); t.fill(); });
        }
        break;
      case 'snow':
        for (let i = 0; i < 60; i++) {
          const x = R() * TEX, y = R() * TEX, r = 4 + R() * 10;
          at(x, y, (px, py) => { t.fillStyle = 'rgba(150,175,205,0.08)'; t.beginPath(); t.ellipse(px, py, r, r * 0.5, 0, 0, Math.PI * 2); t.fill(); });
        }
        for (let i = 0; i < 260; i++) at(R() * TEX, R() * TEX, (px, py) => { t.fillStyle = '#ffffff'; t.fillRect(px, py, 1, 1); });
        break;
      case 'water':
        for (let i = 0; i < 90; i++) {
          const x = R() * TEX, y = R() * TEX, w = 4 + R() * 10;
          at(x, y, (px, py) => { t.strokeStyle = R() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,30,80,0.12)'; t.lineWidth = 1; t.beginPath(); t.moveTo(px, py); t.quadraticCurveTo(px + w / 2, py - 1.5, px + w, py); t.stroke(); });
        }
        break;
      case 'path': {
        // staggered cobbles; the pattern is later mapped onto the iso grid
        const cw = 16, ch = 16;
        for (let row = 0; row < TEX / ch; row++) for (let col = 0; col < TEX / cw; col++) {
          const x = col * cw + (row % 2) * cw / 2, y = row * ch, l = 0.85 + R() * 0.3;
          const tone = Math.round(196 * l), c2 = `rgb(${tone},${Math.round(tone * 0.9)},${Math.round(tone * 0.74)})`;
          at(x + 1, y + 1, (px, py) => {
            t.fillStyle = c2;
            t.beginPath(); t.roundRect(px, py, cw - 2, ch - 2, 4); t.fill();
            t.fillStyle = 'rgba(255,255,255,0.18)';
            t.fillRect(px + 2, py + 1.5, cw - 7, 2);
          });
        }
        break;
      }
    }
    texCanvases[key] = cv;
  }
}

function groundDetail(c, type, x, y, r) {
  const tuft = (cols, n, h) => {
    ell(c, x, y + 0.5, n * 0.9, 1.2, 'rgba(0,0,0,0.18)');
    for (let i = 0; i < n; i++) {
      const bx = x + (i - n / 2) * 1.1, lean = (i - n / 2) * 0.6, bh = h * (0.6 + ((i * 7) % 5) / 10);
      curve(c, bx, y, bx + lean * 0.5, y - bh * 0.6, bx + lean, y - bh, cols[i % cols.length], 0.9);
    }
  };
  switch (type) {
    case 'grass':
      if (r < 0.12) { tuft(['#4c8634', '#6aa848'], 4, 4); circ(c, x + 0.5, y - 4, 1, ['#f4f4f0', '#f2d24a', '#c9a0e8', '#ff8fa3'][Math.floor(r * 40) % 4]); }
      else tuft(['#4c8634', '#7bb555', '#5c973c'], 5, 4 + r * 3);
      break;
    case 'savannah': tuft(['#a8904a', '#d6c06a', '#bfa858'], 6, 6 + r * 4); break;
    case 'rainforest': tuft(['#2f5524', '#4d7a33', '#3b6a2c'], 5, 5 + r * 3); break;
    case 'dirt': case 'sand':
      ell(c, x, y, 1.6 + r, 1 + r * 0.5, type === 'dirt' ? '#6b5038' : '#b8a070');
      ell(c, x - 0.4, y - 0.4, 0.8 + r * 0.5, 0.5, type === 'dirt' ? '#a8896a' : '#f2e4b8');
      break;
    case 'snow':
      ell(c, x, y, 3 + r * 2, 1.4, 'rgba(160,185,210,0.35)');
      ell(c, x - 0.6, y - 0.6, 2.4 + r * 2, 1.1, '#ffffff');
      break;
  }
}

function smoothNoise(x, y) {
  const S = 6, gx = x / S, gy = y / S, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const sm = f => f * f * (3 - 2 * f);
  const a = hash2(x0, y0, 21), b = hash2(x0 + 1, y0, 21), c = hash2(x0, y0 + 1, 21), d = hash2(x0 + 1, y0 + 1, 21);
  return (a + (b - a) * sm(fx)) * (1 - sm(fy)) + (c + (d - c) * sm(fx)) * sm(fy);
}

function renderTerrain() {
  if (!texCanvases) buildTextures();
  if (!terrainCanvas) {
    terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = (MAP_W + MAP_H) * TW / 2;
    terrainCanvas.height = (MAP_W + MAP_H) * TH / 2 + 2;
  }
  const c = terrainCanvas.getContext('2d');
  shoreEdges.length = 0;
  const pat = {};
  for (const k in texCanvases) pat[k] = c.createPattern(texCanvases[k], 'repeat');
  // map the cobble texture onto the iso grid: 128px of texture = 2 tiles
  if (pat.path.setTransform) pat.path.setTransform(new DOMMatrix([0.5, 0.25, -0.5, 0.25, TERR_OFF_X, 0]));
  c.clearRect(0, 0, terrainCanvas.width, terrainCanvas.height);

  // distance from shore for water depth
  const depth = new Uint8Array(MAP_W * MAP_H), queue = [];
  for (let i = 0; i < depth.length; i++) {
    if (G.tiles[i].t !== 'water') continue;
    const x = i % MAP_W, y = (i / MAP_W) | 0;
    if (DIRS.some(([dx, dy]) => { const n = tileAt(x + dx, y + dy); return n && n.t !== 'water'; })) { depth[i] = 1; queue.push(i); }
  }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h], x = i % MAP_W, y = (i / MAP_W) | 0;
    for (const [dx, dy] of DIRS) {
      if (!inMap(x + dx, y + dy)) continue;
      const ni = idx(x + dx, y + dy);
      if (G.tiles[ni].t === 'water' && !depth[ni]) { depth[ni] = Math.min(255, depth[i] + 1); queue.push(ni); }
    }
  }

  const center = (x, y) => [isoX(x + 0.5, y + 0.5) + TERR_OFF_X, isoY(x + 0.5, y + 0.5)];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = G.tiles[idx(x, y)], [px, py] = center(x, y);
      diamond(c, px, py, TW / 2 + 0.6, TH / 2 + 0.3);
      c.fillStyle = pat[t.t];
      c.fill();
      // gentle large-scale light variation hides the tile grid
      const n = smoothNoise(x, y) - 0.5;
      c.fillStyle = n > 0 ? `rgba(255,250,220,${(n * 0.16).toFixed(3)})` : `rgba(0,25,0,${(-n * 0.2).toFixed(3)})`;
      c.fill();
      if (t.t === 'water') {
        const d = depth[idx(x, y)] || 9;
        c.fillStyle = d === 1 ? 'rgba(150,215,235,0.3)' : d === 2 ? 'rgba(120,195,230,0.12)' : `rgba(8,35,90,${Math.min(0.3, (d - 2) * 0.08).toFixed(3)})`;
        c.fill();
      }
    }
  }

  // little tufts, flowers and pebbles scattered over open ground
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = G.tiles[idx(x, y)];
      if (t.path || t.t === 'water') continue;
      const n = Math.floor(hash2(x, y, 61) * 4);
      for (let k = 0; k < n; k++) {
        const u = 0.15 + hash2(x, y, 70 + k) * 0.7, v = 0.15 + hash2(x, y, 80 + k) * 0.7;
        const dx = isoX(x + u, y + v) + TERR_OFF_X, dy = isoY(x + u, y + v), r = hash2(x, y, 90 + k);
        groundDetail(c, t.t, dx, dy, r);
      }
    }
  }

  // ragged blending where terrain types meet, and damp banks next to water
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = G.tiles[idx(x, y)], [px, py] = center(x, y), corners = tileCorners(x, y, TERR_OFF_X);
      let clipped = false;
      DIRS.forEach(([dx, dy], d) => {
        const nb = tileAt(x + dx, y + dy);
        if (!nb || nb.t === t.t) return;
        if (!clipped) { c.save(); diamond(c, px, py); c.clip(); clipped = true; }
        const [a, b] = edgeOf(corners, d);
        if (t.t === 'water') return;
        const wet = nb.t === 'water';
        c.fillStyle = wet ? 'rgba(70,55,30,0.28)' : pat[nb.t];
        for (let k = 0; k < 7; k++) {
          const f = (k + 0.5) / 7, r = (wet ? 3 : 3.5) + hash2(x * 4 + d, y * 4 + k, 5) * (wet ? 3 : 5);
          const ex = a[0] + (b[0] - a[0]) * f, ey = a[1] + (b[1] - a[1]) * f;
          c.beginPath();
          c.ellipse(ex, ey, r * 1.6, r * 0.8, 0, 0, Math.PI * 2);
          c.fill();
        }
      });
      if (clipped) c.restore();
      if (t.t === 'water') {
        DIRS.forEach(([dx, dy], d) => {
          const nb = tileAt(x + dx, y + dy);
          if (!nb || nb.t === 'water') return;
          const [a, b] = edgeOf(corners, d);
          line(c, a[0], a[1], b[0], b[1], 'rgba(235,246,250,0.75)', 2.2);
          shoreEdges.push([a[0] - TERR_OFF_X, a[1], b[0] - TERR_OFF_X, b[1], hash2(x, y, d) * 6.28, px - TERR_OFF_X, py]);
          line(c, a[0] + (px - a[0]) * 0.12, a[1] + (py - a[1]) * 0.12, b[0] + (px - b[0]) * 0.12, b[1] + (py - b[1]) * 0.12, 'rgba(255,255,255,0.25)', 1.2);
        });
      }
    }
  }

  // paths on top: cobbles with kerbs
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = G.tiles[idx(x, y)];
      if (!t.path) continue;
      const [px, py] = center(x, y), corners = tileCorners(x, y, TERR_OFF_X);
      diamond(c, px, py, TW / 2 + 0.5, TH / 2 + 0.25);
      c.fillStyle = pat.path;
      c.fill();
      DIRS.forEach(([dx, dy], d) => {
        const nb = tileAt(x + dx, y + dy);
        if (nb && nb.path) return;
        const [a, b] = edgeOf(corners, d), k = 0.08;
        const ia = [a[0] + (px - a[0]) * k, a[1] + (py - a[1]) * k], ib = [b[0] + (px - b[0]) * k, b[1] + (py - b[1]) * k];
        line(c, a[0], a[1], b[0], b[1], 'rgba(40,30,15,0.35)', 2.5);
        line(c, ia[0], ia[1], ib[0], ib[1], '#e2d6bc', 2.2);
      });
    }
  }
}

// Slow-moving cloud shadows across the zoo.
function drawClouds(c, now) {
  const t = now / 1000, spanX = (MAP_W + MAP_H) * TW / 2, spanY = (MAP_W + MAP_H) * TH / 2;
  for (let k = 0; k < 5; k++) {
    const x = ((hash2(k, 1) * spanX + t * (10 + k * 2)) % (spanX + 600)) - TERR_OFF_X - 300;
    const y = hash2(k, 2) * spanY;
    const r = 180 + hash2(k, 3) * 160;
    c.save();
    c.translate(x, y);
    c.scale(1, 0.5);
    const g = c.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
    g.addColorStop(0, 'rgba(0,10,30,0.09)');
    g.addColorStop(1, 'rgba(0,10,30,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.restore();
  }
}

// ---------- wildlife: birds flying over and butterflies ----------
const flocks = [];
let nextFlock = 4;
function drawSkyLife(c, now, dt) {
  const t = now / 1000;
  nextFlock -= dt;
  if (nextFlock <= 0 && darkness() < 0.4) {
    nextFlock = rand(12, 30);
    const fromLeft = Math.random() < 0.5, n = randi(3, 9), y = cam.y + rand(-viewH * 0.4, viewH * 0.2) / cam.zoom;
    const birds = [];
    for (let i = 0; i < n; i++) birds.push({ dx: -Math.abs(i - n / 2) * 14 * rand(0.8, 1.2), dy: (i - n / 2) * 9 + rand(-3, 3), ph: rand(0, 6) });
    flocks.push({ x: cam.x + (fromLeft ? -1 : 1) * (viewW / 2 / cam.zoom + 120), y, vx: (fromLeft ? 1 : -1) * rand(70, 110), vy: rand(-12, 12), birds, life: 0, big: Math.random() < 0.3 });
    if (Math.random() < 0.6) Sound.bird && Sound.ctx && !Sound.muted && Sound.ok('flock', 2) && Sound.bird();
  }
  for (let f = flocks.length - 1; f >= 0; f--) {
    const fl = flocks[f];
    fl.x += fl.vx * dt; fl.y += fl.vy * dt; fl.life += dt;
    if (fl.life > 40) { flocks.splice(f, 1); continue; }
    const dir = Math.sign(fl.vx);
    // the flock calls now and then while it's on screen
    fl.callT = (fl.callT == null ? rand(0.2, 1) : fl.callT) - dt;
    if (fl.callT <= 0) {
      fl.callT = fl.big ? rand(1.2, 2.6) : rand(0.6, 1.6);
      const sx = (fl.x - cam.x) * cam.zoom + viewW / 2, sy = (fl.y - cam.y) * cam.zoom + viewH / 2;
      if (sx > -40 && sx < viewW + 40 && sy > -40 && sy < viewH + 40) Sound.flock(sx, fl.big, cam.zoom > 1.2);
    }
    for (const b of fl.birds) {
      const bx = fl.x + b.dx * dir, by = fl.y + b.dy, flap = Math.sin(t * (fl.big ? 7 : 11) + b.ph);
      // shadow on the ground far below
      ell(c, bx + 40, by + 110, fl.big ? 4 : 2.5, 1.2, 'rgba(0,0,0,0.12)');
      const w = fl.big ? 9 : 6, col = fl.big ? '#f4f4f4' : '#2b2b30';
      c.beginPath();
      c.moveTo(bx - w, by - flap * w * 0.6);
      c.quadraticCurveTo(bx - w * 0.4, by - 2 - flap * 2, bx, by);
      c.quadraticCurveTo(bx + w * 0.4, by - 2 - flap * 2, bx + w, by - flap * w * 0.6);
      c.strokeStyle = col;
      c.lineWidth = fl.big ? 1.8 : 1.3;
      c.lineCap = 'round';
      c.stroke();
    }
  }
}

function drawButterflies(c, now, vis) {
  if (darkness() > 0.5) return;
  const t = now / 1000;
  for (const o of G.objects.values()) {
    if (o.type !== 'flowers' && o.type !== 'bush' && o.type !== 'gardenfountain') continue;
    const cx = isoX(o.x + 0.5, o.y + 0.5), cy = isoY(o.x + 0.5, o.y + 0.5);
    if (!vis(cx, cy)) continue;
    for (let k = 0; k < (o.type === 'flowers' ? 2 : 1); k++) {
      const s = o.id * 3 + k, a = t * (0.7 + hash2(s, 1) * 0.6) + hash2(s, 2) * 6;
      const x = cx + Math.cos(a) * 14 + Math.sin(a * 2.3) * 4, y = cy - 12 + Math.sin(a * 1.7) * 6;
      const flap = Math.abs(Math.sin(t * 14 + s));
      const col = ['#ffd23f', '#ff8fa3', '#ffffff', '#8fc4f0'][s % 4];
      ell(c, x - 1.6 * flap, y, 1.8 * flap + 0.3, 1.3, col);
      ell(c, x + 1.6 * flap, y, 1.8 * flap + 0.3, 1.3, col);
      line(c, x, y - 1, x, y + 1, '#333', 0.6);
    }
  }
}

// ---------- day / night ----------
let lightCanvas = null;
function lightSources() {
  const out = [];
  for (const o of G.objects.values()) {
    const def = OBJECTS[o.type];
    const n = (def.size || 1) / 2;
    if (def.light) out.push([o.x + n, o.y + n, 34, 85]);
    else if (def.cat === 'ride') out.push([o.x + n, o.y + n, 50, 140]);
    else if (def.cat === 'building' && def.icon) out.push([o.x + n, o.y + n, 12 * n * 2, 55 * n * 2]);
  }
  out.push([ENTRANCE.x + 0.5, ENTRANCE.y + 0.5, 40, 80]);
  return out;
}

function drawLighting() {
  const dark = darkness(), glow = duskGlow();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (glow > 0.01) {
    ctx.fillStyle = `rgba(255,130,40,${(0.13 * glow).toFixed(3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (dark < 0.01) return;
  if (!lightCanvas) lightCanvas = document.createElement('canvas');
  if (lightCanvas.width !== canvas.width || lightCanvas.height !== canvas.height) {
    lightCanvas.width = canvas.width;
    lightCanvas.height = canvas.height;
  }
  const l = lightCanvas.getContext('2d');
  l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
  l.fillStyle = `rgba(10,16,48,${(0.6 * dark).toFixed(3)})`;
  l.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
  l.globalCompositeOperation = 'destination-out';
  const lights = lightSources().map(([x, y, h, r]) => {
    const p = tileToScreen(x, y);
    return [p.x * dpr, (p.y - h * cam.zoom) * dpr, r * cam.zoom * dpr];
  }).filter(([x, y, r]) => x > -r && y > -r && x < canvas.width + r && y < canvas.height + r);
  for (const [x, y, r] of lights) {
    const g = l.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = g;
    l.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.drawImage(lightCanvas, 0, 0);
  // warm glow around the lights
  ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, r] of lights) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.7);
    g.addColorStop(0, `rgba(255,200,110,${(0.32 * dark).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- minimap ----------
function renderMinimap(mc) {
  const W = mc.clientWidth, H = mc.clientHeight, r = Math.min(2, window.devicePixelRatio || 1);
  if (mc.width !== W * r) { mc.width = W * r; mc.height = H * r; }
  const c = mc.getContext('2d');
  const k = W / terrainCanvas.width;
  c.setTransform(r, 0, 0, r, 0, 0);
  c.fillStyle = '#1f3518';
  c.fillRect(0, 0, W, H);
  const oy = (H - terrainCanvas.height * k) / 2;
  c.drawImage(terrainCanvas, 0, oy, W, terrainCanvas.height * k);
  const pt = (x, y) => [(isoX(x, y) + TERR_OFF_X) * k, isoY(x, y) * k + oy];
  for (const o of G.objects.values()) {
    const cat = OBJECTS[o.type].cat;
    if (cat !== 'building' && cat !== 'ride') continue;
    const [x, y] = pt(o.x + 0.5, o.y + 0.5);
    c.fillStyle = cat === 'ride' ? '#ff6fb0' : '#ffd166';
    c.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  c.fillStyle = '#fff';
  for (const g of G.guests) { const [x, y] = pt(g.x, g.y); c.fillRect(x - 0.5, y - 0.5, 1, 1); }
  for (const a of G.animals) {
    const [x, y] = pt(a.x, a.y);
    c.fillStyle = a.escaped ? '#ff3030' : '#ff9f1c';
    c.fillRect(x - 1, y - 1, 2.2, 2.2);
  }
  // camera viewport
  const x0 = (cam.x - viewW / 2 / cam.zoom + TERR_OFF_X) * k, y0 = (cam.y - viewH / 2 / cam.zoom) * k + oy;
  c.strokeStyle = '#fff';
  c.lineWidth = 1;
  c.strokeRect(x0, y0, viewW / cam.zoom * k, viewH / cam.zoom * k);
  return { k, oy };
}

// Big round buttons on each side of the selected tile (single-piece fence mode).
function drawFenceHandles(c) {
  for (const h of fenceHandles()) {
    line(c, h.mx, h.my, h.sx, h.sy, 'rgba(255,255,255,0.85)', 2);
    c.beginPath();
    c.arc(h.sx, h.sy, 15, 0, Math.PI * 2);
    c.fillStyle = h.on ? 'rgba(200,60,50,0.92)' : 'rgba(60,140,60,0.92)';
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = '#fff';
    c.stroke();
    c.fillStyle = '#fff';
    c.font = 'bold 18px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(h.on ? '×' : '+', h.sx, h.sy + 1);
    c.textBaseline = 'alphabetic';
  }
}

let vignette = null;
function drawVignette(c) {
  if (!vignette || vignette.w !== viewW || vignette.h !== viewH) {
    const g = c.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.45, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(10,20,5,0.28)');
    vignette = { w: viewW, h: viewH, g };
  }
  c.fillStyle = vignette.g;
  c.fillRect(0, 0, viewW, viewH);
}

// ---------- fences ----------
function drawFence(c, type, x1, y1, x2, y2, cond = 100, open = 0) {
  const vertical = (x2 - x1) * (y2 - y1) > 0; // runs down-right on screen
  if (type === 4) { drawGate(c, x1, y1, x2, y2, open, cond); return; }
  const wear = cond < 60 ? (60 - cond) / 60 : 0;
  if (wear > 0) {
    // worn fences sag and crack
    c.save();
    c.transform(1, 0, wear * 0.18 * (vertical ? 1 : -1), 1, -wear * 0.18 * (vertical ? 1 : -1) * ((y1 + y2) / 2), 0);
    drawFenceBody(c, type, x1, y1, x2, y2, vertical, wear);
    c.restore();
    if (wear > 0.35) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      line(c, mx - 2, my - 12, mx + 1, my - 6, 'rgba(40,20,10,0.8)', 1.2);
      line(c, mx + 1, my - 6, mx - 1, my - 2, 'rgba(40,20,10,0.8)', 1.2);
    }
    return;
  }
  drawFenceBody(c, type, x1, y1, x2, y2, vertical, 0);
}

// A gate: two posts with a crossbar and a pair of wooden doors that swing
// open (seen foreshortened) when a keeper comes through.
function drawGate(c, x1, y1, x2, y2, open, cond) {
  const h = 21, wood = tint('#8a5d30', cond < 50 ? -0.2 : 0), dark = '#4e3218';
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const panel = (ax, ay, bx, by) => {
    const f = 1 - open * 0.82, ex = ax + (bx - ax) * f, ey = ay + (by - ay) * f;
    poly(c, [[ax, ay - 1], [ex, ey - 1 - open * 3], [ex, ey - h * 0.82 - open * 3], [ax, ay - h * 0.82]], wood, dark, 0.8);
    for (let k = 1; k < 4; k++) { const g = k / 4; line(c, ax + (ex - ax) * g, ay + (ey - ay) * g - 1, ax + (ex - ax) * g, ay + (ey - ay) * g - h * 0.8, 'rgba(0,0,0,0.22)', 0.6); }
    line(c, ax, ay - 2, ex, ey - h * 0.78 - open * 3, 'rgba(60,35,15,0.7)', 1);
  };
  panel(x1, y1, mx, my);
  panel(x2, y2, mx, my);
  for (const [px, py] of [[x1, y1], [x2, y2]]) {
    line(c, px, py + 1, px, py - h - 3, dark, 3.4);
    line(c, px - 0.8, py, px - 0.8, py - h - 3, '#7a5530', 1.2);
    ell(c, px, py - h - 4, 2.4, 1.3, '#5e3a1c');
  }
  line(c, x1, y1 - h - 2, x2, y2 - h - 2, dark, 2.4);
}

function drawFenceBody(c, type, x1, y1, x2, y2, vertical, wear) {
  if (type === 3) {
    const h = 13;
    poly(c, [[x1, y1], [x2, y2], [x2, y2 - h], [x1, y1 - h]], tint(vertical ? '#8f8a80' : '#a39e94', -wear * 0.35));
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 1;
    for (const k of [h / 3, 2 * h / 3]) { c.beginPath(); c.moveTo(x1, y1 - k); c.lineTo(x2, y2 - k); c.stroke(); }
    line(c, x1, y1 - h, x2, y2 - h, '#c4bfb5', 3);
  } else if (type === 2) {
    const h = 15;
    for (const f of [0, 0.5, 1]) {
      const px = x1 + (x2 - x1) * f, py = y1 + (y2 - y1) * f;
      line(c, px, py, px, py - h, tint('#6b4526', -wear * 0.3), 3);
    }
    line(c, x1, y1 - h * 0.4, x2, y2 - h * 0.4, tint('#9a6a3a', -wear * 0.4), 2.5);
    if (wear < 0.5) line(c, x1, y1 - h * 0.85, x2, y2 - h * 0.85, tint('#a87644', -wear * 0.4), 2.5);
    else line(c, x1, y1 - h * 0.85, (x1 + x2) / 2, (y1 + y2) / 2 - h * 0.6, '#7a5532', 2.5);
  } else {
    const h = 17;
    poly(c, [[x1, y1], [x2, y2], [x2, y2 - h], [x1, y1 - h]], wear ? `rgba(170,130,90,${0.32 - wear * 0.15})` : 'rgba(190,198,205,0.32)');
    c.strokeStyle = 'rgba(120,130,140,0.35)';
    c.lineWidth = 0.7;
    c.beginPath();
    for (let f = 0; f <= 1.001; f += 0.125) {
      const px = x1 + (x2 - x1) * f, py = y1 + (y2 - y1) * f;
      c.moveTo(px, py); c.lineTo(px, py - h);
    }
    c.stroke();
    line(c, x1, y1, x1, y1 - h, '#6f757b', 2);
    line(c, x2, y2, x2, y2 - h, '#6f757b', 2);
    line(c, x1, y1 - h, x2, y2 - h, '#9aa1a7', 1.5);
  }
}

// Rides keep turning while the zoo has visitors in the daytime, and always with riders.
function rideRunning(obj) { return !!obj && (obj.riders > 0 || (G.guests.length > 0 && darkness() < 0.6)); }

// ---------- objects ----------
function drawObjectSprite(c, type, v, px, py, obj = null) {
  const s = 0.85 + v * 0.3;
  SHADE = true;
  c.save();
  c.translate(px, py);
  if (OBJECTS[type].size === 2) c.scale(1.75, 1.75);
  else if (OBJECTS[type].cat === 'foliage' && type !== 'tallgrass' && type !== 'fern' && type !== 'bush') c.scale(1.3, 1.3);
  if (OBJECTS[type].cat === 'foliage') {
    // trees lean gently in the wind
    const sway = Math.sin(performance.now() / 1000 * 1.3 + v * 20) * (type === 'tallgrass' || type === 'bamboo' ? 0.07 : 0.025);
    c.transform(1, 0, sway, 1, 0, 0);
  }
  switch (type) {
    case 'acacia': {
      const seed = (v * 997) | 0;
      shadow(c, 6, 1, 26 * s, 9 * s);
      c.scale(s, s);
      trunk(c, 0, 0, 2, -30, 2.4, '#6b4a2b');
      line(c, 1, -22, -12, -32, '#5e4026', 2);
      line(c, 2, -26, 13, -34, '#5e4026', 2);
      canopy(c, 0, -37, 27, 6, 16, '#62842f', seed, 0.5);
      break;
    }
    case 'palm': {
      shadow(c, 8, 1, 18 * s, 7 * s);
      c.scale(s, s);
      for (let i = 0; i < 8; i++) ell(c, i * 0.9, -i * 5.8 - 2, 3.3, 3.4, i % 2 ? '#8b6b43' : '#7a5c38');
      const tx = 7, ty = -47;
      const sw = Math.sin(performance.now() / 900 + v * 10) * 1.5;
      for (let k = 0; k < 9; k++) {
        const a = -Math.PI + k * (Math.PI / 8) + (k % 2) * 0.1, len = 22 + (k % 3) * 3;
        const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * 7 + 12 + sw * (k % 2);
        const mx = tx + Math.cos(a) * len * 0.5, my = ty - 7 + sw;
        const col = k % 2 ? '#3e8a35' : '#2e7029';
        c.beginPath();
        c.moveTo(tx, ty);
        c.quadraticCurveTo(mx, my - 4, ex, ey);
        c.quadraticCurveTo(mx, my + 3, tx, ty + 1);
        c.fillStyle = col;
        c.fill();
        curve(c, tx, ty, mx, my - 1, ex, ey, tint(col, 0.25), 0.7);
      }
      circ(c, tx - 2, ty + 3, 2.4, '#5a3d1e');
      circ(c, tx + 2, ty + 3, 2.4, '#6b4a26');
      break;
    }
    case 'pine':
      shadow(c, 5, 1, 16 * s, 7 * s);
      c.scale(s, s * 1.1);
      trunk(c, 0, 0, 0, -12, 2.2, '#5b3e25');
      for (let i = 0; i < 4; i++) {
        const y0 = -4 - i * 10, w = 16 - i * 3.6, h = 18;
        const pts = [[-w, y0]];
        for (let k = 1; k < 6; k++) pts.push([-w + (k / 6) * w * 2, y0 + (k % 2 ? 2.5 : 0)]);
        pts.push([w, y0], [0, y0 - h]);
        const g = c.createLinearGradient(-w, 0, w, 0);
        g.addColorStop(0, '#4a8458'); g.addColorStop(0.45, '#356b40'); g.addColorStop(1, '#1f4728');
        poly(c, pts, g);
      }
      break;
    case 'oak': {
      const seed = (v * 991) | 0;
      shadow(c, 6, 1, 20 * s, 8 * s);
      c.scale(s, s);
      trunk(c, 0, 0, 0, -20, 3.2, '#6b4a2b');
      line(c, 0, -16, -7, -24, '#5e4026', 2);
      canopy(c, 0, -31, 17, 13, 16, '#478838', seed);
      break;
    }
    case 'bamboo':
      shadow(c, 2, 0, 12, 5);
      c.scale(s, s);
      for (let i = 0; i < 6; i++) {
        const x = -10 + i * 4 + hash2(i, 3) * 2, h = 30 + ((i * 7) % 3) * 6;
        line(c, x, 0, x + 1, -h, i % 2 ? '#86a948' : '#6f9438', 2.5);
        for (let y = -6; y > -h; y -= 7) line(c, x - 1, y, x + 2, y, '#a9c46a', 1);
        ell(c, x + 4, -h + 2, 5, 1.5, '#5d8f2f', -0.4);
      }
      break;
    case 'fern':
      shadow(c, 0, 0, 12, 5);
      c.scale(s, s);
      for (let k = 0; k < 8; k++) {
        const a = -Math.PI / 2 + (k - 3.5) * 0.4;
        curve(c, 0, 0, Math.cos(a) * 8, Math.sin(a) * 16, Math.cos(a) * 15, Math.sin(a) * 8 - 2, k % 2 ? '#3f7d34' : '#4f9440', 2.2);
      }
      break;
    case 'tallgrass':
      c.scale(s, s);
      for (let k = 0; k < 15; k++) {
        const x = (k - 7) * 1.8, h = 12 + hash2(k, 7) * 12;
        curve(c, x, 2 - (k % 3), x + 2, -h / 2, x + (k % 2 ? 4 : -3), -h, ['#b5a642', '#9c9a3a', '#cbb95c'][k % 3], 1.5);
      }
      break;
    case 'eucalyptus': {
      const seed = (v * 983) | 0;
      shadow(c, 4, 1, 16 * s, 6 * s);
      c.scale(s, s * 1.15);
      trunk(c, 0, 0, 1, -34, 2.2, '#d9d2c3');
      line(c, 0, -22, -8, -30, '#cfc7b6', 1.8);
      line(c, 0, -27, 7, -34, '#cfc7b6', 1.8);
      canopy(c, -6, -33, 9, 7, 8, '#7d9a84', seed);
      canopy(c, 4, -40, 11, 8, 10, '#86a68d', seed + 7);
      break;
    }
    case 'cactus':
      shadow(c, 2, 0, 8, 3);
      c.scale(s, s);
      c.lineCap = 'round';
      line(c, 0, 0, 0, -30, '#3f7d4a', 6);
      curve(c, 0, -14, -9, -14, -8, -24, '#3f7d4a', 4.5);
      curve(c, 0, -18, 8, -18, 7, -26, '#3f7d4a', 4.5);
      line(c, 1, -2, 1, -28, '#5a9a62', 1.2);
      circ(c, 0, -31, 1.8, '#f2c94c');
      break;
    case 'bush':
      shadow(c, 0, 1, 15 * s, 5.5 * s);
      c.scale(s, s);
      canopy(c, 0, -8, 12, 7, 11, '#447f38', (v * 977) | 0);
      break;
    case 'rock': case 'icerock': {
      const ice = type === 'icerock';
      shadow(c, 0, 1, 16 * s, 6 * s);
      c.scale(s, s);
      const pts = [[-14, 0], [-12, -10], [-4, -16], [8, -14], [14, -5], [12, 2], [-6, 3]];
      polyLit(c, pts, ice ? '#c6e0ee' : '#8a8780', ice ? '#9cc3d9' : '#5e5b55');
      polyLit(c, [[-12, -10], [-4, -16], [8, -14], [2, -8], [-6, -6]], ice ? '#f4fbff' : '#a8a59d');
      if (!ice) { ell(c, -5, -1, 4, 1.5, 'rgba(70,110,50,0.45)'); line(c, 2, -9, 9, -4, 'rgba(0,0,0,0.25)', 0.8); }
      break;
    }
    case 'rockcave': case 'icecave': {
      const ice = type === 'icecave';
      shadow(c, 0, 2, 34, 12);
      polyLit(c, [[-30, 2], [-28, -14], [-16, -28], [2, -33], [20, -27], [30, -11], [30, 4], [0, 10]], ice ? '#d7ebf5' : '#7d776e', ice ? '#a6c9dc' : '#57524b');
      polyLit(c, [[-26, -12], [-16, -26], [2, -31], [10, -22], [-6, -16]], ice ? '#f7fcff' : '#958f85');
      line(c, -18, -8, -6, -2, 'rgba(0,0,0,0.2)', 1);
      ell(c, 8, -5, 10, 10, ice ? '#3d6f8e' : '#2a2622');
      ell(c, 8, 1, 10, 4, ice ? '#5c8eab' : '#3b3631');
      break;
    }
    case 'hut':
      shadow(c, 0, 4, 30, 12);
      isoBox(c, 0, 0, 22, 14, '#8b6b43', '#9c7a4f', '#7d5f3a');
      poly(c, [[6, 8], [16, 3], [16, -9], [6, -4]], '#3a2a1a');
      pyramidRoof(c, 0, 0, 27, 14, 17, '#d6b25e', '#bf9a45');
      break;
    case 'ball': {
      let ox = 0, oy = 0, spin = 0;
      if (obj) {
        // knocked by an animal: roll, slow down, stay within the tile
        const dt = 1 / 60;
        obj.bx = clamp((obj.bx || 0) + (obj.kvx || 0) * dt, -18, 18);
        obj.by = clamp((obj.by || 0) + (obj.kvy || 0) * dt, -7, 7);
        obj.kvx = (obj.kvx || 0) * 0.97; obj.kvy = (obj.kvy || 0) * 0.97;
        if (Math.abs(obj.bx) >= 18) obj.kvx = -obj.kvx * 0.5;
        obj.spin = (obj.spin || 0) + (obj.kvx || 0) * dt / 8;
        ox = obj.bx; oy = obj.by; spin = obj.spin;
      }
      shadow(c, ox, oy, 8, 3);
      const b = Math.abs(Math.sin(performance.now() / 400 + v * 6)) * (obj && Math.abs(obj.kvx || 0) > 5 ? 4 : 1);
      circ(c, ox, oy - 8 - b, 8, '#e04848');
      c.beginPath(); c.arc(ox, oy - 8 - b, 8, -0.3 + spin, 1.3 + spin); c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.stroke();
      c.translate(ox, oy);
      circ(c, -3, -11 - b, 2, 'rgba(255,255,255,0.6)');
      break;
    }
    case 'log':
      shadow(c, 0, 0, 18, 5);
      c.fillStyle = '#7a5230';
      c.beginPath(); c.roundRect(-16, -11, 30, 10, 4); c.fill();
      line(c, -12, -8, 8, -8, '#5e3d22', 1);
      ell(c, 14, -6, 4, 5, '#a37a4c');
      ell(c, 14, -6, 2.2, 3, '#3a2616');
      break;
    case 'burger': case 'drinks': {
      const red = type === 'burger';
      shadow(c, 0, 4, 28, 11);
      isoBox(c, 0, 0, 22, 18, '#f5f0e6', red ? '#d94a3a' : '#3a7bd5', red ? '#b63a2d' : '#2d62ad');
      poly(c, [[4, 7], [18, 0], [18, -10], [4, -3]], '#3a2a1a');
      line(c, 4, 0, 18, -7, '#f5f0e6', 2);
      pyramidRoof(c, 0, 0, 26, 18, 10, red ? '#f2c94c' : '#ffffff', red ? '#d9ad2f' : '#dcdcdc');
      c.font = '15px sans-serif'; c.textAlign = 'center';
      c.fillText(OBJECTS[type].icon, 0, -32);
      break;
    }
    case 'icecream':
      shadow(c, 0, 3, 18, 7);
      isoBox(c, 0, 0, 13, 12, '#fff3f8', '#f7a1c4', '#e07fa8');
      circ(c, -8, 3, 3, '#444'); circ(c, 7, 4, 3, '#444');
      line(c, 0, -12, 0, -34, '#888', 1.5);
      ell(c, 0, -34, 19, 6, '#ff6f91');
      ell(c, -5, -35, 7, 4, '#ffffff');
      ell(c, 8, -34, 5, 3, '#ffe066');
      break;
    case 'restroom':
      shadow(c, 0, 4, 28, 11);
      isoBox(c, 0, 0, 22, 20, '#e8dcc0', '#d4c4a0', '#b9a983');
      poly(c, [[4, 6], [9, 3.5], [9, -9], [4, -6.5]], '#3a6fb0');
      poly(c, [[12, 2], [17, -0.5], [17, -13], [12, -10.5]], '#d96a9c');
      pyramidRoof(c, 0, 0, 25, 20, 12, '#6b4a2b', '#5a3d22');
      c.font = '14px sans-serif'; c.textAlign = 'center';
      c.fillText('🚻', 0, -36);
      break;
    case 'bench':
      shadow(c, 0, 1, 14, 5);
      line(c, -9, 0, -9, -5, '#444', 1.5); line(c, 9, -2, 9, -7, '#444', 1.5);
      poly(c, [[-12, -5], [10, -9], [12, -6], [-10, -2]], '#a0703c');
      poly(c, [[-12, -5], [10, -9], [10, -16], [-12, -12]], '#8a5d30');
      break;
    case 'trash':
      shadow(c, 0, 0, 7, 3);
      c.fillStyle = '#3f7a4c'; c.fillRect(-6, -14, 12, 14);
      ell(c, 0, 0, 6, 2.5, '#3f7a4c');
      ell(c, 0, -14, 6, 2.5, '#5a9a68');
      ell(c, 0, -14, 4, 1.6, '#1f2a22');
      break;
    case 'flowers':
      ell(c, 0, 0, 20, 9, '#5a3d22');
      ell(c, 0, -1, 18, 7.5, '#3d6b2e');
      for (let k = 0; k < 16; k++) {
        const a = hash2(k, 1) * Math.PI * 2, r = Math.sqrt(hash2(k, 2));
        circ(c, Math.cos(a) * r * 15, Math.sin(a) * r * 6 - 3, 2, ['#ff6b8b', '#ffd23f', '#ffffff', '#b07cff'][k % 4]);
      }
      break;
    case 'pizza': case 'coffee': case 'giftshop': {
      const P = {
        pizza: ['#fff4e0', '#e07a2c', '#c2611c', '#c0392b', '#a93226', 22, 18],
        coffee: ['#f3ead8', '#6b4a2b', '#583b21', '#3f7a4c', '#2f6a3c', 16, 16],
        giftshop: ['#f5eefa', '#8e5bb5', '#7444a0', '#e05a8a', '#c0446f', 24, 22],
      }[type];
      const [top, left, right, r1, r2, hw, h] = P;
      shadow(c, 0, 4, hw + 6, hw / 2 + 3);
      isoBox(c, 0, 0, hw, h, top, left, right);
      poly(c, [[4, hw / 2 - 4], [hw - 4, 2], [hw - 4, 2 - h * 0.55], [4, hw / 2 - 4 - h * 0.55]], 'rgba(255,240,190,0.85)', 'rgba(0,0,0,0.3)');
      for (let k = 0; k < 4; k++) {
        const f0 = k / 4, f1 = (k + 1) / 4;
        poly(c, [[f0 * hw, hw / 2 - f0 * hw / 2 - h], [f1 * hw, hw / 2 - f1 * hw / 2 - h], [f1 * hw, hw / 2 - f1 * hw / 2 - h + 6], [f0 * hw, hw / 2 - f0 * hw / 2 - h + 6]], k % 2 ? '#ffffff' : r1);
      }
      pyramidRoof(c, 0, 0, hw + 4, h, 11, r1, r2);
      c.font = '15px sans-serif'; c.textAlign = 'center';
      c.fillText(OBJECTS[type].icon, 0, -h - 18);
      break;
    }
    case 'popcorn':
      shadow(c, 0, 3, 16, 7);
      circ(c, -8, 3, 3, '#333'); circ(c, 7, 4, 3, '#333');
      isoBox(c, 0, 0, 12, 10, '#ffffff', '#e84a4a', '#c43a3a');
      c.save(); c.translate(0, -10);
      isoBox(c, 0, 0, 10, 10, 'rgba(255,250,230,0.5)', 'rgba(255,248,220,0.75)', 'rgba(240,235,210,0.75)');
      for (let k = 0; k < 14; k++) circ(c, -6 + hash2(k, 4) * 12, -2 - hash2(k, 5) * 7, 1.6, k % 3 ? '#fffbe8' : '#f2d45c');
      poly(c, [[-11, -10], [0, -16], [11, -10], [0, -4]], '#e84a4a');
      c.restore();
      line(c, 0, -26, 0, -32, '#888', 1);
      c.font = '11px sans-serif'; c.textAlign = 'center'; c.fillText('🍿', 0, -33);
      break;
    case 'drinkfountain':
      shadow(c, 0, 1, 9, 4);
      isoBox(c, 0, 0, 6, 12, '#c9c4ba', '#b3aea4', '#9a958c');
      ell(c, 0, -12, 6, 3, '#9aa3ab');
      ell(c, 0, -12.5, 4, 2, '#7fb7e0');
      curve(c, -1, -13, 1, -18, 3, -13, 'rgba(180,220,255,0.9)', 1);
      break;
    case 'picnic':
      shadow(c, 0, 2, 20, 9);
      for (const [lx, ly] of [[-10, 0], [10, -2], [-6, 3], [6, 1]]) line(c, lx, ly, lx, ly - 7, '#5e3d22', 1.6);
      c.save(); c.translate(0, -7);
      isoBox(c, 0, 0, 15, 2, '#c08a52', '#9a6a3a', '#8a5d30');
      c.restore();
      c.save(); c.translate(-6, 6); isoBox(c, 0, 0, 13, 3, '#b07a44', '#8a5d30', '#76502a', 4); c.restore();
      c.save(); c.translate(6, -8); isoBox(c, 0, 0, 13, 3, '#b07a44', '#8a5d30', '#76502a', 4); c.restore();
      ell(c, -3, -11, 3, 1.5, '#e84a4a'); ell(c, 4, -12, 2.5, 1.2, '#ffffff');
      break;
    case 'kiosk':
      shadow(c, 0, 2, 14, 6);
      isoBox(c, 0, 0, 10, 20, '#e8f1fb', '#3a7bd5', '#2d62ad');
      poly(c, [[2, 3], [8, 0], [8, -10], [2, -7]], '#f4e9c8');
      line(c, 0, -20, 0, -27, '#666', 1.4);
      circ(c, 0, -32, 6, '#2d62ad');
      c.fillStyle = '#fff'; c.font = 'bold 9px Georgia, serif'; c.textAlign = 'center'; c.fillText('i', 0, -29);
      break;
    case 'donation':
      shadow(c, 0, 1, 7, 3);
      line(c, 0, 0, 0, -10, '#5e3d22', 2);
      c.save(); c.translate(0, -10);
      isoBox(c, 0, 0, 6, 8, '#6bb055', '#3f8f3a', '#2f6f2c');
      c.restore();
      c.fillStyle = '#ffe066'; c.font = 'bold 7px sans-serif'; c.textAlign = 'center'; c.fillText('$', 3, -20);
      break;
    case 'lamp':
      shadow(c, 0, 1, 5, 2);
      line(c, 0, 0, 0, -32, '#2b2b2b', 2);
      line(c, -2, -1, 2, -1, '#2b2b2b', 3);
      poly(c, [[-3.5, -32], [3.5, -32], [2.5, -38], [-2.5, -38]], darkness() > 0.3 ? '#fff3b0' : '#e9e2c6', '#2b2b2b');
      poly(c, [[-4, -38], [4, -38], [0, -41]], '#2b2b2b');
      break;
    case 'gardenfountain': {
      const t = performance.now() / 1000;
      shadow(c, 0, 3, 26, 11);
      ell(c, 0, 0, 23, 10.5, '#a9a49a');
      ell(c, 0, -2, 20, 8.5, '#4b8fd3');
      ell(c, -5, -3, 8, 3, 'rgba(255,255,255,0.25)');
      isoBox(c, 0, -2, 3, 13, '#c9c4ba', '#b3aea4', '#9a958c');
      ell(c, 0, -15, 8, 3.2, '#a9a49a');
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2, ex = Math.cos(a) * 15, ey = Math.sin(a) * 6 - 3;
        curve(c, 0, -18, ex * 0.5, -26, ex, ey, 'rgba(210,235,255,0.75)', 1);
        const f = (t * 1.3 + k / 8) % 1;
        circ(c, ex * f, -18 + (ey + 18) * f - Math.sin(f * Math.PI) * 9, 0.9, 'rgba(230,245,255,0.95)');
      }
      break;
    }
    case 'playground': {
      const t = performance.now() / 1000, busy = obj && obj.riders > 0;
      shadow(c, 0, 3, 28, 12);
      ell(c, 0, 2, 26, 11.5, '#e3cf94');
      // swing frame
      line(c, -22, 2, -16, -22, '#c0392b', 2); line(c, -10, 6, -16, -22, '#c0392b', 2);
      line(c, 4, -6, 10, -30, '#c0392b', 2); line(c, 10, -2, 10, -30, '#c0392b', 2);
      line(c, -16, -22, 10, -30, '#c0392b', 2.2);
      for (let k = 0; k < 2; k++) {
        const sw = busy ? Math.sin(t * 2.5 + k * 2) * 5 : 0, hx = -8 + k * 10, hy = -24 - k * 3;
        line(c, hx, hy, hx + sw, hy + 17, '#555', 0.8);
        line(c, hx - 2 + sw, hy + 17, hx + 2 + sw, hy + 17, '#333', 2);
      }
      // slide
      line(c, 12, 2, 12, -14, '#888', 1.5); line(c, 18, 0, 18, -16, '#888', 1.5);
      c.save(); c.translate(15, -15); isoBox(c, 0, 0, 5, 2, '#3a7bd5', '#2d62ad', '#245090'); c.restore();
      poly(c, [[10, -15], [16, -18], [26, 4], [20, 7]], '#f2c94c', '#d9ad2f');
      break;
    }
    case 'carousel': {
      const t = performance.now() / 1000, run = rideRunning(obj), rot = (v * 6) + t * (obj && obj.riders > 0 ? 1.2 : run ? 0.5 : 0);
      shadow(c, 0, 4, 30, 13);
      ell(c, 0, 0, 27, 12, '#d9c9a3');
      ell(c, 0, -3, 25, 11, '#b33a2e');
      const horses = [];
      for (let k = 0; k < 8; k++) {
        const a = rot + (k / 8) * Math.PI * 2;
        horses.push({ x: Math.cos(a) * 18, y: Math.sin(a) * 7.5 - 6, bob: run ? Math.sin(t * 3 + k) * 2.5 : 0, k });
      }
      const horse = h => {
        line(c, h.x, h.y - 26, h.x, h.y + 2, '#e8c45a', 1);
        const col = ['#ffffff', '#f2c94c', '#8fc4f0', '#f5a3c0'][h.k % 4];
        ell(c, h.x, h.y - 6 + h.bob, 5, 3, col);
        ell(c, h.x + 4, h.y - 9 + h.bob, 2, 2.4, col);
        line(c, h.x - 3, h.y - 4 + h.bob, h.x - 4, h.y + h.bob, col, 1);
        line(c, h.x + 3, h.y - 4 + h.bob, h.x + 4, h.y + h.bob, col, 1);
        if (run && h.k % 2 === 0) circ(c, h.x, h.y - 12 + h.bob, 2, '#e0ac69');
      };
      horses.filter(h => h.y < -6).forEach(horse);
      line(c, 0, -3, 0, -34, '#e8c45a', 3);
      horses.filter(h => h.y >= -6).forEach(horse);
      // striped canopy
      const rim = [];
      for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2 + rot * 0.999; rim.push([Math.cos(a) * 28, Math.sin(a) * 11.5 - 32]); }
      const wedges = [];
      for (let k = 0; k < 12; k++) wedges.push({ k, d: rim[k][1] + rim[k + 1][1] });
      wedges.sort((p, q) => p.d - q.d);
      for (const w of wedges) poly(c, [rim[w.k], rim[w.k + 1], [0, -48]], w.k % 2 ? '#ffffff' : '#d63c30');
      for (let k = 0; k < 12; k++) if (rim[k][1] > -32) circ(c, rim[k][0], rim[k][1] + 1.5, 1.3, darkness() > 0.3 || run ? '#fff3a0' : '#e8d080');
      circ(c, 0, -49, 2.5, '#e8c45a');
      break;
    }
    case 'swings': {
      const t = performance.now() / 1000;
      if (obj) obj._spin = (obj._spin || 0) + ((obj.riders > 0 ? 1 : rideRunning(obj) ? 0.45 : 0) - (obj._spin || 0)) * 0.02;
      const sp = obj ? obj._spin : 0, rot = t * 1.6 * sp + v * 6;
      shadow(c, 0, 4, 30, 13);
      ell(c, 0, 0, 14, 6, '#9aa3ab');
      line(c, 0, 0, 0, -50, '#7a8288', 4);
      const R = 6 + 20 * sp, drop = 24 - 8 * sp, seats = [];
      for (let k = 0; k < 10; k++) {
        const a = rot + (k / 10) * Math.PI * 2;
        seats.push({ hx: Math.cos(a) * 7, hy: Math.sin(a) * 3 - 48, sx: Math.cos(a) * R, sy: Math.sin(a) * R * 0.42 - 48 + drop, k });
      }
      const seat = q => {
        line(c, q.hx, q.hy, q.sx, q.sy, '#666', 0.7);
        c.fillStyle = ['#e84a4a', '#3a7bd5', '#f2c94c'][q.k % 3];
        c.fillRect(q.sx - 2, q.sy, 4, 2);
        if (sp > 0.5 && q.k % 2) circ(c, q.sx, q.sy - 2, 1.6, '#e0ac69');
      };
      seats.filter(q => q.sy < -48 + drop).forEach(seat);
      ell(c, 0, -50, 11, 4.5, '#c0392b');
      poly(c, [[-11, -50], [11, -50], [0, -58]], '#f2c94c');
      seats.filter(q => q.sy >= -48 + drop).forEach(seat);
      break;
    }
    case 'ferris': {
      const t = performance.now() / 1000, run = rideRunning(obj), rot = v * 6 + t * (run ? 0.25 : 0), cy = -46, R = 34;
      shadow(c, 0, 4, 30, 12);
      c.save(); c.translate(0, 0); isoBox(c, 0, 0, 16, 4, '#9aa3ab', '#7a8288', '#6a7278'); c.restore();
      line(c, -16, -2, 0, cy, '#8a929a', 3); line(c, 16, -2, 0, cy, '#8a929a', 3);
      c.beginPath(); c.arc(0, cy, R, 0, Math.PI * 2); c.strokeStyle = '#f2f2f2'; c.lineWidth = 2.2; c.stroke();
      c.beginPath(); c.arc(0, cy, R * 0.55, 0, Math.PI * 2); c.strokeStyle = '#d63c30'; c.lineWidth = 1.2; c.stroke();
      for (let k = 0; k < 12; k++) {
        const a = rot + (k / 12) * Math.PI * 2;
        line(c, 0, cy, Math.cos(a) * R, cy + Math.sin(a) * R, 'rgba(230,230,230,0.9)', 0.8);
      }
      for (let k = 0; k < 12; k++) {
        const a = rot + (k / 12) * Math.PI * 2, gx = Math.cos(a) * R, gy = cy + Math.sin(a) * R;
        line(c, gx, gy, gx, gy + 3, '#555', 0.8);
        c.fillStyle = ['#e84a4a', '#3a7bd5', '#f2c94c', '#3f8f3a'][k % 4];
        c.beginPath(); c.roundRect(gx - 3.5, gy + 3, 7, 6, 2); c.fill();
        if (run && k % 3 === 0) circ(c, gx, gy + 4, 1.4, '#e0ac69');
        if (darkness() > 0.3) circ(c, gx, gy, 1.1, '#fff3a0');
      }
      circ(c, 0, cy, 3.5, '#8a929a');
      break;
    }
    case 'statue':
      shadow(c, 0, 3, 18, 7);
      isoBox(c, 0, 0, 13, 10, '#c9c4ba', '#b3aea4', '#9a958c');
      c.save();
      c.translate(0, -12);
      c.filter = 'grayscale(1) brightness(1.25)';
      c.scale(0.8, 0.8);
      drawAnimalShape(c, 'elephant', { anim: 0, moving: false, state: 'idle', sex: 'M' });
      c.restore();
      break;
  }
  c.restore();
  SHADE = false;
}

function drawEntrance(c) {
  // the road runs along the y axis, so the arch spans the x axis
  const a = [isoX(ENTRANCE.x - 0.15, ENTRANCE.y + 0.5), isoY(ENTRANCE.x - 0.15, ENTRANCE.y + 0.5)];
  const b = [isoX(ENTRANCE.x + 1.15, ENTRANCE.y + 0.5), isoY(ENTRANCE.x + 1.15, ENTRANCE.y + 0.5)];
  for (const p of [a, b]) {
    isoBox(c, p[0], p[1], 6, 46, '#c9b48a', '#a8916a', '#8f7a55');
    pyramidRoof(c, p[0], p[1], 7, 46, 6, '#7a4a2a', '#5e3820');
  }
  poly(c, [[a[0], a[1] - 34], [b[0], b[1] - 34], [b[0], b[1] - 48], [a[0], a[1] - 48]], '#6b3f22', '#3e2412', 1.5);
  c.save();
  c.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 41);
  c.transform(1, (b[1] - a[1]) / (b[0] - a[0]), 0, 1, 0, 0);
  c.fillStyle = '#ffe9b0';
  c.font = 'bold 9px Georgia, serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('MENAGERIE ZOO', 0, 0);
  c.restore();
}

// ---------- animals (shapes live in animals.js) ----------
function drawAnimalShape(c, sp, o) { ANIMAL_SHAPES[sp](c, o); }

function drawAnimal(c, a, px, py) {
  const sp = SPECIES[a.sp], s = sp.size * (a.baby ? 0.6 : 1) * (a.sizeVar || 1);
  const moving = a.path.length > 0;
  const tile = tileAt(Math.floor(a.x), Math.floor(a.y));
  const swim = sp.swims && tile && tile.t === 'water';
  c.save();
  c.translate(px, py);
  if (!swim) shadow(c, 0, 0, 14 * s, 5 * s);
  let lift = 0;
  if (a.state === 'play' && ['buck', 'pounce', 'hop'].includes(sp.play)) lift = -Math.abs(Math.sin(a.anim)) * (sp.play === 'hop' ? 12 : 6);
  else if (sp.play === 'hop' && moving) lift = -Math.abs(Math.sin(a.anim * 0.5)) * 7;
  if (moving && !lift) lift = -Math.abs(Math.cos(a.anim)) * 1.2;
  c.translate(0, lift * s);
  c.scale(a.face * s, s);
  if (swim) {
    c.translate(0, 9);
    c.beginPath(); c.rect(-30, -80, 60, 78); c.clip();
  }
  SHADE = true;
  drawAnimalShape(c, a.sp, { anim: a.anim, moving, state: swim ? 'idle' : a.state, sex: a.sex, play: sp.play, id: a.id, baby: a.baby });
  SHADE = false;
  c.restore();
  if (swim) { ell(c, px, py + 7, 9 * s, 3 * s, 'rgba(255,255,255,0.35)'); }
}

// ---------- people ----------
function drawPerson(c, px, py, o) {
  const s = o.kid ? 0.75 : 1;
  SHADE = true;
  c.save();
  c.translate(px, py);
  shadow(c, 0, 0, 5 * s, 2 * s);
  c.scale((o.face || 1) * s, s);
  if (o.balloon) {
    curve(c, 3, -13, 6, -24, 5, -33, 'rgba(60,60,60,0.7)', 0.8);
    ell(c, 5, -38, 4.5, 5.5, o.balloon);
    circ(c, 3.5, -40, 1.3, 'rgba(255,255,255,0.6)');
  }
  const sw = o.moving ? Math.sin(o.t) * 2.5 : 0;
  if (o.sitting) {
    line(c, -1, -8, 4, -8, o.pants, 2.4);
    line(c, 4, -8, 4, -3, o.pants, 2.2);
  } else {
    line(c, -1.5, -9, -1.5 + sw, 0, o.pants, 2.4);
    line(c, 1.5, -9, 1.5 - sw, 0, o.pants, 2.4);
  }
  c.fillStyle = o.shirt;
  c.beginPath(); c.roundRect(-3.6, -17.5, 7.2, 9.5, 2); c.fill();
  line(c, 0, -15, 2.5 - sw * 0.6, -9.5, o.shirt, 2.2);
  if (o.tool === 'broom') {
    line(c, 3, -14, 9 + Math.sin(o.t * 2) * 2, 0, '#8a6a3a', 1.2);
    line(c, 7 + Math.sin(o.t * 2) * 2, 0, 11 + Math.sin(o.t * 2) * 2, 0, '#c9a24a', 2.5);
  } else if (o.tool === 'bucket') {
    line(c, 3, -9, 3, -6, '#666', 0.8);
    c.fillStyle = '#9aa3ab'; c.fillRect(1.5, -6.5, 4, 4);
  }
  if (o.carry === 'burger') { ell(c, 3.5, -11, 2.5, 1.6, '#a0602a'); line(c, 1.5, -11, 5.5, -11, '#5ea040', 0.8); }
  else if (o.carry === 'drink') { c.fillStyle = '#e84a4a'; c.fillRect(2, -14, 3, 4.5); line(c, 3.5, -14, 4.5, -16.5, '#fff', 0.7); }
  else if (o.carry === 'icecream') { poly(c, [[2, -11], [5, -11], [3.5, -7]], '#d9a35a'); circ(c, 3.5, -12, 1.8, '#ffb3cf'); }
  else if (o.carry === 'pizza') { poly(c, [[1.5, -12], [6, -12.5], [3.5, -8.5]], '#f2c94c'); circ(c, 3.6, -11.2, 0.7, '#c0392b'); }
  else if (o.carry === 'popcorn') { c.fillStyle = '#e84a4a'; c.fillRect(2, -13, 3.5, 4); circ(c, 3.7, -13.5, 1.6, '#fffbe8'); }
  else if (o.carry === 'coffee') { c.fillStyle = '#f4ede0'; c.fillRect(2, -13, 3, 3.6); c.fillStyle = '#6b4a2b'; c.fillRect(2, -12, 3, 1.2); }
  if (o.plush) { circ(c, -3.6, -11, 2.2, '#a0703c'); circ(c, -3.6, -14, 1.6, '#a0703c'); circ(c, -4.6, -15.2, 0.7, '#a0703c'); circ(c, -2.6, -15.2, 0.7, '#a0703c'); }
  circ(c, 0, -20.5, 3.3, o.skin);
  ell(c, -0.6, -22.3, 3.5, 2, o.hair);
  circ(c, 1.8, -20.6, 0.55, '#222');
  if (o.hat === 'safari') { ell(c, 0, -23, 5.5, 1.6, '#c8b07a'); ell(c, 0, -24.2, 3.3, 2.2, '#c8b07a'); }
  else if (o.hat === 'sun') { ell(c, 0, -23, 6, 1.5, '#e8d49a'); ell(c, 0, -24, 3.2, 1.8, '#e8d49a'); line(c, -3, -23.6, 3, -23.6, '#c0392b', 0.8); }
  else if (o.hat === 'cap') { ell(c, -0.3, -23.4, 3.6, 1.9, o.shirt); ell(c, 3, -22.5, 2.5, 0.8, o.shirt); }
  c.restore();
  SHADE = false;
}

function drawGuest(c, g, px, py) {
  if (g.flashT > 0) {
    const r = 10 * (g.flashT / 0.3);
    c.save();
    c.globalCompositeOperation = 'lighter';
    ell(c, px + 4 * g.face, py - 18, r, r, 'rgba(255,255,240,0.8)');
    c.restore();
  }
  drawPerson(c, px, py, {
    kid: g.kid, face: g.face, balloon: g.balloon, moving: g.path.length > 0, t: g.anim, sitting: g.state === 'sit',
    pants: g.pants, shirt: g.shirt, skin: g.skin, hair: g.hair, carry: g.carry, hat: g.hat, plush: g.souvenir === 'plush',
  });
}
function drawStaff(c, s, px, py) {
  const keeper = s.role === 'keeper';
  drawPerson(c, px, py, {
    face: s.face, moving: s.path.length > 0, t: s.anim,
    shirt: keeper ? '#b59b5c' : '#3a6fb0', pants: keeper ? '#6b5a3a' : '#2a4f80', skin: '#e0ac69', hair: '#5a3a1a',
    hat: keeper ? 'safari' : 'cap', tool: keeper ? 'bucket' : 'broom',
  });
}

// How far each gate is open: it swings open while a staff member is close by.
const gateState = {};
function gateOpen(key, mx, my) {
  const near = G.staff.some(s => Math.abs(s.x - mx) + Math.abs(s.y - my) < 1.3);
  const prev = gateState[key] || 0, next = clamp(prev + (near ? 0.05 : -0.03), 0, 1);
  if (prev === 0 && next > 0) { const p = tileToScreen(mx, my); if (p.x > 0 && p.x < viewW && p.y > 0 && p.y < viewH) Sound.play('gate'); }
  gateState[key] = next;
  return next * next * (3 - 2 * next);
}

// ---------- main render ----------
const drawList = [];
function render(now) {
  if (terrainDirty) { renderTerrain(); terrainDirty = false; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1f3518';
  ctx.fillRect(0, 0, viewW, viewH);
  const z = cam.zoom;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (viewW / 2 - cam.x * z), dpr * (viewH / 2 - cam.y * z));
  const vx0 = cam.x - viewW / 2 / z - 90, vx1 = cam.x + viewW / 2 / z + 90;
  const vy0 = cam.y - viewH / 2 / z - 40, vy1 = cam.y + viewH / 2 / z + 140;
  const vis = (wx, wy) => wx > vx0 && wx < vx1 && wy > vy0 && wy < vy1;

  ctx.drawImage(terrainCanvas, -TERR_OFF_X, 0);
  drawWaterGlints(ctx, now, vis);
  drawClouds(ctx, now);
  if (UI.showGrid || UI.tool.mode !== 'select') drawGrid(ctx);
  if (UI.sel && UI.sel.kind === 'exhibit') {
    const ex = exhibitByKey(UI.sel.key);
    if (ex) {
      ctx.fillStyle = 'rgba(255,240,150,0.18)';
      for (const i of ex.tiles) { diamond(ctx, isoX(i % MAP_W + 0.5, ((i / MAP_W) | 0) + 0.5), isoY(i % MAP_W + 0.5, ((i / MAP_W) | 0) + 0.5)); ctx.fill(); }
    }
  }

  for (const f of G.food) {
    const px = isoX(f.x, f.y), py = isoY(f.x, f.y);
    if (!vis(px, py)) continue;
    const k = Math.max(0.35, f.amount / 100), col = DIETS[f.diet].color;
    ell(ctx, px, py, 9 * k, 4 * k, 'rgba(0,0,0,0.2)');
    ell(ctx, px, py - 2 * k, 8 * k, 3.5 * k, col);
    ell(ctx, px - 2, py - 3 * k, 4 * k, 2 * k, 'rgba(255,255,255,0.25)');
  }
  for (const d of G.dung) {
    const px = isoX(d.x, d.y), py = isoY(d.x, d.y);
    if (vis(px, py)) { ell(ctx, px, py, 3, 1.6, '#5a3e1f'); ell(ctx, px + 1, py - 1, 1.8, 1.2, '#6e4c27'); }
  }
  for (const l of G.litter) {
    const px = isoX(l.x, l.y), py = isoY(l.x, l.y);
    if (vis(px, py)) { ctx.fillStyle = ['#f4f4f4', '#e84a4a', '#f2c94c'][l.c]; ctx.fillRect(px - 2, py - 1, 4, 2.5); }
  }

  drawList.length = 0;
  for (const o of G.objects.values()) {
    const n = OBJECTS[o.type].size || 1, px = isoX(o.x + n / 2, o.y + n / 2), py = isoY(o.x + n / 2, o.y + n / 2);
    if (vis(px, py)) drawList.push({ d: o.x + o.y + n, k: 0, o, px, py });
  }
  for (let y = 0; y <= MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const v = G.hF[hIdx(x, y)];
    if (!v) continue;
    const px = isoX(x + 0.5, y), py = isoY(x + 0.5, y);
    if (vis(px, py)) drawList.push({ d: x + y + 0.5, k: 1, o: v, c: G.hC[hIdx(x, y)], open: v === 4 ? gateOpen('h' + hIdx(x, y), x + 0.5, y) : 0, x1: isoX(x, y), y1: isoY(x, y), x2: isoX(x + 1, y), y2: isoY(x + 1, y), px, py });
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x <= MAP_W; x++) {
    const v = G.vF[vIdx(x, y)];
    if (!v) continue;
    const px = isoX(x, y + 0.5), py = isoY(x, y + 0.5);
    if (vis(px, py)) drawList.push({ d: x + y + 0.5, k: 1, o: v, c: G.vC[vIdx(x, y)], open: v === 4 ? gateOpen('v' + vIdx(x, y), x, y + 0.5) : 0, x1: isoX(x, y), y1: isoY(x, y), x2: isoX(x, y + 1), y2: isoY(x, y + 1), px, py });
  }
  for (const a of G.animals) { if (a.state === 'shelter') continue; const px = isoX(a.x, a.y), py = isoY(a.x, a.y); if (vis(px, py)) drawList.push({ d: a.x + a.y, k: 2, o: a, px, py }); }
  for (const g of G.guests) {
    if (g.state === 'ride') continue;
    let gx = g.x, gy = g.y;
    const seat = g.state === 'sit' && G.objects.get(g.useObj);
    if (seat) { gx += (seat.x + 0.5 - gx) * 0.72; gy += (seat.y + 0.5 - gy) * 0.72; }
    const px = isoX(gx, gy), py = isoY(gx, gy);
    if (vis(px, py)) drawList.push({ d: gx + gy + (seat ? 0.05 : 0), k: 3, o: g, px, py });
  }
  for (const s of G.staff) { const px = isoX(s.x, s.y), py = isoY(s.x, s.y); if (vis(px, py)) drawList.push({ d: s.x + s.y, k: 4, o: s, px, py }); }
  drawList.push({ d: ENTRANCE.x + ENTRANCE.y + 1.3, k: 5, px: isoX(ENTRANCE.x + 0.5, ENTRANCE.y + 0.5), py: isoY(ENTRANCE.x + 0.5, ENTRANCE.y + 0.5) });
  drawList.sort((a, b) => a.d - b.d);

  const sel = UI.sel && UI.sel.id != null ? UI.sel.id : null;
  for (const it of drawList) {
    if (sel != null && it.k >= 2 && it.k <= 4 && it.o.id === sel) {
      ctx.beginPath(); ctx.ellipse(it.px, it.py, 13, 6, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2; ctx.stroke();
    }
    switch (it.k) {
      case 0: drawObjectSprite(ctx, it.o.type, it.o.v, it.px, it.py, it.o); break;
      case 1: drawFence(ctx, it.o, it.x1, it.y1, it.x2, it.y2, it.c, it.open); break;
      case 2: drawAnimal(ctx, it.o, it.px, it.py); break;
      case 3: drawGuest(ctx, it.o, it.px, it.py); break;
      case 4: drawStaff(ctx, it.o, it.px, it.py); break;
      case 5: drawEntrance(ctx); break;
    }
  }

  drawButterflies(ctx, now, vis);
  drawSkyLife(ctx, now, Math.min(0.1, (now - (render.last || now)) / 1000) * Math.max(1, G.speed || 0));
  render.last = now;
  drawToolPreview(ctx);

  // screen-space overlays
  drawLighting();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawVignette(ctx);
  drawFenceHandles(ctx);
  let bubbles = 0;
  const showGuestBubbles = cam.zoom >= 0.55;
  for (const list of [G.animals, G.staff, G.guests]) {
    for (const e of list) {
      const selected = e.id === sel;
      if (!(e.thoughtT > 0 && e.thought) && !selected) continue;
      if (e.kind === 'guest' && !showGuestBubbles && !selected) continue;
      if (bubbles > 45 && !selected) continue;
      const p = tileToScreen(e.x, e.y);
      if (p.x < -30 || p.y < -30 || p.x > viewW + 30 || p.y > viewH + 60) continue;
      const h = e.kind === 'animal' ? 30 * SPECIES[e.sp].size * (e.baby ? 0.6 : 1) + 12 : 28;
      const icon = e.thought || (e.kind === 'animal' ? (e.happy > 60 ? '🙂' : '😐') : '💭');
      drawBubble(ctx, p.x, p.y - h * cam.zoom, icon);
      bubbles++;
    }
  }
  for (const f of G.floats) {
    const p = tileToScreen(f.x, f.y);
    ctx.globalAlpha = Math.max(0, 1 - f.t / 2.2);
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    const y = p.y - 30 * cam.zoom - f.t * 22;
    ctx.strokeText(f.text, p.x, y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, p.x, y);
    ctx.globalAlpha = 1;
  }
}

function drawBubble(c, x, y, icon) {
  c.fillStyle = 'rgba(255,255,255,0.95)';
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 1;
  c.beginPath(); c.roundRect(x - 13, y - 26, 26, 22, 9); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(x - 3, y - 4.5); c.lineTo(x, y + 1); c.lineTo(x + 3, y - 4.5); c.fill();
  c.font = '14px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#222';
  c.fillText(icon, x, y - 14.5);
  c.textBaseline = 'alphabetic';
}

let waterPattern = null, waterPattern2 = null;
const shoreEdges = [];
function drawWaterGlints(c, now, vis) {
  const t = now / 1000;
  // drifting ripples over every visible water tile
  if (!waterPattern && texCanvases) { waterPattern = c.createPattern(texCanvases.water, 'repeat'); waterPattern2 = c.createPattern(texCanvases.water, 'repeat'); }
  if (waterPattern && waterPattern.setTransform) {
    // two layers of ripples drifting in different directions read as flowing water
    waterPattern.setTransform(new DOMMatrix([1, 0, 0, 1, (t * 14) % TEX, (t * 6) % TEX]));
    waterPattern2.setTransform(new DOMMatrix([1.6, 0.3, -0.3, 1.6, (-t * 9) % (TEX * 1.6), (t * 11) % (TEX * 1.6)]));
    c.save();
    c.beginPath();
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      if (G.tiles[idx(x, y)].t !== 'water') continue;
      const px = isoX(x + 0.5, y + 0.5), py = isoY(x + 0.5, y + 0.5);
      if (!vis(px, py)) continue;
      c.moveTo(px, py - TH / 2); c.lineTo(px + TW / 2, py); c.lineTo(px, py + TH / 2); c.lineTo(px - TW / 2, py); c.closePath();
    }
    c.globalAlpha = 0.6;
    c.fillStyle = waterPattern;
    c.fill();
    c.globalAlpha = 0.35;
    c.fillStyle = waterPattern2;
    c.fill();
    c.restore();
  }
  // foam lapping at the shore
  for (const [ax, ay, bx, by, ph, cx, cy] of shoreEdges) {
    if (!vis(ax, ay)) continue;
    const w = 0.5 + 0.5 * Math.sin(t * 1.8 + ph), k = 0.06 + w * 0.12;
    line(c, ax + (cx - ax) * k, ay + (cy - ay) * k, bx + (cx - bx) * k, by + (cy - by) * k, `rgba(255,255,255,${(0.25 + w * 0.4).toFixed(2)})`, 1.2 + w);
  }
  c.fillStyle = 'rgba(255,255,255,0.35)';
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (G.tiles[idx(x, y)].t !== 'water') continue;
    const px = isoX(x + 0.5, y + 0.5), py = isoY(x + 0.5, y + 0.5);
    if (!vis(px, py)) continue;
    const ph = hash2(x, y, 7) * 6.28;
    const a = Math.sin(t * 1.6 + ph);
    if (a > 0.3) c.fillRect(px - 8 + Math.sin(t + ph) * 6, py - 3 + hash2(x, y, 9) * 6, 7 * a, 1);
  }
}

function drawGrid(c) {
  c.strokeStyle = 'rgba(0,0,0,0.09)';
  c.lineWidth = 1;
  c.beginPath();
  for (let x = 0; x <= MAP_W; x++) { c.moveTo(isoX(x, 0), isoY(x, 0)); c.lineTo(isoX(x, MAP_H), isoY(x, MAP_H)); }
  for (let y = 0; y <= MAP_H; y++) { c.moveTo(isoX(0, y), isoY(0, y)); c.lineTo(isoX(MAP_W, y), isoY(MAP_W, y)); }
  c.stroke();
}

function outlineTile(c, x, y, color, fill) {
  diamond(c, isoX(x + 0.5, y + 0.5), isoY(x + 0.5, y + 0.5));
  if (fill) { c.fillStyle = fill; c.fill(); }
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.stroke();
}

function drawToolPreview(c) {
  const h = UI.hover, tool = UI.tool;
  UI.tip = '';
  UI.tipBad = false;
  if (!h || !inMap(h.x, h.y)) return;
  switch (tool.mode) {
    case 'terrain':
      {
        let n = 0;
        for (const [x, y] of brushTiles(h.x, h.y)) {
          outlineTile(c, x, y, 'rgba(255,255,255,0.6)', TERRAIN[tool.key].color + 'aa');
          if (G.tiles[idx(x, y)].t !== tool.key) n++;
        }
        UI.tip = n ? money(n * TERRAIN[tool.key].cost) : '';
      }
      break;
    case 'path':
      outlineTile(c, h.x, h.y, '#fff', 'rgba(201,181,151,0.75)');
      UI.tip = G.tiles[idx(h.x, h.y)].path ? '' : money(PATH_COST);
      break;
    case 'fence': {
      const ghost = segs => {
        c.globalAlpha = 0.8;
        for (const [k, i] of segs) {
          const [ax, ay, bx, by] = segEnds(k, i);
          line(c, isoX(ax, ay), isoY(ax, ay), isoX(bx, by), isoY(bx, by), '#ffe066', 3);
          drawFence(c, tool.key, isoX(ax, ay), isoY(ax, ay), isoX(bx, by), isoY(bx, by));
        }
        c.globalAlpha = 1;
      };
      if (tool.fenceMode !== 'pieces') {
        for (const i of UI.fenceArea) outlineTile(c, i % MAP_W, (i / MAP_W) | 0, 'rgba(255,224,102,0.9)', 'rgba(255,224,102,0.35)');
        outlineTile(c, h.x, h.y, '#ffffff', UI.fenceArea.size ? null : 'rgba(255,255,255,0.25)');
        const segs = areaSegs();
        ghost(segs);
        UI.tip = segs.length ? `${money(segs.length * FENCES[tool.key].cost)} · press Build fence` : 'Paint the exhibit area';
        break;
      }
      if (UI.pieceTile) outlineTile(c, UI.pieceTile.x, UI.pieceTile.y, '#ffe066', 'rgba(255,224,102,0.3)');
      if (UI.hoverF && !UI.pieceTile) {
        let segs;
        if (UI.fenceDown) {
          const v0 = { x: Math.round(UI.fenceDown.x), y: Math.round(UI.fenceDown.y) }, v1 = { x: Math.round(UI.hoverF.x), y: Math.round(UI.hoverF.y) };
          segs = v0.x === v1.x && v0.y === v1.y ? [nearestEdge(UI.fenceDown.x, UI.fenceDown.y)] : lineSegs(v0.x, v0.y, v1.x, v1.y);
        } else segs = [nearestEdge(UI.hoverF.x, UI.hoverF.y)];
        segs = segs.filter(Boolean);
        ghost(segs);
        UI.tip = `${money(segs.length * FENCES[tool.key].cost)} · ${segs.length} piece${segs.length === 1 ? '' : 's'}`;
      }
      break;
    }
    case 'object': {
      const err = canPlaceObject(h.x, h.y, tool.key);
      UI.tip = err || money(OBJECTS[tool.key].cost);
      UI.tipBad = !!err;
      for (const [fx, fy] of footprint(tool.key, h.x, h.y)) outlineTile(c, fx, fy, err ? '#ff5050' : '#7dff7d', err ? 'rgba(255,60,60,0.25)' : 'rgba(120,255,120,0.2)');
      c.globalAlpha = 0.65;
      const n = OBJECTS[tool.key].size || 1;
      drawObjectSprite(c, tool.key, 0.5, isoX(h.x + n / 2, h.y + n / 2), isoY(h.x + n / 2, h.y + n / 2), null);
      c.globalAlpha = 1;
      break;
    }
    case 'animal': {
      const err = canPlaceAnimal(h.x, h.y, tool.key);
      UI.tip = err || money(SPECIES[tool.key].cost);
      UI.tipBad = !!err;
      outlineTile(c, h.x, h.y, err ? '#ff5050' : '#7dff7d', err ? 'rgba(255,60,60,0.25)' : 'rgba(120,255,120,0.2)');
      c.globalAlpha = 0.65;
      drawAnimal(c, { sp: tool.key, x: h.x + 0.5, y: h.y + 0.5, path: [], state: 'idle', anim: 0, face: 1, sex: 'M', id: 0, baby: false },
        isoX(h.x + 0.5, h.y + 0.5), isoY(h.x + 0.5, h.y + 0.5));
      c.globalAlpha = 1;
      break;
    }
    case 'bulldoze':
      outlineTile(c, h.x, h.y, '#ff5050', 'rgba(255,60,60,0.3)');
      break;
    default:
      outlineTile(c, h.x, h.y, 'rgba(255,255,255,0.5)');
  }
}

function brushTiles(cx, cy) {
  const r = UI.tool.brush - 1, out = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (inMap(x, y)) out.push([x, y]);
  return out;
}

// Small preview images for the build palette.
function drawThumb(cv, kind, key) {
  const W = 64, H = 56, r = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * r; cv.height = H * r;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const c = cv.getContext('2d');
  c.scale(r, r);
  c.translate(W / 2, H - 12);
  const flat = () => { diamond(c, 0, 0, 26, 13); };
  switch (kind) {
    case 'terrain':
      flat(); c.fillStyle = TERRAIN[key].color; c.fill();
      for (let k = 0; k < 14; k++) { c.fillStyle = TERRAIN[key].speck[k % 3]; c.fillRect(-14 + hash2(k, 1) * 28, -6 + hash2(k, 2) * 12, 2, 1.5); }
      break;
    case 'path':
      flat(); c.fillStyle = '#c9b597'; c.fill(); c.strokeStyle = '#8f7a5a'; c.lineWidth = 1.5; c.stroke();
      break;
    case 'fence':
      flat(); c.fillStyle = '#6fa64a'; c.fill();
      drawFence(c, +key, -26, 0, 0, -13);
      drawFence(c, +key, 0, -13, 26, 0);
      break;
    case 'object': {
      const big = OBJECTS[key].size === 2 ? 1.75 : OBJECTS[key].cat === 'foliage' && !['tallgrass', 'fern', 'bush'].includes(key) ? 1.3 : 1;
      const k = ({ ferris: 0.5, swings: 0.62, carousel: 0.66, playground: 0.75, giftshop: 0.68 }[key] ||
        (['rockcave', 'icecave', 'hut', 'burger', 'drinks', 'restroom', 'acacia', 'palm', 'eucalyptus', 'pizza', 'gardenfountain'].includes(key) ? 0.72 : 0.95)) / big;
      if (key === 'ferris' || key === 'swings') c.translate(0, 6);
      c.scale(k, k);
      drawObjectSprite(c, key, 0.5, 0, 0);
      break;
    }
    case 'animal': {
      const s = SPECIES[key].size;
      c.scale(1.25 / Math.max(1, s * 0.85), 1.25 / Math.max(1, s * 0.85));
      drawAnimal(c, { sp: key, x: -5, y: -5, path: [], state: 'idle', anim: 0, face: 1, sex: 'M', id: 1, baby: false }, 0, 0);
      break;
    }
    case 'staff':
      c.scale(1.6, 1.6);
      drawStaff(c, { role: key, face: 1, path: [], anim: 0 }, 0, 0);
      break;
  }
}
