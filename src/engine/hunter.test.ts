import { describe, expect, it } from 'vitest';
import { BUFF_BY_ID, buffVisible } from '../data/buffs';
import { HUNTER } from '../data/classes';
import { HUNTER_DATA, HUNTER_DEFAULT_TALENTS } from '../data/hunter/data';
import { emptyStats } from '../data/types';
import { characterSheet } from '../state/classLogic';
import { buildConfig, defaultState, hunterPreset, migrate, type AppState } from '../state/store';
import { hunterTalents, type HunterSimConfig } from './hunterSim';
import { simulateAny, statWeightsAny } from './sim';
import { isValid, totalPoints } from './talents';

const BOW = { min: 120, max: 220, speed: 3, twoHand: true };
const AXE = { min: 180, max: 270, speed: 3.6, twoHand: true };

function hunter(spec: 'bm' | 'mm' | 'surv', patch: Partial<AppState> = {}): AppState {
  return {
    ...defaultState('hunter'), spec, talents: HUNTER_DEFAULT_TALENTS[spec], hun: hunterPreset(spec), iterations: 300,
    extraStats: { ...emptyStats(), agility: 250, attackPower: 300, strength: 60, critPct: 4, hitPct: 6, intellect: 100, spirit: 40, stamina: 150, mp5: 10 },
    ...patch,
  };
}
const run = (s: AppState, weapons = true) => {
  const c = buildConfig(s) as HunterSimConfig;
  return simulateAny(weapons ? { ...c, weapon: BOW, meleeWeapon: AXE } : c);
};
const row = (r: ReturnType<typeof run>, id: string) => r.breakdown.find((b) => b.id === id);

describe('chasseur : données', () => {
  it('les builds types sont valides et font 51 points', () => {
    expect(HUNTER_DATA.trees.map((t) => t.key)).toEqual(['beastMastery', 'marksmanship', 'survival']);
    for (const spec of HUNTER.specs) {
      expect(totalPoints(spec.defaultTalents)).toBe(51);
      expect(isValid(spec.defaultTalents, HUNTER.talents)).toBe(true);
    }
  });

  it('lit les talents Forever', () => {
    const fx = hunterTalents({ ...HUNTER_DEFAULT_TALENTS.bm, ...HUNTER_DEFAULT_TALENTS.mm, ...HUNTER_DEFAULT_TALENTS.surv });
    expect(fx.deadlyAspectsChance).toBe(10);
    expect(fx.deadlyAspectsSpeed).toBe(30);
    expect(fx.unleashedFuryPct).toBe(15);
    expect(fx.frenzySpeed).toBe(30);
    expect(fx.carefulAimPct).toBe(100);
    expect(fx.loneWolfPct).toBe(20);
    expect(fx.trueshotAp).toBe(20);
    expect(fx.mortalShotsPct).toBe(30);
    expect(fx.rapidKillingMin).toBe(2);
    expect(fx.improvedArcaneShotSec).toBe(1.5);
    expect(fx.predatorsEdgePct).toBe(30);
    expect(fx.exposePreyChance).toBe(10);
    expect(fx.laceratingPct).toBe(40);
    expect(fx.lightningReflexesPct).toBe(15);
  });

  it('buffs physiques visibles, Cri de guerre réservé à la Survie', () => {
    expect(buffVisible(BUFF_BY_ID.get('mongoose')!, 'hunter', 'mm')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('battleShout')!, 'hunter', 'mm')).toBe(false);
    expect(buffVisible(BUFF_BY_ID.get('battleShout')!, 'hunter', 'surv')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('sunderArmor')!, 'hunter', 'bm')).toBe(true);
  });
});

describe('chasseur : simulation', () => {
  it('Maîtrise des bêtes : familier, faucons, Visée, Tir automatique', () => {
    const r = run(hunter('bm'));
    expect(r.dps).toBeGreaterThan(300);
    expect(row(r, 'pet')!.damage).toBeGreaterThan(0);
    expect(row(r, 'summonHawk')!.casts).toBeGreaterThan(10);
    expect(row(r, 'aimedShot')!.casts).toBeGreaterThan(15);
    expect(row(r, 'autoShot')!.casts).toBeGreaterThan(50);
  });

  it('Précision : sans familier, Tir de précision, Tir des arcanes', () => {
    const r = run(hunter('mm'));
    expect(r.dps).toBeGreaterThan(300);
    expect(row(r, 'pet')).toBeUndefined();
    expect(row(r, 'sniperShot')!.casts).toBeGreaterThan(5);
    expect(row(r, 'arcaneShot')!.casts).toBeGreaterThan(10);
    // Loup solitaire : sortir le familier fait perdre les 20 % du chasseur.
    const withPet = run(hunter('mm', { hun: { ...hunterPreset('mm'), pet: true } }));
    const shooterOnly = withPet.breakdown.filter((b) => b.id !== 'pet').reduce((a, b) => a + b.damage, 0);
    const alone = r.breakdown.reduce((a, b) => a + b.damage, 0);
    expect(alone).toBeGreaterThan(shooterOnly * 1.1);
  });

  it('Survie : mêlée, Attaque du raptor, Morsure de la mangouste et saignement', () => {
    const r = run(hunter('surv'));
    expect(r.dps).toBeGreaterThan(250);
    expect(row(r, 'melee')!.damage).toBeGreaterThan(0);
    expect(row(r, 'raptorStrike')!.casts).toBeGreaterThan(15);
    expect(row(r, 'mongooseBite')!.casts).toBeGreaterThan(3);
    expect(row(r, 'laceratingStrikes')!.ticks).toBeGreaterThan(5);
    expect(row(r, 'autoShot')).toBeUndefined();
  });

  it('une meilleure arme à distance augmente les dégâts', () => {
    const base = run(hunter('mm'));
    const c = buildConfig(hunter('mm')) as HunterSimConfig;
    const better = simulateAny({ ...c, weapon: { ...BOW, min: BOW.min + 60, max: BOW.max + 60 } });
    expect(better.dps).toBeGreaterThan(base.dps);
  });

  it('poids de stats : puissance d’attaque = 1, agilité et toucher utiles', () => {
    const { weights } = statWeightsAny(buildConfig(hunter('mm', { iterations: 200 })));
    expect(weights.find((w) => w.key === 'attackPower')!.ep).toBe(1);
    expect(weights.find((w) => w.key === 'agility')!.ep).toBeGreaterThan(1);
    expect(weights.find((w) => w.key === 'hitPct')!.dpsGain).toBeGreaterThan(0);
    expect(weights.find((w) => w.key === 'weaponDps')!.dpsGain).toBeGreaterThan(0);
  });

  it('feuille de personnage et migration', () => {
    const sheet = characterSheet(hunter('mm'));
    expect(sheet.entries[0].label).toBe('sheetRangedAp');
    expect(sheet.entries[0].value).toBeGreaterThan(900);
    expect(characterSheet(hunter('surv')).entries[0].label).toBe('sheetAp');
    const m = migrate({ classId: 'hunter', talents: HUNTER_DEFAULT_TALENTS.surv } as Partial<AppState>, 'hunter');
    expect(m.spec).toBe('surv');
  });
});
