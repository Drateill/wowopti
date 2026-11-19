import data from '../generated/druid.json';
import { makeTalentData } from '../talentData';
import type { SpellDef } from '../types';

// Druide Forever : arbres et sorts relevés sur Wowhead (npm run fetch-data).

export const DRUID_SIMULATED = new Set([
  // Équilibre
  'improvedWrath', 'genesis', 'moonglow', 'improvedMoonfire', 'naturesMajesty', 'naturesReach', 'naturesSplendor',
  'insectSwarm', 'vengeance', 'improvedStarfire', 'naturesGrace', 'eclipse', 'moonfury', 'moonkinForm',
  // Combat farouche
  'ferocity', 'furor', 'feralSwiftness', 'feralInstinct', 'thickHide', 'shreddingAttacks', 'savageFury', 'sharpenedClaws',
  'predatoryStrikes', 'lacerate', 'predatoryDiscipline', 'bloodFrenzy', 'leaderOfThePack', 'naturalInstinct', 'rendAndTear',
  'naturalReaction', 'primalBite',
  // Restauration
  'heartOfTheWild', 'naturalist', 'reflection', 'giftOfNature', 'bloom', 'tranquilSpirit', 'improvedRejuvenation',
  'swiftmend', 'naturesSwiftness', 'livingSpirit', 'improvedRegrowth', 'wildGrowth',
]);

const meta = (id: number, icon: string, en: string, fr: string) => ({ id, icon, name: { en, fr }, tooltip: { en: '', fr: '' } });

export const DRUID_DATA = makeTalentData(data, ['#ff7d0a', '#c69b6d', '#7fbf4d'], DRUID_SIMULATED, {
  melee: meta(6603, 'ability_druid_catformattack', 'Melee', 'Mêlée'),
  swiftmend: meta(18562, 'inv_relics_idolofrejuvenation', 'Swiftmend', 'Prompte guérison'),
  naturesSwiftness: meta(17116, 'spell_nature_ravenform', 'Nature’s Swiftness', 'Rapidité de la nature'),
  bloom: meta(1, 'ability_druid_flourish', 'Bloom', 'Floraison'),
  manaPotion: meta(13444, 'inv_potion_76', 'Major Mana Potion', 'Potion de mana majeure'),
});

/**
 * Valeurs au rang maximum (niveau 60) lues dans les infobulles Forever. Coefficients de puissance :
 * hypothèses (Classic quand le sort existait), modifiables dans « Sorts & règles ».
 * Capacités farouches : « directMin/Max » = bonus fixe, « directCoeff » = part des dégâts d'arme.
 */
export const DRUID_SPELLS: SpellDef[] = [
  // Équilibre
  { id: 'wrath', school: 'nature', destruction: false, castTime: 2, manaCost: 120, directMin: 92, directMax: 102, directCoeff: 0.571 },
  { id: 'starfire', school: 'arcane', destruction: false, castTime: 3.5, manaCost: 340, directMin: 510, directMax: 597, directCoeff: 1 },
  { id: 'moonfire', school: 'arcane', destruction: false, castTime: 0, manaCost: 375, directMin: 136, directMax: 157, directCoeff: 0.15, dotTotal: 240, dotDuration: 12, dotTicks: 4, dotCoeff: 0.52 },
  { id: 'insectSwarm', school: 'nature', destruction: false, castTime: 0, manaCost: 160, dotTotal: 186, dotDuration: 12, dotTicks: 6, dotCoeff: 0.6, requiresTalent: 'insectSwarm' },
  // Restauration
  { id: 'healingTouch', school: 'nature', destruction: false, castTime: 3.5, manaCost: 840, directMin: 2175, directMax: 2562, directCoeff: 1 },
  { id: 'regrowth', school: 'nature', destruction: false, castTime: 2, manaCost: 525, directMin: 999, directMax: 1111, directCoeff: 0.3, dotTotal: 994, dotDuration: 21, dotTicks: 7, dotCoeff: 0.7 },
  { id: 'rejuvenation', school: 'nature', destruction: false, castTime: 0, manaCost: 360, dotTotal: 776, dotDuration: 12, dotTicks: 4, dotCoeff: 0.8 },
  { id: 'wildGrowth', school: 'nature', destruction: false, castTime: 3, manaCost: 1050, cooldown: 6, dotTotal: 769, dotDuration: 7, dotTicks: 7, dotCoeff: 0.2, requiresTalent: 'wildGrowth' },
  // Chat
  { id: 'claw', school: 'physical', destruction: false, castTime: 0, manaCost: 45, directMin: 115, directMax: 115, directCoeff: 1.4 },
  { id: 'shred', school: 'physical', destruction: false, castTime: 0, manaCost: 60, directMin: 80, directMax: 80, directCoeff: 2 },
  { id: 'rake', school: 'physical', destruction: false, castTime: 0, manaCost: 40, directMin: 76, directMax: 76, dotTotal: 126, dotDuration: 9, dotTicks: 3 },
  { id: 'rip', school: 'physical', destruction: false, castTime: 0, manaCost: 30, dotTotal: 1071, dotDuration: 12, dotTicks: 6, dotCoeff: 0.24 },
  { id: 'ferociousBite', school: 'physical', destruction: false, castTime: 0, manaCost: 35, directMin: 969, directMax: 1045, directCoeff: 0.15 },
  // Ours
  { id: 'maul', school: 'physical', destruction: false, castTime: 0, manaCost: 15, directMin: 128, directMax: 128, directCoeff: 1 },
  { id: 'swipe', school: 'physical', destruction: false, castTime: 0, manaCost: 20, directMin: 83, directMax: 83 },
  { id: 'lacerate', school: 'physical', destruction: false, castTime: 0, manaCost: 15, dotTotal: 75, dotDuration: 15, dotTicks: 5, dotCoeff: 0.1, requiresTalent: 'lacerate' },
  { id: 'primalBite', school: 'physical', destruction: false, castTime: 0, manaCost: 20, cooldown: 6, directMin: 77, directMax: 77, directCoeff: 1, requiresTalent: 'primalBite' },
];

/** Règles du druide : reprises de Classic quand Forever ne publie rien. */
export interface DruidRules {
  level: number;
  baseStrength: number;
  baseAgility: number;
  baseStamina: number;
  baseIntellect: number;
  baseSpirit: number;
  baseMana: number;
  baseHealth: number;
  manaPerInt: number;
  healthPerSta: number;
  apPerStr: number;
  baseAttackPower: number;
  agiPerCritPct: number;
  baseMeleeCritPct: number;
  intPerSpellCritPct: number;
  baseSpellCritPct: number;
  regenBase: number;
  regenSpiritDivisor: number;
  meleeMissPct: number;
  bossDodgePct: number;
  glancingPct: number;
  glancingPenaltyPct: number;
  critSuppressionPct: number;
  spellMissPct: number;
  meleeCritMultiplier: number;
  spellCritMultiplier: number;
  healCritMultiplier: number;
  bossArmor: number;
  // Formes
  catAttackSpeed: number;
  bearAttackSpeed: number;
  catApBonus: number; // Forme de félin : +12 PA plus l'Agilité (infobulle Forever)
  direBearApBonus: number;
  direBearArmorPct: number; // armure des objets en plus en Forme d'ours redoutable
  direBearHealth: number;
  energyPerTick: number; // toutes les 2 s
  rageConversion: number; // dégâts pour 1 point de rage (niveau 60)
  omenChancePct: number; // Augure de clarté : chance par coup ou par sort (10 s de recharge)
  bearThreatMultiplier: number;
  // Défense (Ours)
  bossSwingSpeed: number;
  bossSwingDamage: number;
  bossDefenseSkill: number;
  baseDefense: number;
  baseDodgePct: number;
  crushingPct: number;
  gcd: number;
  latency: number;
  [key: string]: number;
}

export const DRUID_RULES: DruidRules = {
  level: 60,
  baseStrength: 62,
  baseAgility: 57,
  baseStamina: 69,
  baseIntellect: 100,
  baseSpirit: 110,
  baseMana: 1244,
  baseHealth: 1483,
  manaPerInt: 15,
  healthPerSta: 10,
  apPerStr: 2,
  baseAttackPower: -20,
  agiPerCritPct: 20,
  baseMeleeCritPct: 0.9,
  intPerSpellCritPct: 60,
  baseSpellCritPct: 1.8,
  regenBase: 15,
  regenSpiritDivisor: 5,
  meleeMissPct: 9,
  bossDodgePct: 5.6,
  glancingPct: 40,
  glancingPenaltyPct: 30,
  critSuppressionPct: 1.8,
  spellMissPct: 17,
  meleeCritMultiplier: 2,
  spellCritMultiplier: 1.5,
  healCritMultiplier: 1.5,
  bossArmor: 3731,
  catAttackSpeed: 1,
  bearAttackSpeed: 2.5,
  catApBonus: 12,
  direBearApBonus: 210,
  direBearArmorPct: 360,
  direBearHealth: 1560,
  energyPerTick: 20,
  rageConversion: 230.6,
  omenChancePct: 10,
  bearThreatMultiplier: 1.3,
  bossSwingSpeed: 2,
  bossSwingDamage: 2500,
  bossDefenseSkill: 315,
  baseDefense: 300,
  baseDodgePct: 0.9,
  crushingPct: 15,
  gcd: 1.5,
  latency: 0.05,
};

export const DRUID_RULE_FIELDS: [string, number][] = [
  ['level', 1], ['baseStrength', 1], ['baseAgility', 1], ['baseStamina', 1], ['baseIntellect', 1], ['baseSpirit', 1],
  ['baseMana', 1], ['baseHealth', 1], ['manaPerInt', 1], ['healthPerSta', 1], ['apPerStr', 0.5], ['baseAttackPower', 1],
  ['agiPerCritPct', 1], ['baseMeleeCritPct', 0.1], ['intPerSpellCritPct', 1], ['baseSpellCritPct', 0.1],
  ['regenBase', 1], ['regenSpiritDivisor', 0.5], ['meleeMissPct', 0.5], ['bossDodgePct', 0.1], ['glancingPct', 1],
  ['glancingPenaltyPct', 1], ['critSuppressionPct', 0.1], ['spellMissPct', 0.5], ['meleeCritMultiplier', 0.1],
  ['spellCritMultiplier', 0.05], ['healCritMultiplier', 0.05], ['bossArmor', 50], ['catAttackSpeed', 0.1],
  ['bearAttackSpeed', 0.1], ['catApBonus', 1], ['direBearApBonus', 1], ['direBearArmorPct', 10], ['direBearHealth', 10],
  ['energyPerTick', 1], ['rageConversion', 1], ['omenChancePct', 1], ['bearThreatMultiplier', 0.05],
  ['bossSwingSpeed', 0.1], ['bossSwingDamage', 50], ['bossDefenseSkill', 1], ['baseDefense', 1], ['baseDodgePct', 0.1],
  ['crushingPct', 1], ['gcd', 0.1], ['latency', 0.01],
];

export type DruidSpec = 'balance' | 'cat' | 'bear' | 'resto';

export interface DruidOptions {
  // Équilibre
  filler: 'starfire' | 'wrath' | 'eclipse';
  moonfire: boolean;
  insectSwarm: boolean;
  moonkin: boolean;
  innervate: boolean;
  manaPotions: boolean;
  // Chat
  behind: boolean; // Lambeau (dans le dos) plutôt que Griffe
  rake: boolean;
  rip: boolean;
  ferociousBite: boolean;
  // Ours
  maul: boolean;
  maulRage: number; // rage gardée avant de lancer Mutilation
  lacerate: boolean;
  primalBite: boolean;
  swipe: boolean;
  // Restauration
  activityPct: number;
  overhealPct: number;
  hotTargets: number; // cibles gardées sous Récupération
  regrowth: boolean;
  wildGrowth: boolean;
  wildGrowthTargets: number;
  swiftmend: boolean;
  naturesSwiftness: boolean;
}

export const DEFAULT_DRUID_OPTIONS: DruidOptions = {
  filler: 'starfire',
  moonfire: true,
  insectSwarm: true,
  moonkin: true,
  innervate: true,
  manaPotions: true,
  behind: true,
  rake: true,
  rip: true,
  ferociousBite: true,
  maul: true,
  maulRage: 40,
  lacerate: true,
  primalBite: true,
  swipe: false,
  activityPct: 60,
  overhealPct: 20,
  hotTargets: 3,
  regrowth: true,
  wildGrowth: true,
  wildGrowthTargets: 5,
  swiftmend: true,
  naturesSwiftness: true,
};

/** Builds de départ (valides dans les arbres Forever, 51 points) pour chaque rôle. */
export const DRUID_DEFAULT_TALENTS: Record<DruidSpec, Record<string, number>> = {
  balance: {
    improvedWrath: 5, genesis: 5, moonglow: 3, improvedMoonfire: 2, naturesMajesty: 2, naturesReach: 2, naturesSplendor: 1,
    insectSwarm: 1, vengeance: 5, improvedStarfire: 5, naturesGrace: 1, eclipse: 3, moonfury: 5, moonkinForm: 1,
    naturesFocus: 5, heartOfTheWild: 5,
  },
  cat: {
    ferocity: 5, furor: 5, feralSwiftness: 2, feralInstinct: 3, thickHide: 3, shreddingAttacks: 3, savageFury: 2,
    sharpenedClaws: 2, predatoryStrikes: 3, lacerate: 1, bloodFrenzy: 2, leaderOfThePack: 1, naturalInstinct: 2,
    rendAndTear: 5, primalBite: 1, predatoryDiscipline: 1,
    heartOfTheWild: 5, naturalist: 5,
  },
  bear: {
    ferocity: 5, furor: 5, feralSwiftness: 2, feralInstinct: 3, thickHide: 3, shreddingAttacks: 3, savageFury: 2,
    sharpenedClaws: 2, predatoryStrikes: 3, lacerate: 1, bloodFrenzy: 2, leaderOfThePack: 1, naturalInstinct: 2,
    naturalReaction: 5, primalBite: 1, brutalImpact: 1,
    heartOfTheWild: 5, naturalist: 5,
  },
  resto: {
    naturesFocus: 5, heartOfTheWild: 5, naturalist: 5, reflection: 3, giftOfNature: 5, bloom: 1, tranquilSpirit: 5,
    improvedRejuvenation: 3, swiftmend: 1, naturesSwiftness: 1, livingSpirit: 3, improvedRegrowth: 5, wildGrowth: 1,
    improvedWrath: 5, genesis: 3,
  },
};
