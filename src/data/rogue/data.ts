import data from '../generated/rogue.json';
import { makeTalentData } from '../talentData';
import type { SpellDef } from '../types';

// Voleur Forever : arbres et sorts relevés sur Wowhead (npm run fetch-data).
// Forever ajoute Surin (Shank : main gauche, rend de l'énergie), Estropier (Mutilate) en Assassinat et Hémorragie en Finesse.

export const ROGUE_SIMULATED = new Set([
  // Assassinat
  'malice', 'ruthlessness', 'improvedSliceAndDice', 'vigor', 'bloodSplatter', 'lethality', 'vilePoisons', 'coldBlood',
  'improvedPoisons', 'relentlessStrikes', 'venom', 'sealFate', 'mutilate',
  // Combat
  'coupDeGrace', 'efficientStrikes', 'puncturingWounds', 'precision', 'flawlessExecution', 'weaponExpertise', 'aggression',
  'dualWieldSpecialization', 'bladeFlurry', 'hackAndSlash', 'flashOfSteel', 'adrenalineRush',
  // Finesse
  'opportunity', 'serratedBlades', 'hemorrhage', 'bootKnife',
]);

const meta = (id: number, icon: string, en: string, fr: string) => ({ id, icon, name: { en, fr }, tooltip: { en: '', fr: '' } });

export const ROGUE_DATA = makeTalentData(data, ['#c7b54b', '#d0884a', '#8f7fcf'], ROGUE_SIMULATED, {
  shank: meta(1329549, 'ability_theblackarrow', 'Shank', 'Surin'),
  mutilate: meta(399956, 'ability_rogue_shadowstrikes', 'Mutilate', 'Estropier'),
  hemorrhage: meta(16511, 'spell_shadow_lifedrain', 'Hemorrhage', 'Hémorragie'),
  offHand: meta(6603, 'inv_sword_04', 'Off-hand', 'Main gauche'),
  extraAttack: meta(13960, 'ability_dualwield', 'Hack and Slash (extra attack)', 'Taillader et trancher (attaque en plus)'),
});

/**
 * Valeurs au rang maximum (niveau 60) lues dans les infobulles Forever ; `manaCost` est le coût en énergie.
 * Coups : `directMin`/`directMax` est le bonus ajouté aux dégâts de l'arme, `directCoeff` la part des dégâts d'arme.
 * Éviscération : 54-162 + 170 par point de combo ; la part de puissance d'attaque n'est pas publiée (règle réglable).
 */
export const ROGUE_SPELLS: SpellDef[] = [
  { id: 'melee', school: 'physical', destruction: false, castTime: 0, manaCost: 0 },
  { id: 'sinisterStrike', school: 'physical', destruction: false, castTime: 0, manaCost: 45, directMin: 68, directMax: 68, directCoeff: 1 },
  { id: 'backstab', school: 'physical', destruction: false, castTime: 0, manaCost: 60, directMin: 150, directMax: 150, directCoeff: 1.5 },
  { id: 'mutilate', school: 'physical', destruction: false, castTime: 0, manaCost: 60, directMin: 40, directMax: 40, directCoeff: 0.9, requiresTalent: 'mutilate' },
  { id: 'hemorrhage', school: 'physical', destruction: false, castTime: 0, manaCost: 35, directMin: 0, directMax: 0, directCoeff: 1, requiresTalent: 'hemorrhage' },
  { id: 'shank', school: 'physical', destruction: false, castTime: 0, manaCost: 5, cooldown: 10, directMin: 0, directMax: 0, directCoeff: 0.5 },
  // Points de combo : dégâts par point (directMin/Max à 1 point, + 170 par point en plus).
  { id: 'eviscerate', school: 'physical', destruction: false, castTime: 0, manaCost: 35, directMin: 224, directMax: 332 },
  { id: 'rupture', school: 'physical', destruction: false, castTime: 0, manaCost: 25, dotTotal: 469, dotDuration: 16, dotTicks: 8 },
  { id: 'sliceAndDice', school: 'physical', destruction: false, castTime: 0, manaCost: 25 },
  { id: 'instantPoison', school: 'nature', destruction: false, castTime: 0, manaCost: 0, directMin: 45, directMax: 57 },
  { id: 'deadlyPoison', school: 'nature', destruction: false, castTime: 0, manaCost: 0, dotTotal: 23, dotDuration: 3, dotTicks: 1 },
];

/** Règles du voleur : reprises de Classic quand Forever ne publie rien. */
export interface RogueRules {
  level: number;
  baseStrength: number;
  baseAgility: number;
  baseStamina: number;
  baseHealth: number;
  healthPerSta: number;
  baseAttackPower: number;
  agiPerCritPct: number;
  baseCritPct: number;
  maxEnergy: number;
  energyPerSecond: number;
  /** Raté des coups spéciaux et coups blancs à une arme ; à deux armes, les coups blancs ratent plus. */
  missPct: number;
  dwMissPct: number;
  bossDodgePct: number;
  glancingPct: number;
  glancingPenaltyPct: number;
  critSuppressionPct: number;
  critMultiplier: number;
  bossArmor: number;
  offHandPct: number;
  /** Part de puissance d'attaque par point de combo (Éviscération) et à 5 points (Rupture). */
  eviscerateApPerCp: number;
  ruptureApAt5: number;
  instantPoisonChance: number;
  deadlyPoisonChance: number;
  deadlyPoisonStacks: number;
  /** Vitesse normalisée des coups (dégâts d'arme des techniques). */
  normalizedSpeed: number;
  gcd: number;
  latency: number;
  [key: string]: number;
}

export const ROGUE_RULES: RogueRules = {
  level: 60,
  baseStrength: 80,
  baseAgility: 130,
  baseStamina: 75,
  baseHealth: 1520,
  healthPerSta: 10,
  baseAttackPower: 100,
  agiPerCritPct: 29,
  baseCritPct: 0,
  maxEnergy: 100,
  energyPerSecond: 10,
  missPct: 9,
  dwMissPct: 28,
  bossDodgePct: 5.6,
  glancingPct: 40,
  glancingPenaltyPct: 30,
  critSuppressionPct: 1.8,
  critMultiplier: 2,
  bossArmor: 3731,
  offHandPct: 50,
  eviscerateApPerCp: 0.03,
  ruptureApAt5: 0.24,
  instantPoisonChance: 20,
  deadlyPoisonChance: 30,
  deadlyPoisonStacks: 5,
  normalizedSpeed: 0,
  gcd: 1,
  latency: 0.05,
};

export const ROGUE_RULE_FIELDS: [string, number][] = [
  ['level', 1], ['baseStrength', 1], ['baseAgility', 1], ['baseStamina', 1], ['baseHealth', 1], ['healthPerSta', 1],
  ['baseAttackPower', 1], ['agiPerCritPct', 0.5], ['baseCritPct', 0.1], ['maxEnergy', 5], ['energyPerSecond', 0.5],
  ['missPct', 0.5], ['dwMissPct', 0.5], ['bossDodgePct', 0.1], ['glancingPct', 1], ['glancingPenaltyPct', 1],
  ['critSuppressionPct', 0.1], ['critMultiplier', 0.1], ['bossArmor', 50], ['offHandPct', 5], ['eviscerateApPerCp', 0.01],
  ['ruptureApAt5', 0.01], ['instantPoisonChance', 1], ['deadlyPoisonChance', 1], ['deadlyPoisonStacks', 1],
  ['gcd', 0.1], ['latency', 0.01],
];

export type RogueSpec = 'assassination' | 'combat' | 'subtlety';
export type RogueWeaponType = 'dagger' | 'sword' | 'mace' | 'fist';
export type RogueBuilder = 'sinisterStrike' | 'backstab' | 'mutilate' | 'hemorrhage';

export interface RogueOptions {
  builder: RogueBuilder;
  /** Type de l'arme principale (Taillader et trancher, Attaque sournoise). */
  weaponType: RogueWeaponType;
  sliceAndDice: boolean;
  rupture: boolean;
  shank: boolean;
  coldBlood: boolean;
  bladeFlurry: boolean;
  adrenalineRush: boolean;
  instantPoison: boolean;
  deadlyPoison: boolean;
  /** Points de combo minimum pour l'Éviscération. */
  finisherCp: number;
}

export const DEFAULT_ROGUE_OPTIONS: RogueOptions = {
  builder: 'sinisterStrike',
  weaponType: 'sword',
  sliceAndDice: true,
  rupture: false,
  shank: true,
  coldBlood: true,
  bladeFlurry: true,
  adrenalineRush: true,
  instantPoison: true,
  deadlyPoison: true,
  finisherCp: 5,
};

/** Builds de départ (valides dans les arbres Forever, 51 points). */
export const ROGUE_DEFAULT_TALENTS: Record<RogueSpec, Record<string, number>> = {
  // 33/18/0 : Estropier, Scelle le destin, poisons.
  assassination: {
    malice: 5, ruthlessness: 3, improvedSliceAndDice: 3, vigor: 2, lethality: 2, bloodSplatter: 1,
    vilePoisons: 5, coldBlood: 1, improvedPoisons: 5, relentlessStrikes: 1, venom: 1, sealFate: 3, mutilate: 1,
    coupDeGrace: 3, efficientStrikes: 2, precision: 3, puncturingWounds: 3, deflection: 2, endurance: 2, aggression: 3,
  },
  // 13/38/0 : Déluge de lames, Poussée d'adrénaline, Taillader et trancher, L'éclat de l'acier.
  combat: {
    malice: 5, ruthlessness: 3, improvedSliceAndDice: 3, vigor: 2,
    coupDeGrace: 3, efficientStrikes: 2, lightningReflexes: 1, precision: 3, puncturingWounds: 3, deflection: 3, riposte: 1, composure: 2,
    flawlessExecution: 1, weaponExpertise: 2, aggression: 3, dualWieldSpecialization: 2, bladeFlurry: 1, hackAndSlash: 5,
    flashOfSteel: 5, adrenalineRush: 1,
  },
  // 18/0/33 : Hémorragie, Lames dentelées, Couteau de jet.
  subtlety: {
    malice: 5, ruthlessness: 3, improvedSliceAndDice: 3, vigor: 2, lethality: 2, bloodSplatter: 1, vilePoisons: 2,
    opportunity: 5, setup: 3, masterOfDeception: 3, dirtyDeeds: 2, initiative: 3, premeditation: 1, serratedBlades: 3,
    elusiveness: 2, ghostlyStrike: 1, heightenedSenses: 2, preparation: 1, hemorrhage: 1, bootKnife: 5, deathMark: 1,
  },
};
