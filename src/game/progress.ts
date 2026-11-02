import type { ZoneId } from '../sim/environment';

/** Persistent discovery progress across runs. Never grants permanent power. */
export interface SaveData {
  v: 1;
  species: Record<string, { seen: number; eaten: number; killedBy: number }>;
  mutations: Record<string, number>;
  forms: Record<string, number>;
  maxEra: number;
  zones: Partial<Record<ZoneId, boolean>>;
  milestones: Record<string, number>;
  records: {
    runs: number;
    bestTime: number;
    bestDna: number;
    mostEaten: number;
    totalEaten: number;
    deaths: Record<string, number>;
  };
  settings: { sound: boolean; music: boolean; controls: 'joystick' | 'drag' };
  tutorialDone: boolean;
}

export const freshSave = (): SaveData => ({
  v: 1,
  species: {},
  mutations: {},
  forms: {},
  maxEra: 1,
  zones: {},
  milestones: {},
  records: { runs: 0, bestTime: 0, bestDna: 0, mostEaten: 0, totalEaten: 0, deaths: {} },
  settings: { sound: true, music: true, controls: 'joystick' },
  tutorialDone: false,
});

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

const KEY = 'primordia.save.v1';

function memoryStore(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

export class Progress {
  data: SaveData;
  private store: KV;
  private dirty = false;
  private saveT = 0;

  constructor(store?: KV) {
    let s: KV;
    try { s = store ?? window.localStorage; s.getItem('x'); } catch { s = memoryStore(); }
    this.store = s;
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = this.store.getItem(KEY);
      if (!raw) return freshSave();
      const parsed = JSON.parse(raw);
      const base = freshSave();
      return {
        ...base,
        ...parsed,
        records: { ...base.records, ...(parsed.records || {}) },
        settings: { ...base.settings, ...(parsed.settings || {}) },
      };
    } catch {
      return freshSave();
    }
  }

  markDirty() { this.dirty = true; }

  /** Throttled save — call each frame. */
  tick(dt: number) {
    this.saveT -= dt;
    if (this.dirty && this.saveT <= 0) this.flush();
  }

  flush() {
    this.saveT = 2;
    this.dirty = false;
    try { this.store.setItem(KEY, JSON.stringify(this.data)); } catch { /* storage full / private mode */ }
  }

  /** returns true if first ever sighting */
  seeSpecies(id: string): boolean {
    const e = this.data.species[id];
    if (e) return false;
    this.data.species[id] = { seen: Date.now(), eaten: 0, killedBy: 0 };
    this.markDirty();
    return true;
  }
  eatSpecies(id: string) {
    this.seeSpecies(id);
    this.data.species[id].eaten++;
    this.data.records.totalEaten++;
    this.markDirty();
  }
  killedBy(id: string) {
    this.seeSpecies(id);
    this.data.species[id].killedBy++;
    this.markDirty();
  }
  /** returns true if this level of mutation was never reached before */
  discoverMutation(id: string, level: number): boolean {
    const prev = this.data.mutations[id] || 0;
    if (level > prev) { this.data.mutations[id] = level; this.markDirty(); return true; }
    return false;
  }
  discoverForm(id: string): boolean {
    const first = !this.data.forms[id];
    this.data.forms[id] = (this.data.forms[id] || 0) + 1;
    this.markDirty();
    return first;
  }
  discoverZone(z: ZoneId): boolean {
    if (this.data.zones[z]) return false;
    this.data.zones[z] = true; this.markDirty();
    return true;
  }
  milestone(id: string): boolean {
    if (this.data.milestones[id]) return false;
    this.data.milestones[id] = Date.now(); this.markDirty();
    return true;
  }
  reachEra(n: number) {
    if (n > this.data.maxEra) { this.data.maxEra = n; this.markDirty(); }
  }
  endRun(time: number, dna: number, eaten: number, cause: string) {
    const r = this.data.records;
    const best = { time: time > r.bestTime, dna: dna > r.bestDna, eaten: eaten > r.mostEaten };
    r.runs++;
    r.bestTime = Math.max(r.bestTime, time);
    r.bestDna = Math.max(r.bestDna, dna);
    r.mostEaten = Math.max(r.mostEaten, eaten);
    r.deaths[cause] = (r.deaths[cause] || 0) + 1;
    this.flush();
    return best;
  }
  reset() { const settings = this.data.settings; this.data = freshSave(); this.data.settings = settings; this.flush(); }
}
