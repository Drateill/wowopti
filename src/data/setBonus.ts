import { emptyMods, emptyStats, type Localized, type SimModifiers, type Stats } from './types';
import { addEquipEffects } from './effects';

export interface SetBonus {
  count: number; // nombre de pièces requises
  text: Localized;
}

export interface ItemSet {
  id: number;
  name: Localized;
  bonuses: SetBonus[];
}

const SPELL_NAMES: Record<string, string> = {
  'shadow bolt': 'shadowBolt',
  corruption: 'corruption',
  immolate: 'immolate',
  'curse of agony': 'baneOfAgony',
  'bane of agony': 'baneOfAgony',
  'curse of doom': 'baneOfDoom',
  'bane of doom': 'baneOfDoom',
  'siphon life': 'siphonLife',
  'searing pain': 'searingPain',
  incinerate: 'incinerate',
  conflagrate: 'conflagrate',
  wrack: 'wrack',
};
const SPELL_RE = Object.keys(SPELL_NAMES).join('|');

/**
 * Lit l'effet d'un bonus d'ensemble (texte anglais). Renvoie les stats, les effets de sort
 * reconnus, et `simulated: false` si rien d'utile au DPS n'a été compris.
 */
export function parseSetBonus(text: string): { stats: Stats; mods: SimModifiers; simulated: boolean } {
  const stats = addEquipEffects(text, emptyStats());
  for (const m of text.matchAll(/\+(\d+) (Intellect|Spirit|Stamina)/g)) stats[m[2].toLowerCase() as 'intellect'] += Number(m[1]);
  const mods = emptyMods();
  let found = Object.values(stats).some((v) => v !== 0);

  const school = /Mana cost of (Shadow|Fire) spells reduced by (\d+)%/i.exec(text);
  if (school) {
    mods.costPct[`school:${school[1].toLowerCase()}`] = Number(school[2]);
    found = true;
  }
  const cost = new RegExp(`(?:Reduces the mana cost of (?:your )?(${SPELL_RE})(?: spells?)? by (\\d+)%)`, 'i').exec(text);
  if (cost) {
    mods.costPct[SPELL_NAMES[cost[1].toLowerCase()]] = Number(cost[2]);
    found = true;
  }
  // « Increases damage caused by your Corruption by 12% » ou « 5% increased damage on your Immolate spell ».
  const d1 = new RegExp(`Increases (?:the )?damage (?:caused by|done by|of) (?:your )?(${SPELL_RE})(?: spells?)? by (\\d+)%`, 'i').exec(text);
  const d2 = d1 ? null : new RegExp(`(\\d+)% increased damage (?:on|to) your (${SPELL_RE})`, 'i').exec(text);
  const dmg = d1 ? { spell: d1[1], pct: d1[2] } : d2 ? { spell: d2[2], pct: d2[1] } : null;
  if (dmg) {
    mods.dmgMult[SPELL_NAMES[dmg.spell.toLowerCase()]] = 1 + Number(dmg.pct) / 100;
    found = true;
  }
  return { stats, mods, simulated: found };
}

/** Bonus d'ensemble dans une infobulle Wowhead (« (3) Set : … »), avec le nom et le numéro du set. */
export function parseSetFromTooltip(html: string): { id: number; name: string; bonuses: { count: number; text: string }[] } | null {
  const head = /item-set=(\d+)[^"]*" class="q">([^<]+)<\/a>/.exec(html);
  if (!head) return null;
  const bonuses = [...html.matchAll(/\((\d+)\) Set : (?:<a[^>]*>)?([^<]+)/g)].map((m) => ({
    count: Number(m[1]),
    text: m[2].replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
  return { id: Number(head[1]), name: head[2].trim(), bonuses };
}
