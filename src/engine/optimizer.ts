import { resolveOrder, type ConditionKind, type PriorityEntry, type PriorityList, type StepCondition } from './priority';

// Recherche de la rotation qui fait le plus de dégâts, par améliorations successives.
//
// À chaque tour, on essaie toutes les petites variantes de la meilleure rotation connue (déplacer une étape,
// la désactiver, ajouter un sort, ajouter ou ajuster une condition, garder un temps fort…), toutes simulées avec
// la même graine aléatoire pour que les écarts viennent de la rotation et pas du hasard. On garde la meilleure si
// elle gagne assez, et on recommence. On peut partir de plusieurs rotations. À la fin, les meilleures rotations
// vues sont revérifiées avec beaucoup plus d'itérations et des graines indépendantes : un gain qui ne dépasse pas
// sa marge d'erreur n'est pas présenté comme fiable.

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

/** Plage de seuils essayés pour un type de condition. */
export interface ConditionRange {
  kind: ConditionKind;
  min: number;
  max: number;
  step: number;
}

/** Ce que l'optimiseur a le droit de changer. */
export interface SearchSpace {
  /** Étapes de la rotation par défaut, dans l'ordre. */
  steps: readonly string[];
  /** Temps forts réglables. */
  cooldowns: readonly string[];
  /** Sorts qu'il peut ajouter (« spell:… »). */
  extraSteps: readonly string[];
  /** Étapes verrouillées : ni déplacées, ni désactivées, ni conditionnées. */
  locked: readonly string[];
  order: boolean;
  disable: boolean;
  /** Conditions essayées sur les étapes de la rotation (vide : aucune). */
  conditions: ConditionRange[];
  /** Conditions essayées sur les temps forts (vide : on peut seulement les désactiver). */
  cooldownConditions: ConditionRange[];
  /** Régler les temps forts. */
  tuneCooldowns: boolean;
}

export interface OptimizerOptions {
  /** Itérations par simulation pendant la recherche. */
  searchIterations: number;
  /** Itérations de la vérification finale. */
  confirmIterations: number;
  maxRounds: number;
  /** Gain minimal (en %) pour accepter une variante pendant la recherche. */
  minGainPct: number;
  /** Nombre de rotations revérifiées et présentées. */
  topN: number;
}

export const EFFORTS: Record<'quick' | 'normal' | 'deep', OptimizerOptions> = {
  quick: { searchIterations: 250, confirmIterations: 2000, maxRounds: 8, minGainPct: 0.2, topN: 3 },
  normal: { searchIterations: 400, confirmIterations: 3000, maxRounds: 12, minGainPct: 0.15, topN: 5 },
  deep: { searchIterations: 800, confirmIterations: 6000, maxRounds: 20, minGainPct: 0.1, topN: 5 },
};
export const DEFAULT_OPTIMIZER = EFFORTS.normal;

export interface OptimizerProgress {
  /** Point de départ en cours (0 = le premier). */
  start: number;
  starts: number;
  round: number;
  evaluated: number;
  bestDps: number;
  startDps: number;
  phase: 'search' | 'confirm' | 'explain';
}

export interface Candidate {
  rotation: Rotation;
  eval: Evaluation;
  /** Gain sur la rotation de départ, et sa marge d'erreur à 95 %. */
  gain: number;
  margin: number;
  reliable: boolean;
}

export interface OptimizerResult {
  start: Rotation;
  startEval: Evaluation;
  /** Meilleures rotations vérifiées, de la meilleure à la moins bonne. */
  candidates: Candidate[];
  /** Meilleur DPS (recherche) à chaque tour, tous départs confondus. */
  history: { round: number; dps: number }[];
  evaluated: number;
  stopped: boolean;
}

const SEARCH_SEED = 4242;
const CONFIRM_SEED = 777;

const sameCond = (a: StepCondition, b: StepCondition) => a.kind === b.kind && a.op === b.op && a.value === b.value;
const entry = (id: string): PriorityEntry => ({ id, enabled: true, conditions: [] });
const keyOf = (r: Rotation) => JSON.stringify(r);

/** Jusqu'à 4 seuils répartis sur la plage, avec les deux sens (< et ≥). */
export function templatesFor(ranges: ConditionRange[]): StepCondition[] {
  const out: StepCondition[] = [];
  for (const r of ranges) {
    if (!(r.step > 0) || r.max < r.min) continue;
    const count = Math.floor((r.max - r.min) / r.step) + 1;
    const picks = new Set<number>();
    for (let k = 0; k < Math.min(4, count); k++) {
      const idx = count <= 4 ? k : Math.round((k * (count - 1)) / 3);
      picks.add(r.min + idx * r.step);
    }
    for (const value of picks) out.push({ kind: r.kind, op: '<', value }, { kind: r.kind, op: '>=', value });
  }
  return out;
}

/** Variantes d'une condition existante : seuil voisin, sens inverse. */
function refinements(c: StepCondition, ranges: ConditionRange[]): StepCondition[] {
  const r = ranges.find((x) => x.kind === c.kind);
  if (!r) return [];
  const out: StepCondition[] = [{ ...c, op: c.op === '<' ? '>=' : '<' }];
  for (const v of [c.value - r.step, c.value + r.step]) if (v >= r.min && v <= r.max) out.push({ ...c, value: v });
  return out;
}

/** Applique une transformation aux seules étapes non verrouillées ; les verrouillées gardent leur place. */
function withLocked(list: PriorityList, locked: Set<string>, change: (free: PriorityList) => PriorityList | null): PriorityList | null {
  const fixed = list.map((e, i) => ({ e, i })).filter(({ e }) => locked.has(e.id));
  const free = change(list.filter((e) => !locked.has(e.id)));
  if (!free) return null;
  const out = [...free];
  for (const { e, i } of fixed) out.splice(Math.min(i, out.length), 0, e);
  return out;
}

/** Toutes les petites variantes d'une rotation, dans les limites de l'espace de recherche. */
export function neighbors(r: Rotation, space: SearchSpace): Rotation[] {
  const out: Rotation[] = [];
  const locked = new Set(space.locked);
  const addP = (p: PriorityList | null) => p && out.push({ priority: p, cooldowns: r.cooldowns });
  const addC = (cooldowns: PriorityList) => out.push({ priority: r.priority, cooldowns });
  const templates = templatesFor(space.conditions);
  const free = r.priority.filter((e) => !locked.has(e.id));
  const set = (i: number, patch: Partial<PriorityEntry>) => withLocked(r.priority, locked, (f) => f.map((e, k) => (k === i ? { ...e, ...patch } : e)));

  for (let i = 0; i < free.length; i++) {
    const e = free[i];
    if (space.order) {
      if (i > 0)
        addP(
          withLocked(r.priority, locked, (f) => {
            const n = [...f];
            [n[i - 1], n[i]] = [n[i], n[i - 1]];
            return n;
          }),
        );
      if (i > 1) addP(withLocked(r.priority, locked, (f) => [f[i], ...f.slice(0, i), ...f.slice(i + 1)]));
    }
    // Activer ou désactiver (on garde au moins une étape active).
    if (space.disable && (!e.enabled || r.priority.filter((x) => x.enabled).length > 1)) addP(set(i, { enabled: !e.enabled }));
    if (e.id.startsWith('spell:')) addP(withLocked(r.priority, locked, (f) => f.filter((_, k) => k !== i)));
    if (!e.enabled || !space.conditions.length) continue;
    if (e.conditions.length === 0) for (const c of templates) addP(set(i, { conditions: [c] }));
    else {
      addP(set(i, { conditions: [] }));
      for (const c of refinements(e.conditions[0], space.conditions)) addP(set(i, { conditions: [c] }));
    }
  }
  // Ajouter un sort : en tête, ou juste avant la dernière étape (souvent le sort de remplissage).
  for (const id of space.extraSteps) {
    if (r.priority.some((e) => e.id === id)) continue;
    addP(withLocked(r.priority, locked, (f) => [entry(id), ...f]));
    addP(withLocked(r.priority, locked, (f) => [...f.slice(0, -1), entry(id), ...f.slice(-1)]));
  }
  if (space.tuneCooldowns) {
    const cdTemplates = templatesFor(space.cooldownConditions);
    r.cooldowns.forEach((c, i) => {
      const setC = (patch: Partial<PriorityEntry>) => addC(r.cooldowns.map((e, k) => (k === i ? { ...e, ...patch } : e)));
      setC({ enabled: !c.enabled });
      if (!c.enabled) return;
      if (c.conditions.length) {
        setC({ conditions: [] });
        for (const x of refinements(c.conditions[0], space.cooldownConditions)) setC({ conditions: [x] });
      } else for (const x of cdTemplates) if (!c.conditions.some((y) => sameCond(x, y))) setC({ conditions: [x] });
    });
  }
  return out;
}

/** Rotation complète à partir d'une liste enregistrée (étapes par défaut ajoutées si besoin). */
export function startRotation(space: Pick<SearchSpace, 'steps' | 'cooldowns'>, priority: PriorityList | undefined, cooldowns: PriorityList | undefined): Rotation {
  return { priority: resolveOrder(space.steps, priority), cooldowns: resolveOrder(space.cooldowns, cooldowns) };
}

/** Marge d'erreur à 95 % d'un écart entre deux moyennes de DPS indépendantes. */
export const gainMargin = (a: Evaluation, b: Evaluation) => 1.96 * Math.sqrt(a.stdev ** 2 / a.iterations + b.stdev ** 2 / b.iterations);

/**
 * Cherche la meilleure rotation. Le premier point de départ sert de référence (la rotation actuelle) ;
 * les autres (rotation par défaut…) servent à ne pas rester bloqué sur un optimum local.
 */
export async function optimizeRotation(
  space: SearchSpace,
  starts: Rotation[],
  evaluate: Evaluator,
  opts: OptimizerOptions = DEFAULT_OPTIMIZER,
  onProgress?: (p: OptimizerProgress) => void,
  shouldStop: () => boolean = () => false,
): Promise<OptimizerResult> {
  const seen = new Map<string, { rotation: Rotation; dps: number }>();
  const history: { round: number; dps: number }[] = [];
  let evaluated = 0;
  let stopped = false;
  let roundCounter = 0;
  let globalBest = 0;
  const reference = starts[0];
  const uniqueStarts = starts.filter((s, i) => starts.findIndex((x) => keyOf(x) === keyOf(s)) === i);

  const score = async (rs: Rotation[]) => {
    const evals = await evaluate(rs, opts.searchIterations, SEARCH_SEED);
    evaluated += rs.length;
    rs.forEach((r, i) => seen.set(keyOf(r), { rotation: r, dps: evals[i].dps }));
    return evals;
  };

  let startDps = 0;
  for (let s = 0; s < uniqueStarts.length && !stopped; s++) {
    let best = uniqueStarts[s];
    let bestDps = seen.get(keyOf(best))?.dps ?? (await score([best]))[0].dps;
    if (s === 0) startDps = bestDps;
    globalBest = Math.max(globalBest, bestDps);
    for (let round = 1; round <= opts.maxRounds; round++) {
      if (shouldStop()) {
        stopped = true;
        break;
      }
      const candidates = neighbors(best, space).filter((c) => !seen.has(keyOf(c)));
      if (!candidates.length) break;
      const evals = await score(candidates);
      let pick = -1;
      evals.forEach((e, i) => {
        if (e.dps > (pick < 0 ? bestDps : evals[pick].dps)) pick = i;
      });
      const improved = pick >= 0 && evals[pick].dps >= bestDps * (1 + opts.minGainPct / 100);
      if (improved) {
        best = candidates[pick];
        bestDps = evals[pick].dps;
      }
      globalBest = Math.max(globalBest, bestDps);
      history.push({ round: ++roundCounter, dps: globalBest });
      onProgress?.({ start: s, starts: uniqueStarts.length, round, evaluated, bestDps: globalBest, startDps, phase: 'search' });
      if (!improved) break;
    }
  }

  // Vérification : beaucoup plus d'itérations, une graine différente pour chaque rotation,
  // pour que les marges d'erreur (calculées pour des mesures indépendantes) soient justes.
  onProgress?.({ start: uniqueStarts.length - 1, starts: uniqueStarts.length, round: 0, evaluated, bestDps: globalBest, startDps, phase: 'confirm' });
  const refKey = keyOf(reference);
  const top = [...seen.entries()]
    .filter(([k]) => k !== refKey)
    .sort((a, b) => b[1].dps - a[1].dps)
    .slice(0, opts.topN)
    .map(([, v]) => v.rotation);
  const confirmed = await Promise.all([reference, ...top].map((r, i) => evaluate([r], opts.confirmIterations, CONFIRM_SEED + i).then((e) => e[0])));
  evaluated += confirmed.length;
  const startEval = confirmed[0];
  const candidates = top
    .map((rotation, i): Candidate => {
      const ev = confirmed[i + 1];
      const gain = ev.dps - startEval.dps;
      const margin = gainMargin(startEval, ev);
      return { rotation, eval: ev, gain, margin, reliable: gain > margin };
    })
    .sort((a, b) => b.eval.dps - a.eval.dps);
  return { start: reference, startEval, candidates, history, evaluated, stopped };
}

// ---------------------------------------------------------------------------------------------
// Explication : ce que rapporte chaque changement.

export type ChangeKind = 'added' | 'removed' | 'enabled' | 'disabled' | 'conditions' | 'moved';

export interface Change {
  list: 'priority' | 'cooldowns';
  id: string;
  kind: ChangeKind;
  /** Conditions avant / après (pour un changement de conditions). */
  before?: StepCondition[];
  after?: StepCondition[];
  /** Ancienne et nouvelle place (1 = en tête). */
  from?: number;
  to?: number;
}

/** Différences entre deux rotations, une par étape et par type de changement. */
export function diffRotations(start: Rotation, best: Rotation): Change[] {
  const out: Change[] = [];
  for (const list of ['priority', 'cooldowns'] as const) {
    const a = start[list];
    const b = best[list];
    const common = b.filter((e) => a.some((x) => x.id === e.id)).map((e) => e.id);
    const commonA = a.filter((e) => common.includes(e.id)).map((e) => e.id);
    for (const e of b) {
      const s = a.find((x) => x.id === e.id);
      if (!s) {
        out.push({ list, id: e.id, kind: 'added', to: b.indexOf(e) + 1 });
        continue;
      }
      if (s.enabled !== e.enabled) out.push({ list, id: e.id, kind: e.enabled ? 'enabled' : 'disabled' });
      if (JSON.stringify(s.conditions) !== JSON.stringify(e.conditions)) out.push({ list, id: e.id, kind: 'conditions', before: s.conditions, after: e.conditions });
      // Déplacement : la place relative parmi les étapes communes a changé.
      if (list === 'priority' && commonA.indexOf(e.id) !== common.indexOf(e.id)) out.push({ list, id: e.id, kind: 'moved', from: a.indexOf(s) + 1, to: b.indexOf(e) + 1 });
    }
    for (const s of a) if (!b.some((x) => x.id === s.id)) out.push({ list, id: s.id, kind: 'removed', from: a.indexOf(s) + 1 });
  }
  return out;
}

/** La meilleure rotation, sans un des changements (remis comme au départ). */
export function revertChange(best: Rotation, start: Rotation, c: Change): Rotation {
  const list = [...best[c.list]];
  const i = list.findIndex((e) => e.id === c.id);
  const s = start[c.list].find((e) => e.id === c.id);
  if (c.kind === 'added') list.splice(i, 1);
  else if (c.kind === 'removed' && s) list.splice(Math.min((c.from ?? 1) - 1, list.length), 0, s);
  else if ((c.kind === 'enabled' || c.kind === 'disabled') && s) list[i] = { ...list[i], enabled: s.enabled };
  else if (c.kind === 'conditions' && s) list[i] = { ...list[i], conditions: s.conditions };
  else if (c.kind === 'moved') {
    const [e] = list.splice(i, 1);
    list.splice(Math.min((c.from ?? 1) - 1, list.length), 0, e);
  }
  return { ...best, [c.list]: list };
}

export interface ChangeContribution {
  change: Change;
  /** DPS perdus si on retire ce changement (même graine : écart fiable même petit). */
  dps: number;
}

/** Mesure ce que rapporte chaque changement, en le retirant seul de la meilleure rotation. */
export async function explainChanges(start: Rotation, best: Rotation, evaluate: Evaluator, iterations: number): Promise<ChangeContribution[]> {
  const changes = diffRotations(start, best);
  if (!changes.length) return [];
  const evals = await evaluate([best, ...changes.map((c) => revertChange(best, start, c))], iterations, SEARCH_SEED + 1);
  return changes.map((change, i) => ({ change, dps: evals[0].dps - evals[i + 1].dps })).sort((a, b) => b.dps - a.dps);
}
