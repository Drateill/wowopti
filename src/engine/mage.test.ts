import { describe, expect, it } from 'vitest';
import { BUFF_BY_ID, buffVisible } from '../data/buffs';
import { MAGE } from '../data/classes';
import { MAGE_DATA, MAGE_DEFAULT_TALENTS } from '../data/mage/data';
import { emptyStats } from '../data/types';
import { characterSheet } from '../state/classLogic';
import { buildConfig, defaultState, magePreset, type AppState } from '../state/store';
import { mageTalents, type MageSimConfig } from './mageSim';
import { simulateAny, statWeightsAny } from './sim';
import { isValid, totalPoints } from './talents';

function mage(spec: 'arcane' | 'fire' | 'frost', patch: Partial<AppState> = {}): AppState {
  return {
    ...defaultState('mage'), spec, talents: MAGE_DEFAULT_TALENTS[spec], mage: magePreset(spec), iterations: 300,
    extraStats: { ...emptyStats(), intellect: 200, spirit: 80, stamina: 150, critPct: 4, hitPct: 6, spellPower: 400, mp5: 10 },
    ...patch,
  };
}
const run = (s: AppState) => simulateAny(buildConfig(s) as MageSimConfig);
const row = (r: ReturnType<typeof run>, id: string) => r.breakdown.find((b) => b.id === id);

describe('mage : données', () => {
  it('les builds types sont valides et font 51 points', () => {
    expect(MAGE_DATA.trees.map((t) => t.key)).toEqual(['arcane', 'fire', 'frost']);
    for (const spec of MAGE.specs) {
      expect(totalPoints(spec.defaultTalents)).toBe(51);
      expect(isValid(spec.defaultTalents, MAGE.talents)).toBe(true);
    }
  });

  it('lit les talents Forever', () => {
    const fx = mageTalents({ ...MAGE_DEFAULT_TALENTS.arcane, ...MAGE_DEFAULT_TALENTS.fire, ...MAGE_DEFAULT_TALENTS.frost });
    expect(fx.arcaneMindCritPct).toBe(100);
    expect(fx.ignitePct).toBe(40);
    expect(fx.heatingUpPct).toBe(25);
    expect(fx.firePowerMax).toBe(12);
    expect(fx.shatterPct).toBe(50);
    expect(fx.fingersCharges).toBe(2);
    expect(fx.barrageBlastPct).toBe(40);
  });
});

describe('mage : simulation', () => {
  it('Arcanes : Déflagration, Colère et Projectiles', () => {
    const r = run(mage('arcane'));
    expect(r.dps).toBeGreaterThan(200);
    expect(row(r, 'arcaneBlast')!.casts).toBeGreaterThan(10);
    expect(row(r, 'arcaneWrath')!.casts).toBeGreaterThan(10);
    expect(row(r, 'arcaneMissiles')!.ticks).toBeGreaterThan(20);
  });

  it('Feu : Brûlure, Enflammer et Explosion pyrotechnique', () => {
    const r = run(mage('fire'));
    expect(r.dps).toBeGreaterThan(200);
    expect(row(r, 'ignite')!.damage).toBeGreaterThan(0);
    expect(row(r, 'pyroblast')!.casts).toBeGreaterThan(2);
    expect(row(r, 'scorch')!.casts).toBeGreaterThan(4);
  });

  it('Givre : Javelot de glace avec Doigts de givre, Barrière de glace', () => {
    const r = run(mage('frost'));
    const noBarrier = run(mage('frost', { mage: { ...magePreset('frost'), iceBarrier: false } }));
    expect(r.dps).toBeGreaterThan(200);
    expect(row(r, 'iceLance')!.casts).toBeGreaterThan(2);
    expect(r.dps).toBeGreaterThan(noBarrier.dps * 1.1);
  });

  it('poids de stats : puissance des sorts = 1, le crit compte', () => {
    const { weights } = statWeightsAny({ ...buildConfig(mage('frost')), iterations: 800 });
    expect(weights.find((w) => w.key === 'spellPower')!.ep).toBeCloseTo(1);
    expect(weights.find((w) => w.key === 'critPct')!.ep).toBeGreaterThan(3);
  });
});

describe('mage : app', () => {
  it('feuille de personnage et buffs de lanceur de sorts', () => {
    expect(characterSheet(mage('fire')).entries[0].label).toBe('sumSp');
    expect(buffVisible(BUFF_BY_ID.get('flaskSupreme')!, 'mage', 'fire')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('curseOfElements')!, 'mage', 'frost')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('mongoose')!, 'mage', 'frost')).toBe(false);
  });
});
