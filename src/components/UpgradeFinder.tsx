import { useEffect, useState } from 'react';
import { blizzardStatus } from '../data/blizzard';
import { RateLimitedError } from '../data/rateLimit';
import { candidateItem, searchCandidates } from '../data/upgrades';
import { QUALITY_COLORS, wowheadUrl } from '../data/wowhead';
import { runCompare } from '../engine/simClient';
import { useI18n } from '../i18n';
import { SLOTS, buildConfig, useStore, type AppState, type Item, type SlotId } from '../state/store';
import { Icon, Progress } from './ui';

interface Row {
  item: Item;
  gain: number;
}

/** État avec l'objet porté à la place de celui de l'emplacement (une arme à deux mains libère la main gauche). */
function withItem(state: AppState, slot: SlotId, item: Item): AppState {
  const items = state.items.some((i) => i.id === item.id) ? state.items : [...state.items, item];
  const equipped = { ...state.equipped, [slot]: item.id };
  if (slot === 'mainHand' && item.weapon?.twoHand) delete equipped.offHand;
  return { ...state, items, equipped };
}

/** Lance `fn` sur chaque élément, `n` à la fois. */
async function pool<T, R>(list: T[], n: number, fn: (x: T) => Promise<R>, onDone: () => void): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await fn(list[i]);
        onDone();
      }
    }),
  );
  return out;
}

export function UpgradeFinder() {
  const { state, set, cls } = useStore();
  const { t, num, slot: slotName, L, lang } = useI18n();
  const [ready, setReady] = useState<boolean | null>(null);
  const [slot, setSlot] = useState<SlotId>('head');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    blizzardStatus().then((s) => alive && setReady(!!s.configured && !!s.ok));
    return () => {
      alive = false;
    };
  }, []);

  const current = state.items.find((i) => i.id === state.equipped[slot]);
  const mainIsTwoHand = !!state.items.find((i) => i.id === state.equipped.mainHand)?.weapon?.twoHand;
  const metric = cls.specs.find((s) => s.id === state.spec)?.metric ?? 'dps';

  const search = async () => {
    setBusy(true);
    setRows(null);
    setMessage(null);
    setProgress(0);
    try {
      const found = await searchCandidates(cls.id, slot);
      // Pas l'objet déjà porté ici, ni celui de l'autre anneau ou bijou (objets uniques).
      const other = slot.endsWith('1') ? slot.replace('1', '2') : slot.endsWith('2') ? slot.replace('2', '1') : null;
      const taken = new Set([state.equipped[slot], other ? state.equipped[other as SlotId] : undefined].filter(Boolean));
      const rowsToLoad = found.filter((r) => !taken.has(`wh-${r.id}`));
      let done = 0;
      const items = (
        await pool(rowsToLoad, 6, (r) => candidateItem(r), () => setProgress((++done / rowsToLoad.length) * 0.5))
      ).filter((i): i is Item => !!i);
      if (!items.length) {
        setMessage(t('upgNone'));
        return;
      }
      // Même graine pour tous : les écarts viennent de l'objet, pas du hasard.
      const iterations = Math.max(300, Math.min(state.iterations, 600));
      const base = { ...state, iterations };
      const configs = [buildConfig(base), ...items.map((i) => buildConfig(withItem(base, slot, i)))];
      const results = await runCompare(configs, (p) => setProgress(0.5 + p * 0.5));
      const ref = results[0].dps;
      setRows(items.map((item, i) => ({ item, gain: results[i + 1].dps - ref })).sort((a, b) => b.gain - a.gain));
    } catch (err) {
      setMessage(
        err instanceof RateLimitedError
          ? t('rateLimitRequests', { s: err.retryAfter })
          : t('searchError', { e: String((err as Error).message ?? err) }),
      );
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const take = (item: Item, equip: boolean) => {
    const next = equip ? withItem(state, slot, item) : { ...state, items: state.items.some((i) => i.id === item.id) ? state.items : [...state.items, item] };
    set({ items: next.items, equipped: next.equipped, weights: null });
  };

  return (
    <div className="panel grid">
      <h3>{t('upgTitle')}</h3>
      <p className="small muted">{t('upgHelp', { metric: t(metric === 'hps' ? 'upgMetricHps' : metric === 'tps' ? 'upgMetricTps' : 'upgMetricDps') })}</p>
      {ready === false ? (
        <p className="small muted">{t('upgNeedsBlizzard')}</p>
      ) : (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="field">
            {t('upgSlot')}
            <select value={slot} onChange={(e) => { setSlot(e.target.value as SlotId); setRows(null); setMessage(null); }}>
              {SLOTS.map((s) => (
                <option key={s} value={s}>{slotName(s)}</option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={search} disabled={busy || ready === null || (slot === 'offHand' && mainIsTwoHand)}>
            {busy ? t('upgSearching') : t('upgSearch')}
          </button>
          <span className="small muted">
            {t('upgCurrent')} {current ? L(current.name) : t('upgEmpty')}
          </span>
        </div>
      )}
      {slot === 'offHand' && mainIsTwoHand && <p className="small muted">{t('upgTwoHand')}</p>}
      {progress !== null && <Progress value={progress} />}
      {message && <p className="small">{message}</p>}
      {rows && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('upgItem')}</th>
                <th className="num">{t('upgIlvl')}</th>
                <th className="num">{t('upgGain')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 15).map(({ item, gain }) => (
                <tr key={item.id}>
                  <td>
                    <a className="plain" href={wowheadUrl('item', item.wowheadId!, lang)} target="_blank" rel="noreferrer" style={{ color: item.quality !== undefined ? QUALITY_COLORS[item.quality] : undefined }}>
                      {item.icon && <Icon name={item.icon} size={18} />} {L(item.name)}
                    </a>
                  </td>
                  <td className="num">{item.itemLevel ?? '—'}</td>
                  <td className={`num ${gain > 0 ? 'good' : gain < 0 ? 'bad' : ''}`}>{gain > 0 ? '+' : ''}{num(gain, 1)}</td>
                  <td className="num">
                    <button className="btn secondary small" onClick={() => take(item, true)}>{t('upgEquip')}</button>{' '}
                    <button className="btn secondary small" onClick={() => take(item, false)}>{t('upgKeep')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
