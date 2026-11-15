import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runBot, type Strategy } from './bot';

// BOT_ERA=8 starts each lineage in that era with the mutations it would have by then (for balancing the late game)
const startEra = Number(process.env.BOT_ERA || 1);

describe('balance autopilot', () => {
  for (const strat of ['predator', 'defender', 'opportunist', 'phototroph'] as Strategy[]) {
    it(`${strat} lineage plays without numerical errors`, () => {
      const results = [1, 2].map((seed) => runBot(strat, Number(process.env.BOT_SECONDS || 720), seed * 7919 + strat.length * 131, startEra));
      if (process.env.BOT_LOG) appendFileSync(process.env.BOT_LOG, strat + ' ' + results.map((r) => JSON.stringify(r)).join('\n' + strat + ' ') + '\n');
      for (const r of results) {
        expect(r.nanSeen).toBe(false);
        if (startEra > 1) continue;
        expect(r.firstMutation).toBeGreaterThan(0);
        expect(r.firstMutation).toBeLessThan(150);
      }
    }, 1200000);
  }
});
