import { emptyStats, type Lang, type Localized, type Stats, type WeaponInfo } from './types';
import type { ItemSet } from './setBonus';
import { rateLimitError } from './rateLimit';
import { addEquipEffects, type ItemSearchResult } from './wowhead';

// Client de l'API officielle Blizzard, via le proxy local /blizzard (voir server/blizzard.ts).

export interface BlizzardStatus {
  configured: boolean;
  ok?: boolean;
  region?: string;
  namespace?: string;
  error?: string;
}

export type LocalizedValue = string | Record<string, string> | undefined;

const BLIZZ_LOCALE: Record<Lang, string> = { en: 'en_US', fr: 'fr_FR' };

/** Sans paramètre locale, Blizzard renvoie un objet { en_US, fr_FR, ... }. */
const pick = (v: LocalizedValue, loc: string) => (typeof v === 'string' ? v : (v?.[loc] ?? v?.en_US ?? ''));
export const localized = (v: LocalizedValue): Localized => ({ en: pick(v, 'en_US'), fr: pick(v, 'fr_FR') || pick(v, 'en_US') });

const QUALITY: Record<string, number> = { POOR: 0, COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, ARTIFACT: 6 };

const SLOT: Record<string, string> = {
  HEAD: 'head', NECK: 'neck', SHOULDER: 'shoulders', CLOAK: 'back', CHEST: 'chest', ROBE: 'chest', WRIST: 'wrist',
  HAND: 'hands', WAIST: 'waist', LEGS: 'legs', FEET: 'feet', FINGER: 'finger', TRINKET: 'trinket',
  WEAPON: 'mainHand', TWOHWEAPON: 'mainHand', WEAPONMAINHAND: 'mainHand', WEAPONOFFHAND: 'offHand',
  HOLDABLE: 'offHand', SHIELD: 'offHand', RANGED: 'ranged', RANGEDRIGHT: 'ranged', THROWN: 'ranged',
};

/**
 * Stats typées de l'API Forever → stats de l'app. Plusieurs stats sont des scores, convertis en %
 * en croisant l'API et les infobulles Wowhead : toucher 10 = 1 %, critique 14 = 1 %, blocage 5 = 1 %,
 * esquive 12 = 1 %. La défense est donnée en points de compétence. Parade : pas d'objet trouvé pour
 * vérifier, 20 = 1 % est une hypothèse.
 * SPELL_HEALING_DONE est traité à part : sur un objet de soin, la part « dégâts » est déjà listée.
 */
const STAT_TYPES: Record<string, [keyof Stats, number]> = {
  INTELLECT: ['intellect', 1],
  SPIRIT: ['spirit', 1],
  STAMINA: ['stamina', 1],
  STRENGTH: ['strength', 1],
  AGILITY: ['agility', 1],
  ATTACK_POWER: ['attackPower', 1],
  SPELL_POWER: ['spellPower', 1],
  SPELL_DAMAGE_DONE: ['spellPower', 1],
  BONUS_STAT_SHADOW_DAMAGE_DONE: ['shadowPower', 1],
  BONUS_STAT_FIRE_DAMAGE_DONE: ['firePower', 1],
  HIT_RATING: ['hitPct', 1 / 10],
  CRIT_RATING: ['critPct', 1 / 14],
  MANA_REGENERATION: ['mp5', 1],
  DEFENSE_SKILL_RATING: ['defense', 1],
  BLOCK_RATING: ['blockPct', 1 / 5],
  BLOCK_VALUE: ['blockValue', 1],
  DODGE_RATING: ['dodgePct', 1 / 12],
  PARRY_RATING: ['parryPct', 1 / 20],
  EXTRA_ARMOR: ['armor', 1],
};

export async function api<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`/blizzard/api${path}?${new URLSearchParams(params)}`);
  if (res.status === 429) throw await rateLimitError(res);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error(body.error ?? body.detail ?? `Blizzard : ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function blizzardStatus(): Promise<BlizzardStatus> {
  try {
    const res = await fetch('/blizzard/status');
    return res.ok ? ((await res.json()) as BlizzardStatus) : { configured: false };
  } catch {
    return { configured: false };
  }
}

/** URL de l'icône (Blizzard la donne par numéro de fichier, pas par nom). */
export async function iconName(mediaId: number): Promise<string> {
  try {
    const media = await api<{ assets?: { key: string; value: string }[] }>(`/data/wow/media/item/${mediaId}`);
    return media.assets?.find((a) => a.key === 'icon')?.value ?? '';
  } catch {
    return '';
  }
}

interface SearchData {
  id: number;
  name: LocalizedValue;
  quality?: { type: string };
  level?: number;
  inventory_type?: { type: string };
  item_subclass?: { name?: LocalizedValue };
  media?: { id: number };
}

/** Résultat de recherche Blizzard : de quoi l'afficher, le filtrer par classe et par niveau. */
export interface BlizzardSearchResult extends ItemSearchResult {
  itemLevel: number | null;
  /** Type d'emplacement de l'API (HEAD, WEAPON, TWOHWEAPON…). */
  inventoryType: string;
  /** Sous-classe en anglais (« Cloth », « Sword »…), pour savoir qui peut le porter. */
  subclass: string;
  /** Sous-classe dans la langue affichée (« Tissu »…). */
  category: string;
}

const searchCache = new Map<string, Promise<SearchData[]>>();

/** Lignes brutes de la recherche, dans la langue demandée et en anglais (beaucoup d'objets Forever ne sont pas traduits). */
function searchRows(query: string, lang: Lang): Promise<SearchData[]> {
  const key = `${lang}:${query.trim().toLowerCase()}`;
  let run = searchCache.get(key);
  if (run) return run;
  const one = (loc: string) =>
    api<{ results: { data: SearchData }[] }>('/data/wow/search/item', { [`name.${loc}`]: query.trim(), orderby: 'level:desc', _pageSize: '100' }).then((j) =>
      j.results.map((r) => r.data),
    );
  run = (async () => {
    const lists = await Promise.all(lang === 'en' ? [one('en_US')] : [one(BLIZZ_LOCALE[lang]), one('en_US').catch(() => [])]);
    const seen = new Set<number>();
    return lists.flat().filter((d) => !seen.has(d.id) && !!seen.add(d.id));
  })();
  searchCache.set(key, run);
  run.catch(() => searchCache.delete(key)); // une erreur ne reste pas en cache
  return run;
}

/**
 * Recherche d'objets équipables dans l'API Blizzard. L'API cherche des mots entiers (« pèlerine »,
 * pas « pèler »), et il lui manque encore des objets propres à Forever. Les noms qui contiennent la
 * recherche entière passent en premier, puis les objets de plus haut niveau. Les icônes ne sont
 * demandées que pour les `icons` premiers résultats.
 */
export async function searchItemsBlizzard(query: string, lang: Lang, icons = 20): Promise<BlizzardSearchResult[]> {
  const loc = BLIZZ_LOCALE[lang];
  const q = query.trim().toLowerCase();
  const name = (d: SearchData) => (pick(d.name, loc) || pick(d.name, 'en_US')).replace(/^\[(.*)\]$/, '$1');
  const matches = (d: SearchData) => name(d).toLowerCase().includes(q) || pick(d.name, 'en_US').toLowerCase().includes(q);
  const results = (await searchRows(query, lang))
    .filter((d) => d.inventory_type && SLOT[d.inventory_type.type] && !/^\[/.test(pick(d.name, 'en_US')))
    .sort((a, b) => Number(!matches(a)) - Number(!matches(b)) || (b.level ?? 0) - (a.level ?? 0))
    .slice(0, 30);
  const iconNames = await Promise.all(results.slice(0, icons).map((d) => iconName(d.media?.id ?? d.id)));
  return results.map((d, i) => {
    const category = pick(d.item_subclass?.name, loc);
    return {
      id: d.id,
      name: name(d),
      icon: iconNames[i] ?? '',
      quality: QUALITY[d.quality?.type ?? 'COMMON'] ?? 1,
      description: [category, d.level ? `${lang === 'fr' ? 'objet de niveau' : 'item level'} ${d.level}` : ''].filter(Boolean).join(' · '),
      itemLevel: d.level ?? null,
      inventoryType: d.inventory_type!.type,
      subclass: pick(d.item_subclass?.name, 'en_US'),
      category,
    };
  });
}

export interface BlizzardItem {
  id: number;
  name: LocalizedValue;
  quality?: { type: string };
  level?: number;
  inventory_type?: { type: string };
  media?: { id: number };
  preview_item?: {
    stats?: { type?: { type: string }; value: number; is_negated?: boolean }[];
    spells?: { description?: LocalizedValue }[];
    set?: { item_set?: { id: number; name?: LocalizedValue }; effects?: { display_string?: LocalizedValue; required_count: number }[] };
    armor?: { value: number };
    weapon?: BlizzardWeapon;
  };
}

export interface BlizzardWeapon {
  damage?: { min_value: number; max_value: number };
  attack_speed?: { value: number }; // millisecondes
}

/** Convertit une fiche d'objet Blizzard en objet de l'app. */
export function parseBlizzardItem(item: BlizzardItem) {
  const stats = emptyStats();
  const p = item.preview_item;
  let heal = 0;
  let spellDmg = 0;
  for (const s of p?.stats ?? []) {
    if (!s.type || s.is_negated) continue; // certaines lignes (« toutes les résistances ») n'ont pas de type
    if (s.type.type === 'SPELL_HEALING_DONE') heal += s.value;
    if (s.type.type === 'SPELL_DAMAGE_DONE') spellDmg += s.value;
    const map = STAT_TYPES[s.type.type];
    if (map) stats[map[0]] += s.value * map[1];
  }
  // « Soins +23, dégâts +8 » : les 8 de dégâts soignent aussi, il reste 15 de soins en plus.
  if (heal) stats.healingPower += heal - spellDmg;
  const effects = (p?.spells ?? []).map((s) => pick(s.description, 'en_US')).join(' ');
  addEquipEffects(effects, stats);
  if (p?.armor?.value) stats.armor += p.armor.value; // le blocage du bouclier de l'API est inutilisable : Wowhead le complète
  const weapon = parseBlizzardWeapon(p?.weapon, item.inventory_type?.type);
  if (weapon) stats.weaponDps = (weapon.min + weapon.max) / 2 / weapon.speed;
  return {
    id: item.id,
    name: localized(item.name),
    quality: QUALITY[item.quality?.type ?? 'COMMON'] ?? 1,
    itemLevel: item.level ?? null,
    slot: item.inventory_type ? (SLOT[item.inventory_type.type] ?? null) : null,
    stats,
    set: parseBlizzardSet(item),
    weapon,
  };
}

export function parseBlizzardWeapon(w: BlizzardWeapon | undefined, inventoryType?: string): WeaponInfo | null {
  if (!w?.damage || !w.attack_speed) return null;
  return { min: w.damage.min_value, max: w.damage.max_value, speed: w.attack_speed.value / 1000, twoHand: inventoryType === 'TWOHWEAPON' };
}

/** Bonus d'ensemble de la fiche Blizzard (« (3) Set : » retiré du texte). */
function parseBlizzardSet(item: BlizzardItem): ItemSet | null {
  const set = item.preview_item?.set;
  if (!set?.item_set || !set.effects?.length) return null;
  const clean = (v: string) => v.replace(/^\(\d+\)\s*(?:Set|Ensemble)\s*:\s*/i, '').trim();
  return {
    id: set.item_set.id,
    name: localized(set.item_set.name),
    bonuses: set.effects.map((e) => {
      const text = localized(e.display_string);
      return { count: e.required_count, text: { en: clean(text.en), fr: clean(text.fr) } };
    }),
  };
}

export class NotInBlizzardApi extends Error {}

export async function fetchItemBlizzard(id: number) {
  let item: BlizzardItem;
  try {
    item = await api<BlizzardItem>(`/data/wow/item/${id}`);
  } catch (e) {
    // Beaucoup d'objets Forever manquent encore dans l'API : l'appelant se rabat alors sur Wowhead.
    if (/404|Not Found/i.test((e as Error).message)) throw new NotInBlizzardApi(String(id));
    throw e;
  }
  return { ...parseBlizzardItem(item), icon: await iconName(item.media?.id ?? id) };
}
