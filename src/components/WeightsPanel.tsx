import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { runWeights } from '../engine/simClient';
import { weightSpec } from '../engine/sim';
import { useI18n, type TKey } from '../i18n';
import { characterSheet } from '../state/classLogic';
import { buildConfig, useStore } from '../state/store';
import { Progress } from './ui';

export function WeightsPanel() {
  const { state, set, cls } = useStore();
  const { t, num, stat } = useI18n();
  const [progress, setProgress] = useState<number | null>(null);
  const [baseDps, setBaseDps] = useState<number | null>(null);
  const hitCapped = characterSheet(state).hitCapped;
  const metric = cls.specs.find((x) => x.id === state.spec)?.metric ?? 'dps';
  const base = weightSpec(buildConfig(state)).base;

  const run = async () => {
    setProgress(0);
    try {
      // Plus d'itérations que la sim simple : les écarts mesurés sont petits.
      const iterations = Math.max(state.iterations, 5000);
      const { base, weights } = await runWeights(buildConfig(state, { iterations }), setProgress);
      setBaseDps(base.dps);
      set({ weights });
    } finally {
      setProgress(null);
    }
  };

  const weights = state.weights;
  return (
    <div className="grid grid-2">
      <div className="panel grid" style={{ alignContent: 'start' }}>
        <h2>{t('weightsTitle')}</h2>
        <p className="muted small">{t('weightsIntro', { metric: t(`metric_${metric}` as TKey), base: stat(base) })}</p>
        {metric === 'tps' && <p className="small muted">{t('weightsTankNote')}</p>}
        {hitCapped && <p className="small warn">{t('hitCapped')}</p>}
        <button className="btn" onClick={run} disabled={progress !== null}>
          {progress !== null ? t('computing') : weights ? t('recompute') : t('computeWeights')}
        </button>
        <Progress value={progress} />
        {weights && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('stat')}</th>
                  <th className="num">{t('tested')}</th>
                  <th className="num">{t('perPoint', { metric: t(`metric_${metric}` as TKey) })}</th>
                  <th className="num">EP</th>
                </tr>
              </thead>
              <tbody>
                {weights.map((w) => (
                  <tr key={w.key}>
                    <td>{stat(w.key)}</td>
                    <td className="num">{w.delta}</td>
                    <td className="num">{num(w.perPoint, 3)}</td>
                    <td className="num"><b>{num(w.ep, 2)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {baseDps !== null && (
              <p className="small muted" style={{ marginTop: 8 }}>{t('baseDps', { n: num(baseDps, 1), metric: t(`metric_${metric}` as TKey) })}</p>
            )}
            <p className="small muted">{t('weightsNote', { base: stat(base) })}</p>
          </div>
        )}
      </div>
      {weights && (
        <div className="panel">
          <h3>{t('relativeValue')}</h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={weights.map((w) => ({ name: stat(w.key), ep: +w.ep.toFixed(2) }))} layout="vertical" margin={{ left: 40, right: 16 }}>
              <CartesianGrid stroke="#322c3d" strokeDasharray="3 3" />
              <XAxis type="number" stroke="#9a92a8" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="#9a92a8" fontSize={11} width={120} />
              <Tooltip contentStyle={{ background: '#0b0a0f', border: '1px solid #322c3d' }} />
              <Bar dataKey="ep" fill="#9b6cf0" name="EP" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
