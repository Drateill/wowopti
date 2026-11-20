import { isCustomized, resolveOrder, type ConditionKind, type PriorityEntry, type StepCondition } from '../engine/priority';
import { hasCombo, rotationResource, rotationSteps } from '../engine/rotationSteps';
import { useI18n, type TKey } from '../i18n';
import { useStore } from '../state/store';
import { SpellName } from './SimPanel';

/** Rotation personnalisée : ordre des étapes, étapes désactivées et conditions en plus. */
export function RotationEditor() {
  const { state, set, cls } = useStore();
  const { t } = useI18n();
  const defaults = rotationSteps(cls.id, state.spec);
  const custom = state.priority?.[state.spec];
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
  const defaultValue: Record<ConditionKind, number> = { targetHp: 20, elapsed: 30, remaining: 30, resourcePct: 50, resource: 50, combo: 5 };

  const save = (next: PriorityEntry[]) => {
    const priority = { ...state.priority };
    if (isCustomized(defaults, next)) priority[state.spec] = next;
    else delete priority[state.spec];
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

  const label = (id: string) =>
    cls.data.spellMeta[id] ? <SpellName id={id} /> : <span className="spell-name">{t(`step_${id}` as TKey)}</span>;

  if (defaults.length === 0) return null;

  return (
    <details className="rotation-editor" open={modified}>
      <summary>
        {t('prioTitle')} {modified && <span className="warn small">({t('prioModified')})</span>}
      </summary>
      <p className="small muted">{t('prioHelp')}</p>
      <ol className="prio-list">
        {order.map((e, i) => (
          <li key={e.id} className={e.enabled ? '' : 'muted'}>
            <div className="prio-row">
              <input type="checkbox" aria-label={e.id} checked={e.enabled} onChange={(ev) => update(i, { enabled: ev.target.checked })} />
              <span className="prio-label">{label(e.id)}</span>
              <button className="btn secondary small" title={t('prioUp')} aria-label={t('prioUp')} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="btn secondary small" title={t('prioDown')} aria-label={t('prioDown')} disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button
                className="btn secondary small"
                onClick={() => update(i, { conditions: [...e.conditions, { kind: 'targetHp', op: '<', value: defaultValue.targetHp }] })}
              >
                {t('prioAddCond')}
              </button>
            </div>
            {e.conditions.map((c, k) => (
              <div className="prio-cond" key={k}>
                <select value={c.kind} onChange={(ev) => setCond(i, k, { kind: ev.target.value as ConditionKind, value: defaultValue[ev.target.value as ConditionKind] })}>
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
      </ol>
      {modified && (
        <button className="btn secondary small" onClick={() => save([])}>
          {t('prioReset')}
        </button>
      )}
    </details>
  );
}
