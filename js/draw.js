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
function ell(c, x, y, rx, ry, fill, rot = 0) {
  c.beginPath();
  c.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}
function circ(c, x, y, r, fill) { ell(c, x, y, r, r, fill); }
function shadow(c, x, y, rx, ry = rx / 2.4) { ell(c, x, y, rx, ry, 'rgba(0,0,0,0.22)'); }
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
function renderTerrain() {
  if (!terrainCanvas) {
    terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = (MAP_W + MAP_H) * TW / 2;
    terrainCanvas.height = (MAP_W + MAP_H) * TH / 2 + 2;
  }
  const c = terrainCanvas.getContext('2d');
  c.clearRect(0, 0, terrainCanvas.width, terrainCanvas.height);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = G.tiles[idx(x, y)], T = TERRAIN[t.t];
      const px = isoX(x + 0.5, y + 0.5) + TERR_OFF_X, py = isoY(x + 0.5, y + 0.5);
      diamond(c, px, py, TW / 2 + 0.6, TH / 2 + 0.3);
      c.fillStyle = T.color;
      c.fill();
      for (let k = 0; k < 12; k++) {
        const u = 0.08 + hash2(x, y, k) * 0.84, v = 0.08 + hash2(x, y, k + 40) * 0.84;
        const sx = isoX(x + u, y + v) + TERR_OFF_X, sy = isoY(x + u, y + v);
        c.fillStyle = T.speck[k % 3];
        if (t.t === 'water') { if (k < 4) c.fillRect(sx - 3, sy, 6, 1); }
        else if (t.t === 'grass' || t.t === 'savannah' || t.t === 'rainforest') c.fillRect(sx, sy - 2, 1, 3);
        else c.fillRect(sx, sy, 2, 1);
      }
      if (t.path) {
        diamond(c, px, py, TW / 2 - 2, TH / 2 - 1);
        c.fillStyle = '#c9b597';
        c.fill();
        for (let k = 0; k < 9; k++) {
          const u = 0.15 + hash2(x, y, k + 90) * 0.7, v = 0.15 + hash2(x, y, k + 130) * 0.7;
          c.fillStyle = k % 2 ? '#b8a383' : '#d8c7aa';
          c.fillRect(isoX(x + u, y + v) + TERR_OFF_X, isoY(x + u, y + v), 3, 1.5);
        }
      }
    }
  }
  // borders between terrains, shorelines and path kerbs
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const t = G.tiles[idx(x, y)], corners = tileCorners(x, y, TERR_OFF_X);
      DIRS.forEach(([dx, dy], d) => {
        const n = tileAt(x + dx, y + dy);
        if (!n) return;
        const [a, b] = edgeOf(corners, d);
        if (t.path && !n.path) {
          const cx = isoX(x + 0.5, y + 0.5) + TERR_OFF_X, cy = isoY(x + 0.5, y + 0.5);
          const k = 0.07;
          line(c, a[0] + (cx - a[0]) * k, a[1] + (cy - a[1]) * k, b[0] + (cx - b[0]) * k, b[1] + (cy - b[1]) * k, '#8f7a5a', 2);
        } else if (t.t === 'water' && n.t !== 'water') {
          line(c, a[0], a[1], b[0], b[1], 'rgba(230,242,248,0.85)', 2.5);
        } else if (n.t !== t.t && !t.path && !n.path) {
          line(c, a[0], a[1], b[0], b[1], 'rgba(0,0,0,0.10)', 1);
        }
      });
    }
  }
}

// ---------- fences ----------
function drawFence(c, type, x1, y1, x2, y2) {
  const vertical = (x2 - x1) * (y2 - y1) > 0; // runs down-right on screen
  if (type === 3) {
    const h = 13;
    poly(c, [[x1, y1], [x2, y2], [x2, y2 - h], [x1, y1 - h]], vertical ? '#8f8a80' : '#a39e94');
    c.strokeStyle = 'rgba(0,0,0,0.18)';
    c.lineWidth = 1;
    for (const k of [h / 3, 2 * h / 3]) { c.beginPath(); c.moveTo(x1, y1 - k); c.lineTo(x2, y2 - k); c.stroke(); }
    line(c, x1, y1 - h, x2, y2 - h, '#c4bfb5', 3);
  } else if (type === 2) {
    const h = 15;
    for (const f of [0, 0.5, 1]) {
      const px = x1 + (x2 - x1) * f, py = y1 + (y2 - y1) * f;
      line(c, px, py, px, py - h, '#6b4526', 3);
    }
    line(c, x1, y1 - h * 0.4, x2, y2 - h * 0.4, '#9a6a3a', 2.5);
    line(c, x1, y1 - h * 0.85, x2, y2 - h * 0.85, '#a87644', 2.5);
  } else {
    const h = 17;
    poly(c, [[x1, y1], [x2, y2], [x2, y2 - h], [x1, y1 - h]], 'rgba(190,198,205,0.32)');
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

// ---------- objects ----------
function drawObjectSprite(c, type, v, px, py) {
  const s = 0.85 + v * 0.3;
  c.save();
  c.translate(px, py);
  switch (type) {
    case 'acacia':
      shadow(c, 5, 0, 24 * s, 8 * s);
      c.scale(s, s);
      curve(c, 0, 0, -3, -15, 2, -30, '#6b4a2b', 3.5);
      line(c, 1, -22, -11, -32, '#6b4a2b', 2);
      line(c, 2, -26, 12, -34, '#6b4a2b', 2);
      ell(c, 0, -36, 28, 7, '#4f6a2c');
      ell(c, -2, -39, 24, 6, '#68893a');
      ell(c, 4, -41, 15, 4, '#7fa547');
      break;
    case 'palm': {
      shadow(c, 6, 0, 16 * s, 6 * s);
      c.scale(s, s);
      for (let i = 0; i < 7; i++) ell(c, i * 1.1, -i * 6.5 - 2, 3.2, 3.6, i % 2 ? '#8b6b43' : '#76593a');
      const tx = 7, ty = -46;
      const sw = Math.sin(performance.now() / 900 + v * 10) * 1.5;
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI + k * (Math.PI / 6);
        const ex = tx + Math.cos(a) * 22, ey = ty + Math.sin(a) * 8 + 10;
        curve(c, tx, ty, tx + Math.cos(a) * 12, ty - 8 + sw, ex, ey, k % 2 ? '#3f8f3a' : '#2f7a30', 4);
      }
      circ(c, tx - 2, ty + 3, 2.2, '#5a3d1e');
      circ(c, tx + 2, ty + 3, 2.2, '#6b4a26');
      break;
    }
    case 'pine':
      shadow(c, 4, 0, 14 * s, 6 * s);
      c.scale(s, s * 1.1);
      c.fillStyle = '#5b3e25';
      c.fillRect(-2, -10, 4, 10);
      for (let i = 0; i < 3; i++) {
        const y0 = -6 - i * 12, w = 15 - i * 4;
        poly(c, [[-w, y0], [w, y0], [0, y0 - 20]], '#356b40');
        poly(c, [[-w, y0], [0, y0], [0, y0 - 20]], '#2a5734');
      }
      break;
    case 'oak':
      shadow(c, 4, 0, 18 * s, 7 * s);
      c.scale(s, s);
      c.fillStyle = '#6b4a2b';
      c.fillRect(-3, -18, 6, 18);
      circ(c, -9, -25, 10, '#3a7330');
      circ(c, 9, -25, 10, '#3a7330');
      circ(c, 0, -34, 12, '#478838');
      circ(c, -4, -29, 9, '#549a42');
      circ(c, 5, -37, 5, '#68b052');
      break;
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
    case 'bush':
      shadow(c, 0, 0, 14 * s, 5 * s);
      c.scale(s, s);
      circ(c, -6, -6, 7, '#3d7a35');
      circ(c, 6, -6, 7, '#3d7a35');
      circ(c, 0, -11, 8, '#4d8f40');
      circ(c, -2, -12, 4, '#62a650');
      break;
    case 'rock': case 'icerock': {
      const ice = type === 'icerock';
      shadow(c, 0, 1, 16 * s, 6 * s);
      c.scale(s, s);
      const pts = [[-14, 0], [-12, -10], [-4, -16], [8, -14], [14, -5], [12, 2], [-6, 3]];
      poly(c, pts, ice ? '#cfe6f2' : '#8a8780', ice ? '#9cc3d9' : '#5e5b55');
      poly(c, [[-12, -10], [-4, -16], [8, -14], [2, -8], [-6, -6]], ice ? '#f4fbff' : '#a8a59d');
      break;
    }
    case 'rockcave': case 'icecave': {
      const ice = type === 'icecave';
      shadow(c, 0, 2, 34, 12);
      poly(c, [[-30, 2], [-28, -14], [-16, -28], [2, -33], [20, -27], [30, -11], [30, 4], [0, 10]], ice ? '#d7ebf5' : '#7d776e', ice ? '#a6c9dc' : '#57524b');
      poly(c, [[-26, -12], [-16, -26], [2, -31], [10, -22], [-6, -16]], ice ? '#f7fcff' : '#958f85');
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
      shadow(c, 0, 0, 8, 3);
      const b = Math.abs(Math.sin(performance.now() / 400 + v * 6)) * 2;
      circ(c, 0, -8 - b, 8, '#e04848');
      c.beginPath(); c.arc(0, -8 - b, 8, -0.3, 1.3); c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.stroke();
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

// ---------- animals ----------
function legs(c, xs, y0, len, color, t, moving, w) {
  xs.forEach((x, i) => {
    const sw = moving ? Math.sin(t + (i % 2) * Math.PI) * 3 : 0;
    line(c, x, y0, x + sw, y0 + len, color, w);
  });
}

function catShape(c, o, col) {
  const { anim: t, moving, state } = o;
  if (state === 'rest') {
    ell(c, 0, -5, 14, 5, col.body);
    curve(c, -13, -4, -20, -2, -22, -6, col.dark, 2);
    if (col.mane && o.sex === 'M') circ(c, 11, -9, 7, col.mane);
    circ(c, 13, -9, 5, col.body);
    ell(c, 17, -7, 3, 2.5, col.muzzle);
    line(c, 13, -10, 15, -10, '#222', 1);
    return;
  }
  const pounce = state === 'play' && o.play === 'pounce';
  const roar = state === 'play' && o.play === 'roar';
  if (pounce) c.rotate(-0.25 * Math.abs(Math.sin(t)));
  legs(c, [-9, -5, 6, 10], -8, 9, col.dark, t, moving, 3);
  curve(c, -13, -12, -22, -8, -21, -18 + Math.sin(t * 0.7) * 2, col.dark, 2);
  if (col.mane) circ(c, -21, -18 + Math.sin(t * 0.7) * 2, 2, col.mane);
  ell(c, 0, -12, 14, 6, col.body);
  ell(c, 1, -9, 10, 3, col.belly);
  if (col.stripes) {
    c.save();
    c.beginPath(); c.ellipse(0, -12, 14, 6, 0, 0, Math.PI * 2); c.clip();
    for (let x = -10; x <= 10; x += 4) curve(c, x, -18, x + 2, -12, x - 1, -7, '#2b1a0f', 1.6);
    c.restore();
  }
  c.save();
  if (roar) { c.translate(13, -15); c.rotate(-0.35); c.translate(-13, 15); }
  if (col.mane && o.sex === 'M') circ(c, 11, -16, 8, col.mane);
  circ(c, 13, -15, 5.2, col.body);
  circ(c, 11, -20, 2, col.body);
  ell(c, 17, -13, 3.2, 2.6, col.muzzle);
  circ(c, 19.5, -14, 1, '#2b1a0f');
  circ(c, 14.5, -17, 1, '#111');
  if (roar) ell(c, 18, -11, 2.5, 2, '#5a1010');
  c.restore();
}

const ANIMAL_SHAPES = {
  lion(c, o) { catShape(c, o, { body: '#c99a4b', belly: '#dbb672', dark: '#b4863e', muzzle: '#e6c993', mane: '#7a4a1f' }); },
  tiger(c, o) { catShape(c, o, { body: '#e0862a', belly: '#f6efe2', dark: '#c46f1d', muzzle: '#f6efe2', stripes: true }); },
  elephant(c, o) {
    const { anim: t, moving, state } = o;
    const play = state === 'play';
    if (state === 'rest') {
      ell(c, 0, -9, 15, 8, '#8e9097');
      circ(c, 13, -11, 6, '#8e9097');
      ell(c, 10, -11, 4.5, 6.5, '#7a7c83');
      curve(c, 17, -9, 20, -3, 23, -2, '#8e9097', 3.5);
      return;
    }
    c.fillStyle = '#7d7f86';
    [-9, -4, 5, 10].forEach((x, i) => {
      const sw = moving ? Math.sin(t + (i % 2) * Math.PI) * 2 : 0;
      c.fillRect(x + sw - 2.5, -10, 5, 10);
    });
    curve(c, -14, -18, -17, -12, -16, -7, '#7d7f86', 1.5);
    ell(c, 0, -17, 14, 9, '#8e9097');
    if (play) c.rotate(-0.12);
    circ(c, 13, -19, 6.5, '#8e9097');
    ell(c, 9.5, -18, 5, 7.5, '#7a7c83', 0.15);
    if (play) curve(c, 18, -18, 25, -24, 23, -33, '#8e9097', 3.5);
    else curve(c, 18, -16, 22, -9, 20 + Math.sin(t * 0.5), -2, '#8e9097', 3.5);
    line(c, 16, -14, 20, -13, '#f4f1e6', 1.5);
    circ(c, 15, -21, 1, '#111');
  },
  giraffe(c, o) {
    const { anim: t, moving, state } = o;
    if (state === 'rest') {
      ell(c, 0, -7, 11, 5, '#e0a64e');
      line(c, 7, -9, 12, -26, '#e0a64e', 4.5);
      ell(c, 14, -27, 5, 2.6, '#e0a64e');
      ell(c, -3, -7, 2, 1.5, '#8a5124'); ell(c, 3, -8, 2, 1.5, '#8a5124');
      return;
    }
    legs(c, [-7, -4, 5, 8], -15, 15, '#d39645', t, moving, 2);
    curve(c, -10, -19, -13, -15, -12, -10, '#8a5124', 1);
    ell(c, 0, -19, 10.5, 6, '#e0a64e');
    for (let k = 0; k < 6; k++) ell(c, -7 + k * 2.8, -20 + (k % 2) * 3, 1.8, 1.4, '#8a5124');
    const sway = state === 'play' ? Math.sin(t) * 4 : 0;
    line(c, 7, -21, 13 + sway, -42, '#e0a64e', 5);
    line(c, 6, -21, 11 + sway, -40, '#8a5124', 1);
    ell(c, 15.5 + sway, -43, 5, 2.8, '#e0a64e', 0.2);
    line(c, 13 + sway, -45, 13 + sway, -49, '#8a5124', 1.2);
    line(c, 15 + sway, -45, 15.5 + sway, -49, '#8a5124', 1.2);
    circ(c, 15 + sway, -44, 0.9, '#111');
  },
  zebra(c, o) {
    const { anim: t, moving, state } = o;
    if (state === 'rest') {
      ell(c, 0, -5, 11, 5, '#f4f4f4');
      for (let x = -8; x <= 8; x += 3) line(c, x, -9, x + 1, -2, '#222', 1.2);
      ell(c, 13, -10, 5, 2.5, '#f4f4f4', -0.4);
      return;
    }
    if (state === 'play') c.rotate(-0.18 * Math.abs(Math.sin(t)));
    legs(c, [-8, -5, 5, 8], -9, 9, '#ececec', t, moving, 2);
    curve(c, -11, -14, -14, -10, -13, -7, '#222', 1.2);
    c.save();
    c.beginPath(); c.ellipse(0, -13, 11, 5.5, 0, 0, Math.PI * 2);
    c.moveTo(7, -14); c.lineTo(13, -23); c.lineTo(16, -21); c.lineTo(10, -12);
    c.fillStyle = '#f4f4f4'; c.fill(); c.clip();
    for (let x = -10; x <= 16; x += 2.6) line(c, x, -24, x - 1, -6, '#222', 1.1);
    c.restore();
    ell(c, 16, -21, 5, 2.4, '#f4f4f4', 0.35);
    ell(c, 19.5, -19.5, 1.8, 1.6, '#333');
    line(c, 9, -16, 13.5, -24, '#222', 1.6);
    circ(c, 15, -22, 0.8, '#111');
  },
  gorilla(c, o) {
    const { anim: t, moving, state } = o;
    const silver = o.sex === 'M';
    if (state === 'play') {
      ell(c, 0, -14, 7.5, 10, '#2f2f33');
      ell(c, 2, -14, 4, 6, '#4a4048');
      const thump = Math.sin(t * 2) > 0;
      line(c, -5, -18, thump ? 1 : -9, thump ? -16 : -10, '#2f2f33', 4);
      line(c, 6, -18, thump ? 0 : 10, thump ? -15 : -10, '#2f2f33', 4);
      circ(c, 1, -27, 5, '#2f2f33');
      ell(c, 2.5, -26, 3, 3, '#5a4a42');
      line(c, -3, -5, -3, 0, '#2f2f33', 4); line(c, 3, -5, 3, 0, '#2f2f33', 4);
      return;
    }
    if (state === 'rest') {
      ell(c, 0, -8, 9, 8, '#2f2f33');
      if (silver) ell(c, -2, -11, 6, 3, '#8a8a90');
      circ(c, 6, -15, 5, '#2f2f33');
      ell(c, 8, -14, 3, 3, '#5a4a42');
      return;
    }
    const sw = moving ? Math.sin(t) * 3 : 0;
    line(c, -6, -7, -6 + sw, 0, '#2f2f33', 4);
    line(c, -2, -7, -2 - sw, 0, '#2f2f33', 4);
    ell(c, -1, -11, 10, 8, '#2f2f33');
    if (silver) ell(c, -3, -15, 7, 3.5, '#8a8a90');
    line(c, 7, -13, 9 - sw, 0, '#2f2f33', 4.5);
    circ(c, 9, -18, 5, '#2f2f33');
    ell(c, 11, -17, 3, 3, '#5a4a42');
    circ(c, 11, -19, 0.8, '#111');
  },
  grizzly(c, o) {
    const { anim: t, moving, state } = o;
    if (state === 'play') {
      ell(c, 0, -18, 8, 12, '#6e4628');
      line(c, -6, -22, -12, -27, '#6e4628', 4); line(c, 6, -22, 12, -27, '#6e4628', 4);
      line(c, -3, -7, -4, 0, '#5b3a21', 4); line(c, 3, -7, 4, 0, '#5b3a21', 4);
      circ(c, 0, -32, 5.5, '#6e4628');
      circ(c, -4, -36, 2, '#6e4628'); circ(c, 4, -36, 2, '#6e4628');
      ell(c, 1, -30, 2.5, 2, '#a07850');
      return;
    }
    if (state === 'rest') {
      ell(c, 0, -6, 13, 6, '#6e4628');
      circ(c, 12, -7, 5, '#6e4628');
      ell(c, 15, -6, 2.5, 2, '#a07850');
      return;
    }
    c.fillStyle = '#5b3a21';
    [-9, -5, 5, 9].forEach((x, i) => {
      const sw = moving ? Math.sin(t + (i % 2) * Math.PI) * 2 : 0;
      c.fillRect(x + sw - 2, -8, 4, 8);
    });
    ell(c, 0, -12, 13, 7.5, '#6e4628');
    ell(c, -2, -17, 7, 4, '#7a5132');
    circ(c, 12, -14, 5.5, '#6e4628');
    circ(c, 10, -19, 2, '#6e4628'); circ(c, 14, -19, 2, '#6e4628');
    ell(c, 16.5, -12.5, 3, 2.5, '#a07850');
    circ(c, 18.5, -13, 1, '#111');
    circ(c, 13.5, -15.5, 0.9, '#111');
  },
  penguin(c, o) {
    const { anim: t, moving, state } = o;
    if (state === 'play') {
      c.rotate(-0.1);
      ell(c, 0, -5, 11, 4.5, '#1d1f26');
      ell(c, 1, -3.5, 8, 2.5, '#f6f6f2');
      circ(c, 11, -7, 3.5, '#1d1f26');
      poly(c, [[14, -7.5], [18, -7], [14, -6]], '#e07a2c');
      return;
    }
    if (moving) c.rotate(Math.sin(t) * 0.12);
    ell(c, 2, 0, 4, 1.5, '#f0a030');
    ell(c, 0, -11, 6, 11, '#1d1f26');
    ell(c, 2, -10, 4, 8.5, '#f6f6f2');
    circ(c, 1, -22, 4.5, '#1d1f26');
    ell(c, 3, -20, 2, 1.5, '#f2c230');
    poly(c, [[5, -23], [9.5, -22], [5, -21]], '#e07a2c');
    circ(c, 3, -23, 0.9, '#fff');
    const flap = state === 'idle' ? Math.sin(G.time * 3 + o.id) * 1.5 : 0;
    line(c, -3, -16, -6 + flap, -8, '#1d1f26', 2.5);
  },
};

function drawAnimalShape(c, sp, o) { ANIMAL_SHAPES[sp](c, o); }

function drawAnimal(c, a, px, py) {
  const sp = SPECIES[a.sp], s = sp.size * (a.baby ? 0.6 : 1);
  const moving = a.path.length > 0;
  const tile = tileAt(Math.floor(a.x), Math.floor(a.y));
  const swim = sp.swims && tile && tile.t === 'water';
  c.save();
  c.translate(px, py);
  if (!swim) shadow(c, 0, 0, 14 * s, 5 * s);
  let lift = 0;
  if (a.state === 'play' && (sp.play === 'buck' || sp.play === 'pounce')) lift = -Math.abs(Math.sin(a.anim)) * 6;
  c.translate(0, lift * s);
  c.scale(a.face * s, s);
  if (swim) {
    c.translate(0, 9);
    c.beginPath(); c.rect(-30, -80, 60, 78); c.clip();
  }
  drawAnimalShape(c, a.sp, { anim: a.anim, moving, state: swim ? 'idle' : a.state, sex: a.sex, play: sp.play, id: a.id });
  c.restore();
  if (swim) { ell(c, px, py + 7, 9 * s, 3 * s, 'rgba(255,255,255,0.35)'); }
}

// ---------- people ----------
function drawPerson(c, px, py, o) {
  const s = o.kid ? 0.75 : 1;
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
  circ(c, 0, -20.5, 3.3, o.skin);
  ell(c, -0.6, -22.3, 3.5, 2, o.hair);
  circ(c, 1.8, -20.6, 0.55, '#222');
  if (o.hat === 'safari') { ell(c, 0, -23, 5.5, 1.6, '#c8b07a'); ell(c, 0, -24.2, 3.3, 2.2, '#c8b07a'); }
  else if (o.hat === 'cap') { ell(c, -0.3, -23.4, 3.6, 1.9, o.shirt); ell(c, 3, -22.5, 2.5, 0.8, o.shirt); }
  c.restore();
}

function drawGuest(c, g, px, py) {
  drawPerson(c, px, py, {
    kid: g.kid, face: g.face, balloon: g.balloon, moving: g.path.length > 0, t: g.anim, sitting: g.state === 'sit',
    pants: g.pants, shirt: g.shirt, skin: g.skin, hair: g.hair, carry: g.carry,
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
    const px = isoX(o.x + 0.5, o.y + 0.5), py = isoY(o.x + 0.5, o.y + 0.5);
    if (vis(px, py)) drawList.push({ d: o.x + o.y + 1, k: 0, o, px, py });
  }
  for (let y = 0; y <= MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const v = G.hF[hIdx(x, y)];
    if (!v) continue;
    const px = isoX(x + 0.5, y), py = isoY(x + 0.5, y);
    if (vis(px, py)) drawList.push({ d: x + y + 0.5, k: 1, o: v, x1: isoX(x, y), y1: isoY(x, y), x2: isoX(x + 1, y), y2: isoY(x + 1, y), px, py });
  }
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x <= MAP_W; x++) {
    const v = G.vF[vIdx(x, y)];
    if (!v) continue;
    const px = isoX(x, y + 0.5), py = isoY(x, y + 0.5);
    if (vis(px, py)) drawList.push({ d: x + y + 0.5, k: 1, o: v, x1: isoX(x, y), y1: isoY(x, y), x2: isoX(x, y + 1), y2: isoY(x, y + 1), px, py });
  }
  for (const a of G.animals) { const px = isoX(a.x, a.y), py = isoY(a.x, a.y); if (vis(px, py)) drawList.push({ d: a.x + a.y, k: 2, o: a, px, py }); }
  for (const g of G.guests) { const px = isoX(g.x, g.y), py = isoY(g.x, g.y); if (vis(px, py)) drawList.push({ d: g.x + g.y, k: 3, o: g, px, py }); }
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
      case 0: drawObjectSprite(ctx, it.o.type, it.o.v, it.px, it.py); break;
      case 1: drawFence(ctx, it.o, it.x1, it.y1, it.x2, it.y2); break;
      case 2: drawAnimal(ctx, it.o, it.px, it.py); break;
      case 3: drawGuest(ctx, it.o, it.px, it.py); break;
      case 4: drawStaff(ctx, it.o, it.px, it.py); break;
      case 5: drawEntrance(ctx); break;
    }
  }

  drawToolPreview(ctx);

  // screen-space overlays
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

function drawWaterGlints(c, now, vis) {
  const t = now / 1000;
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
  if (!h || !inMap(h.x, h.y)) return;
  switch (tool.mode) {
    case 'terrain':
      for (const [x, y] of brushTiles(h.x, h.y)) outlineTile(c, x, y, 'rgba(255,255,255,0.6)', TERRAIN[tool.key].color + 'aa');
      break;
    case 'path':
      outlineTile(c, h.x, h.y, '#fff', 'rgba(201,181,151,0.75)');
      break;
    case 'fence': {
      const a = UI.dragStart || h;
      const x0 = Math.min(a.x, h.x), x1 = Math.max(a.x, h.x), y0 = Math.min(a.y, h.y), y1 = Math.max(a.y, h.y);
      c.globalAlpha = 0.75;
      for (let x = x0; x <= x1; x++) {
        drawFence(c, tool.key, isoX(x, y0), isoY(x, y0), isoX(x + 1, y0), isoY(x + 1, y0));
        drawFence(c, tool.key, isoX(x, y1 + 1), isoY(x, y1 + 1), isoX(x + 1, y1 + 1), isoY(x + 1, y1 + 1));
      }
      for (let y = y0; y <= y1; y++) {
        drawFence(c, tool.key, isoX(x0, y), isoY(x0, y), isoX(x0, y + 1), isoY(x0, y + 1));
        drawFence(c, tool.key, isoX(x1 + 1, y), isoY(x1 + 1, y), isoX(x1 + 1, y + 1), isoY(x1 + 1, y + 1));
      }
      c.globalAlpha = 1;
      const n = 2 * (x1 - x0 + 1) + 2 * (y1 - y0 + 1);
      UI.previewCost = n * FENCES[tool.key].cost;
      break;
    }
    case 'object': {
      const err = canPlaceObject(h.x, h.y, tool.key);
      outlineTile(c, h.x, h.y, err ? '#ff5050' : '#7dff7d', err ? 'rgba(255,60,60,0.25)' : 'rgba(120,255,120,0.2)');
      c.globalAlpha = 0.65;
      drawObjectSprite(c, tool.key, 0.5, isoX(h.x + 0.5, h.y + 0.5), isoY(h.x + 0.5, h.y + 0.5));
      c.globalAlpha = 1;
      break;
    }
    case 'animal': {
      const err = canPlaceAnimal(h.x, h.y, tool.key);
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
      const big = ['rockcave', 'icecave', 'hut', 'burger', 'drinks', 'restroom', 'acacia', 'palm'].includes(key);
      c.scale(big ? 0.72 : 0.95, big ? 0.72 : 0.95);
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
