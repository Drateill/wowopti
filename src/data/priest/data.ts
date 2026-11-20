import data from '../generated/priest.json';
import { makeTalentData } from '../talentData';
import type { SpellDef } from '../types';

// Prêtre Forever : arbres et sorts relevés sur Wowhead (npm run fetch-data).

export const PRIEST_SIMULATED = new Set([
  // Discipline
  'twinDisciplines', 'holyPrecision', 'mentalStrength', 'mentalAgility', 'innerFocus', 'improvedPowerWordShield', 'meditation',
  'soulWarding', 'penance', 'renewedHope', 'divineAegis', 'powerInfusion',
  // Sacré
  'improvedRenew', 'holySpecialization', 'divineFury', 'improvedHealing', 'searingLight', 'litanyOfLight', 'spiritualGuidance',
  'spiritualHealing', 'prayerOfMending',
  // Ombre
  'shadowFocus', 'improvedMindBlast', 'improvedShadowWordPain', 'mindFlay', 'improvedMindFlay', 'darkInspiration', 'vampiricEmbrace',
  'shadowWeaving', 'devouringContagion', 'darkness', 'shadowform',
]);

const meta = (id: number, icon: string, en: string, fr: string) => ({ id, icon, name: { en, fr }, tooltip: { en: '', fr: '' } });

export const PRIEST_DATA = makeTalentData(data, ['#e8e2c8', '#f2d36b', '#8a63c9'], PRIEST_SIMULATED, {
  divineAegis: meta(431622, 'spell_holy_devineaegis', 'Divine Aegis', 'Égide divine'),
  manaPotion: meta(13444, 'inv_potion_76', 'Major Mana Potion', 'Potion de mana majeure'),
});

/**
 * Valeurs au rang maximum (niveau 60) lues dans les infobulles Forever. Coefficients de puissance :
 * hypothèses (Classic, ou durée d'incantation / 3,5 pour les sorts propres à Forever), modifiables dans « Sorts & règles ».
 */
export const PRIEST_SPELLS: SpellDef[] = [
  // Ombre
  { id: 'shadowWordPain', school: 'shadow', destruction: false, castTime: 0, manaCost: 470, dotTotal: 762, dotDuration: 18, dotTicks: 6, dotCoeff: 1.1 },
  { id: 'mindBlast', school: 'shadow', destruction: false, castTime: 1.5, manaCost: 350, cooldown: 8, directMin: 485, directMax: 511, directCoeff: 0.429 },
  { id: 'mindFlay', school: 'shadow', destruction: false, castTime: 3, channel: true, manaCost: 205, dotTotal: 390, dotDuration: 3, dotTicks: 3, dotCoeff: 0.45, requiresTalent: 'mindFlay' },
  { id: 'devouringPlague', school: 'shadow', destruction: false, castTime: 0, manaCost: 985, cooldown: 24, dotTotal: 848, dotDuration: 24, dotTicks: 8, dotCoeff: 0.8 },
  { id: 'shadowWordDeath', school: 'shadow', destruction: false, castTime: 0, manaCost: 340, cooldown: 18, directMin: 447, directMax: 474, directCoeff: 0.429 },
  { id: 'vampiricEmbrace', school: 'shadow', destruction: false, castTime: 0, manaCost: 40, cooldown: 30, requiresTalent: 'vampiricEmbrace' },
  { id: 'smite', school: 'holy', destruction: false, castTime: 2.5, manaCost: 280, directMin: 167, directMax: 186, directCoeff: 0.714 },
  // Soins (montants soignés)
  { id: 'greaterHeal', school: 'holy', destruction: false, castTime: 3, manaCost: 710, directMin: 1893, directMax: 2108, directCoeff: 0.857 },
  { id: 'heal', school: 'holy', destruction: false, castTime: 3, manaCost: 305, directMin: 634, directMax: 713, directCoeff: 0.857 },
  { id: 'flashHeal', school: 'holy', destruction: false, castTime: 1.5, manaCost: 380, directMin: 778, directMax: 914, directCoeff: 0.429 },
  { id: 'prayerOfHealing', school: 'holy', destruction: false, castTime: 3, manaCost: 1070, directMin: 646, directMax: 681, directCoeff: 0.286 },
  { id: 'renew', school: 'holy', destruction: false, castTime: 0, manaCost: 410, dotTotal: 830, dotDuration: 15, dotTicks: 5, dotCoeff: 1 },
  { id: 'powerWordShield', school: 'holy', destruction: false, castTime: 0, manaCost: 500, cooldown: 4, directMin: 950, directMax: 950, directCoeff: 0.1 },
  // Pénitence : 3 éclairs (immédiat puis toutes les secondes), coefficient par éclair.
  { id: 'penance', school: 'holy', destruction: false, castTime: 2, channel: true, manaCost: 385, cooldown: 12, directMin: 425, directMax: 425, directCoeff: 0.229, requiresTalent: 'penance' },
  // Prière de guérison : 413 + 42,9 % de la puissance de soin par saut (infobulle Forever).
  { id: 'prayerOfMending', school: 'holy', destruction: false, castTime: 0, manaCost: 390, cooldown: 10, directMin: 413, directMax: 413, directCoeff: 0.429, requiresTalent: 'prayerOfMending' },
];

/** Règles du prêtre : reprises de Classic quand Forever ne publie rien. */
export interface PriestRules {
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
  healCritMultiplier: number;
  dotsCanCrit: number; // 1 = oui (Forever)
  /** Intervalle moyen entre deux sauts de Prière de guérison (s). */
  pomJumpInterval: number;
  gcd: number;
  latency: number;
  [key: string]: number;
}

export const PRIEST_RULES: PriestRules = {
  level: 60,
  baseIntellect: 120,
  baseSpirit: 135,
  baseStamina: 55,
  baseMana: 1436,
  baseHealth: 1100,
  manaPerInt: 15,
  healthPerSta: 10,
  intPerSpellCritPct: 59.5,
  baseSpellCritPct: 0.8,
  regenBase: 13,
  regenSpiritDivisor: 4,
  spellMissPct: 17,
  critMultiplier: 1.5,
  healCritMultiplier: 1.5,
  dotsCanCrit: 1,
  pomJumpInterval: 2,
  gcd: 1.5,
  latency: 0.05,
};

export const PRIEST_RULE_FIELDS: [string, number][] = [
  ['level', 1], ['baseIntellect', 1], ['baseSpirit', 1], ['baseStamina', 1], ['baseMana', 1], ['baseHealth', 1],
  ['manaPerInt', 1], ['healthPerSta', 1], ['intPerSpellCritPct', 0.5], ['baseSpellCritPct', 0.1], ['regenBase', 1],
  ['regenSpiritDivisor', 0.5], ['spellMissPct', 0.5], ['critMultiplier', 0.05], ['healCritMultiplier', 0.05],
  ['pomJumpInterval', 0.5], ['gcd', 0.1], ['latency', 0.01],
];

export type PriestSpec = 'disc' | 'holy' | 'shadow';
export type PriestHealFiller = 'greaterHeal' | 'heal' | 'flashHeal' | 'prayerOfHealing';

export interface PriestOptions {
  // Ombre
  mindBlast: boolean;
  devouringPlague: boolean;
  shadowWordDeath: boolean; // contrecoup de 30 % de la vie : désactivé par défaut
  vampiricEmbrace: boolean;
  // Soins
  activityPct: number;
  overhealPct: number;
  healFiller: PriestHealFiller;
  pohTargets: number;
  renewTargets: number;
  shieldTargets: number;
  penance: boolean;
  prayerOfMending: boolean;
  pomCharges: number; // sauts réellement consommés
  // Commun
  innerFocus: boolean;
  powerInfusion: boolean; // sur soi
  manaPotions: boolean;
}

export const DEFAULT_PRIEST_OPTIONS: PriestOptions = {
  mindBlast: true,
  devouringPlague: true,
  shadowWordDeath: false,
  vampiricEmbrace: true,
  activityPct: 60,
  overhealPct: 20,
  healFiller: 'greaterHeal',
  pohTargets: 5,
  renewTargets: 1,
  shieldTargets: 1,
  penance: true,
  prayerOfMending: true,
  pomCharges: 5,
  innerFocus: true,
  powerInfusion: true,
  manaPotions: true,
};

/** Builds de départ (valides dans les arbres Forever, 51 points). */
export const PRIEST_DEFAULT_TALENTS: Record<PriestSpec, Record<string, number>> = {
  // 34/17/0 : Pénitence, Espoir renouvelé, Égide divine, Infusion de puissance.
  disc: {
    twinDisciplines: 5, mentalStrength: 5, mentalAgility: 3, innerFocus: 1, improvedPowerWordShield: 3, meditation: 3,
    soulWarding: 1, improvedInnerFire: 3, penance: 1, renewedHope: 5, divineAegis: 3, powerInfusion: 1,
    improvedRenew: 3, holySpecialization: 5, divineFury: 5, holyNova: 1, inspiration: 1, improvedHealing: 2,
  },
  // 18/33/0 : Conseils spirituels, Litanie de lumière, Prière de guérison.
  holy: {
    twinDisciplines: 5, mentalStrength: 5, mentalAgility: 3, innerFocus: 1, meditation: 3, improvedPowerWordShield: 1,
    improvedRenew: 3, holySpecialization: 5, divineFury: 5, holyNova: 1, inspiration: 3, improvedHealing: 3, holyBinding: 1,
    litanyOfLight: 2, spiritOfRedemption: 1, spiritualGuidance: 5, spiritualHealing: 3, prayerOfMending: 1,
  },
  // 20/0/31 : Fouet mental amélioré, Tissage de l'ombre, Ténèbres, Forme d'Ombre.
  shadow: {
    twinDisciplines: 5, mentalStrength: 5, mentalAgility: 3, innerFocus: 1, meditation: 3, improvedPowerWordShield: 3,
    shadowFocus: 5, improvedShadowWordPain: 2, improvedMindBlast: 5, mindFlay: 1, improvedMindFlay: 2, vampiricEmbrace: 1,
    shadowWeaving: 3, darkInspiration: 3, devouringContagion: 2, silence: 1, darkness: 5, shadowform: 1,
  },
};
