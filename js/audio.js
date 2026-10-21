'use strict';
// Synthesized audio: animal calls, UI and building sounds, ambience and music.
// Everything is generated with the Web Audio API, so there are no sound files.

const ANIMAL_CALLS = {
  lion: 'roar', tiger: 'growl', cheetah: 'chirp', elephant: 'trumpet', giraffe: 'hum', zebra: 'bray',
  gorilla: 'chest', grizzly: 'growl', penguin: 'squawk', rhino: 'snort', hippo: 'honk', flamingo: 'honkHigh',
  polarbear: 'roar', panda: 'bleat', kangaroo: 'boing', camel: 'groan',
};

const Sound = {
  ctx: null, out: null, sfxBus: null, musicBus: null, ambBus: null, noiseBuf: null, crowd: null,
  muted: false, musicOn: true, hold: 0, last: {}, birdT: 3, callT: 8,
  music: { next: 0, step: 0 },

  init() {
    try {
      const p = JSON.parse(localStorage.getItem('menagerie-audio'));
      if (p) { this.muted = !!p.muted; this.musicOn = p.musicOn !== false; }
    } catch (e) { /* storage unavailable */ }
    // browsers only allow audio after a user gesture
    const unlock = () => {
      this.start();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  },

  savePrefs() {
    try { localStorage.setItem('menagerie-audio', JSON.stringify({ muted: this.muted, musicOn: this.musicOn })); } catch (e) { /* ignore */ }
  },

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.connect(ctx.destination);
    this.out = ctx.createGain();
    this.out.connect(comp);
    const bus = v => { const g = ctx.createGain(); g.gain.value = v; g.connect(this.out); return g; };
    this.sfxBus = bus(0.9);
    this.musicBus = bus(0);
    this.ambBus = bus(0.7);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // shared reverb so everything sits in the same outdoor space
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < ctx.sampleRate * 0.02 ? i / (ctx.sampleRate * 0.02) : 1);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.reverb.connect(wet).connect(this.out);
    const send = (bus, amt) => { const g = ctx.createGain(); g.gain.value = amt; bus.connect(g).connect(this.reverb); };
    send(this.sfxBus, 0.22);
    send(this.ambBus, 0.18);
    send(this.musicBus, 0.25);
    this.applyVolumes();
    this.startAmbience();
    this.music.next = ctx.currentTime + 0.6;
  },

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(this.muted ? 0 : 0.8, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.2 : 0, t, 0.2);
  },
  toggleMute() { this.muted = !this.muted; this.applyVolumes(); this.savePrefs(); },
  toggleMusic() { this.musicOn = !this.musicOn; this.applyVolumes(); this.savePrefs(); },

  // Rate limiter: false while audio is off, held, or this sound played too recently.
  ok(name, gap = 0.05) {
    if (!this.ctx || this.ctx.state !== 'running' || this.muted || this.hold) return false;
    const now = this.ctx.currentTime;
    if (this.last[name] !== undefined && now - this.last[name] < gap) return false;
    this.last[name] = now;
    return true;
  },

  // ---------- primitives ----------
  osc(type, f, t, dur, vol, dest, o = {}) {
    const ctx = this.ctx, g = ctx.createGain(), osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide || dur));
    if (o.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vib[0];
      lg.gain.value = o.vib[1];
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const a = o.attack || 0.008;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter[0];
      f.frequency.setValueAtTime(o.filter[1], t);
      if (o.filter[3]) f.frequency.exponentialRampToValueAtTime(o.filter[3], t + dur);
      f.Q.value = o.filter[2] || 1;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(dest || this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  noise(t, dur, vol, dest, filter, attack = 0.005) {
    const ctx = this.ctx, src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = this.noiseBuf;
    f.type = filter[0];
    f.frequency.setValueAtTime(filter[1], t);
    if (filter[3]) f.frequency.exponentialRampToValueAtTime(filter[3], t + dur);
    f.Q.value = filter[2] || 1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || this.sfxBus);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  },

  // A gain node panned to where (x, y) is on screen, or null when it is off screen.
  spot(x, y, base = 1, bus = this.sfxBus) {
    const p = tileToScreen(x, y);
    if (p.x < -80 || p.x > viewW + 80 || p.y < -80 || p.y > viewH + 80) return null;
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.value = base * (0.35 + 0.65 * Math.min(1, cam.zoom));
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = clamp((p.x / viewW) * 2 - 1, -1, 1) * 0.6;
      g.connect(pan).connect(bus);
    } else g.connect(bus);
    return g;
  },

  // A buzzy source shaped by vocal-tract formants, with a rough tremolo:
  // much closer to a real throat than a bare oscillator.
  voice(t, dur, vol, dest, o) {
    const ctx = this.ctx, src = ctx.createOscillator(), amp = ctx.createGain(), out = ctx.createGain();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(o.f0, t);
    if (o.peak) src.frequency.linearRampToValueAtTime(o.peak, t + dur * (o.peakAt || 0.3));
    src.frequency.exponentialRampToValueAtTime(o.f1 || o.f0 * 0.7, t + dur);
    if (o.rough) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.rough[0];
      lg.gain.value = o.rough[1];
      lfo.connect(lg).connect(amp.gain);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    amp.gain.value = 0.6;
    src.connect(amp);
    for (const [f, q, g] of o.formants) {
      const bp = ctx.createBiquadFilter(), fg = ctx.createGain();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f, t);
      if (o.shift) bp.frequency.linearRampToValueAtTime(f * o.shift, t + dur);
      bp.Q.value = q;
      fg.gain.value = g;
      amp.connect(bp).connect(fg).connect(out);
    }
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.06));
    out.gain.setTargetAtTime(vol * 0.7, t + dur * 0.4, dur * 0.2);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(dest || this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  },

  // ---------- animal calls ----------
  calls: {
    roar(S, t, d, deep = 1) {
      S.voice(t, 1.6, 0.9, d, { f0: 95 * deep, peak: 150 * deep, peakAt: 0.25, f1: 60 * deep, rough: [28, 0.5], attack: 0.15, formants: [[420 * deep, 4, 1.2], [900 * deep, 5, 0.6], [2200, 6, 0.2]], shift: 0.7 });
      S.noise(t, 1.4, 0.18, d, ['bandpass', 700 * deep, 0.9, 300], 0.12);
      S.osc('sine', 48 * deep, t, 1.4, 0.35, d, { f1: 38, attack: 0.2 });
    },
    growl(S, t, d) {
      S.voice(t, 1.0, 0.8, d, { f0: 70, f1: 58, rough: [34, 0.6], attack: 0.1, formants: [[350, 4, 1.2], [800, 5, 0.5]] });
      S.noise(t, 0.9, 0.12, d, ['lowpass', 500, 1], 0.1);
    },
    chirp(S, t, d) { for (let k = 0; k < 3; k++) S.osc('sine', 1700, t + k * 0.16, 0.11, 0.14, d, { f1: 2500 }); },
    trumpet(S, t, d) {
      S.voice(t, 1.2, 0.55, d, { f0: 330, peak: 620, peakAt: 0.2, f1: 480, rough: [11, 0.3], attack: 0.04, formants: [[900, 3, 1], [1800, 4, 0.8], [3200, 5, 0.4]] });
      S.noise(t, 1.0, 0.1, d, ['highpass', 2500, 1], 0.05);
      S.osc('sawtooth', 165, t + 0.05, 1.0, 0.06, d, { f1: 240, glide: 0.25, filter: ['lowpass', 900, 1] });
    },
    hum(S, t, d) { S.osc('sine', 72, t, 1.1, 0.28, d, { f1: 56, attack: 0.25 }); },
    bray(S, t, d) {
      for (let k = 0; k < 3; k++) {
        S.voice(t + k * 0.42, 0.22, 0.4, d, { f0: 640, f1: 520, rough: [40, 0.4], attack: 0.02, formants: [[1100, 5, 1], [2400, 6, 0.5]] });
        S.voice(t + k * 0.42 + 0.2, 0.22, 0.45, d, { f0: 260, f1: 210, rough: [30, 0.5], attack: 0.02, formants: [[600, 5, 1], [1300, 6, 0.4]] });
      }
    },
    chest(S, t, d) {
      for (let k = 0; k < 6; k++) {
        S.osc('sine', 100, t + k * 0.12, 0.13, 0.5, d, { f1: 55 });
        S.noise(t + k * 0.12, 0.06, 0.12, d, ['lowpass', 400, 1]);
      }
    },
    squawk(S, t, d) {
      for (let k = 0; k < 4; k++) S.voice(t + k * 0.14, 0.12, 0.35, d, { f0: 560 + (k % 2) * 90, f1: 420, rough: [55, 0.6], attack: 0.01, formants: [[1300, 5, 1], [2600, 6, 0.4]] });
    },
    honkHigh(S, t, d) { for (let k = 0; k < 2; k++) S.osc('sawtooth', 520, t + k * 0.22, 0.16, 0.1, d, { f1: 440, filter: ['bandpass', 1000, 2.5] }); },
    snort(S, t, d) {
      S.noise(t, 0.3, 0.35, d, ['bandpass', 380, 1.4]);
      S.noise(t + 0.38, 0.25, 0.25, d, ['bandpass', 320, 1.4]);
    },
    honk(S, t, d) {
      for (let k = 0; k < 4; k++) S.voice(t + k * 0.26, 0.28, 0.7, d, { f0: 120 - k * 10, f1: 85, rough: [22, 0.5], attack: 0.03, formants: [[380, 4, 1.2], [750, 5, 0.5]] });
    },
    bleat(S, t, d) { S.voice(t, 0.55, 0.35, d, { f0: 480, f1: 400, rough: [9, 0.5], attack: 0.04, formants: [[800, 5, 1], [1700, 6, 0.5]] }); },
    boing(S, t, d) { S.osc('sine', 170, t, 0.3, 0.25, d, { f1: 640, glide: 0.22 }); },
    groan(S, t, d) { S.voice(t, 1.1, 0.55, d, { f0: 140, peak: 170, f1: 95, rough: [18, 0.6], attack: 0.12, formants: [[500, 4, 1], [1100, 5, 0.5]], shift: 0.8 }); },
  },

  animal(a, vol = 1) {
    if (!this.ok('a' + a.id, 2.5)) return;
    const d = this.spot(a.x, a.y, vol * (a.baby ? 0.6 : 1));
    if (!d) return;
    const call = this.calls[ANIMAL_CALLS[a.sp]];
    if (call) call(this, this.ctx.currentTime + 0.01, d);
  },

  coinAt(x, y) {
    if (!this.ok('coin', 0.18)) return;
    const d = this.spot(x, y, 0.7);
    if (!d) return;
    const t = this.ctx.currentTime;
    this.osc('triangle', 1320, t, 0.1, 0.1, d);
    this.osc('triangle', 1760, t + 0.07, 0.28, 0.1, d);
  },

  // ---------- interface & building sounds ----------
  play(name) {
    const gaps = { brush: 0.07, path: 0.06, plant: 0.06, click: 0.03 };
    if (!this.ok(name, gaps[name] || 0.12)) return;
    const t = this.ctx.currentTime, seq = (notes, type, len, vol, gap) =>
      notes.forEach((f, i) => this.osc(type, f, t + i * gap, len, vol, null, { filter: ['lowpass', 4000, 0.7] }));
    switch (name) {
      case 'click': this.osc('triangle', 1250, t, 0.05, 0.05, null, { f1: 900 }); break;
      case 'build':
        this.noise(t, 0.16, 0.3, null, ['lowpass', 900, 1]);
        this.osc('sine', 170, t, 0.22, 0.3, null, { f1: 85 });
        break;
      case 'plant':
        this.noise(t, 0.22, 0.12, null, ['bandpass', 2400, 1]);
        this.osc('sine', 600, t, 0.12, 0.05, null, { f1: 950 });
        break;
      case 'brush': this.noise(t, 0.12, 0.08, null, ['bandpass', 1700, 0.8]); break;
      case 'path':
        this.noise(t, 0.08, 0.12, null, ['lowpass', 1300, 1]);
        this.osc('sine', 230, t, 0.08, 0.07, null);
        break;
      case 'fence':
        for (let k = 0; k < 3; k++) {
          this.osc('square', 340, t + k * 0.07, 0.05, 0.04, null, { filter: ['lowpass', 1200, 1] });
          this.noise(t + k * 0.07, 0.05, 0.1, null, ['highpass', 2000, 1]);
        }
        break;
      case 'demolish':
        this.noise(t, 0.5, 0.35, null, ['lowpass', 700, 1, 150]);
        this.osc('sawtooth', 90, t, 0.4, 0.1, null, { f1: 40, filter: ['lowpass', 400, 1] });
        break;
      case 'hire':
        this.osc('sine', 1500, t, 0.15, 0.09, null, { f1: 2300 });
        this.osc('sine', 2200, t + 0.18, 0.22, 0.09, null, { f1: 1600 });
        break;
      case 'error':
        this.osc('square', 190, t, 0.16, 0.06, null, { filter: ['lowpass', 900, 1] });
        this.osc('square', 145, t + 0.13, 0.2, 0.06, null, { filter: ['lowpass', 900, 1] });
        break;
      case 'chime':
        this.osc('sine', 880, t, 0.4, 0.07, null);
        this.osc('sine', 1320, t + 0.08, 0.5, 0.05, null);
        break;
      case 'alert':
        this.osc('triangle', 660, t, 0.2, 0.12, null);
        this.osc('triangle', 520, t + 0.18, 0.3, 0.12, null);
        break;
      case 'baby': seq([1047, 1319, 1568, 2093], 'triangle', 0.35, 0.08, 0.1); break;
      case 'goal': seq([784, 988, 1175, 1568], 'square', 0.25, 0.05, 0.09); break;
      case 'win':
        seq([523, 659, 784, 1047, 784, 1047, 1319], 'square', 0.32, 0.06, 0.14);
        seq([262, 330, 392, 523], 'triangle', 0.9, 0.1, 0.28);
        break;
      case 'lose': seq([392, 349, 311, 262], 'triangle', 0.5, 0.1, 0.32); break;
    }
  },

  // ---------- ambience ----------
  loopNoise(filterType, freq, q, dest) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noiseBuf;
    src.loop = true;
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.value = 0;
    src.connect(f).connect(g).connect(dest);
    src.start();
    return g;
  },

  startAmbience() {
    this.wind = this.loopNoise('lowpass', 320, 0.5, this.ambBus);
    this.wind.gain.value = 0.045;
    this.crowd = this.loopNoise('bandpass', 750, 0.7, this.ambBus);
    this.water = this.loopNoise('bandpass', 420, 0.6, this.ambBus);
    this.chatT = 1; this.organT = 0; this.critterT = 2; this.organStep = 0;
  },

  // A few syllables of babble or a child's giggle from somewhere in the crowd.
  chatter(g) {
    const d = this.spot(g.x, g.y, 0.5, this.ambBus);
    if (!d) return;
    const t = this.ctx.currentTime, kid = g.kid, laugh = kid && Math.random() < 0.5;
    const n = laugh ? randi(3, 5) : randi(2, 4), base = kid ? 380 : rand(150, 230);
    for (let k = 0; k < n; k++) {
      const f = base * rand(0.9, 1.25), at = t + k * (laugh ? 0.13 : rand(0.1, 0.18));
      const vowel = pick([[800, 1200], [400, 2000], [600, 1000], [300, 2300]]);
      this.voice(at, laugh ? 0.1 : rand(0.08, 0.15), 0.12, d, { f0: f, f1: f * (laugh ? 0.85 : rand(0.8, 1.1)), attack: 0.01, formants: [[vowel[0], 6, 1], [vowel[1], 8, 0.5]] });
      if (laugh) this.noise(at, 0.06, 0.03, d, ['bandpass', 3000, 2]);
    }
  },

  // Band-organ waltz near a running carousel.
  organ(o) {
    const d = this.spot(o.x + 0.5, o.y + 0.5, 0.45, this.ambBus);
    if (!d) return;
    const t = this.ctx.currentTime, tune = [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 84, 83, 79, 74, 71];
    const n = tune[this.organStep % tune.length];
    const f = 440 * Math.pow(2, (n - 69) / 12);
    this.osc('square', f, t, 0.24, 0.05, d, { filter: ['lowpass', 2500, 1] });
    this.osc('triangle', f * 2, t, 0.2, 0.03, d);
    if (this.organStep % 3 === 0) this.osc('triangle', f / 4, t, 0.3, 0.08, d);
    this.organStep++;
  },

  whee(o) {
    const d = this.spot(o.x + 0.5, o.y + 0.5, 0.45, this.ambBus);
    if (!d) return;
    const t = this.ctx.currentTime;
    this.voice(t, 0.7, 0.18, d, { f0: 520, peak: 900, peakAt: 0.4, f1: 600, attack: 0.05, formants: [[400, 5, 1], [2300, 8, 0.6]] });
  },

  cricket() {
    const t = this.ctx.currentTime;
    let d = this.ambBus;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = rand(-0.9, 0.9); p.connect(this.ambBus); d = p; }
    const f = rand(4200, 4800);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) this.osc('sine', f, t + k * 0.35 + j * 0.035, 0.025, 0.02, d);
  },

  owl() {
    const t = this.ctx.currentTime;
    this.osc('sine', 380, t, 0.35, 0.04, this.ambBus, { f1: 340, attack: 0.05 });
    this.osc('sine', 360, t + 0.5, 0.6, 0.04, this.ambBus, { f1: 320, attack: 0.05 });
  },

  bird() {
    const t = this.ctx.currentTime, base = rand(2300, 3900), n = randi(2, 5);
    let d = this.ambBus;
    if (this.ctx.createStereoPanner) {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = rand(-0.8, 0.8);
      pan.connect(this.ambBus);
      d = pan;
    }
    let at = t;
    for (let k = 0; k < n; k++) {
      const f = base * rand(0.9, 1.1);
      this.osc('sine', f, at, 0.08, 0.025, d, { f1: f * rand(1.15, 1.5) });
      at += rand(0.09, 0.15);
    }
  },

  update(dt) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    let visible = 0;
    for (const g of G.guests) {
      const p = tileToScreen(g.x, g.y);
      if (p.x > 0 && p.x < viewW && p.y > 0 && p.y < viewH) visible++;
    }
    const level = Math.min(0.16, visible * 0.004) * (0.4 + 0.6 * Math.min(1, cam.zoom)) * (G.speed ? 1 : 0.4);
    this.crowd.gain.setTargetAtTime(level, t, 0.6);
    const dark = darkness();
    // water lapping when ponds are in view
    let wet = 0;
    const c0 = screenToTile(viewW / 2, viewH / 2), cx = Math.floor(c0.x), cy = Math.floor(c0.y);
    for (let y = cy - 8; y <= cy + 8; y += 2) for (let x = cx - 8; x <= cx + 8; x += 2) { const tl = tileAt(x, y); if (tl && tl.t === 'water') wet++; }
    this.water.gain.setTargetAtTime(Math.min(0.06, wet * 0.004) * (0.5 + 0.5 * Math.sin(t * 0.7)), t, 0.4);
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = dark > 0.5 ? rand(0.6, 1.6) : rand(2, 7);
      if (this.muted) { /* nothing */ } else if (dark > 0.5) { Math.random() < 0.06 ? this.owl() : this.cricket(); } else this.bird();
    }
    this.chatT -= dt;
    if (this.chatT <= 0) {
      this.chatT = rand(0.6, 2.2) / Math.max(1, Math.sqrt(visible / 6));
      const near = G.guests.filter(g => g.state !== 'ride' && Math.abs(isoX(g.x, g.y) - cam.x) < viewW / 2 / cam.zoom && Math.abs(isoY(g.x, g.y) - cam.y) < viewH / 2 / cam.zoom);
      if (near.length && G.speed) this.chatter(pick(near));
    }
    this.organT -= dt;
    if (this.organT <= 0) {
      this.organT = 0.3;
      for (const o of G.objects.values()) {
        if (!o.riders) continue;
        if (o.type === 'carousel') this.organ(o);
        else if (o.type === 'swings' && Math.random() < 0.08) this.whee(o);
      }
    }
    this.callT -= dt * G.speed;
    if (this.callT <= 0) {
      this.callT = rand(7, 15);
      const near = G.animals.filter(a => { const p = tileToScreen(a.x, a.y); return p.x > 0 && p.x < viewW && p.y > 0 && p.y < viewH; });
      if (near.length) this.animal(pick(near), 0.55);
    }
    this.updateMusic();
  },

  // ---------- music: a light marimba tune over C - Am - F - G ----------
  marimba(midi, t, vol) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    this.osc('sine', f, t, 0.5, vol, this.musicBus, { attack: 0.004 });
    this.osc('sine', f * 4, t, 0.1, vol * 0.25, this.musicBus, { attack: 0.002 });
  },

  updateMusic() {
    const m = this.music, now = this.ctx.currentTime;
    if (!this.musicOn) { m.next = now + 0.1; return; }
    const eighth = 60 / 100 / 2;
    if (m.next < now) m.next = now + 0.05;
    while (m.next < now + 0.3) {
      this.musicStep(m.step, m.next);
      m.step++;
      m.next += eighth;
    }
  },

  pad(chord, t, dur) {
    for (const n of chord) {
      const f = 440 * Math.pow(2, (60 + n - 69) / 12);
      for (const det of [-6, 6]) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.012, t + dur * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(lp).connect(g).connect(this.musicBus);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  },

  musicStep(i, t) {
    // A section: C Am F G, B section: F G Em Am, played A A B A
    const A = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], B = [[-7, -3, 0], [-5, -1, 2], [-8, -5, -1], [-3, 0, 4]];
    const bar = Math.floor(i / 16), section = Math.floor(bar / 4) % 4, chords = section === 2 ? B : A;
    const pos = i % 16, chord = chords[bar % 4], night = darkness() > 0.5;
    const eighth = 60 / 100 / 2;
    if (pos === 0) this.pad(chord, t, eighth * 16);
    if (pos % 4 === 0) {
      const f = 440 * Math.pow(2, (36 + chord[0] + (pos === 8 ? 7 : 0) - 69) / 12);
      this.osc('triangle', f, t, 0.4, 0.15, this.musicBus);
    }
    if (!night) {
      if (pos % 2 === 1) this.noise(t, 0.04, 0.012, this.musicBus, ['highpass', 7000, 1]);
      // bongos
      if ([0, 3, 6, 10, 11, 14].includes(pos)) this.osc('sine', pos % 3 === 0 ? 220 : 300, t, 0.12, 0.08, this.musicBus, { f1: pos % 3 === 0 ? 150 : 210 });
      if (pos === 0 || pos === 6 || pos === 10) for (const n of chord) this.marimba(60 + n, t, 0.03);
    }
    // melody: a 64-step phrase from the pentatonic scale, varied in the B section
    const phrase = (i % 64) + section * 101;
    if (hash2(phrase, 11) < (night ? 0.3 : 0.55)) {
      const scale = [0, 2, 4, 7, 9], deg = Math.floor(hash2(phrase, 12) * 8);
      this.marimba(72 + scale[deg % 5] + 12 * Math.floor(deg / 5), t, night ? 0.04 : 0.06);
    }
  },
};
