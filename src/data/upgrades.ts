// Recherche d'améliorations : objets de niveau 55 à 60 (rares et épiques) de l'API Blizzard Forever
// pour un emplacement, filtrés selon ce que la classe peut porter. Beaucoup d'objets propres à Forever
// manquent encore dans l'API : la liste n'est pas exhaustive.
import { api, fetchItemBlizzard, NotInBlizzardApi } from './blizzard';
import type { ClassId } from './classes';
import type { Item, SlotId } from '../state/store';
import { fetchItem } from './wowhead';

/** Types d'emplacement de l'API pour chaque emplacement de l'app. */
const SLOT_TYPES: Record<SlotId, string[]> = {
  head: ['HEAD'], neck: ['NECK'], shoulders: ['SHOULDER'], back: ['CLOAK'], chest: ['CHEST', 'ROBE'], wrist: ['WRIST'],
  hands: ['HAND'], waist: ['WAIST'], legs: ['LEGS'], feet: ['FEET'], finger1: ['FINGER'], finger2: ['FINGER'],
  trinket1: ['TRINKET'], trinket2: ['TRINKET'], mainHand: ['WEAPON', 'TWOHWEAPON', 'WEAPONMAINHAND'],
  offHand: ['WEAPON', 'WEAPONOFFHAND', 'HOLDABLE', 'SHIELD'], ranged: ['RANGED', 'RANGEDRIGHT', 'THROWN'],
};

const ONE_HAND = new Set(['WEAPON', 'WEAPONMAINHAND', 'WEAPONOFFHAND']);

const ARMOR: Record<ClassId, string[]> = {
  warlock: ['Cloth'], mage: ['Cloth'], priest: ['Cloth'],
  druid: ['Cloth', 'Leather'], rogue: ['Cloth', 'Leather'],
  hunter: ['Cloth', 'Leather', 'Mail'], shaman: ['Cloth', 'Leather', 'Mail'],
  paladin: ['Cloth', 'Leather', 'Mail', 'Plate'], warrior: ['Cloth', 'Leather', 'Mail', 'Plate'],
};

/** Armes : « 1H:Type » (une main) et « 2H:Type » (deux mains), plus armes à distance et main gauche. */
const WEAPONS: Record<ClassId, string[]> = {
  warlock: ['1H:Dagger', '1H:Sword', '2H:Staff', 'Wand', 'Miscellaneous'],
  mage: ['1H:Dagger', '1H:Sword', '2H:Staff', 'Wand', 'Miscellaneous'],
  priest: ['1H:Dagger', '1H:Mace', '2H:Staff', 'Wand', 'Miscellaneous'],
  druid: ['1H:Dagger', '1H:Mace', '1H:Fist Weapon', '2H:Mace', '2H:Staff', '2H:Polearm', 'Miscellaneous'],
  hunter: ['1H:Axe', '1H:Sword', '1H:Dagger', '1H:Fist Weapon', '2H:Axe', '2H:Sword', '2H:Polearm', '2H:Staff', 'Bow', 'Gun', 'Crossbow', 'Thrown'],
  rogue: ['1H:Dagger', '1H:Sword', '1H:Mace', '1H:Fist Weapon', 'Bow', 'Gun', 'Crossbow', 'Thrown'],
  warrior: ['1H:Axe', '1H:Sword', '1H:Mace', '1H:Dagger', '1H:Fist Weapon', '2H:Axe', '2H:Sword', '2H:Mace', '2H:Polearm', '2H:Staff', 'Bow', 'Gun', 'Crossbow', 'Thrown', 'Shield'],
  paladin: ['1H:Axe', '1H:Sword', '1H:Mace', '2H:Axe', '2H:Sword', '2H:Mace', '2H:Polearm', 'Shield', 'Miscellaneous'],
  shaman: ['1H:Axe', '1H:Mace', '1H:Dagger', '1H:Fist Weapon', '2H:Axe', '2H:Mace', '2H:Staff', 'Shield', 'Miscellaneous'],
};

/** Classes qui peuvent porter une arme en main gauche. */
const DUAL_WIELD = new Set<ClassId>(['rogue', 'warrior', 'hunter']);

interface SearchRow {
  id: number;
  name: Record<string, string>;
  level?: number;
  quality?: { type: string };
  inventory_type?: { type: string };
  item_subclass?: { name?: Record<string, string> };
}

/** L'objet peut-il aller dans cet emplacement pour cette classe ? */
export function canUse(classId: ClassId, slot: SlotId, row: Pick<SearchRow, 'inventory_type' | 'item_subclass'>): boolean {
  const type = row.inventory_type?.type ?? '';
  const sub = row.item_subclass?.name?.en_US ?? '';
  if (!SLOT_TYPES[slot].includes(type)) return false;
  if (slot === 'offHand' && ONE_HAND.has(type) && !DUAL_WIELD.has(classId)) return false;
  if (slot === 'mainHand' && type === 'WEAPONOFFHAND') return false;
  if (ONE_HAND.has(type)) return WEAPONS[classId].includes(`1H:${sub}`);
  if (type === 'TWOHWEAPON') return WEAPONS[classId].includes(`2H:${sub}`);
  if (type === 'RANGED' || type === 'RANGEDRIGHT' || type === 'THROWN' || type === 'SHIELD' || type === 'HOLDABLE') return WEAPONS[classId].includes(sub);
  // Armure : cou, doigts, bijoux (« Miscellaneous ») et capes (« Cloth ») vont à tout le monde.
  if (sub === 'Miscellaneous') return true;
  return ARMOR[classId].includes(sub);
}

/** L'objet (type d'emplacement et sous-classe de l'API) peut-il être porté par la classe, à un emplacement quelconque ? */
export function usableBy(classId: ClassId, inventoryType: string, subclass: string): boolean {
  const row = { inventory_type: { type: inventoryType }, item_subclass: { name: { en_US: subclass } } };
  return (Object.keys(SLOT_TYPES) as SlotId[]).some((slot) => canUse(classId, slot, row));
}

/** Candidats pour un emplacement : les mieux classés par niveau d'objet, sans les objets de test. */
export async function searchCandidates(classId: ClassId, slot: SlotId, limit = 25): Promise<SearchRow[]> {
  const json = await api<{ results: { data: SearchRow }[] }>('/data/wow/search/item', {
    'inventory_type.type': SLOT_TYPES[slot].join('||'),
    required_level: '[55,60]',
    'quality.type': 'EPIC||RARE',
    orderby: 'level:desc',
    _pageSize: '100',
  });
  return json.results
    .map((r) => r.data)
    .filter((d) => !/^\[/.test(d.name.en_US ?? '') && canUse(classId, slot, d))
    .slice(0, limit);
}

/** Fiche complète d'un candidat (stats, arme, ensemble). Null si l'API ne la donne pas ou sans stats lisibles. */
export async function candidateItem(row: SearchRow): Promise<Item | null> {
  try {
    const data = await fetchItemBlizzard(row.id);
    if (!data.slot) return null;
    let stats = data.stats;
    // Le blocage de base d'un bouclier n'est lisible que dans l'infobulle Wowhead.
    if (row.inventory_type?.type === 'SHIELD') {
      const wh = await fetchItem(row.id).catch(() => null);
      if (wh?.shieldBlock) stats = { ...stats, blockValue: stats.blockValue + wh.shieldBlock };
    }
    // Objets à suffixe aléatoire (« du singe ») : stats absentes de la fiche, on les ignore.
    const hasStats = Object.entries(stats).some(([k, v]) => k !== 'armor' && v > 0);
    if (!hasStats && !data.weapon) return null;
    return {
      id: `wh-${row.id}`, wowheadId: row.id, name: data.name, icon: data.icon, quality: data.quality,
      itemLevel: data.itemLevel ?? undefined, slot: data.slot, stats, set: data.set, weapon: data.weapon,
    };
  } catch (e) {
    if (e instanceof NotInBlizzardApi) return null;
    throw e;
  }
}
