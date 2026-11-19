import { ENCHANTS, parseEnchantText, type EnchantRef } from './buffs';
import { api, iconName, localized, parseBlizzardItem, type BlizzardItem, type BlizzardWeapon, type LocalizedValue } from './blizzard';
import type { ClassModule } from './classes';
import type { Localized, Stats, WeaponInfo } from './types';
import { fetchItem } from './wowhead';

// Import d'un personnage WoW Forever depuis l'API Blizzard (profil public).
// Forever n'a pas de royaume : un personnage s'identifie par « nom-surnom » (ex. judgement-judy).

/** Accepte « Nom Surnom », « nom-surnom » ou un lien d'armurerie, et renvoie le slug de l'API. */
export function characterSlug(input: string): string {
  let s = input.trim();
  const url = /character\/(?:[^/?#]+\/)*([^/?#]+)\/?(?:[?#].*)?$/.exec(s);
  if (url) s = decodeURIComponent(url[1]);
  return s.toLocaleLowerCase('fr').replace(/\s+/g, '-');
}

/** Emplacements Blizzard → emplacements de l'app (la chemise et le tabard sont ignorés). */
const SLOT_MAP: Record<string, string> = {
  HEAD: 'head', NECK: 'neck', SHOULDER: 'shoulders', BACK: 'back', CHEST: 'chest', WRIST: 'wrist', HANDS: 'hands',
  WAIST: 'waist', LEGS: 'legs', FEET: 'feet', FINGER_1: 'finger1', FINGER_2: 'finger2', TRINKET_1: 'trinket1',
  TRINKET_2: 'trinket2', MAIN_HAND: 'mainHand', OFF_HAND: 'offHand', RANGED: 'ranged',
};
const family = (slot: string) => slot.replace(/[12]$/, '');

/** Même règle que le script de données : « Improved Shadow Bolt » → improvedShadowBolt. */
export const talentKey = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join('');

interface EquippedItem extends Omit<BlizzardItem, 'level' | 'id'> {
  item: { id: number };
  slot: { type: string };
  level?: { value: number };
  stats?: NonNullable<BlizzardItem['preview_item']>['stats'];
  spells?: NonNullable<BlizzardItem['preview_item']>['spells'];
  set?: NonNullable<BlizzardItem['preview_item']>['set'];
  armor?: { value: number };
  weapon?: BlizzardWeapon;
  item_subclass?: { name?: LocalizedValue };
  enchantments?: {
    display_string?: LocalizedValue;
    source_item?: { id: number; name?: LocalizedValue };
    enchantment_slot?: { type: string };
  }[];
}

interface Profile {
  name: string;
  surname?: string;
  level: number;
  character_class?: { id: number; name: LocalizedValue };
}

interface Specializations {
  specialization_groups?: {
    is_active?: boolean;
    specializations?: { talents?: { talent: { name: LocalizedValue }; talent_rank: number }[] }[];
  }[];
}

export interface ImportedItem {
  slot: string; // emplacement de l'app (finger1, mainHand…)
  id: number;
  name: Localized;
  icon: string;
  quality: number;
  itemLevel: number | null;
  stats: Stats;
  set: ReturnType<typeof parseBlizzardItem>['set'];
  weapon: WeaponInfo | null;
  enchant: EnchantRef | null;
}

export interface ImportedCharacter {
  slug: string;
  name: string;
  level: number;
  className: Localized;
  /** Le personnage est de la classe affichée : ses talents peuvent être repris. */
  sameClass: boolean;
  items: ImportedItem[];
  talents: Record<string, number>;
  unknownTalents: string[];
}


/** Enchantement : objet du catalogue si on le reconnaît, sinon ses stats lues dans le texte. */
export function matchEnchant(e: NonNullable<EquippedItem['enchantments']>[number], slot: string): EnchantRef | null {
  const fam = family(slot);
  const bySource = ENCHANTS.find((x) => x.slot === fam && x.wowhead.type === 'item' && x.wowhead.id === e.source_item?.id);
  if (bySource) return bySource.id;
  const text = localized(e.display_string);
  const stats = parseEnchantText(text.en);
  if (!Object.keys(stats).length) return null; // armure, vitesse… : rien d'utile au DPS
  const same = ENCHANTS.find(
    (x) => x.slot === fam && Object.keys({ ...x.stats, ...stats }).every((k) => (x.stats[k as keyof Stats] ?? 0) === (stats[k as keyof Stats] ?? 0)),
  );
  if (same) return same.id;
  const strip = (s: string) => s.replace(/^(Enchanted|Enchanté)\s*:\s*/i, '');
  return { name: { en: strip(text.en), fr: strip(text.fr) }, stats };
}

export async function fetchCharacter(input: string, cls: ClassModule): Promise<ImportedCharacter> {
  const slug = characterSlug(input);
  const base = `/profile/wow/character/${encodeURIComponent(slug)}`;
  const [profile, equipment, specs] = await Promise.all([
    api<Profile>(base),
    api<{ equipped_items?: EquippedItem[] }>(`${base}/equipment`),
    api<Specializations>(`${base}/specializations`).catch(() => ({}) as Specializations),
  ]);

  const items = await Promise.all(
    (equipment.equipped_items ?? [])
      .filter((e) => SLOT_MAP[e.slot.type])
      .map(async (e): Promise<ImportedItem> => {
        const slot = SLOT_MAP[e.slot.type];
        // L'équipement contient déjà les stats : pas besoin de la base d'objets (où il manque beaucoup d'objets Forever).
        const parsed = parseBlizzardItem({
          id: e.item.id,
          name: e.name,
          quality: e.quality,
          level: e.level?.value,
          inventory_type: e.inventory_type,
          preview_item: { stats: e.stats, spells: e.spells, set: e.set, armor: e.armor, weapon: e.weapon },
        });
        let icon = await iconName(e.media?.id ?? e.item.id);
        // Bouclier : le blocage de base n'est utilisable que dans l'infobulle Wowhead.
        const isShield = /^(Shield|Bouclier)$/i.test(localized(e.item_subclass?.name).en);
        if (!icon || isShield) {
          const wh = await fetchItem(e.item.id).catch(() => null);
          if (!icon) icon = wh?.icon ?? '';
          if (isShield && wh?.shieldBlock) parsed.stats.blockValue += wh.shieldBlock;
        }
        const permanent = (e.enchantments ?? []).filter((x) => x.enchantment_slot?.type !== 'TEMPORARY');
        const enchant = permanent.map((x) => matchEnchant(x, slot)).find(Boolean) ?? null;
        return {
          slot, id: e.item.id, name: parsed.name, icon, quality: parsed.quality, itemLevel: parsed.itemLevel,
          stats: parsed.stats, set: parsed.set, weapon: parsed.weapon, enchant,
        };
      }),
  );

  const sameClass = profile.character_class?.id === cls.blizzardClassId;
  const talents: Record<string, number> = {};
  const unknownTalents: string[] = [];
  const group = specs.specialization_groups?.find((g) => g.is_active) ?? specs.specialization_groups?.[0];
  for (const spec of group?.specializations ?? []) {
    for (const t of spec.talents ?? []) {
      const name = localized(t.talent.name).en;
      const key = talentKey(name);
      const def = cls.data.byKey.get(key);
      if (def) talents[key] = Math.min(t.talent_rank, def.maxRank);
      else unknownTalents.push(name);
    }
  }

  return {
    slug,
    name: [profile.name, profile.surname].filter(Boolean).join(' '),
    level: profile.level,
    className: localized(profile.character_class?.name),
    sameClass,
    items,
    talents: sameClass ? talents : {},
    unknownTalents: sameClass ? unknownTalents : [],
  };
}
