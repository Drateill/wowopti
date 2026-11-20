import { addEquipEffects, parseWeaponText } from './effects';
import { rateLimitError } from './rateLimit';
import { parseSetFromTooltip, type ItemSet } from './setBonus';
import { emptyStats, type Lang, type Localized, type Stats, type WeaponInfo } from './types';

export { addEquipEffects };

// Accès aux données publiques de Wowhead (base WoW Forever).
// - Recherche : passe par le proxy /wowhead de Vite (le site n'autorise pas les appels directs du navigateur).
// - Infobulles d'objets : appelées directement (CORS autorisé).

/** Accepte un nom d'icône (Wowhead) ou une URL complète (API Blizzard). */
export const iconUrl = (icon: string, size: 'small' | 'medium' | 'large' = 'medium') =>
  /^https?:\/\//.test(icon) ? icon : `https://wow.zamimg.com/images/wow/icons/${size}/${(icon || 'inv_misc_questionmark').toLowerCase()}.jpg`;

export const wowheadUrl = (type: 'item' | 'spell', id: number, lang: Lang) =>
  `https://www.wowhead.com/forever${lang === 'fr' ? '/fr' : ''}/${type}=${id}`;

const LOCALE_ID: Record<Lang, number> = { en: 0, fr: 2 };

export const QUALITY_COLORS = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000', '#e6cc80'];

export interface ItemSearchResult {
  id: number;
  name: string;
  icon: string;
  quality: number;
  description: string;
}

type RawResult = { type: number; id: number; name: string; icon?: string; quality?: number; pinDescription?: string };

async function rawSearch(query: string, lang: Lang): Promise<RawResult[]> {
  const path = `/wowhead/forever${lang === 'fr' ? '/fr' : ''}/search/suggestions-template?q=${encodeURIComponent(query)}`;
  const res = await fetch(path);
  if (res.status === 429) throw await rateLimitError(res);
  if (!res.ok) throw new Error(`Wowhead : ${res.status}`);
  return ((await res.json()) as { results: RawResult[] }).results ?? [];
}

export interface ItemSuggestion extends ItemSearchResult {
  itemLevel: number | null;
  category: string; // « Cape », « Tissu »…
}

const GEAR_ROOTS = new Set(['Armor', 'Weapons', 'Weapon', 'Armure', 'Armes', 'Arme']);
const suggestCache = new Map<string, Promise<ItemSuggestion[]>>();

/**
 * Suggestions pendant la frappe. On utilise toujours Wowhead : sa recherche accepte les mots
 * incomplets (« pèler » → « Pèlerine »), contrairement à l'API Blizzard. Seuls les objets
 * équipables sont gardés (pas les recettes ni les composants).
 */
export function suggestItems(query: string, lang: Lang, limit = 8): Promise<ItemSuggestion[]> {
  const key = `${lang}:${query.trim().toLowerCase()}`;
  const cached = suggestCache.get(key);
  if (cached) return cached;
  const run = (async () => {
    const lists = await Promise.all(
      lang === 'en' ? [rawSearch(query, 'en')] : [rawSearch(query, lang), rawSearch(query, 'en').catch(() => [])],
    );
    const seen = new Set<number>();
    const out: ItemSuggestion[] = [];
    for (const r of lists.flat() as (RawResult & { pinBreadcrumb?: string[]; pinFooterText?: string })[]) {
      if (r.type !== 3 || seen.has(r.id) || !GEAR_ROOTS.has(r.pinBreadcrumb?.[0] ?? '')) continue;
      seen.add(r.id);
      const ilvl = /(?:item level|niveau d.objet|objet de niveau) (\d+)/i.exec(r.pinDescription ?? '');
      out.push({
        id: r.id,
        name: r.name.replace(/^\[(.*)\]$/, '$1'),
        icon: r.icon ?? '',
        quality: r.quality ?? 1,
        description: r.pinDescription ?? '',
        itemLevel: ilvl ? Number(ilvl[1]) : null,
        category: r.pinFooterText ?? r.pinBreadcrumb?.[1] ?? '',
      });
      if (out.length >= limit) break;
    }
    return out;
  })();
  suggestCache.set(key, run);
  run.catch(() => suggestCache.delete(key)); // une erreur réseau ne reste pas en cache
  return run;
}

/**
 * Recherche d'objets. Beaucoup d'objets Forever ne sont pas encore traduits : en français on
 * cherche aussi en anglais, et quand seul un ensemble est trouvé (« Grande tenue de Gangrecoeur »),
 * on récupère son nom anglais pour lister ses pièces.
 */
export async function searchItems(query: string, lang: Lang): Promise<ItemSearchResult[]> {
  const lists = await Promise.all(lang === 'en' ? [rawSearch(query, 'en')] : [rawSearch(query, lang), rawSearch(query, 'en')]);
  const all = lists.flat();
  const sets = all.filter((r) => r.type === 4).slice(0, 3);
  for (const set of sets) {
    try {
      const res = await fetch(`https://nether.wowhead.com/forever/tooltip/item-set/${set.id}`);
      const enName = ((await res.json()) as { name?: string }).name ?? '';
      // « Felheart Raiment » → « Felheart » : les pièces partagent le premier mot.
      const key = enName.split(' ')[0];
      if (key.length >= 4) all.push(...(await rawSearch(key, 'en')).filter((r) => r.name.includes(key)));
    } catch {
      /* ensemble ignoré */
    }
  }
  const seen = new Set<number>();
  return all
    .filter((r) => r.type === 3 && !seen.has(r.id) && seen.add(r.id))
    .map((r) => ({ id: r.id, name: r.name, icon: r.icon ?? '', quality: r.quality ?? 1, description: r.pinDescription ?? '' }));
}

const SLOT_MAP: Record<string, string> = {
  Head: 'head',
  Neck: 'neck',
  Shoulder: 'shoulders',
  Back: 'back',
  Chest: 'chest',
  Robe: 'chest',
  Wrist: 'wrist',
  Hands: 'hands',
  Waist: 'waist',
  Legs: 'legs',
  Feet: 'feet',
  Finger: 'finger',
  Trinket: 'trinket',
  'Main Hand': 'mainHand',
  'One-Hand': 'mainHand',
  'Two-Hand': 'mainHand',
  'Off Hand': 'offHand',
  'Held In Off-hand': 'offHand',
  Ranged: 'ranged',
  Thrown: 'ranged',
};

const STAT_IDS: Record<number, keyof Stats> = { 3: 'agility', 4: 'strength', 5: 'intellect', 6: 'spirit', 7: 'stamina' };

/** Lit l'emplacement, les stats, l'arme et le blocage du bouclier dans une infobulle anglaise. */
export function parseItemTooltip(html: string): {
  slot: string | null;
  stats: Stats;
  itemLevel: number | null;
  weapon: WeaponInfo | null;
  shieldBlock: number;
  /** « <Random enchantment> » : les stats dépendent du suffixe (du hibou, de l'aigle…). */
  randomEnchant: boolean;
} {
  // Les bonus d'ensemble sont ignorés : on coupe avant la liste des pièces du set.
  const own = html.split('item-set=')[0];
  const stats = emptyStats();
  // Les résistances réutilisent les mêmes marqueurs (« +7 Arcane Resistance » est noté stat6) : on les écarte.
  for (const m of own.matchAll(/<!--stat(\d+)-->([+-]?\d+)( \w+ Resistance)?/g)) {
    const key = STAT_IDS[Number(m[1])];
    if (key && !m[3]) stats[key] += Number(m[2]);
  }
  const text = own.replace(/<!--[^>]*-->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  addEquipEffects(text, stats);
  const armor = /<!--amr-->([\d,]+) Armor/.exec(own);
  if (armor) stats.armor += Number(armor[1].replace(/,/g, ''));
  // Blocage de base d'un bouclier (« 55 Block »), en plus des bonus « +15 Block Value ».
  const block = /(?:^|>)\s*(\d+) Block\s*<br/.exec(own);
  const shieldBlock = block ? Number(block[1]) : 0;
  stats.blockValue += shieldBlock;

  const slotMatch = /<table width="100%"><tr><td>([^<]+)<\/td>/.exec(own);
  const slotName = slotMatch?.[1].trim() ?? '';
  const itemLevel = /Item Level (?:<!--ilvl-->)?(\d+)/.exec(own);
  const w = parseWeaponText(text);
  const weapon = w ? { ...w, twoHand: slotName === 'Two-Hand' } : null;
  if (weapon) stats.weaponDps = (weapon.min + weapon.max) / 2 / weapon.speed;
  return {
    slot: SLOT_MAP[slotName] ?? null,
    stats,
    itemLevel: itemLevel ? Number(itemLevel[1]) : null,
    weapon,
    shieldBlock,
    randomEnchant: /&lt;Random enchantment&gt;/.test(own),
  };
}

async function tooltip(id: number, lang: Lang) {
  const res = await fetch(`https://nether.wowhead.com/forever/tooltip/item/${id}?locale=${LOCALE_ID[lang]}`);
  if (!res.ok) throw new Error(res.status === 404 ? `item ${id} ?` : `Wowhead : ${res.status}`);
  return (await res.json()) as { name: string; icon: string; quality: number; tooltip: string };
}

/** Les noms non traduits sont renvoyés entre crochets : on garde alors le nom anglais. */
const cleanName = (name: string, fallback: string) => (/^\[.*\]$/.test(name) ? fallback : name);

/** Ensemble d'un objet, avec les bonus en anglais (pour le calcul) et en français (pour l'affichage). */
export function mergeSets(enHtml: string, frHtml: string | null): ItemSet | null {
  const en = parseSetFromTooltip(enHtml);
  if (!en) return null;
  const fr = frHtml ? parseSetFromTooltip(frHtml) : null;
  return {
    id: en.id,
    name: { en: en.name, fr: fr ? cleanName(fr.name, en.name) : en.name },
    bonuses: en.bonuses.map((b, i) => ({
      count: b.count,
      text: { en: b.text, fr: fr?.bonuses[i]?.count === b.count ? fr.bonuses[i].text : b.text },
    })),
  };
}

export async function fetchItem(id: number) {
  const [en, fr] = await Promise.all([tooltip(id, 'en'), tooltip(id, 'fr').catch(() => null)]);
  const parsed = parseItemTooltip(en.tooltip);
  const name: Localized = { en: en.name, fr: fr ? cleanName(fr.name, en.name) : en.name };
  return { id, name, icon: en.icon, quality: en.quality, ...parsed, set: mergeSets(en.tooltip, fr?.tooltip ?? null) };
}

/**
 * Valeurs de référence d'un objet à enchantement aléatoire : Wowhead calcule un suffixe donné pour cet objet
 * (« du hibou » = deux stats, « d'intelligence » = une stat) quand on lui passe son identifiant.
 */
export async function fetchSuffixScale(id: number): Promise<{ pair: number; single: number }> {
  const read = async (rand: number) => {
    const res = await fetch(`https://nether.wowhead.com/forever/tooltip/item/${id}?locale=0&rand=${rand}`);
    if (!res.ok) throw new Error(`Wowhead : ${res.status}`);
    const { tooltip } = (await res.json()) as { tooltip: string };
    return parseItemTooltip(tooltip).stats.intellect;
  };
  const [pair, single] = await Promise.all([read(-9), read(-19)]);
  return { pair, single };
}

/** Accepte un numéro ou un lien Wowhead (…/item=12345/…). */
export function parseItemRef(input: string): number | null {
  const m = /item=(\d+)/.exec(input) ?? /^\s*(\d+)\s*$/.exec(input);
  return m ? Number(m[1]) : null;
}

export type ItemSource = 'loot' | 'crafted' | 'quest' | 'vendor' | 'pvp';
export const ITEM_SOURCES: ItemSource[] = ['loot', 'crafted', 'quest', 'vendor', 'pvp'];

/**
 * Infos lues dans la description de recherche Wowhead (anglais ou français) :
 * provenance, niveau d'objet, et si un démoniste peut le porter (tissu, pas réservé à une autre classe).
 */
export function classifyResult(description: string) {
  const d = description.replace(/<[^>]+>/g, '');
  const sources = new Set<ItemSource>();
  if (/looted|dropped|dépouillé|butin/i.test(d)) sources.add('loot');
  if (/crafted|fabriqué/i.test(d)) sources.add('crafted');
  if (/quest reward|récompense de quête/i.test(d)) sources.add('quest');
  if (/sold by NPCs|vendu par des PNJ/i.test(d)) sources.add('vendor');
  if (/\bPvP\b|\bJcJ\b/i.test(d)) sources.add('pvp');
  const ilvl = /(?:item level|objet de niveau|niveau d.objet) (\d+)/i.exec(d);
  const wrongArmor = /\b(leather|mail|plate|shield|cuir|mailles|plaques|bouclier)\b/i.test(d);
  const cls = /(?:Requires|Nécessite) ([A-Za-zÀ-ÿ]+)\./.exec(d);
  const otherClass = !!cls && !/^(Warlock|Démoniste)$/i.test(cls[1]);
  // Recettes et commandes d'artisan : ce ne sont pas des objets à porter.
  const notGear = /\b(pattern|recipe|formula|plans|schematic|patron|recette|formule|schéma|commission)\b/i.test(d);
  return { sources, itemLevel: ilvl ? Number(ilvl[1]) : null, usable: !wrongArmor && !otherClass && !notGear };
}
