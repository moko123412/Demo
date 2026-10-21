'use strict';
// Synthesized audio: animal calls, UI and building sounds, ambience and music.
// Everything is generated with the Web Audio API, so there are no sound files.

const ANIMAL_CALLS = {
  lion: 'roar', tiger: 'growl', cheetah: 'chirp', elephant: 'trumpet', giraffe: 'hum', zebra: 'bark',
  gorilla: 'chest', grizzly: 'growl', penguin: 'penguin', rhino: 'snort', hippo: 'wheeze', flamingo: 'goose',
  polarbear: 'growl', panda: 'bleat', kangaroo: 'cluck', camel: 'groan',
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
  // Distant sounds (zoomed out, or near the screen edge) are muffled like real distance.
  spot(x, y, base = 1, bus = this.sfxBus) {
    const p = tileToScreen(x, y);
    if (p.x < -80 || p.x > viewW + 80 || p.y < -80 || p.y > viewH + 80) return null;
    const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    const far = Math.hypot(p.x - viewW / 2, p.y - viewH / 2) / Math.max(viewW, viewH);
    g.gain.value = base * (0.35 + 0.65 * Math.min(1, cam.zoom)) * (1 - far * 0.5);
    lp.type = 'lowpass';
    lp.frequency.value = (1800 + 14000 * Math.min(1, cam.zoom / 1.2)) * (1 - far * 0.6);
    g.connect(lp);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = clamp((p.x / viewW) * 2 - 1, -1, 1) * 0.7;
      lp.connect(pan).connect(bus);
    } else lp.connect(bus);
    return g;
  },

  // Slowly wandering random signal (filtered noise), used for natural wobble.
  wander(t, dur, rate, amount, target) {
    const ctx = this.ctx, n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = this.noiseBuf;
    n.loop = true;
    lp.type = 'lowpass';
    lp.frequency.value = rate;
    g.gain.value = amount;
    n.connect(lp).connect(g).connect(target);
    n.start(t, Math.random() * 1.5);
    n.stop(t + dur + 0.05);
  },

  // A vocal sound: a buzzing source with natural pitch jitter and loudness
  // shimmer, an optional raspy throat, breath noise, all shaped by formants.
  voice(t, dur, vol, dest, o) {
    const ctx = this.ctx, src = ctx.createOscillator(), amp = ctx.createGain(), out = ctx.createGain();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(o.f0, t);
    if (o.peak) src.frequency.linearRampToValueAtTime(o.peak, t + dur * (o.peakAt || 0.3));
    src.frequency.exponentialRampToValueAtTime(o.f1 || o.f0 * 0.7, t + dur);
    this.wander(t, dur, 30, o.f0 * (o.jitter != null ? o.jitter : 0.04) * 8, src.frequency);
    amp.gain.value = 0.6;
    this.wander(t, dur, 45, o.shimmer != null ? o.shimmer : 1.2, amp.gain);
    if (o.rough) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.rough[0];
      lg.gain.value = o.rough[1];
      lfo.connect(lg).connect(amp.gain);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    src.connect(amp);
    if (o.breath) {
      const n = ctx.createBufferSource(), ng = ctx.createGain();
      n.buffer = this.noiseBuf;
      ng.gain.value = o.breath;
      n.connect(ng).connect(amp);
      n.start(t, Math.random() * 1.5, dur + 0.05);
    }
    let shaped = amp;
    if (o.rasp) {
      if (!this.raspCurve) {
        const k = 4, curve = new Float32Array(1024);
        for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(k * (x + 0.15)) - Math.tanh(k * 0.15); }
        this.raspCurve = curve;
      }
      const ws = ctx.createWaveShaper(), pre = ctx.createGain();
      ws.curve = this.raspCurve;
      pre.gain.value = 1 + o.rasp * 3;
      amp.connect(pre).connect(ws);
      shaped = ws;
    }
    for (const [f, q, g] of o.formants) {
      const bp = ctx.createBiquadFilter(), fg = ctx.createGain();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f, t);
      if (o.shift) bp.frequency.linearRampToValueAtTime(f * o.shift, t + dur);
      bp.Q.value = q;
      fg.gain.value = g;
      shaped.connect(bp).connect(fg).connect(out);
    }
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.06));
    out.gain.setTargetAtTime(vol * 0.7, t + dur * 0.4, dur * 0.2);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(dest || this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.05);
  },

  // ---------- animal calls, modelled on how each species really sounds ----------
  calls: {
    // a full roar, then the trailing series of grunts lions make
    roar(S, t, d) {
      S.voice(t, 1.7, 0.85, d, { f0: 95, peak: 155, peakAt: 0.25, f1: 62, rasp: 0.6, breath: 0.35, jitter: 0.06, attack: 0.18, formants: [[380, 4, 1.2], [850, 5, 0.6], [2100, 6, 0.2]], shift: 0.75 });
      S.osc('sine', 46, t, 1.5, 0.3, d, { f1: 36, attack: 0.25 });
      let at = t + 2.0;
      for (let k = 0; k < 6; k++) {
        S.voice(at, 0.38, 0.65 * Math.pow(0.84, k), d, { f0: 92 - k * 3, f1: 70, rasp: 0.5, breath: 0.4, attack: 0.04, formants: [[340, 4, 1.2], [760, 5, 0.5]] });
        at += 0.62 + k * 0.08;
      }
    },
    growl(S, t, d) {
      S.voice(t, 1.3, 0.8, d, { f0: 68, peak: 82, f1: 56, rough: [30, 0.5], rasp: 0.8, breath: 0.45, attack: 0.12, formants: [[320, 4, 1.3], [760, 5, 0.5], [1600, 6, 0.15]] });
      S.voice(t + 1.45, 0.5, 0.45, d, { f0: 74, f1: 60, rasp: 0.6, breath: 0.6, attack: 0.05, formants: [[300, 4, 1.2], [700, 5, 0.5]] });
    },
    // cheetahs famously chirp like birds
    chirp(S, t, d) {
      for (let k = 0; k < 4; k++) {
        const at = t + k * rand(0.22, 0.32);
        S.voice(at, 0.13, 0.35, d, { f0: 1750, peak: 2150, peakAt: 0.2, f1: 1450, breath: 0.15, jitter: 0.02, attack: 0.01, formants: [[2000, 3, 1], [3800, 5, 0.3]] });
      }
    },
    // a low rumble, then the brassy, raspy trumpet
    trumpet(S, t, d) {
      S.osc('sine', 32, t, 0.9, 0.35, d, { f1: 28, attack: 0.2 });
      S.voice(t + 0.25, 1.4, 0.6, d, { f0: 360, peak: 660, peakAt: 0.18, f1: 470, rasp: 1.2, breath: 0.4, jitter: 0.05, attack: 0.03, formants: [[850, 3, 1], [1700, 4, 0.8], [3100, 5, 0.45]] });
      S.noise(t + 0.25, 1.2, 0.08, d, ['highpass', 2600, 1], 0.04);
    },
    hum(S, t, d) {
      S.voice(t, 1.4, 0.35, d, { f0: 62, f1: 55, jitter: 0.02, attack: 0.3, formants: [[180, 3, 1.3], [420, 4, 0.4]] });
    },
    // zebras bark: a squeaky in-breath, then a short honking "a-ha"
    bark(S, t, d) {
      let at = t;
      for (let k = 0; k < 5; k++) {
        S.voice(at, 0.09, 0.25, d, { f0: 950, f1: 1100, breath: 0.5, attack: 0.01, formants: [[1800, 5, 1], [3200, 6, 0.4]] });
        S.voice(at + 0.1, 0.16, 0.55, d, { f0: 330, f1: 250, rasp: 0.7, breath: 0.25, attack: 0.01, formants: [[700, 4, 1], [1400, 5, 0.6], [2600, 6, 0.2]] });
        at += 0.36 + k * 0.03;
      }
    },
    // cupped hands on a big chest: hollow, resonant pok-pok-pok, speeding up
    chest(S, t, d) {
      let at = t;
      for (let k = 0; k < 9; k++) {
        S.osc('sine', 210, at, 0.12, 0.45, d, { f1: 130 });
        S.noise(at, 0.08, 0.35, d, ['bandpass', 240, 7]);
        at += Math.max(0.07, 0.15 - k * 0.012);
      }
      S.voice(at + 0.1, 0.5, 0.35, d, { f0: 110, f1: 85, rasp: 0.6, breath: 0.5, formants: [[400, 4, 1], [900, 5, 0.4]] });
    },
    // emperor penguins sing with two voices at once, which beat against each other
    penguin(S, t, d) {
      for (let k = 0; k < 3; k++) {
        const at = t + k * 0.65;
        S.voice(at, 0.5, 0.3, d, { f0: 470, f1: 430, rough: [22, 0.5], jitter: 0.02, attack: 0.03, formants: [[1100, 5, 1], [2400, 6, 0.4]] });
        S.voice(at, 0.5, 0.25, d, { f0: 505, f1: 455, jitter: 0.02, attack: 0.03, formants: [[1100, 5, 1], [2400, 6, 0.4]] });
      }
    },
    // goose-like honks from a flock
    goose(S, t, d) {
      let at = t;
      for (let k = 0; k < randi(3, 5); k++) {
        const f = rand(380, 460);
        S.voice(at, 0.17, 0.4, d, { f0: f, f1: f * 0.85, rasp: 0.9, breath: 0.2, attack: 0.015, formants: [[950, 6, 1], [2500, 7, 0.5]] });
        at += rand(0.18, 0.4);
      }
    },
    snort(S, t, d) {
      S.noise(t, 0.35, 0.4, d, ['bandpass', 340, 1.6], 0.02);
      S.voice(t + 0.05, 0.3, 0.3, d, { f0: 85, f1: 70, rasp: 0.5, breath: 0.8, formants: [[300, 4, 1], [700, 5, 0.4]] });
      S.noise(t + 0.55, 0.28, 0.3, d, ['bandpass', 300, 1.6], 0.02);
    },
    // a rising wheeze, then a run of deep honks that slow down
    wheeze(S, t, d) {
      S.noise(t, 0.6, 0.18, d, ['bandpass', 600, 2, 1300], 0.2);
      let at = t + 0.65;
      for (let k = 0; k < 5; k++) {
        S.voice(at, 0.26, 0.75 * Math.pow(0.88, k), d, { f0: 118 - k * 7, f1: 84, rasp: 0.9, breath: 0.3, attack: 0.02, formants: [[360, 4, 1.3], [720, 5, 0.5], [1500, 6, 0.15]] });
        at += 0.27 + k * 0.05;
      }
    },
    bleat(S, t, d) {
      S.voice(t, 0.6, 0.35, d, { f0: 470, f1: 400, rough: [8, 0.6], jitter: 0.03, breath: 0.2, attack: 0.04, formants: [[800, 5, 1], [1700, 6, 0.5]] });
    },
    // soft clucks and coughs
    cluck(S, t, d) {
      for (let k = 0; k < 3; k++) S.noise(t + k * 0.16, 0.05, 0.3, d, ['bandpass', 1300, 3], 0.003);
      S.voice(t + 0.55, 0.22, 0.3, d, { f0: 140, f1: 120, breath: 0.6, rasp: 0.4, formants: [[500, 4, 1], [1100, 5, 0.4]] });
    },
    // a gurgling groan
    groan(S, t, d) {
      S.voice(t, 1.3, 0.55, d, { f0: 130, peak: 165, f1: 92, rough: [14, 0.7], rasp: 0.8, breath: 0.4, attack: 0.12, formants: [[480, 4, 1], [1050, 5, 0.5]], shift: 0.8 });
    },
  },

  animal(a, vol = 1) {
    if (!this.ok('a' + a.id, 6)) return;
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
    // crowd murmur: three voice bands, each rising and falling at syllable rate
    this.crowd = this.ctx.createGain();
    this.crowd.gain.value = 0;
    this.crowd.connect(this.ambBus);
    for (const [f, q, rate] of [[320, 1.3, 3.7], [780, 1.6, 4.9], [1650, 2, 6.3]]) {
      const band = this.loopNoise('bandpass', f, q, this.crowd), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      band.gain.value = 0.55;
      lfo.frequency.value = rate;
      lg.gain.value = 0.45;
      lfo.connect(lg).connect(band.gain);
      lfo.start();
    }
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

  // A short song from one of several bird types, somewhere off to the side.
  bird() {
    const ctx = this.ctx, t = ctx.currentTime;
    let d = this.ambBus;
    if (ctx.createStereoPanner) { const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.85, 0.85); pan.connect(this.ambBus); d = pan; }
    const base = rand(2200, 4200), v = rand(0.018, 0.035);
    const note = (at, f0, f1, dur, vol, vib = 0) => this.osc('sine', f0, at, dur, vol, d, { f1, attack: Math.min(0.02, dur / 4), vib: vib ? [vib, f0 * 0.04] : null });
    switch (pick(['whistle', 'whistle', 'trill', 'warble', 'chirps', 'dove'])) {
      case 'whistle': // "fee-bee" style two- or three-note whistle
        note(t, base * 1.25, base * 1.22, 0.28, v);
        note(t + 0.34, base, base * 0.97, 0.32, v);
        if (Math.random() < 0.4) note(t + 0.72, base * 1.05, base * 1.02, 0.25, v * 0.8);
        break;
      case 'trill': {
        const n = randi(9, 16);
        for (let k = 0; k < n; k++) note(t + k * 0.065, base * (1.1 - k * 0.01), base * (0.85 - k * 0.01), 0.045, v * 0.9);
        break;
      }
      case 'warble': { // a fast frequency-modulated warble
        const o = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
        o.frequency.value = base;
        m.frequency.value = rand(22, 38);
        mg.gain.value = base * 0.15;
        m.connect(mg).connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + 0.05);
        g.gain.setTargetAtTime(v * 0.5, t + 0.3, 0.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.connect(g).connect(d);
        o.start(t); m.start(t); o.stop(t + 0.95); m.stop(t + 0.95);
        break;
      }
      case 'chirps':
        for (let k = 0; k < randi(3, 5); k++) note(t + k * rand(0.1, 0.16), base * 1.5, base * 0.8, 0.05, v);
        break;
      case 'dove': // distant cooing
        note(t, 520, 490, 0.35, v * 0.9, 6);
        note(t + 0.45, 560, 470, 0.6, v, 6);
        note(t + 1.15, 500, 480, 0.4, v * 0.8, 6);
        break;
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
    this.water.gain.setTargetAtTime(Math.min(0.05, wet * 0.003) * (0.5 + 0.5 * Math.sin(t * 0.7)), t, 0.4);
    // little bubbles and trickles when water is close
    if (wet && !this.muted && Math.random() < Math.min(0.5, wet * 0.02) * dt * 8) {
      let d = this.ambBus;
      if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = rand(-0.6, 0.6); p.connect(this.ambBus); d = p; }
      const f = rand(450, 1300);
      this.osc('sine', f, t, rand(0.03, 0.07), 0.025 * Math.min(1, cam.zoom), d, { f1: f * rand(1.4, 2), attack: 0.004 });
    }
    // the wind gusts now and then, and drops at night
    this.wind.gain.setTargetAtTime((0.025 + 0.035 * Math.max(0, Math.sin(t * 0.13) * Math.sin(t * 0.37 + 1))) * (1 - dark * 0.5), t, 1.2);
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
