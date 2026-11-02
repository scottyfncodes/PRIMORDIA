import type { Game } from './game';
import type { KV } from './progress';
import { ERAS, FORM_BY_ID, formFor } from './eras';
import { TRAIT_BY_ID } from './traits';
import type { ZoneId } from '../sim/environment';

/**
 * Save & resume for a single life. The lineage (body, mutations, era, run
 * stats) is saved; the surrounding ecosystem is regenerated on resume.
 */
export interface RunSnapshot {
  v: 1;
  savedAt: number;
  player: {
    x: number; y: number; angle: number;
    r: number; energy: number; hp: number; breath: number;
    eraIndex: number; formId: string;
    traits: Record<string, number>;
    traitOrder: string[];
    recentTraits: Record<string, number>;
    dna: number; dnaTotal: number; growth: number; eggsUsed: number;
    /** lineage history (optional: older saves lack it) */
    history?: { era: number; formId: string; traits: string[] }[];
  };
  run: {
    time: number; eaten: number; nutrients: number; dna: number; predatorsEaten: number;
    damageTaken: number; photoEnergy: number;
    zones: ZoneId[]; speciesSeen: string[]; discoveries: string[]; milestones: string[]; formsReached: string[];
  };
  evolveSnoozeDna: number;
  frontierShown: boolean;
  hints: string[];
}

const KEY = 'primordia.run.v1';

export function snapshot(g: Game): RunSnapshot {
  const p = g.player, r = g.run;
  return {
    v: 1,
    savedAt: Date.now(),
    player: {
      x: p.x, y: p.y, angle: p.angle, r: p.r, energy: p.energy, hp: p.hp, breath: p.breath,
      eraIndex: p.eraIndex, formId: p.form.id,
      traits: { ...p.traits }, traitOrder: [...p.traitOrder], recentTraits: { ...p.recentTraits },
      dna: p.dna, dnaTotal: p.dnaTotal, growth: p.growth, eggsUsed: p.eggsUsed,
      history: p.history.map((h) => ({ era: h.era, formId: h.formId, traits: [...h.traits] })),
    },
    run: {
      time: r.time, eaten: r.eaten, nutrients: r.nutrients, dna: r.dna, predatorsEaten: r.predatorsEaten,
      damageTaken: r.damageTaken, photoEnergy: r.photoEnergy,
      zones: [...r.zones], speciesSeen: [...r.speciesSeen], discoveries: [...r.discoveries], milestones: [...r.milestones], formsReached: [...r.formsReached],
    },
    evolveSnoozeDna: g.evolveSnoozeDna,
    frontierShown: g.frontierShown,
    hints: [...g.hintsShown],
  };
}

/** Basic structural validation so a corrupt or outdated save can never crash the game. */
export function isValid(s: unknown): s is RunSnapshot {
  if (!s || typeof s !== 'object') return false;
  const o = s as RunSnapshot;
  if (o.v !== 1 || !o.player || !o.run) return false;
  const p = o.player;
  if (![p.x, p.y, p.r, p.energy, p.hp, p.growth, p.dna].every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  if (!ERAS[p.eraIndex - 1]?.playable) return false;
  if (typeof p.traits !== 'object') return false;
  for (const [id, lv] of Object.entries(p.traits)) {
    const t = TRAIT_BY_ID[id];
    if (!t || typeof lv !== 'number' || lv < 1 || lv > t.levels.length) return false;
  }
  return true;
}

export class RunStore {
  constructor(private store: KV | null) {}
  static fromWindow(): RunStore {
    try { const s = window.localStorage; s.getItem('x'); return new RunStore(s); } catch { return new RunStore(null); }
  }
  load(): RunSnapshot | null {
    if (!this.store) return null;
    try {
      const raw = this.store.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return isValid(s) ? s : null;
    } catch { return null; }
  }
  save(s: RunSnapshot) {
    try { this.store?.setItem(KEY, JSON.stringify(s)); } catch { /* quota / private mode */ }
  }
  clear() {
    try { this.store?.setItem(KEY, ''); } catch { /* ignore */ }
  }
}

/** Apply a snapshot to a game (called by Game.resumeRun). */
export function restoreInto(g: Game, s: RunSnapshot) {
  const p = g.player, sp = s.player;
  p.traits = { ...sp.traits };
  p.traitOrder = sp.traitOrder.filter((id) => p.traits[id]);
  p.recentTraits = { ...(sp.recentTraits || {}) };
  p.eraIndex = sp.eraIndex;
  p.form = FORM_BY_ID[sp.formId] && FORM_BY_ID[sp.formId].era === sp.eraIndex ? FORM_BY_ID[sp.formId] : formFor(sp.eraIndex, p.leapArchetype);
  p.refresh();
  p.x = sp.x; p.y = sp.y; p.vx = 0; p.vy = 0; p.angle = sp.angle || 0;
  p.r = p.targetR = sp.r;
  p.energy = Math.min(sp.energy, p.maxEnergy);
  p.hp = Math.max(1, Math.min(sp.hp, p.maxHp));
  p.breath = sp.breath ?? 1;
  p.dna = sp.dna; p.dnaTotal = sp.dnaTotal; p.growth = sp.growth; p.eggsUsed = sp.eggsUsed || 0;
  const hist = Array.isArray(sp.history) ? sp.history.filter((h) => h && FORM_BY_ID[h.formId] && Array.isArray(h.traits)) : [];
  if (hist.length && hist[hist.length - 1].era === p.eraIndex) {
    p.history = hist.map((h) => ({ era: h.era, formId: h.formId, traits: h.traits.filter((id) => typeof id === 'string' && p.traits[id]) }));
  } else {
    // older save: rebuild a best-effort lineage with every mutation in the current era
    const traits = p.traitOrder.flatMap((id) => Array(p.traits[id]).fill(id) as string[]);
    p.history = p.eraIndex > 1 ? [{ era: 1, formId: 'protocell', traits: [] }, { era: p.eraIndex, formId: p.form.id, traits }] : [{ era: 1, formId: p.form.id, traits }];
  }
  const r = g.run, sr = s.run;
  r.time = sr.time; r.eaten = sr.eaten; r.nutrients = sr.nutrients; r.dna = sr.dna; r.predatorsEaten = sr.predatorsEaten;
  r.damageTaken = sr.damageTaken; r.photoEnergy = sr.photoEnergy;
  r.zones = new Set(sr.zones); r.speciesSeen = new Set(sr.speciesSeen);
  r.discoveries = [...sr.discoveries]; r.milestones = [...sr.milestones]; r.formsReached = [...sr.formsReached];
  g.evolveSnoozeDna = s.evolveSnoozeDna || 0;
  g.frontierShown = !!s.frontierShown;
  g.hintsShown = new Set(s.hints || []);
}
