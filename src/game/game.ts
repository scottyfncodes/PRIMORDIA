import { clamp, dist2, rand, TAU } from '../engine/math';
import { Environment, PLAYER_SPAWN, ZONES, type ZoneId } from '../sim/environment';
import { World, type PlayerLike } from '../sim/world';
import type { Nutrient, Organism } from '../sim/entities';
import { SPECIES_BY_ID, type SpeciesDef } from '../sim/species';
import { Player } from './player';
import { Progress } from './progress';
import { ABILITY_INFO, generateOffers, TRAIT_BY_ID, type AbilityId, type Offer } from './traits';
import { ERAS, formFor, MAX_PLAYABLE_ERA, type FormDef } from './eras';

export type GameState = 'title' | 'playing' | 'paused' | 'evolve' | 'leap' | 'dead';

export interface InputState {
  mx: number;
  my: number;
  burst: boolean;
  abilities: Partial<Record<AbilityId, boolean>>;
}

/** Feedback events consumed by audio / fx / UI layers. */
export type GameEvent =
  | { type: 'eat'; x: number; y: number; r: number; color: string; energy: number; dna: number; species: SpeciesDef; toxic: boolean }
  | { type: 'absorb'; x: number; y: number; kind: Nutrient['kind']; dna: number }
  | { type: 'bite'; x: number; y: number; dmg: number; blocked: boolean; by: SpeciesDef }
  | { type: 'reflect'; x: number; y: number }
  | { type: 'bounce'; x: number; y: number; reason: 'size' | 'spiny' | 'shelled' }
  | { type: 'spiny'; x: number; y: number }
  | { type: 'burst'; x: number; y: number; angle: number }
  | { type: 'ability'; id: AbilityId; x: number; y: number; r: number }
  | { type: 'mutation'; traitId: string; level: number; first: boolean }
  | { type: 'leap'; era: number; form: FormDef; first: boolean }
  | { type: 'discover'; kind: 'species' | 'zone' | 'milestone' | 'form'; title: string; sub: string; dna: number }
  | { type: 'death'; cause: string }
  | { type: 'npcEat'; x: number; y: number; r: number }
  | { type: 'npcDie'; x: number; y: number; r: number; color: string }
  | { type: 'hint'; text: string; id: string }
  | { type: 'heat'; x: number; y: number }
  | { type: 'satellitePop'; x: number; y: number }
  | { type: 'strikeHit'; x: number; y: number; r: number; kill: boolean }
  | { type: 'tongue'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'revive'; x: number; y: number };

export interface RunStats {
  time: number;
  eaten: number;
  nutrients: number;
  dna: number;
  predatorsEaten: number;
  damageTaken: number;
  photoEnergy: number;
  zones: Set<ZoneId>;
  speciesSeen: Set<string>;
  discoveries: string[];
  milestones: string[];
  formsReached: string[];
  cause: string;
  causeDetail: string;
  killer: SpeciesDef | null;
  lastDamage: { cause: string; t: number; sp: SpeciesDef | null };
}

const newRunStats = (): RunStats => ({
  time: 0, eaten: 0, nutrients: 0, dna: 0, predatorsEaten: 0, damageTaken: 0, photoEnergy: 0,
  zones: new Set(), speciesSeen: new Set(), discoveries: [], milestones: [], formsReached: [],
  cause: '', causeDetail: '', killer: null, lastDamage: { cause: '', t: -99, sp: null },
});

export const MILESTONES: Record<string, { name: string; desc: string; dna: number }> = {
  first_meal: { name: 'First Meal', desc: 'Consumed another living cell.', dna: 2 },
  first_mutation: { name: 'Descent with Modification', desc: 'Acquired your first mutation.', dna: 0 },
  first_predator: { name: 'Tables Turned', desc: 'Consumed a predator.', dna: 8 },
  rare_feast: { name: 'Rare Genes', desc: 'Consumed a rare organism.', dna: 4 },
  survive_120: { name: 'Persistence', desc: 'Survived for 2 minutes.', dna: 5 },
  survive_300: { name: 'Endurance', desc: 'Survived for 5 minutes.', dna: 10 },
  survive_600: { name: 'Ancient Lineage', desc: 'Survived for 10 minutes.', dna: 20 },
  era2: { name: 'The Great Oxidation', desc: 'Became a complex cell (Era II).', dna: 0 },
  era3: { name: 'Many Become One', desc: 'Became multicellular (Era III).', dna: 0 },
  era4: { name: 'The Cambrian Explosion', desc: 'Became an early animal (Era IV).', dna: 0 },
  era5: { name: 'Age of Fishes', desc: 'Grew a backbone (Era V).', dna: 0 },
  era6: { name: 'First Steps', desc: 'Reached the Land Transition (Era VI).', dna: 0 },
  landfall: { name: 'Landfall', desc: 'Crawled out of the sea onto dry land.', dna: 40 },
  walker: { name: 'A Life Ashore', desc: 'Spent 60 seconds on land in one life.', dna: 40 },
  clutch: { name: 'The Line Goes On', desc: 'Hatched from your own clutch after dying.', dna: 20 },
  titan: { name: 'Giant Slayer', desc: 'Brought down an Iron-Jaw Titan.', dna: 60 },
  frontier: { name: 'Edge of the Known', desc: 'Reached full size in the last charted era.', dna: 25 },
  apex: { name: 'Apex Predator', desc: 'Took down a Clawed Raptor.', dna: 30 },
  explorer: { name: 'Cartographer of the Deep', desc: 'Visited every zone in one run.', dna: 15 },
  sunfed: { name: 'Fed by the Sun', desc: 'Generated 300 energy from light in one run.', dna: 8 },
  toxin_kill: { name: 'Chemical Warfare', desc: 'Killed an organism with toxin.', dna: 4 },
};

export class Game {
  env = new Environment();
  world = new World(this.env);
  player = new Player();
  progress = new Progress();
  state: GameState = 'title';
  events: GameEvent[] = [];
  run: RunStats = newRunStats();
  offers: Offer[] = [];
  evolveSnoozeDna = 0;
  pendingLeapForm: FormDef | null = null;
  timeScale = 1;
  private tmp: Organism[] = [];
  private tmpN: Nutrient[] = [];
  private cur = { x: 0, y: 0 };
  hintsShown = new Set<string>();
  currentZone: ZoneId = 'drift';
  /** nearest threat distance as a fraction (0 = touching, 1 = far) */
  danger = 0;
  dangerDir = 0;
  threats: { x: number; y: number; d: number }[] = [];
  revealed: { x: number; y: number; rare: boolean }[] = [];
  viewR = 400;
  frontierShown = false;
  leapBlockedHint = false;
  private safeT = 0;

  get playerLike(): PlayerLike {
    const p = this.player;
    return {
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, r: p.r,
      alive: p.alive && this.state === 'playing',
      threatRatio: p.canSeeThreatRatio,
      predatorDeter: p.stats.predatorDeter + (p.hardenT > 0 ? 0.3 : 0),
      detectability: p.stats.detectability,
      lure: p.stats.lure,
      hidden: p.hiddenT > 0 || (p.stats.stealth > 0 && p.stillT > 0.6),
      reaction: p.stats.reaction,
      onLand: p.onLand,
    };
  }

  newRun() {
    this.env.setScale(1);
    this.env.land = false;
    this.player.reset(PLAYER_SPAWN.x + rand(-80, 80), PLAYER_SPAWN.y + rand(-80, 80));
    this.world.reset(ERAS[0]);
    this.player.form = formFor(1, 'opportunist');
    this.player.refresh();
    this.run = newRunStats();
    this.offers = [];
    this.evolveSnoozeDna = 0;
    this.pendingLeapForm = null;
    this.frontierShown = false;
    this.leapBlockedHint = false;
    this.events.length = 0;
    this.hintsShown.clear();
    this.world.cx = this.player.x; this.world.cy = this.player.y;
    this.world.viewR = this.viewR;
    this.world.populate(this.player.x, this.player.y, this.player.r * 9);
    // a gentle, edible welcome around the spawn point
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU), d = rand(60, 220);
      this.world.spawnNutrient(this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d, i < 2 ? 'rich' : 'mote');
    }
    const spawnPrey = (id: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), d = rand(140, 300);
        const s = SPECIES_BY_ID[id];
        if (s) this.world.spawnOrganism(s, this.player.x + Math.cos(a) * d, this.player.y + Math.sin(a) * d);
      }
    };
    spawnPrey('driftspore', 5);
    spawnPrey('bacillus', 3);
    this.currentZone = this.env.zoneAt(this.player.x, this.player.y);
    this.state = 'playing';
    this.hint('move', this.progress.data.settings.controls === 'drag' ? 'Touch and hold anywhere to swim toward your finger' : 'Drag on the left side of the screen to swim');
  }

  hint(id: string, text: string, always = false) {
    if (this.hintsShown.has(id)) return;
    if (!always && this.progress.data.tutorialDone && !id.startsWith('!')) return;
    this.hintsShown.add(id);
    this.events.push({ type: 'hint', id, text });
  }

  /** Title-screen attract mode: the ecosystem lives on behind the menu. */
  startAttract() {
    this.state = 'title';
    this.env.setScale(1);
    this.env.land = false;
    this.world.reset(ERAS[0]);
    this.world.runTime = 120;
    this.world.cx = PLAYER_SPAWN.x; this.world.cy = PLAYER_SPAWN.y;
    this.world.viewR = this.viewR;
    this.world.populate(PLAYER_SPAWN.x, PLAYER_SPAWN.y, 0);
  }
  updateAttract(dt: number, cx: number, cy: number) {
    this.env.update(dt);
    this.world.cx = cx; this.world.cy = cy; this.world.viewR = this.viewR;
    const ghost: PlayerLike = { x: -9999, y: -9999, vx: 0, vy: 0, r: 1, alive: false, threatRatio: 0, predatorDeter: 0, detectability: 0, lure: 0, hidden: true, reaction: 1, onLand: false };
    this.world.update(dt, ghost);
    this.world.events.length = 0;
  }

  // ───────────────────────────────────────── main update ─────────────────────────────────────────
  update(dt: number, input: InputState) {
    this.env.update(dt);
    if (this.state !== 'playing') return;
    const p = this.player;
    this.run.time += dt;
    this.world.cx = p.x; this.world.cy = p.y; this.world.viewR = this.viewR;

    this.updatePlayerMovement(dt, input);
    this.updateAbilities(dt, input);
    this.world.update(dt, this.playerLike);
    for (const e of this.world.events) {
      if (e.type === 'npcEat') this.events.push(e);
      else if (e.type === 'npcDie') {
        this.events.push({ type: 'npcDie', x: e.x, y: e.y, r: e.r, color: e.sp.look.glow });
        if (e.byToxin && this.run.time > 0) this.milestone('toxin_kill');
      }
    }
    this.world.events.length = 0;
    this.interactions(dt);
    this.metabolism(dt);
    p.updateSize(dt);
    this.progression(dt);
    this.progress.tick(dt);
    if (p.hp <= 0) this.die();
  }

  private updatePlayerMovement(dt: number, input: InputState) {
    const p = this.player, st = p.stats, env = this.env;
    p.hurtT -= dt; p.sinceHurt += dt; p.eatPulse = Math.max(0, p.eatPulse - dt * 3); p.growPulse = Math.max(0, p.growPulse - dt * 2);
    p.spinyCd -= dt;
    if (p.transformT >= 0) { p.transformT += dt; if (p.transformT > 1.6) p.transformT = -1; }

    let mx = input.mx, my = input.my;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    const wasLand = p.onLand;
    p.onLand = env.isLand(p.x, p.y);
    if (p.onLand && !wasLand) this.onLandfall();
    const terrain = p.onLand ? st.landSpeed : 1;
    const maxS = p.maxSpeed * terrain * (p.burstT > 0 ? 1 + 1.1 * st.burstPower : 1);
    const accel = maxS * 3.2 * st.accel;
    const tx = mx * maxS, ty = my * maxS;
    let ex = tx - p.vx, ey = ty - p.vy;
    const el = Math.hypot(ex, ey);
    const maxDv = accel * dt * (ml > 0.05 ? 1 : 0.0);
    if (ml > 0.05 && el > maxDv) { ex = ex / el * maxDv; ey = ey / el * maxDv; }
    if (ml > 0.05) { p.vx += ex; p.vy += ey; }
    // drag: flagellates glide, ciliates stop on a dime
    const dens = env.density(p.x, p.y) * (st.thicketImmune ? 0 : 1);
    const drag = (ml > 0.05 ? 0.4 : st.drag) + dens * 2.6 + (p.onLand ? 2 : 0);
    p.vx *= Math.exp(-drag * dt);
    p.vy *= Math.exp(-drag * dt);
    env.current(p.x, p.y, this.cur);
    const cf = (1 - st.currentResist) * 0.85;
    p.x += (p.vx + this.cur.x * cf) * dt;
    p.y += (p.vy + this.cur.y * cf) * dt;
    this.world.collideRocks(p);

    const sp2 = p.vx * p.vx + p.vy * p.vy;
    if (sp2 > 25) {
      const want = Math.atan2(p.vy, p.vx);
      let da = want - p.angle;
      while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      p.angle += da * Math.min(1, dt * (st.accel > 1.3 ? 11 : 6.5) * st.turn);
    }
    // tentacle trail
    p.trail.unshift({ x: p.x, y: p.y });
    if (p.trail.length > 26) p.trail.length = 26;
    // satellites
    const ns = p.satellites.length;
    for (let i = 0; i < ns; i++) {
      const s = p.satellites[i];
      s.a += dt * 0.9;
      const a = s.a;
      const d = p.r * (1.55 + ns * 0.1);
      const tx2 = p.x + Math.cos(a) * d, ty2 = p.y + Math.sin(a) * d;
      s.x += (tx2 - s.x) * Math.min(1, dt * 8);
      s.y += (ty2 - s.y) * Math.min(1, dt * 8);
      if (!s.alive) { s.regrow -= dt; if (s.regrow <= 0) s.alive = true; }
    }

    // burst
    p.burstT -= dt; p.burstCd -= dt;
    // stealth: holding still with countershading makes you vanish
    if (Math.hypot(p.vx, p.vy) < p.maxSpeed * 0.18 && p.burstT <= 0) p.stillT += dt; else p.stillT = 0;
    if (input.burst && p.burstCd <= 0) {
      const cost = 5 * st.burstCost * (1 + (p.eraIndex - 1) * 0.3);
      if (p.energy > cost + 1) {
        p.energy -= cost;
        p.burstT = 0.38; p.burstCd = 0.85;
        let dx = mx, dy = my;
        if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); }
        const dl = Math.hypot(dx, dy) || 1;
        const imp = p.maxSpeed * (1.1 + 0.9 * st.burstPower);
        p.vx += dx / dl * imp; p.vy += dy / dl * imp;
        this.events.push({ type: 'burst', x: p.x, y: p.y, angle: Math.atan2(dy, dx) });
      }
    }
  }

  private updateAbilities(dt: number, input: InputState) {
    const p = this.player, st = p.stats;
    for (const k of Object.keys(p.cooldowns) as AbilityId[]) p.cooldowns[k] -= dt;
    p.engulfT -= dt; p.hardenT -= dt; p.strikeT -= dt; p.hiddenT -= dt;
    if (p.pulseT >= 0) { p.pulseT += dt; if (p.pulseT > 1.2) p.pulseT = -1; }
    for (const id of st.abilities) {
      if (!input.abilities[id]) continue;
      if (p.cooldowns[id] > 0) continue;
      const info = ABILITY_INFO[id];
      const cost = info.energy * (1 + (p.eraIndex - 1) * 0.3);
      if (p.energy < cost + 1) continue;
      p.energy -= cost;
      let cd = info.cooldown;
      if (id === 'engulf' && (p.traits.pseudopods || 0) >= 2) cd *= 0.65;
      p.cooldowns[id] = cd;
      this.useAbility(id);
    }
  }

  private useAbility(id: AbilityId) {
    const p = this.player;
    if (id === 'engulf') {
      p.engulfT = 0.9;
      // lunge toward the best engulfable target
      const near = this.world.queryOrganisms(p.x, p.y, p.r * 6, this.tmp);
      let best: Organism | null = null, bd = Infinity;
      for (const o of near) {
        if (o.dyingT >= 0) continue;
        if (this.canEat(o, true) !== 'ok') continue;
        const d = dist2(o.x, o.y, p.x, p.y);
        if (d < bd) { bd = d; best = o; }
      }
      let ax = Math.cos(p.angle), ay = Math.sin(p.angle);
      if (best) { const d = Math.sqrt(bd) || 1; ax = (best.x - p.x) / d; ay = (best.y - p.y) / d; }
      const imp = p.maxSpeed * 1.5;
      p.vx += ax * imp; p.vy += ay * imp;
    } else if (id === 'harden') {
      p.hardenT = 2.6 * p.stats.hardenMult;
    } else if (id === 'pulse') {
      p.pulseT = 0;
      const R = p.r * 16;
      const near = this.world.queryOrganisms(p.x, p.y, R, this.tmp);
      for (const o of near) {
        o.revealT = 7;
        if (o.r < p.r * 0.75) { o.stunT = 1.6; o.vx *= 0.2; o.vy *= 0.2; }
        if (o.sp.category === 'rare' || o.sp.category === 'predator') this.observe(o);
      }
    } else if (id === 'toxin') {
      this.world.addCloud(p.x, p.y, p.r * 4.6, 30 * p.eraIndex + 10);
    } else if (id === 'strike') {
      p.strikeT = 0.55;
      // snap toward the best target in front of you
      const near = this.world.queryOrganisms(p.x, p.y, p.r * 7, this.tmp);
      let best: Organism | null = null, bs = Infinity;
      for (const o of near) {
        if (o.dyingT >= 0) continue;
        const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1;
        const facing = (dx * Math.cos(p.angle) + dy * Math.sin(p.angle)) / d;
        const score = d * (1.6 - facing) * (o.r <= p.r * p.stats.strikeRatio ? 1 : 2.5);
        if (score < bs) { bs = score; best = o; }
      }
      let ax = Math.cos(p.angle), ay = Math.sin(p.angle);
      if (best) { const d = Math.hypot(best.x - p.x, best.y - p.y) || 1; ax = (best.x - p.x) / d; ay = (best.y - p.y) / d; p.angle = Math.atan2(ay, ax); }
      const imp = p.maxSpeed * 2.1;
      p.vx = ax * imp; p.vy = ay * imp;
    } else if (id === 'tongue') {
      // snatch the nearest small prey within reach, ignoring the chase
      const reach = p.r * 5.5;
      let best: Organism | null = null, bd = Infinity;
      for (const o of this.world.queryOrganisms(p.x, p.y, reach, this.tmp)) {
        if (o.dyingT >= 0 || o.r > p.r * 0.7 || this.canEat(o) !== 'ok') continue;
        const d = dist2(o.x, o.y, p.x, p.y);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        this.events.push({ type: 'tongue', x1: p.x, y1: p.y, x2: best.x, y2: best.y });
        this.consume(best);
      } else {
        this.events.push({ type: 'tongue', x1: p.x, y1: p.y, x2: p.x + Math.cos(p.angle) * reach * 0.7, y2: p.y + Math.sin(p.angle) * reach * 0.7 });
        p.cooldowns.tongue = 0.6;
      }
    } else if (id === 'ink') {
      this.world.addCloud(p.x, p.y, p.r * 6, 0, 'ink');
      p.hiddenT = 2.8;
      // everything currently hunting you loses the trail
      for (const o of this.world.queryOrganisms(p.x, p.y, p.r * 14, this.tmp)) {
        if (o.targetIsPlayer) { o.target = null; o.targetIsPlayer = false; o.mode = 'wander'; o.restT = 3.5; o.windupT = 0; o.lungeT = 0; }
      }
    }
    this.events.push({ type: 'ability', id, x: p.x, y: p.y, r: p.r });
  }

  /** Eat rules: size ratio, defensive traits and adaptations decide. */
  canEat(o: Organism, assumeEngulf = false): 'ok' | 'size' | 'spiny' | 'shelled' {
    const p = this.player, st = p.stats;
    if (p.strikeT > 0) return o.r <= p.r * st.strikeRatio ? 'ok' : 'size';
    const engulfing = st.engulfRatio > 0 && (assumeEngulf || p.engulfT > 0);
    const ratio = engulfing ? Math.max(st.eatRatio, st.engulfRatio) : st.eatRatio;
    if (o.r > p.r * ratio) return 'size';
    const d = o.sp.defenses;
    if (d.includes('shelled') && !engulfing && !st.shellBreaker && o.r > p.r * 0.5) return 'shelled';
    if (d.includes('spiny') && !engulfing && !st.spinyImmune && o.r > p.r * 0.45) return 'spiny';
    return 'ok';
  }

  /** Can this organism hurt the player by biting? */
  isThreat(o: Organism) {
    const p = this.player;
    return o.sp.bite > 0 && (o.sp.category === 'predator' || o.sp.diet !== 'nutrients') && o.r >= p.r * 1.05 && !(o.sp.defenses.includes('spiny') && o.sp.category !== 'predator');
  }

  private observe(o: Organism) {
    if (this.run.speciesSeen.has(o.sp.id)) return;
    this.run.speciesSeen.add(o.sp.id);
    const first = this.progress.seeSpecies(o.sp.id);
    // observation is rewarded for genuine discoveries and rare sightings
    const dna = o.sp.category === 'rare' ? 3 : first ? 1 : 0;
    this.gainDna(dna);
    if (first) {
      this.run.discoveries.push(o.sp.name);
      this.events.push({ type: 'discover', kind: 'species', title: o.sp.name, sub: 'New species recorded in the Codex', dna });
    }
  }

  private interactions(dt: number) {
    const p = this.player, st = p.stats;
    const reach = p.r * (p.engulfT > 0 ? 1.35 : p.strikeT > 0 ? 1.4 : 1);
    const near = this.world.queryOrganisms(p.x, p.y, reach + 10, this.tmp);
    for (const o of near) {
      if (o.dyingT >= 0) continue;
      const d = Math.sqrt(dist2(o.x, o.y, p.x, p.y));
      const touching = d < reach + o.r * 0.9;
      if (!touching) continue;
      const verdict = this.canEat(o);
      if (verdict === 'ok' && d < reach + o.r * 0.6) {
        if (p.strikeT > 0) { p.strikeT = 0; this.events.push({ type: 'strikeHit', x: o.x, y: o.y, r: o.r, kill: true }); }
        this.consume(o);
        continue;
      }
      if (p.strikeT > 0) {
        // claws wound what they cannot swallow
        p.strikeT = 0;
        o.hp -= (o.maxHp * 0.14 + 60 * p.eraIndex) * st.strikeDamage;
        o.stunT = 1.5; o.hurtT = 0.4;
        o.mode = 'flee'; o.fleeX = p.x; o.fleeY = p.y; o.target = null; o.targetIsPlayer = false; o.restT = 4;
        p.vx *= -0.3; p.vy *= -0.3;
        this.events.push({ type: 'strikeHit', x: o.x, y: o.y, r: o.r, kill: o.hp <= 0 });
        if (o.hp <= 0) { this.world.kill(o, false); if (o.sp.category === 'predator') this.milestone('first_predator'); if (o.sp.id === 'raptor') this.milestone('apex');
    if (o.sp.id === 'titan') this.milestone('titan'); }
        continue;
      }
      // threat bites
      if (this.isThreat(o) && o.biteCd <= 0 && o.stunT <= 0) {
        this.takeBite(o);
        continue;
      }
      if (verdict === 'spiny' && p.spinyCd <= 0) {
        p.spinyCd = 0.5;
        this.damage(5 + o.sp.bite * 0.4, 'spines', o.sp);
        this.events.push({ type: 'spiny', x: (p.x + o.x) / 2, y: (p.y + o.y) / 2 });
        this.hint('spiny', 'Spiny cells tear unprotected membranes — a Protective Membrane or Engulf gets past them', true);
      }
      // soft separation with bounce feedback
      const dx = p.x - o.x, dy = p.y - o.y;
      const dd = Math.hypot(dx, dy) || 1;
      const min = (p.r + o.r) * 0.92;
      if (dd < min) {
        const mp = p.r * p.r, mo = o.r * o.r;
        const push = min - dd;
        const kp = mo / (mp + mo), ko = mp / (mp + mo);
        p.x += dx / dd * push * kp; p.y += dy / dd * push * kp;
        o.x -= dx / dd * push * ko; o.y -= dy / dd * push * ko;
        const vn = p.vx * (-dx / dd) + p.vy * (-dy / dd);
        if (vn > 20) {
          p.vx += dx / dd * vn * 0.9; p.vy += dy / dd * vn * 0.9;
          if (verdict !== 'ok') this.events.push({ type: 'bounce', x: o.x, y: o.y, reason: verdict === 'spiny' ? 'spiny' : verdict === 'shelled' ? 'shelled' : 'size' });
          if (verdict === 'shelled') this.hint('shelled', 'That shell is too hard — Pseudopods can engulf it', true);
        }
      }
    }

    // tentacles: stun & reel in small prey
    if (st.tentacles > 0) {
      const tr = p.r * 2.6;
      const nearT = this.world.queryOrganisms(p.x, p.y, tr, this.tmp);
      for (const o of nearT) {
        if (o.dyingT >= 0 || o.r > p.r * 0.75 || this.canEat(o) !== 'ok') continue;
        if (o.stunT < 0.2) o.stunT = 0.8;
        const dx = p.x - o.x, dy = p.y - o.y, dd = Math.hypot(dx, dy) || 1;
        o.vx += dx / dd * 260 * dt; o.vy += dy / dd * 260 * dt;
        o.x += dx / dd * p.r * 1.2 * dt; o.y += dy / dd * p.r * 1.2 * dt;
      }
    }

    // nutrients
    const magnetR = p.r * st.magnet + p.r;
    const nn = this.world.queryNutrients(p.x, p.y, magnetR, this.tmpN);
    for (const n of nn) {
      const dx = p.x - n.x, dy = p.y - n.y;
      const dd = Math.hypot(dx, dy) || 1;
      if (dd < p.r + n.r) { this.absorb(n, p.x, p.y); continue; }
      const pull = (1 - dd / magnetR) * p.r * 9;
      n.x += dx / dd * pull * dt; n.y += dy / dd * pull * dt;
    }
    for (const s of p.satellites) {
      if (!s.alive) continue;
      const sr = p.r * 0.38;
      const ns = this.world.queryNutrients(s.x, s.y, sr * 2.2, this.tmpN);
      for (const n of ns) this.absorb(n, s.x, s.y);
    }
  }

  private absorb(n: Nutrient, ax: number, ay: number) {
    const p = this.player;
    n.absorbT = 0; n.absorbX = ax; n.absorbY = ay;
    p.energy = Math.min(p.maxEnergy, p.energy + n.energy * p.stats.digestion * p.stats.nutrientMult);
    p.growth += n.growth;
    this.run.nutrients++;
    if (n.dna) this.gainDna(n.dna);
    this.events.push({ type: 'absorb', x: n.x, y: n.y, kind: n.kind, dna: n.dna });
    if (this.run.nutrients === 3) this.hint('prey', 'Anything smaller than you is prey — swim into it to eat');
  }

  private consume(o: Organism) {
    const p = this.player, st = p.stats;
    o.dyingT = 0; o.eater = p; o.eatenByPlayer = true;
    const energy = o.sp.energy * st.digestion;
    p.energy = Math.min(p.maxEnergy, p.energy + energy);
    // relative size matters: snacks barely feed growth, big kills transform you
    const rel = o.r / p.r;
    const sizeK = Math.min(1.4, Math.max(0.12, rel * rel * 2.2));
    p.growth += o.sp.growth * (o.r / ((o.sp.size[0] + o.sp.size[1]) / 2)) * sizeK;
    p.eatPulse = 1;
    const toxic = o.sp.defenses.includes('toxic') && !st.toxicImmune;
    if (toxic) this.damage(p.maxHp * 0.18, 'toxin', o.sp);
    this.observe(o);
    const outgrown = Math.max(...o.sp.eras) < p.eraIndex;
    const eraK = [1, 0.32, 0.2, 0.11, 0.07][p.eraIndex - 1] ?? 0.07;
    const dnaRaw = o.sp.dna * Math.min(1.2, Math.max(0.25, rel * 1.6)) * (outgrown ? 0.3 : 1) * eraK;
    const dna = Math.floor(dnaRaw) + (Math.random() < dnaRaw % 1 ? 1 : 0);
    this.gainDna(dna);
    this.run.eaten++;
    this.progress.eatSpecies(o.sp.id);
    this.events.push({ type: 'eat', x: o.x, y: o.y, r: o.r, color: o.sp.look.glow, energy, dna, species: o.sp, toxic });
    this.milestone('first_meal');
    if (o.sp.category === 'predator') { this.run.predatorsEaten++; this.milestone('first_predator'); }
    if (o.sp.id === 'raptor') this.milestone('apex');
    if (o.sp.id === 'titan') this.milestone('titan');
    if (o.sp.category === 'rare') this.milestone('rare_feast');
  }

  private takeBite(o: Organism) {
    const p = this.player, st = p.stats;
    o.biteCd = 1.0;
    const dx = p.x - o.x, dy = p.y - o.y, dd = Math.hypot(dx, dy) || 1;
    // knockback gives a chance to escape
    const kb = p.maxSpeed * 1.4;
    p.vx += dx / dd * kb; p.vy += dy / dd * kb;
    o.vx -= dx / dd * 40; o.vy -= dy / dd * 40;
    o.lungeT = 0;
    // colony satellites take the hit
    const sat = p.satellites.find((s) => s.alive);
    if (sat && p.hardenT <= 0) {
      sat.alive = false; sat.regrow = 18;
      this.events.push({ type: 'satellitePop', x: sat.x, y: sat.y });
      this.events.push({ type: 'bite', x: p.x, y: p.y, dmg: 0, blocked: true, by: o.sp });
      return;
    }
    let dmg = o.sp.bite * clamp(o.r / p.r, 1, 2.2) * 0.75 * st.damageTaken;
    if (p.hardenT > 0) dmg *= 0.1;
    this.damage(dmg, 'predator', o.sp);
    this.events.push({ type: 'bite', x: p.x, y: p.y, dmg, blocked: p.hardenT > 0, by: o.sp });
    if (st.contactDamage > 0 || p.hardenT > 0) {
      o.hp -= st.contactDamage * (0.5 + p.eraIndex * 0.5);
      o.stunT = 1.3; o.hurtT = 0.3;
      o.mode = 'flee'; o.fleeX = p.x; o.fleeY = p.y; o.target = null; o.targetIsPlayer = false; o.restT = 5;
      this.events.push({ type: 'reflect', x: (p.x + o.x) / 2, y: (p.y + o.y) / 2 });
      if (o.hp <= 0) this.world.kill(o, false);
    }
    this.hint('!burst', 'Hit! Tap BURST to escape — it costs a little energy', true);
  }

  damage(amount: number, cause: string, sp: SpeciesDef | null) {
    const p = this.player;
    if (amount <= 0) return;
    p.hp -= amount;
    p.hurtT = 0.35; p.sinceHurt = 0;
    this.run.damageTaken += amount;
    this.run.lastDamage = { cause, t: this.run.time, sp };
  }

  private metabolism(dt: number) {
    const p = this.player, st = p.stats, e = p.era;
    const light = this.env.light(p.x, p.y);
    const speedFrac = clamp(Math.hypot(p.vx, p.vy) / (p.maxSpeed || 1), 0, 1.5);
    let drain = e.drain * st.metabolism * (0.75 + speedFrac * 0.4);
    if (st.photo > 0) {
      if (light < 0.22) drain *= st.darkPenalty;
      if (light >= st.photoMinLight) {
        const gain = st.photo * light * (e.drain / 1.25) * dt;
        p.energy += gain;
        this.run.photoEnergy += gain;
        if (this.run.photoEnergy > 300) this.milestone('sunfed');
      }
    }
    p.energy -= drain * dt;
    if (p.energy > p.maxEnergy) p.energy = p.maxEnergy;
    // breath: out of the water you can only hold it so long
    if (this.env.land) {
      if (p.onLand) {
        p.landT += dt;
        p.breath -= st.breathDrain * dt;
        if (st.bask > 0) {
          const still = Math.hypot(p.vx, p.vy) < p.maxSpeed * 0.3 ? 1 : 0.35;
          const gain = st.bask * (e.drain / 1.25) * still * dt;
          p.energy += gain; this.run.photoEnergy += gain;
          p.energy += drain * 0.15 * dt;
        }
        if (p.breath < 0.35) this.hint('!breath', 'Running out of air! Get back into the water — or evolve Lungs', true);
      } else {
        p.breath = Math.min(1, p.breath + dt * 0.6);
      }
      if (p.breath <= 0) {
        p.breath = 0;
        p.hp -= p.maxHp * 0.14 * dt;
        p.sinceHurt = 0; p.hurtT = Math.max(p.hurtT, 0.15);
        this.run.lastDamage = { cause: 'suffocated', t: this.run.time, sp: null };
      }
    }
    if (p.energy <= 0) {
      p.energy = 0;
      p.hp -= p.maxHp * 0.07 * dt;
      p.sinceHurt = 0;
      this.run.lastDamage = { cause: 'starved', t: this.run.time, sp: null };
      this.hint('!starve', 'Out of energy! Eat something fast or you will starve', true);
    } else if (p.energy < p.maxEnergy * 0.2) {
      this.hint('!lowenergy', 'Energy is low — absorb nutrients or eat smaller cells', true);
    }
    // heat
    const heat = this.env.heat(p.x, p.y);
    if (heat > 0.35) {
      const dmg = (heat - 0.35) * 30 * (1 - st.heatResist) * dt * (1 + (p.eraIndex - 1) * 0.6);
      if (dmg > 0.001) {
        this.damage(dmg, 'heat', null);
        p.heatT -= dt;
        if (p.heatT <= 0) { p.heatT = 0.4; this.events.push({ type: 'heat', x: p.x, y: p.y }); }
        this.hint('!heat', 'Scalding vent water! A Protective Membrane or Contractile Vacuole resists heat', true);
      }
    }
    // integrity regeneration
    if (p.energy > p.maxEnergy * 0.35 && p.sinceHurt > 3) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.025 * st.regen * dt);
  }

  gainDna(n: number) {
    if (n <= 0) return;
    this.player.dna += n;
    this.player.dnaTotal += n;
    this.run.dna += n;
  }

  milestone(id: string) {
    if (this.run.milestones.includes(id)) return;
    const m = MILESTONES[id];
    if (!m) return;
    this.run.milestones.push(id);
    const first = this.progress.milestone(id);
    if (m.dna) this.gainDna(m.dna);
    if (first || m.dna) this.events.push({ type: 'discover', kind: 'milestone', title: m.name, sub: m.desc, dna: m.dna });
  }

  private progression(dt: number) {
    const p = this.player, r = this.run;
    // zones
    const z = this.env.zoneAt(p.x, p.y);
    if (z !== this.currentZone || !r.zones.has(z)) {
      this.currentZone = z;
      if (!r.zones.has(z)) {
        r.zones.add(z);
        const first = this.progress.discoverZone(z);
        const dna = r.zones.size > 1 ? 4 : 0;
        if (dna) this.gainDna(dna);
        if (r.zones.size > 1 || first) this.events.push({ type: 'discover', kind: 'zone', title: ZONES[z].name, sub: ZONES[z].blurb, dna });
        if (r.zones.size === 5) this.milestone('explorer');
      }
    }
    if (p.landT > 60) this.milestone('walker');
    if (r.time > 120) this.milestone('survive_120');
    if (r.time > 300) this.milestone('survive_300');
    if (r.time > 600) this.milestone('survive_600');

    // sightings of species on screen
    const near = this.world.queryOrganisms(p.x, p.y, this.viewR * 0.8, this.tmp);
    this.threats.length = 0;
    this.revealed.length = 0;
    let nearest = Infinity;
    for (const o of near) {
      if (o.dyingT >= 0) continue;
      this.observe(o);
    }
    // threat awareness (sensory receptors extend range beyond the screen)
    const senseR = Math.max(p.r * 7, p.r * p.stats.sense);
    const sn = this.world.queryOrganisms(p.x, p.y, senseR, this.tmp);
    for (const o of sn) {
      if (o.dyingT >= 0) continue;
      const d = Math.sqrt(dist2(o.x, o.y, p.x, p.y)) - o.r - p.r;
      if (this.isThreat(o)) {
        if (d < nearest) { nearest = d; this.dangerDir = Math.atan2(o.y - p.y, o.x - p.x); }
        if (p.stats.sense > 0) this.threats.push({ x: o.x, y: o.y, d });
        if (o.targetIsPlayer) this.hint('threat', 'A red halo means something is hunting you — evade it!');
      } else if (p.stats.sense > 0 && o.sp.category === 'rare') {
        this.revealed.push({ x: o.x, y: o.y, rare: true });
      }
    }
    const dangerR = p.r * 6;
    this.danger = nearest === Infinity ? 0 : clamp(1 - nearest / dangerR, 0, 1);
    if (this.danger > 0.2) this.safeT = 0; else this.safeT += dt;

    // evolution availability
    const e = p.era;
    if (this.offers.length === 0) this.offers = generateOffers(p.traits, p.eraIndex);
    const minCost = this.offers.length ? Math.min(...this.offers.map((o) => o.cost)) : Infinity;
    if (p.dna >= minCost) {
      this.hint('evolve', 'Enough DNA to evolve! Tap the glowing helix to mutate', true);
      if (p.dna >= this.evolveSnoozeDna && this.safeT > 0.8) this.openEvolve();
    }

    // era leap
    if (p.growthFrac >= 1 && p.eraIndex < MAX_PLAYABLE_ERA) {
      if (p.mutationCount >= e.mutationsToLeap) {
        if (this.safeT > 0.8) this.openLeap();
      } else if (!this.leapBlockedHint) {
        this.leapBlockedHint = true;
        this.events.push({ type: 'hint', id: 'leapblock', text: `Fully grown! Acquire ${e.mutationsToLeap - p.mutationCount} more mutation${e.mutationsToLeap - p.mutationCount === 1 ? '' : 's'} to leap to Era ${ERAS[p.eraIndex].numeral}` });
      }
    } else if (p.growthFrac >= 1 && p.eraIndex === MAX_PLAYABLE_ERA && !this.frontierShown) {
      this.frontierShown = true;
      this.milestone('frontier');
      this.events.push({ type: 'hint', id: 'frontier', text: ERAS[MAX_PLAYABLE_ERA] ? `You have reached the edge of the known. Era ${ERAS[MAX_PLAYABLE_ERA].numeral} awaits in a future evolution of PRIMORDIA.` : 'You have walked out of the sea and grown to your full size. The story of life on land is only beginning.' });
    }
  }

  get evolveAvailable() {
    const p = this.player;
    return this.offers.length > 0 && p.dna >= Math.min(...this.offers.map((o) => o.cost));
  }
  get leapAvailable() {
    const p = this.player;
    return p.growthFrac >= 1 && p.eraIndex < MAX_PLAYABLE_ERA && p.mutationCount >= p.era.mutationsToLeap;
  }

  openEvolve() {
    if (this.state !== 'playing' || !this.offers.length) return;
    this.state = 'evolve';
  }
  closeEvolve(snooze: boolean) {
    if (this.state !== 'evolve') return;
    if (snooze) this.evolveSnoozeDna = this.player.dna + 12;
    this.state = 'playing';
    this.safeT = 0;
  }

  chooseMutation(index: number): boolean {
    const offer = this.offers[index];
    const p = this.player;
    if (!offer || p.dna < offer.cost) return false;
    p.dna -= offer.cost;
    const lv = p.addTrait(offer.trait.id);
    const first = this.progress.discoverMutation(offer.trait.id, lv);
    this.offers = generateOffers(p.traits, p.eraIndex);
    this.evolveSnoozeDna = 0;
    this.events.push({ type: 'mutation', traitId: offer.trait.id, level: lv, first });
    this.milestone('first_mutation');
    if (!this.progress.data.tutorialDone) { this.progress.data.tutorialDone = true; this.progress.markDirty(); }
    const t = TRAIT_BY_ID[offer.trait.id];
    if (t.ability && lv === 1) this.events.push({ type: 'hint', id: 'ab-' + t.id, text: `New ability: ${ABILITY_INFO[t.ability].name} — tap its button on the right` });
    this.state = 'playing';
    this.safeT = 0;
    return true;
  }

  openLeap() {
    if (this.state !== 'playing') return;
    const p = this.player;
    this.pendingLeapForm = formFor(p.eraIndex + 1, p.leapArchetype);
    this.state = 'leap';
  }

  confirmLeap() {
    if (this.state !== 'leap' || !this.pendingLeapForm) return;
    const p = this.player;
    p.eraIndex++;
    p.form = this.pendingLeapForm;
    p.recentTraits = {};
    p.growth = 0;
    p.r = p.targetR = p.era.minR;
    p.refresh();
    p.energy = p.maxEnergy;
    p.hp = p.maxHp;
    p.transformT = 0;
    // the sea opens up: rescale geography so the larger body has room to roam
    const k = p.era.worldScale / this.env.scale;
    if (Math.abs(k - 1) > 0.001) {
      this.env.setScale(p.era.worldScale);
      p.x *= k; p.y *= k; p.vx = 0; p.vy = 0;
      p.trail.length = 0;
      for (const sat of p.satellites) { sat.x = p.x; sat.y = p.y; }
      this.world.clearLife();
    }
    // Era VI: the sea gains a shoreline and dry land
    this.env.land = p.eraIndex >= 6;
    if (this.env.land) {
      let guard = 0;
      while (this.env.isLand(p.x, p.y) && guard++ < 200) p.y += p.r;
      p.breath = 1;
    }
    this.world.setEra(p.era);
    this.world.cx = p.x; this.world.cy = p.y;
    // the camera pulls back after a leap; size the spawn bubble for the new body
    this.viewR = Math.max(this.viewR, p.r * 24);
    this.world.viewR = this.viewR;
    this.world.collideRocks(p);
    if (Math.abs(k - 1) > 0.001) this.world.populate(p.x, p.y, p.r * 8);
    this.progress.reachEra(p.eraIndex);
    const first = this.progress.discoverForm(p.form.id);
    this.run.formsReached.push(p.form.name);
    this.offers = generateOffers(p.traits, p.eraIndex);
    this.leapBlockedHint = false;
    this.milestone('era' + p.eraIndex);
    this.events.push({ type: 'leap', era: p.eraIndex, form: p.form, first });
    this.pendingLeapForm = null;
    this.state = 'playing';
    this.safeT = 0;
  }

  pause() { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused') this.state = 'playing'; }

  private onLandfall() {
    const p = this.player;
    this.milestone('landfall');
    if (p.stats.landSpeed < 0.5) this.hint('!flop', 'You\'re flopping on dry land! Weight-Bearing Limbs let you walk, and Lungs let you breathe', true);
    else this.hint('!land', 'Dry land! Sea hunters can\'t follow you here — but watch your breath', true);
  }

  private die() {
    const p = this.player, r = this.run;
    if (!p.alive) return;
    // Amniotic Egg: the clutch hatches and the lineage carries on
    if (p.stats.extraLives > p.eggsUsed) {
      p.eggsUsed++;
      p.hp = p.maxHp * 0.7;
      p.energy = Math.max(p.energy, p.maxEnergy * 0.6);
      p.breath = 1;
      p.growth *= 0.6;
      p.hiddenT = 3; p.hardenT = 2;
      p.vx = 0; p.vy = 0;
      for (const o of this.world.queryOrganisms(p.x, p.y, p.r * 14, this.tmp)) {
        if (o.targetIsPlayer) { o.target = null; o.targetIsPlayer = false; o.mode = 'wander'; o.restT = 5; o.windupT = 0; o.lungeT = 0; }
      }
      this.milestone('clutch');
      this.events.push({ type: 'revive', x: p.x, y: p.y });
      this.events.push({ type: 'hint', id: 'revive', text: 'Your clutch hatched — your lineage lives on!' });
      return;
    }
    p.alive = false;
    p.hp = 0;
    const ld = r.lastDamage;
    let cause = 'starved', detail = 'Your energy ran out and your cell came apart.';
    if (ld.cause === 'predator' && ld.sp) { cause = 'predator'; detail = `Consumed by a ${ld.sp.name}.`; r.killer = ld.sp; this.progress.killedBy(ld.sp.id); }
    else if (ld.cause === 'spines' && ld.sp) { cause = 'spines'; detail = `Shredded on the barbs of a ${ld.sp.name}.`; r.killer = ld.sp; }
    else if (ld.cause === 'toxin' && ld.sp) { cause = 'toxin'; detail = `Poisoned by the toxins of a ${ld.sp.name} you ate.`; r.killer = ld.sp; }
    else if (ld.cause === 'heat') { cause = 'heat'; detail = 'Boiled in the scalding water of a thermal vent.'; }
    else if (ld.cause === 'suffocated') { cause = 'suffocated'; detail = 'Suffocated on dry land, just out of reach of the sea.'; }
    r.cause = cause; r.causeDetail = detail;
    this.events.push({ type: 'death', cause });
    this.state = 'dead';
  }

  /** Called by UI after death summary is built. */
  finalizeRun() {
    const p = this.player;
    // record form reached at death too
    if (p.eraIndex === 1) this.progress.discoverForm('protocell');
    return this.progress.endRun(this.run.time, this.run.dna, this.run.eaten, this.run.cause || 'starved');
  }
}
