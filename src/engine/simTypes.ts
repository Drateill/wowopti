import type { Stats } from '../data/types';

// Résultats communs à toutes les simulations (dégâts, soins ou menace).

export interface SpellBreakdown {
  id: string;
  damage: number; // moyenne par combat (dégâts, soins ou menace selon la spécialisation)
  casts: number;
  hits: number;
  crits: number;
  misses: number;
  ticks: number;
}

export interface SimResult {
  /** Valeur principale par seconde : DPS, HPS ou menace par seconde. */
  dps: number;
  stdev: number;
  min: number;
  max: number;
  breakdown: SpellBreakdown[];
  timeline: { t: number; dps: number }[];
  histogram: { dps: number; count: number }[];
  lifeTaps: number;
  iterations: number;
  /** Indicateurs propres à la classe (mana restant, avoidance…), moyennés sur les combats. */
  extras?: Record<string, number>;
}

export interface StatWeight {
  key: keyof Stats;
  delta: number;
  dpsGain: number;
  perPoint: number;
  ep: number; // valeur relative à la stat de référence (= 1)
}

/** Accumulateur de résultats : chaque simulation y range ses dégâts, puis `finish` calcule les moyennes. */
export function createRecorder(fightLength: number, step = 5) {
  const totals = new Map<string, SpellBreakdown>();
  const bins = Math.ceil(fightLength / step);
  const timeline = new Array<number>(bins).fill(0);
  const values: number[] = [];
  const extras = new Map<string, number>();
  let current = 0;

  const entry = (id: string) => {
    let e = totals.get(id);
    if (!e) totals.set(id, (e = { id, damage: 0, casts: 0, hits: 0, crits: 0, misses: 0, ticks: 0 }));
    return e;
  };

  return {
    entry,
    /** Ajoute une quantité (dégâts, soins, menace) au moment `at`. */
    add(id: string, amount: number, at: number) {
      if (at > fightLength + 1e-9) return;
      current += amount;
      entry(id).damage += amount;
      timeline[Math.min(bins - 1, Math.max(0, Math.floor(at / step)))] += amount;
    },
    extra(key: string, value: number) {
      extras.set(key, (extras.get(key) ?? 0) + value);
    },
    endFight() {
      values.push(current / fightLength);
      current = 0;
    },
    finish(): SimResult {
      const n = values.length || 1;
      const mean = values.reduce((a, b) => a + b, 0) / n;
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const buckets = 20;
      const width = (max - min) / buckets || 1;
      const histogram = Array.from({ length: buckets }, (_, i) => ({ dps: Math.round(min + width * (i + 0.5)), count: 0 }));
      for (const d of values) histogram[Math.min(buckets - 1, Math.floor((d - min) / width))].count++;
      const breakdown = [...totals.values()]
        .map((b) => ({ ...b, damage: b.damage / n, casts: b.casts / n, hits: b.hits / n, crits: b.crits / n, misses: b.misses / n, ticks: b.ticks / n }))
        .filter((b) => b.casts > 0 || b.damage > 0)
        .sort((a, b) => b.damage - a.damage);
      return {
        dps: mean,
        stdev: Math.sqrt(variance),
        min,
        max,
        breakdown,
        timeline: timeline.map((v, i) => ({ t: (i + 1) * step, dps: v / n / Math.min(step, fightLength - i * step) })),
        histogram,
        lifeTaps: 0,
        iterations: n,
        extras: Object.fromEntries([...extras].map(([k, v]) => [k, v / n])),
      };
    },
  };
}
