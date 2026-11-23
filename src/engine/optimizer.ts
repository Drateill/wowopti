import { resolveOrder, type PriorityEntry, type PriorityList, type StepCondition } from './priority';

// Recherche de la rotation qui fait le plus de dégâts, par améliorations successives.
//
// À chaque tour, on essaie toutes les petites variantes de la meilleure rotation connue (déplacer une étape,
// la désactiver, ajouter un sort, ajouter une condition, garder un temps fort…), toutes simulées avec la même
// graine aléatoire pour que les écarts viennent de la rotation et pas du hasard. On garde la meilleure si elle
// gagne assez, et on recommence. À la fin, la gagnante est revérifiée avec beaucoup plus d'itérations et une
// autre graine : un gain qui ne tient pas est écarté.

export interface Rotation {
  priority: PriorityList;
  cooldowns: PriorityList;
}

export interface Evaluation {
  dps: number;
  /** Écart-type du DPS d'un combat à l'autre. */
  stdev: number;
  iterations: number;
}

/** Simule un lot de rotations (dans l'ordre) avec un nombre d'itérations et une graine donnés. */
export type Evaluator = (rotations: Rotation[], iterations: number, seed: number) => Promise<Evaluation[]>;

export interface OptimizerSetup {
  /** Étapes de la rotation par défaut, dans l'ordre. */
  steps: readonly string[];
  /** Temps forts réglables. */
  cooldowns: readonly string[];
  /** Sorts ajoutables (« spell:… »), déjà filtrés sur les talents pris. */
  extraSteps: readonly string[];
  /** Ressource lue par les conditions. */
  resource: 'mana' | 'energy' | 'rage';
  hasCombo: boolean;
}

export interface OptimizerOptions {
  /** Itérations par simulation pendant la recherche. */
  searchIterations: number;
  /** Itérations de la vérification finale. */
  confirmIterations: number;
  maxRounds: number;
  /** Gain minimal (en %) pour accepter une variante pendant la recherche. */
  minGainPct: number;
}

export const DEFAULT_OPTIMIZER: OptimizerOptions = { searchIterations: 400, confirmIterations: 3000, maxRounds: 12, minGainPct: 0.15 };

export interface OptimizerProgress {
  round: number;
  evaluated: number;
  bestDps: number;
  startDps: number;
  phase: 'search' | 'confirm';
}

export interface OptimizerResult {
  start: Rotation;
  best: Rotation;
  /** Vérification finale (mêmes itérations, graines différentes). */
  startEval: Evaluation;
  bestEval: Evaluation;
  /** Gain confirmé, en DPS, et sa marge d'erreur à 95 %. */
  gain: number;
  margin: number;
  /** Le gain dépasse la marge : la nouvelle rotation est meilleure de façon fiable. */
  reliable: boolean;
  evaluated: number;
  rounds: number;
  stopped: boolean;
}

const SEARCH_SEED = 4242;
const CONFIRM_SEED = 777;

/** Conditions essayées sur les étapes de la rotation. */
function stepTemplates(setup: OptimizerSetup): StepCondition[] {
  const t: StepCondition[] = [
    { kind: 'targetHp', op: '<', value: 20 },
    { kind: 'targetHp', op: '<', value: 35 },
    { kind: 'targetHp', op: '>=', value: 35 },
    { kind: 'remaining', op: '>=', value: 10 },
    { kind: 'remaining', op: '<', value: 15 },
  ];
  if (setup.resource === 'mana') t.push({ kind: 'resourcePct', op: '>=', value: 50 }, { kind: 'resourcePct', op: '<', value: 30 });
  else if (setup.resource === 'energy') t.push({ kind: 'resource', op: '>=', value: 60 }, { kind: 'resource', op: '>=', value: 80 });
  else t.push({ kind: 'resource', op: '>=', value: 40 }, { kind: 'resource', op: '>=', value: 70 });
  if (setup.hasCombo) t.push({ kind: 'combo', op: '>=', value: 4 }, { kind: 'combo', op: '>=', value: 5 });
  return t;
}

/** Conditions essayées sur les temps forts : les garder pour la fin, ou attendre un peu au début. */
const COOLDOWN_TEMPLATES: StepCondition[] = [
  { kind: 'targetHp', op: '<', value: 20 },
  { kind: 'targetHp', op: '<', value: 35 },
  { kind: 'elapsed', op: '>=', value: 10 },
  { kind: 'remaining', op: '<', value: 30 },
];

const sameCond = (a: StepCondition, b: StepCondition) => a.kind === b.kind && a.op === b.op && a.value === b.value;
const entry = (id: string): PriorityEntry => ({ id, enabled: true, conditions: [] });

/** Toutes les petites variantes d'une rotation. */
export function neighbors(r: Rotation, setup: OptimizerSetup): Rotation[] {
  const out: Rotation[] = [];
  const p = r.priority;
  const withP = (priority: PriorityList) => out.push({ priority, cooldowns: r.cooldowns });
  const withC = (cooldowns: PriorityList) => out.push({ priority: r.priority, cooldowns });
  const templates = stepTemplates(setup);

  for (let i = 0; i < p.length; i++) {
    // Monter d'un cran, ou passer en tête.
    if (i > 0) {
      const next = [...p];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      withP(next);
    }
    if (i > 1) withP([p[i], ...p.slice(0, i), ...p.slice(i + 1)]);
    // Activer ou désactiver (on garde au moins une étape active).
    if (!p[i].enabled || p.filter((e) => e.enabled).length > 1) withP(p.map((e, k) => (k === i ? { ...e, enabled: !e.enabled } : e)));
    if (!p[i].enabled) continue;
    // Conditions : en ajouter une, ou retirer / remplacer celle qui existe.
    const conds = p[i].conditions;
    if (conds.length === 0) {
      for (const c of templates) withP(p.map((e, k) => (k === i ? { ...e, conditions: [c] } : e)));
    } else {
      withP(p.map((e, k) => (k === i ? { ...e, conditions: [] } : e)));
      for (const c of templates) if (c.kind === conds[0].kind && !sameCond(c, conds[0])) withP(p.map((e, k) => (k === i ? { ...e, conditions: [c] } : e)));
    }
    // Retirer un sort ajouté.
    if (p[i].id.startsWith('spell:')) withP(p.filter((_, k) => k !== i));
  }
  // Ajouter un sort : en tête, ou juste avant la dernière étape (souvent le sort de remplissage).
  for (const id of setup.extraSteps) {
    if (p.some((e) => e.id === id)) continue;
    withP([entry(id), ...p]);
    withP([...p.slice(0, -1), entry(id), ...p.slice(-1)]);
  }
  // Temps forts.
  r.cooldowns.forEach((c, i) => {
    withC(r.cooldowns.map((e, k) => (k === i ? { ...e, enabled: !e.enabled } : e)));
    if (!c.enabled) return;
    if (c.conditions.length) withC(r.cooldowns.map((e, k) => (k === i ? { ...e, conditions: [] } : e)));
    for (const t of COOLDOWN_TEMPLATES)
      if (!c.conditions.some((x) => sameCond(x, t))) withC(r.cooldowns.map((e, k) => (k === i ? { ...e, conditions: [t] } : e)));
  });
  return out;
}

/** Rotation de départ : la rotation actuelle, complétée par les étapes par défaut. */
export function startRotation(setup: OptimizerSetup, priority: PriorityList | undefined, cooldowns: PriorityList | undefined): Rotation {
  return { priority: resolveOrder(setup.steps, priority), cooldowns: resolveOrder(setup.cooldowns, cooldowns) };
}

/** Marge d'erreur à 95 % d'un écart entre deux moyennes de DPS. */
export const gainMargin = (a: Evaluation, b: Evaluation) => 1.96 * Math.sqrt(a.stdev ** 2 / a.iterations + b.stdev ** 2 / b.iterations);

export async function optimizeRotation(
  setup: OptimizerSetup,
  start: Rotation,
  evaluate: Evaluator,
  opts: OptimizerOptions = DEFAULT_OPTIMIZER,
  onProgress?: (p: OptimizerProgress) => void,
  shouldStop: () => boolean = () => false,
): Promise<OptimizerResult> {
  let best = start;
  let [bestEval] = await evaluate([start], opts.searchIterations, SEARCH_SEED);
  const startDps = bestEval.dps;
  let evaluated = 1;
  let rounds = 0;
  let stopped = false;
  const seen = new Set([JSON.stringify(start)]);

  for (let round = 1; round <= opts.maxRounds; round++) {
    if (shouldStop()) {
      stopped = true;
      break;
    }
    rounds = round;
    const candidates = neighbors(best, setup).filter((c) => {
      const key = JSON.stringify(c);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!candidates.length) break;
    const evals = await evaluate(candidates, opts.searchIterations, SEARCH_SEED);
    evaluated += candidates.length;
    let pick = -1;
    evals.forEach((e, i) => {
      if (e.dps > (pick < 0 ? bestEval.dps : evals[pick].dps)) pick = i;
    });
    onProgress?.({ round, evaluated, bestDps: Math.max(bestEval.dps, pick >= 0 ? evals[pick].dps : 0), startDps, phase: 'search' });
    if (pick < 0 || evals[pick].dps < bestEval.dps * (1 + opts.minGainPct / 100)) break;
    best = candidates[pick];
    bestEval = evals[pick];
    if (shouldStop()) {
      stopped = true;
      break;
    }
  }

  // Vérification : beaucoup plus d'itérations, et des graines différentes pour les deux rotations,
  // pour que la marge d'erreur (calculée pour deux mesures indépendantes) soit juste.
  onProgress?.({ round: rounds, evaluated, bestDps: bestEval.dps, startDps, phase: 'confirm' });
  const [[startEval], [finalEval]] = await Promise.all([
    evaluate([start], opts.confirmIterations, CONFIRM_SEED),
    evaluate([best], opts.confirmIterations, CONFIRM_SEED + 1),
  ]);
  const gain = finalEval.dps - startEval.dps;
  const margin = gainMargin(startEval, finalEval);
  return { start, best, startEval, bestEval: finalEval, gain, margin, reliable: gain > margin, evaluated: evaluated + 2, rounds, stopped };
}
