import data from '../generated/hunter.json';
import { makeTalentData } from '../talentData';
import type { SpellDef } from '../types';

// Chasseur Forever : arbres et sorts relevés sur Wowhead (npm run fetch-data).
// Forever a remanié la classe : Faucon (Maîtrise des bêtes), Tir de précision (Précision), Survie au corps à corps.

export const HUNTER_SIMULATED = new Set([
  // Maîtrise des bêtes
  'deadlyAspects', 'focusedFire', 'unleashedFury', 'ferocity', 'summonHawk', 'bestialDiscipline', 'frenzy', 'bestialWrath',
  // Précision
  'lethalAttacks', 'improvedStings', 'efficiency', 'carefulAim', 'rapidKilling', 'improvedArcaneShot', 'loneWolf',
  'trueshotAura', 'mortalShots', 'barrage', 'rangedWeaponSpecialization', 'sniperShot',
  // Survie
  'improvedTracking', 'savageStrikes', 'surefooted', 'predatorsEdge', 'resourcefulness', 'exposePrey', 'striderKick',
  'lightningReflexes', 'laceratingStrikes',
]);

const meta = (id: number, icon: string, en: string, fr: string) => ({ id, icon, name: { en, fr }, tooltip: { en: '', fr: '' } });

export const HUNTER_DATA = makeTalentData(data, ['#a9d271', '#d6b25e', '#c98a4b'], HUNTER_SIMULATED, {
  pet: meta(883, 'ability_hunter_beastcall', 'Pet', 'Familier'),
  summonHawk: meta(1293241, 'ability_hunter_animalhandler', 'Summon Hawk', 'Invocation de faucon'),
  sniperShot: meta(1310687, 'hunter_pvp_snipershot', 'Sniper Shot', 'Tir de précision'),
  striderKick: meta(1317257, 'ability_hunter_pet_tallstrider', 'Strider Kick', 'Coup de trotteur'),
  laceratingStrikes: meta(1310533, 'ability_gouge', 'Lacerating Strikes', 'Frappes lacérantes'),
  melee: meta(6603, 'inv_sword_04', 'Melee', 'Mêlée'),
  manaPotion: meta(13444, 'inv_potion_76', 'Major Mana Potion', 'Potion de mana majeure'),
});

/**
 * Valeurs au rang maximum (niveau 60) lues dans les infobulles Forever.
 * Pour les tirs, `directMin`/`directMax` est le bonus ajouté aux dégâts de l'arme ; `directCoeff` est la part de
 * puissance d'attaque à distance (hypothèse : 0, comme en Classic). Flèches multiples : bonus de Classic (Forever ne le publie pas).
 */
export const HUNTER_SPELLS: SpellDef[] = [
  { id: 'autoShot', school: 'physical', destruction: false, castTime: 0, manaCost: 0 },
  { id: 'aimedShot', school: 'physical', destruction: false, castTime: 2, manaCost: 310, cooldown: 6, directMin: 350, directMax: 350 },
  { id: 'multiShot', school: 'physical', destruction: false, castTime: 0, manaCost: 239, cooldown: 6, directMin: 150, directMax: 150 },
  { id: 'arcaneShot', school: 'arcane', destruction: false, castTime: 0, manaCost: 189, cooldown: 6, directMin: 280, directMax: 280, directCoeff: 0 },
  { id: 'serpentSting', school: 'nature', destruction: false, castTime: 0, manaCost: 250, dotTotal: 675, dotDuration: 15, dotTicks: 5, dotCoeff: 0 },
  { id: 'sniperShot', school: 'physical', destruction: false, castTime: 4, manaCost: 365, cooldown: 15, directMin: 320, directMax: 320, requiresTalent: 'sniperShot' },
  // Faucon : 32 de base (48 avec Férocité, 52 avec Furie libérée) + 5 % de la puissance d'attaque à distance par attaque.
  { id: 'summonHawk', school: 'physical', destruction: false, castTime: 0, manaCost: 189, cooldown: 6, directMin: 32, directMax: 32, directCoeff: 0.05, requiresTalent: 'summonHawk' },
  // Survie (corps à corps) : bonus ajouté aux dégâts de l'arme.
  { id: 'raptorStrike', school: 'physical', destruction: false, castTime: 0, manaCost: 100, cooldown: 6, directMin: 70, directMax: 70 },
  { id: 'mongooseBite', school: 'physical', destruction: false, castTime: 0, manaCost: 65, cooldown: 5, directMin: 57, directMax: 57 },
  { id: 'striderKick', school: 'physical', destruction: false, castTime: 0, manaCost: 100, cooldown: 8, directMin: 0, directMax: 0, requiresTalent: 'striderKick' },
];

/** Règles du chasseur : reprises de Classic quand Forever ne publie rien (familier : hypothèses à recaler). */
export interface HunterRules {
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
  /** Puissance d'attaque à distance de base (niveau × 2 − 10) et de mêlée (niveau × 2 − 20). */
  baseRangedAp: number;
  baseMeleeAp: number;
  agiPerCritPct: number;
  baseCritPct: number;
  regenBase: number;
  regenSpiritDivisor: number;
  missPct: number;
  bossDodgePct: number;
  /** Les tirs peuvent-ils être esquivés (% d'esquive du boss appliqué à distance) ? 0 = non. */
  rangedDodge: number;
  glancingPct: number;
  glancingPenaltyPct: number;
  critSuppressionPct: number;
  critMultiplier: number;
  bossArmor: number;
  ammoDps: number;
  quiverHastePct: number;
  hawkAspectAp: number;
  huntersMarkAp: number;
  // Familier (chat niveau 60)
  petAttackSpeed: number;
  petBaseDamage: number;
  petApFromRap: number;
  petCritPct: number;
  petAbilityDps: number;
  hawkAttackInterval: number;
  gcd: number;
  latency: number;
  [key: string]: number;
}

export const HUNTER_RULES: HunterRules = {
  level: 60,
  baseStrength: 60,
  baseAgility: 105,
  baseStamina: 90,
  baseIntellect: 65,
  baseSpirit: 70,
  baseMana: 1720,
  baseHealth: 1470,
  manaPerInt: 15,
  healthPerSta: 10,
  baseRangedAp: 110,
  baseMeleeAp: 100,
  agiPerCritPct: 53,
  baseCritPct: 0,
  regenBase: 15,
  regenSpiritDivisor: 5,
  missPct: 9,
  bossDodgePct: 5.6,
  rangedDodge: 0,
  glancingPct: 40,
  glancingPenaltyPct: 30,
  critSuppressionPct: 1.8,
  critMultiplier: 2,
  bossArmor: 3731,
  ammoDps: 17.5,
  quiverHastePct: 15,
  hawkAspectAp: 120,
  huntersMarkAp: 143,
  petAttackSpeed: 2,
  petBaseDamage: 110,
  petApFromRap: 0.22,
  petCritPct: 5,
  petAbilityDps: 15,
  hawkAttackInterval: 3,
  gcd: 1.5,
  latency: 0.05,
};

export const HUNTER_RULE_FIELDS: [string, number][] = [
  ['level', 1], ['baseStrength', 1], ['baseAgility', 1], ['baseStamina', 1], ['baseIntellect', 1], ['baseSpirit', 1],
  ['baseMana', 1], ['baseHealth', 1], ['manaPerInt', 1], ['healthPerSta', 1], ['baseRangedAp', 1], ['baseMeleeAp', 1],
  ['agiPerCritPct', 1], ['baseCritPct', 0.1], ['regenBase', 1], ['regenSpiritDivisor', 0.5], ['missPct', 0.5],
  ['bossDodgePct', 0.1], ['rangedDodge', 1], ['glancingPct', 1], ['glancingPenaltyPct', 1], ['critSuppressionPct', 0.1],
  ['critMultiplier', 0.1], ['bossArmor', 50], ['ammoDps', 0.5], ['quiverHastePct', 1], ['hawkAspectAp', 5], ['huntersMarkAp', 5],
  ['petAttackSpeed', 0.1], ['petBaseDamage', 5], ['petApFromRap', 0.01], ['petCritPct', 0.5], ['petAbilityDps', 1],
  ['hawkAttackInterval', 0.5], ['gcd', 0.1], ['latency', 0.01],
];

export type HunterSpec = 'bm' | 'mm' | 'surv';

export interface HunterOptions {
  pet: boolean;
  huntersMark: boolean;
  aspectOfTheHawk: boolean;
  serpentSting: boolean;
  arcaneShot: boolean;
  /** Visée (2 s d'incantation) ou Flèches multiples : elles partagent leur temps de recharge. */
  sixSecondShot: 'aimedShot' | 'multiShot' | 'none';
  sniperShot: boolean;
  summonHawk: boolean;
  rapidFire: boolean;
  bestialWrath: boolean;
  // Survie
  raptorStrike: boolean;
  mongooseBite: boolean;
  striderKick: boolean;
  manaPotions: boolean;
}

export const DEFAULT_HUNTER_OPTIONS: HunterOptions = {
  pet: true,
  huntersMark: true,
  aspectOfTheHawk: true,
  serpentSting: true,
  arcaneShot: true,
  sixSecondShot: 'aimedShot',
  sniperShot: true,
  summonHawk: true,
  rapidFire: true,
  bestialWrath: true,
  raptorStrike: true,
  mongooseBite: true,
  striderKick: true,
  manaPotions: true,
};

/** Builds de départ (valides dans les arbres Forever, 51 points). */
export const HUNTER_DEFAULT_TALENTS: Record<HunterSpec, Record<string, number>> = {
  // 33/18/0 : Faucons, Frénésie, Courroux bestial.
  bm: {
    deadlyAspects: 5, focusedFire: 2, improvedAspectOfTheMonkey: 3, unleashedFury: 5, bestialSwiftness: 1, ferocity: 5,
    summonHawk: 1, intimidation: 1, bestialDiscipline: 2, spiritBond: 2, frenzy: 5, bestialWrath: 1,
    lethalAttacks: 5, efficiency: 5, improvedStings: 3, carefulAim: 5,
  },
  // 8/43/0 : Loup solitaire (sans familier), Tirs mortels, Tir de précision.
  mm: {
    deadlyAspects: 5, improvedAspectOfTheMonkey: 3,
    lethalAttacks: 5, efficiency: 5, carefulAim: 5, improvedStings: 3, improvedArcaneShot: 5, rapidKilling: 2, loneWolf: 1,
    mortalShots: 5, trueshotAura: 1, barrage: 3, rapidRecuperation: 2, rangedWeaponSpecialization: 5, sniperShot: 1,
  },
  // 0/19/32 : corps à corps, Morsure de la mangouste avec Proie exposée, Frappes lacérantes.
  surv: {
    lethalAttacks: 5, efficiency: 5, improvedStings: 3, carefulAim: 5, hawkEye: 1,
    improvedTracking: 5, savageStrikes: 2, survivalist: 5, surefooted: 3, deterrence: 1, predatorsEdge: 5,
    exposePrey: 2, striderKick: 1, resourcefulness: 2, lightningReflexes: 5, laceratingStrikes: 1,
  },
};
