import data from '../generated/paladin.json';
import { makeTalentData } from '../talentData';
import type { SpellDef } from '../types';

// Paladin Forever : arbres et sorts relevés sur Wowhead (npm run fetch-data).

export const PALADIN_SIMULATED = new Set([
  // Sacré
  'divineStrength', 'healingLight', 'reverence', 'improvedSeals', 'divineFavor', 'illumination', 'holyConduit',
  'divinePrecision', 'infusionOfLight', 'holyShock', 'boundlessLight', 'holyPower', 'lightsVigil',
  // Protection
  'divineIntellect', 'redoubt', 'precision', 'shieldSpecialization', 'toughness', 'improvedRighteousFury',
  'anticipation', 'holyShield', 'reckoning', 'ironCreed', 'shieldsworn',
  // Vindicte
  'deflection', 'benediction', 'improvedJudgement', 'conviction', 'sanctifiedJudgement', 'sealOfCommand',
  'sacredArbiter', 'twohandedWeaponSpecialization', 'vengeance', 'championOfTheLight',
]);

const meta = (id: number, icon: string, en: string, fr: string) => ({ id, icon, name: { en, fr }, tooltip: { en: '', fr: '' } });

export const PALADIN_DATA = makeTalentData(data, ['#f0d060', '#6fa8dc', '#e06666'], PALADIN_SIMULATED, {
  melee: meta(6603, 'inv_sword_04', 'Melee', 'Mêlée'),
  judgementOfCommand: meta(20920, 'ability_warrior_innerrage', 'Judgement of Command', 'Jugement d’autorité'),
  judgementOfRighteousness: meta(20293, 'ability_thunderbolt', 'Judgement of Righteousness', 'Jugement de piété'),
  judgementOfFury: meta(20414, 'spell_holy_retributionaura', 'Judgement of Fury', 'Jugement de fureur'),
  judgementOfTheCrusader: meta(20308, 'spell_holy_holysmite', 'Judgement of the Crusader', 'Jugement du Croisé'),
  sealOfCommandProc: meta(20920, 'ability_warrior_innerrage', 'Seal of Command', 'Sceau d’autorité'),
  lightsVigilParty: meta(1311595, 'ability_paladin_judgementofthepure', 'Light’s Vigil (party)', 'Vigile de Lumière (groupe)'),
});

/**
 * Valeurs au rang maximum (niveau 60) lues dans les infobulles Forever. Les coefficients de puissance
 * des sorts ne sont pas publiés : ce sont des hypothèses (valeurs Classic quand le sort existait),
 * modifiables dans l'onglet « Sorts & règles ». Les dégâts « directMin/Max » d'un sceau sont par coup.
 */
export const PALADIN_SPELLS: SpellDef[] = [
  // Vindicte / Protection
  { id: 'holyStrike', school: 'holy', destruction: false, castTime: 0, manaCost: 20, cooldown: 10, directMin: 97, directMax: 121, directCoeff: 0.2 },
  { id: 'sealOfCommand', school: 'holy', destruction: false, castTime: 0, manaCost: 210, directCoeff: 0.2 },
  { id: 'sealOfRighteousness', school: 'holy', destruction: false, castTime: 0, manaCost: 200, directMin: 23.8, directMax: 82.7, directCoeff: 0.098 },
  { id: 'sealOfFury', school: 'holy', destruction: false, castTime: 0, manaCost: 200, directMin: 35, directMax: 35, directCoeff: 0.05 },
  { id: 'sealOfTheCrusader', school: 'holy', destruction: false, castTime: 0, manaCost: 160 },
  { id: 'judgementOfCommand', school: 'holy', destruction: false, castTime: 0, manaCost: 0, directMin: 194, directMax: 211, directCoeff: 0.43 },
  { id: 'judgementOfRighteousness', school: 'holy', destruction: false, castTime: 0, manaCost: 0, directMin: 187, directMax: 203, directCoeff: 0.5 },
  { id: 'judgementOfFury', school: 'holy', destruction: false, castTime: 0, manaCost: 0, directMin: 168, directMax: 182, directCoeff: 0.43 },
  { id: 'judgementOfTheCrusader', school: 'holy', destruction: false, castTime: 0, manaCost: 0, directMin: 161, directMax: 161 },
  { id: 'consecration', school: 'holy', destruction: false, castTime: 0, manaCost: 565, cooldown: 8, dotTotal: 312, dotDuration: 8, dotTicks: 8, dotCoeff: 0.33 },
  { id: 'exorcism', school: 'holy', destruction: false, castTime: 0, manaCost: 345, cooldown: 15, directMin: 491, directMax: 545, directCoeff: 0.43 },
  { id: 'hammerOfWrath', school: 'holy', destruction: false, castTime: 1, manaCost: 425, cooldown: 6, directMin: 489, directMax: 538, directCoeff: 0.43 },
  { id: 'holyShield', school: 'holy', destruction: false, castTime: 0, manaCost: 240, cooldown: 10, directMin: 221, directMax: 221, directCoeff: 0.05 },
  // Sacré (soins)
  { id: 'holyLight', school: 'holy', destruction: false, castTime: 2.5, manaCost: 660, directMin: 1524, directMax: 1694, directCoeff: 0.714 },
  { id: 'flashOfLight', school: 'holy', destruction: false, castTime: 1.5, manaCost: 140, directMin: 299, directMax: 333, directCoeff: 0.429 },
  { id: 'holyShock', school: 'holy', destruction: false, castTime: 0, manaCost: 325, cooldown: 10, directMin: 307, directMax: 333, directCoeff: 0.429, requiresTalent: 'holyShock' },
  { id: 'lightsVigil', school: 'holy', destruction: false, castTime: 1.5, manaCost: 1340, cooldown: 6, directMin: 700, directMax: 740, directCoeff: 0.2, requiresTalent: 'lightsVigil' },
];

/** Règles du paladin : reprises de Classic quand Forever ne publie rien (à corriger après tests en jeu). */
export interface PaladinRules {
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
  /** Mana rendu toutes les 2 s hors combat de sorts : base + Esprit / diviseur. */
  regenBase: number;
  regenSpiritDivisor: number;
  meleeMissPct: number; // raté de base contre un boss, attaques spéciales comme coups blancs
  bossDodgePct: number;
  bossParryPct: number; // seulement de face (Protection)
  glancingPct: number;
  glancingPenaltyPct: number;
  critSuppressionPct: number;
  spellMissPct: number;
  meleeCritMultiplier: number;
  spellCritMultiplier: number;
  healCritMultiplier: number;
  bossArmor: number;
  sealOfCommandPpm: number;
  sorReferenceSpeed: number; // vitesse d'arme pour laquelle l'infobulle du Sceau de piété est donnée
  // Protection
  bossSwingSpeed: number;
  bossSwingDamage: number; // avant armure
  bossDefenseSkill: number; // compétence d'arme du boss (niveau 63)
  baseDefense: number;
  baseDodgePct: number;
  baseParryPct: number;
  baseBlockPct: number;
  crushingPct: number;
  gcd: number;
  latency: number;
  [key: string]: number;
}

export const PALADIN_RULES: PaladinRules = {
  level: 60,
  baseStrength: 105,
  baseAgility: 69,
  baseStamina: 100,
  baseIntellect: 74,
  baseSpirit: 80,
  baseMana: 1512,
  baseHealth: 1381,
  manaPerInt: 15,
  healthPerSta: 10,
  apPerStr: 2,
  baseAttackPower: 160,
  agiPerCritPct: 20,
  baseMeleeCritPct: 0.7,
  intPerSpellCritPct: 54,
  baseSpellCritPct: 3.3,
  regenBase: 15,
  regenSpiritDivisor: 5,
  meleeMissPct: 9,
  bossDodgePct: 5.6,
  bossParryPct: 14,
  glancingPct: 40,
  glancingPenaltyPct: 30,
  critSuppressionPct: 1.8,
  spellMissPct: 17,
  meleeCritMultiplier: 2,
  spellCritMultiplier: 1.5,
  healCritMultiplier: 1.5,
  bossArmor: 3731,
  sealOfCommandPpm: 7,
  sorReferenceSpeed: 2.5,
  bossSwingSpeed: 2,
  bossSwingDamage: 2500,
  bossDefenseSkill: 315,
  baseDefense: 300,
  baseDodgePct: 0.7,
  baseParryPct: 5,
  baseBlockPct: 5,
  crushingPct: 15,
  gcd: 1.5,
  latency: 0.05,
};

export const PALADIN_RULE_FIELDS: [keyof PaladinRules & string, number][] = [
  ['level', 1], ['baseStrength', 1], ['baseAgility', 1], ['baseStamina', 1], ['baseIntellect', 1], ['baseSpirit', 1],
  ['baseMana', 1], ['baseHealth', 1], ['manaPerInt', 1], ['healthPerSta', 1], ['apPerStr', 0.5], ['baseAttackPower', 1],
  ['agiPerCritPct', 1], ['baseMeleeCritPct', 0.1], ['intPerSpellCritPct', 1], ['baseSpellCritPct', 0.1],
  ['regenBase', 1], ['regenSpiritDivisor', 0.5], ['meleeMissPct', 0.5], ['bossDodgePct', 0.1], ['bossParryPct', 0.5],
  ['glancingPct', 1], ['glancingPenaltyPct', 1], ['critSuppressionPct', 0.1], ['spellMissPct', 0.5],
  ['meleeCritMultiplier', 0.1], ['spellCritMultiplier', 0.05], ['healCritMultiplier', 0.05], ['bossArmor', 50],
  ['sealOfCommandPpm', 0.5], ['sorReferenceSpeed', 0.1], ['bossSwingSpeed', 0.1], ['bossSwingDamage', 50],
  ['bossDefenseSkill', 1], ['baseDefense', 1], ['baseDodgePct', 0.1], ['baseParryPct', 0.1], ['baseBlockPct', 0.1],
  ['crushingPct', 1], ['gcd', 0.1], ['latency', 0.01],
];

export type PaladinSpec = 'ret' | 'holy' | 'prot';
export type PaladinSeal = 'command' | 'righteousness' | 'crusader' | 'fury';

/** Options de combat du paladin (rotation, cible, soins). */
export interface PaladinOptions {
  seal: PaladinSeal;
  /** Jugement du Croisé sur la cible : posé par toi au début, par un autre paladin, ou absent. */
  crusaderJudgement: 'self' | 'other' | 'none';
  holyStrike: boolean;
  judgement: boolean;
  consecration: boolean;
  exorcism: boolean;
  hammerOfWrath: boolean;
  /** Cible mort-vivant ou démon (Exorcisme). */
  undeadOrDemon: boolean;
  shield: boolean; // un bouclier est porté (Protection : blocage, Bouclier sacré)
  righteousFury: boolean;
  holyShield: boolean;
  // Sacré
  holyLightPct: number; // part des soins de remplissage faits avec Lumière sacrée (le reste : Éclair lumineux)
  activityPct: number; // part du combat passée à soigner (le reste : pas besoin de soins)
  overhealPct: number;
  useHolyShock: boolean;
  useLightsVigil: boolean;
  vigilTargets: number;
  useDivineFavor: boolean;
  manaPotions: boolean;
}

export const DEFAULT_PALADIN_OPTIONS: PaladinOptions = {
  seal: 'command',
  crusaderJudgement: 'self',
  holyStrike: true,
  judgement: true,
  consecration: false,
  exorcism: true,
  hammerOfWrath: true,
  undeadOrDemon: false,
  shield: false,
  righteousFury: false,
  holyShield: true,
  holyLightPct: 40,
  activityPct: 60,
  overhealPct: 20,
  useHolyShock: true,
  useLightsVigil: true,
  vigilTargets: 5,
  useDivineFavor: true,
  manaPotions: true,
};

/** Builds de départ (valides dans les arbres Forever) pour chaque spécialisation. */
export const PALADIN_DEFAULT_TALENTS: Record<PaladinSpec, Record<string, number>> = {
  ret: {
    divineStrength: 5, improvedSeals: 5, reverence: 1,
    benediction: 5, improvedJudgement: 2, conviction: 3, sanctifiedJudgement: 3, sealOfCommand: 1, deflection: 5,
    vindication: 3, pursuitOfJustice: 2, eyeForAnEye: 2, sacredArbiter: 1, twohandedWeaponSpecialization: 3,
    vengeance: 3, championOfTheLight: 5, turnEvil: 2,
  },
  holy: {
    spiritualFocus: 5, divineStrength: 5, healingLight: 3, reverence: 2, improvedSeals: 5, divineFavor: 1,
    illumination: 5, holyConduit: 2, divinePrecision: 2, infusionOfLight: 2, holyShock: 1, boundlessLight: 2,
    holyPower: 5, lightsVigil: 1, consecratedGround: 2,
    divineIntellect: 5, precision: 3,
  },
  prot: {
    divineIntellect: 5, redoubt: 5, precision: 3, sacredDuty: 2, templarsBulwark: 1, shieldSpecialization: 2,
    toughness: 5, improvedRighteousFury: 3, anticipation: 5, holyShield: 1, reckoning: 5, ironCreed: 3, shieldsworn: 1,
    benediction: 5, conviction: 3, improvedJudgement: 2,
  },
};
