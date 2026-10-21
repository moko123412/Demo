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

  // ---------- animal calls ----------
  calls: {
    roar(S, t, d, deep = 1) {
      S.osc('sawtooth', 120 * deep, t, 1.4, 0.32, d, { f1: 70 * deep, attack: 0.18, filter: ['lowpass', 1000, 2, 280], vib: [16, 10] });
      S.noise(t, 1.3, 0.22, d, ['bandpass', 520 * deep, 0.8, 250], 0.15);
    },
    growl(S, t, d) {
      S.osc('sawtooth', 85, t, 0.9, 0.3, d, { f1: 65, attack: 0.1, filter: ['lowpass', 600, 3], vib: [22, 8] });
      S.noise(t, 0.8, 0.15, d, ['lowpass', 500, 1], 0.1);
    },
    chirp(S, t, d) { for (let k = 0; k < 3; k++) S.osc('sine', 1700, t + k * 0.16, 0.11, 0.14, d, { f1: 2500 }); },
    trumpet(S, t, d) {
      S.osc('sawtooth', 380, t, 1.1, 0.2, d, { f1: 640, glide: 0.25, attack: 0.05, vib: [7, 20], filter: ['bandpass', 1200, 1.2] });
      S.osc('square', 760, t, 1.0, 0.05, d, { f1: 1280, glide: 0.25, attack: 0.05, filter: ['bandpass', 1900, 2] });
    },
    hum(S, t, d) { S.osc('sine', 72, t, 1.1, 0.28, d, { f1: 56, attack: 0.25 }); },
    bray(S, t, d) {
      for (let k = 0; k < 2; k++) {
        S.osc('sawtooth', 720, t + k * 0.46, 0.22, 0.13, d, { f1: 520, filter: ['bandpass', 1400, 1.5] });
        S.osc('sawtooth', 300, t + k * 0.46 + 0.22, 0.24, 0.15, d, { f1: 240, filter: ['bandpass', 700, 1.5] });
      }
    },
    chest(S, t, d) {
      for (let k = 0; k < 6; k++) {
        S.osc('sine', 100, t + k * 0.12, 0.13, 0.5, d, { f1: 55 });
        S.noise(t + k * 0.12, 0.06, 0.12, d, ['lowpass', 400, 1]);
      }
    },
    squawk(S, t, d) { for (let k = 0; k < 3; k++) S.osc('square', 820, t + k * 0.15, 0.11, 0.08, d, { f1: 600, filter: ['bandpass', 1300, 2] }); },
    honkHigh(S, t, d) { for (let k = 0; k < 2; k++) S.osc('sawtooth', 520, t + k * 0.22, 0.16, 0.1, d, { f1: 440, filter: ['bandpass', 1000, 2.5] }); },
    snort(S, t, d) {
      S.noise(t, 0.3, 0.35, d, ['bandpass', 380, 1.4]);
      S.noise(t + 0.38, 0.25, 0.25, d, ['bandpass', 320, 1.4]);
    },
    honk(S, t, d) {
      for (let k = 0; k < 3; k++) S.osc('sawtooth', 140 - k * 12, t + k * 0.28, 0.3, 0.26, d, { f1: 95, attack: 0.04, filter: ['lowpass', 650, 3] });
    },
    bleat(S, t, d) { S.osc('triangle', 540, t, 0.5, 0.16, d, { f1: 440, vib: [9, 25], filter: ['lowpass', 2000, 1] }); },
    boing(S, t, d) { S.osc('sine', 170, t, 0.3, 0.25, d, { f1: 640, glide: 0.22 }); },
    groan(S, t, d) { S.osc('sawtooth', 155, t, 0.95, 0.2, d, { f1: 105, vib: [5, 10], filter: ['lowpass', 700, 2], attack: 0.12 }); },
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
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = rand(2, 7);
      if (!this.muted) this.bird();
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

  musicStep(i, t) {
    const chords = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]];
    const pos = i % 16, chord = chords[Math.floor(i / 16) % 4];
    if (pos % 4 === 0) {
      const f = 440 * Math.pow(2, (36 + chord[0] + (pos === 8 ? 7 : 0) - 69) / 12);
      this.osc('triangle', f, t, 0.4, 0.16, this.musicBus);
    }
    if (pos % 2 === 1) this.noise(t, 0.04, 0.012, this.musicBus, ['highpass', 7000, 1]);
    if (pos === 0 || pos === 6 || pos === 10) for (const n of chord) this.marimba(60 + n, t, 0.035);
    // melody: a fixed 64-step phrase drawn from the pentatonic scale
    const phrase = i % 64;
    if (hash2(phrase, 11) < 0.55) {
      const scale = [0, 2, 4, 7, 9], deg = Math.floor(hash2(phrase, 12) * 8);
      this.marimba(72 + scale[deg % 5] + 12 * Math.floor(deg / 5), t, 0.06);
    }
  },
};
