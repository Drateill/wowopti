import data from '../generated/warlock.json';
import { makeTalentData } from '../talentData';

// Les arbres viennent de Wowhead Forever (npm run fetch-data pour les mettre à jour).
// Ici on ne déclare que les couleurs et la liste des talents pris en compte par le simulateur.

export const SIMULATED_TALENTS = new Set([
  'improvedLifeTap', 'suppression', 'improvedCorruption', 'improvedBaneOfAgony', 'pandemic', 'malevolence',
  'nightfall', 'siphonLife', 'shadowMastery', 'wrack',
  'felVitality', 'demonicSacrifice', 'demonicKnowledge', 'masterDemonologist', 'demonicPact', 'decimation',
  'improvedShadowBolt', 'bane', 'cataclysm', 'aftermath', 'ruin', 'agonizingFlames', 'conflagrate',
  'fireAndBrimstone', 'shadowAndFlame', 'incinerate',
  'soulLink', 'amplifyCurse', 'soulSiphon', 'unholyPower', 'improvedImp',
]);

export const WARLOCK_DATA = makeTalentData(data, ['#7fbf4d', '#a66be0', '#e0743a'], SIMULATED_TALENTS, {
  impFirebolt: {
    id: 11763,
    icon: 'spell_fire_firebolt',
    name: { en: 'Firebolt (Imp)', fr: 'Éclair de feu (diablotin)' },
    tooltip: { en: 'Deals 45 to 50 Fire damage to a target.', fr: 'Inflige 45 à 50 points de dégâts de Feu à une cible.' },
  },
});

export const WARLOCK_TREES = WARLOCK_DATA.trees;
export const WARLOCK_TALENTS = WARLOCK_DATA.talents;
export const TALENT_BY_KEY = WARLOCK_DATA.byKey;
/**
 * Lit une valeur numérique dans la description anglaise d'un talent au rang donné.
 * Ex. talentValue('ruin', 5, /by (\d+)%/) → 100. Comme la valeur est lue dans les données,
 * un changement de Blizzard est pris en compte au prochain `npm run fetch-data`.
 */
export const talentValue = WARLOCK_DATA.talentValue;
export const SPELL_META = WARLOCK_DATA.spellMeta;
export const DATA_SOURCE = WARLOCK_DATA.dataSource;
