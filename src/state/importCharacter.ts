import type { EnchantRef } from '../data/buffs';
import type { ImportedCharacter, ImportedItem } from '../data/character';
import { CLASS_BY_ID } from '../data/classes';
import { emptyStats } from '../data/types';
import { isValid } from '../engine/talents';
import { profileOf, specPresets, type AppState, type Item, type SlotId } from './store';
import { pointsInTree } from '../engine/talents';

/** Ajoute (ou remplace) l'objet importé dans la bibliothèque et le renvoie. */
function upsert(items: Item[], imp: ImportedItem): Item {
  const item: Item = {
    id: `wh-${imp.id}`,
    wowheadId: imp.id,
    name: imp.name,
    icon: imp.icon || undefined,
    quality: imp.quality,
    itemLevel: imp.itemLevel ?? undefined,
    slot: imp.slot.replace(/[12]$/, ''),
    stats: imp.stats,
    set: imp.set,
    weapon: imp.weapon,
  };
  const i = items.findIndex((x) => x.id === item.id);
  if (i >= 0) items[i] = { ...items[i], ...item, icon: item.icon ?? items[i].icon, set: item.set ?? items[i].set };
  else items.push(item);
  return items[i >= 0 ? i : items.length - 1];
}

const sameEnchant = (a: EnchantRef | undefined | null, b: EnchantRef | undefined | null) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Mise à jour d'un personnage déjà importé : seuls les emplacements dont l'objet ou l'enchantement
 * a changé sont repris. Talents, buffs et réglages restent tels quels. Si quelque chose change,
 * la configuration précédente est gardée dans un profil.
 */
export function refreshCharacter(state: AppState, char: ImportedCharacter, backupName: string): { patch: Partial<AppState>; changed: SlotId[] } {
  const items = [...state.items];
  const equipped = { ...state.equipped };
  const enchants = { ...state.enchants };
  const changed: SlotId[] = [];
  const seen = new Set<string>();
  for (const imp of char.items) {
    const slot = imp.slot as SlotId;
    seen.add(slot);
    if (equipped[slot] === `wh-${imp.id}` && sameEnchant(enchants[slot], imp.enchant)) continue;
    const item = upsert(items, imp);
    equipped[slot] = item.id;
    if (imp.enchant) enchants[slot] = imp.enchant;
    else delete enchants[slot];
    changed.push(slot);
  }
  // Emplacements vidés en jeu (objet retiré).
  for (const slot of Object.keys(equipped) as SlotId[]) {
    if (!seen.has(slot) && equipped[slot]?.startsWith('wh-')) {
      delete equipped[slot];
      delete enchants[slot];
      changed.push(slot);
    }
  }
  const character = { slug: char.slug, name: char.name };
  if (!changed.length) return { patch: { character }, changed };
  const backup = { id: `p-${Date.now().toString(36)}`, name: backupName, data: profileOf(state) };
  return { patch: { items, equipped, enchants, profiles: [...state.profiles, backup], character, weights: null }, changed };
}

/**
 * Applique un personnage importé : ses objets entrent dans la bibliothèque (la version du
 * personnage remplace une ancienne copie du même objet), l'équipement et les enchantements
 * sont remplacés, et les talents aussi s'ils sont valides. La configuration précédente
 * est gardée dans un profil.
 */
export function applyCharacter(state: AppState, char: ImportedCharacter, backupName: string): { patch: Partial<AppState>; talentsApplied: boolean } {
  const items = [...state.items];
  const equipped: Partial<Record<SlotId, string>> = {};
  const enchants: Partial<Record<SlotId, EnchantRef>> = {};
  for (const imp of char.items) {
    const item = upsert(items, imp);
    equipped[imp.slot as SlotId] = item.id;
    if (imp.enchant) enchants[imp.slot as SlotId] = imp.enchant;
  }
  const cls = CLASS_BY_ID[state.classId];
  const talentsApplied = char.sameClass && Object.keys(char.talents).length > 0 && isValid(char.talents, cls.talents);
  // Spécialisation : celle de l'arbre où le personnage a mis le plus de points.
  let specPatch: Partial<AppState> = {};
  if (talentsApplied && cls.specs.length > 1) {
    const counts = cls.trees.map((_, i) => pointsInTree(char.talents, cls.talents, i));
    const main = counts.indexOf(Math.max(...counts));
    const current = cls.specs.find((s) => s.id === state.spec);
    const next = cls.specs.find((s) => s.tree === main);
    if (next && current?.tree !== main) specPatch = { spec: next.id, ...specPresets(next.id, state) };
  }
  const backup = { id: `p-${Date.now().toString(36)}`, name: backupName, data: profileOf(state) };
  return {
    patch: {
      items,
      equipped,
      enchants,
      // Les bonus divers par défaut remplaçaient l'équipement : avec le vrai équipement, on les remet à zéro.
      extraStats: emptyStats(),
      ...(talentsApplied ? { talents: char.talents } : {}),
      profiles: [...state.profiles, backup],
      character: { slug: char.slug, name: char.name },
      ...specPatch,
      weights: null,
    },
    talentsApplied,
  };
}
