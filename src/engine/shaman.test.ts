import { describe, expect, it } from 'vitest';
import { BUFF_BY_ID, buffVisible } from '../data/buffs';
import { SHAMAN } from '../data/classes';
import { SHAMAN_DATA, SHAMAN_DEFAULT_TALENTS, type ShamanSpec } from '../data/shaman/data';
import { emptyStats } from '../data/types';
import { characterSheet } from '../state/classLogic';
import { buildConfig, defaultState, migrate, shamanPreset, type AppState } from '../state/store';
import { shamanTalents, type ShamanSimConfig } from './shamanSim';
import { simulateAny, statWeightsAny } from './sim';
import { isValid, totalPoints } from './talents';

const TWO_HAND = { min: 200, max: 300, speed: 3.8, twoHand: true };

function shaman(spec: ShamanSpec, patch: Partial<AppState> = {}): AppState {
  return {
    ...defaultState('shaman'), spec, talents: SHAMAN_DEFAULT_TALENTS[spec], sha: shamanPreset(spec), iterations: 300,
    extraStats: { ...emptyStats(), spellPower: 350, healingPower: 450, attackPower: 250, strength: 200, agility: 100, critPct: 4, hitPct: 4, intellect: 250, spirit: 100, stamina: 200, mp5: 30 },
    ...patch,
  };
}
const run = (s: AppState) => {
  const c = buildConfig(s) as ShamanSimConfig;
  return simulateAny({ ...c, weapon: TWO_HAND });
};
const row = (r: ReturnType<typeof run>, id: string) => r.breakdown.find((b) => b.id === id);

describe('chaman : données', () => {
  it('les builds types sont valides et font 51 points', () => {
    expect(SHAMAN_DATA.trees.map((t) => t.key)).toEqual(['elemental', 'enhancement', 'restoration']);
    for (const spec of SHAMAN.specs) {
      expect(totalPoints(spec.defaultTalents)).toBe(51);
      expect(isValid(spec.defaultTalents, SHAMAN.talents)).toBe(true);
    }
  });

  it('lit les talents Forever', () => {
    const fx = shamanTalents({ ...SHAMAN_DEFAULT_TALENTS.resto, ...SHAMAN_DEFAULT_TALENTS.enhancement, ...SHAMAN_DEFAULT_TALENTS.elemental });
    expect(fx.convectionPct).toBe(10);
    expect(fx.concussionPct).toBe(5);
    expect(fx.elementalAlacritySec).toBe(0.5);
    expect(fx.lightningOverloadChance).toBe(30);
    expect(fx.elementalFuryPct).toBe(100);
    expect(fx.thunderingStrikesPct).toBe(5);
    expect(fx.ancestralKnowledgePct).toBe(10);
    expect(fx.mentalDexterityPct).toBe(100);
    expect(fx.elementalWeaponsWfPct).toBe(40);
    expect(fx.shamanisticFocusPct).toBe(45);
    expect(fx.tidalFocusCostPct).toBe(5);
    expect(fx.mindfulnessPct).toBe(50);
    const enh = shamanTalents(SHAMAN_DEFAULT_TALENTS.enhancement);
    expect(enh.maelstromRank).toBe(5);
    expect(enh.mentalQuicknessPct).toBe(30);
    expect(enh.improvedStormstrikeRegen).toBe(50);
    const resto = shamanTalents(SHAMAN_DEFAULT_TALENTS.resto);
    expect(resto.healingWayPct).toBe(25);
    expect(resto.purificationPct).toBe(10);
    expect(resto.improvedHealingWaveSec).toBe(0.5);
  });

  it('buffs par rôle', () => {
    expect(buffVisible(BUFF_BY_ID.get('flaskSupreme')!, 'shaman', 'elemental')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('mongoose')!, 'shaman', 'enhancement')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('mongoose')!, 'shaman', 'resto')).toBe(false);
    expect(buffVisible(BUFF_BY_ID.get('mageblood')!, 'shaman', 'resto')).toBe(true);
  });
});

describe('chaman : simulation', () => {
  it('Élémentaire : Éclair, Horion de flammes, Totem incendiaire, Surcharge de foudre', () => {
    const r = run(shaman('elemental'));
    expect(r.dps).toBeGreaterThan(250);
    expect(row(r, 'lightningBolt')!.casts).toBeGreaterThan(30);
    expect(row(r, 'flameShock')!.ticks).toBeGreaterThan(10);
    expect(row(r, 'searingTotem')!.damage).toBeGreaterThan(0);
    expect(row(r, 'lightningOverload')!.hits).toBeGreaterThan(3);
  });

  it('Amélioration : Furie-des-vents, Courroux naturel, Éclair du Maelström', () => {
    const r = run(shaman('enhancement'));
    expect(r.dps).toBeGreaterThan(300);
    expect(row(r, 'windfury')!.damage).toBeGreaterThan(0);
    expect(row(r, 'stormstrike')!.casts).toBeGreaterThan(10);
    expect(row(r, 'lightningBolt')!.casts).toBeGreaterThan(3);
    const rock = run(shaman('enhancement', { sha: { ...shamanPreset('enhancement'), imbue: 'rockbiter' } }));
    expect(row(rock, 'windfury')).toBeUndefined();
  });

  it('Restauration : Salve de guérison, Remous, Marée de mana', () => {
    const r = run(shaman('resto'));
    expect(r.dps).toBeGreaterThan(300);
    expect(row(r, 'chainHeal')!.casts).toBeGreaterThan(20);
    expect(row(r, 'riptide')!.ticks).toBeGreaterThan(20);
    expect(row(r, 'manaTideTotem')!.casts).toBeGreaterThanOrEqual(1);
    const wave = run(shaman('resto', { sha: { ...shamanPreset('resto'), healFiller: 'healingWave' } }));
    expect(row(wave, 'healingWave')!.casts).toBeGreaterThan(20);
  });

  it('poids de stats', () => {
    const ele = statWeightsAny(buildConfig(shaman('elemental', { iterations: 200 }))).weights;
    expect(ele.find((w) => w.key === 'spellPower')!.ep).toBe(1);
    expect(ele.find((w) => w.key === 'critPct')!.dpsGain).toBeGreaterThan(0);
    const enh = statWeightsAny(buildConfig(shaman('enhancement', { iterations: 200 }))).weights;
    expect(enh.find((w) => w.key === 'attackPower')!.ep).toBe(1);
    expect(enh.find((w) => w.key === 'intellect')!.dpsGain).toBeGreaterThan(0);
  });

  it('feuille de personnage et migration', () => {
    expect(characterSheet(shaman('elemental')).entries[0].label).toBe('sumSp');
    expect(characterSheet(shaman('enhancement')).entries[0].label).toBe('sheetAp');
    expect(characterSheet(shaman('resto')).entries[0].label).toBe('sheetHealing');
    const m = migrate({ classId: 'shaman', talents: SHAMAN_DEFAULT_TALENTS.resto } as Partial<AppState>, 'shaman');
    expect(m.spec).toBe('resto');
  });
});
