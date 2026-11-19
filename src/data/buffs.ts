import type { Localized, SimModifiers, Stats } from './types';

// Consommables, buffs, débuffs de la cible et enchantements.
// Valeurs relevées dans les infobulles Wowhead Forever (novembre 2026).

export type BuffKind = 'consumable' | 'raid' | 'world' | 'debuff';

export interface BuffDef {
  id: string;
  kind: BuffKind;
  /** Un seul effet actif par groupe (un flacon, un élixir de bataille, une nourriture…). */
  group?: string;
  name: Localized;
  icon: string;
  wowhead: { type: 'item' | 'spell'; id: number };
  stats?: Partial<Stats>;
  mods?: Partial<SimModifiers>;
  note?: Localized;
  /** Classes (« paladin ») ou spécialisations (« paladin:holy ») concernées. Absent : tout le monde. */
  for?: string[];
}

const magic10 = { 'school:shadow': 1.1, 'school:fire': 1.1, 'school:holy': 1.1, 'school:arcane': 1.1, 'school:nature': 1.1 };
const CASTER_DMG = ['warlock', 'mage', 'paladin:ret', 'paladin:prot', 'druid:balance'];
const MANA_USERS = ['warlock', 'mage', 'paladin', 'druid:balance', 'druid:resto'];
const CASTERS = ['warlock', 'mage', 'druid:balance'];
const HEALER = ['paladin:holy', 'druid:resto'];
const PAL_MELEE = ['paladin:ret', 'paladin:prot'];
const FERAL = ['druid:cat', 'druid:bear'];
const MELEE = [...PAL_MELEE, ...FERAL];
const TANK = ['paladin:prot', 'druid:bear'];

/** Le buff concerne-t-il cette classe et cette spécialisation ? */
export const buffVisible = (b: { for?: string[] }, classId: string, spec: string) =>
  !b.for || b.for.some((f) => f === classId || f === `${classId}:${spec}`);

export const BUFFS: BuffDef[] = [
  // Consommables
  { id: 'flaskSupreme', for: [...CASTER_DMG], kind: 'consumable', group: 'flask', name: { en: 'Flask of Supreme Power', fr: 'Flacon de pouvoir suprême' }, icon: 'inv_potion_41', wowhead: { type: 'item', id: 13512 }, stats: { spellPower: 150 } },
  { id: 'flaskWisdom', for: [...CASTERS, ...HEALER], kind: 'consumable', group: 'flask', name: { en: 'Flask of Distilled Wisdom', fr: 'Flacon de sagesse distillée' }, icon: 'inv_potion_97', wowhead: { type: 'item', id: 13511 }, mods: { maxMana: 2000 } },
  { id: 'greaterArcane', for: [...CASTER_DMG], kind: 'consumable', group: 'battleElixir', name: { en: 'Greater Arcane Elixir', fr: 'Elixir des arcanes supérieur' }, icon: 'inv_potion_109', wowhead: { type: 'item', id: 13454 }, stats: { spellPower: 35 } },
  { id: 'shadowPower', for: ['warlock'], kind: 'consumable', group: 'battleElixir', name: { en: 'Elixir of Shadow Power', fr: "Elixir de Puissance de l'ombre" }, icon: 'inv_potion_48', wowhead: { type: 'item', id: 9264 }, stats: { shadowPower: 40 } },
  { id: 'mageblood', for: [...CASTERS, ...HEALER], kind: 'consumable', group: 'guardianElixir', name: { en: 'Mageblood Elixir', fr: 'Elixir magesang' }, icon: 'inv_potion_137', wowhead: { type: 'item', id: 20007 }, stats: { mp5: 12 } },
  { id: 'wizardOil', for: [...CASTERS, ...HEALER, 'paladin:ret'], kind: 'consumable', group: 'weapon', name: { en: 'Brilliant Wizard Oil', fr: 'Huile de sorcier brillante' }, icon: 'inv_potion_105', wowhead: { type: 'item', id: 20749 }, stats: { spellPower: 36, critPct: 1 } },
  { id: 'manaOil', for: [...CASTERS, ...HEALER], kind: 'consumable', group: 'weapon', name: { en: 'Brilliant Mana Oil', fr: 'Huile de mana brillante' }, icon: 'inv_potion_100', wowhead: { type: 'item', id: 20748 }, stats: { mp5: 15 } },
  { id: 'nightfinSoup', for: [...CASTER_DMG], kind: 'consumable', group: 'food', name: { en: 'Nightfin Soup', fr: 'Soupe de lutjan nagenuit' }, icon: 'inv_drink_17', wowhead: { type: 'item', id: 13931 }, stats: { spellPower: 22 } },
  { id: 'runnTum', for: [...CASTERS, ...HEALER], kind: 'consumable', group: 'food', name: { en: 'Runn Tum Tuber Surprise', fr: 'Courante-surprise' }, icon: 'inv_misc_food_63', wowhead: { type: 'item', id: 18254 }, stats: { intellect: 15 } },

  // Buffs de raid
  { id: 'arcaneIntellect', for: [...MANA_USERS], kind: 'raid', name: { en: 'Arcane Intellect', fr: 'Intelligence des arcanes' }, icon: 'spell_holy_magicalsentry', wowhead: { type: 'spell', id: 10157 }, stats: { intellect: 31 } },
  { id: 'markOfTheWild', kind: 'raid', name: { en: 'Mark of the Wild', fr: 'Marque du fauve' }, icon: 'spell_nature_regeneration', wowhead: { type: 'spell', id: 9885 }, stats: { intellect: 16, spirit: 16, stamina: 16 } },
  { id: 'kings', kind: 'raid', name: { en: 'Blessing of Kings', fr: 'Bénédiction des rois' }, icon: 'spell_magic_magearmor', wowhead: { type: 'spell', id: 20217 }, mods: { statMult: 1.1 } },
  { id: 'manaSpring', for: [...MANA_USERS], kind: 'raid', name: { en: 'Mana Spring Totem', fr: 'Totem Fontaine de mana' }, icon: 'spell_nature_manaregentotem', wowhead: { type: 'spell', id: 10497 }, stats: { mp5: 25 } },

  // Buffs mondiaux
  { id: 'zandalar', kind: 'world', name: { en: 'Spirit of Zandalar', fr: 'Esprit des Zandalar' }, icon: 'ability_creature_poison_05', wowhead: { type: 'spell', id: 24425 }, mods: { statMult: 1.15 } },
  { id: 'songflower', kind: 'world', name: { en: 'Songflower Serenade', fr: 'Sérénade de fleur-de-chant' }, icon: 'spell_holy_mindvision', wowhead: { type: 'spell', id: 15366 }, stats: { critPct: 5, intellect: 15, spirit: 15, stamina: 15 } },
  {
    id: 'rallyingCry', kind: 'world', name: { en: 'Rallying Cry of the Dragonslayer', fr: 'Cri de ralliement du tueur de dragon' }, icon: 'inv_misc_head_dragon_01',
    wowhead: { type: 'spell', id: 22888 }, stats: { critPct: 10, spellPower: 80 },
    note: { en: 'No effect inside raid instances in Forever.', fr: 'Sans effet en instance de raid dans Forever.' },
  },

  // Débuffs sur la cible
  {
    id: 'curseOfElements', for: [...CASTERS, ...PAL_MELEE], kind: 'debuff', name: { en: 'Curse of the Elements', fr: 'Malédiction des éléments' }, icon: 'warlock_curse_shadow',
    wowhead: { type: 'spell', id: 1311680 }, mods: { dmgMult: magic10 },
    note: { en: 'Kept up by another warlock (+10% magic damage: shadow, fire, holy).', fr: 'Maintenue par un autre démoniste (+10 % de dégâts magiques : ombre, feu, sacré).' },
  },
];

// Paladin (corps à corps, soins, tank). Valeurs Forever relevées sur Wowhead.
BUFFS.push(
  { id: 'mongoose', for: MELEE, kind: 'consumable', group: 'battleElixir', name: { en: 'Elixir of the Mongoose', fr: 'Elixir de la Mangouste' }, icon: 'inv_potion_32', wowhead: { type: 'item', id: 13452 }, stats: { agility: 25, critPct: 2 } },
  { id: 'greaterStrength', for: MELEE, kind: 'consumable', group: 'strength', name: { en: 'Elixir of Greater Strength', fr: 'Élixir de Force supérieure' }, icon: 'inv_potion_59', wowhead: { type: 'item', id: 9206 }, stats: { strength: 25 } },
  { id: 'jujuPower', for: MELEE, kind: 'consumable', group: 'strength', name: { en: 'Juju Power', fr: 'Pouvoir de Juju' }, icon: 'inv_misc_monsterscales_11', wowhead: { type: 'item', id: 12451 }, stats: { strength: 30 } },
  { id: 'jujuMight', for: MELEE, kind: 'consumable', group: 'attackPower', name: { en: 'Juju Might', fr: 'Puissance de Juju' }, icon: 'inv_misc_monsterscales_07', wowhead: { type: 'item', id: 12460 }, stats: { attackPower: 40 } },
  { id: 'firewater', for: MELEE, kind: 'consumable', group: 'attackPower', name: { en: 'Winterfall Firewater', fr: 'Eau de feu des Tombe-hiver' }, icon: 'inv_potion_92', wowhead: { type: 'item', id: 12820 }, stats: { attackPower: 35 } },
  { id: 'dumplings', for: MELEE, kind: 'consumable', group: 'food', name: { en: 'Smoked Desert Dumplings', fr: 'Boulettes fumées du désert' }, icon: 'inv_misc_food_64', wowhead: { type: 'item', id: 20452 }, stats: { strength: 20 } },
  { id: 'grilledSquid', for: MELEE, kind: 'consumable', group: 'food', name: { en: 'Grilled Squid', fr: 'Calmar grillé' }, icon: 'inv_misc_fish_13', wowhead: { type: 'item', id: 13928 }, stats: { critPct: 1 } },
  { id: 'sunfruit', for: MELEE, kind: 'consumable', group: 'food', name: { en: 'Blessed Sunfruit', fr: 'Fruit solaire béni' }, icon: 'inv_misc_food_41', wowhead: { type: 'item', id: 13810 }, stats: { strength: 10 } },
  { id: 'elementalStone', for: PAL_MELEE, kind: 'consumable', group: 'weapon', name: { en: 'Elemental Sharpening Stone', fr: 'Pierre à aiguiser élémentaire' }, icon: 'inv_stone_02', wowhead: { type: 'item', id: 18262 }, stats: { critPct: 2 } },
  { id: 'denseStone', for: PAL_MELEE, kind: 'consumable', group: 'weapon', name: { en: 'Dense Sharpening Stone', fr: 'Pierre à aiguiser dense' }, icon: 'inv_stone_sharpeningstone_05', wowhead: { type: 'item', id: 12404 }, mods: { weaponDamage: 8 } },
  { id: 'flaskTitans', for: TANK, kind: 'consumable', group: 'flask', name: { en: 'Flask of the Titans', fr: 'Flacon des Titans' }, icon: 'inv_potion_62', wowhead: { type: 'item', id: 13510 }, mods: { maxHealth: 1200 } },
  { id: 'greaterDefense', for: TANK, kind: 'consumable', group: 'guardianElixir', name: { en: 'Elixir of Greater Defense', fr: 'Élixir de défense supérieure' }, icon: 'inv_potion_66', wowhead: { type: 'item', id: 13445 }, stats: { armor: 450 } },
  { id: 'rumsey', for: TANK, kind: 'consumable', group: 'drink', name: { en: 'Rumsey Rum Black Label', fr: 'Rhum de Rumsey label noir' }, icon: 'inv_drink_04', wowhead: { type: 'item', id: 21151 }, stats: { stamina: 15 } },

  { id: 'battleShout', for: MELEE, kind: 'raid', name: { en: 'Battle Shout', fr: 'Cri de guerre' }, icon: 'ability_warrior_battleshout', wowhead: { type: 'spell', id: 25289 }, stats: { attackPower: 140 } },
  { id: 'blessingOfMight', for: MELEE, kind: 'raid', group: 'blessingMight', name: { en: 'Blessing of Might', fr: 'Bénédiction de puissance' }, icon: 'spell_holy_fistofjustice', wowhead: { type: 'spell', id: 25291 }, stats: { attackPower: 133 } },
  { id: 'blessingOfWisdom', for: ['paladin', 'druid:balance', 'druid:resto'], kind: 'raid', name: { en: 'Blessing of Wisdom', fr: 'Bénédiction de sagesse' }, icon: 'spell_holy_sealofwisdom', wowhead: { type: 'spell', id: 25290 }, stats: { mp5: 40 } },
  {
    id: 'leaderOfThePack', for: PAL_MELEE, kind: 'raid', name: { en: 'Leader of the Pack', fr: 'Chef de la meute' }, icon: 'spell_nature_unyeildingstamina', wowhead: { type: 'spell', id: 24932 }, stats: { critPct: 3 },
    note: { en: '+3% crit (value from the Forever druid talent).', fr: '+3 % de critique (valeur du talent de druide Forever).' },
  },
  { id: 'strengthOfEarth', for: MELEE, kind: 'raid', name: { en: 'Strength of Earth Totem', fr: 'Totem de Force de la Terre' }, icon: 'spell_nature_earthbindtotem', wowhead: { type: 'spell', id: 25361 }, stats: { strength: 53 } },
  { id: 'fortitude', for: TANK, kind: 'raid', name: { en: 'Power Word: Fortitude', fr: 'Mot de pouvoir : Robustesse' }, icon: 'spell_holy_wordfortitude', wowhead: { type: 'spell', id: 10938 }, stats: { stamina: 70 } },

  { id: 'fengus', for: ['paladin', 'druid'], kind: 'world', name: { en: 'Fengus’ Ferocity', fr: 'Férocité de Fengus' }, icon: 'spell_nature_undyingstrength', wowhead: { type: 'spell', id: 22817 }, stats: { attackPower: 200, spellPower: 230 } },
  { id: 'moldar', for: TANK, kind: 'world', name: { en: 'Mol’dar’s Moxie', fr: 'Détermination de Mol’dar' }, icon: 'spell_nature_massteleport', wowhead: { type: 'spell', id: 22818 }, mods: { staminaMult: 1.15 } },
  {
    id: 'warchief', for: ['paladin', 'druid'], kind: 'world', name: { en: 'Warchief’s Blessing', fr: 'Bénédiction du chef de guerre' }, icon: 'spell_arcane_teleportorgrimmar', wowhead: { type: 'spell', id: 16609 },
    stats: { mp5: 10 }, mods: { hastePct: 15, maxHealth: 300 },
  },

  { id: 'sunderArmor', for: MELEE, kind: 'debuff', name: { en: 'Sunder Armor ×5', fr: 'Fracasser armure ×5' }, icon: 'ability_warrior_sunder', wowhead: { type: 'spell', id: 11597 }, mods: { armorReduction: 2250 } },
  { id: 'faerieFire', for: MELEE, kind: 'debuff', name: { en: 'Faerie Fire', fr: 'Lucioles' }, icon: 'spell_nature_faeriefire', wowhead: { type: 'spell', id: 9907 }, mods: { armorReduction: 505 } },
  { id: 'curseOfRecklessness', for: MELEE, kind: 'debuff', name: { en: 'Curse of Recklessness', fr: 'Malédiction de témérité' }, icon: 'spell_shadow_unholystrength', wowhead: { type: 'spell', id: 11717 }, mods: { armorReduction: 505 } },
);

export const BUFF_BY_ID = new Map(BUFFS.map((b) => [b.id, b]));

export interface EnchantDef {
  id: string;
  slot: string; // famille d'emplacement
  name: Localized;
  wowhead: { type: 'item' | 'spell'; id: number };
  stats: Partial<Stats>;
  mods?: Partial<SimModifiers>;
  for?: string[];
  note?: Localized;
}

export const ENCHANTS: EnchantDef[] = [
  { id: 'arcanumFocus', for: ['warlock', 'mage', 'paladin:holy', 'druid:balance', 'druid:resto'], slot: 'head', name: { en: 'Arcanum of Focus', fr: 'Arcanum de focalisation' }, wowhead: { type: 'item', id: 18330 }, stats: { spellPower: 8 } },
  { id: 'arcanumFocusLegs', for: ['warlock', 'mage', 'paladin:holy', 'druid:balance', 'druid:resto'], slot: 'legs', name: { en: 'Arcanum of Focus', fr: 'Arcanum de focalisation' }, wowhead: { type: 'item', id: 18330 }, stats: { spellPower: 8 } },
  { id: 'signetMojo', for: ['warlock', 'mage', 'paladin:holy', 'druid:balance', 'druid:resto'], slot: 'shoulders', name: { en: 'Zandalar Signet of Mojo', fr: 'Cachet de mojo zandalar' }, wowhead: { type: 'item', id: 20076 }, stats: { spellPower: 18 } },
  { id: 'powerScourge', for: ['warlock', 'mage', 'paladin:holy', 'druid:balance', 'druid:resto'], slot: 'shoulders', name: { en: 'Power of the Scourge', fr: 'Puissance du Fléau' }, wowhead: { type: 'item', id: 23545 }, stats: { spellPower: 15, critPct: 1 } },
  { id: 'chestStats', for: ['warlock', 'mage'], slot: 'chest', name: { en: 'Greater Stats', fr: 'Caractéristiques supérieures' }, wowhead: { type: 'spell', id: 20025 }, stats: { intellect: 4, spirit: 4, stamina: 4 } },
  { id: 'chestInt', for: ['warlock', 'mage', 'paladin:holy', 'druid:balance', 'druid:resto'], slot: 'chest', name: { en: 'Major Intellect', fr: 'Intelligence majeure' }, wowhead: { type: 'spell', id: 20028 }, stats: { intellect: 10 } },
  { id: 'wristInt', for: ['warlock', 'mage', 'paladin:holy', 'druid:balance', 'druid:resto'], slot: 'wrist', name: { en: 'Greater Intellect', fr: 'Intelligence supérieure' }, wowhead: { type: 'spell', id: 20008 }, stats: { intellect: 7 } },
  { id: 'glovesFire', for: ['warlock', 'mage:fire'], slot: 'hands', name: { en: 'Fire Power', fr: 'Puissance du feu' }, wowhead: { type: 'spell', id: 25078 }, stats: { firePower: 20 } },
  { id: 'weaponSp', for: ['warlock', 'mage', 'paladin:holy', 'druid:balance', 'druid:resto'], slot: 'mainHand', name: { en: 'Spell Power', fr: 'Puissance des sorts' }, wowhead: { type: 'spell', id: 22749 }, stats: { spellPower: 30 } },
  { id: 'weapon2hSp', for: ['warlock', 'mage', 'paladin:holy', 'druid:balance', 'druid:resto'], slot: 'mainHand', name: { en: '2H Mighty Spell Power', fr: '2M Puissance des sorts renforcée' }, wowhead: { type: 'spell', id: 1248607 }, stats: { spellPower: 55 } },
  { id: 'weaponInt', for: ['warlock', 'mage', 'paladin:holy', 'druid:balance', 'druid:resto'], slot: 'mainHand', name: { en: 'Mighty Intellect', fr: 'Intelligence renforcée' }, wowhead: { type: 'spell', id: 23804 }, stats: { intellect: 22 } },
];

ENCHANTS.push(
  { id: 'crusader', for: MELEE, slot: 'mainHand', name: { en: 'Crusader', fr: 'Croisé' }, wowhead: { type: 'spell', id: 20034 }, stats: { strength: 22 },
    note: { en: '+100 Strength for 15 s on proc: about 22 Strength on average (1 proc per minute assumed).', fr: '+100 Force pendant 15 s quand il se déclenche : environ 22 Force en moyenne (1 déclenchement par minute supposé).' } },
  { id: 'weapon2hAgi', for: MELEE, slot: 'mainHand', name: { en: '2H Agility', fr: '2M Agilité' }, wowhead: { type: 'spell', id: 27837 }, stats: { agility: 25 } },
  { id: 'weaponStr', for: MELEE, slot: 'mainHand', name: { en: 'Strength', fr: 'Force' }, wowhead: { type: 'spell', id: 23799 }, stats: { strength: 15 } },
  { id: 'weaponAgi', for: MELEE, slot: 'mainHand', name: { en: 'Agility', fr: 'Agilité' }, wowhead: { type: 'spell', id: 23800 }, stats: { agility: 15 } },
  { id: 'superiorStriking', for: MELEE, slot: 'mainHand', name: { en: 'Superior Striking', fr: 'Frappe excellente' }, wowhead: { type: 'spell', id: 20031 }, stats: {}, mods: { weaponDamage: 5 } },
  { id: 'glovesStr', for: MELEE, slot: 'hands', name: { en: 'Greater Strength', fr: 'Force supérieure' }, wowhead: { type: 'spell', id: 20013 }, stats: { strength: 10 } },
  { id: 'glovesHaste', for: ['paladin', 'druid'], slot: 'hands', name: { en: 'Minor Haste', fr: 'Hâte mineure' }, wowhead: { type: 'spell', id: 13948 }, stats: {}, mods: { hastePct: 1 } },
  { id: 'wristStr', for: MELEE, slot: 'wrist', name: { en: 'Superior Strength', fr: 'Force excellente' }, wowhead: { type: 'spell', id: 20010 }, stats: { strength: 9 } },
  { id: 'wristHealing', for: HEALER, slot: 'wrist', name: { en: 'Healing Power', fr: 'Pouvoir de guérison' }, wowhead: { type: 'spell', id: 23802 }, stats: { spellPower: 8, healingPower: 16 } },
  { id: 'wristDeflection', for: TANK, slot: 'wrist', name: { en: 'Deflection', fr: 'Déviation' }, wowhead: { type: 'spell', id: 13931 }, stats: { defense: 7 } },
  { id: 'presenceMight', for: TANK, slot: 'head', name: { en: 'Presence of Might', fr: 'Présence de la puissance' }, wowhead: { type: 'item', id: 19782 }, stats: { stamina: 10, defense: 7, blockValue: 15 } },
  { id: 'presenceMightLegs', for: TANK, slot: 'legs', name: { en: 'Presence of Might', fr: 'Présence de la puissance' }, wowhead: { type: 'item', id: 19782 }, stats: { stamina: 10, defense: 7, blockValue: 15 } },
  { id: 'syncretist', for: HEALER, slot: 'head', name: { en: 'Syncretist’s Sigil', fr: 'Signe du syncrétiste' }, wowhead: { type: 'item', id: 19783 }, stats: { stamina: 10, defense: 7, healingPower: 24 } },
  { id: 'syncretistLegs', for: HEALER, slot: 'legs', name: { en: 'Syncretist’s Sigil', fr: 'Signe du syncrétiste' }, wowhead: { type: 'item', id: 19783 }, stats: { stamina: 10, defense: 7, healingPower: 24 } },
  { id: 'resilienceScourge', for: HEALER, slot: 'shoulders', name: { en: 'Resilience of the Scourge', fr: 'Résistance du Fléau' }, wowhead: { type: 'item', id: 23547 }, stats: { healingPower: 31, mp5: 5 } },
  { id: 'signetSerenity', for: HEALER, slot: 'shoulders', name: { en: 'Zandalar Signet of Serenity', fr: 'Cachet de sérénité zandalar' }, wowhead: { type: 'item', id: 20078 }, stats: { healingPower: 33 } },
  { id: 'mightScourge', for: MELEE, slot: 'shoulders', name: { en: 'Might of the Scourge', fr: 'Pouvoir du Fléau' }, wowhead: { type: 'item', id: 23548 }, stats: { attackPower: 26, critPct: 1 } },
  { id: 'signetMight', for: MELEE, slot: 'shoulders', name: { en: 'Zandalar Signet of Might', fr: 'Cachet de puissance zandalar' }, wowhead: { type: 'item', id: 20077 }, stats: { attackPower: 30 } },
  { id: 'chestStatsPal', for: ['paladin', 'druid'], slot: 'chest', name: { en: 'Greater Stats', fr: 'Caractéristiques supérieures' }, wowhead: { type: 'spell', id: 20025 }, stats: { strength: 4, agility: 4, intellect: 4, spirit: 4, stamina: 4 } },
  { id: 'cloakDefense', for: TANK, slot: 'back', name: { en: 'Superior Defense', fr: 'Défense excellente' }, wowhead: { type: 'spell', id: 20015 }, stats: { armor: 70 } },
  { id: 'shieldStamina', for: ['paladin:prot'], slot: 'offHand', name: { en: 'Greater Stamina', fr: 'Endurance supérieure' }, wowhead: { type: 'spell', id: 20017 }, stats: { stamina: 9 } },
);

export const ENCHANT_BY_ID = new Map(ENCHANTS.map((e) => [e.id, e]));

/** Enchantement lu sur un personnage importé, absent du catalogue ci-dessus. */
export interface CustomEnchant {
  name: Localized;
  stats: Partial<Stats>;
}

/** Valeur d'un emplacement : id du catalogue, ou enchantement importé. */
export type EnchantRef = string | CustomEnchant;

export const enchantStats = (ref: EnchantRef | undefined, family: string): Partial<Stats> | null => {
  if (!ref) return null;
  if (typeof ref !== 'string') return ref.stats;
  const e = ENCHANT_BY_ID.get(ref);
  return e && e.slot === family ? e.stats : null;
};

export const enchantMods = (ref: EnchantRef | undefined, family: string): Partial<SimModifiers> | null => {
  if (!ref || typeof ref !== 'string') return null;
  const e = ENCHANT_BY_ID.get(ref);
  return e && e.slot === family ? (e.mods ?? null) : null;
};

const ENCHANT_LABELS: [RegExp, keyof Stats][] = [
  [/shadow (?:spell )?(?:damage|power)/i, 'shadowPower'],
  [/fire (?:spell )?(?:damage|power)/i, 'firePower'],
  [/spell (?:damage|power)|damage and healing|healing and (?:spell )?damage/i, 'spellPower'],
  [/intellect/i, 'intellect'],
  [/spirit/i, 'spirit'],
  [/stamina/i, 'stamina'],
  [/spell (?:critical|crit)|critical strike/i, 'critPct'],
  [/spell hit|hit/i, 'hitPct'],
  [/mana (?:every|per) 5|mana regen|mp5/i, 'mp5'],
];

/**
 * Stats d'un enchantement d'après son texte anglais Blizzard
 * (« Enchanted: Stamina +3 and Armor +24 », « +8 Spell Damage and Healing »…).
 * « All Stats » compte pour Intelligence, Esprit et Endurance.
 */
export function parseEnchantText(text: string): Partial<Stats> {
  const stats: Partial<Stats> = {};
  const add = (k: keyof Stats, v: number) => (stats[k] = (stats[k] ?? 0) + v);
  const body = text.replace(/^Enchanted:\s*/i, '');
  for (const part of body.split(/\s+and\s+|,\s*|\s*\/\s*/i)) {
    const n = /([+-]?\d+(?:\.\d+)?)\s*%?/.exec(part);
    if (!n) continue;
    const v = parseFloat(n[1]);
    if (/all (?:stats|attributes)/i.test(part)) {
      add('intellect', v);
      add('spirit', v);
      add('stamina', v);
      continue;
    }
    const label = ENCHANT_LABELS.find(([re]) => re.test(part));
    if (label) add(label[1], v);
  }
  return stats;
}
