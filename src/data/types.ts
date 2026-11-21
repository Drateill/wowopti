// Types partagés entre toutes les classes (voir data/classes.ts pour brancher une classe).

export type Lang = 'fr' | 'en';
export type Localized = Record<Lang, string>;

export type School = 'shadow' | 'fire' | 'frost' | 'arcane' | 'nature' | 'holy' | 'physical';

/** Stats « feuille de personnage » (équipement + bonus), en valeurs brutes. */
export interface Stats {
  spellPower: number; // dégâts des sorts (toutes écoles)
  shadowPower: number; // dégâts des sorts d'ombre uniquement
  firePower: number; // dégâts des sorts de feu uniquement
  critPct: number; // % de critique venant de l'équipement (hors intelligence)
  hitPct: number; // % de toucher venant de l'équipement
  intellect: number;
  spirit: number;
  stamina: number;
  mp5: number; // mana toutes les 5 secondes
  // Corps à corps, soins et défense (paladin et futures classes)
  strength: number;
  agility: number;
  attackPower: number;
  healingPower: number; // soins en plus de la puissance des sorts (objets « soins + dégâts réduits »)
  defense: number; // points de compétence Défense
  blockPct: number;
  blockValue: number;
  dodgePct: number;
  parryPct: number;
  armor: number;
  weaponDps: number; // DPS de l'arme en main droite (calculé, sert aux poids de stats)
}

export const STAT_KEYS: (keyof Stats)[] = [
  'spellPower', 'shadowPower', 'firePower', 'healingPower', 'critPct', 'hitPct', 'intellect', 'spirit', 'stamina', 'mp5',
  'strength', 'agility', 'attackPower', 'weaponDps', 'defense', 'blockPct', 'blockValue', 'dodgePct', 'parryPct', 'armor',
];

/** Stats exprimées en pourcentage (affichées avec une décimale). */
export const PCT_STATS = new Set<keyof Stats>(['critPct', 'hitPct', 'blockPct', 'dodgePct', 'parryPct']);

export const emptyStats = (): Stats => ({
  spellPower: 0,
  shadowPower: 0,
  firePower: 0,
  critPct: 0,
  hitPct: 0,
  intellect: 0,
  spirit: 0,
  stamina: 0,
  mp5: 0,
  strength: 0,
  agility: 0,
  attackPower: 0,
  healingPower: 0,
  defense: 0,
  blockPct: 0,
  blockValue: 0,
  dodgePct: 0,
  parryPct: 0,
  armor: 0,
  weaponDps: 0,
});

/** Arme : dégâts et vitesse de base (sans puissance d'attaque). */
export interface WeaponInfo {
  min: number;
  max: number;
  speed: number;
  twoHand: boolean;
}

export interface SpellDef {
  id: string;
  school: School;
  /** Sort de Destruction (pour Ruine, Cataclysme, Flammes déchirantes...). */
  destruction: boolean;
  castTime: number; // secondes, 0 = instantané
  channel?: boolean;
  manaCost: number;
  cooldown?: number;
  directMin?: number;
  directMax?: number;
  directCoeff?: number;
  dotTotal?: number;
  dotDuration?: number;
  dotTicks?: number;
  dotCoeff?: number;
  delayedDamage?: number;
  delayedAfter?: number;
  delayedCoeff?: number;
  /** Bonus de dégâts si la cible est sous Immolation (Incinérer). */
  bonusIfImmolate?: number;
  /** Talent requis pour pouvoir lancer le sort. */
  requiresTalent?: string;
  /** Sort lancé par le démon (pas de puissance des sorts ni de talents du démoniste). */
  pet?: boolean;
  /** Sort de zone : touche toutes les cibles du combat. */
  aoe?: boolean;
}

export interface TalentDef {
  key: string;
  tree: number;
  row: number;
  col: number;
  maxRank: number;
  icon: string;
  name: Localized;
  /** Description de chaque rang (index 0 = rang 1). */
  desc: Record<Lang, string[]>;
  requires: { key: string; qty: number }[];
  /** false = affiché mais sans effet dans la simulation. */
  simulated: boolean;
}

export interface TalentTree {
  key: string;
  name: Localized;
  icon: string;
  color: string;
}

/** Règles globales du jeu, modifiables depuis l'onglet Sorts & règles. */
export interface GameRules {
  level: number;
  targetMissPct: number; // chance de rater un boss (niveau +3)
  minMissPct: number; // plancher de raté
  critMultiplier: number; // multiplicateur de critique des sorts
  dotsCanCrit: boolean; // nouveauté Forever
  baseCritPct: number;
  intPerCritPct: number;
  manaPerInt: number;
  baseMana: number;
  baseIntellect: number;
  baseSpirit: number;
  gcd: number;
  latency: number;
}

/**
 * Effets qui ne sont pas des stats : multiplicateurs de dégâts et réductions de coût.
 * Clés : id de sort (« corruption »), école (« school:shadow ») ou « all ».
 */
export interface SimModifiers {
  dmgMult: Record<string, number>; // multiplicateur (1.1 = +10 %)
  costPct: Record<string, number>; // réduction de coût en %
  statMult: number; // multiplicateur des caractéristiques (Rois, Esprit des Zandalar)
  maxMana: number; // mana maximum en plus (Flacon de sagesse distillée)
  armorReduction: number; // armure retirée à la cible (Fracasser armure, Lucioles…)
  weaponDamage: number; // dégâts d'arme en plus par coup (pierre à aiguiser, Frappe excellente)
  hastePct: number; // vitesse d'attaque et d'incantation en plus
  staminaMult: number; // endurance en plus (Détermination de Mol'dar)
  maxHealth: number; // points de vie en plus (Flacon des Titans)
}

export const emptyMods = (): SimModifiers => ({
  dmgMult: {}, costPct: {}, statMult: 1, maxMana: 0, armorReduction: 0, weaponDamage: 0, hastePct: 0, staminaMult: 1, maxHealth: 0,
});

/** Combine deux jeux d'effets (multiplicateurs multipliés, réductions additionnées). */
export function mergeMods(a: SimModifiers, b: Partial<SimModifiers>): SimModifiers {
  const out: SimModifiers = { ...emptyMods(), ...a, dmgMult: { ...a.dmgMult }, costPct: { ...a.costPct } };
  for (const [k, v] of Object.entries(b.dmgMult ?? {})) out.dmgMult[k] = (out.dmgMult[k] ?? 1) * v;
  for (const [k, v] of Object.entries(b.costPct ?? {})) out.costPct[k] = (out.costPct[k] ?? 0) + v;
  out.statMult *= b.statMult ?? 1;
  out.maxMana += b.maxMana ?? 0;
  out.armorReduction += b.armorReduction ?? 0;
  out.weaponDamage += b.weaponDamage ?? 0;
  out.hastePct += b.hastePct ?? 0;
  out.staminaMult *= b.staminaMult ?? 1;
  out.maxHealth += b.maxHealth ?? 0;
  return out;
}
