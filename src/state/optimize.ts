import type { ClassModule } from '../data/classes';
import { extraSpellsFor, extraStepId, supportsExtraSpells } from '../data/extraSpells';
import type { ConditionRange, Evaluation, Evaluator, Rotation, SearchSpace } from '../engine/optimizer';
import type { ConditionKind } from '../engine/priority';
import { COOLDOWN_TALENT, cooldownKey, cooldownSteps, hasCombo, rotationResource, rotationSteps } from '../engine/rotationSteps';
import { rank } from '../engine/talents';
import { buildConfig, type AnySimConfig, type AppState } from './store';

/** Un combat du mélange optimisé (poids relatif, durée, cibles, déplacements). */
export interface Scenario {
  id: string;
  name: string;
  weight: number;
  fightLength: number;
  targets: number;
  movementPct: number;
}

export interface RangePref {
  on: boolean;
  min: number;
  max: number;
  step: number;
}

/** Réglages de l'onglet Optimisation (gardés avec l'état de la classe). */
export interface OptPrefs {
  /** Combats optimisés ; vide : le combat réglé dans l'onglet Simulation. */
  scenarios: Scenario[];
  order: boolean;
  disable: boolean;
  extras: boolean;
  conditions: boolean;
  cooldowns: boolean;
  /** Sorts que l'optimiseur ne doit pas ajouter. */
  blockedExtras: string[];
  /** Étapes verrouillées, par spécialisation. */
  locked: Record<string, string[]>;
  /** Plages des conditions, par type. */
  ranges: Partial<Record<ConditionKind, RangePref>>;
  effort: 'quick' | 'normal' | 'deep';
  /** Repartir aussi de la rotation par défaut (en plus de la rotation actuelle). */
  fromDefault: boolean;
}

export const DEFAULT_OPT: OptPrefs = {
  scenarios: [],
  order: true,
  disable: true,
  extras: true,
  conditions: true,
  cooldowns: true,
  blockedExtras: [],
  locked: {},
  ranges: {},
  effort: 'normal',
  fromDefault: true,
};

/** Plages par défaut selon la ressource de la classe. */
export function defaultRanges(resource: 'mana' | 'energy' | 'rage', combo: boolean): Record<ConditionKind, RangePref> {
  return {
    targetHp: { on: true, min: 10, max: 50, step: 5 },
    remaining: { on: true, min: 5, max: 30, step: 5 },
    elapsed: { on: false, min: 5, max: 60, step: 5 },
    resourcePct: { on: resource === 'mana', min: 10, max: 90, step: 10 },
    resource: { on: resource !== 'mana', min: resource === 'energy' ? 20 : 10, max: 100, step: 10 },
    combo: { on: combo, min: 1, max: 5, step: 1 },
  };
}

/** Types de condition qui ont un sens pour la classe. */
export function conditionKinds(resource: 'mana' | 'energy' | 'rage', combo: boolean): ConditionKind[] {
  return ['targetHp', 'remaining', 'elapsed', resource === 'mana' ? 'resourcePct' : 'resource', ...(combo ? (['combo'] as ConditionKind[]) : [])];
}

/** Plages effectives : réglages de l'utilisateur, sinon valeurs par défaut. */
export function effectiveRanges(state: AppState, cls: ClassModule): Record<ConditionKind, RangePref> {
  const resource = rotationResource(cls.id, state.spec);
  const combo = hasCombo(cls.id, state.spec);
  const base = defaultRanges(resource, combo);
  const prefs = state.opt?.ranges ?? {};
  const out = { ...base };
  for (const k of conditionKinds(resource, combo)) out[k] = { ...base[k], ...prefs[k] };
  return out;
}

/** Sorts que l'optimiseur peut proposer (talent pris, sans dégâts sur soi). */
export function proposableExtras(state: AppState, cls: ClassModule) {
  if (!supportsExtraSpells(cls.id, state.spec)) return [];
  // Un sort qui blesse aussi le lanceur paraîtrait gratuit : on ne le propose pas.
  return extraSpellsFor(cls).filter((s) => (!s.requiresTalent || rank(state.talents, s.requiresTalent) > 0) && !s.selfDamage);
}

/** Temps forts réglables (talent pris). */
export const tunableCooldowns = (state: AppState, cls: ClassModule) =>
  cooldownSteps(cls.id, state.spec).filter((id) => !COOLDOWN_TALENT[id] || rank(state.talents, COOLDOWN_TALENT[id]!) > 0);

/** Espace de recherche à partir de l'état et des réglages de l'onglet. */
export function searchSpace(state: AppState, cls: ClassModule, prefs: OptPrefs = state.opt ?? DEFAULT_OPT): SearchSpace {
  const resource = rotationResource(cls.id, state.spec);
  const combo = hasCombo(cls.id, state.spec);
  const ranges = effectiveRanges({ ...state, opt: prefs }, cls);
  const kinds = conditionKinds(resource, combo).filter((k) => ranges[k].on);
  const toRange = (k: ConditionKind): ConditionRange => ({ kind: k, min: ranges[k].min, max: ranges[k].max, step: ranges[k].step });
  return {
    steps: rotationSteps(cls.id, state.spec),
    cooldowns: tunableCooldowns(state, cls),
    extraSteps: prefs.extras ? proposableExtras(state, cls).filter((s) => !prefs.blockedExtras.includes(s.id)).map((s) => extraStepId(s.id)) : [],
    locked: prefs.locked[state.spec] ?? [],
    order: prefs.order,
    disable: prefs.disable,
    conditions: prefs.conditions ? kinds.map(toRange) : [],
    // Pour les temps forts : seulement les conditions de moment (vie de la cible, temps).
    cooldownConditions: prefs.cooldowns ? kinds.filter((k) => k === 'targetHp' || k === 'remaining' || k === 'elapsed').map(toRange) : [],
    tuneCooldowns: prefs.cooldowns,
  };
}

/** Ancienne forme, gardée pour les appels simples : tout est permis. */
export const optimizerSetup = (state: AppState, cls: ClassModule) => searchSpace(state, cls, DEFAULT_OPT);

/** État avec une rotation et des temps forts donnés. */
export const withRotation = (state: AppState, r: Rotation): AppState => ({
  ...state,
  priority: { ...state.priority, [state.spec]: r.priority, [cooldownKey(state.spec)]: r.cooldowns },
});

/** Configuration de simulation d'une rotation candidate. */
export const rotationConfig = (state: AppState, r: Rotation, iterations: number, seed: number): AnySimConfig => ({
  ...buildConfig(withRotation(state, r)),
  iterations,
  seed,
});

/** Combats à optimiser : ceux de l'onglet, sinon le combat réglé dans l'onglet Simulation. */
export const activeScenarios = (state: AppState): Scenario[] => {
  const list = (state.opt?.scenarios ?? []).filter((s) => s.weight > 0);
  return list.length
    ? list
    : [{ id: 'current', name: '', weight: 1, fightLength: state.fightLength, targets: state.targets ?? 1, movementPct: state.movementPct ?? 0 }];
};

/**
 * Évaluateur pondéré : chaque rotation est simulée dans chaque combat, et son DPS est la moyenne pondérée.
 * L'écart-type combiné suppose des combats indépendants (sert à la marge d'erreur).
 */
export function scenarioEvaluator(state: AppState, scenarios: Scenario[], run: (configs: AnySimConfig[]) => Promise<Evaluation[]>): Evaluator {
  const total = scenarios.reduce((a, s) => a + s.weight, 0) || 1;
  return async (rotations, iterations, seed) => {
    const configs = rotations.flatMap((r) =>
      scenarios.map((sc) => rotationConfig({ ...state, fightLength: sc.fightLength, targets: sc.targets, movementPct: sc.movementPct }, r, iterations, seed)),
    );
    const evals = await run(configs);
    return rotations.map((_, i) => {
      const part = evals.slice(i * scenarios.length, (i + 1) * scenarios.length);
      const dps = part.reduce((a, e, k) => a + (e.dps * scenarios[k].weight) / total, 0);
      const stdev = Math.sqrt(part.reduce((a, e, k) => a + ((scenarios[k].weight / total) * e.stdev) ** 2, 0));
      return { dps, stdev, iterations };
    });
  };
}
