/**
 * Every sound is synthesised with the Web Audio API: no audio files.
 * The context starts on the first user gesture (browser autoplay rules).
 */

export interface Sfx {
  /** Call from a user gesture to start audio. */
  unlock(): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  clack(intensity?: number): void;
  pickup(): void;
  thunk(): void;
  whoosh(): void;
  tap(): void;
  softDrop(): void;
  undo(): void;
  chime(step: number): void;
  /** Sand sweep for `seconds`. */
  hiss(seconds: number): void;
  /** Plate compactor for `seconds`. */
  rumble(seconds: number): void;
  ambient(on: boolean): void;
}

export class WebSfx implements Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.8;
  private muted = false;
  private ambientOn = false;
  private ambientNodes: AudioNode[] = [];
  private birdTimer: ReturnType<typeof setTimeout> | null = null;

  unlock(): void {
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master = this.ctx.createGain();
      this.master.connect(comp).connect(this.ctx.destination);
      this.applyVolume();
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this.ambientOn) this.startAmbient();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    this.applyVolume();
  }
  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolume();
  }
  private applyVolume(): void {
    if (!this.master || !this.ctx) return;
    const v = this.muted ? 0 : this.volume * this.volume; // perceptual curve
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private ready(): AudioContext | null {
    return this.ctx && this.master && this.noise && !this.muted ? this.ctx : null;
  }

  private noiseSrc(ctx: AudioContext): AudioBufferSourceNode {
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  private env(
    ctx: AudioContext,
    peak: number,
    attack: number,
    decay: number,
    t = ctx.currentTime,
  ): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private burst(
    freq: number,
    q: number,
    peak: number,
    decay: number,
    type: BiquadFilterType = 'bandpass',
    at?: number,
  ): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = at ?? ctx.currentTime;
    const src = this.noiseSrc(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.env(ctx, peak, 0.002, decay, t);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 1.5);
    src.stop(t + decay + 0.05);
  }

  private tone(
    freq: number,
    endFreq: number,
    peak: number,
    decay: number,
    type: OscillatorType = 'sine',
    at?: number,
    attack = 0.003,
  ): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = at ?? ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + decay);
    const g = this.env(ctx, peak, attack, decay, t);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  clack(intensity = 1): void {
    const r = 0.92 + Math.random() * 0.16;
    this.burst(2100 * r, 1.6, 0.5 * intensity, 0.05);
    this.burst(900 * r, 1.2, 0.25 * intensity, 0.07);
    this.tone(150 * r, 70, 0.55 * intensity, 0.12);
  }

  pickup(): void {
    const r = 0.9 + Math.random() * 0.2;
    this.burst(3200 * r, 3, 0.12, 0.03);
    this.tone(320 * r, 260, 0.05, 0.05);
  }

  thunk(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(4200, 6, 0.25, 0.04, 'bandpass', t); // blade on stone
    this.burst(700, 0.9, 0.6, 0.16, 'lowpass', t + 0.005);
    this.tone(95, 45, 0.8, 0.2, 'sine', t + 0.004);
    // crackle of the split
    for (let i = 0; i < 5; i++)
      this.burst(
        1500 + Math.random() * 2500,
        4,
        0.12,
        0.02,
        'bandpass',
        t + 0.03 + i * 0.018 + Math.random() * 0.01,
      );
  }

  whoosh(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSrc(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(2200, t + 0.22);
    const g = this.env(ctx, 0.12, 0.08, 0.18, t);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + 0.35);
  }

  tap(): void {
    this.tone(660, 520, 0.08, 0.06, 'sine');
    this.burst(2600, 4, 0.04, 0.02);
  }

  softDrop(): void {
    this.tone(220, 140, 0.15, 0.1);
    this.burst(1200, 1.5, 0.08, 0.04);
  }

  undo(): void {
    this.tone(500, 330, 0.08, 0.12, 'triangle');
    this.burst(2400, 3, 0.05, 0.03);
  }

  chime(step: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const f = notes[Math.min(step, notes.length - 1)]!;
    const t = ctx.currentTime;
    this.tone(f, f, 0.22, 0.9, 'sine', t, 0.005);
    this.tone(f * 2, f * 2, 0.05, 0.5, 'sine', t, 0.005);
    this.tone(f * 3.01, f * 3.01, 0.025, 0.25, 'sine', t, 0.005);
  }

  hiss(seconds: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSrc(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4500;
    bp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.3);
    g.gain.setValueAtTime(0.16, t + seconds - 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + seconds);
    // broom strokes: amplitude wobble
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.09;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(hp).connect(bp).connect(g).connect(this.master!);
    src.start(t);
    lfo.start(t);
    src.stop(t + seconds + 0.1);
    lfo.stop(t + seconds + 0.1);
  }

  rumble(seconds: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(0.5, t + 0.4);
    out.gain.setValueAtTime(0.5, t + seconds - 0.6);
    out.gain.linearRampToValueAtTime(0.0001, t + seconds);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.connect(out).connect(this.master!);
    // engine thump: amplitude-modulated low oscillators
    const am = ctx.createGain();
    am.gain.value = 0.5;
    const chug = ctx.createOscillator();
    chug.frequency.value = 13;
    const chugDepth = ctx.createGain();
    chugDepth.gain.value = 0.4;
    chug.connect(chugDepth).connect(am.gain);
    for (const [f, type, v] of [
      [42, 'sawtooth', 0.35],
      [84, 'square', 0.12],
      [31, 'sine', 0.5],
    ] as [number, OscillatorType, number][]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * (0.98 + Math.random() * 0.04);
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(g).connect(am);
      o.start(t);
      o.stop(t + seconds + 0.1);
    }
    const n = this.noiseSrc(ctx);
    const ng = ctx.createGain();
    ng.gain.value = 0.25;
    n.connect(ng).connect(am);
    n.start(t);
    n.stop(t + seconds + 0.1);
    am.connect(lp);
    chug.start(t);
    chug.stop(t + seconds + 0.1);
  }

  ambient(on: boolean): void {
    this.ambientOn = on;
    if (on) this.startAmbient();
    else this.stopAmbient();
  }

  private startAmbient(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.ambientNodes.length) return;
    const t = ctx.currentTime;
    const src = this.noiseSrc(ctx);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(0.05, t + 3);
    // gusts: slow LFOs on the filter and the level
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 180;
    lfo.connect(lfoG).connect(lp.frequency);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.13;
    const lfo2G = ctx.createGain();
    lfo2G.gain.value = 0.025;
    lfo2.connect(lfo2G).connect(g.gain);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    lfo.start(t);
    lfo2.start(t);
    this.ambientNodes = [src, lfo, lfo2, g];
    const scheduleBird = (): void => {
      this.birdTimer = setTimeout(
        () => {
          if (!this.ambientOn) return;
          this.bird();
          scheduleBird();
        },
        5000 + Math.random() * 9000,
      );
    };
    scheduleBird();
  }

  private stopAmbient(): void {
    for (const n of this.ambientNodes) {
      try {
        (n as AudioScheduledSourceNode).stop?.();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.ambientNodes = [];
    if (this.birdTimer) clearTimeout(this.birdTimer);
    this.birdTimer = null;
  }

  private bird(): void {
    const ctx = this.ready();
    if (!ctx || document.hidden) return;
    const t = ctx.currentTime;
    const base = 2400 + Math.random() * 1600;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const at = t + i * (0.09 + Math.random() * 0.05);
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = base * (0.9 + Math.random() * 0.25);
      o.frequency.setValueAtTime(f0, at);
      o.frequency.exponentialRampToValueAtTime(f0 * (1.15 + Math.random() * 0.3), at + 0.05);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.85, at + 0.08);
      const g = this.env(ctx, 0.022, 0.01, 0.07, at);
      const pan = ctx.createStereoPanner?.();
      if (pan) {
        pan.pan.value = Math.random() * 1.6 - 0.8;
        o.connect(g).connect(pan).connect(this.master!);
      } else o.connect(g).connect(this.master!);
      o.start(at);
      o.stop(at + 0.12);
    }
  }
}
