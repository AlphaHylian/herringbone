/**
 * Synthesised site sounds: concrete blocks knocking together, the splitter's crunch, gravel
 * footsteps, a chalk scratch, and a quiet outdoor bed of wind, birds and distant traffic.
 */

export class SiteAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.8;
  private muted = false;
  private birdTimer = 0;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setVolume(v: number, muted: boolean): void {
    this.volume = v;
    this.muted = muted;
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(muted ? 0 : v, this.ctx.currentTime, 0.05);
  }

  private src(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noise) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    return s;
  }

  private env(gain: number, attack: number, decay: number, at = 0): GainNode | null {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** Short filtered noise burst. */
  private burst(
    freq: number,
    q: number,
    gain: number,
    decay: number,
    at = 0,
    type: BiquadFilterType = 'bandpass',
  ): void {
    const ctx = this.ctx;
    const s = this.src();
    const e = this.env(gain, 0.002, decay, at);
    if (!ctx || !s || !e || !this.master) return;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    s.connect(f).connect(e).connect(this.master);
    const t = ctx.currentTime + at;
    s.start(t, Math.random() * 1.5);
    s.stop(t + decay + 0.05);
  }

  private tone(
    freq: number,
    gain: number,
    decay: number,
    at = 0,
    type: OscillatorType = 'sine',
    slide = 1,
  ): void {
    const ctx = this.ctx;
    const e = this.env(gain, 0.003, decay, at);
    if (!ctx || !e || !this.master) return;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime + at;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + decay);
    o.connect(e).connect(this.master);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  /** A block set down on the sand bed, knocking its neighbour. */
  lay(): void {
    const v = 0.85 + Math.random() * 0.3;
    this.tone(120 * v, 0.35, 0.09, 0, 'sine', 0.7);
    this.burst(900 * v, 1.2, 0.25, 0.05);
    this.burst(2600 * v, 4, 0.22, 0.035, 0.012);
    this.burst(3800 * v, 6, 0.12, 0.03, 0.03);
  }

  /** Blocks clinking as they're lifted off the pack. */
  grab(count: number): void {
    for (let i = 0; i < Math.min(4, count); i++) {
      const v = 0.8 + Math.random() * 0.4;
      this.burst(2200 * v, 5, 0.18, 0.04, i * 0.07);
      this.burst(700 * v, 2, 0.12, 0.05, i * 0.07 + 0.005);
    }
  }

  mark(): void {
    const ctx = this.ctx;
    const s = this.src();
    const e = this.env(0.12, 0.02, 0.18);
    if (!ctx || !s || !e || !this.master) return;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    const t = ctx.currentTime;
    f.frequency.setValueAtTime(3000, t);
    f.frequency.linearRampToValueAtTime(5200, t + 0.2);
    s.connect(f).connect(e).connect(this.master);
    s.start(t);
    s.stop(t + 0.25);
  }

  /** The splitter: lever creak, the crack of the block giving, and the offcut dropping. */
  split(): void {
    this.tone(180, 0.05, 0.18, 0, 'sawtooth', 0.8);
    this.burst(500, 0.8, 0.6, 0.12, 0.16, 'lowpass');
    this.burst(1400, 1.5, 0.5, 0.08, 0.17);
    this.burst(3200, 3, 0.25, 0.05, 0.18);
    this.tone(90, 0.4, 0.12, 0.17, 'sine', 0.6);
    this.burst(800, 2, 0.2, 0.05, 0.42);
    this.burst(2400, 5, 0.12, 0.03, 0.44);
  }

  step(): void {
    const v = 0.7 + Math.random() * 0.6;
    this.burst(1500 * v, 0.7, 0.06, 0.07);
    this.burst(4200 * v, 1.5, 0.03, 0.05, 0.01);
  }

  thud(): void {
    this.tone(70, 0.35, 0.2, 0, 'sine', 0.6);
    this.burst(300, 1, 0.25, 0.12, 0, 'lowpass');
  }

  click(): void {
    this.burst(3000, 4, 0.08, 0.02);
  }

  private startAmbience(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    // Wind: slow-breathing low-passed noise.
    const wind = this.src();
    if (wind) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lg = ctx.createGain();
      lg.gain.value = 0.03;
      lfo.connect(lg).connect(g.gain);
      wind.connect(f).connect(g).connect(this.master);
      wind.start();
      lfo.start();
    }
    // Distant traffic: a deep rumble.
    const road = this.src();
    if (road) {
      road.playbackRate.value = 0.3;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 160;
      const g = ctx.createGain();
      g.gain.value = 0.06;
      road.connect(f).connect(g).connect(this.master);
      road.start();
    }
  }

  /** Call every frame; occasionally a bird sings somewhere. */
  update(dt: number): void {
    if (!this.ctx || this.muted) return;
    this.birdTimer -= dt;
    if (this.birdTimer > 0) return;
    this.birdTimer = 2.5 + Math.random() * 6;
    const base = 2600 + Math.random() * 1800;
    const notes = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < notes; i++) {
      const f = base * (0.85 + Math.random() * 0.35);
      this.tone(f, 0.025, 0.07 + Math.random() * 0.05, i * 0.13, 'sine', 0.8 + Math.random() * 0.5);
    }
  }
}
