import type { Localized, Stats } from './types';

// Objets à enchantement aléatoire (« Écharpe … du hibou ») : Wowhead n'affiche que « <Enchantement aléatoire> »
// et ne publie pas la liste des suffixes possibles d'un objet. On propose les suffixes classiques, avec des valeurs
// pré-remplies d'après le niveau de l'objet ; le joueur les corrige au besoin d'après son infobulle en jeu.

export interface SuffixDef {
  key: string;
  name: Localized;
  /** Stats du suffixe et part de la valeur de référence : « pair » (deux stats), « single » (une stat). */
  stats: { stat: keyof Stats; base: 'pair' | 'single'; factor: number }[];
  /** Valeurs déduites par analogie (Wowhead ne sait pas les calculer) : à vérifier en jeu. */
  estimated?: boolean;
}

const pair = (stat: keyof Stats) => ({ stat, base: 'pair' as const, factor: 1 });
const single = (stat: keyof Stats, factor = 1) => ({ stat, base: 'single' as const, factor });

export const RANDOM_SUFFIXES: SuffixDef[] = [
  { key: 'owl', name: { en: 'of the Owl', fr: 'du hibou' }, stats: [pair('intellect'), pair('spirit')] },
  { key: 'eagle', name: { en: 'of the Eagle', fr: 'de l’aigle' }, stats: [pair('stamina'), pair('intellect')] },
  { key: 'whale', name: { en: 'of the Whale', fr: 'de la baleine' }, stats: [pair('stamina'), pair('spirit')] },
  { key: 'bear', name: { en: 'of the Bear', fr: 'de l’ours' }, stats: [pair('strength'), pair('stamina')] },
  { key: 'monkey', name: { en: 'of the Monkey', fr: 'du singe' }, stats: [pair('agility'), pair('stamina')] },
  { key: 'tiger', name: { en: 'of the Tiger', fr: 'du tigre' }, stats: [pair('agility'), pair('strength')] },
  { key: 'gorilla', name: { en: 'of the Gorilla', fr: 'du gorille' }, stats: [pair('intellect'), pair('strength')] },
  { key: 'falcon', name: { en: 'of the Falcon', fr: 'du faucon' }, stats: [pair('agility'), pair('intellect')] },
  { key: 'boar', name: { en: 'of the Boar', fr: 'du sanglier' }, stats: [pair('spirit'), pair('strength')] },
  { key: 'wolf', name: { en: 'of the Wolf', fr: 'du loup' }, stats: [pair('agility'), pair('spirit')] },
  { key: 'intellect', name: { en: 'of Intellect', fr: 'd’intelligence' }, stats: [single('intellect')] },
  { key: 'spirit', name: { en: 'of Spirit', fr: 'd’esprit' }, stats: [single('spirit')] },
  { key: 'stamina', name: { en: 'of Stamina', fr: 'd’endurance' }, stats: [single('stamina')] },
  { key: 'strength', name: { en: 'of Strength', fr: 'de force' }, stats: [single('strength')] },
  { key: 'agility', name: { en: 'of Agility', fr: 'd’agilité' }, stats: [single('agility')] },
  { key: 'power', name: { en: 'of Power', fr: 'de puissance' }, stats: [single('attackPower', 2)], estimated: true },
  { key: 'shadowWrath', name: { en: 'of Shadow Wrath', fr: 'du courroux de l’ombre' }, stats: [single('shadowPower', 0.75)], estimated: true },
  { key: 'fieryWrath', name: { en: 'of Fiery Wrath', fr: 'du courroux ardent' }, stats: [single('firePower', 0.75)], estimated: true },
  { key: 'sorcery', name: { en: 'of Sorcery', fr: 'de sorcellerie' }, stats: [single('stamina', 0.5), single('intellect', 0.5), single('spellPower', 0.4)], estimated: true },
  { key: 'healing', name: { en: 'of Healing', fr: 'de soins' }, stats: [single('healingPower', 1.3)], estimated: true },
];

/** Valeurs de référence d'un objet : stat d'un suffixe à deux stats (« du hibou ») et à une stat (« d'intelligence »). */
export interface SuffixScale {
  pair: number;
  single: number;
}

export function suffixStats(def: SuffixDef, scale: SuffixScale): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const s of def.stats) out[s.stat] = Math.max(1, Math.round((s.base === 'pair' ? scale.pair : scale.single) * s.factor));
  return out;
}
