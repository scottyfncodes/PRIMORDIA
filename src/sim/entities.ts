import type { SpeciesDef } from './species';

export interface Body { x: number; y: number; vx: number; vy: number; r: number }

export type NutrientKind = 'mote' | 'rich' | 'dna' | 'scrap';

export class Nutrient implements Body {
  x = 0; y = 0; vx = 0; vy = 0; r = 2;
  energy = 0; growth = 0; dna = 0;
  kind: NutrientKind = 'mote';
  phase = Math.random() * 10;
  life = 0;
  active = false;
  /** being drawn into an absorber */
  absorbT = -1;
  absorbX = 0; absorbY = 0;
}

export type AiMode = 'wander' | 'flee' | 'hunt' | 'graze' | 'school' | 'rest' | 'lured';

export class Organism implements Body {
  id = 0;
  sp!: SpeciesDef;
  x = 0; y = 0; vx = 0; vy = 0; r = 5;
  angle = 0;
  hp = 1; maxHp = 1;
  alive = false;
  seed = 0;
  phase = 0;
  mode: AiMode = 'wander';
  target: Body | null = null;
  targetIsPlayer = false;
  thinkT = 0;
  wanderA = 0;
  satiety = 0;
  huntT = 0;
  restT = 0;
  windupT = 0;
  lungeT = 0;
  lungeCd = 0;
  stunT = 0;
  biteCd = 0;
  hurtT = 0;
  revealT = 0;
  anchorX = 0; anchorY = 0;
  fleeX = 0; fleeY = 0;
  /** death / consumption animation */
  dyingT = -1;
  /** 0..1 binary fission in progress (−1 when not dividing) */
  divideT = -1;
  eater: Body | null = null;
  eatenByPlayer = false;
  /** has been on screen at least once this life */
  onScreen = false;
}
