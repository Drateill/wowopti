import { describe, expect, it } from 'vitest';
import { BUFF_BY_ID, buffVisible } from '../data/buffs';
import { DRUID } from '../data/classes';
import { DRUID_DATA, DRUID_DEFAULT_TALENTS, DRUID_RULES } from '../data/druid/data';
import { emptyStats } from '../data/types';
import { characterSheet } from '../state/classLogic';
import { buildConfig, defaultState, druidPreset, type AppState, type Item } from '../state/store';
import { deriveDruid, druidTalents, type DruidSimConfig } from './druidSim';
import { simulateAny, statWeightsAny } from './sim';
import { isValid, totalPoints } from './talents';

const staff: Item = {
  id: 'wh-9', wowheadId: 9, name: { en: 'Staff', fr: 'Bâton' }, slot: 'mainHand',
  stats: { ...emptyStats(), weaponDps: 59 }, weapon: { min: 150, max: 230, speed: 3.2, twoHand: true },
};

function druid(spec: 'balance' | 'cat' | 'bear' | 'resto', patch: Partial<AppState> = {}): AppState {
  const feral = spec === 'cat' || spec === 'bear';
  return {
    ...defaultState('druid'), spec, talents: DRUID_DEFAULT_TALENTS[spec], dru: druidPreset(spec), items: [staff], equipped: { mainHand: staff.id }, iterations: 300,
    extraStats: feral
      ? { ...emptyStats(), strength: 180, agility: 220, stamina: 250, critPct: 4, hitPct: 6, attackPower: 300, armor: 2500, defense: 20 }
      : { ...emptyStats(), intellect: 220, spirit: 150, stamina: 150, critPct: 3, hitPct: 5, spellPower: 350, healingPower: 400, mp5: 40 },
    ...patch,
  };
}
const run = (s: AppState) => simulateAny(buildConfig(s) as DruidSimConfig);

describe('druide : données', () => {
  it('les quatre builds types sont valides et font 51 points', () => {
    expect(DRUID.specs.map((s) => s.id)).toEqual(['balance', 'cat', 'bear', 'resto']);
    for (const spec of DRUID.specs) {
      expect(totalPoints(spec.defaultTalents)).toBe(51);
      expect(isValid(spec.defaultTalents, DRUID.talents)).toBe(true);
    }
    expect(DRUID_DATA.trees.map((t) => t.key)).toEqual(['balance', 'feral', 'restoration']);
  });

  it('lit les talents Forever', () => {
    const fx = druidTalents({ ...DRUID_DEFAULT_TALENTS.balance, ...DRUID_DEFAULT_TALENTS.cat, ...DRUID_DEFAULT_TALENTS.resto });
    expect(fx.vengeancePct).toBe(100);
    expect(fx.moonglowPct).toBe(25);
    expect(fx.eclipseSec).toBe(0.5);
    expect(fx.predatoryStrikesPct).toBe(150);
    expect(fx.rendAndTearPct).toBe(15);
    expect(fx.naturalInstinctPct).toBe(20);
    expect(fx.reflectionPct).toBe(50);
    expect(fx.improvedRegrowthPct).toBe(50);
  });

  it('les formes changent les stats : PA du félin, armure et vie de l’ours', () => {
    const gear = { ...emptyStats(), agility: 100, armor: 1000 };
    const cat = deriveDruid(DRUID_RULES, gear, {}, 'cat');
    const caster = deriveDruid(DRUID_RULES, gear, {}, 'balance');
    const bear = deriveDruid(DRUID_RULES, gear, {}, 'bear');
    expect(cat.attackPower - caster.attackPower).toBeCloseTo(DRUID_RULES.catApBonus + DRUID_RULES.baseAgility + 100);
    expect(bear.armor).toBeGreaterThan(caster.armor * 3);
    expect(bear.maxHealth - caster.maxHealth).toBeCloseTo(DRUID_RULES.direBearHealth);
  });
});

describe('druide : simulation', () => {
  it('Équilibre : Feu stellaire, DoT et plus de puissance = plus de DPS', () => {
    const r = run(druid('balance'));
    const more = run(druid('balance', { extraStats: { ...druid('balance').extraStats, spellPower: 500 } }));
    expect(r.dps).toBeGreaterThan(150);
    expect(more.dps).toBeGreaterThan(r.dps);
    expect(r.breakdown.find((b) => b.id === 'moonfire')!.ticks).toBeGreaterThan(20);
    const eclipse = run(druid('balance', { dru: { ...druidPreset('balance'), filler: 'eclipse' } }));
    expect(eclipse.breakdown.find((b) => b.id === 'wrath')!.casts).toBeGreaterThan(5);
  });

  it('Restauration : HoT, Floraison et puissance de soin', () => {
    const r = run(druid('resto'));
    const more = run(druid('resto', { extraStats: { ...druid('resto').extraStats, healingPower: 700 } }));
    expect(r.dps).toBeGreaterThan(150);
    expect(more.dps).toBeGreaterThan(r.dps);
    expect(r.breakdown.find((b) => b.id === 'rejuvenation')!.ticks).toBeGreaterThan(20);
    expect(r.breakdown.find((b) => b.id === 'bloom')!.damage).toBeGreaterThan(0);
  });

  it('Chat : saignements et points de combo', () => {
    const r = run(druid('cat'));
    expect(r.dps).toBeGreaterThan(100);
    expect(r.breakdown.find((b) => b.id === 'rip')!.ticks).toBeGreaterThan(20);
    expect(r.breakdown.find((b) => b.id === 'shred')!.casts).toBeGreaterThan(10);
    const claw = run(druid('cat', { dru: { ...druidPreset('cat'), behind: false } }));
    expect(claw.breakdown.find((b) => b.id === 'claw')!.casts).toBeGreaterThan(10);
  });

  it('Ours : menace, encaissement et rage', () => {
    const r = run(druid('bear'));
    expect(r.dps).toBeGreaterThan(r.extras!.damagePerSecond); // menace > dégâts grâce à la forme d’ours
    expect(r.extras!.avoidedPct).toBeGreaterThan(15);
    expect(r.breakdown.find((b) => b.id === 'maul')!.casts).toBeGreaterThan(5);
  });

  it('poids de stats du chat : PA = 1, Agilité vaut plus', () => {
    const { weights } = statWeightsAny({ ...buildConfig(druid('cat')), iterations: 800 });
    expect(weights.find((w) => w.key === 'attackPower')!.ep).toBeCloseTo(1);
    expect(weights.find((w) => w.key === 'agility')!.ep).toBeGreaterThan(1);
  });
});

describe('druide : app', () => {
  it('feuille de personnage selon le rôle', () => {
    expect(characterSheet(druid('bear')).entries[0].label).toBe('sheetArmor');
    expect(characterSheet(druid('resto')).entries[0].label).toBe('sheetHealing');
    expect(characterSheet(druid('cat')).entries[0].label).toBe('sheetAp');
  });

  it('buffs : pas de pierre à aiguiser en forme, pas de Chef de la meute en double', () => {
    expect(buffVisible(BUFF_BY_ID.get('elementalStone')!, 'druid', 'cat')).toBe(false);
    expect(buffVisible(BUFF_BY_ID.get('leaderOfThePack')!, 'druid', 'cat')).toBe(false);
    expect(buffVisible(BUFF_BY_ID.get('mongoose')!, 'druid', 'cat')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('flaskTitans')!, 'druid', 'bear')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('flaskSupreme')!, 'druid', 'balance')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('mageblood')!, 'druid', 'resto')).toBe(true);
  });
});

describe('import : choix de la spécialisation', () => {
  it('passe sur la spé de l’arbre principal du personnage importé', async () => {
    const { applyCharacter } = await import('../state/importCharacter');
    const state = druid('balance');
    const { patch } = applyCharacter(
      state,
      { slug: 'x-y', name: 'X Y', level: 60, className: { en: 'Druid', fr: 'Druide' }, sameClass: true, items: [], talents: DRUID_DEFAULT_TALENTS.cat, unknownTalents: [] },
      'Avant',
    );
    expect(patch.spec).toBe('cat');
    // Déjà en Ours (même arbre farouche) : on reste en Ours.
    const bear = applyCharacter(druid('bear'), { slug: 'x-y', name: 'X Y', level: 60, className: { en: 'Druid', fr: 'Druide' }, sameClass: true, items: [], talents: DRUID_DEFAULT_TALENTS.cat, unknownTalents: [] }, 'Avant');
    expect(bear.patch.spec).toBeUndefined();
  });
});
