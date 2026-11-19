import type { GameRules, SpellDef } from '../types';

// Valeurs de rang maximum au niveau 60 relevées sur Wowhead Forever (patch 1.60.1).
// Les coefficients de puissance des sorts ne sont pas publiés : ce sont ceux de Classic.
// Tout est modifiable dans l'onglet « Sorts & règles ».
export const WARLOCK_SPELLS: SpellDef[] = [
  { id: 'shadowBolt', school: 'shadow', destruction: true, castTime: 3.0, manaCost: 380, directMin: 263, directMax: 292, directCoeff: 0.857 },
  { id: 'searingPain', school: 'fire', destruction: true, castTime: 1.5, manaCost: 168, directMin: 112, directMax: 130, directCoeff: 0.429 },
  { id: 'incinerate', school: 'fire', destruction: true, castTime: 2.5, manaCost: 325, directMin: 213, directMax: 246, directCoeff: 0.714, bonusIfImmolate: 0.25, requiresTalent: 'incinerate' },
  {
    id: 'immolate', school: 'fire', destruction: true, castTime: 2.0, manaCost: 380,
    directMin: 169, directMax: 170, directCoeff: 0.2, dotTotal: 275, dotDuration: 15, dotTicks: 5, dotCoeff: 0.65,
  },
  { id: 'conflagrate', school: 'fire', destruction: true, castTime: 0, manaCost: 255, cooldown: 10, directMin: 259, directMax: 321, directCoeff: 0.429, requiresTalent: 'conflagrate' },
  { id: 'corruption', school: 'shadow', destruction: false, castTime: 2.0, manaCost: 340, dotTotal: 438, dotDuration: 18, dotTicks: 6, dotCoeff: 1.0 },
  { id: 'baneOfAgony', school: 'shadow', destruction: false, castTime: 0, manaCost: 215, dotTotal: 552, dotDuration: 24, dotTicks: 12, dotCoeff: 1.0 },
  { id: 'baneOfDoom', school: 'shadow', destruction: false, castTime: 0, manaCost: 300, cooldown: 60, delayedDamage: 1742, delayedAfter: 60, delayedCoeff: 2.0 },
  { id: 'siphonLife', school: 'shadow', destruction: false, castTime: 0, manaCost: 365, dotTotal: 410, dotDuration: 30, dotTicks: 10, dotCoeff: 0.5, requiresTalent: 'siphonLife' },
  { id: 'wrack', school: 'shadow', destruction: false, castTime: 6, channel: true, manaCost: 200, dotTotal: 360, dotDuration: 6, dotTicks: 6, dotCoeff: 1.0, requiresTalent: 'wrack' },
  { id: 'lifeTap', school: 'shadow', destruction: false, castTime: 0, manaCost: 0 },
  // Diablotin : Éclair de feu rang 7 (45-50, 2 s). Pas de bonus de la puissance des sorts du démoniste.
  { id: 'impFirebolt', school: 'fire', destruction: false, castTime: 2, manaCost: 0, directMin: 45, directMax: 50, pet: true },
];

/** Connexion : (430 + Esprit) points de mana, d'après l'infobulle Forever. */
export const LIFE_TAP_BASE = 430;

export const DEFAULT_RULES: GameRules = {
  level: 60,
  targetMissPct: 17,
  minMissPct: 0,
  critMultiplier: 1.5,
  dotsCanCrit: true,
  baseCritPct: 1.7,
  intPerCritPct: 60.6,
  manaPerInt: 15,
  baseMana: 1093,
  baseIntellect: 120,
  baseSpirit: 125,
  gcd: 1.5,
  latency: 0.05,
};
