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
  const list = (custom ?? []).filter((e) => known.has(e.id));
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
  return order.some((e, i) => e.id !== defaults[i] || !e.enabled || e.conditions.length > 0);
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
): () => R | undefined {
  for (const id of defaults) if (!impls[id]) throw new Error(`étape de rotation sans code : ${id}`);
  const steps = resolveOrder(defaults, custom)
    .filter((e) => e.enabled)
    .map((e) => ({ impl: impls[e.id], conds: e.conditions }));
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
