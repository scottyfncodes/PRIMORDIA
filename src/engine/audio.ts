/**
 * Procedural WebAudio soundscape — no audio files.
 * Calm underwater ambience, soft organic feedback, and tension cues.
 */
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambient!: GainNode;
  private reverb!: ConvolverNode;
  private wet!: GainNode;
  private dangerGain!: GainNode;
  private dangerOsc!: OscillatorNode;
  private dangerLfo!: OscillatorNode;
  private padFilter!: BiquadFilterNode;
  private noiseBuf!: AudioBuffer;
  enabled = true;
  private plinkT = 2;
  private lastEat = 0;
  private lastAbsorb = 0;

  /** Must be called from a user gesture (iOS). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.8 : 0;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.7;
    this.ambient = ctx.createGain(); this.ambient.gain.value = 0;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.5;
    this.sfx.connect(this.master);
    this.sfx.connect(this.reverb);
    this.ambient.connect(this.master);
    this.ambient.connect(this.reverb);
    this.reverb.connect(this.wet);
    this.wet.connect(this.master);
    // noise
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = (b + (Math.random() * 2 - 1) * 0.02) * 0.995; d[i] = b * 6; }
    this.startAmbience();
    this.startDanger();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.1);
  }

  private impulse(sec: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  private startAmbience() {
    const ctx = this.ctx!;
    // deep drifting pad
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 420;
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.ambient);
    const notes = [55, 82.4, 110, 164.8];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 6;
      const g = ctx.createGain();
      g.gain.value = 0.08 / (i + 1);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + i * 0.03;
      const lg = ctx.createGain(); lg.gain.value = 0.04 / (i + 1);
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(this.padFilter);
      o.start(); lfo.start();
    });
    // underwater rumble
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf; n.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 260;
    const ng = ctx.createGain(); ng.gain.value = 0.16;
    n.connect(nf); nf.connect(ng); ng.connect(this.ambient);
    n.start();
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 120;
    lfo.connect(lg); lg.connect(nf.frequency); lfo.start();
    this.ambient.gain.setTargetAtTime(0.9, ctx.currentTime, 2);
  }

  private startDanger() {
    const ctx = this.ctx!;
    this.dangerOsc = ctx.createOscillator();
    this.dangerOsc.type = 'sine';
    this.dangerOsc.frequency.value = 48;
    this.dangerGain = ctx.createGain();
    this.dangerGain.gain.value = 0;
    const pulse = ctx.createGain(); pulse.gain.value = 0.5;
    this.dangerLfo = ctx.createOscillator();
    this.dangerLfo.frequency.value = 1.6;
    const lg = ctx.createGain(); lg.gain.value = 0.5;
    this.dangerLfo.connect(lg); lg.connect(pulse.gain);
    this.dangerOsc.connect(pulse); pulse.connect(this.dangerGain); this.dangerGain.connect(this.master);
    this.dangerOsc.start(); this.dangerLfo.start();
  }

  /** Per-frame ambience modulation. */
  update(dt: number, danger: number, light: number, depth: number, playing: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.dangerGain.gain.setTargetAtTime(playing ? danger * danger * 0.5 : 0, t, 0.15);
    this.dangerLfo.frequency.setTargetAtTime(1.2 + danger * 2.2, t, 0.3);
    this.padFilter.frequency.setTargetAtTime(240 + light * 700 - depth * 80, t, 0.8);
    // occasional distant bioluminescent plinks
    this.plinkT -= dt;
    if (this.plinkT <= 0) {
      this.plinkT = 1.6 + Math.random() * 4;
      const base = 440 * Math.pow(2, PENTA[Math.floor(Math.random() * PENTA.length)] / 12) * (light > 0.4 ? 1 : 0.5);
      this.tone(base, 0.0, 2.4, 0.025, 'sine', 0.002);
    }
  }

  private tone(freq: number, glide: number, dur: number, vol: number, type: OscillatorType = 'sine', attack = 0.005, dest?: AudioNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, freq: number, vol: number, q = 1, type: BiquadFilterType = 'bandpass', sweep = 1) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ───────────── cues ─────────────
  eat(sizeRatio: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastEat < 0.05) return;
    this.lastEat = now;
    const f = 520 / Math.max(0.4, Math.sqrt(sizeRatio));
    this.tone(f, 0.45, 0.28, 0.14, 'sine', 0.004);
    this.tone(f * 1.5, 0.6, 0.18, 0.05, 'triangle', 0.004);
    this.noise(0.18, 900, 0.08, 2, 'bandpass', 0.4);
  }
  absorb(dna: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastAbsorb < 0.04) return;
    this.lastAbsorb = now;
    const f = 880 * Math.pow(2, PENTA[Math.floor(Math.random() * 6)] / 12);
    this.tone(f, 1.02, dna ? 0.5 : 0.16, dna ? 0.07 : 0.035, 'sine', 0.003);
    if (dna) this.tone(f * 1.5, 1, 0.6, 0.04, 'sine', 0.01);
  }
  bite() {
    if (!this.ctx) return;
    this.tone(110, 0.5, 0.35, 0.3, 'triangle', 0.003);
    this.noise(0.3, 400, 0.25, 1.2, 'lowpass', 0.3);
  }
  blocked() { if (!this.ctx) return; this.tone(300, 1.4, 0.25, 0.12, 'triangle', 0.003); this.noise(0.15, 2400, 0.08, 4); }
  bounce() { if (!this.ctx) return; this.tone(180, 0.8, 0.12, 0.08, 'sine', 0.003); }
  spiny() { if (!this.ctx) return; this.noise(0.12, 3200, 0.12, 6); this.tone(700, 0.5, 0.1, 0.05, 'square', 0.002); }
  burst() { if (!this.ctx) return; this.noise(0.35, 500, 0.18, 0.8, 'bandpass', 3); }
  ability(id: string) {
    if (!this.ctx) return;
    if (id === 'engulf') { this.tone(200, 2.2, 0.35, 0.12, 'sine'); this.noise(0.3, 300, 0.12, 1, 'lowpass', 3); }
    if (id === 'harden') { this.tone(330, 1, 0.6, 0.1, 'triangle'); this.tone(495, 1, 0.6, 0.06, 'triangle'); }
    if (id === 'pulse') { this.tone(660, 0.5, 1.2, 0.12, 'sine', 0.002); this.tone(990, 0.5, 1.0, 0.05, 'sine', 0.002); }
    if (id === 'toxin') { this.noise(1.2, 700, 0.2, 0.7, 'bandpass', 0.3); this.tone(140, 0.7, 0.9, 0.08, 'sawtooth', 0.05); }
  }
  discover() {
    if (!this.ctx) return;
    [0, 7, 12].forEach((s, i) => setTimeout(() => this.tone(660 * Math.pow(2, s / 12), 1, 0.9, 0.06, 'sine', 0.01), i * 90));
  }
  mutation() {
    if (!this.ctx) return;
    [0, 4, 7, 11, 14, 19].forEach((s, i) => setTimeout(() => this.tone(330 * Math.pow(2, s / 12), 1, 1.4, 0.07, 'sine', 0.02), i * 70));
    this.noise(1.4, 600, 0.06, 0.6, 'bandpass', 4);
  }
  leap() {
    if (!this.ctx) return;
    this.tone(55, 4, 3, 0.25, 'sawtooth', 1.2);
    [0, 7, 12, 16, 19, 24].forEach((s, i) => setTimeout(() => this.tone(220 * Math.pow(2, s / 12), 1, 3, 0.07, 'sine', 0.3), 400 + i * 160));
  }
  death() {
    if (!this.ctx) return;
    this.tone(330, 0.25, 2.5, 0.2, 'triangle', 0.01);
    this.tone(247, 0.25, 2.8, 0.12, 'sine', 0.05);
    this.noise(2, 800, 0.15, 0.6, 'lowpass', 0.1);
  }
  ui() { if (!this.ctx) return; this.tone(880, 1, 0.12, 0.04, 'sine', 0.002); }
  heat() { if (!this.ctx) return; this.noise(0.3, 1800, 0.06, 2); }
}
