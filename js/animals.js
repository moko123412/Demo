'use strict';
// Animal sprites. Most species share one anatomical quadruped (curved body
// outline, tapered jointed legs, neck, head, tail, coat pattern) configured per
// species; the upright and unusual ones (gorilla, kangaroo, penguin, flamingo)
// have their own drawings. Everything faces right with the feet at y = 0.

// ---------- drawing helpers ----------
function gradV(c, y0, y1, hex, top = 0.24, bot = -0.34) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, tint(hex, top));
  g.addColorStop(0.5, hex);
  g.addColorStop(1, tint(hex, bot));
  return g;
}

// A limb segment that tapers from w1 to w2, rounded at both joints and shaded
// across its width so it reads as a cylinder.
function seg(c, x1, y1, x2, y2, w1, w2, fill) {
  const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  let style = fill;
  if (typeof fill === 'string' && fill.charCodeAt(0) === 35) {
    const g = c.createLinearGradient(x1 + nx * w1 / 2, y1 + ny * w1 / 2, x1 - nx * w1 / 2, y1 - ny * w1 / 2);
    g.addColorStop(0, tint(fill, -0.3));
    g.addColorStop(0.55, fill);
    g.addColorStop(1, tint(fill, 0.18));
    style = g;
  }
  c.fillStyle = style;
  c.beginPath();
  c.moveTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
  c.lineTo(x2 + nx * w2 / 2, y2 + ny * w2 / 2);
  c.lineTo(x2 - nx * w2 / 2, y2 - ny * w2 / 2);
  c.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2);
  c.closePath();
  c.fill();
  c.beginPath(); c.arc(x1, y1, w1 / 2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(x2, y2, w2 / 2, 0, Math.PI * 2); c.fill();
}

// One leg: thigh/forearm, cannon/shin, and a hoof, paw or pad.
function limb(c, P, x, y0, len, ph, moving, front, col) {
  const swing = moving ? Math.sin(ph) : 0, lift = moving ? Math.max(0, Math.cos(ph)) : 0;
  const w = P.legW;
  let kx, ky = y0 + len * 0.5 - lift * len * 0.1, fx, fy = -lift * len * 0.22;
  if (front) { kx = x + swing * len * 0.16 + lift * len * 0.1; fx = x + swing * len * 0.32 - lift * len * 0.12; }
  else { kx = x + swing * len * 0.14 - len * 0.06 - lift * len * 0.08; fx = x + swing * len * 0.3 + lift * len * 0.06; }
  seg(c, x, y0, kx, ky, w * (front ? 1.25 : 1.45), w * 0.95, col);
  seg(c, kx, ky, fx, fy - w * 0.2, w * 0.95, w * 0.7, col);
  if (P.stripedLegs) {
    for (let k = 1; k < 5; k++) {
      const f = k / 5, sx = kx + (fx - kx) * f, sy = ky + (fy - ky) * f;
      line(c, sx - w * 0.4, sy, sx + w * 0.4, sy - 0.3, '#1d1d1f', 0.9);
    }
  }
  ell(c, fx + w * 0.2, fy + 0.2, w * 0.9, w * 0.3, 'rgba(0,0,0,0.25)');
  if (P.foot === 'hoof') {
    poly(c, [[fx - w * 0.45, fy - w * 0.5], [fx + w * 0.45, fy - w * 0.5], [fx + w * 0.6, fy], [fx - w * 0.5, fy]], '#2a2420');
  } else if (P.foot === 'pad') {
    ell(c, fx, fy - w * 0.25, w * 0.62, w * 0.32, tint(P.col.body, -0.15));
    for (let k = -1; k <= 1; k++) circ(c, fx + w * 0.3 + k * w * 0.18, fy - w * 0.1, w * 0.12, '#e8e2d2');
  } else {
    ell(c, fx + w * 0.25, fy - w * 0.28, w * 0.62, w * 0.34, col.charCodeAt ? col : P.col.body);
  }
}

function bodyPath(c, P, base) {
  const L = P.L, D = P.D, top = base - D, sl = P.slope || 0, W = P.withers || 0, sag = P.belly || 0;
  c.beginPath();
  c.moveTo(-L * 0.95, base - D * 0.15);
  c.bezierCurveTo(-L * 1.12, base - D * 0.5, -L * 1.02, top + sl + D * 0.05, -L * 0.7, top + sl);
  c.bezierCurveTo(-L * 0.2, top + sl * 0.5 + D * 0.08, L * 0.2, top + D * 0.06, L * 0.55, top - W);
  c.bezierCurveTo(L * 0.85, top - W * 0.5, L * 1.08, base - D * 0.7, L * 1.0, base - D * 0.35);
  c.bezierCurveTo(L * 0.95, base - D * 0.05, L * 0.7, base + D * 0.06, L * 0.45, base + D * 0.02);
  c.bezierCurveTo(L * 0.1, base + D * 0.08 + sag, -L * 0.4, base + D * 0.06 + sag, -L * 0.7, base - D * 0.02);
  c.bezierCurveTo(-L * 0.8, base - D * 0.05, -L * 0.9, base, -L * 0.95, base - D * 0.15);
  c.closePath();
}

// Neck geometry: base on the shoulders, angle in degrees above horizontal.
function neckGeom(P, base, angle) {
  const N = P.neck, bx = P.L * 0.72, by = base - P.D * 0.72 - (P.withers || 0) * 0.5;
  const a = angle * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a);
  return { bx, by, ex: bx + dx * N.len, ey: by + dy * N.len, dx, dy, nx: -dy, ny: dx };
}

function neckPath(c, P, g) {
  const N = P.neck;
  c.beginPath();
  c.moveTo(g.bx - g.nx * N.w0 / 2 - g.dx * 2, g.by - g.ny * N.w0 / 2 - g.dy * 2);
  c.quadraticCurveTo((g.bx + g.ex) / 2 - g.nx * (N.w0 + N.w1) / 4 - g.nx * 1.2, (g.by + g.ey) / 2 - g.ny * (N.w0 + N.w1) / 4 - g.ny * 1.2,
    g.ex - g.nx * N.w1 / 2, g.ey - g.ny * N.w1 / 2);
  c.lineTo(g.ex + g.nx * N.w1 / 2, g.ey + g.ny * N.w1 / 2);
  c.quadraticCurveTo((g.bx + g.ex) / 2 + g.nx * (N.w0 + N.w1) / 4, (g.by + g.ey) / 2 + g.ny * (N.w0 + N.w1) / 4,
    g.bx + g.nx * N.w0 / 2 + g.dx * 2, g.by + g.ny * N.w0 / 2 + g.dy * 2);
  c.closePath();
}

// Head at (hx, hy) pointing along angle a (degrees below horizontal).
function drawHead(c, P, hx, hy, a, o) {
  const H = P.head, col = P.col, r = a * Math.PI / 180;
  c.save();
  c.translate(hx, hy);
  c.rotate(r);
  // ears behind the skull
  const earX = -H.skull * 0.45, earY = -H.skull * 0.8;
  const ear = (dx, shade) => {
    const ec = shade ? tint(col.ear || col.body, -0.2) : (col.ear || col.body);
    if (P.ears === 'round') { circ(c, earX + dx, earY, H.skull * 0.36, ec); circ(c, earX + dx, earY + 0.3, H.skull * 0.2, col.earIn || tint(col.body, -0.35)); }
    else if (P.ears === 'tall') {
      const flick = Math.sin(G.time * 2 + (o.id || 0)) > 0.95 ? -0.4 : 0;
      c.save(); c.translate(earX + dx, earY + 1); c.rotate(-0.35 + flick);
      ell(c, 0, -H.skull * 0.55, H.skull * 0.26, H.skull * 0.65, ec);
      ell(c, 0, -H.skull * 0.5, H.skull * 0.12, H.skull * 0.45, col.earIn || tint(col.body, -0.3));
      c.restore();
    } else if (P.ears === 'small') circ(c, earX + dx, earY + 0.6, H.skull * 0.24, ec);
  };
  ear(-1.2, true);
  // skull and muzzle
  ell(c, 0, 0, H.skull, H.skull * 0.88, col.head || col.body);
  ell(c, H.snout * 0.62, H.skull * 0.18, H.snout * 0.62, H.muzzleH, col.muzzle || col.head || col.body);
  if (H.snout > H.skull) ell(c, H.snout * 0.3, H.skull * 0.05, H.snout * 0.45, H.muzzleH * 1.05, col.head || col.body);
  ear(0.8, false);
  // nose, mouth and eye
  const nx = H.snout * 1.18, ny = H.skull * 0.1;
  if (P.nose === 'none') { /* the trunk is drawn separately */ } else if (P.nose === 'cat') {
    poly(c, [[nx - 1.6, ny - 1.2], [nx + 0.6, ny - 1.2], [nx - 0.3, ny + 0.3]], col.nose || '#3a2418');
    line(c, nx - 0.3, ny + 0.3, nx - 0.6, ny + H.muzzleH * 0.7, '#3a2418', 0.6);
  } else {
    ell(c, nx - 0.4, ny, Math.max(1, H.muzzleH * 0.42), H.muzzleH * 0.55, col.nose || tint(col.muzzle || col.body, -0.45));
    circ(c, nx - 0.3, ny - 0.2, Math.max(0.5, H.muzzleH * 0.18), '#16100c');
  }
  if (o.mouthOpen) {
    poly(c, [[H.snout * 0.3, H.skull * 0.35], [nx + 0.5, ny + 1], [nx - 1, ny + H.muzzleH * 1.6 * o.mouthOpen], [H.snout * 0.35, H.skull * 0.55]], '#5a1d1d');
    line(c, nx - 1, ny + 1.2, nx - 1.2, ny + 2.4, '#f4f1e6', 0.8);
  } else line(c, H.snout * 0.45, ny + H.muzzleH * 0.75, nx - 0.6, ny + H.muzzleH * 0.6, 'rgba(30,20,10,0.55)', 0.6);
  const ex = H.skull * 0.25, ey = -H.skull * 0.22, er = Math.max(0.8, H.skull * 0.16);
  const blink = Math.sin(G.time * 1.3 + (o.id || 0) * 7) > 0.985;
  if (blink || o.state === 'rest' && o.sleep) line(c, ex - er, ey, ex + er, ey, '#16100c', 0.7);
  else {
    if (P.eye) { circ(c, ex, ey, er * 1.15, P.eye); circ(c, ex + er * 0.1, ey, er * 0.55, '#120c08'); }
    else circ(c, ex, ey, er, '#1a120c');
    circ(c, ex + er * 0.35, ey - er * 0.35, er * 0.32, '#ffffff');
    line(c, ex - er * 1.3, ey - er * 1.1, ex + er * 1.1, ey - er * 1.2, 'rgba(0,0,0,0.35)', 0.5);
  }
  if (P.headExtra) P.headExtra(c, H, o);
  c.restore();
}

function drawTail(c, P, base, o) {
  const T = P.tail, L = P.L, top = base - P.D, ph = performance.now() / 1000 * (o.moving ? 5 : 2.6) + (o.id || 0);
  const amp = (o.moving ? 2.5 : 4.5) * (T.len > 6 ? 1 : 0.4), sw = Math.sin(ph) * amp, tip = Math.sin(ph - 0.9) * amp * 1.6;
  const x0 = -L * 0.95, y0 = top + (P.slope || 0) + P.D * 0.25;
  const x1 = x0 - T.len * 0.35 + sw * 0.4, y1 = y0 + T.len * (T.up ? -0.2 : 0.35), x2 = x0 - T.len * (T.up ? 0.7 : 0.25) + tip, y2 = y0 + T.len * (T.up ? -0.3 : 0.95) - Math.abs(tip) * 0.2;
  c.beginPath();
  c.moveTo(x0, y0);
  c.quadraticCurveTo(x1, y1, x2, y2);
  c.strokeStyle = T.col || P.col.body;
  c.lineWidth = T.w || 1.6;
  c.lineCap = 'round';
  c.stroke();
  if (T.tuft) ell(c, x2, y2 + 1, T.w * 0.9 + 0.6, 2.2, T.tuft, 0.3);
}

// Short hair strokes over the body, sloping back like real fur. Thick-skinned
// animals get faint wrinkles instead.
function hair(c, P, base, o) {
  const L = P.L, D = P.D, top = base - D, seed = (o.id || 1) * 13;
  if (P.skin) {
    for (let k = 0; k < 26; k++) {
      const x = -L + hash2(k, seed) * L * 2, y = top + hash2(k, seed + 1) * D;
      curve(c, x, y, x + 1, y + 0.4, x + 2, y, 'rgba(0,0,0,0.12)', 0.5);
    }
    return;
  }
  const n = P.shaggy ? 70 : 45, len = P.shaggy ? 2.2 : 1.3;
  for (let k = 0; k < n; k++) {
    const x = -L * 1.05 + hash2(k, seed) * L * 2.1, y = top + 0.5 + hash2(k, seed + 1) * D;
    const light = hash2(k, seed + 2) < 0.5;
    line(c, x, y, x - len * 0.6, y + len, light ? 'rgba(255,245,220,0.12)' : 'rgba(40,25,10,0.12)', 0.5);
  }
}

// ---------- coat patterns (clipped to the body or neck) ----------
function coat(c, P, base, kind, o) {
  const L = P.L, D = P.D, top = base - D;
  switch (kind) {
    case 'zebra':
      for (let x = -L * 1.1; x < L * 1.1; x += 2.6) {
        const bend = (x / L) * 2.5;
        c.beginPath();
        c.moveTo(x, top - 3);
        c.bezierCurveTo(x + bend, top + D * 0.3, x - bend * 0.5, base - D * 0.3, x + bend * 0.3, base + 2);
        c.strokeStyle = '#1d1d1f';
        c.lineWidth = 1.2 + Math.abs(Math.sin(x)) * 0.6;
        c.stroke();
      }
      break;
    case 'tiger':
      for (let k = 0; k < 11; k++) {
        const x = -L * 0.95 + k * L * 0.19, len = D * (0.45 + hash2(k, 3) * 0.3);
        c.beginPath();
        c.moveTo(x - 0.8, top - 1);
        c.quadraticCurveTo(x + 1.6, top + len * 0.5, x + 0.4, top + len);
        c.quadraticCurveTo(x + 0.4, top + len * 0.5, x + 1, top - 1);
        c.fillStyle = '#1e140c';
        c.fill();
      }
      break;
    case 'spots':
      for (let k = 0; k < 60; k++) circ(c, -L * 1.05 + hash2(k, 7) * L * 2.1, top + hash2(k, 8) * D * 0.95, 0.55 + hash2(k, 9) * 0.35, '#2a1e10');
      break;
    case 'giraffe': {
      const cell = 4.2;
      for (let gy = top - 4; gy < base + 2; gy += cell) for (let gx = -L * 1.2; gx < L * 1.2; gx += cell) {
        const jx = gx + (hash2(gx * 3, gy * 5, 1) - 0.5) * 1.2, jy = gy + (hash2(gx * 7, gy * 3, 2) - 0.5) * 1.2;
        c.fillStyle = '#9a5a22';
        c.beginPath();
        c.roundRect(jx, jy, cell - 1, cell - 1.1, 1.2);
        c.fill();
      }
      break;
    }
    case 'folds':
      for (const f of [-0.45, 0.35]) curve(c, L * f, top + 1, L * f + 1.5, top + D * 0.5, L * f - 0.5, base, 'rgba(0,0,0,0.18)', 0.9);
      line(c, -L * 0.6, base - D * 0.3, L * 0.6, base - D * 0.25, 'rgba(0,0,0,0.08)', 0.8);
      break;
    case 'fur':
      for (let k = 0; k < 40; k++) {
        const x = -L + hash2(k, 4) * L * 2, y = top + hash2(k, 5) * D;
        line(c, x, y, x - 0.8, y + 1.4, 'rgba(0,0,0,0.13)', 0.6);
      }
      break;
    case 'panda':
      ell(c, L * 0.42, base - D * 0.45, L * 0.32, D * 0.8, '#1d1d22');
      break;
  }
  if (P.col.belly) {
    const g = c.createLinearGradient(0, base - D * 0.45, 0, base + 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, P.col.belly);
    c.fillStyle = g;
    c.fillRect(-L * 1.2, base - D * 0.45, L * 2.4, D * 0.6);
  }
}

// ---------- the shared quadruped ----------
const HERBIVORES = ['elephant', 'giraffe', 'zebra', 'rhino', 'hippo', 'kangaroo', 'camel', 'panda'];
function quadruped(c, P, o) {
  const t = o.anim, moving = o.moving, rest = o.state === 'rest';
  const grazing = !rest && !moving && (o.state === 'drink' || (HERBIVORES.includes(o.sp) && (o.state === 'eat' || (o.state === 'idle' && Math.sin(G.time * 0.45 + (o.id || 0)) > 0.15))));
  const play = o.state === 'play';
  c.save();
  // rearing up (bears stand, horses buck) pivots on the hind feet
  if (play && (P.play === 'stand' || P.play === 'buck')) {
    c.translate(-P.L * 0.7, 0);
    c.rotate(P.play === 'stand' ? -0.95 : -0.3 * Math.abs(Math.sin(t)));
    c.translate(P.L * 0.7, 0);
  }
  const leg = rest ? P.D * 0.16 : P.leg, base = -leg;
  const hindX = -P.L * 0.66, foreX = P.L * 0.6, col = P.col.leg || P.col.body, far = tint(col, -0.22);
  let neckA = P.neck.a, headA = P.head.a;
  if (grazing) { neckA = P.grazeNeck != null ? P.grazeNeck : -35; headA = P.grazeHead != null ? P.grazeHead : 75; }
  if (rest) { neckA = Math.max(10, P.neck.a * 0.6); headA = P.head.a * 0.6; }
  if (moving) { neckA += Math.sin(t * 2) * 4; headA -= Math.sin(t * 2) * 3; }
  else if (!grazing && !rest) neckA += Math.sin(G.time * 0.7 + (o.id || 0)) * 3; // looking around
  if (play && P.play === 'roar') { neckA += 15; headA -= 25; }
  if (play && P.play === 'charge') { neckA -= 15; headA += 20; }
  const ph = [t, t + Math.PI, t + Math.PI, t]; // near hind, far hind, near fore, far fore

  // far legs, tucked when lying down
  if (rest) {
    ell(c, foreX + 2, -1.2, P.legW * 1.8, P.legW * 0.55, far);
  } else {
    limb(c, P, hindX + 2, base + 1, leg, ph[1], moving, false, far);
    limb(c, P, foreX + 2, base + 1, leg, ph[3], moving, true, far);
  }
  if (P.backExtra) P.backExtra(c, base, o);
  drawTail(c, P, base, o);

  // body with lighting and coat
  bodyPath(c, P, base);
  c.fillStyle = gradV(c, base - P.D - 2, base + 2, P.col.body);
  c.fill();
  c.save();
  bodyPath(c, P, base);
  c.clip();
  coat(c, P, base, P.coat, o);
  hair(c, P, base, o);
  // light catching the top of the back (we are still clipped to the body)
  c.beginPath();
  c.rect(-P.L * 2, base - P.D - 12, P.L * 4, P.D * 0.5 + 12);
  c.clip();
  c.save();
  c.translate(0, 1.4);
  bodyPath(c, P, base);
  c.restore();
  c.strokeStyle = 'rgba(255,250,235,0.3)';
  c.lineWidth = 1.4;
  c.stroke();
  // haunch and shoulder muscle highlights
  ell(c, hindX + 1, base - P.D * 0.5, P.L * 0.34, P.D * 0.5, 'rgba(255,255,255,0.07)');
  ell(c, foreX - 1, base - P.D * 0.45, P.L * 0.26, P.D * 0.45, 'rgba(255,255,255,0.06)');
  c.restore();
  bodyPath(c, P, base);
  c.strokeStyle = 'rgba(25,18,10,0.45)';
  c.lineWidth = 0.6;
  c.stroke();
  if (P.bodyExtra) P.bodyExtra(c, base, o);

  // near legs
  if (rest) {
    seg(c, foreX - 1, -2, foreX + P.L * 0.55, -1.2, P.legW, P.legW * 0.8, col);
    ell(c, hindX + 1, base - P.D * 0.3, P.L * 0.32, P.D * 0.45, gradV(c, base - P.D, base, P.col.body));
  } else {
    limb(c, P, hindX, base, leg, ph[0], moving, false, col);
    limb(c, P, foreX, base, leg, ph[2], moving, true, col);
  }

  // neck and head
  const g = neckGeom(P, base, neckA);
  if (P.maneBack) P.maneBack(c, g, o);
  if (P.neck.len > 0) {
    neckPath(c, P, g);
    c.fillStyle = gradV(c, g.ey - P.neck.w1, g.by + P.neck.w0, P.col.body);
    c.fill();
    if (P.coat && P.coat !== 'panda' && P.neckCoat !== false) {
      c.save(); neckPath(c, P, g); c.clip();
      if (P.coat === 'zebra') for (let k = 0; k < P.neck.len; k += 2.4) line(c, g.bx + g.dx * k - g.nx * 6, g.by + g.dy * k - g.ny * 6, g.bx + g.dx * k + g.nx * 6, g.by + g.dy * k + g.ny * 6, '#1d1d1f', 1.2);
      else if (P.coat === 'giraffe') for (let k = 0; k < P.neck.len; k += 3.6) { c.fillStyle = '#9a5a22'; c.beginPath(); c.roundRect(g.bx + g.dx * k - 2.6, g.by + g.dy * k - 1.6, 3, 2.6, 1); c.fill(); }
      else if (P.coat === 'spots') for (let k = 0; k < 8; k++) circ(c, g.bx + g.dx * k * 0.8 + (hash2(k, 2) - 0.5) * 3, g.by + g.dy * k * 0.8, 0.6, '#2a1e10');
      c.restore();
    }
  }
  if (P.mane) P.mane(c, g, o);
  drawHead(c, P, g.ex + g.dx * P.head.skull * 0.4, g.ey + g.dy * P.head.skull * 0.4, headA, { ...o, mouthOpen: play && (P.play === 'roar' || P.play === 'yawn') ? 1 : 0, sleep: rest && Math.sin(G.time * 0.2 + (o.id || 0)) > 0 });
  if (P.front) P.front(c, g, headA, o);
  c.restore();
}

// ---------- species ----------
const lionMane = (c, g, o) => {
  if (o.sex !== 'M' || o.baby) return;
  // a ruff of hair strands around the head and down the neck, dark at the roots
  const cx = g.ex - 1, cy = g.ey + 1.5;
  for (let layer = 0; layer < 2; layer++) {
    for (let k = 0; k < 34; k++) {
      const a = (k / 34) * Math.PI * 2, r0 = 2.5, r1 = (layer ? 5.8 : 7.2) + hash2(k, 4 + layer) * 2.2;
      const sway = Math.sin(G.time * 1.5 + k) * 0.25;
      const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0 * 1.2;
      const x1 = cx + Math.cos(a + sway * 0.1) * r1 - 1.5, y1 = cy + Math.sin(a) * r1 * 1.25 + 1;
      curve(c, x0, y0, (x0 + x1) / 2 + 0.8, (y0 + y1) / 2, x1, y1, layer ? '#9a6a30' : (k % 3 ? '#5e3614' : '#7a4a1f'), layer ? 1.6 : 2.4);
    }
  }
};

const SPECIES_ART = {
  lion: {
    L: 13, D: 9, leg: 9, legW: 3.3, belly: 1, neck: { len: 5, a: 30, w0: 9, w1: 7.5 }, head: { skull: 4.3, snout: 4.1, muzzleH: 2.8, a: 12 }, eye: '#c08a2a',
    ears: 'round', nose: 'cat', foot: 'paw', coat: null, tail: { len: 15, w: 1.5, tuft: '#3a2410' },
    col: { body: '#c99a52', belly: 'rgba(240,215,165,0.75)', muzzle: '#e8d0a2', nose: '#4a2a1a' }, maneBack: lionMane,
  },
  tiger: {
    L: 14, D: 9, leg: 9, legW: 3.6, belly: 1, neck: { len: 5, a: 28, w0: 9, w1: 7.5 }, head: { skull: 4.6, snout: 4.1, muzzleH: 3, a: 10 }, eye: '#d0a030',
    ears: 'round', nose: 'cat', foot: 'paw', coat: 'tiger', tail: { len: 16, w: 1.7, tuft: '#1e140c' },
    col: { body: '#d9792a', belly: 'rgba(245,238,225,0.95)', muzzle: '#f4ece0', nose: '#c76b5a', earIn: '#2a1a10' },
  },
  cheetah: {
    L: 13, D: 7, leg: 11.5, legW: 2.3, belly: -1, neck: { len: 6, a: 28, w0: 6, w1: 4.6 }, head: { skull: 3.6, snout: 3, muzzleH: 2.2, a: 10 }, eye: '#b8862a',
    ears: 'small', nose: 'cat', foot: 'paw', coat: 'spots', tail: { len: 19, w: 1.3, tuft: '#f2ead8' },
    col: { body: '#dcb468', belly: 'rgba(245,236,214,0.9)', muzzle: '#efe2c4', nose: '#3a2418' },
    headExtra: (c, H) => line(c, H.skull * 0.3, -H.skull * 0.05, H.snout * 0.8, H.skull * 0.6, '#1e140c', 0.7),
  },
  zebra: {
    L: 12, D: 8.5, leg: 11, legW: 2.6, withers: 1, neck: { len: 9, a: 52, w0: 7, w1: 4.8 }, head: { skull: 3.4, snout: 8, muzzleH: 2.5, a: 55 },
    ears: 'tall', foot: 'hoof', coat: 'zebra', stripedLegs: true, tail: { len: 12, w: 1.1, tuft: '#1d1d1f' },
    col: { body: '#f1f0ea', muzzle: '#2b2b2b', head: '#efeee8' },
    mane: (c, g) => { for (let k = 0; k <= g.dx * 0 + 8; k++) { const f = k / 8; line(c, g.bx - g.nx * 3.2 + (g.ex - g.bx) * f, g.by - g.ny * 3.2 + (g.ey - g.by) * f, g.bx - g.nx * 5.2 + (g.ex - g.bx) * f, g.by - g.ny * 5.2 + (g.ey - g.by) * f, k % 2 ? '#1d1d1f' : '#f1f0ea', 1.4); } },
  },
  giraffe: {
    L: 10, D: 8, leg: 19, legW: 2.3, slope: 4, withers: 3, neck: { len: 26, a: 70, w0: 7, w1: 3.6 }, head: { skull: 3, snout: 6, muzzleH: 2, a: 40 },
    ears: 'tall', foot: 'hoof', coat: 'giraffe', tail: { len: 14, w: 1, tuft: '#2a1a10' }, grazeNeck: 60, grazeHead: 45,
    col: { body: '#f0dcae', muzzle: '#e8cfa0', leg: '#e8d2a2' },
    headExtra: (c, H) => { line(c, -H.skull * 0.1, -H.skull * 0.8, -H.skull * 0.3, -H.skull * 1.9, '#5a3a1a', 1); line(c, H.skull * 0.25, -H.skull * 0.8, H.skull * 0.15, -H.skull * 1.9, '#5a3a1a', 1); circ(c, -H.skull * 0.3, -H.skull * 1.95, 0.7, '#2a1a10'); circ(c, H.skull * 0.15, -H.skull * 1.95, 0.7, '#2a1a10'); },
  },
  camel: {
    shaggy: true, L: 12, D: 8, leg: 15, legW: 2.6, neck: { len: 13, a: 18, w0: 6, w1: 4 }, head: { skull: 3.3, snout: 6.5, muzzleH: 2.4, a: -15 },
    ears: 'small', foot: 'pad', coat: null, tail: { len: 11, w: 1.2, tuft: '#6a4a2a' }, grazeNeck: -30, grazeHead: 60,
    col: { body: '#c9a06a', muzzle: '#b8905c' },
    bodyExtra: (c, base) => { c.beginPath(); c.ellipse(-1, base - 7.2, 6.2, 6, 0, Math.PI, 0); c.fillStyle = gradV(c, base - 14, base - 7, '#c9a06a'); c.fill(); },
  },
  elephant: {
    skin: true, L: 14, D: 13, leg: 11, legW: 6.5, withers: 2, slope: 1, neck: { len: 3, a: 15, w0: 14, w1: 13 }, head: { skull: 8, snout: 2, muzzleH: 5, a: 10 },
    ears: 'none', nose: 'none', foot: 'pad', coat: 'folds', neckCoat: false, tail: { len: 12, w: 1.3, tuft: '#3a3a3a' }, grazeNeck: 0, grazeHead: 25,
    col: { body: '#8f9097', muzzle: '#8f9097' },
    front: (c, g, headA, o) => {
      const hx = g.ex + g.dx * 3.2, hy = g.ey + g.dy * 3.2, r = headA * Math.PI / 180;
      c.save(); c.translate(hx, hy); c.rotate(r);
      // trunk: tapered curve, raised when trumpeting, swinging gently otherwise
      const up = o.state === 'play', sw = Math.sin(G.time * 1.5 + (o.id || 0)) * 2;
      const pts = up ? [[6, 2], [12, -4], [13, -14], [10, -20]] : [[6, 3], [10, 8 + sw * 0.3], [9 + sw, 15], [7 + sw, 19]];
      for (let k = 0; k < pts.length - 1; k++) seg(c, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 5.2 - k * 1.2, 4 - k * 1.1, tint('#8f9097', -0.05 * k));
      for (let k = 1; k < 6; k++) { const p0 = pts[1], p1 = pts[2], f = k / 6; line(c, p0[0] + (p1[0] - p0[0]) * f - 1.5, p0[1] + (p1[1] - p0[1]) * f, p0[0] + (p1[0] - p0[0]) * f + 1.5, p0[1] + (p1[1] - p0[1]) * f, 'rgba(0,0,0,0.18)', 0.6); }
      if (o.sex === 'M' || !o.baby) curve(c, 5, 4, 10, 8, 13, 5, '#f2ecd9', 1.6);
      c.restore();
      // big ear, flapping slowly
      const flap = Math.sin(G.time * 1.8 + (o.id || 0)) * 0.12;
      c.save(); c.translate(g.ex - 1, g.ey - 1); c.rotate(flap);
      c.beginPath(); c.moveTo(0, -6); c.bezierCurveTo(-9, -9, -11, 4, -6, 10); c.bezierCurveTo(-3, 12, 1, 6, 1, 2); c.closePath();
      c.fillStyle = gradV(c, -9, 12, '#858690'); c.fill();
      curve(c, -2, -4, -7, 0, -4, 8, 'rgba(0,0,0,0.15)', 0.8);
      c.restore();
    },
  },
  rhino: {
    skin: true, L: 14, D: 10, leg: 7, legW: 5, withers: 2, belly: 1, neck: { len: 3, a: 5, w0: 11, w1: 9.5 }, head: { skull: 5, snout: 8, muzzleH: 3.8, a: 25 },
    ears: 'tall', foot: 'pad', coat: 'folds', tail: { len: 8, w: 1, tuft: '#3a3530' }, grazeNeck: -15, grazeHead: 55, play: 'charge',
    col: { body: '#8f8a82', muzzle: '#8a857c' },
    headExtra: (c, H) => {
      poly(c, [[H.snout * 0.95, -H.muzzleH * 0.6], [H.snout * 1.2, -H.muzzleH * 2.6], [H.snout * 1.25, -H.muzzleH * 0.3]], '#d8d0bd');
      poly(c, [[H.snout * 0.6, -H.muzzleH * 0.8], [H.snout * 0.7, -H.muzzleH * 1.7], [H.snout * 0.82, -H.muzzleH * 0.7]], '#d8d0bd');
    },
  },
  hippo: {
    skin: true, L: 15, D: 10.5, leg: 5, legW: 5.5, belly: 2.5, neck: { len: 2, a: 0, w0: 12, w1: 11.5 }, head: { skull: 6.2, snout: 7.5, muzzleH: 5.2, a: 6 },
    ears: 'small', foot: 'pad', coat: null, tail: { len: 6, w: 1.4, tuft: '#5a4a50' }, play: 'yawn', grazeNeck: -10, grazeHead: 35,
    col: { body: '#857580', belly: 'rgba(205,160,165,0.85)', muzzle: '#9a8890', nose: '#6a5a62' },
  },
  grizzly: {
    shaggy: true, L: 13, D: 10, leg: 8, legW: 5, withers: 4, slope: 1, neck: { len: 4, a: 12, w0: 10, w1: 8.5 }, head: { skull: 5.3, snout: 4.4, muzzleH: 2.9, a: 15 },
    ears: 'round', foot: 'paw', coat: null, tail: { len: 3, w: 2 }, play: 'stand',
    col: { body: '#6e4628', muzzle: '#a07850', nose: '#1a120c' },
  },
  polarbear: {
    shaggy: true, L: 14, D: 10, leg: 8.5, legW: 5, withers: 2, slope: 1, neck: { len: 7, a: 15, w0: 9.5, w1: 7.5 }, head: { skull: 4.6, snout: 5, muzzleH: 2.7, a: 15 },
    ears: 'small', foot: 'paw', coat: null, tail: { len: 3, w: 2 }, play: 'stand',
    col: { body: '#efe9da', muzzle: '#e2dac6', nose: '#151515' },
  },
  panda: {
    shaggy: true, L: 12, D: 10, leg: 7.5, legW: 5, withers: 1, neck: { len: 3, a: 15, w0: 10, w1: 9 }, head: { skull: 5.6, snout: 3.6, muzzleH: 2.6, a: 12 },
    ears: 'round', foot: 'paw', coat: 'panda', tail: { len: 2, w: 2 }, play: 'stand', grazeNeck: 0, grazeHead: 30,
    col: { body: '#f4f2ec', leg: '#1d1d22', ear: '#1d1d22', earIn: '#1d1d22', muzzle: '#f4f2ec', nose: '#151515' },
    headExtra: (c, H) => { ell(c, H.skull * 0.25, -H.skull * 0.18, H.skull * 0.32, H.skull * 0.24, '#1d1d22', 0.5); circ(c, H.skull * 0.3, -H.skull * 0.22, H.skull * 0.11, '#ffffff'); },
  },
};

const ANIMAL_SHAPES = {};
for (const sp in SPECIES_ART) {
  const P = { ...SPECIES_ART[sp], play: SPECIES_ART[sp].play || SPECIES[sp].play };
  ANIMAL_SHAPES[sp] = (c, o) => quadruped(c, P, { ...o, sp });
}

// ---------- upright and unusual species ----------
ANIMAL_SHAPES.gorilla = (c, o) => {
  const { anim: t, moving, state } = o, silver = o.sex === 'M' && !o.baby;
  const fur = '#2c2b30', face = '#4a3f40';
  if (state === 'play') {
    // upright, beating its chest
    const beat = Math.sin(t * 2) > 0;
    seg(c, -3, -8, -4, 0, 4, 3.5, fur); seg(c, 3, -8, 4, 0, 4, 3.5, fur);
    c.beginPath(); c.ellipse(0, -16, 8, 11, 0, 0, Math.PI * 2); c.fillStyle = gradV(c, -27, -5, fur); c.fill();
    ell(c, 1.5, -15, 4.5, 6, '#46404a');
    seg(c, -6, -22, beat ? 0 : -10, beat ? -17 : -12, 4.5, 3.5, fur);
    seg(c, 6, -22, beat ? 2 : 10, beat ? -17 : -12, 4.5, 3.5, fur);
    circ(c, 1, -29, 5, fur); ell(c, 2.5, -28, 3.4, 3, face); line(c, -1, -31, 5, -31, '#1a1a1e', 1.2);
    return;
  }
  if (state === 'rest') {
    c.beginPath(); c.ellipse(0, -7, 10, 7, 0, 0, Math.PI * 2); c.fillStyle = gradV(c, -14, 0, fur); c.fill();
    if (silver) ell(c, -2, -11, 7, 2.5, '#8d8d94');
    circ(c, 8, -11, 4.6, fur); ell(c, 9.5, -10, 2.8, 2.6, face);
    return;
  }
  const sw = moving ? Math.sin(t) : 0;
  // short hind legs, long knuckle-walking arms, massive shoulders sloping to the rump
  seg(c, -7, -9, -7 + sw * 2, 0, 4.5, 3.6, tint(fur, -0.15));
  seg(c, 6, -15, 8 - sw * 2.5, 0, 4.5, 3.4, tint(fur, -0.15));
  c.beginPath();
  c.moveTo(-10, -6);
  c.bezierCurveTo(-11, -14, -4, -19, 4, -21);
  c.bezierCurveTo(10, -22, 13, -17, 11, -11);
  c.bezierCurveTo(9, -6, 2, -5, -10, -6);
  c.closePath();
  c.fillStyle = gradV(c, -22, -5, fur);
  c.fill();
  if (silver) { c.save(); c.clip(); ell(c, -3, -15, 8, 3.5, '#8d8d94'); c.restore(); }
  seg(c, -5, -9, -5 - sw * 2, 0, 4.2, 3.4, fur);
  seg(c, 7, -15, 9 + sw * 2.5, 0, 4.6, 3.5, fur);
  ell(c, 9 + sw * 2.5, -0.8, 2.4, 1.2, '#1f1e22');
  circ(c, 11, -19, 4.8, fur);
  ell(c, 13, -18, 3.2, 3, face);
  line(c, 9.5, -21, 15, -21, '#1a1a1e', 1.3);
  circ(c, 13.2, -19.5, 0.7, '#0e0d10');
  circ(c, 15, -17, 0.6, '#0e0d10');
};

ANIMAL_SHAPES.kangaroo = (c, o) => {
  const { anim: t, moving, state } = o, fur = '#b5774a', pale = '#e2c3a0';
  const tail = (x0, y0) => { c.beginPath(); c.moveTo(x0, y0 - 2); c.quadraticCurveTo(x0 - 10, y0 + 1, x0 - 18, y0 + 4); c.quadraticCurveTo(x0 - 10, y0 + 3.2, x0, y0 + 2); c.closePath(); c.fillStyle = tint(fur, -0.12); c.fill(); };
  if (state === 'rest') {
    tail(-6, -2);
    c.beginPath(); c.ellipse(0, -5, 10, 5, -0.1, 0, Math.PI * 2); c.fillStyle = gradV(c, -10, 0, fur); c.fill();
    circ(c, 9, -9, 3.4, fur); ell(c, 12, -8.5, 2.4, 1.6, fur);
    ell(c, 7.5, -14, 1.2, 3, fur, -0.3); ell(c, 9.5, -14, 1.2, 3, fur, 0.2);
    circ(c, 10, -9.6, 0.6, '#111');
    return;
  }
  const hop = moving || state === 'play', crouch = hop ? Math.abs(Math.cos(t * 0.5)) : 1;
  tail(-4, -5);
  // big hind leg with long foot
  ell(c, -1, -7, 5, 4.5, gradV(c, -12, -2, fur));
  seg(c, 1, -5, -2, -1.5 * crouch, 3, 2, tint(fur, -0.1));
  seg(c, -2, -1.2, 6, -0.4, 2.2, 1.6, tint(fur, -0.2));
  c.beginPath();
  c.moveTo(-4, -6);
  c.bezierCurveTo(-5, -14, 0, -23, 4, -24);
  c.bezierCurveTo(7, -24, 7, -18, 5, -10);
  c.bezierCurveTo(4, -6, 0, -4, -4, -6);
  c.closePath();
  c.fillStyle = gradV(c, -24, -4, fur);
  c.fill();
  ell(c, 3.5, -14, 2.2, 5, pale, 0.15);
  seg(c, 5, -18, 8, -14, 1.4, 1, fur);
  circ(c, 6, -26, 3.2, fur);
  ell(c, 9, -25, 2.6, 1.8, fur);
  circ(c, 11.2, -25.2, 0.7, '#2a1a10');
  ell(c, 4, -31, 1.3, 3.2, fur, -0.3); ell(c, 6.3, -31, 1.3, 3.2, fur, 0.15);
  ell(c, 4, -31, 0.6, 2.2, '#8a5532', -0.3);
  circ(c, 7.2, -26.6, 0.7, '#111'); circ(c, 7.4, -26.9, 0.25, '#fff');
};

ANIMAL_SHAPES.penguin = (c, o) => {
  const { anim: t, moving, state } = o;
  if (state === 'play') {
    // tobogganing on its belly
    c.rotate(-0.08);
    c.beginPath(); c.ellipse(0, -4.5, 11, 4.5, 0, 0, Math.PI * 2); c.fillStyle = gradV(c, -9, 0, '#1f222b'); c.fill();
    ell(c, 1, -2.5, 8, 2.2, '#f6f6f2');
    circ(c, 11, -6.5, 3.4, '#1f222b'); ell(c, 12, -5.5, 1.6, 1.1, '#f2c230');
    poly(c, [[14, -7], [18, -6.4], [14, -5.6]], '#e07a2c');
    seg(c, -2, -6, -8, -3, 2, 1.2, '#1f222b');
    return;
  }
  if (moving) c.rotate(Math.sin(t) * 0.1);
  ell(c, 0.5, 0, 2.2, 1, '#f0a030'); ell(c, 3.5, 0, 2.2, 1, '#e09028');
  c.beginPath();
  c.moveTo(0, -24);
  c.bezierCurveTo(-7, -22, -7.5, -6, -3, -1);
  c.bezierCurveTo(1, 1, 6, 0, 6.5, -6);
  c.bezierCurveTo(7, -14, 4, -22, 0, -24);
  c.closePath();
  c.fillStyle = gradV(c, -24, 0, '#1f222b');
  c.fill();
  c.beginPath();
  c.moveTo(3, -19);
  c.bezierCurveTo(6, -14, 6.5, -6, 4, -2);
  c.bezierCurveTo(1, -1, -1, -3, 0, -8);
  c.bezierCurveTo(0.5, -13, 1, -17, 3, -19);
  c.closePath();
  c.fillStyle = gradV(c, -19, -1, '#f6f6f2', 0.1, -0.12);
  c.fill();
  ell(c, 2.8, -19.5, 1.8, 2.6, '#f2c230', 0.3);
  poly(c, [[3.5, -22.5], [8.5, -21.3], [3.5, -20.4]], '#2a2a2a');
  line(c, 4, -21.4, 8, -21.3, '#e07a2c', 0.8);
  circ(c, 2.2, -22.4, 0.55, '#fff');
  const flap = state === 'idle' ? Math.sin(G.time * 3 + (o.id || 0)) * 0.25 : moving ? Math.sin(t) * 0.3 : 0;
  c.save(); c.translate(-3, -16); c.rotate(0.35 + flap);
  ell(c, 0, 5, 1.6, 6, '#181a21');
  c.restore();
};

ANIMAL_SHAPES.flamingo = (c, o) => {
  const { anim: t, moving, state } = o, pink = '#f28aa5', deep = '#e0607e';
  // legs: walking, or resting on one leg
  if (moving) {
    seg(c, -1, -18, -1 + Math.sin(t) * 3, -9, 1.2, 1, deep); seg(c, -1 + Math.sin(t) * 3, -9, -1 + Math.sin(t) * 4, 0, 1, 0.9, deep);
    seg(c, 1, -18, 1 - Math.sin(t) * 3, -9, 1.2, 1, pink); seg(c, 1 - Math.sin(t) * 3, -9, 1 - Math.sin(t) * 4, 0, 1, 0.9, pink);
  } else {
    seg(c, 0, -18, 0.5, -9, 1.2, 1, pink); seg(c, 0.5, -9, 0, 0, 1, 0.9, pink);
    seg(c, 0, -17, 4, -13, 1.1, 0.9, deep); seg(c, 4, -13, 0.5, -11, 0.9, 0.8, deep);
  }
  if (state === 'play') {
    const f = Math.sin(t * 2) * 5;
    c.beginPath(); c.moveTo(-2, -24); c.quadraticCurveTo(-12, -32 - f, -16, -22 - f); c.quadraticCurveTo(-8, -24, -2, -21); c.fillStyle = '#1d1d22'; c.fill();
    c.beginPath(); c.moveTo(-1, -24); c.quadraticCurveTo(-9, -32 - f, -12, -24 - f); c.quadraticCurveTo(-6, -24, -1, -21); c.fillStyle = deep; c.fill();
  }
  c.beginPath();
  c.moveTo(-8, -21);
  c.bezierCurveTo(-6, -27, 4, -27, 6, -23);
  c.bezierCurveTo(6, -19, 0, -17, -4, -18);
  c.bezierCurveTo(-6, -18.5, -8, -19, -8, -21);
  c.closePath();
  c.fillStyle = gradV(c, -27, -17, pink, 0.2, -0.2);
  c.fill();
  ell(c, -3, -22, 4, 2, deep, -0.1);
  line(c, -7, -21.5, -9.5, -20, '#1d1d22', 1.2);
  if (state === 'rest') {
    c.beginPath(); c.moveTo(4, -24); c.bezierCurveTo(7, -30, 0, -32, -3, -27); c.strokeStyle = pink; c.lineWidth = 2; c.stroke();
    circ(c, -3, -27, 2.2, pink);
    return;
  }
  // S-shaped neck tapering to the head
  const sway = moving ? Math.sin(t * 0.5) : Math.sin(G.time + (o.id || 0)) * 0.6;
  c.beginPath();
  c.moveTo(5, -24);
  c.bezierCurveTo(11, -29, 1, -34, 5 + sway, -41);
  c.strokeStyle = pink;
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.stroke();
  circ(c, 6 + sway, -42, 2.3, pink);
  c.beginPath();
  c.moveTo(7.5 + sway, -42.8);
  c.quadraticCurveTo(11 + sway, -42.5, 10.5 + sway, -39);
  c.quadraticCurveTo(9.5 + sway, -40.5, 7.5 + sway, -41.2);
  c.closePath();
  c.fillStyle = '#f2ead8';
  c.fill();
  poly(c, [[10.2 + sway, -40.5], [10.8 + sway, -38.8], [9.6 + sway, -39.6]], '#1d1d22');
  circ(c, 6.3 + sway, -42.8, 0.5, '#ffd23f');
};

// ---------- picture sprites ----------
// Species with a picture in SPRITE_DATA are drawn from it: a stepping bob and body
// sway when walking, slow breathing when still, a tilt when playing, and a lying
// pose made by lowering the body over the folded legs.
const SPRITE_IMAGES = {};
if (typeof SPRITE_DATA !== 'undefined') {
  for (const k in SPRITE_DATA) { const img = new Image(); img.src = SPRITE_DATA[k].src; SPRITE_IMAGES[k] = img; }
}

function drawSpriteAnimal(c, a, moving) {
  const img = SPRITE_IMAGES[a.sp], S = typeof SPRITE_DATA !== 'undefined' && SPRITE_DATA[a.sp];
  if (!img || !img.complete || !img.naturalWidth) return false;
  const W = S.width, H = W * img.naturalHeight / img.naturalWidth, ax = W * S.anchorX;
  c.save();
  if (a.state === 'rest') {
    // lying down: draw the body only, resting on the ground, breathing slowly
    const body = S.legTop, sh = img.naturalHeight * body, dh = H * body;
    c.scale(1, 1 + Math.sin(G.time * 1.6 + a.id) * 0.015);
    ell(c, 0, -1, W * 0.42, 3, 'rgba(0,0,0,0.2)');
    c.drawImage(img, 0, 0, img.naturalWidth, sh, -ax, -dh + 1.5, W, dh);
    c.restore();
    return true;
  }
  let lift = 0, rot = 0;
  if (moving) { lift = -Math.abs(Math.sin(a.anim)) * 1.6; rot = Math.sin(a.anim) * 0.03; }
  if (a.state === 'play') rot = -0.14 * Math.abs(Math.sin(a.anim * 0.6));
  if (a.state === 'eat' || a.state === 'drink') rot = 0.05;
  // rotate around the hind feet so the front lifts or dips
  c.translate(-W * 0.3, lift);
  c.rotate(rot);
  c.translate(W * 0.3, 0);
  if (!moving) c.scale(1, 1 + Math.sin(G.time * 2 + a.id) * 0.012);
  c.drawImage(img, -ax, -H, W, H);
  c.restore();
  return true;
}
