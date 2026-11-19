import { describe, expect, it } from 'vitest';
import { parseBlizzardItem } from '../data/blizzard';
import { BUFF_BY_ID, buffVisible } from '../data/buffs';
import { PALADIN } from '../data/classes';
import { PALADIN_DATA, PALADIN_DEFAULT_TALENTS, PALADIN_RULES } from '../data/paladin/data';
import { emptyStats } from '../data/types';
import { parseItemTooltip } from '../data/wowhead';
import { buildConfig, computeGear, defaultState, paladinPreset, type AppState, type Item } from '../state/store';
import { derivePaladin, paladinTalents, simulatePaladin, type PaladinSimConfig } from './paladinSim';
import { simulateAny, statWeightsAny } from './sim';
import { isValid, totalPoints } from './talents';

const twoHander: Item = {
  id: 'wh-1', wowheadId: 1, name: { en: 'Big Hammer', fr: 'Gros marteau' }, slot: 'mainHand',
  stats: { ...emptyStats(), strength: 30, weaponDps: 62.5 }, weapon: { min: 180, max: 270, speed: 3.6, twoHand: true },
};
const shield: Item = { id: 'wh-2', wowheadId: 2, name: { en: 'Shield', fr: 'Bouclier' }, slot: 'offHand', stats: { ...emptyStats(), armor: 2000, blockValue: 50 } };
const sword: Item = {
  id: 'wh-3', wowheadId: 3, name: { en: 'Sword', fr: 'Épée' }, slot: 'mainHand',
  stats: { ...emptyStats(), weaponDps: 48 }, weapon: { min: 90, max: 160, speed: 2.6, twoHand: false },
};

/** Paladin de la spécialisation voulue, avec une arme (et un bouclier en Protection). */
function paladin(spec: 'ret' | 'holy' | 'prot', patch: Partial<AppState> = {}): AppState {
  const base = defaultState('paladin');
  const items = spec === 'prot' ? [sword, shield] : [twoHander];
  const equipped = spec === 'prot' ? { mainHand: sword.id, offHand: shield.id } : { mainHand: twoHander.id };
  return {
    ...base, spec, talents: PALADIN_DEFAULT_TALENTS[spec], pal: paladinPreset(spec), items, equipped, iterations: 300,
    extraStats: { ...emptyStats(), strength: 150, agility: 80, stamina: 200, intellect: 150, spirit: 80, critPct: 3, hitPct: 6, healingPower: 300, mp5: 30, defense: 40, armor: 5000 },
    ...patch,
  };
}
const cfg = (s: AppState) => buildConfig(s) as PaladinSimConfig;

describe('paladin : données et stats', () => {
  it('les builds types sont valides et font 51 points', () => {
    for (const spec of PALADIN.specs) {
      expect(totalPoints(spec.defaultTalents)).toBe(51);
      expect(isValid(spec.defaultTalents, PALADIN.talents)).toBe(true);
    }
  });

  it('lit les talents Forever dans leurs descriptions', () => {
    const fx = paladinTalents({ ...PALADIN_DEFAULT_TALENTS.ret, ...PALADIN_DEFAULT_TALENTS.holy, ...PALADIN_DEFAULT_TALENTS.prot });
    expect(fx.convictionPct).toBe(6);
    expect(fx.twoHandPct).toBe(6);
    expect(fx.vengeancePct).toBe(3);
    expect(fx.championPct).toBe(60);
    expect(fx.sanctifiedChance).toBe(100);
    expect(fx.sanctifiedPct).toBe(60);
    expect(fx.holyPowerPct).toBe(50);
    expect(fx.illuminationChance).toBe(100);
    expect(fx.reckoningBlockPct).toBe(40);
    expect(fx.redoubtBlockPct).toBe(30);
    expect(fx.anticipation).toBe(20);
    expect(PALADIN_DATA.trees.map((t) => t.key)).toEqual(['holy', 'protection', 'retribution']);
  });

  it('calcule les stats dérivées (Force → PA, défense → évitement)', () => {
    const d = derivePaladin(PALADIN_RULES, { ...emptyStats(), strength: 100, defense: 100 }, {});
    expect(d.attackPower).toBeCloseTo(PALADIN_RULES.baseAttackPower + (PALADIN_RULES.baseStrength + 100) * 2);
    const low = derivePaladin(PALADIN_RULES, emptyStats(), {});
    expect(d.dodgePct - low.dodgePct).toBeCloseTo(4); // 100 de défense = +4 %
    expect(d.bossCritPct).toBeCloseTo(Math.max(0, low.bossCritPct - 4));
  });
});

describe('paladin : simulation', () => {
  it('Vindicte : plus de PA = plus de DPS, et le Sceau d’autorité fait des dégâts', () => {
    const r = simulateAny(cfg(paladin('ret')));
    const more = simulateAny(cfg(paladin('ret', { extraStats: { ...paladin('ret').extraStats, attackPower: 300 } })));
    expect(r.dps).toBeGreaterThan(100);
    expect(more.dps).toBeGreaterThan(r.dps);
    expect(r.breakdown.find((b) => b.id === 'sealOfCommandProc')!.damage).toBeGreaterThan(0);
    expect(r.breakdown.find((b) => b.id === 'judgementOfCommand')!.casts).toBeGreaterThan(15);
  });

  it('Vindicte : les débuffs d’armure augmentent les dégâts physiques', () => {
    const base = simulateAny(cfg(paladin('ret')));
    const sunder = simulateAny(cfg(paladin('ret', { consumables: ['sunderArmor', 'faerieFire'] })));
    const melee = (r: typeof base) => r.breakdown.find((b) => b.id === 'melee')!.damage;
    expect(melee(sunder)).toBeGreaterThan(melee(base) * 1.1);
  });

  it('Sacré : plus de puissance de soin = plus de HPS ; les soins en excès comptent en moins', () => {
    const r = simulateAny(cfg(paladin('holy')));
    const more = simulateAny(cfg(paladin('holy', { extraStats: { ...paladin('holy').extraStats, healingPower: 600 } })));
    const overheal = simulateAny(cfg(paladin('holy', { pal: { ...paladinPreset('holy'), overhealPct: 50 } })));
    expect(r.dps).toBeGreaterThan(50);
    expect(more.dps).toBeGreaterThan(r.dps);
    expect(overheal.dps).toBeLessThan(r.dps * 0.7);
    expect(r.extras?.oomAt).toBeGreaterThan(0);
  });

  it('Protection : bouclier, Bouclier sacré et Fureur vertueuse', () => {
    const r = simulateAny(cfg(paladin('prot')));
    expect(r.extras?.blockedPct).toBeGreaterThan(20);
    expect(r.breakdown.find((b) => b.id === 'holyShield')!.damage).toBeGreaterThan(0);
    const noRf = simulateAny(cfg(paladin('prot', { pal: { ...paladinPreset('prot'), righteousFury: false } })));
    expect(r.dps).toBeGreaterThan(noRf.dps * 1.3); // la menace grimpe avec la Fureur vertueuse
    const noShield = simulatePaladin({ ...cfg(paladin('prot')), options: { ...paladinPreset('prot'), shield: false } });
    expect(noShield.extras?.blockedPct).toBe(0);
  });

  it('poids de stats : la stat de référence vaut 1 et le DPS d’arme compte', () => {
    const { weights } = statWeightsAny({ ...cfg(paladin('ret')), iterations: 800 });
    expect(weights.find((w) => w.key === 'attackPower')!.ep).toBeCloseTo(1);
    expect(weights.find((w) => w.key === 'weaponDps')!.ep).toBeGreaterThan(1);
    expect(weights.find((w) => w.key === 'strength')!.ep).toBeGreaterThan(1.5);
  });
});

describe('paladin : objets et buffs', () => {
  it('lit arme, armure et blocage dans une infobulle Wowhead', () => {
    const html =
      '<table width="100%"><tr><td>Two-Hand</td><th>Mace</th></tr></table><table width="100%"><tr><td><span><!--dmg-->65 - 99 Damage</span></td><th>Speed <!--spd-->3.20</th></tr></table>' +
      '<span><!--stat4-->+12 Strength</span><span><!--stat3-->+7 Agility</span>';
    const r = parseItemTooltip(html);
    expect(r.slot).toBe('mainHand');
    expect(r.weapon).toEqual({ min: 65, max: 99, speed: 3.2, twoHand: true });
    expect(r.stats.strength).toBe(12);
    expect(r.stats.agility).toBe(7);
    const sh = parseItemTooltip('<table width="100%"><tr><td>Off Hand</td><th>Shield</th></tr></table><span><!--amr-->2964 Armor</span><br>55 Block<br><span class="q2">+<!--rtg48-->15 Block Value</span>');
    expect(sh.stats.armor).toBe(2964);
    expect(sh.shieldBlock).toBe(55);
    expect(sh.stats.blockValue).toBe(70);
  });

  it('convertit les scores Blizzard (blocage, esquive, défense, soins)', () => {
    const r = parseBlizzardItem({
      id: 1, name: 'x', inventory_type: { type: 'SHIELD' },
      preview_item: {
        stats: [
          { type: { type: 'BLOCK_RATING' }, value: 15 },
          { type: { type: 'DODGE_RATING' }, value: 12 },
          { type: { type: 'DEFENSE_SKILL_RATING' }, value: 8 },
          { type: { type: 'SPELL_HEALING_DONE' }, value: 23 },
          { type: { type: 'SPELL_DAMAGE_DONE' }, value: 8 },
        ],
        armor: { value: 2964 },
      },
    });
    expect(r.stats.blockPct).toBeCloseTo(3);
    expect(r.stats.dodgePct).toBeCloseTo(1);
    expect(r.stats.defense).toBe(8);
    expect(r.stats.spellPower).toBe(8);
    expect(r.stats.healingPower).toBe(15); // 23 de soins dont 8 déjà comptés dans la puissance des sorts
    expect(r.stats.armor).toBe(2964);
  });

  it('repère l’arme et le bouclier portés', () => {
    const g = computeGear(paladin('prot'));
    expect(g.weapon?.speed).toBe(2.6);
    expect(g.shield).toBe(true);
  });

  it('montre les buffs utiles à la spécialisation, et seulement eux comptent', () => {
    expect(buffVisible(BUFF_BY_ID.get('mongoose')!, 'paladin', 'ret')).toBe(true);
    expect(buffVisible(BUFF_BY_ID.get('mongoose')!, 'paladin', 'holy')).toBe(false);
    expect(buffVisible(BUFF_BY_ID.get('shadowPower')!, 'paladin', 'ret')).toBe(false);
    expect(buffVisible(BUFF_BY_ID.get('kings')!, 'paladin', 'holy')).toBe(true);
    // Mangouste cochée en Vindicte puis passage en Sacré : elle ne compte plus.
    const holy = paladin('holy', { consumables: ['mongoose'] });
    expect(computeGear(holy).stats.agility).toBe(holy.extraStats.agility);
  });
});
