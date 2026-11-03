import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../src/engine/spatial';
import { deriveStats, generateOffers, isEligible, TRAITS, TRAIT_BY_ID, dominantArchetype } from '../src/game/traits';
import { buildPlayerLook } from '../src/game/player';
import { ERAS, formFor, FORMS, MAX_PLAYABLE_ERA } from '../src/game/eras';
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
    expect(isEligible(TRAIT_BY_ID.claws, {}, 3)).toBe(false);
    expect(isEligible(TRAIT_BY_ID.claws, {}, 4)).toBe(true);
    expect(isEligible(TRAIT_BY_ID.fronds, {}, 4)).toBe(false);
    expect(isEligible(TRAIT_BY_ID.fronds, { photosynthesis: 1 }, 4)).toBe(true);
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
    expect(FORMS.filter((f) => f.era === 4).length).toBeGreaterThanOrEqual(3);
    for (const f of FORMS.filter((f) => f.era === 4)) expect(buildPlayerLook({}, 4, f).body).toBe('swimmer');
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

describe('era IV', () => {
  it('is playable and reachable from Era III', () => {
    expect(MAX_PLAYABLE_ERA).toBeGreaterThanOrEqual(4);
    expect(ERAS[2].mutationsToLeap).toBeLessThan(20);
    expect(SPECIES.filter((s) => s.eras.includes(4)).length).toBeGreaterThanOrEqual(8);
  });
  it('the leap rescales the sea and keeps the player inside it', () => {
    const g = new Game();
    g.newRun();
    const p = g.player;
    // fast-forward to a fully grown Era III organism
    g.state = 'leap'; g.pendingLeapForm = formFor(2, 'predator'); g.confirmLeap();
    g.state = 'leap'; g.pendingLeapForm = formFor(3, 'predator'); g.confirmLeap();
    expect(g.env.scale).toBe(2);
    const fx = p.x / g.env.w, fy = p.y / g.env.h;
    g.state = 'leap'; g.pendingLeapForm = formFor(4, 'predator'); g.confirmLeap();
    expect(p.eraIndex).toBe(4);
    expect(g.env.scale).toBe(4);
    expect(p.x / g.env.w).toBeCloseTo(fx, 1);
    expect(p.y / g.env.h).toBeCloseTo(fy, 1);
    expect(g.world.countAlive()).toBeGreaterThan(10);
    for (let i = 0; i < 300; i++) g.update(1 / 60, { mx: 1, my: 0, burst: false, abilities: {} });
    expect(Number.isFinite(p.x)).toBe(true);
    expect(p.x).toBeLessThanOrEqual(g.env.w);
    // a new run returns the sea to its original size
    g.newRun();
    expect(g.env.scale).toBe(1);
  });
  it('strike seizes shelled prey that would otherwise be too hard', () => {
    const g = new Game();
    g.newRun();
    const p = g.player;
    p.r = 150;
    const o = g.world.spawnOrganism(SPECIES_BY_ID.crawler, p.x + 400, p.y, 110)!;
    expect(g.canEat(o)).not.toBe('ok');
    p.strikeT = 0.5;
    expect(g.canEat(o)).toBe('ok');
  });
});

describe('era V', () => {
  it('is playable with vertebrate forms, species and mutations', () => {
    expect(MAX_PLAYABLE_ERA).toBeGreaterThanOrEqual(5);
    expect(ERAS[3].mutationsToLeap).toBeLessThan(20);
    expect(SPECIES.filter((s) => s.eras.includes(5)).length).toBeGreaterThanOrEqual(8);
    for (const f of FORMS.filter((f) => f.era === 5)) {
      const l = buildPlayerLook({ carapace: 1, claws: 1 }, 5, f);
      expect(l.vertebrate).toBe(true);
      // invertebrate armour and claws are re-expressed as head armour and jaws
      expect(l.carapace).toBe(false);
      expect(l.claws).toBe(0);
      expect(l.jaw).toBeGreaterThanOrEqual(2);
    }
  });
  it('recent choices steer the next leap', () => {
    const g = new Game();
    g.newRun();
    const p = g.player;
    ['membrane', 'membrane', 'cilia', 'cilia'].forEach((t) => p.addTrait(t));
    p.recentTraits = {};
    p.addTrait('flagellum'); p.addTrait('flagellum'); p.addTrait('sensory');
    expect(p.leapArchetype).toBe('predator');
  });
  it('jaws make strikes seize bigger prey and countershading hides a still player', () => {
    const g = new Game();
    g.newRun();
    const p = g.player;
    p.addTrait('jaws');
    expect(p.stats.strikeRatio).toBe(1.5);
    expect(p.stats.abilities).toContain('strike');
    p.addTrait('camo');
    p.vx = 0; p.vy = 0;
    for (let i = 0; i < 60; i++) g.update(1 / 60, { mx: 0, my: 0, burst: false, abilities: {} });
    expect(g.playerLike.hidden).toBe(true);
  });
  it('leaps all the way to Era V with an 8x sea', () => {
    const g = new Game();
    g.newRun();
    for (let e = 2; e <= 5; e++) { g.state = 'leap'; g.pendingLeapForm = formFor(e, 'defender'); g.confirmLeap(); }
    expect(g.player.eraIndex).toBe(5);
    expect(g.env.scale).toBe(8);
    expect(g.world.countAlive()).toBeGreaterThan(10);
    for (let i = 0; i < 200; i++) g.update(1 / 60, { mx: 0.7, my: 0.7, burst: i % 50 === 0, abilities: {} });
    expect(Number.isFinite(g.player.x)).toBe(true);
  });
});

describe('era VI', () => {
  const toEra6 = (arch: 'predator' | 'defender' | 'opportunist' | 'phototroph' = 'opportunist') => {
    const g = new Game();
    g.newRun();
    for (let e = 2; e <= 6; e++) { g.state = 'leap'; g.pendingLeapForm = formFor(e, arch); g.confirmLeap(); }
    return g;
  };
  it('is playable, with tetrapod forms and a land ecosystem', () => {
    expect(MAX_PLAYABLE_ERA).toBe(6);
    expect(SPECIES.filter((s) => s.eras.includes(6) && s.habitat === 'land').length).toBeGreaterThanOrEqual(4);
    for (const f of FORMS.filter((f) => f.era === 6)) expect(buildPlayerLook({}, 6, f).legs).toBe(2);
  });
  it('the leap raises a coastline and starts you in the water', () => {
    const g = toEra6();
    expect(g.env.land).toBe(true);
    expect(g.env.scale).toBe(14);
    expect(g.env.isLand(g.env.w / 2, 10)).toBe(true);
    expect(g.env.isLand(g.env.w / 2, g.env.h - 10)).toBe(false);
    expect(g.env.isLand(g.player.x, g.player.y)).toBe(false);
    expect(g.env.zoneAt(g.env.w / 2, 10)).toBe('land');
    g.newRun();
    expect(g.env.land).toBe(false);
  });
  it('without lungs you run out of breath on land; full lungs fix it', () => {
    const g = toEra6();
    const p = g.player;
    const put = () => { p.x = g.env.w / 2; p.y = g.env.coastY(p.x) - p.r * 4; p.vx = p.vy = 0; };
    put();
    for (let i = 0; i < 60 * 3; i++) { put(); g.update(1 / 60, { mx: 0, my: 0, burst: false, abilities: {} }); }
    expect(p.onLand).toBe(true);
    expect(p.breath).toBeLessThan(0.75);
    p.addTrait('lungs'); p.addTrait('lungs'); p.breath = 1;
    for (let i = 0; i < 60 * 3; i++) { put(); g.update(1 / 60, { mx: 0, my: 0, burst: false, abilities: {} }); }
    expect(p.breath).toBe(1);
  });
  it('limbs let you walk; fish flop', () => {
    const g = toEra6();
    expect(g.player.stats.landSpeed).toBeLessThan(0.5);
    g.player.addTrait('limbs');
    expect(g.player.stats.landSpeed).toBeGreaterThan(0.8);
  });
  it('sea creatures never crawl onto land', () => {
    const g = toEra6();
    const x = g.env.w / 2, cy = g.env.coastY(x);
    const shark = g.world.spawnOrganism(SPECIES_BY_ID.shark, x, cy + 600, 400)!;
    shark.vx = 0; shark.vy = -3000; shark.wanderA = -Math.PI / 2;
    g.player.x = x; g.player.y = cy - 3000;
    for (let i = 0; i < 240; i++) g.update(1 / 60, { mx: 0, my: 0, burst: false, abilities: {} });
    if (shark.alive) expect(g.env.isLand(shark.x, shark.y)).toBe(false);
  });
  it('an amniotic egg hatches once instead of dying', () => {
    const g = toEra6();
    const p = g.player;
    p.addTrait('egg');
    g.damage(1e9, 'predator', SPECIES_BY_ID.shark);
    g.update(1 / 60, { mx: 0, my: 0, burst: false, abilities: {} });
    expect(g.state).toBe('playing');
    expect(p.hp).toBeGreaterThan(0);
    g.damage(1e9, 'predator', SPECIES_BY_ID.shark);
    g.update(1 / 60, { mx: 0, my: 0, burst: false, abilities: {} });
    expect(g.state).toBe('dead');
  });
});

import { isValid, RunStore, snapshot } from '../src/game/save';

describe('save & resume', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
  it('a saved life resumes with its body, era, DNA and run stats intact', () => {
    const g = new Game();
    g.newRun();
    const p = g.player;
    ['flagellum', 'flagellum', 'membrane', 'sensory'].forEach((t) => p.addTrait(t));
    for (let e = 2; e <= 4; e++) { g.state = 'leap'; g.pendingLeapForm = formFor(e, 'predator'); g.confirmLeap(); }
    p.addTrait('claws');
    p.dna = 123; p.growth = 777; p.r = 150; g.run.time = 1234; g.run.eaten = 99; g.run.zones.add('abyss');
    const store = new RunStore(mem());
    store.save(snapshot(g));
    const s = store.load();
    expect(s).not.toBeNull();
    const h = new Game();
    h.resumeRun(s!);
    const q = h.player;
    expect(h.state).toBe('playing');
    expect(q.eraIndex).toBe(4);
    expect(q.form.id).toBe('e4-predator');
    expect(q.traits).toEqual(p.traits);
    expect(q.stats.abilities).toContain('strike');
    expect(q.look.body).toBe('swimmer');
    expect(q.dna).toBe(123);
    expect(q.growth).toBe(777);
    expect(q.r).toBe(150);
    expect(h.env.scale).toBe(4);
    expect(h.run.time).toBe(1234);
    expect(h.run.eaten).toBe(99);
    expect(h.run.zones.has('abyss')).toBe(true);
    expect(h.world.countAlive()).toBeGreaterThan(10);
    for (let i = 0; i < 120; i++) h.update(1 / 60, { mx: 0.5, my: 0.2, burst: false, abilities: {} });
    expect(Number.isFinite(q.x)).toBe(true);
  });
  it('an Era VI save brings the coastline back', () => {
    const g = new Game();
    g.newRun();
    for (let e = 2; e <= 6; e++) { g.state = 'leap'; g.pendingLeapForm = formFor(e, 'opportunist'); g.confirmLeap(); }
    const h = new Game();
    h.resumeRun(JSON.parse(JSON.stringify(snapshot(g))));
    expect(h.env.land).toBe(true);
    expect(h.env.scale).toBe(14);
  });
  it('rejects corrupt or tampered saves', () => {
    expect(isValid(null)).toBe(false);
    expect(isValid({ v: 1 })).toBe(false);
    const g = new Game(); g.newRun();
    const s = JSON.parse(JSON.stringify(snapshot(g)));
    expect(isValid(s)).toBe(true);
    expect(isValid({ ...s, player: { ...s.player, traits: { flagellum: 9 } } })).toBe(false);
    expect(isValid({ ...s, player: { ...s.player, traits: { notATrait: 1 } } })).toBe(false);
    expect(isValid({ ...s, player: { ...s.player, eraIndex: 9 } })).toBe(false);
    expect(isValid({ ...s, player: { ...s.player, x: NaN } })).toBe(false);
    const kv = mem(); kv.setItem('primordia.run.v1', '{broken');
    expect(new RunStore(kv).load()).toBeNull();
  });
});

describe('art direction data', () => {
  it('every species has a taxonomy entry and field-journal notes', async () => {
    const { SPECIES } = await import('../src/sim/species');
    const { cladeOf, characteristics, behaviour, habitat, relations } = await import('../src/game/codex');
    const { CLADES } = await import('../src/game/codex');
    for (const sp of SPECIES) {
      const c = cladeOf(sp);
      expect(CLADES[c.key]).toBeTruthy();
      expect(characteristics(sp).length).toBeGreaterThan(0);
      expect(behaviour(sp).length).toBeGreaterThan(0);
      expect(habitat(sp).length).toBeGreaterThan(0);
      expect(relations(sp).relatives).not.toContain(sp);
    }
  });
  it('look morphing grows structures in and lands exactly on the new form', async () => {
    const { baseLook, lerpLook } = await import('../src/render/look');
    const a = baseLook({ membrane: '#000000' });
    const b = baseLook({ membrane: '#ffffff', spikes: 16, spikeLen: 0.5 });
    expect(lerpLook(a, b, 0)).toBe(a);
    expect(lerpLook(a, b, 1)).toBe(b);
    const mid = lerpLook(a, b, 0.5);
    expect(mid.spikes).toBe(8);
    expect(mid.membrane).toBe('#808080');
  });
});

describe('lineage history', () => {
  it('is recorded per era and survives save & resume', async () => {
    const { snapshot } = await import('../src/game/save');
    const g = new Game();
    g.newRun();
    g.player.addTrait('flagellum');
    g.state = 'leap'; g.pendingLeapForm = formFor(2, 'predator'); g.confirmLeap();
    g.player.addTrait('membrane');
    expect(g.player.history.map((h) => h.formId)).toEqual(['protocell', 'e2-predator']);
    expect(g.player.history[0].traits).toEqual(['flagellum']);
    const h = new Game();
    h.resumeRun(JSON.parse(JSON.stringify(snapshot(g))));
    expect(h.player.history).toEqual(g.player.history);
  });
});

describe('branching leaps and metamorphosis', () => {
  const growToLeap = (g: Game) => {
    const p = g.player;
    while (p.mutationCount < p.era.mutationsToLeap) p.addTrait(p.mutationCount % 2 ? 'membrane' : 'flagellum');
    p.growth = p.era.growthNeeded;
  };

  it('offers the lineage path and a distinct alternative', async () => {
    const { leapChoices } = await import('../src/game/eras');
    const { archetypeWeights } = await import('../src/game/traits');
    for (const era of [2, 3, 4, 5, 6]) {
      const traits = { flagellum: 1, membrane: 1 };
      const opts = leapChoices(era, archetypeWeights(traits), dominantArchetype(traits));
      expect(opts).toHaveLength(2);
      expect(opts[0].id).not.toBe(opts[1].id);
      expect(opts.every((f) => f.era === era)).toBe(true);
      expect(opts[0].archetype).toBe(dominantArchetype(traits));
    }
  });

  it('the chosen branch becomes the form and grants its inherited gift', () => {
    const g = new Game();
    g.newRun();
    growToLeap(g);
    g.openLeap();
    expect(g.state).toBe('leap');
    const alt = g.leapOptions[1];
    const before = deriveStats(g.player.traits, 2);
    g.confirmLeap(1);
    expect(g.player.eraIndex).toBe(2);
    expect(g.player.form.id).toBe(alt.id);
    const s = g.player.stats;
    const changed = s.speed !== before.speed || s.damageTaken !== before.damageTaken || s.digestion !== before.digestion || s.photo !== before.photo;
    expect(changed).toBe(true);
  });

  it('a cinematic leap encysts, swaps at the midpoint and returns to play', async () => {
    const { META_SWAP, META_DUR } = await import('../src/game/game');
    const g = new Game();
    g.newRun();
    growToLeap(g);
    g.openLeap();
    g.confirmLeap(0, true);
    expect(g.state).toBe('metamorph');
    const input = { mx: 1, my: 0, burst: true, abilities: {} };
    let t = 0;
    while (t < META_SWAP - 0.1) { g.update(1 / 60, input); t += 1 / 60; }
    expect(g.player.eraIndex).toBe(1);
    while (t < META_SWAP + 0.1) { g.update(1 / 60, input); t += 1 / 60; }
    expect(g.player.eraIndex).toBe(2);
    expect(g.state).toBe('metamorph');
    while (t < META_DUR + 0.1) { g.update(1 / 60, input); t += 1 / 60; }
    expect(g.state).toBe('playing');
    expect(g.player.hp).toBeGreaterThan(0);
  });

  it('growth quarters emit growth-stage events once each', () => {
    const g = new Game();
    g.newRun();
    const p = g.player;
    const stages: number[] = [];
    for (let k = 1; k <= 8; k++) {
      p.growth = p.era.growthNeeded * (k / 8) * 0.99;
      g.update(1 / 60, { mx: 0, my: 0, burst: false, abilities: {} });
      for (const e of g.events) if (e.type === 'grow') stages.push(e.stage);
      g.events.length = 0;
      if (g.state !== 'playing') g.state = 'playing';
    }
    expect(stages).toEqual([1, 2, 3]);
  });
});
