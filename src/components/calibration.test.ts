import { describe, expect, it } from 'vitest';
import type { SpellDef } from '../data/types';
import { scaleSpell } from './Calibration';

describe('recalage', () => {
  const bolt: SpellDef = { id: 'shadowBolt', school: 'shadow', destruction: true, castTime: 3, manaCost: 380, directMin: 500, directMax: 600, directCoeff: 0.857 };
  const dot: SpellDef = { id: 'corruption', school: 'shadow', destruction: false, castTime: 0, manaCost: 290, dotTotal: 822, dotDuration: 18, dotTicks: 6, dotCoeff: 1 };
  it('multiplie base et coefficient du coup direct, sans toucher au reste', () => {
    const s = scaleSpell(bolt, 'direct', 1.1);
    expect([s.directMin, s.directMax, s.directCoeff]).toEqual([550, 660, 0.943]);
    expect(s.manaCost).toBe(380);
  });
  it('multiplie les dégâts sur la durée', () => {
    const s = scaleSpell(dot, 'dot', 0.9);
    expect([s.dotTotal, s.dotCoeff]).toEqual([739.8, 0.9]);
  });
});
