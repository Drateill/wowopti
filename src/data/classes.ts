import { DEFAULT_DRUID_OPTIONS, DRUID_DATA, DRUID_DEFAULT_TALENTS, DRUID_RULE_FIELDS, DRUID_RULES, DRUID_SPELLS } from './druid/data';
import { DEFAULT_MAGE_OPTIONS, MAGE_DATA, MAGE_DEFAULT_TALENTS, MAGE_RULE_FIELDS, MAGE_RULES, MAGE_SPELLS } from './mage/data';
import { DEFAULT_PRIEST_OPTIONS, PRIEST_DATA, PRIEST_DEFAULT_TALENTS, PRIEST_RULE_FIELDS, PRIEST_RULES, PRIEST_SPELLS } from './priest/data';
import { DEFAULT_PALADIN_OPTIONS, PALADIN_DATA, PALADIN_DEFAULT_TALENTS, PALADIN_RULE_FIELDS, PALADIN_RULES, PALADIN_SPELLS } from './paladin/data';
import type { TalentData } from './talentData';
import { emptyStats, type Localized, type SpellDef, type Stats } from './types';
import { DEFAULT_RULES, WARLOCK_SPELLS } from './warlock/spells';
import { WARLOCK_DATA } from './warlock/talents';

export type ClassId = 'warlock' | 'paladin' | 'druid' | 'mage' | 'priest';
export type Metric = 'dps' | 'hps' | 'tps';

export interface SpecDef {
  id: string;
  name: Localized;
  icon: string;
  metric: Metric;
  defaultTalents: Record<string, number>;
  /** Arbre de talents principal de la spécialisation (pour la reconnaître à l'import). */
  tree?: number;
}

/** Tout ce qu'une classe fournit à l'app. Le moteur de simulation est choisi par `id`. */
export interface ClassModule {
  id: ClassId;
  blizzardClassId: number;
  name: Localized;
  icon: string;
  color: string;
  data: TalentData;
  /** Raccourcis vers `data`, pour les composants. */
  trees: TalentData['trees'];
  talents: TalentData['talents'];
  spells: SpellDef[];
  defaultRules: Record<string, number | boolean>;
  ruleFields: [string, number][];
  ruleBooleans: string[];
  specs: SpecDef[];
  /** Stats affichées dans les éditeurs (objets personnalisés, bonus divers). */
  statKeys: (keyof Stats)[];
  defaultExtraStats: Stats;
}

/** Builds de départ du démoniste (valides dans les arbres Forever, 51 points). */
export const WARLOCK_DEFAULT_TALENTS: Record<'affliction' | 'demonology' | 'destruction', Record<string, number>> = {
  // 38/0/13 : DoT, Siphon d'âme et Calvaire.
  affliction: {
    improvedLifeTap: 2, suppression: 5, improvedCorruption: 5, improvedDrains: 3, improvedBaneOfAgony: 2, pandemic: 3,
    amplifyCurse: 1, malevolence: 5, nightfall: 2, siphonLife: 1, soulSiphon: 3, shadowMastery: 5, wrack: 1,
    improvedShadowBolt: 5, bane: 5, cataclysm: 3,
  },
  // 0/31/20 : Sacrifice du diablotin gardé grâce au Pacte démoniaque, succube active (Maître démonologue).
  demonology: {
    improvedImp: 3, unholyPower: 5, demonicEmbrace: 2, felVitality: 3, demonicSacrifice: 1, masterSummoner: 2,
    decimation: 2, felDomination: 1, demonicBrand: 1, soulLink: 1, demonicKnowledge: 3, improvedFelhunter: 1,
    masterDemonologist: 5, demonicPact: 1,
    improvedShadowBolt: 5, bane: 5, cataclysm: 3, aftermath: 2, ruin: 5,
  },
  // 11/0/40 : Immolation, Conflagration, Ombre et flamme, Incinérer.
  destruction: {
    suppression: 5, improvedCorruption: 5, improvedLifeTap: 1,
    improvedShadowBolt: 5, bane: 5, cataclysm: 3, aftermath: 5, ruin: 5, agonizingFlames: 3, conflagrate: 1, intensity: 3,
    fireAndBrimstone: 3, baneOfHavoc: 1, shadowAndFlame: 5, incinerate: 1,
  },
};

export const WARLOCK: ClassModule = {
  id: 'warlock',
  blizzardClassId: 9,
  name: { fr: 'Démoniste', en: 'Warlock' },
  icon: 'classicon_warlock',
  color: '#9b6cf0',
  data: WARLOCK_DATA,
  trees: WARLOCK_DATA.trees,
  talents: WARLOCK_DATA.talents,
  spells: WARLOCK_SPELLS,
  defaultRules: DEFAULT_RULES as unknown as Record<string, number | boolean>,
  ruleFields: [
    ['level', 1], ['targetMissPct', 0.5], ['minMissPct', 0.5], ['critMultiplier', 0.05], ['baseCritPct', 0.1],
    ['intPerCritPct', 0.1], ['manaPerInt', 1], ['baseMana', 1], ['baseIntellect', 1], ['baseSpirit', 1], ['gcd', 0.1], ['latency', 0.01],
  ],
  ruleBooleans: ['dotsCanCrit'],
  specs: [
    { tree: 0, id: 'affliction', name: { fr: 'Affliction', en: 'Affliction' }, icon: 'spell_shadow_deathcoil', metric: 'dps', defaultTalents: WARLOCK_DEFAULT_TALENTS.affliction },
    { tree: 1, id: 'demonology', name: { fr: 'Démonologie', en: 'Demonology' }, icon: 'spell_shadow_metamorphosis', metric: 'dps', defaultTalents: WARLOCK_DEFAULT_TALENTS.demonology },
    { tree: 2, id: 'destruction', name: { fr: 'Destruction', en: 'Destruction' }, icon: 'spell_shadow_rainoffire', metric: 'dps', defaultTalents: WARLOCK_DEFAULT_TALENTS.destruction },
  ],
  statKeys: ['spellPower', 'shadowPower', 'firePower', 'critPct', 'hitPct', 'intellect', 'spirit', 'stamina', 'mp5'],
  // Ordre de grandeur d'un personnage niveau 60 en début de raid (stats Forever, réduites par rapport à Classic).
  defaultExtraStats: { ...emptyStats(), spellPower: 120, critPct: 3, hitPct: 4, intellect: 90, spirit: 40, stamina: 120 },
};

export const PALADIN: ClassModule = {
  id: 'paladin',
  blizzardClassId: 2,
  name: { fr: 'Paladin', en: 'Paladin' },
  icon: 'classicon_paladin',
  color: '#f58cba',
  data: PALADIN_DATA,
  trees: PALADIN_DATA.trees,
  talents: PALADIN_DATA.talents,
  spells: PALADIN_SPELLS,
  defaultRules: PALADIN_RULES,
  ruleFields: PALADIN_RULE_FIELDS,
  ruleBooleans: [],
  specs: [
    { tree: 2, id: 'ret', name: { fr: 'Vindicte', en: 'Retribution' }, icon: 'spell_holy_auraoflight', metric: 'dps', defaultTalents: PALADIN_DEFAULT_TALENTS.ret },
    { tree: 0, id: 'holy', name: { fr: 'Sacré', en: 'Holy' }, icon: 'spell_holy_holybolt', metric: 'hps', defaultTalents: PALADIN_DEFAULT_TALENTS.holy },
    { tree: 1, id: 'prot', name: { fr: 'Protection', en: 'Protection' }, icon: 'spell_holy_devotionaura', metric: 'tps', defaultTalents: PALADIN_DEFAULT_TALENTS.prot },
  ],
  statKeys: [
    'strength', 'agility', 'attackPower', 'critPct', 'hitPct', 'spellPower', 'healingPower', 'intellect', 'spirit', 'stamina',
    'mp5', 'defense', 'blockPct', 'blockValue', 'dodgePct', 'parryPct', 'armor',
  ],
  // Personnage niveau 60 sans objets saisis : un peu de tout, à remplacer par le vrai équipement.
  defaultExtraStats: { ...emptyStats(), strength: 120, agility: 50, stamina: 150, intellect: 80, spirit: 40, critPct: 2, hitPct: 3, armor: 3000 },
};

export const DRUID: ClassModule = {
  id: 'druid',
  blizzardClassId: 11,
  name: { fr: 'Druide', en: 'Druid' },
  icon: 'classicon_druid',
  color: '#ff7d0a',
  data: DRUID_DATA,
  trees: DRUID_DATA.trees,
  talents: DRUID_DATA.talents,
  spells: DRUID_SPELLS,
  defaultRules: DRUID_RULES,
  ruleFields: DRUID_RULE_FIELDS,
  ruleBooleans: [],
  specs: [
    { tree: 0, id: 'balance', name: { fr: 'Équilibre', en: 'Balance' }, icon: 'spell_nature_starfall', metric: 'dps', defaultTalents: DRUID_DEFAULT_TALENTS.balance },
    { tree: 1, id: 'cat', name: { fr: 'Chat', en: 'Cat' }, icon: 'ability_druid_catform', metric: 'dps', defaultTalents: DRUID_DEFAULT_TALENTS.cat },
    { tree: 1, id: 'bear', name: { fr: 'Ours', en: 'Bear' }, icon: 'ability_racial_bearform', metric: 'tps', defaultTalents: DRUID_DEFAULT_TALENTS.bear },
    { tree: 2, id: 'resto', name: { fr: 'Restauration', en: 'Restoration' }, icon: 'spell_nature_healingtouch', metric: 'hps', defaultTalents: DRUID_DEFAULT_TALENTS.resto },
  ],
  statKeys: [
    'spellPower', 'healingPower', 'critPct', 'hitPct', 'intellect', 'spirit', 'mp5', 'strength', 'agility', 'attackPower',
    'stamina', 'defense', 'dodgePct', 'armor',
  ],
  defaultExtraStats: { ...emptyStats(), intellect: 120, spirit: 80, stamina: 120, spellPower: 100, critPct: 2, hitPct: 2 },
};

export const MAGE: ClassModule = {
  id: 'mage',
  blizzardClassId: 8,
  name: { fr: 'Mage', en: 'Mage' },
  icon: 'classicon_mage',
  color: '#69ccf0',
  data: MAGE_DATA,
  trees: MAGE_DATA.trees,
  talents: MAGE_DATA.talents,
  spells: MAGE_SPELLS,
  defaultRules: MAGE_RULES,
  ruleFields: MAGE_RULE_FIELDS,
  ruleBooleans: [],
  specs: [
    { tree: 0, id: 'arcane', name: { fr: 'Arcanes', en: 'Arcane' }, icon: 'spell_holy_magicalsentry', metric: 'dps', defaultTalents: MAGE_DEFAULT_TALENTS.arcane },
    { tree: 1, id: 'fire', name: { fr: 'Feu', en: 'Fire' }, icon: 'spell_fire_firebolt02', metric: 'dps', defaultTalents: MAGE_DEFAULT_TALENTS.fire },
    { tree: 2, id: 'frost', name: { fr: 'Givre', en: 'Frost' }, icon: 'spell_frost_frostbolt02', metric: 'dps', defaultTalents: MAGE_DEFAULT_TALENTS.frost },
  ],
  statKeys: ['spellPower', 'firePower', 'critPct', 'hitPct', 'intellect', 'spirit', 'stamina', 'mp5'],
  defaultExtraStats: { ...emptyStats(), spellPower: 120, critPct: 3, hitPct: 4, intellect: 110, spirit: 40, stamina: 100 },
};

export const PRIEST: ClassModule = {
  id: 'priest',
  blizzardClassId: 5,
  name: { fr: 'Prêtre', en: 'Priest' },
  icon: 'classicon_priest',
  color: '#e8e8e8',
  data: PRIEST_DATA,
  trees: PRIEST_DATA.trees,
  talents: PRIEST_DATA.talents,
  spells: PRIEST_SPELLS,
  defaultRules: PRIEST_RULES,
  ruleFields: PRIEST_RULE_FIELDS,
  ruleBooleans: [],
  specs: [
    { tree: 0, id: 'disc', name: { fr: 'Discipline', en: 'Discipline' }, icon: 'spell_holy_powerwordshield', metric: 'hps', defaultTalents: PRIEST_DEFAULT_TALENTS.disc },
    { tree: 1, id: 'holy', name: { fr: 'Sacré', en: 'Holy' }, icon: 'spell_holy_guardianspirit', metric: 'hps', defaultTalents: PRIEST_DEFAULT_TALENTS.holy },
    { tree: 2, id: 'shadow', name: { fr: 'Ombre', en: 'Shadow' }, icon: 'spell_shadow_shadowwordpain', metric: 'dps', defaultTalents: PRIEST_DEFAULT_TALENTS.shadow },
  ],
  statKeys: ['spellPower', 'shadowPower', 'healingPower', 'critPct', 'hitPct', 'intellect', 'spirit', 'stamina', 'mp5'],
  defaultExtraStats: { ...emptyStats(), spellPower: 100, healingPower: 150, critPct: 2, hitPct: 2, intellect: 110, spirit: 90, stamina: 100, mp5: 5 },
};

export const CLASSES: ClassModule[] = [WARLOCK, PALADIN, DRUID, MAGE, PRIEST];
export const CLASS_BY_ID: Record<ClassId, ClassModule> = { warlock: WARLOCK, paladin: PALADIN, druid: DRUID, mage: MAGE, priest: PRIEST };
export const CLASS_BY_BLIZZARD_ID = new Map(CLASSES.map((c) => [c.blizzardClassId, c]));

export { DEFAULT_DRUID_OPTIONS, DEFAULT_MAGE_OPTIONS, DEFAULT_PALADIN_OPTIONS, DEFAULT_PRIEST_OPTIONS };
