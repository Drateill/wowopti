import { describe, expect, it } from 'vitest';
import { ROGUE_DEFAULT_TALENTS } from '../data/rogue/data';
import { SHAMAN_DEFAULT_TALENTS } from '../data/shaman/data';
import { emptyStats } from '../data/types';
import { buildConfig, defaultState, roguePreset, shamanPreset, type AppState } from '../state/store';
import { aoeMultiplier } from './fight';
import { simulateAny } from './sim';

const row = (r: ReturnType<typeof simulateAny>, id: string) => r.breakdown.find((b) => b.id === id);

describe('type de combat', () => {
  it('multiplicateurs de zone', () => {
    expect(aoeMultiplier('chainLightning', 1)).toBe(1);
    expect(aoeMultiplier('chainLightning', 5)).toBeCloseTo(2.19, 2);
    expect(aoeMultiplier('whirlwind', 10)).toBe(4);
    expect(aoeMultiplier('multiShot', 2)).toBe(2);
    expect(aoeMultiplier('consecration', 6)).toBe(6);
    expect(aoeMultiplier('lightningBolt', 5)).toBe(1);
  });

  it('plusieurs cibles : Chaîne d’éclairs et Déluge de lames rapportent plus', () => {
    const sha: AppState = {
      ...defaultState('shaman'), spec: 'elemental', talents: SHAMAN_DEFAULT_TALENTS.elemental, sha: { ...shamanPreset('elemental'), chainLightning: true }, iterations: 150,
      extraStats: { ...emptyStats(), spellPower: 300, intellect: 250, critPct: 4, hitPct: 4, mp5: 40 },
    };
    const one = simulateAny(buildConfig(sha));
    const three = simulateAny(buildConfig({ ...sha, targets: 3 }));
    expect(row(three, 'chainLightning')!.damage).toBeCloseTo(row(one, 'chainLightning')!.damage * 2.19, 0);
    expect(row(three, 'lightningBolt')!.damage).toBeCloseTo(row(one, 'lightningBolt')!.damage, 5);
    expect(three.dps).toBeGreaterThan(one.dps);

    const rog: AppState = { ...defaultState('rogue'), spec: 'combat', talents: ROGUE_DEFAULT_TALENTS.combat, rog: roguePreset('combat'), iterations: 150, extraStats: { ...emptyStats(), agility: 250, attackPower: 250 } };
    const r1 = simulateAny(buildConfig(rog));
    const r2 = simulateAny(buildConfig({ ...rog, targets: 2 }));
    expect(row(r2, 'bladeFlurry')!.damage).toBeGreaterThan(0);
    expect(r2.dps).toBeGreaterThan(r1.dps);
  });

  it('déplacements : le lanceur perd ses incantations, pas ses dégâts sur la durée', () => {
    const sha: AppState = { ...defaultState('shaman'), spec: 'elemental', talents: SHAMAN_DEFAULT_TALENTS.elemental, iterations: 150, extraStats: { ...emptyStats(), spellPower: 300, intellect: 250 } };
    const still = simulateAny(buildConfig(sha));
    const moving = simulateAny(buildConfig({ ...sha, movementPct: 20 }));
    expect(row(moving, 'lightningBolt')!.damage).toBeCloseTo(row(still, 'lightningBolt')!.damage * 0.8, 5);
    expect(row(moving, 'flameShock')!.damage).toBeGreaterThan(row(still, 'flameShock')!.damage * 0.85);
    expect(moving.dps).toBeLessThan(still.dps);
  });

  it('les soigneurs ne sont pas multipliés par les cibles', () => {
    const resto: AppState = { ...defaultState('shaman'), spec: 'resto', talents: SHAMAN_DEFAULT_TALENTS.resto, iterations: 100 };
    expect(simulateAny(buildConfig({ ...resto, targets: 5 })).dps).toBeCloseTo(simulateAny(buildConfig(resto)).dps, 5);
  });
});
