import { useRef, useState } from 'react';
import { extraSpellsFor, isExtraStep } from '../data/extraSpells';
import { DEFAULT_OPTIMIZER, optimizeRotation, startRotation, type OptimizerProgress, type OptimizerResult, type Rotation } from '../engine/optimizer';
import type { PriorityEntry, StepCondition } from '../engine/priority';
import { cooldownKey } from '../engine/rotationSteps';
import { evaluateConfigs } from '../engine/simPool';
import { useI18n, type TKey } from '../i18n';
import { optimizerSetup, rotationConfig } from '../state/optimize';
import { useStore } from '../state/store';
import { SpellName } from './SimPanel';
import { Icon, Progress } from './ui';

const COND_LABEL: Record<StepCondition['kind'], TKey> = {
  targetHp: 'condTargetHp',
  elapsed: 'condElapsed',
  remaining: 'condRemaining',
  resourcePct: 'condManaPct',
  resource: 'condEnergy',
  combo: 'condCombo',
};

/** Recherche automatique de la rotation qui fait le plus de dégâts, pour le combat réglé. */
export function OptimizerPanel() {
  const { state, set, cls } = useStore();
  const { t, num } = useI18n();
  const [progress, setProgress] = useState<OptimizerProgress | null>(null);
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const running = progress !== null;

  const run = async () => {
    const setup = optimizerSetup(state, cls);
    const start = startRotation(setup, state.priority?.[state.spec], state.priority?.[cooldownKey(state.spec)]);
    const snapshot = state; // l'état peut changer pendant le calcul : on optimise celui du clic
    stop.current = false;
    setResult(null);
    setError(null);
    setProgress({ round: 0, evaluated: 0, bestDps: 0, startDps: 0, phase: 'search' });
    try {
      const res = await optimizeRotation(
        setup,
        start,
        (rotations, iterations, seed) => evaluateConfigs(rotations.map((r) => rotationConfig(snapshot, r, iterations, seed))),
        DEFAULT_OPTIMIZER,
        setProgress,
        () => stop.current,
      );
      setResult(res);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setProgress(null);
    }
  };

  const apply = (r: Rotation) => {
    set({ priority: { ...state.priority, [state.spec]: r.priority, [cooldownKey(state.spec)]: r.cooldowns }, weights: null });
    setResult(null);
  };

  const condText = (c: StepCondition) => {
    const label = c.kind === 'resource' ? (cls.id === 'warrior' || state.spec === 'bear' ? t('condRage') : t('condEnergy')) : t(COND_LABEL[c.kind]);
    return `${label} ${c.op === '<' ? '<' : '≥'} ${num(c.value, 0)}`;
  };

  return (
    <div className="optimizer">
      <h4>{t('optTitle')}</h4>
      <p className="small muted">{t('optHelp')}</p>
      {!running && (
        <button className="btn secondary" onClick={run}>
          {t('optRun')}
        </button>
      )}
      {running && progress && (
        <div className="grid" role="status">
          <span className="small">
            {progress.phase === 'confirm'
              ? t('optConfirming')
              : t('optProgress', { round: progress.round, n: progress.evaluated, from: num(progress.startDps, 1), to: num(progress.bestDps, 1) })}
          </span>
          <Progress value={Math.min(1, (progress.round + (progress.phase === 'confirm' ? 1 : 0)) / (DEFAULT_OPTIMIZER.maxRounds + 1))} />
          <button className="btn secondary small" onClick={() => (stop.current = true)} disabled={progress.phase === 'confirm'}>
            {t('optStop')}
          </button>
        </div>
      )}
      {error && <p className="bad small">{error}</p>}
      {result && (
        <div className="grid">
          <p>
            <b>
              {num(result.startEval.dps, 1)} → {num(result.bestEval.dps, 1)} DPS
            </b>{' '}
            <span className={result.reliable ? 'good' : 'muted'}>
              ({result.gain >= 0 ? '+' : ''}
              {num(result.gain, 1)} ± {num(result.margin, 1)})
            </span>
          </p>
          <p className="small muted">
            {result.reliable ? t('optReliable', { n: result.evaluated }) : t('optNoGain', { n: result.evaluated })}
          </p>
          {result.reliable && (
            <>
              <ol className="prio-list">
                {result.best.priority.map((e) => (
                  <ResultRow key={e.id} e={e} changed={changedStep(result.start.priority, e)} condText={condText} />
                ))}
              </ol>
              {result.best.cooldowns.some((c) => changedStep(result.start.cooldowns, c)) && (
                <>
                  <span className="small">{t('cdTitle')}</span>
                  <ul className="prio-list unordered">
                    {result.best.cooldowns.map((e) => (
                      <ResultRow key={e.id} e={e} changed={changedStep(result.start.cooldowns, e)} condText={condText} />
                    ))}
                  </ul>
                </>
              )}
              <div className="row">
                <button className="btn" onClick={() => apply(result.best)}>
                  {t('optApply')}
                </button>
                <button className="btn secondary" onClick={() => setResult(null)}>
                  {t('optDiscard')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** L'étape a-t-elle changé (place, activation, conditions) par rapport à la rotation de départ ? */
function changedStep(start: PriorityEntry[], e: PriorityEntry): boolean {
  const i = start.findIndex((x) => x.id === e.id);
  if (i < 0) return true;
  const s = start[i];
  return s.enabled !== e.enabled || JSON.stringify(s.conditions) !== JSON.stringify(e.conditions);
}

function ResultRow({ e, changed, condText }: { e: PriorityEntry; changed: boolean; condText: (c: StepCondition) => string }) {
  const { t, L } = useI18n();
  const { cls } = useStore();
  const extra = isExtraStep(e.id) ? extraSpellsFor(cls).find((s) => `spell:${s.id}` === e.id) : undefined;
  const label = extra ? (
    <span className="spell-name">
      <Icon name={extra.icon} size={18} /> {L(extra.name)}
    </span>
  ) : cls.data.spellMeta[e.id] ? (
    <SpellName id={e.id} />
  ) : (
    <span className="spell-name">{t(`step_${e.id}` as TKey)}</span>
  );
  return (
    <li className={`${e.enabled ? '' : 'muted'} ${changed ? 'changed' : ''}`}>
      <span className="prio-label">
        {label} {!e.enabled && <span className="small">({t('optDisabled')})</span>}
        {e.conditions.map((c, k) => (
          <span key={k} className="small cond-chip">
            {condText(c)}
          </span>
        ))}
      </span>
    </li>
  );
}
