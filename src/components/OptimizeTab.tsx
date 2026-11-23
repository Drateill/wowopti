import { useEffect, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { extraSpellsFor, isExtraStep } from '../data/extraSpells';
import {
  EFFORTS,
  explainChanges,
  optimizeRotation,
  revertChange,
  startRotation,
  type Change,
  type ChangeContribution,
  type OptimizerProgress,
  type OptimizerResult,
  type Rotation,
} from '../engine/optimizer';
import { resolveOrder, type ConditionKind, type PriorityEntry, type StepCondition } from '../engine/priority';
import { cooldownKey, rotationResource, rotationSteps } from '../engine/rotationSteps';
import { evaluateConfigs } from '../engine/simPool';
import { useI18n, type TKey } from '../i18n';
import {
  activeScenarios,
  conditionKinds,
  DEFAULT_OPT,
  effectiveRanges,
  proposableExtras,
  scenarioEvaluator,
  searchSpace,
  tunableCooldowns,
  withRotation,
  type OptPrefs,
  type Scenario,
} from '../state/optimize';
import { profileOf, useStore } from '../state/store';
import { SpellName } from './SimPanel';
import { Icon, Progress } from './ui';

const axis = { stroke: '#9a92a8', fontSize: 11 };
const tooltipStyle = { contentStyle: { background: '#0b0a0f', border: '1px solid #322c3d' }, labelStyle: { color: '#9a92a8' } };

const COND_LABEL: Record<ConditionKind, TKey> = {
  targetHp: 'condTargetHp',
  elapsed: 'condElapsed',
  remaining: 'condRemaining',
  resourcePct: 'condManaPct',
  resource: 'condEnergy',
  combo: 'condCombo',
};

/** En dessous de 0,1 % du DPS, un changement est considéré comme négligeable (souvent du bruit). */
const NEGLIGIBLE = 0.001;

/** La rotation sans ses changements négligeables (plus simple à jouer, même DPS). */
function simplify(start: Rotation, best: Rotation, list: ChangeContribution[], dps: number): Rotation {
  return list.filter((x) => x.dps < dps * NEGLIGIBLE).reduce((r, x) => revertChange(r, start, x.change), best);
}

/** Dernier résultat, gardé quand on change d'onglet (par classe et spécialisation). */
const lastResults = new Map<string, OptimizerResult>();

export function OptimizeTab() {
  const { state, set, cls } = useStore();
  const { t, num } = useI18n();
  const prefs: OptPrefs = { ...DEFAULT_OPT, ...state.opt };
  const setPrefs = (patch: Partial<OptPrefs>) => set({ opt: { ...prefs, ...patch } });
  const key = `${cls.id}:${state.spec}`;
  const steps = rotationSteps(cls.id, state.spec);

  const [progress, setProgress] = useState<OptimizerProgress | null>(null);
  const [result, setResultState] = useState<OptimizerResult | null>(lastResults.get(key) ?? null);
  const [selected, setSelected] = useState(0);
  const [explained, setExplained] = useState<Record<number, ChangeContribution[] | 'loading'>>({});
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const running = progress !== null;

  const setResult = (r: OptimizerResult | null) => {
    if (r) lastResults.set(key, r);
    else lastResults.delete(key);
    setResultState(r);
    setSelected(0);
    setExplained({});
  };

  useEffect(() => setResultState(lastResults.get(key) ?? null), [key]);

  const resourceLabel = () => {
    const r = rotationResource(cls.id, state.spec);
    return r === 'energy' ? t('condEnergy') : r === 'rage' ? t('condRage') : t('condManaPct');
  };
  const condLabel = (k: ConditionKind) => (k === 'resource' ? resourceLabel() : t(COND_LABEL[k]));
  const condText = (c: StepCondition) => `${condLabel(c.kind)} ${c.op === '<' ? '<' : '≥'} ${num(c.value, 0)}`;

  const run = async () => {
    const snapshot = state;
    const space = searchSpace(snapshot, cls, prefs);
    const current = startRotation(space, snapshot.priority?.[snapshot.spec], snapshot.priority?.[cooldownKey(snapshot.spec)]);
    const starts = [current, ...(prefs.fromDefault ? [startRotation(space, undefined, undefined)] : [])];
    const evaluate = scenarioEvaluator(snapshot, activeScenarios(snapshot), evaluateConfigs);
    stop.current = false;
    setResult(null);
    setError(null);
    setProgress({ start: 0, starts: starts.length, round: 0, evaluated: 0, bestDps: 0, startDps: 0, phase: 'search' });
    try {
      const res = await optimizeRotation(space, starts, evaluate, EFFORTS[prefs.effort], setProgress, () => stop.current);
      setResult(res);
      if (res.candidates[0]) void explain(res, 0, snapshot);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setProgress(null);
    }
  };

  const explain = async (res: OptimizerResult, i: number, snapshot = state) => {
    setExplained((x) => ({ ...x, [i]: 'loading' }));
    const evaluate = scenarioEvaluator(snapshot, activeScenarios(snapshot), evaluateConfigs);
    const list = await explainChanges(res.start, res.candidates[i].rotation, evaluate, EFFORTS[prefs.effort].confirmIterations);
    setExplained((x) => ({ ...x, [i]: list }));
  };

  const apply = (r: Rotation) => set({ priority: { ...state.priority, [state.spec]: r.priority, [cooldownKey(state.spec)]: r.cooldowns }, weights: null });
  const saveProfile = (r: Rotation, dps: number) => {
    const name = t('optProfileName', { dps: num(dps, 1) });
    set({ profiles: [...state.profiles, { id: `p-${Date.now().toString(36)}`, name, data: profileOf(withRotation(state, r)) }] });
  };

  if (steps.length === 0) return <div className="panel muted">{t('prioNone')}</div>;
  const cand = result?.candidates[selected];

  return (
    <div className="grid sim-layout">
      <div className="panel grid" style={{ alignContent: 'start' }}>
        <h2>{t('optTitle')}</h2>
        <p className="small muted">{t('optHelp')}</p>
        <ScenarioEditor prefs={prefs} setPrefs={setPrefs} />
        <SpaceEditor prefs={prefs} setPrefs={setPrefs} condLabel={condLabel} />
        <div className="row">
          <label className="field">
            {t('optEffort')}
            <select value={prefs.effort} onChange={(e) => setPrefs({ effort: e.target.value as OptPrefs['effort'] })}>
              <option value="quick">{t('optEffortQuick')}</option>
              <option value="normal">{t('optEffortNormal')}</option>
              <option value="deep">{t('optEffortDeep')}</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.fromDefault} onChange={(e) => setPrefs({ fromDefault: e.target.checked })} /> {t('optFromDefault')}
          </label>
        </div>
        {!running ? (
          <button className="btn" onClick={run}>
            {t('optRun')}
          </button>
        ) : (
          <button className="btn secondary" onClick={() => (stop.current = true)} disabled={progress?.phase !== 'search'}>
            {t('optStop')}
          </button>
        )}
        {error && <p className="bad small">{error}</p>}
      </div>

      <div className="grid" style={{ alignContent: 'start' }}>
        {!result && !running && <div className="panel muted">{t('optEmpty')}</div>}
        {running && progress && (
          <div className="panel grid" role="status">
            <span className="small">
              {progress.phase === 'confirm'
                ? t('optConfirming')
                : t('optProgressFull', {
                    start: progress.start + 1,
                    starts: progress.starts,
                    round: progress.round,
                    n: progress.evaluated,
                    from: num(progress.startDps, 1),
                    to: num(progress.bestDps, 1),
                  })}
            </span>
            <Progress value={Math.min(1, (progress.start + (progress.phase === 'confirm' ? 1 : progress.round / EFFORTS[prefs.effort].maxRounds)) / progress.starts)} />
          </div>
        )}
        {result && (
          <>
            <div className="panel grid">
              <h3>{t('optResults')}</h3>
              <p className="small muted">
                {t('optStartDps', { dps: num(result.startEval.dps, 1) })} · {t('optEvaluated', { n: result.evaluated })}
                {result.stopped ? ` · ${t('optStopped')}` : ''}
              </p>
              {result.candidates.length === 0 ? (
                <p className="muted">{t('optNothing')}</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>DPS</th>
                        <th>{t('optGain')}</th>
                        <th>{t('optReliableCol')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.candidates.map((c, i) => (
                        <tr
                          key={i}
                          className={i === selected ? 'selected' : ''}
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setSelected(i);
                            if (!explained[i]) void explain(result, i);
                          }}
                        >
                          <td>{i + 1}</td>
                          <td>{num(c.eval.dps, 1)}</td>
                          <td className={c.reliable ? 'good' : 'muted'}>
                            {c.gain >= 0 ? '+' : ''}
                            {num(c.gain, 1)} ± {num(c.margin, 1)}
                          </td>
                          <td>{c.reliable ? '✓' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {result.candidates.length > 0 && !result.candidates[0].reliable && <p className="small muted">{t('optNoReliable')}</p>}
            </div>
            {result.history.length > 1 && (
              <div className="panel">
                <h3>{t('optCurve')}</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={result.history}>
                    <CartesianGrid stroke="#322c3d" strokeDasharray="3 3" />
                    <XAxis dataKey="round" {...axis} />
                    <YAxis {...axis} domain={['auto', 'auto']} width={48} />
                    <Tooltip {...tooltipStyle} formatter={(v: number) => num(v, 1)} labelFormatter={(r) => t('optRound', { round: r })} />
                    <Line type="monotone" dataKey="dps" stroke="#9b6cf0" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {cand && (
              <div className="panel grid">
                <h3>{t('optCandidate', { n: selected + 1, dps: num(cand.eval.dps, 1) })}</h3>
                <ol className="prio-list">
                  {cand.rotation.priority.map((e) => (
                    <ResultRow key={e.id} e={e} changed={changedStep(result.start.priority, e)} condText={condText} />
                  ))}
                </ol>
                {cand.rotation.cooldowns.length > 0 && (
                  <>
                    <span className="small">{t('cdTitle')}</span>
                    <ul className="prio-list unordered">
                      {cand.rotation.cooldowns.map((e) => (
                        <ResultRow key={e.id} e={e} changed={changedStep(result.start.cooldowns, e)} condText={condText} />
                      ))}
                    </ul>
                  </>
                )}
                <h4>{t('optWhy')}</h4>
                <Contributions value={explained[selected]} condText={condText} threshold={cand.eval.dps * NEGLIGIBLE} />
                <div className="row">
                  <button className="btn" onClick={() => apply(cand.rotation)}>
                    {t('optApply')}
                  </button>
                  {Array.isArray(explained[selected]) && (explained[selected] as ChangeContribution[]).some((x) => x.dps < cand.eval.dps * NEGLIGIBLE) && (
                    <button className="btn secondary" onClick={() => apply(simplify(result.start, cand.rotation, explained[selected] as ChangeContribution[], cand.eval.dps))}>
                      {t('optApplySimple')}
                    </button>
                  )}
                  <button className="btn secondary" onClick={() => saveProfile(cand.rotation, cand.eval.dps)}>
                    {t('optSaveProfile')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Combats optimisés : par défaut celui de l'onglet Simulation, sinon un mélange pondéré. */
function ScenarioEditor({ prefs, setPrefs }: { prefs: OptPrefs; setPrefs: (p: Partial<OptPrefs>) => void }) {
  const { state } = useStore();
  const { t } = useI18n();
  const list = prefs.scenarios;
  const current = (): Scenario => ({
    id: `s-${Date.now().toString(36)}-${list.length}`,
    name: '',
    weight: 50,
    fightLength: state.fightLength,
    targets: state.targets ?? 1,
    movementPct: state.movementPct ?? 0,
  });
  const update = (i: number, patch: Partial<Scenario>) => setPrefs({ scenarios: list.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const numIn = (v: number, onChange: (v: number) => void, min = 0, max?: number) => (
    <input type="number" value={v} min={min} max={max} onChange={(e) => onChange(Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0)} />
  );
  const total = list.reduce((a, s) => a + Math.max(0, s.weight), 0) || 1;

  return (
    <div className="grid">
      <h3>{t('optFights')}</h3>
      {list.length === 0 ? (
        <p className="small muted">{t('optFightCurrent', { s: state.fightLength, n: state.targets ?? 1, m: state.movementPct ?? 0 })}</p>
      ) : (
        <div className="table-wrap">
          <table className="scenario-table">
            <thead>
              <tr>
                <th>{t('optFightName')}</th>
                <th>{t('optWeight')}</th>
                <th>{t('duration')}</th>
                <th>{t('fightTargets')}</th>
                <th>{t('fightMovement')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={s.id}>
                  <td>
                    <input value={s.name} placeholder={t('optFightN', { n: i + 1 })} onChange={(e) => update(i, { name: e.target.value })} />
                  </td>
                  <td>
                    {numIn(s.weight, (v) => update(i, { weight: Math.max(0, v) }))}
                    <span className="small muted"> {Math.round((Math.max(0, s.weight) / total) * 100)} %</span>
                  </td>
                  <td>{numIn(s.fightLength, (v) => update(i, { fightLength: Math.max(10, v) }), 10)}</td>
                  <td>{numIn(s.targets, (v) => update(i, { targets: Math.max(1, Math.min(10, Math.round(v))) }), 1, 10)}</td>
                  <td>{numIn(s.movementPct, (v) => update(i, { movementPct: Math.max(0, Math.min(60, v)) }), 0, 60)}</td>
                  <td>
                    <button className="btn secondary small" aria-label={t('optRemoveFight')} onClick={() => setPrefs({ scenarios: list.filter((_, k) => k !== i) })}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row">
        <button className="btn secondary small" onClick={() => setPrefs({ scenarios: list.length ? [...list, current()] : [{ ...current(), name: t('optFightMain') }, current()] })}>
          {t('optAddFight')}
        </button>
        {list.length > 0 && (
          <button className="btn secondary small" onClick={() => setPrefs({ scenarios: [] })}>
            {t('optUseCurrent')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Ce que l'optimiseur a le droit de changer. */
function SpaceEditor({ prefs, setPrefs, condLabel }: { prefs: OptPrefs; setPrefs: (p: Partial<OptPrefs>) => void; condLabel: (k: ConditionKind) => string }) {
  const { state, cls } = useStore();
  const { t, L } = useI18n();
  const steps = rotationSteps(cls.id, state.spec);
  const order = resolveOrder(steps, state.priority?.[state.spec]);
  const locked = new Set(prefs.locked[state.spec] ?? []);
  const extras = proposableExtras(state, cls);
  const ranges = effectiveRanges({ ...state, opt: prefs }, cls);
  const kinds = conditionKinds(rotationResource(cls.id, state.spec), cls.id === 'rogue' || (cls.id === 'druid' && state.spec === 'cat'));
  const check = (k: 'order' | 'disable' | 'extras' | 'conditions' | 'cooldowns', label: TKey, disabled = false) => (
    <label className={`check ${disabled ? 'muted' : ''}`}>
      <input type="checkbox" disabled={disabled} checked={prefs[k] && !disabled} onChange={(e) => setPrefs({ [k]: e.target.checked })} /> {t(label)}
    </label>
  );
  const setRange = (k: ConditionKind, patch: Partial<(typeof ranges)[ConditionKind]>) => setPrefs({ ranges: { ...prefs.ranges, [k]: { ...ranges[k], ...patch } } });

  return (
    <div className="grid">
      <h3>{t('optAllowed')}</h3>
      <div className="grid" style={{ gap: 4 }}>
        {check('order', 'optAllowOrder')}
        {check('disable', 'optAllowDisable')}
        {check('extras', 'optAllowExtras', extras.length === 0)}
        {check('conditions', 'optAllowConditions')}
        {check('cooldowns', 'optAllowCooldowns', tunableCooldowns(state, cls).length === 0)}
      </div>

      <details>
        <summary>{t('optLocked', { n: locked.size })}</summary>
        <p className="small muted">{t('optLockedHelp')}</p>
        <div className="grid" style={{ gap: 4 }}>
          {order.map((e) => (
            <label key={e.id} className="check">
              <input
                type="checkbox"
                checked={locked.has(e.id)}
                onChange={(ev) => {
                  const next = new Set(locked);
                  if (ev.target.checked) next.add(e.id);
                  else next.delete(e.id);
                  setPrefs({ locked: { ...prefs.locked, [state.spec]: [...next] } });
                }}
              />
              <StepLabel id={e.id} />
            </label>
          ))}
        </div>
      </details>

      {prefs.extras && extras.length > 0 && (
        <details>
          <summary>{t('optSpells', { n: extras.length - prefs.blockedExtras.filter((id) => extras.some((s) => s.id === id)).length, total: extras.length })}</summary>
          <div className="grid" style={{ gap: 4 }}>
            {extras.map((s) => (
              <label key={s.id} className="check">
                <input
                  type="checkbox"
                  checked={!prefs.blockedExtras.includes(s.id)}
                  onChange={(e) => setPrefs({ blockedExtras: e.target.checked ? prefs.blockedExtras.filter((x) => x !== s.id) : [...prefs.blockedExtras, s.id] })}
                />
                <span className="spell-name">
                  <Icon name={s.icon} size={18} /> {L(s.name)}
                </span>
              </label>
            ))}
          </div>
        </details>
      )}

      {prefs.conditions && (
        <details>
          <summary>{t('optRanges')}</summary>
          <p className="small muted">{t('optRangesHelp')}</p>
          <div className="table-wrap">
            <table className="scenario-table">
              <thead>
                <tr>
                  <th />
                  <th>{t('optMin')}</th>
                  <th>{t('optMax')}</th>
                  <th>{t('optStep')}</th>
                </tr>
              </thead>
              <tbody>
                {kinds.map((k) => (
                  <tr key={k} className={ranges[k].on ? '' : 'muted'}>
                    <td>
                      <label className="check">
                        <input type="checkbox" checked={ranges[k].on} onChange={(e) => setRange(k, { on: e.target.checked })} /> {condLabel(k)}
                      </label>
                    </td>
                    {(['min', 'max', 'step'] as const).map((f) => (
                      <td key={f}>
                        <input
                          type="number"
                          value={ranges[k][f]}
                          min={f === 'step' ? 1 : 0}
                          onChange={(e) => setRange(k, { [f]: Math.max(f === 'step' ? 1 : 0, Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : 0) })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

/** Nom d'une étape : sort de base, sort ajouté ou étape particulière. */
function StepLabel({ id }: { id: string }) {
  const { t, L } = useI18n();
  const { cls } = useStore();
  const extra = isExtraStep(id) ? extraSpellsFor(cls).find((s) => `spell:${s.id}` === id) : undefined;
  if (extra)
    return (
      <span className="spell-name">
        <Icon name={extra.icon} size={18} /> {L(extra.name)}
      </span>
    );
  if (cls.data.spellMeta[id]) return <SpellName id={id} />;
  return <span className="spell-name">{t(`step_${id}` as TKey)}</span>;
}

/** L'étape a-t-elle changé (ajout, activation, conditions) par rapport à la rotation de départ ? */
function changedStep(start: PriorityEntry[], e: PriorityEntry): boolean {
  const s = start.find((x) => x.id === e.id);
  return !s || s.enabled !== e.enabled || JSON.stringify(s.conditions) !== JSON.stringify(e.conditions);
}

function ResultRow({ e, changed, condText }: { e: PriorityEntry; changed: boolean; condText: (c: StepCondition) => string }) {
  const { t } = useI18n();
  return (
    <li className={`${e.enabled ? '' : 'muted'} ${changed ? 'changed' : ''}`}>
      <span className="prio-label">
        <StepLabel id={e.id} /> {!e.enabled && <span className="small">({t('optDisabled')})</span>}
        {e.conditions.map((c, k) => (
          <span key={k} className="small cond-chip">
            {condText(c)}
          </span>
        ))}
      </span>
    </li>
  );
}

/** Ce que rapporte chaque changement (DPS perdus si on le retire seul). */
function Contributions({ value, condText, threshold }: { value: ChangeContribution[] | 'loading' | undefined; condText: (c: StepCondition) => string; threshold: number }) {
  const { t, num } = useI18n();
  if (value === 'loading' || value === undefined) return <p className="small muted">{t('optExplaining')}</p>;
  if (value.length === 0) return <p className="small muted">{t('optNoChange')}</p>;
  const conds = (c?: StepCondition[]) => (c && c.length ? c.map(condText).join(', ') : t('optNoCondition'));
  const describe = (c: Change) => {
    switch (c.kind) {
      case 'added':
        return t('optChAdded', { n: c.to ?? 0 });
      case 'removed':
        return t('optChRemoved');
      case 'enabled':
        return t('optChEnabled');
      case 'disabled':
        return t('optChDisabled');
      case 'moved':
        return t('optChMoved', { from: c.from ?? 0, to: c.to ?? 0 });
      case 'conditions':
        return `${conds(c.before)} → ${conds(c.after)}`;
    }
  };
  return (
    <>
      <p className="small muted">{t('optWhyHelp')}</p>
      <div className="table-wrap">
        <table>
          <tbody>
            {value.map((x, i) => (
              <tr key={i}>
                <td>
                  <StepLabel id={x.change.id} />
                </td>
                <td className="small">{describe(x.change)}</td>
                <td className={x.dps >= threshold ? 'good' : 'muted'}>
                  {x.dps >= 0 ? '+' : ''}
                  {num(x.dps, 1)}
                  {x.dps < threshold && <span className="small"> ({t('optNegligible')})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
