import type { EnchantRef } from '../data/buffs';
import type { ImportedCharacter } from '../data/character';
import { CLASS_BY_ID } from '../data/classes';
import { emptyStats } from '../data/types';
import { isValid } from '../engine/talents';
import { druidPreset, magePreset, paladinPreset, warlockPreset, profileOf, type AppState, type Item, type SlotId } from './store';
import { pointsInTree } from '../engine/talents';

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
    if (next && current?.tree !== main) specPatch = { spec: next.id, pal: paladinPreset(next.id, state.pal), dru: druidPreset(next.id, state.dru), mage: magePreset(next.id, state.mage), ...warlockPreset(next.id, state.rotation, state.buffs) };
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
      ...specPatch,
      weights: null,
    },
    talentsApplied,
  };
}
