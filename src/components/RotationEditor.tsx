import { extraSpellsFor, extraStepId, isExtraStep, supportsExtraSpells } from '../data/extraSpells';
import { isCustomized, resolveOrder, type ConditionKind, type PriorityEntry, type StepCondition } from '../engine/priority';
import { COOLDOWN_TALENT, cooldownKey, cooldownSteps, hasCombo, rotationResource, rotationSteps } from '../engine/rotationSteps';
import { rank } from '../engine/talents';
import { useI18n, type TKey } from '../i18n';
import { useStore } from '../state/store';
import { OptimizerPanel } from './OptimizerPanel';
import { SpellName } from './SimPanel';
import { Icon } from './ui';

const DEFAULT_VALUE: Record<ConditionKind, number> = { targetHp: 20, elapsed: 30, remaining: 30, resourcePct: 50, resource: 50, combo: 5 };

/** Rotation personnalisée (ordre, étapes, conditions) et réglage des temps forts. */
export function RotationEditor() {
  const { state, cls } = useStore();
  const { t } = useI18n();
  const steps = rotationSteps(cls.id, state.spec);
  // Seuls les temps forts dont on a le talent (ou qui n'en demandent pas) sont proposés.
  const cooldowns = cooldownSteps(cls.id, state.spec).filter((id) => {
    const talent = COOLDOWN_TALENT[id];
    return !talent || rank(state.talents, talent) > 0;
  });
  if (steps.length === 0 && cooldowns.length === 0) return null;
  const modified = isCustomized(steps, state.priority?.[state.spec]) || isCustomized(cooldowns, state.priority?.[cooldownKey(state.spec)]);

  return (
    <details className="rotation-editor" open={modified}>
      <summary>
        {t('prioTitle')} {modified && <span className="warn small">({t('prioModified')})</span>}
      </summary>
      {steps.length > 0 && <OptimizerPanel />}
      {steps.length > 0 && (
        <>
          <p className="small muted">{t('prioHelp')}</p>
          <StepList storeKey={state.spec} defaults={steps} orderable />
        </>
      )}
      {cooldowns.length > 0 && (
        <>
          <h4>{t('cdTitle')}</h4>
          <p className="small muted">{t('cdHelp')}</p>
          <StepList storeKey={cooldownKey(state.spec)} defaults={cooldowns} orderable={false} />
        </>
      )}
    </details>
  );
}

/** Liste d'étapes : case à cocher, flèches d'ordre (si `orderable`) et conditions. */
function StepList({ storeKey, defaults, orderable }: { storeKey: string; defaults: readonly string[]; orderable: boolean }) {
  const { state, set, cls } = useStore();
  const { t, L } = useI18n();
  const custom = state.priority?.[storeKey];
  const extras = orderable && supportsExtraSpells(cls.id, state.spec) ? extraSpellsFor(cls) : [];
  const extraById = new Map(extras.map((s) => [extraStepId(s.id), s]));
  const order = resolveOrder(defaults, custom);
  const modified = isCustomized(defaults, custom);

  const resource = rotationResource(cls.id, state.spec);
  const kinds: [ConditionKind, TKey][] = [
    ['targetHp', 'condTargetHp'],
    ['elapsed', 'condElapsed'],
    ['remaining', 'condRemaining'],
    resource === 'mana' ? ['resourcePct', 'condManaPct'] : ['resource', resource === 'energy' ? 'condEnergy' : 'condRage'],
    ...(hasCombo(cls.id, state.spec) ? [['combo', 'condCombo'] as [ConditionKind, TKey]] : []),
  ];

  const save = (next: PriorityEntry[]) => {
    const priority = { ...state.priority };
    if (isCustomized(defaults, next)) priority[storeKey] = next;
    else delete priority[storeKey];
    set({ priority, weights: null });
  };
  const update = (i: number, patch: Partial<PriorityEntry>) => save(order.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    save(next);
  };
  const setCond = (i: number, c: number, patch: Partial<StepCondition>) =>
    update(i, { conditions: order[i].conditions.map((x, k) => (k === c ? { ...x, ...patch } : x)) });

  /** Ajoute un sort juste avant le sort de remplissage (ou à la fin). */
  const addSpell = (stepId: string) => {
    const next = [...order];
    const at = next.findIndex((e) => e.id === 'filler');
    next.splice(at < 0 ? next.length : at, 0, { id: stepId, enabled: true, conditions: [] });
    save(next);
  };
  const hasTalent = (key?: string) => !key || rank(state.talents, key) > 0;

  const label = (id: string) => {
    const extra = extraById.get(id);
    if (extra)
      return (
        <span className="spell-name">
          <Icon name={extra.icon} size={18} /> {L(extra.name)} {!hasTalent(extra.requiresTalent) && <span className="muted small">{t('talentRequired')}</span>}
        </span>
      );
    if (isExtraStep(id)) return <span className="spell-name muted">{id}</span>;
    return cls.data.spellMeta[id] ? <SpellName id={id} /> : <span className="spell-name">{t(`step_${id}` as TKey)}</span>;
  };

  const List = orderable ? 'ol' : 'ul';
  return (
    <>
      <List className={`prio-list ${orderable ? '' : 'unordered'}`}>
        {order.map((e, i) => (
          <li key={e.id} className={e.enabled ? '' : 'muted'}>
            <div className="prio-row">
              <input type="checkbox" aria-label={e.id} checked={e.enabled} onChange={(ev) => update(i, { enabled: ev.target.checked })} />
              <span className="prio-label">{label(e.id)}</span>
              {orderable && (
                <>
                  <button className="btn secondary small" title={t('prioUp')} aria-label={t('prioUp')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn secondary small" title={t('prioDown')} aria-label={t('prioDown')} disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
                </>
              )}
              <button
                className="btn secondary small"
                onClick={() => update(i, { conditions: [...e.conditions, { kind: 'targetHp', op: '<', value: DEFAULT_VALUE.targetHp }] })}
              >
                {t('prioAddCond')}
              </button>
              {isExtraStep(e.id) && (
                <button className="btn secondary small" title={t('prioRemoveSpell')} aria-label={t('prioRemoveSpell')} onClick={() => save(order.filter((_, k) => k !== i))}>
                  ×
                </button>
              )}
            </div>
            {e.conditions.map((c, k) => (
              <div className="prio-cond" key={k}>
                <select value={c.kind} onChange={(ev) => setCond(i, k, { kind: ev.target.value as ConditionKind, value: DEFAULT_VALUE[ev.target.value as ConditionKind] })}>
                  {kinds.map(([kind, key]) => (
                    <option key={kind} value={kind}>{t(key)}</option>
                  ))}
                  {!kinds.some(([kind]) => kind === c.kind) && <option value={c.kind}>{c.kind}</option>}
                </select>
                <select value={c.op} onChange={(ev) => setCond(i, k, { op: ev.target.value as StepCondition['op'] })}>
                  <option value="<">&lt;</option>
                  <option value=">=">≥</option>
                </select>
                <input
                  type="number"
                  value={c.value}
                  min={0}
                  step={c.kind === 'combo' ? 1 : 5}
                  onChange={(ev) => setCond(i, k, { value: Number.isFinite(ev.target.valueAsNumber) ? ev.target.valueAsNumber : 0 })}
                />
                <button
                  className="btn secondary small"
                  title={t('prioRemoveCond')}
                  aria-label={t('prioRemoveCond')}
                  onClick={() => update(i, { conditions: e.conditions.filter((_, x) => x !== k) })}
                >
                  ×
                </button>
              </div>
            ))}
          </li>
        ))}
      </List>
      {extras.length > 0 && (
        <label className="field">
          {t('prioAddSpell')}
          <select value="" onChange={(ev) => ev.target.value && addSpell(ev.target.value)}>
            <option value="">—</option>
            {extras
              .filter((s) => !order.some((e) => e.id === extraStepId(s.id)))
              .map((s) => (
                <option key={s.id} value={extraStepId(s.id)} disabled={!hasTalent(s.requiresTalent)}>
                  {L(s.name)}
                  {s.aoe ? ` (${t('prioAoe')})` : ''}
                  {s.selfDamage ? ` (${t('prioSelfDamage')})` : ''}
                  {!hasTalent(s.requiresTalent) ? ` ${t('talentRequired')}` : ''}
                </option>
              ))}
          </select>
          <span className="small muted">{t('prioAddSpellHelp')}</span>
        </label>
      )}
      {modified && (
        <button className="btn secondary small" onClick={() => save([])}>
          {t(orderable ? 'prioReset' : 'cdReset')}
        </button>
      )}
    </>
  );
}
