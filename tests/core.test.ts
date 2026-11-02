import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../src/engine/spatial';
import { deriveStats, generateOffers, isEligible, TRAITS, TRAIT_BY_ID, dominantArchetype } from '../src/game/traits';
import { buildPlayerLook } from '../src/game/player';
import { formFor, FORMS } from '../src/game/eras';
import { Progress, type KV } from '../src/game/progress';
import { Game } from '../src/game/game';
import { SPECIES, SPECIES_BY_ID } from '../src/sim/species';

describe('spatial grid', () => {
  it('finds items within radius only', () => {
    const g = new SpatialGrid<{ x: number; y: number; r: number }>(1000, 1000, 100);
    const a = { x: 100, y: 100, r: 5 }, b = { x: 160, y: 100, r: 5 }, c = { x: 600, y: 600, r: 5 };
    [a, b, c].forEach((i) => g.insert(i));
    const out: typeof a[] = [];
    expect(g.query(100, 100, 60, out)).toEqual(expect.arrayContaining([a, b]));
    expect(out).not.toContain(c);
  });
});

describe('traits', () => {
  it('every trait changes mechanics AND visuals at every level', () => {
    const base = deriveStats({});
    const baseLook = JSON.stringify(buildPlayerLook({}, 1, formFor(1, 'opportunist')));
    for (const t of TRAITS) {
      for (let lv = 1; lv <= t.levels.length; lv++) {
        const traits: Record<string, number> = { [t.id]: lv };
        for (const r of t.requires || []) traits[r] = 1;
        const s = deriveStats(traits);
        const reqOnly = deriveStats(Object.fromEntries((t.requires || []).map((r) => [r, 1])));
        expect(JSON.stringify(s), `${t.id} L${lv} stats`).not.toEqual(JSON.stringify(lv === 1 ? reqOnly : deriveStats({ ...traits, [t.id]: lv - 1 })));
        if (t.id !== 'colony') {
          const look = JSON.stringify(buildPlayerLook(traits, 1, formFor(1, 'opportunist')));
          expect(look, `${t.id} look`).not.toEqual(baseLook);
        } else {
          expect(s.satellites).toBe(2 * lv); // colony is rendered as satellites
        }
      }
      void base;
    }
  });
  it('every trait has costs, pros and cons for each level', () => {
    for (const t of TRAITS) for (const l of t.levels) { expect(l.cost).toBeGreaterThan(0); expect(l.pros.length).toBeGreaterThan(0); expect(l.cons.length).toBeGreaterThan(0); }
  });
  it('respects era gating and prerequisites', () => {
    expect(isEligible(TRAIT_BY_ID.toxin, {}, 1)).toBe(false);
    expect(isEligible(TRAIT_BY_ID.toxin, {}, 2)).toBe(true);
    expect(isEligible(TRAIT_BY_ID.gullet, {}, 2)).toBe(false);
    expect(isEligible(TRAIT_BY_ID.gullet, { cilia: 1 }, 2)).toBe(true);
    expect(isEligible(TRAIT_BY_ID.flagellum, { flagellum: 2 }, 3)).toBe(false);
  });
  it('offers are diverse and eligible', () => {
    for (let i = 0; i < 50; i++) {
      const offers = generateOffers({}, 1);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => o.trait.category)).size).toBe(3);
      for (const o of offers) expect(o.trait.era).toBe(1);
    }
  });
  it('dominant archetype reflects choices', () => {
    expect(dominantArchetype({ membrane: 2 })).toBe('defender');
    expect(dominantArchetype({ photosynthesis: 1 })).toBe('phototroph');
    expect(dominantArchetype({ flagellum: 2, sensory: 1 })).toBe('predator');
    expect(dominantArchetype({ cilia: 2 })).toBe('opportunist');
  });
  it('there are at least 3 distinct evolutionary outcomes per advanced era', () => {
    expect(FORMS.filter((f) => f.era === 2).length).toBeGreaterThanOrEqual(3);
    expect(FORMS.filter((f) => f.era === 3).length).toBeGreaterThanOrEqual(3);
  });
});

describe('progress persistence', () => {
  it('round-trips through storage', () => {
    const m = new Map<string, string>();
    const kv: KV = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
    const p = new Progress(kv);
    expect(p.seeSpecies('bacillus')).toBe(true);
    expect(p.seeSpecies('bacillus')).toBe(false);
    p.eatSpecies('bacillus');
    p.discoverMutation('flagellum', 1);
    p.endRun(90, 30, 5, 'predator');
    const q = new Progress(kv);
    expect(q.data.species.bacillus.eaten).toBe(1);
    expect(q.data.mutations.flagellum).toBe(1);
    expect(q.data.records.bestTime).toBe(90);
    expect(q.data.records.deaths.predator).toBe(1);
  });
  it('survives corrupt storage', () => {
    const kv: KV = { getItem: () => '{not json', setItem: () => {} };
    expect(new Progress(kv).data.records.runs).toBe(0);
  });
});

describe('eat rules', () => {
  const g = new Game();
  g.newRun();
  const mk = (id: string, r: number) => g.world.spawnOrganism(SPECIES_BY_ID[id], g.player.x + 500, g.player.y, r)!;
  it('size decides edibility', () => {
    expect(g.canEat(mk('bacillus', 6))).toBe('ok');
    expect(g.canEat(mk('coccus', 12))).toBe('size');
  });
  it('spines and shells need adaptations', () => {
    g.player.r = 20;
    expect(g.canEat(mk('burr', 12))).toBe('spiny');
    expect(g.canEat(mk('diatom', 12))).toBe('shelled');
    g.player.addTrait('membrane');
    expect(g.canEat(mk('burr', 12))).toBe('ok');
    g.player.addTrait('pseudopods');
    expect(g.canEat(mk('diatom', 12), true)).toBe('ok');
    expect(g.canEat(mk('diatom', 12), false)).toBe('shelled');
  });
  it('predators are recognised as threats only when larger', () => {
    g.player.r = 10;
    expect(g.isThreat(mk('lurker', 22))).toBe(true);
    g.player.r = 30;
    expect(g.isThreat(mk('lurker', 22))).toBe(false);
  });
  it('species data is sane', () => {
    for (const s of SPECIES) { expect(s.size[0]).toBeLessThanOrEqual(s.size[1]); expect(s.eras.length).toBeGreaterThan(0); }
  });
});
