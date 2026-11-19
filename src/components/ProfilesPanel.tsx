import { useState } from 'react';
import { runCompare } from '../engine/simClient';
import { pointsInTree } from '../engine/talents';
import type { SimResult } from '../engine/simTypes';
import { useI18n, type TKey } from '../i18n';
import { characterSheet } from '../state/classLogic';
import { encodeProfile } from '../state/share';
import { buildConfig, profileOf, useStore, type ProfileData } from '../state/store';
import { SpellName } from './SimPanel';
import { Progress } from './ui';

const CURRENT = '__current__';

export function ProfilesPanel() {
  const { state, set, cls } = useStore();
  const { t, num, L } = useI18n();
  const [name, setName] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [a, setA] = useState(CURRENT);
  const [b, setB] = useState(state.profiles[0]?.id ?? CURRENT);
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<{ a: SimResult; b: SimResult; iterations: number } | null>(null);

  const dataOf = (id: string): ProfileData => state.profiles.find((p) => p.id === id)?.data ?? profileOf(state);
  const labelOf = (id: string) => (id === CURRENT ? t('currentSetup') : (state.profiles.find((p) => p.id === id)?.name ?? '?'));
  const specName = (d: ProfileData) => L(cls.specs.find((x) => x.id === d.spec)?.name);
  const spec = (d: ProfileData) =>
    `${cls.specs.length > 1 ? `${specName(d)} ` : ''}${cls.trees.map((_, i) => pointsInTree(d.talents, cls.talents, i)).join('/')}`;

  const save = () => {
    const n = name.trim() || t('profileDefaultName', { n: state.profiles.length + 1 });
    set({ profiles: [...state.profiles, { id: `p-${Date.now().toString(36)}`, name: n, data: profileOf(state) }] });
    setName('');
  };

  const shareLink = async (data: ProfileData) => {
    const code = await encodeProfile(data, state.items, state.classId);
    const url = `${location.origin}${location.pathname}#p=${code}`;
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // le lien reste affiché pour un copier-coller à la main
    }
  };

  const compare = async () => {
    setProgress(0);
    setResults(null);
    try {
      const iterations = Math.max(state.iterations, 3000);
      const cfg = (d: ProfileData) => buildConfig({ ...state, ...d }, { iterations });
      const [ra, rb] = await runCompare([cfg(dataOf(a)), cfg(dataOf(b))], setProgress);
      setResults({ a: ra, b: rb, iterations });
    } finally {
      setProgress(null);
    }
  };

  const sheetOf = (d: ProfileData) => characterSheet({ ...state, ...d }).entries;


  const options = [CURRENT, ...state.profiles.map((p) => p.id)];
  const metric = (id: string) => cls.specs.find((x) => x.id === dataOf(id).spec)?.metric ?? 'dps';
  const metricKey: TKey = metric(a) === metric(b) ? (`metric_${metric(a)}` as TKey) : 'metric_mixed';

  return (
    <div className="grid grid-2">
      <div className="panel grid" style={{ alignContent: 'start' }}>
        <h2>{t('profiles')}</h2>
        <p className="small muted">{t('profilesHelp')}</p>
        <div className="row">
          <input value={name} placeholder={t('profileName')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} style={{ flex: 1 }} />
          <button className="btn" onClick={save}>{t('saveProfile')}</button>
        </div>
        {state.profiles.length === 0 ? (
          <p className="small muted">{t('noProfiles')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <tbody>
                {state.profiles.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.name}</b>
                      <div className="small muted">
                        {spec(p.data)} · {t('itemsCount', { n: Object.keys(p.data.equipped).length })}
                      </div>
                    </td>
                    <td className="num" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn small" onClick={() => set({ ...p.data, weights: null })}>{t('load')}</button>{' '}
                      <button
                        className="btn secondary small"
                        title={t('overwriteHelp')}
                        onClick={() => set({ profiles: state.profiles.map((x) => (x.id === p.id ? { ...x, data: profileOf(state) } : x)) })}
                      >
                        {t('overwrite')}
                      </button>{' '}
                      <button className="btn secondary small" onClick={() => shareLink(p.data)}>{t('link')}</button>{' '}
                      <button className="btn danger small" onClick={() => confirm(t('confirmDeleteProfile', { name: p.name })) && set({ profiles: state.profiles.filter((x) => x.id !== p.id) })}>
                        {t('delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3>{t('shareSetup')}</h3>
        <p className="small muted">{t('shareHelp')}</p>
        <div className="row">
          <button className="btn secondary" onClick={() => shareLink(profileOf(state))}>{t('copySetupLink')}</button>
          {copied && <span className="small good">{t('linkCopied')}</span>}
        </div>
        {link && <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%' }} />}
      </div>

      <div className="panel grid" style={{ alignContent: 'start' }}>
        <h2>{t('compareProfiles')}</h2>
        <div className="row">
          {[
            [a, setA],
            [b, setB],
          ].map(([value, setter], i) => (
            <label key={i} className="field" style={{ flex: 1 }}>
              {i === 0 ? 'A' : 'B'}
              <select value={value as string} onChange={(e) => { (setter as (v: string) => void)(e.target.value); setResults(null); }}>
                {options.map((id) => <option key={id} value={id}>{labelOf(id)}</option>)}
              </select>
            </label>
          ))}
        </div>
        <button className="btn" onClick={compare} disabled={progress !== null || a === b}>
          {progress !== null ? t('simulating') : t('compare')}
        </button>
        <Progress value={progress} />

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th />
                <th className="num">A · {labelOf(a)}</th>
                <th className="num">B · {labelOf(b)}</th>
                <th className="num">B − A</th>
              </tr>
            </thead>
            <tbody>
              {results && (
                <tr>
                  <td><b>{t(metricKey)}</b></td>
                  <td className="num"><b>{num(results.a.dps, 1)}</b></td>
                  <td className="num"><b>{num(results.b.dps, 1)}</b></td>
                  <Delta v={results.b.dps - results.a.dps} d={1} err={(1.96 * Math.hypot(results.a.stdev, results.b.stdev)) / Math.sqrt(results.iterations)} />
                </tr>
              )}
              <tr>
                <td>{t('sumTalents')}</td>
                <td className="num">{spec(dataOf(a))}</td>
                <td className="num">{spec(dataOf(b))}</td>
                <td />
              </tr>
              {(() => {
                // Mêmes lignes que la feuille de personnage (elles changent selon la spécialisation).
                const sa = sheetOf(dataOf(a));
                const sb = sheetOf(dataOf(b));
                const labels = [...new Set([...sa, ...sb].map((x) => x.label))];
                return labels.map((label) => {
                  const ea = sa.find((x) => x.label === label);
                  const eb = sb.find((x) => x.label === label);
                  const dg = (ea ?? eb)!.digits;
                  const fmt = (x?: { value: number; pct?: boolean }) => (x ? `${num(x.value, dg)}${x.pct ? ' %' : ''}` : '—');
                  return (
                    <tr key={label}>
                      <td>{t(label as TKey)}</td>
                      <td className="num">{fmt(ea)}</td>
                      <td className="num">{fmt(eb)}</td>
                      {ea && eb ? <Delta v={eb.value - ea.value} d={dg} /> : <td />}
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>

        {results && (
          <>
            <h3>{t('breakdown')}</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>{t('spell')}</th><th className="num">A</th><th className="num">B</th><th className="num">B − A</th></tr>
                </thead>
                <tbody>
                  {[...new Set([...results.a.breakdown, ...results.b.breakdown].map((x) => x.id))].map((id) => {
                    const da = (results.a.breakdown.find((x) => x.id === id)?.damage ?? 0) / dataOf(a).fightLength;
                    const db = (results.b.breakdown.find((x) => x.id === id)?.damage ?? 0) / dataOf(b).fightLength;
                    return (
                      <tr key={id}>
                        <td><SpellName id={id} /></td>
                        <td className="num">{num(da, 1)}</td>
                        <td className="num">{num(db, 1)}</td>
                        <Delta v={db - da} d={1} />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Delta({ v, d, err }: { v: number; d: number; err?: number }) {
  const { num } = useI18n();
  const shown = Math.abs(v) < 10 ** -d / 2 ? 0 : v;
  return (
    <td className={`num ${shown > 0 ? 'good' : shown < 0 ? 'bad' : 'muted'}`}>
      {shown > 0 ? '+' : ''}
      {num(shown, d)}
      {err !== undefined && <span className="small muted"> ± {num(err, d)}</span>}
    </td>
  );
}
