import { describe, expect, it } from 'vitest';
import { BUFF_BY_ID, buffVisible } from '../data/buffs';
import { PRIEST } from '../data/classes';
import { PRIEST_DATA, PRIEST_DEFAULT_TALENTS } from '../data/priest/data';
import { emptyStats } from '../data/types';
import { characterSheet } from '../state/classLogic';
import { buildConfig, defaultState, migrate, priestPreset, type AppState } from '../state/store';
import { priestTalents, type PriestSimConfig } from './priestSim';
import { simulateAny, statWeightsAny } from './sim';
import { isValid, totalPoints } from './talents';

function priest(spec: 'disc' | 'holy' | 'shadow', patch: Partial<AppState> = {}): AppState {
  return {
    ...defaultState('priest'), spec, talents: PRIEST_DEFAULT_TALENTS[spec], pri: priestPreset(spec), iterations: 300,
    extraStats: { ...emptyStats(), intellect: 200, spirit: 150, stamina: 150, critPct: 3, hitPct: 6, spellPower: 300, healingPower: 400, mp5: 15 },
    ...patch,
  };
}
const run = (s: AppState) => simulateAny(buildConfig(s) as PriestSimConfig);
const row = (r: ReturnType<typeof run>, id: string) => r.breakdown.find((b) => b.id === id);

describe('prêtre : données', () => {
  it('les builds types sont valides et font 51 points', () => {
    expect(PRIEST_DATA.trees.map((t) => t.key)).toEqual(['discipline', 'holy', 'shadow']);
    for (const spec of PRIEST.specs) {
      expect(totalPoints(spec.defaultTalents)).toBe(51);
      expect(isValid(spec.defaultTalents, PRIEST.talents)).toBe(true);
    }
  });

  it('lit les talents Forever', () => {
    const fx = priestTalents({ ...PRIEST_DEFAULT_TALENTS.disc, ...PRIEST_DEFAULT_TALENTS.holy, ...PRIEST_DEFAULT_TALENTS.shadow });
    expect(fx.meditationPct).toBe(50);
    expect(fx.divineAegisPct).toBe(15);
    expect(fx.renewedHopeCritPct).toBe(10);
    expect(fx.renewedHopeSec).toBe(5);
    expect(fx.soulWardingSec).toBe(4);
    expect(fx.divineFurySec).toBe(0.5);
    expect(fx.spiritualGuidanceHealPct).toBe(25);
    expect(fx.shadowWeavingPct).toBe(2);
    expect(fx.shadowWeavingStacks).toBe(5);
    expect(fx.improvedMindFlayPct).toBe(20);
    expect(fx.improvedSwpSec).toBe(6);
    expect(fx.darknessPct).toBe(10);
  });

  it('les consommables et enchantements suivent la spécialisation', () => {
    expect(buffVisible(BUFF_BY_ID.get('shadowPower')!, 'priest', 'shadow')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('shadowPower')!, 'priest', 'holy')).toBe(false);
    expect(buffVisible(BUFF_BY_ID.get('flaskSupreme')!, 'priest', 'disc')).toBe(false);
    expect(buffVisible(BUFF_BY_ID.get('flaskWisdom')!, 'priest', 'holy')).toBe(true);
  });
});

describe('prêtre : simulation', () => {
  it('Ombre : Douleur entretenue, Attaque mentale, Fouet mental', () => {
    const r = run(priest('shadow'));
    expect(r.dps).toBeGreaterThan(150);
    const swp = row(r, 'shadowWordPain')!;
    expect(swp.ticks / swp.casts).toBeGreaterThan(6); // Douleur améliorée : 8 tics
    expect(row(r, 'mindBlast')!.casts).toBeGreaterThan(20);
    expect(row(r, 'mindFlay')!.ticks).toBeGreaterThan(50);
    expect(row(r, 'devouringPlague')!.casts).toBeGreaterThan(5);
  });

  it('Ombre : la Forme d’Ombre et le Tissage augmentent les dégâts', () => {
    const base = run(priest('shadow')).dps;
    const noForm = run(priest('shadow', { talents: { ...PRIEST_DEFAULT_TALENTS.shadow, shadowform: 0 } })).dps;
    const noWeave = run(priest('shadow', { talents: { ...PRIEST_DEFAULT_TALENTS.shadow, shadowWeaving: 0, darkInspiration: 6, shadowform: 1 } })).dps;
    expect(base).toBeGreaterThan(noForm * 1.1);
    expect(base).toBeGreaterThan(noWeave);
  });

  it('Discipline : boucliers, Pénitence et Égide divine', () => {
    const r = run(priest('disc'));
    expect(r.dps).toBeGreaterThan(200);
    expect(row(r, 'powerWordShield')!.casts).toBeGreaterThan(15);
    expect(row(r, 'penance')!.hits).toBeGreaterThan(20);
    expect(row(r, 'divineAegis')!.damage).toBeGreaterThan(0);
  });

  it('Sacré : Prière de guérison, Rénovation, soin de remplissage', () => {
    const r = run(priest('holy'));
    expect(r.dps).toBeGreaterThan(200);
    const pom = row(r, 'prayerOfMending')!;
    expect(pom.hits).toBeGreaterThan(pom.casts * 4);
    expect(row(r, 'renew')!.ticks).toBeGreaterThan(20);
    expect(row(r, 'greaterHeal')!.casts).toBeGreaterThan(4);
  });

  it('Sacré : plus d’excès de soins, moins de soins utiles', () => {
    const low = run(priest('holy', { pri: { ...priestPreset('holy'), overhealPct: 0 } })).dps;
    const high = run(priest('holy', { pri: { ...priestPreset('holy'), overhealPct: 50 } })).dps;
    expect(high).toBeLessThan(low * 0.6);
  });

  it('poids de stats : la puissance de soin compte pour les soigneurs, le toucher pour l’Ombre', () => {
    const heal = statWeightsAny(buildConfig(priest('holy', { iterations: 200 })));
    expect(heal.weights.find((w) => w.key === 'healingPower')!.ep).toBe(1);
    expect(heal.weights.find((w) => w.key === 'spellPower')!.ep).toBeGreaterThan(0.8);
    const shadow = statWeightsAny(buildConfig(priest('shadow', { iterations: 200, extraStats: { ...priest('shadow').extraStats, hitPct: 0 } })));
    expect(shadow.weights.find((w) => w.key === 'hitPct')!.dpsGain).toBeGreaterThan(0);
  });

  it('feuille de personnage et migration', () => {
    const sheet = characterSheet(priest('shadow'));
    expect(sheet.entries[0].value).toBeGreaterThanOrEqual(300);
    const heal = characterSheet(priest('holy'));
    expect(heal.entries[0].label).toBe('sheetHealing');
    const m = migrate({ classId: 'priest', talents: PRIEST_DEFAULT_TALENTS.holy } as Partial<AppState>, 'priest');
    expect(m.spec).toBe('holy');
    expect(m.pri.renewTargets).toBeGreaterThan(0);
  });
});
