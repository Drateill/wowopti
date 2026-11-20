import { useState } from 'react';
import type { SpellDef } from '../data/types';
import type { SimResult, SpellBreakdown } from '../engine/simTypes';
import { useI18n } from '../i18n';
import { useStore } from '../state/store';
import { SpellName, useMetric } from './SimPanel';
import { NumberField } from './ui';

// Recalage avec un vrai combat : on compare le coup moyen simulé (critiques compris) à celui relevé
// dans un journal de combat (Details!, Warcraft Logs…), sort par sort. Le coup moyen ne dépend ni de
// la durée du combat ni du nombre de lancers, ce qui le rend comparable d'un combat à l'autre.

type Kind = 'direct' | 'dot';

/** Ce qu'on compare pour un sort : coup direct ou tick de dégâts sur la durée (les sorts mixtes sont ignorés). */
function kindOf(s: SpellDef | undefined, e: SpellBreakdown): Kind | null {
  if (!s) return null;
  const direct = s.directMax !== undefined && (s.directMax > 0 || (s.directCoeff ?? 0) > 0);
  const dot = s.dotTotal !== undefined && s.dotTotal > 0;
  if (direct && !dot && e.hits + e.crits > 0) return 'direct';
  if (dot && !direct && e.ticks > 0) return 'dot';
  return null;
}

/** Sort recalé : base et coefficient multipliés par le rapport réel / simulé. */
export function scaleSpell(s: SpellDef, kind: Kind, ratio: number): SpellDef {
  const r = (v: number | undefined) => (v === undefined ? v : Math.round(v * ratio * 1000) / 1000);
  return kind === 'direct'
    ? { ...s, directMin: r(s.directMin), directMax: r(s.directMax), directCoeff: r(s.directCoeff) }
    : { ...s, dotTotal: r(s.dotTotal), dotCoeff: r(s.dotCoeff) };
}

export function Calibration({ r }: { r: SimResult }) {
  const { state, set } = useStore();
  const { t, num } = useI18n();
  const metric = useMetric();
  const [realTotal, setRealTotal] = useState(0);
  const [real, setReal] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);

  const spells = new Map(state.spells.map((s) => [s.id, s]));
  const rows = r.breakdown
    .map((e) => ({ e, s: spells.get(e.id), kind: kindOf(spells.get(e.id), e) }))
    .filter((x): x is { e: SpellBreakdown; s: SpellDef; kind: Kind } => !!x.kind && x.e.damage > 0)
    .map((x) => ({ ...x, sim: x.kind === 'direct' ? x.e.damage / (x.e.hits + x.e.crits) : x.e.damage / x.e.ticks }));
  const fightAdjusted = (state.targets ?? 1) > 1 || (state.movementPct ?? 0) > 0;
  const gap = (a: number, b: number) => ((a - b) / b) * 100;

  const apply = (id: string, kind: Kind, ratio: number) => {
    set({ spells: state.spells.map((s) => (s.id === id ? scaleSpell(s, kind, ratio) : s)), weights: null });
    setReal((v) => ({ ...v, [id]: 0 }));
  };

  return (
    <div className="panel grid">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3>{t('calTitle')}</h3>
        <button className="btn secondary small" onClick={() => setOpen(!open)}>{open ? t('calHide') : t('calShow')}</button>
      </div>
      {open && (
        <>
          <p className="small muted">{t('calHelp')}</p>
          {fightAdjusted && <p className="small warn">{t('calFightWarn')}</p>}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <NumberField label={t('calRealTotal', { m: t(`metric_${metric}` as never) })} value={realTotal} min={0} onChange={(v) => setRealTotal(Math.max(0, v || 0))} width={120} />
            {realTotal > 0 && (
              <span className="small">
                {t('calSimTotal')} <b>{num(r.dps, 1)}</b> — {t('calGap')}{' '}
                <b className={Math.abs(gap(r.dps, realTotal)) <= 5 ? 'good' : 'warn'}>{num(gap(r.dps, realTotal), 1)} %</b>
              </span>
            )}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('spell')}</th>
                  <th className="num">{t('calSimAvg')}</th>
                  <th className="num">{t('calRealAvg')}</th>
                  <th className="num">{t('calGap')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ e, s, kind, sim }) => {
                  const v = real[e.id] ?? 0;
                  const g = v > 0 ? gap(sim, v) : null;
                  return (
                    <tr key={e.id}>
                      <td>
                        <SpellName id={e.id} /> <span className="small muted">{t(kind === 'direct' ? 'calPerHit' : 'calPerTick')}</span>
                      </td>
                      <td className="num">{num(sim, 0)}</td>
                      <td className="num">
                        <input type="number" min={0} value={v || ''} style={{ width: 86 }} onChange={(ev) => setReal((x) => ({ ...x, [e.id]: Math.max(0, ev.target.valueAsNumber || 0) }))} />
                      </td>
                      <td className={`num ${g === null ? '' : Math.abs(g) <= 5 ? 'good' : 'warn'}`}>{g === null ? '—' : `${num(g, 1)} %`}</td>
                      <td className="num">
                        {g !== null && Math.abs(g) > 1 && (
                          <button className="btn secondary small" title={t('calApplyHelp')} onClick={() => apply(s.id, kind, v / sim)}>
                            {t('calApply')}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
