import type { SpellDef } from '../data/types';

// Liste de priorités personnalisable, commune à tous les simulateurs.
//
// Chaque simulateur décrit ses étapes dans l'ordre par défaut (une étape = une technique ou un choix,
// avec sa condition intégrée : DoT absent, temps de recharge prêt, ressource suffisante…).
// L'utilisateur peut changer l'ordre, désactiver une étape ou lui ajouter des conditions
// (vie de la cible, temps écoulé, ressource…). Ces conditions s'ajoutent à la condition intégrée.

export type ConditionKind = 'targetHp' | 'elapsed' | 'remaining' | 'resourcePct' | 'resource' | 'combo';

export interface StepCondition {
  kind: ConditionKind;
  op: '<' | '>=';
  value: number;
}

export interface PriorityEntry {
  id: string;
  enabled: boolean;
  conditions: StepCondition[];
}

/** Rotation personnalisée d'une spécialisation. Absente ou vide : ordre par défaut. */
export type PriorityList = PriorityEntry[];

/** État du combat lu par les conditions. */
export interface PriorityContext {
  time: () => number;
  fightLength: number;
  resource: () => number;
  resourceMax: () => number;
  combo?: () => number;
}

export interface StepImpl<R> {
  when: () => unknown;
  run: () => R | undefined;
}

/** Vie de la cible en % : 100 % au début, 0 % à la fin, en baisse linéaire (comme pour Exécution). */
export const targetHpAt = (t: number, fightLength: number) => Math.max(0, 100 * (1 - t / fightLength));

export function conditionValue(kind: ConditionKind, ctx: PriorityContext): number {
  const t = ctx.time();
  switch (kind) {
    case 'targetHp':
      return targetHpAt(t, ctx.fightLength);
    case 'elapsed':
      return t;
    case 'remaining':
      return ctx.fightLength - t;
    case 'resourcePct': {
      const max = ctx.resourceMax();
      return max > 0 ? (100 * ctx.resource()) / max : 0;
    }
    case 'resource':
      return ctx.resource();
    case 'combo':
      return ctx.combo?.() ?? 0;
  }
}

export const conditionsHold = (conds: StepCondition[], ctx: PriorityContext) =>
  conds.every((c) => {
    const v = conditionValue(c.kind, ctx);
    return c.op === '<' ? v < c.value : v >= c.value;
  });

/**
 * Ordre effectif : celui de l'utilisateur pour les étapes connues ; une étape absente de sa liste
 * (ajoutée depuis) reprend sa place après l'étape qui la précède dans l'ordre par défaut.
 */
export function resolveOrder(defaults: readonly string[], custom: PriorityList | undefined): PriorityEntry[] {
  const known = new Set(defaults);
  // Les sorts ajoutés par l'utilisateur (« spell:… ») ne sont pas dans l'ordre par défaut : on les garde.
  const list = (custom ?? []).filter((e) => known.has(e.id) || e.id.startsWith('spell:'));
  const seen = new Set(list.map((e) => e.id));
  const out = [...list];
  defaults.forEach((id, i) => {
    if (seen.has(id)) return;
    const prev = i > 0 ? out.findIndex((e) => e.id === defaults[i - 1]) : -1;
    out.splice(prev + 1, 0, { id, enabled: true, conditions: [] });
    seen.add(id);
  });
  return out;
}

/** Vrai si la liste change quelque chose par rapport à l'ordre par défaut. */
export function isCustomized(defaults: readonly string[], custom: PriorityList | undefined): boolean {
  const order = resolveOrder(defaults, custom);
  return order.length !== defaults.length || order.some((e, i) => e.id !== defaults[i] || !e.enabled || e.conditions.length > 0);
}

/**
 * Prépare la fonction de choix : elle parcourt les étapes dans l'ordre et lance la première
 * dont la condition intégrée et les conditions de l'utilisateur sont vraies.
 * Renvoie undefined si aucune étape ne convient (le simulateur attend ou prend son sort par défaut).
 */
export function makePriority<R>(
  defaults: readonly string[],
  impls: Record<string, StepImpl<R>>,
  custom: PriorityList | undefined,
  ctx: PriorityContext,
  /** Code des étapes ajoutées (sorts « spell:… ») ; une étape sans code est ignorée. */
  extra?: (id: string) => StepImpl<R> | undefined,
): () => R | undefined {
  for (const id of defaults) if (!impls[id]) throw new Error(`étape de rotation sans code : ${id}`);
  const steps = resolveOrder(defaults, custom)
    .filter((e) => e.enabled)
    .map((e) => ({ impl: impls[e.id] ?? extra?.(e.id), conds: e.conditions }))
    .filter((s): s is { impl: StepImpl<R>; conds: StepCondition[] } => !!s.impl);
  return () => {
    for (const s of steps) {
      if (!s.impl.when() || (s.conds.length > 0 && !conditionsHold(s.conds, ctx))) continue;
      // Une étape peut renoncer au dernier moment (undefined) : on passe alors à la suivante.
      const r = s.impl.run();
      if (r !== undefined) return r;
    }
    return undefined;
  };
}

/**
 * Temps forts hors temps de recharge global (Pouvoir des arcanes, Témérité…) : pas d'ordre, mais chacun
 * peut être désactivé ou attendre ses conditions (ex. vie de la cible < 20 % pour le garder pour la fin).
 * Renvoie une fonction qui dit si le temps fort a le droit d'être lancé maintenant.
 */
export function makeCooldownGate(defaults: readonly string[], custom: PriorityList | undefined, ctx: PriorityContext): (id: string) => boolean {
  const rules = new Map(resolveOrder(defaults, custom).map((e) => [e.id, e]));
  return (id) => {
    const e = rules.get(id);
    if (!e) return true;
    return e.enabled && (e.conditions.length === 0 || conditionsHold(e.conditions, ctx));
  };
}

/** Ce que le simulateur sait d'un sort ajouté, pour décider s'il peut le lancer. */
export interface ExtraSpellState {
  hasTalent: (key: string) => boolean;
  ready: (spellId: string) => boolean;
  /** Le DoT du sort est encore actif sur la cible. */
  dotUp: (spellId: string) => boolean;
}

/**
 * Code des étapes « spell:… » d'une rotation : le sort est lancé si son talent est pris, s'il est prêt et,
 * pour un DoT (hors canalisé), s'il n'est pas déjà sur la cible.
 */
export function extraSpellSteps<R>(spells: Map<string, SpellDef>, st: ExtraSpellState, run: (s: SpellDef) => R): (stepId: string) => StepImpl<R> | undefined {
  return (stepId) => {
    const s = stepId.startsWith('spell:') ? spells.get(stepId.slice(6)) : undefined;
    if (!s) return undefined;
    return {
      when: () => (!s.requiresTalent || st.hasTalent(s.requiresTalent)) && st.ready(s.id) && (s.channel || !s.dotTotal || !st.dotUp(s.id)),
      run: () => run(s),
    };
  };
}
