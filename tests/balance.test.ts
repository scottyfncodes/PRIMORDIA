import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runBot, type Strategy } from './bot';

describe('balance autopilot', () => {
  for (const strat of ['predator', 'defender', 'opportunist', 'phototroph'] as Strategy[]) {
    it(`${strat} lineage plays without numerical errors`, () => {
      const results = [1, 2].map((seed) => runBot(strat, 720, seed * 7919 + strat.length * 131));
      if (process.env.BOT_LOG) appendFileSync(process.env.BOT_LOG, strat + ' ' + results.map((r) => JSON.stringify(r)).join('\n' + strat + ' ') + '\n');
      for (const r of results) {
        expect(r.nanSeen).toBe(false);
        expect(r.firstMutation).toBeGreaterThan(0);
        expect(r.firstMutation).toBeLessThan(150);
      }
    }, 120000);
  }
});
