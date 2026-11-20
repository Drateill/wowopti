import data from '../generated/shaman.json';
import { makeTalentData } from '../talentData';
import type { SpellDef } from '../types';

// Chaman Forever : arbres et sorts relevés sur Wowhead (npm run fetch-data).
// Forever ajoute Surcharge de foudre, Arme du Maelström, Rage long-voyante, Bouclier d'eau et Remous.

export const SHAMAN_SIMULATED = new Set([
  // Élémentaire
  'convection', 'concussion', 'elementalDevastation', 'reverberation', 'elementalAlacrity', 'callOfFlame', 'elementalFocus',
  'callOfThunder', 'lightningOverload', 'elementalFury', 'lightningMastery',
  // Amélioration
  'thunderingStrikes', 'ancestralKnowledge', 'mentalDexterity', 'elementalWeapons', 'shamanisticFocus', 'toughness', 'flurry',
  'stormstrike', 'mentalQuickness', 'improvedStormstrike', 'maelstromWeapon', 'rageOfTheFarseer',
  // Restauration
  'improvedHealingWave', 'tidalFocus', 'mindfulness', 'totemicFocus', 'waterShield', 'tidalMastery',
  'manaTideTotem', 'healingWay', 'naturesSwiftness', 'purification', 'riptide',
]);

const meta = (id: number, icon: string, en: string, fr: string) => ({ id, icon, name: { en, fr }, tooltip: { en: '', fr: '' } });

export const SHAMAN_DATA = makeTalentData(data, ['#4f8fe0', '#8fb3d9', '#58c08a'], SHAMAN_SIMULATED, {
  windfury: meta(16362, 'spell_nature_cyclone', 'Windfury Attack', 'Attaque Furie-des-vents'),
  lightningOverload: meta(408438, 'spell_nature_lightningoverload', 'Lightning Overload', 'Surcharge de foudre'),
  riptide: meta(408521, 'spell_nature_riptide', 'Riptide', 'Remous'),
  rageOfTheFarseer: meta(425336, 'ability_shaman_ragefarseer', 'Rage of the Farseer', 'Rage long-voyante'),
  waterShield: meta(408510, 'ability_shaman_watershield', 'Water Shield', 'Bouclier d’eau'),
  manaPotion: meta(13444, 'inv_potion_76', 'Major Mana Potion', 'Potion de mana majeure'),
});

/** Valeurs au rang maximum (niveau 60) lues dans les infobulles Forever ; coefficients de Classic. */
export const SHAMAN_SPELLS: SpellDef[] = [
  { id: 'melee', school: 'physical', destruction: false, castTime: 0, manaCost: 0 },
  { id: 'lightningBolt', school: 'nature', destruction: false, castTime: 2.5, manaCost: 220, directMin: 344, directMax: 383, directCoeff: 0.714 },
  { id: 'chainLightning', school: 'nature', destruction: false, castTime: 2.5, manaCost: 495, cooldown: 6, directMin: 498, directMax: 555, directCoeff: 0.714 },
  { id: 'earthShock', school: 'nature', destruction: false, castTime: 0, manaCost: 450, cooldown: 6, directMin: 534, directMax: 562, directCoeff: 0.386 },
  { id: 'flameShock', school: 'fire', destruction: false, castTime: 0, manaCost: 410, cooldown: 6, directMin: 319, directMax: 319, directCoeff: 0.15, dotTotal: 320, dotDuration: 12, dotTicks: 4, dotCoeff: 0.5 },
  { id: 'frostShock', school: 'frost', destruction: false, castTime: 0, manaCost: 430, cooldown: 6, directMin: 501, directMax: 529, directCoeff: 0.386 },
  { id: 'searingTotem', school: 'fire', destruction: false, castTime: 0, manaCost: 170, directMin: 40, directMax: 54, directCoeff: 0.08 },
  // Courroux naturel (Stormstrike) : coût de 8 % du mana de base.
  { id: 'stormstrike', school: 'physical', destruction: false, castTime: 0, manaCost: 122, cooldown: 8, directMin: 0, directMax: 0, directCoeff: 1, requiresTalent: 'stormstrike' },
  { id: 'healingWave', school: 'nature', destruction: false, castTime: 3, manaCost: 620, directMin: 1535, directMax: 1750, directCoeff: 0.857 },
  { id: 'lesserHealingWave', school: 'nature', destruction: false, castTime: 1.5, manaCost: 380, directMin: 796, directMax: 886, directCoeff: 0.428 },
  { id: 'chainHeal', school: 'nature', destruction: false, castTime: 2.5, manaCost: 405, directMin: 474, directMax: 539, directCoeff: 0.714 },
  { id: 'riptide', school: 'nature', destruction: false, castTime: 0, manaCost: 150, cooldown: 12, dotTotal: 445, dotDuration: 15, dotTicks: 5, dotCoeff: 0.5, requiresTalent: 'riptide' },
];

/** Règles du chaman : reprises de Classic quand Forever ne publie rien. */
export interface ShamanRules {
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
  baseAttackPower: number;
  apPerStr: number;
  agiPerCritPct: number;
  baseCritPct: number;
  intPerSpellCritPct: number;
  baseSpellCritPct: number;
  regenBase: number;
  regenSpiritDivisor: number;
  spellMissPct: number;
  missPct: number;
  bossDodgePct: number;
  glancingPct: number;
  glancingPenaltyPct: number;
  critSuppressionPct: number;
  critMultiplier: number;
  spellCritMultiplier: number;
  healCritMultiplier: number;
  bossArmor: number;
  windfuryChance: number;
  windfuryAp: number;
  rockbiterAp: number;
  searingInterval: number;
  manaTidePerTick: number;
  /** Bouclier d'eau : part du mana maximum rendue par globe, intervalle minimum entre deux globes (s). */
  waterShieldPct: number;
  waterShieldInterval: number;
  /** Salve de guérison : part du soin à chaque saut. */
  chainHealJump: number;
  gcd: number;
  latency: number;
  [key: string]: number;
}

export const SHAMAN_RULES: ShamanRules = {
  level: 60,
  baseStrength: 85,
  baseAgility: 55,
  baseStamina: 100,
  baseIntellect: 90,
  baseSpirit: 100,
  baseMana: 1520,
  baseHealth: 1280,
  manaPerInt: 15,
  healthPerSta: 10,
  baseAttackPower: 100,
  apPerStr: 2,
  agiPerCritPct: 20,
  baseCritPct: 0,
  intPerSpellCritPct: 59.5,
  baseSpellCritPct: 2.3,
  regenBase: 15,
  regenSpiritDivisor: 5,
  spellMissPct: 17,
  missPct: 9,
  bossDodgePct: 5.6,
  glancingPct: 40,
  glancingPenaltyPct: 30,
  critSuppressionPct: 1.8,
  critMultiplier: 2,
  spellCritMultiplier: 1.5,
  healCritMultiplier: 1.5,
  bossArmor: 3731,
  windfuryChance: 20,
  windfuryAp: 433,
  rockbiterAp: 686,
  searingInterval: 2.5,
  manaTidePerTick: 197,
  waterShieldPct: 2,
  waterShieldInterval: 3,
  chainHealJump: 0.5,
  gcd: 1.5,
  latency: 0.05,
};

export const SHAMAN_RULE_FIELDS: [string, number][] = [
  ['level', 1], ['baseStrength', 1], ['baseAgility', 1], ['baseStamina', 1], ['baseIntellect', 1], ['baseSpirit', 1],
  ['baseMana', 1], ['baseHealth', 1], ['manaPerInt', 1], ['healthPerSta', 1], ['baseAttackPower', 1], ['apPerStr', 0.5],
  ['agiPerCritPct', 0.5], ['baseCritPct', 0.1], ['intPerSpellCritPct', 0.5], ['baseSpellCritPct', 0.1], ['regenBase', 1],
  ['regenSpiritDivisor', 0.5], ['spellMissPct', 0.5], ['missPct', 0.5], ['bossDodgePct', 0.1], ['glancingPct', 1],
  ['glancingPenaltyPct', 1], ['critSuppressionPct', 0.1], ['critMultiplier', 0.1], ['spellCritMultiplier', 0.05],
  ['healCritMultiplier', 0.05], ['bossArmor', 50], ['windfuryChance', 1], ['windfuryAp', 5], ['rockbiterAp', 5],
  ['searingInterval', 0.1], ['manaTidePerTick', 5], ['waterShieldPct', 0.5],
  ['waterShieldInterval', 0.5], ['chainHealJump', 0.05], ['gcd', 0.1], ['latency', 0.01],
];

export type ShamanSpec = 'elemental' | 'enhancement' | 'resto';
export type ShamanShock = 'earthShock' | 'flameShock' | 'frostShock' | 'none';
export type ShamanHealFiller = 'healingWave' | 'lesserHealingWave' | 'chainHeal';

export interface ShamanOptions {
  // Dégâts
  chainLightning: boolean;
  shock: ShamanShock;
  searingTotem: boolean;
  lightningMastery: boolean;
  // Amélioration
  imbue: 'windfury' | 'rockbiter';
  stormstrike: boolean;
  maelstromBolt: boolean;
  rageOfTheFarseer: boolean;
  // Soins
  activityPct: number;
  overhealPct: number;
  healFiller: ShamanHealFiller;
  chainHealTargets: number;
  riptide: boolean;
  naturesSwiftness: boolean;
  manaTide: boolean;
  waterShield: boolean;
  manaPotions: boolean;
}

export const DEFAULT_SHAMAN_OPTIONS: ShamanOptions = {
  chainLightning: true,
  shock: 'earthShock',
  searingTotem: true,
  lightningMastery: true,
  imbue: 'windfury',
  stormstrike: true,
  maelstromBolt: true,
  rageOfTheFarseer: true,
  activityPct: 80,
  overhealPct: 20,
  healFiller: 'chainHeal',
  chainHealTargets: 3,
  riptide: true,
  naturesSwiftness: true,
  manaTide: true,
  waterShield: true,
  manaPotions: true,
};

/** Builds de départ (valides dans les arbres Forever, 51 points). */
export const SHAMAN_DEFAULT_TALENTS: Record<ShamanSpec, Record<string, number>> = {
  // 34/17/0 : Surcharge de foudre, Fureur élémentaire, Maîtrise de la foudre.
  elemental: {
    convection: 5, concussion: 5, reverberation: 5, elementalAlacrity: 3, callOfFlame: 2, elementalFocus: 1, eyeOfTheStorm: 3,
    callOfThunder: 1, lightningOverload: 3, elementalFury: 5, lightningMastery: 1,
    thunderingStrikes: 5, ancestralKnowledge: 5, mentalDexterity: 3, elementalWeapons: 3, shamanisticFocus: 1,
  },
  // 0/38/13 : Courroux naturel, Arme du Maelström, Rage long-voyante.
  enhancement: {
    thunderingStrikes: 5, ancestralKnowledge: 5, mentalDexterity: 3, improvedLightningShield: 2, elementalWeapons: 3, shamanisticFocus: 1,
    anticipation: 3, flurry: 5, stormstrike: 1, mentalQuickness: 2, improvedStormstrike: 2, maelstromWeapon: 5, rageOfTheFarseer: 1,
    tidalFocus: 5, mindfulness: 3, totemicFocus: 5,
  },
  // 0/15/36 : Remous, Marée de mana, Rapidité de la nature.
  resto: {
    thunderingStrikes: 5, ancestralKnowledge: 5, mentalDexterity: 3, guardianTotems: 1, shamanisticFocus: 1,
    improvedHealingWave: 5, tidalFocus: 5, mindfulness: 3, waterShield: 1, healingFocus: 1, tidalMastery: 5, restorativeTotems: 5,
    manaTideTotem: 1, healingWay: 3, naturesSwiftness: 1, purification: 5, riptide: 1,
  },
};
