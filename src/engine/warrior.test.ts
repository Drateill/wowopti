import { describe, expect, it } from 'vitest';
import { BUFF_BY_ID, buffVisible } from '../data/buffs';
import { WARRIOR } from '../data/classes';
import { emptyStats } from '../data/types';
import { WARRIOR_DATA, WARRIOR_DEFAULT_TALENTS, type WarriorSpec } from '../data/warrior/data';
import { characterSheet } from '../state/classLogic';
import { buildConfig, defaultState, migrate, warriorPreset, type AppState } from '../state/store';
import { simulateAny, statWeightsAny } from './sim';
import { isValid, totalPoints } from './talents';
import { warriorTalents, type WarriorSimConfig } from './warriorSim';

const TWO_HAND = { min: 200, max: 300, speed: 3.8, twoHand: true };
const MAIN = { min: 100, max: 180, speed: 2.7, twoHand: false };
const OFF = { min: 90, max: 160, speed: 2.5, twoHand: false };

function warrior(spec: WarriorSpec, patch: Partial<AppState> = {}): AppState {
  return {
    ...defaultState('warrior'), spec, talents: WARRIOR_DEFAULT_TALENTS[spec], war: warriorPreset(spec), iterations: 300,
    extraStats: { ...emptyStats(), strength: 300, attackPower: 250, agility: 120, critPct: 5, hitPct: 6, stamina: 250, armor: 6000, defense: 60, blockValue: 60 },
    ...patch,
  };
}
const run = (s: AppState) => {
  const c = buildConfig(s) as WarriorSimConfig;
  if (s.spec === 'arms') return simulateAny({ ...c, weapon: TWO_HAND, offHand: null });
  return simulateAny({ ...c, weapon: MAIN, offHand: s.spec === 'fury' ? OFF : null });
};
const row = (r: ReturnType<typeof run>, id: string) => r.breakdown.find((b) => b.id === id);

describe('guerrier : données', () => {
  it('les builds types sont valides et font 51 points', () => {
    expect(WARRIOR_DATA.trees.map((t) => t.key)).toEqual(['arms', 'fury', 'protection']);
    for (const spec of WARRIOR.specs) {
      expect(totalPoints(spec.defaultTalents)).toBe(51);
      expect(isValid(spec.defaultTalents, WARRIOR.talents)).toBe(true);
    }
  });

  it('lit les talents Forever', () => {
    const fx = warriorTalents({ ...WARRIOR_DEFAULT_TALENTS.prot, ...WARRIOR_DEFAULT_TALENTS.arms, ...WARRIOR_DEFAULT_TALENTS.fury });
    expect(fx.improvedHeroicStrike).toBe(3);
    expect(fx.deepWoundsPct).toBe(60);
    expect(fx.impalePct).toBe(20);
    expect(fx.crueltyPct).toBe(5);
    expect(fx.unbridledChance).toBe(60);
    expect(fx.dualWieldPct).toBe(25);
    expect(fx.dualWieldRagePct).toBe(50);
    expect(fx.flurryPct).toBe(30);
    expect(fx.improvedWhirlwindSec).toBe(2);
    expect(fx.shieldSpecRage).toBe(5);
    expect(fx.focusedRage).toBe(3);
    expect(fx.bastionPct).toBe(10);
    expect(fx.anticipation).toBe(20);
    expect(warriorTalents(WARRIOR_DEFAULT_TALENTS.arms).weaponmasterExtra).toBe(5);
  });

  it('buffs : Chef de la meute et Fracasser armure visibles, élixir de défense pour la Protection', () => {
    expect(buffVisible(BUFF_BY_ID.get('leaderOfThePack')!, 'warrior', 'fury')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('sunderArmor')!, 'warrior', 'arms')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('greaterDefense')!, 'warrior', 'prot')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('greaterDefense')!, 'warrior', 'fury')).toBe(false);
  });
});

describe('guerrier : simulation', () => {
  it('Armes : Frappe mortelle, Heurtoir, Fulgurance, Blessures profondes, Exécution', () => {
    const r = run(warrior('arms'));
    expect(r.dps).toBeGreaterThan(200);
    expect(row(r, 'mortalStrike')!.casts).toBeGreaterThan(5);
    expect(row(r, 'slam')!.casts).toBeGreaterThan(5);
    expect(row(r, 'overpower')!.casts).toBeGreaterThan(3);
    expect(row(r, 'deepWounds')!.ticks).toBeGreaterThan(10);
    expect(row(r, 'execute')!.casts).toBeGreaterThan(2);
  });

  it('Fureur : deux armes, Sanguinaire, Tourbillon, plus de dégâts qu’à une arme', () => {
    const r = run(warrior('fury'));
    expect(r.dps).toBeGreaterThan(250);
    expect(row(r, 'offHand')!.damage).toBeGreaterThan(0);
    expect(row(r, 'bloodthirst')!.casts).toBeGreaterThan(10);
    expect(row(r, 'whirlwind')!.casts).toBeGreaterThan(5);
    const c = buildConfig(warrior('fury')) as WarriorSimConfig;
    const single = simulateAny({ ...c, weapon: MAIN, offHand: null });
    expect(r.dps).toBeGreaterThan(single.dps);
  });

  it('Protection : menace avec Heurt de bouclier, Vengeance et Fracasser armure', () => {
    const r = run(warrior('prot'));
    expect(r.dps).toBeGreaterThan(300);
    expect(row(r, 'shieldSlam')!.casts).toBeGreaterThan(10);
    expect(row(r, 'revenge')!.casts).toBeGreaterThan(5);
    expect(row(r, 'sunderArmor')!.damage).toBeGreaterThan(0);
    expect(r.extras!.damageTakenPerSecond).toBeGreaterThan(0);
  });

  it('poids de stats : puissance d’attaque = 1, force et arme utiles', () => {
    const { weights } = statWeightsAny(buildConfig(warrior('fury', { iterations: 200 })));
    expect(weights.find((w) => w.key === 'attackPower')!.ep).toBe(1);
    expect(weights.find((w) => w.key === 'strength')!.ep).toBeGreaterThan(1.5);
    expect(weights.find((w) => w.key === 'weaponDps')!.dpsGain).toBeGreaterThan(0);
  });

  it('feuille de personnage et migration', () => {
    expect(characterSheet(warrior('fury')).entries[0].label).toBe('sheetAp');
    expect(characterSheet(warrior('prot')).entries[0].label).toBe('sheetDefense');
    const m = migrate({ classId: 'warrior', talents: WARRIOR_DEFAULT_TALENTS.prot } as Partial<AppState>, 'warrior');
    expect(m.spec).toBe('prot');
  });
});
