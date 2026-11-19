import type { Localized, TalentDef, TalentTree } from './types';

// Lecture commune des fichiers générés par `npm run fetch-data` (un par classe).

export interface SpellMeta {
  id: number;
  icon: string;
  name: Localized;
  tooltip: Localized;
}

interface GeneratedClass {
  source: string;
  fetchedAt: string;
  trees: { key: string; icon: string; name: Localized }[];
  talents: {
    key: string;
    tree: number;
    row: number;
    col: number;
    maxRank: number;
    icon: string;
    name: Localized;
    desc: Record<'en' | 'fr', string[]>;
    requires: { key?: string; qty: number }[];
  }[];
  spells: Record<string, SpellMeta>;
}

export interface TalentData {
  trees: TalentTree[];
  talents: TalentDef[];
  byKey: Map<string, TalentDef>;
  /** Valeur lue dans la description anglaise d'un talent au rang donné. */
  talentValue: (key: string, rank: number, re: RegExp) => number;
  spellMeta: Record<string, SpellMeta>;
  dataSource: { source: string; fetchedAt: string };
}

export function makeTalentData(
  data: GeneratedClass,
  colors: string[],
  simulated: Set<string>,
  extraSpells: Record<string, SpellMeta> = {},
): TalentData {
  const trees = data.trees.map((t, i) => ({ ...t, color: colors[i] }));
  const talents: TalentDef[] = data.talents.map((t) => ({
    key: t.key,
    tree: t.tree,
    row: t.row,
    col: t.col,
    maxRank: t.maxRank,
    icon: t.icon,
    name: t.name,
    desc: t.desc,
    requires: t.requires.filter((r): r is { key: string; qty: number } => !!r.key),
    simulated: simulated.has(t.key),
  }));
  const byKey = new Map(talents.map((t) => [t.key, t]));
  const talentValue = (key: string, rank: number, re: RegExp) => {
    if (rank <= 0) return 0;
    const t = byKey.get(key);
    const text = t?.desc.en[Math.min(rank, t.maxRank) - 1];
    const m = text ? re.exec(text) : null;
    return m ? parseFloat(m[1]) : 0;
  };
  return {
    trees,
    talents,
    byKey,
    talentValue,
    spellMeta: { ...data.spells, ...extraSpells },
    dataSource: { source: data.source, fetchedAt: data.fetchedAt },
  };
}
