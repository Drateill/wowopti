import type { DruidRules, DruidSpec } from '../data/druid/data';
import { deriveDruid } from '../engine/druidSim';
import { deriveMage } from '../engine/mageSim';
import type { MageRules } from '../data/mage/data';
import type { PriestRules } from '../data/priest/data';
import { derivePriest } from '../engine/priestSim';
import type { HunterRules } from '../data/hunter/data';
import { deriveHunter } from '../engine/hunterSim';
import type { PaladinRules } from '../data/paladin/data';
import type { GameRules } from '../data/types';
import { derivePaladin } from '../engine/paladinSim';
import { deriveStats } from '../engine/stats';
import { effectivePet } from '../engine/warlockSim';
import { computeGear, type AppState } from './store';

// Feuille de personnage de chaque classe : tuiles de l'onglet Personnage et résumé de l'en-tête.

export interface SheetEntry {
  /** Clé de traduction du libellé (long) et du libellé court de l'en-tête. */
  label: string;
  short?: string;
  value: number;
  digits: number;
  pct?: boolean;
  /** Ligne d'aide sous la valeur : clé de traduction et variables, ou texte déjà prêt. */
  sub?: { key: string; vars?: Record<string, number> } | { text: string };
  tone?: 'warn' | 'good';
}

export interface CharacterSheet {
  entries: SheetEntry[];
  /** Plus de toucher ne sert à rien (poids de stats). */
  hitCapped: boolean;
}

export function characterSheet(state: AppState): CharacterSheet {
  const g = computeGear(state);
  if (state.classId === 'druid') return druidSheet(state, g);
  if (state.classId === 'hunter') {
    const d = deriveHunter(state.rules as unknown as HunterRules, g.stats, state.talents, g.mods, state.hun);
    const surv = state.spec === 'surv';
    return {
      hitCapped: d.hitToCap === 0,
      entries: [
        surv
          ? { label: 'sheetAp', short: 'sumAp', value: d.meleeAp, digits: 0 }
          : { label: 'sheetRangedAp', short: 'sumAp', value: d.rangedAp, digits: 0, sub: { key: 'sheetHunterBuffsIn' } },
        { label: 'sheetMeleeCrit', short: 'sumCrit', value: d.critPct, digits: 2, pct: true },
        {
          label: 'sheetHit', short: 'sumHit', value: d.hitPct, digits: 1, pct: true,
          sub: d.hitToCap > 0 ? { key: 'hitLeft', vars: { n: d.hitToCap } } : { key: 'capReached' },
          tone: d.hitToCap > 0 ? 'warn' : 'good',
        },
        { label: 'sheetAgility', value: d.agility, digits: 0 },
        { label: 'sheetIntellect', value: d.intellect, digits: 0 },
        { label: 'maxMana', short: 'sumMana', value: d.maxMana, digits: 0 },
      ],
    };
  }
  if (state.classId === 'priest') {
    const d = derivePriest(state.rules as unknown as PriestRules, g.stats, state.talents, g.mods);
    if (state.spec === 'shadow') {
      return {
        hitCapped: d.shadowHitToCap === 0,
        entries: [
          { label: 'sumSp', short: 'sumSp', value: d.shadowPower, digits: 0 },
          { label: 'sheetSpellCrit', short: 'sumCrit', value: d.spellCritPct, digits: 2, pct: true },
          {
            label: 'sheetHit', short: 'sumHit', value: d.shadowHitPct, digits: 1, pct: true,
            sub: d.shadowHitToCap > 0 ? { key: 'hitLeft', vars: { n: d.shadowHitToCap } } : { key: 'capReached' },
            tone: d.shadowHitToCap > 0 ? 'warn' : 'good',
          },
          { label: 'sheetIntellect', value: d.intellect, digits: 0 },
          { label: 'sheetSpirit', value: d.spirit, digits: 0 },
          { label: 'maxMana', short: 'sumMana', value: d.maxMana, digits: 0 },
        ],
      };
    }
    return {
      hitCapped: false,
      entries: [
        { label: 'sheetHealing', short: 'sumHeal', value: d.healingPower, digits: 0 },
        { label: 'sheetSpellCrit', short: 'sumCrit', value: d.spellCritPct, digits: 2, pct: true },
        { label: 'sheetIntellect', value: d.intellect, digits: 0 },
        { label: 'sheetSpirit', value: d.spirit, digits: 0 },
        { label: 'maxMana', short: 'sumMana', value: d.maxMana, digits: 0 },
        { label: 'sheetMp5', short: 'sumMp5', value: d.mp5, digits: 0 },
        { label: 'sheetRegen', value: d.spiritRegen * 5, digits: 0 },
      ],
    };
  }
  if (state.classId === 'mage') {
    const d = deriveMage(state.rules as unknown as MageRules, g.stats, state.talents, g.mods);
    return {
      hitCapped: d.hitToCap === 0,
      entries: [
        { label: 'sumSp', short: 'sumSp', value: d.spellPower, digits: 0, sub: state.spec === 'fire' ? { key: 'sheetFire', vars: { n: d.firePower } } : undefined },
        { label: 'sheetSpellCrit', short: 'sumCrit', value: d.spellCritPct, digits: 2, pct: true },
        {
          label: 'sheetHit', short: 'sumHit', value: d.hitPct, digits: 1, pct: true,
          sub: d.hitToCap > 0 ? { key: 'hitLeft', vars: { n: d.hitToCap } } : { key: 'capReached' },
          tone: d.hitToCap > 0 ? 'warn' : 'good',
        },
        { label: 'sheetIntellect', value: d.intellect, digits: 0 },
        { label: 'maxMana', short: 'sumMana', value: d.maxMana, digits: 0 },
        { label: 'sheetRegen', value: d.spiritRegen * 5, digits: 0 },
      ],
    };
  }
  if (state.classId === 'paladin') {
    const d = derivePaladin(state.rules as unknown as PaladinRules, g.stats, state.talents, g.mods);
    const rules = state.rules as unknown as PaladinRules;
    const hit: SheetEntry = {
      label: 'sheetHit',
      short: 'sumHit',
      value: d.hitPct,
      digits: 1,
      pct: true,
      sub: d.meleeHitToCap > 0 ? { key: 'hitLeft', vars: { n: d.meleeHitToCap } } : { key: 'capReached' },
      tone: d.meleeHitToCap > 0 ? 'warn' : 'good',
    };
    if (state.spec === 'holy') {
      return {
        hitCapped: false,
        entries: [
          { label: 'sheetHealing', short: 'sumHeal', value: d.healingPower, digits: 0 },
          { label: 'sheetSpellCrit', short: 'sumCrit', value: d.spellCritPct, digits: 2, pct: true },
          { label: 'sheetIntellect', value: d.intellect, digits: 0 },
          { label: 'maxMana', short: 'sumMana', value: d.maxMana, digits: 0 },
          { label: 'sheetMp5', short: 'sumMp5', value: d.mp5, digits: 0 },
          { label: 'sheetRegen', value: d.spiritRegen * 5, digits: 0 },
        ],
      };
    }
    if (state.spec === 'prot') {
      const avoid = d.bossMissPct + d.dodgePct + d.parryPct;
      return {
        hitCapped: d.meleeHitToCap === 0,
        entries: [
          { label: 'sheetDefense', short: 'sumDefense', value: d.defense, digits: 0, sub: { key: 'sheetCritImmune', vars: { n: Math.max(0, Math.ceil(rules.bossDefenseSkill + 5 / 0.04 - d.defense)) } } },
          { label: 'sheetAvoidance', short: 'sumAvoid', value: avoid, digits: 1, pct: true },
          { label: 'sheetBlock', value: d.blockPct, digits: 1, pct: true, sub: { key: 'sheetBlockValue', vars: { n: Math.round(d.blockValue) } } },
          { label: 'sheetBossCrit', value: d.bossCritPct, digits: 2, pct: true, tone: d.bossCritPct > 0 ? 'warn' : 'good' },
          { label: 'sheetArmor', value: d.armor, digits: 0, sub: { key: 'sheetArmorReduction', vars: { n: d.damageTakenReduction * 100 } } },
          { label: 'sheetHealth', short: 'sumHealth', value: d.maxHealth, digits: 0 },
          { label: 'sheetAp', value: d.attackPower, digits: 0 },
          hit,
        ],
      };
    }
    return {
      hitCapped: d.meleeHitToCap === 0,
      entries: [
        { label: 'sheetAp', short: 'sumAp', value: d.attackPower, digits: 0 },
        { label: 'sheetMeleeCrit', short: 'sumCrit', value: d.meleeCritPct, digits: 2, pct: true },
        { ...hit },
        { label: 'sheetHolyPower', value: d.spellPower, digits: 0 },
        { label: 'sheetStrength', value: d.strength, digits: 0 },
        { label: 'sheetAgility', value: d.agility, digits: 0 },
        { label: 'maxMana', short: 'sumMana', value: d.maxMana, digits: 0 },
      ],
    };
  }

  const rules = state.rules as unknown as GameRules;
  const d = deriveStats(rules, g.stats, state.talents, effectivePet(state.buffs, state.talents), g.mods);
  return {
    hitCapped: d.hitToCap === 0,
    entries: [
      { label: 'sumSp', short: 'sumSp', value: d.spellPower, digits: 0, sub: { key: 'sheetSchools', vars: { s: d.shadowPower, f: d.firePower } } },
      { label: 'critWithInt', short: 'sumCrit', value: d.critPct, digits: 2, pct: true },
      {
        label: 'hitWithTalents',
        short: 'sumHit',
        value: d.hitPct,
        digits: 1,
        pct: true,
        sub: d.hitToCap > 0 ? { key: 'hitLeft', vars: { n: d.hitToCap } } : { key: 'capReached' },
        tone: d.hitToCap > 0 ? 'warn' : 'good',
      },
      { label: 'chanceToHit', value: d.chanceToHitPct, digits: 1, pct: true },
      { label: 'sheetIntellect', value: d.intellect, digits: 0 },
      { label: 'maxMana', short: 'sumMana', value: d.maxMana, digits: 0 },
    ],
  };
}

function druidSheet(state: AppState, g: ReturnType<typeof computeGear>): CharacterSheet {
  const spec = state.spec as DruidSpec;
  const d = deriveDruid(state.rules as unknown as DruidRules, g.stats, state.talents, spec, g.mods, state.dru.moonkin);
  if (spec === 'balance') {
    return {
      hitCapped: d.spellHitToCap === 0,
      entries: [
        { label: 'sumSp', short: 'sumSp', value: d.spellPower, digits: 0 },
        { label: 'sheetSpellCrit', short: 'sumCrit', value: d.spellCritPct, digits: 2, pct: true },
        {
          label: 'sheetHit',
          short: 'sumHit',
          value: d.hitPct,
          digits: 1,
          pct: true,
          sub: d.spellHitToCap > 0 ? { key: 'hitLeft', vars: { n: d.spellHitToCap } } : { key: 'capReached' },
          tone: d.spellHitToCap > 0 ? 'warn' : 'good',
        },
        { label: 'sheetIntellect', value: d.intellect, digits: 0 },
        { label: 'maxMana', short: 'sumMana', value: d.maxMana, digits: 0 },
        { label: 'sheetRegen', value: d.spiritRegen * 5, digits: 0 },
      ],
    };
  }
  if (spec === 'resto') {
    return {
      hitCapped: false,
      entries: [
        { label: 'sheetHealing', short: 'sumHeal', value: d.healingPower, digits: 0 },
        { label: 'sheetSpellCrit', short: 'sumCrit', value: d.spellCritPct, digits: 2, pct: true },
        { label: 'sheetIntellect', value: d.intellect, digits: 0 },
        { label: 'sheetSpirit', value: d.spirit, digits: 0 },
        { label: 'maxMana', short: 'sumMana', value: d.maxMana, digits: 0 },
        { label: 'sheetMp5', short: 'sumMp5', value: d.mp5, digits: 0 },
        { label: 'sheetRegen', value: d.spiritRegen * 5, digits: 0 },
      ],
    };
  }
  const hit: SheetEntry = {
    label: 'sheetHit',
    short: 'sumHit',
    value: d.hitPct,
    digits: 1,
    pct: true,
    sub: d.meleeHitToCap > 0 ? { key: 'hitLeft', vars: { n: d.meleeHitToCap } } : { key: 'capReached' },
    tone: d.meleeHitToCap > 0 ? 'warn' : 'good',
  };
  if (spec === 'bear') {
    return {
      hitCapped: d.meleeHitToCap === 0,
      entries: [
        { label: 'sheetArmor', short: 'sumArmor', value: d.armor, digits: 0, sub: { key: 'sheetArmorReduction', vars: { n: d.damageTakenReduction * 100 } } },
        { label: 'sheetAvoidance', short: 'sumAvoid', value: d.bossMissPct + d.dodgePct, digits: 1, pct: true },
        { label: 'sheetBossCrit', value: d.bossCritPct, digits: 2, pct: true, tone: d.bossCritPct > 0 ? 'warn' : 'good' },
        { label: 'sheetHealth', short: 'sumHealth', value: d.maxHealth, digits: 0 },
        { label: 'sheetDefense', value: d.defense, digits: 0 },
        { label: 'sheetAp', value: d.attackPower, digits: 0 },
        hit,
      ],
    };
  }
  return {
    hitCapped: d.meleeHitToCap === 0,
    entries: [
      { label: 'sheetAp', short: 'sumAp', value: d.attackPower, digits: 0 },
      { label: 'sheetMeleeCrit', short: 'sumCrit', value: d.meleeCritPct, digits: 2, pct: true },
      hit,
      { label: 'sheetAgility', value: d.agility, digits: 0 },
      { label: 'sheetStrength', value: d.strength, digits: 0 },
    ],
  };
}
