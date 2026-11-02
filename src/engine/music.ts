/**
 * Generative score: each era has its own key, mode, tempo and instrumentation.
 * Pads, a soft bass and a sparse melodic line are scheduled ahead of time on
 * the Web Audio clock. Danger thickens the melody; the sea muffles it.
 */
interface EraScore {
  root: number;
  scale: number[];
  chords: number[][];
  bpm: number;
  pad: OscillatorType;
  lead: OscillatorType;
  leadDecay: number;
  density: number;
  bass: 0 | 1 | 2;
  padVol: number;
  leadVol: number;
  bright: number;
}

const SCORES: EraScore[] = [
  // I — Primordial: sparse glassy bells over a still pad
  { root: 146.83, scale: [0, 3, 5, 7, 10], chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [4, 6, 8]], bpm: 54, pad: 'sine', lead: 'sine', leadDecay: 2.4, density: 0.22, bass: 0, padVol: 0.05, leadVol: 0.045, bright: 900 },
  // II — Complex cells: dorian warmth, a soft pulse appears
  { root: 164.81, scale: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 2, 4], [3, 5, 7], [4, 6, 8], [1, 3, 5]], bpm: 60, pad: 'triangle', lead: 'sine', leadDecay: 1.8, density: 0.3, bass: 1, padVol: 0.045, leadVol: 0.045, bright: 1100 },
  // III — Multicellular: lydian shimmer
  { root: 130.81, scale: [0, 2, 4, 6, 7, 9, 11], chords: [[0, 2, 4], [1, 3, 5], [4, 6, 8], [2, 4, 6]], bpm: 64, pad: 'triangle', lead: 'sine', leadDecay: 1.6, density: 0.36, bass: 1, padVol: 0.045, leadVol: 0.05, bright: 1300 },
  // IV — Cambrian: plucked, rhythmic, curious
  { root: 110, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]], bpm: 76, pad: 'triangle', lead: 'triangle', leadDecay: 0.7, density: 0.5, bass: 2, padVol: 0.035, leadVol: 0.055, bright: 1500 },
  // V — Vertebrates: dark phrygian strings and a stalking bass
  { root: 98, scale: [0, 1, 3, 5, 7, 8, 10], chords: [[0, 2, 4], [1, 3, 5], [5, 7, 9], [0, 2, 4]], bpm: 70, pad: 'sawtooth', lead: 'triangle', leadDecay: 1.1, density: 0.4, bass: 2, padVol: 0.03, leadVol: 0.05, bright: 1000 },
  // VI — Land: open major pentatonic under an open sky
  { root: 174.61, scale: [0, 2, 4, 7, 9], chords: [[0, 2, 4], [3, 5, 7], [1, 3, 5], [2, 4, 6]], bpm: 72, pad: 'triangle', lead: 'sine', leadDecay: 1.4, density: 0.45, bass: 1, padVol: 0.04, leadVol: 0.05, bright: 2200 },
];

export class Music {
  private out: GainNode;
  private filter: BiquadFilterNode;
  private score = SCORES[0];
  private era = 1;
  private nextBeat = 0;
  private beat = 0;
  private on = true;
  private switching = -1;

  constructor(private ctx: AudioContext, dest: AudioNode, wet: AudioNode) {
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = this.score.bright;
    this.filter.Q.value = 0.5;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter.connect(this.out);
    this.out.connect(dest);
    this.out.connect(wet);
    this.nextBeat = ctx.currentTime + 0.5;
    this.out.gain.setTargetAtTime(0.9, ctx.currentTime, 2.5);
  }

  setEnabled(on: boolean) {
    this.on = on;
    this.out.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.6);
    if (on) this.nextBeat = this.ctx.currentTime + 0.3;
  }

  /** Crossfade into another era's score. */
  setEra(era: number) {
    const i = Math.max(1, Math.min(SCORES.length, era));
    if (i === this.era) return;
    this.era = i;
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, 0.5);
    this.switching = t + 1.8;
  }

  private note(deg: number, octave = 0) {
    const L = this.score.scale.length;
    const o = Math.floor(deg / L) + octave;
    const semis = this.score.scale[((deg % L) + L) % L] + 12 * o;
    return this.score.root * Math.pow(2, semis / 12);
  }

  private voice(freq: number, start: number, dur: number, vol: number, type: OscillatorType, attack: number, release: number, detune = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.setValueAtTime(vol, Math.max(start + attack, start + dur - release));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(this.filter);
    o.start(start); o.stop(start + dur + 0.05);
  }

  private scheduleBeat(b: number, t: number, danger: number) {
    const sc = this.score;
    const spb = 60 / sc.bpm;
    const bar = Math.floor(b / 4), inBar = b % 4;
    const chord = sc.chords[bar % sc.chords.length];
    if (inBar === 0) {
      // sustained pad: three voices, slightly detuned
      chord.forEach((d, k) => this.voice(this.note(d), t, spb * 4.4, sc.padVol, sc.pad, 1.2, 1.6, (k - 1) * 5));
    }
    if (sc.bass && (inBar === 0 || (sc.bass === 2 && inBar === 2))) {
      this.voice(this.note(chord[0], -1), t, spb * (sc.bass === 2 ? 1.2 : 2.5), sc.padVol * 1.3, 'sine', 0.03, 0.4);
    }
    // melody on beats and off-beats
    const density = Math.min(0.85, sc.density + danger * 0.3);
    for (const half of [0, 0.5]) {
      if (Math.random() < density * (half ? 0.45 : 1)) {
        const pool = Math.random() < 0.6 ? chord : [chord[0] + 1, chord[1] + 1, chord[2] - 1];
        const d = pool[Math.floor(Math.random() * pool.length)];
        const oct = Math.random() < 0.7 ? 1 : 2;
        this.voice(this.note(d, oct), t + half * spb, sc.leadDecay, sc.leadVol * (0.6 + Math.random() * 0.4), sc.lead, 0.006, sc.leadDecay * 0.9);
      }
    }
  }

  update(danger: number, onLand: boolean) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.switching > 0 && now >= this.switching) {
      this.switching = -1;
      this.score = SCORES[this.era - 1];
      this.nextBeat = now + 0.2;
      this.beat = 0;
      if (this.on) this.out.gain.setTargetAtTime(0.9, now, 1.5);
    }
    // the sea muffles the score; open air lets it ring
    this.filter.frequency.setTargetAtTime(onLand ? 5200 : this.score.bright, now, 0.8);
    if (!this.on || this.switching > 0) return;
    if (this.nextBeat < now) this.nextBeat = now + 0.05;
    const spb = 60 / this.score.bpm;
    while (this.nextBeat < now + 0.3) {
      this.scheduleBeat(this.beat, this.nextBeat, danger);
      this.beat++;
      this.nextBeat += spb;
    }
  }
}
