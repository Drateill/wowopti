import type { ClassId } from '../data/classes';
import { fetchItem } from '../data/wowhead';
import type { AppState, Item, ProfileData, SlotId } from './store';

// Lien de partage d'une configuration complète : talents, objets portés, enchantements,
// consommables, rotation, buffs. Les objets Wowhead sont envoyés par numéro, les objets
// personnalisés en entier. Le tout est compressé puis encodé en base64 (URL).

type SharedItem = number | Item;

interface Payload {
  v: 1;
  c?: ClassId; // absent dans les liens d'avant le paladin : démoniste
  d: Omit<ProfileData, 'equipped'>;
  e: Partial<Record<SlotId, number>>; // emplacement → index dans `i`
  i: SharedItem[];
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeProfile(data: ProfileData, items: Item[], classId: ClassId = 'warlock'): Promise<string> {
  const { equipped, ...rest } = data;
  const list: SharedItem[] = [];
  const e: Payload['e'] = {};
  for (const [slot, id] of Object.entries(equipped) as [SlotId, string][]) {
    const item = items.find((i) => i.id === id);
    if (!item) continue;
    e[slot] = list.length;
    list.push(item.wowheadId ?? item);
  }
  const payload: Payload = { v: 1, c: classId, d: rest, e, i: list };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  return toB64(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeProfile(
  code: string,
): Promise<{ classId: ClassId; data: Omit<ProfileData, 'equipped'>; equipped: Partial<Record<SlotId, SharedItem>> }> {
  const json = new TextDecoder().decode(await pipe(fromB64(code), new DecompressionStream('deflate-raw')));
  const p = JSON.parse(json) as Payload;
  if (p.v !== 1) throw new Error('version');
  const equipped: Partial<Record<SlotId, SharedItem>> = {};
  for (const [slot, idx] of Object.entries(p.e) as [SlotId, number][]) if (p.i[idx] !== undefined) equipped[slot] = p.i[idx];
  return { classId: p.c ?? 'warlock', data: p.d, equipped };
}

/**
 * Applique une configuration partagée : les objets absents de la bibliothèque sont
 * téléchargés depuis Wowhead. Renvoie le nouvel état partiel (objets + profil).
 */
export async function importShared(code: string, state: AppState): Promise<Partial<AppState>> {
  const { data, equipped: shared } = await decodeProfile(code);
  const items = [...state.items];
  const equipped: Partial<Record<SlotId, string>> = {};
  for (const [slot, ref] of Object.entries(shared) as [SlotId, SharedItem][]) {
    if (typeof ref === 'number') {
      let item = items.find((i) => i.wowheadId === ref);
      if (!item) {
        const w = await fetchItem(ref);
        if (!w.slot) continue;
        item = {
          id: `wh-${ref}`, wowheadId: ref, name: w.name, icon: w.icon, quality: w.quality, itemLevel: w.itemLevel ?? undefined,
          slot: w.slot, stats: w.stats, set: w.set, weapon: w.weapon,
        };
        items.push(item);
      }
      equipped[slot] = item.id;
    } else {
      const same = items.find((i) => i.id === ref.id);
      if (!same) items.push(ref);
      equipped[slot] = ref.id;
    }
  }
  return { ...data, equipped, items };
}
