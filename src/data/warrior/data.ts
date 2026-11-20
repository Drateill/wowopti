import data from '../generated/warrior.json';
import { makeTalentData } from '../talentData';
import type { SpellDef } from '../types';

// Guerrier Forever : arbres et sorts relevés sur Wowhead (npm run fetch-data).
// Forever ajoute Frappe perforante (Armes), Frappes téméraires (Fureur) et Avant-garde (Protection).

export const WARRIOR_SIMULATED = new Set([
  // Armes
  'improvedHeroicStrike', 'improvedRend', 'angerManagement', 'deepWounds', 'twohandedWeaponSpecialization', 'impale',
  'bloodthrill', 'weaponmaster', 'improvedSlam', 'improvedOverpower', 'mortalStrike',
  // Fureur
  'boomingVoice', 'cruelty', 'unbridledWrath', 'furiousPrecision', 'enrage', 'dualWieldSpecialization', 'recklessSwings',
  'improvedExecute', 'improvedBerserkerRage', 'deathWish', 'improvedWhirlwind', 'flurry', 'bloodthirst',
  // Protection
  'improvedBloodrage', 'shieldSpecialization', 'anticipation', 'improvedRevenge', 'masterOfDefense', 'defiance',
  'improvedSunderArmor', 'focusedRage', 'bastion', 'shieldSlam',
]);

const meta = (id: number, icon: string, en: string, fr: string) => ({ id, icon, name: { en, fr }, tooltip: { en: '', fr: '' } });

export const WARRIOR_DATA = makeTalentData(data, ['#c69b6d', '#c4553d', '#7f8fa6'], WARRIOR_SIMULATED, {
  offHand: meta(6603, 'inv_sword_04', 'Off-hand', 'Main gauche'),
  deepWounds: meta(12867, 'ability_backstab', 'Deep Wounds', 'Blessures profondes'),
  extraAttack: meta(1290261, 'ability_dualwield', 'Weaponmaster (extra attack)', 'Maître d’armes (attaque en plus)'),
  recklessSwings: meta(1329555, 'ability_warrior_innerrage', 'Reckless Swings', 'Frappes téméraires'),
  berserkerRage: meta(18499, 'spell_nature_ancestralguardian', 'Berserker Rage', 'Rage berserker'),
});

/**
 * Valeurs au rang maximum (niveau 60) lues dans les infobulles Forever ; `manaCost` est le coût en rage.
 * Coups : `directMin`/`directMax` est le bonus ajouté aux dégâts de l'arme, `directCoeff` la part des dégâts d'arme
 * (Sanguinaire : part de la puissance d'attaque).
 */
export const WARRIOR_SPELLS: SpellDef[] = [
  { id: 'melee', school: 'physical', destruction: false, castTime: 0, manaCost: 0 },
  { id: 'heroicStrike', school: 'physical', destruction: false, castTime: 0, manaCost: 15, directMin: 157, directMax: 157, directCoeff: 1 },
  { id: 'mortalStrike', school: 'physical', destruction: false, castTime: 0, manaCost: 30, cooldown: 6, directMin: 160, directMax: 160, directCoeff: 1, requiresTalent: 'mortalStrike' },
  { id: 'bloodthirst', school: 'physical', destruction: false, castTime: 0, manaCost: 30, cooldown: 6, directMin: 48, directMax: 48, directCoeff: 0.45, requiresTalent: 'bloodthirst' },
  { id: 'whirlwind', school: 'physical', destruction: false, castTime: 0, manaCost: 25, cooldown: 10, directMin: 0, directMax: 0, directCoeff: 1 },
  { id: 'slam', school: 'physical', destruction: false, castTime: 1.5, manaCost: 15, cooldown: 15, directMin: 87, directMax: 87, directCoeff: 1 },
  { id: 'overpower', school: 'physical', destruction: false, castTime: 0, manaCost: 5, cooldown: 5, directMin: 35, directMax: 35, directCoeff: 1 },
  { id: 'execute', school: 'physical', destruction: false, castTime: 0, manaCost: 15, directMin: 600, directMax: 600 },
  { id: 'rend', school: 'physical', destruction: false, castTime: 0, manaCost: 10, dotTotal: 147, dotDuration: 21, dotTicks: 7 },
  { id: 'battleShout', school: 'physical', destruction: false, castTime: 0, manaCost: 10 },
  { id: 'revenge', school: 'physical', destruction: false, castTime: 0, manaCost: 5, cooldown: 5, directMin: 137.7, directMax: 168.3, directCoeff: 0.25 },
  { id: 'shieldSlam', school: 'physical', destruction: false, castTime: 0, manaCost: 20, cooldown: 6, directMin: 640, directMax: 670, directCoeff: 1, requiresTalent: 'shieldSlam' },
  { id: 'sunderArmor', school: 'physical', destruction: false, castTime: 0, manaCost: 15 },
];

/** Règles du guerrier : reprises de Classic quand Forever ne publie rien. */
export interface WarriorRules {
  level: number;
  baseStrength: number;
  baseAgility: number;
  baseStamina: number;
  baseHealth: number;
  healthPerSta: number;
  baseAttackPower: number;
  apPerStr: number;
  agiPerCritPct: number;
  baseCritPct: number;
  berserkerCritPct: number;
  /** Rage : dégâts infligés × 7,5 / conversion ; dégâts subis × 2,5 / conversion. */
  rageConversion: number;
  missPct: number;
  dwMissPct: number;
  bossDodgePct: number;
  bossParryPct: number;
  glancingPct: number;
  glancingPenaltyPct: number;
  critSuppressionPct: number;
  critMultiplier: number;
  bossArmor: number;
  offHandPct: number;
  /** Part du combat sous 20 % de vie (Exécution). */
  executePct: number;
  battleShoutAp: number;
  sunderThreat: number;
  /** Protection : coups du boss et menace. */
  defensiveThreat: number;
  defensiveDamagePct: number;
  bossSwingSpeed: number;
  bossSwingDamage: number;
  bossDefenseSkill: number;
  baseDefense: number;
  baseDodgePct: number;
  baseParryPct: number;
  baseBlockPct: number;
  gcd: number;
  latency: number;
  [key: string]: number;
}

export const WARRIOR_RULES: WarriorRules = {
  level: 60,
  baseStrength: 120,
  baseAgility: 80,
  baseStamina: 110,
  baseHealth: 1689,
  healthPerSta: 10,
  baseAttackPower: 160,
  apPerStr: 2,
  agiPerCritPct: 20,
  baseCritPct: 0,
  berserkerCritPct: 3,
  rageConversion: 230.6,
  missPct: 9,
  dwMissPct: 28,
  bossDodgePct: 5.6,
  bossParryPct: 14,
  glancingPct: 40,
  glancingPenaltyPct: 30,
  critSuppressionPct: 1.8,
  critMultiplier: 2,
  bossArmor: 3731,
  offHandPct: 50,
  executePct: 20,
  battleShoutAp: 140,
  sunderThreat: 260,
  defensiveThreat: 1.3,
  defensiveDamagePct: 10,
  bossSwingSpeed: 2,
  bossSwingDamage: 2500,
  bossDefenseSkill: 315,
  baseDefense: 300,
  baseDodgePct: 5,
  baseParryPct: 5,
  baseBlockPct: 5,
  gcd: 1.5,
  latency: 0.05,
};

export const WARRIOR_RULE_FIELDS: [string, number][] = [
  ['level', 1], ['baseStrength', 1], ['baseAgility', 1], ['baseStamina', 1], ['baseHealth', 1], ['healthPerSta', 1],
  ['baseAttackPower', 1], ['apPerStr', 0.5], ['agiPerCritPct', 0.5], ['baseCritPct', 0.1], ['berserkerCritPct', 0.5],
  ['rageConversion', 1], ['missPct', 0.5], ['dwMissPct', 0.5], ['bossDodgePct', 0.1], ['bossParryPct', 0.5],
  ['glancingPct', 1], ['glancingPenaltyPct', 1], ['critSuppressionPct', 0.1], ['critMultiplier', 0.1], ['bossArmor', 50],
  ['offHandPct', 5], ['executePct', 1], ['battleShoutAp', 5], ['sunderThreat', 10], ['defensiveThreat', 0.05],
  ['defensiveDamagePct', 1], ['bossSwingSpeed', 0.1], ['bossSwingDamage', 50], ['bossDefenseSkill', 1], ['baseDefense', 1],
  ['baseDodgePct', 0.1], ['baseParryPct', 0.1], ['baseBlockPct', 0.1], ['gcd', 0.1], ['latency', 0.01],
];

export type WarriorSpec = 'arms' | 'fury' | 'prot';
export type WarriorWeaponType = 'axe' | 'sword' | 'mace';

export interface WarriorOptions {
  weaponType: WarriorWeaponType;
  heroicStrike: boolean;
  /** Rage minimum avant de mettre Frappe héroïque en file. */
  heroicStrikeRage: number;
  whirlwind: boolean;
  slam: boolean;
  overpower: boolean;
  rend: boolean;
  execute: boolean;
  deathWish: boolean;
  recklessness: boolean;
  recklessSwings: boolean;
  berserkerRage: boolean;
  bloodrage: boolean;
  // Protection
  shield: boolean;
  sunderArmor: boolean;
  revenge: boolean;
}

export const DEFAULT_WARRIOR_OPTIONS: WarriorOptions = {
  weaponType: 'sword',
  heroicStrike: true,
  heroicStrikeRage: 50,
  whirlwind: true,
  slam: true,
  overpower: true,
  rend: false,
  execute: true,
  deathWish: true,
  recklessness: true,
  recklessSwings: true,
  berserkerRage: true,
  bloodrage: true,
  shield: true,
  sunderArmor: true,
  revenge: true,
};

/** Builds de départ (valides dans les arbres Forever, 51 points). */
export const WARRIOR_DEFAULT_TALENTS: Record<WarriorSpec, Record<string, number>> = {
  // 31/20/0 : Frappe mortelle, Heurtoir amélioré, Maître d'armes.
  arms: {
    improvedHeroicStrike: 3, improvedRend: 3, improvedTacticalMastery: 3, improvedOverpower: 2, angerManagement: 1, deepWounds: 3,
    twohandedWeaponSpecialization: 3, impale: 2, sweepingStrikes: 1, weaponmaster: 5, bloodthrill: 2, improvedSlam: 2, mortalStrike: 1,
    boomingVoice: 5, cruelty: 5, unbridledWrath: 5, enrage: 5,
  },
  // 17/34/0 : Sanguinaire, Rafale, Souhait mortel, deux armes.
  fury: {
    improvedHeroicStrike: 3, improvedRend: 3, improvedTacticalMastery: 3, improvedCharge: 2, angerManagement: 1, deepWounds: 3, impale: 2,
    boomingVoice: 2, cruelty: 5, unbridledWrath: 5, furiousPrecision: 3, enrage: 2, dualWieldSpecialization: 5, recklessSwings: 1,
    improvedExecute: 2, improvedBerserkerRage: 2, deathWish: 1, improvedWhirlwind: 2, flurry: 3, bloodthirst: 1,
  },
  // 0/5/46 : Heurt de bouclier, Bastion, Concentration de la rage.
  prot: {
    cruelty: 5,
    improvedBloodrage: 2, shieldSpecialization: 5, ironWill: 3, anticipation: 5, improvedRevenge: 3, lastStand: 1,
    masterOfDefense: 2, defiance: 3, improvedDisarm: 1, improvedSunderArmor: 3, vanguard: 1, improvedShieldBash: 2,
    improvedShieldWall: 2, concussionBlow: 1, focusedRage: 3, bastion: 5, shieldSlam: 1, improvedThunderClap: 3,
  },
};
