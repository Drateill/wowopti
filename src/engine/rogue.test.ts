import { describe, expect, it } from 'vitest';
import { BUFF_BY_ID, buffVisible } from '../data/buffs';
import { ROGUE } from '../data/classes';
import { ROGUE_DATA, ROGUE_DEFAULT_TALENTS, type RogueSpec } from '../data/rogue/data';
import { emptyStats } from '../data/types';
import { characterSheet } from '../state/classLogic';
import { buildConfig, defaultState, migrate, roguePreset, type AppState } from '../state/store';
import { rogueTalents, type RogueSimConfig } from './rogueSim';
import { simulateAny, statWeightsAny } from './sim';
import { isValid, totalPoints } from './talents';

const SWORD = { min: 90, max: 165, speed: 2.7, twoHand: false };
const DAGGER = { min: 70, max: 120, speed: 1.8, twoHand: false };
const OFF = { min: 60, max: 110, speed: 1.6, twoHand: false };

function rogue(spec: RogueSpec, patch: Partial<AppState> = {}): AppState {
  return {
    ...defaultState('rogue'), spec, talents: ROGUE_DEFAULT_TALENTS[spec], rog: roguePreset(spec), iterations: 300,
    extraStats: { ...emptyStats(), agility: 300, attackPower: 300, strength: 100, critPct: 5, hitPct: 6, stamina: 150 },
    ...patch,
  };
}
const run = (s: AppState) => {
  const c = buildConfig(s) as RogueSimConfig;
  const mh = s.rog.weaponType === 'dagger' ? DAGGER : SWORD;
  return simulateAny({ ...c, weapon: mh, offHand: OFF });
};
const row = (r: ReturnType<typeof run>, id: string) => r.breakdown.find((b) => b.id === id);

describe('voleur : données', () => {
  it('les builds types sont valides et font 51 points', () => {
    expect(ROGUE_DATA.trees.map((t) => t.key)).toEqual(['assassination', 'combat', 'subtlety']);
    for (const spec of ROGUE.specs) {
      expect(totalPoints(spec.defaultTalents)).toBe(51);
      expect(isValid(spec.defaultTalents, ROGUE.talents)).toBe(true);
    }
  });

  it('lit les talents Forever', () => {
    const fx = rogueTalents({ ...ROGUE_DEFAULT_TALENTS.subtlety, ...ROGUE_DEFAULT_TALENTS.assassination, ...ROGUE_DEFAULT_TALENTS.combat });
    expect(fx.malicePct).toBe(5);
    expect(fx.sealFateChance).toBe(100);
    expect(fx.improvedSndPct).toBe(45);
    expect(fx.relentlessPct).toBeGreaterThan(0);
    expect(fx.precisionPct).toBe(3);
    expect(fx.aggressionPct).toBe(15);
    expect(fx.dualWieldPct).toBe(50);
    expect(fx.hackAndSlashPct).toBe(5);
    expect(fx.flashOfSteelEnergy).toBe(15);
    expect(fx.flashOfSteelSec).toBe(2);
    expect(fx.opportunityPct).toBe(20);
    expect(fx.serratedArmorPct).toBe(9);
    expect(fx.bootKnifeChance).toBe(100);
    expect(fx.vilePoisonsPct).toBe(20);
  });

  it('buffs de corps à corps visibles', () => {
    expect(buffVisible(BUFF_BY_ID.get('mongoose')!, 'rogue', 'combat')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('battleShout')!, 'rogue', 'combat')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('arcaneIntellect')!, 'rogue', 'combat')).toBe(false);
  });
});

describe('voleur : simulation', () => {
  it('Combat : Attaque pernicieuse, Débiter, Éviscération, Surin, poisons', () => {
    const r = run(rogue('combat'));
    expect(r.dps).toBeGreaterThan(280);
    expect(row(r, 'sinisterStrike')!.casts).toBeGreaterThan(30);
    expect(row(r, 'eviscerate')!.casts).toBeGreaterThan(5);
    expect(row(r, 'sliceAndDice')!.casts).toBeGreaterThan(3);
    expect(row(r, 'shank')!.casts).toBeGreaterThan(15);
    expect(row(r, 'offHand')!.damage).toBeGreaterThan(0);
    expect(row(r, 'instantPoison')!.damage).toBeGreaterThan(0);
    expect(row(r, 'deadlyPoison')!.ticks).toBeGreaterThan(10);
    expect(row(r, 'extraAttack')!.casts).toBeGreaterThan(0);
  });

  it('Assassinat : Estropier ; Finesse : Hémorragie et Rupture', () => {
    const a = run(rogue('assassination'));
    expect(a.dps).toBeGreaterThan(280);
    expect(row(a, 'mutilate')!.casts).toBeGreaterThan(15);
    const s = run(rogue('subtlety'));
    expect(s.dps).toBeGreaterThan(250);
    expect(row(s, 'hemorrhage')!.casts).toBeGreaterThan(15);
    expect(row(s, 'rupture')!.ticks).toBeGreaterThan(10);
  });

  it('sans main gauche : pas de Surin ni de coups de main gauche', () => {
    const c = buildConfig(rogue('combat')) as RogueSimConfig;
    const r = simulateAny({ ...c, weapon: SWORD, offHand: null });
    expect(row(r, 'offHand')).toBeUndefined();
    expect(row(r, 'shank')).toBeUndefined();
  });

  it('poids de stats : puissance d’attaque = 1, agilité, toucher et arme utiles', () => {
    const { weights } = statWeightsAny(buildConfig(rogue('combat', { iterations: 200 })));
    expect(weights.find((w) => w.key === 'attackPower')!.ep).toBe(1);
    expect(weights.find((w) => w.key === 'agility')!.ep).toBeGreaterThan(1);
    expect(weights.find((w) => w.key === 'hitPct')!.dpsGain).toBeGreaterThan(0);
    expect(weights.find((w) => w.key === 'weaponDps')!.dpsGain).toBeGreaterThan(0);
  });

  it('feuille de personnage et migration', () => {
    const sheet = characterSheet(rogue('combat'));
    expect(sheet.entries[0].label).toBe('sheetAp');
    expect(sheet.entries[0].value).toBeGreaterThan(800);
    const m = migrate({ classId: 'rogue', talents: ROGUE_DEFAULT_TALENTS.subtlety } as Partial<AppState>, 'rogue');
    expect(m.spec).toBe('subtlety');
  });
});
