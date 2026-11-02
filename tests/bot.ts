import { Game, type InputState } from '../src/game/game';
import type { AbilityId } from '../src/game/traits';
import type { Organism } from '../src/sim/entities';

export type Strategy = 'predator' | 'defender' | 'opportunist' | 'phototroph' | 'random';

const PREF: Record<Strategy, string[]> = {
  predator: ['flagellum', 'pseudopods', 'sensory', 'toxin', 'mitochondria', 'tentacles', 'lure', 'colony'],
  defender: ['membrane', 'cilia', 'spines', 'vacuole', 'colony', 'mitochondria', 'toxin'],
  opportunist: ['cilia', 'pseudopods', 'gullet', 'mitochondria', 'sensory', 'colony'],
  phototroph: ['photosynthesis', 'membrane', 'cilia', 'vacuole', 'symbiosis', 'colony', 'lure'],
  random: [],
};

export interface BotResult {
  time: number; cause: string; era: number; mutations: string[]; firstMutation: number; era2: number; era3: number;
  eaten: number; dna: number; form: string; nanSeen: boolean; frontier: boolean;
}

/** Simple autopilot used for balance & regression testing. */
export function runBot(strategy: Strategy, maxSeconds: number, seed = 1): BotResult {
  let s = seed;
  Math.random = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const g = new Game();
  g.viewR = 260;
  g.newRun();
  const input: InputState = { mx: 0, my: 0, burst: false, abilities: {} };
  const dt = 1 / 30;
  let firstMutation = -1, era2 = -1, era3 = -1, nanSeen = false;
  const tmp: Organism[] = [];
  for (let step = 0; step < maxSeconds / dt; step++) {
    const p = g.player;
    g.viewR = p.r * 26;
    if (g.state === 'evolve') {
      const order = PREF[strategy];
      let idx = -1;
      for (const id of order) { const i = g.offers.findIndex((o) => o.trait.id === id && o.cost <= p.dna); if (i >= 0) { idx = i; break; } }
      if (idx < 0) idx = g.offers.findIndex((o) => o.cost <= p.dna);
      if (idx >= 0) g.chooseMutation(idx); else g.closeEvolve(true);
      if (firstMutation < 0) firstMutation = g.run.time;
      continue;
    }
    if (g.state === 'leap') { g.confirmLeap(); if (p.eraIndex === 2) era2 = g.run.time; if (p.eraIndex === 3) era3 = g.run.time; continue; }
    if (g.state === 'dead') break;
    // steering
    const near = g.world.queryOrganisms(p.x, p.y, p.r * 12, tmp);
    let fx = 0, fy = 0, threatClose = false;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (const o of near) {
      if (o.dyingT >= 0) continue;
      const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (g.isThreat(o)) {
        const w = 1 / Math.max(1, d - o.r - p.r);
        fx -= dx / d * w * 60; fy -= dy / d * w * 60;
        if (d - o.r - p.r < p.r * 2) threatClose = true;
      } else if (g.canEat(o) === 'ok' || (p.stats.engulfRatio > 0 && g.canEat(o, true) === 'ok')) {
        const score = d / (o.sp.energy + o.sp.dna * 3);
        if (score < bd) { bd = score; best = o; }
      }
    }
    if (!best) {
      let nd = Infinity;
      for (const n of g.world.nutrients) {
        if (!n.active || n.absorbT >= 0) continue;
        const d = Math.hypot(n.x - p.x, n.y - p.y);
        if (d < nd) { nd = d; best = n; }
      }
    }
    let mx = fx, my = fy;
    if (best) { const dx = best.x - p.x, dy = best.y - p.y, d = Math.hypot(dx, dy) || 1; mx += dx / d; my += dy / d; }
    // phototrophs drift toward light
    if (p.stats.photo > 0 && p.y > 1600) my -= 0.4;
    const l = Math.hypot(mx, my) || 1;
    input.mx = mx / l; input.my = my / l;
    input.burst = threatClose && p.energy > 30;
    const ab: Partial<Record<AbilityId, boolean>> = {};
    if (threatClose) { ab.harden = true; ab.toxin = true; }
    if (best && 'sp' in best) ab.engulf = Math.random() < 0.05;
    if (Math.random() < 0.01) ab.pulse = true;
    input.abilities = ab;
    g.update(dt, input);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.energy) || !Number.isFinite(p.r)) { nanSeen = true; break; }
  }
  const p = g.player;
  return {
    time: Math.round(g.run.time), cause: g.state === 'dead' ? g.run.cause : 'alive', era: p.eraIndex,
    mutations: Object.entries(p.traits).map(([k, v]) => `${k}${v > 1 ? v : ''}`), firstMutation: Math.round(firstMutation), era2: Math.round(era2), era3: Math.round(era3),
    eaten: g.run.eaten, dna: g.run.dna, form: p.form.name, nanSeen, frontier: g.run.milestones.includes('frontier'),
  };
}
