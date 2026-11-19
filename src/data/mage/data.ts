import data from '../generated/mage.json';
import { makeTalentData } from '../talentData';
import type { SpellDef } from '../types';

// Mage Forever : arbres et sorts relevés sur Wowhead (npm run fetch-data).

export const MAGE_SIMULATED = new Set([
  // Arcanes
  'arcaneConcentration', 'missileBarrage', 'arcaneImpact', 'arcaneBlast', 'arcaneMeditation', 'arcaneWrath',
  'presenceOfMind', 'arcaneMind', 'arcaneInstability', 'arcanePower',
  // Feu
  'incineration', 'accelerant', 'ignite', 'pyroblast', 'improvedFireBlast', 'improvedScorch', 'heatingUp',
  'masterOfElements', 'criticalMass', 'firePower', 'combustion',
  // Givre
  'improvedFrostbolt', 'precision', 'iceShards', 'frostChanneling', 'iceLance', 'shatter', 'fingersOfFrost', 'iceBarrier',
]);

const meta = (id: number, icon: string, en: string, fr: string) => ({ id, icon, name: { en, fr }, tooltip: { en: '', fr: '' } });

export const MAGE_DATA = makeTalentData(data, ['#9b6cf0', '#e0743a', '#6fb7e8'], MAGE_SIMULATED, {
  ignite: meta(12654, 'spell_fire_incinerate', 'Ignite', 'Enflammer'),
  manaPotion: meta(13444, 'inv_potion_76', 'Major Mana Potion', 'Potion de mana majeure'),
});

/** Sorts « givrefeu » : profitent à la fois des talents de Feu et de Givre. */
export const FROSTFIRE = new Set(['frostfireBolt']);

/**
 * Valeurs au rang maximum (niveau 60) lues dans les infobulles Forever. Coefficients de puissance :
 * hypothèses (Classic quand le sort existait), modifiables dans « Sorts & règles ».
 */
export const MAGE_SPELLS: SpellDef[] = [
  { id: 'frostbolt', school: 'frost', destruction: false, castTime: 3, manaCost: 290, directMin: 470, directMax: 506, directCoeff: 0.814 },
  { id: 'iceLance', school: 'frost', destruction: false, castTime: 0, manaCost: 160, cooldown: 8, directMin: 140, directMax: 164, directCoeff: 0.143, requiresTalent: 'iceLance' },
  { id: 'iceBarrier', school: 'frost', destruction: false, castTime: 0, manaCost: 480, cooldown: 30, requiresTalent: 'iceBarrier' },
  { id: 'fireball', school: 'fire', destruction: false, castTime: 3.5, manaCost: 395, directMin: 409, directMax: 517, directCoeff: 1, dotTotal: 56, dotDuration: 8, dotTicks: 4 },
  { id: 'frostfireBolt', school: 'fire', destruction: false, castTime: 3, manaCost: 370, directMin: 286, directMax: 331, directCoeff: 0.857, dotTotal: 57, dotDuration: 9, dotTicks: 3 },
  { id: 'pyroblast', school: 'fire', destruction: false, castTime: 6, manaCost: 440, directMin: 547, directMax: 674, directCoeff: 1.15, dotTotal: 212, dotDuration: 12, dotTicks: 4, dotCoeff: 0.2, requiresTalent: 'pyroblast' },
  { id: 'scorch', school: 'fire', destruction: false, castTime: 1.5, manaCost: 150, directMin: 170, directMax: 200, directCoeff: 0.429 },
  { id: 'fireBlast', school: 'fire', destruction: false, castTime: 0, manaCost: 340, cooldown: 8, directMin: 417, directMax: 489, directCoeff: 0.429 },
  { id: 'arcaneMissiles', school: 'arcane', destruction: false, castTime: 5, channel: true, manaCost: 595, dotTotal: 875, dotDuration: 5, dotTicks: 5, dotCoeff: 1.2 },
  { id: 'arcaneWrath', school: 'arcane', destruction: false, castTime: 3.5, manaCost: 395, cooldown: 6, directMin: 439, directMax: 529, directCoeff: 1, requiresTalent: 'arcaneWrath' },
  // Coût : 15 % du mana de base, +100 % par charge.
  { id: 'arcaneBlast', school: 'arcane', destruction: false, castTime: 1.5, manaCost: 0, directMin: 231, directMax: 267, directCoeff: 0.714, requiresTalent: 'arcaneBlast' },
];

/** Règles du mage : reprises de Classic quand Forever ne publie rien. */
export interface MageRules {
  level: number;
  baseIntellect: number;
  baseSpirit: number;
  baseStamina: number;
  baseMana: number;
  baseHealth: number;
  manaPerInt: number;
  healthPerSta: number;
  intPerSpellCritPct: number;
  baseSpellCritPct: number;
  regenBase: number;
  regenSpiritDivisor: number;
  spellMissPct: number;
  critMultiplier: number;
  dotsCanCrit: number; // 1 = oui (Forever)
  gcd: number;
  latency: number;
  [key: string]: number;
}

export const MAGE_RULES: MageRules = {
  level: 60,
  baseIntellect: 125,
  baseSpirit: 120,
  baseStamina: 50,
  baseMana: 1213,
  baseHealth: 1000,
  manaPerInt: 15,
  healthPerSta: 10,
  intPerSpellCritPct: 59.5,
  baseSpellCritPct: 0.2,
  regenBase: 13,
  regenSpiritDivisor: 4,
  spellMissPct: 17,
  critMultiplier: 1.5,
  dotsCanCrit: 1,
  gcd: 1.5,
  latency: 0.05,
};

export const MAGE_RULE_FIELDS: [string, number][] = [
  ['level', 1], ['baseIntellect', 1], ['baseSpirit', 1], ['baseStamina', 1], ['baseMana', 1], ['baseHealth', 1],
  ['manaPerInt', 1], ['healthPerSta', 1], ['intPerSpellCritPct', 0.5], ['baseSpellCritPct', 0.1], ['regenBase', 1],
  ['regenSpiritDivisor', 0.5], ['spellMissPct', 0.5], ['critMultiplier', 0.05], ['gcd', 0.1], ['latency', 0.01],
];

export type MageSpec = 'arcane' | 'fire' | 'frost';

export interface MageOptions {
  filler: 'frostbolt' | 'fireball' | 'frostfireBolt';
  arcaneBlastStacks: number; // charges d'Explosion des arcanes avant de passer aux Projectiles
  arcaneBlastManaFloor: number; // % de mana sous lequel on arrête d'empiler l'Explosion
  arcaneWrath: boolean;
  scorch: boolean; // garder Brûlure améliorée à 5 charges
  fireBlast: boolean;
  pyroblast: boolean; // Explosion pyrotechnique quand Échauffement est à 3 charges
  iceLance: boolean; // seulement avec Doigts de givre
  iceBarrier: boolean;
  cooldowns: boolean; // Pouvoir des arcanes, Présence spirituelle, Combustion dès que possible
  mageArmor: boolean;
  evocation: boolean;
  manaPotions: boolean;
}

export const DEFAULT_MAGE_OPTIONS: MageOptions = {
  filler: 'frostbolt',
  arcaneBlastStacks: 3,
  arcaneBlastManaFloor: 35,
  arcaneWrath: true,
  scorch: true,
  fireBlast: true,
  pyroblast: true,
  iceLance: true,
  iceBarrier: true,
  cooldowns: true,
  mageArmor: true,
  evocation: true,
  manaPotions: true,
};

/** Builds de départ (valides dans les arbres Forever, 51 points). */
export const MAGE_DEFAULT_TALENTS: Record<MageSpec, Record<string, number>> = {
  arcane: {
    wandSpecialization: 2, arcaneResilience: 3, arcaneConcentration: 5, missileBarrage: 2, arcaneSubtlety: 2,
    arcaneImpact: 3, arcaneBlast: 1, arcaneGeometry: 1, arcaneMeditation: 3, arcaneWrath: 1, presenceOfMind: 1,
    arcaneMind: 5, arcaneInstability: 3, arcanePower: 1,
    improvedFrostbolt: 5, precision: 3, iceShards: 5, frostChanneling: 3, permafrost: 2,
  },
  fire: {
    incineration: 5, accelerant: 5, ignite: 5, flameThrowing: 2, pyroblast: 1, improvedFireBlast: 2, burningSoul: 2,
    improvedScorch: 3, heatingUp: 1, masterOfElements: 3, criticalMass: 3, blastWave: 1, firePower: 3, combustion: 1,
    wandSpecialization: 2, arcaneResilience: 3, arcaneConcentration: 5, arcaneSubtlety: 2, missileBarrage: 2,
  },
  frost: {
    improvedFrostbolt: 5, precision: 3, iceShards: 5, permafrost: 2, frostChanneling: 3, iceLance: 1, shatter: 3,
    arcticReach: 2, iceBlock: 1, coldSnap: 1, fingersOfFrost: 2, wintersChill: 5, iceBarrier: 1,
    wandSpecialization: 2, arcaneResilience: 3, arcaneConcentration: 5, arcaneSubtlety: 2, arcaneImpact: 3, missileBarrage: 2,
  },
};
