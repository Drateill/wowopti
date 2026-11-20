import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { NotInBlizzardApi, blizzardStatus, fetchItemBlizzard, searchItemsBlizzard, type BlizzardStatus } from '../data/blizzard';
import { ENCHANTS, buffVisible } from '../data/buffs';
import { fetchCharacter } from '../data/character';
import { applyCharacter } from '../state/importCharacter';
import { emptyStats, type Stats } from '../data/types';
import {
  ITEM_SOURCES, QUALITY_COLORS, classifyResult, fetchItem, fetchSuffixScale, parseItemRef, searchItems, suggestItems, wowheadUrl,
  type ItemSearchResult, type ItemSource, type ItemSuggestion,
} from '../data/wowhead';
import { runCompare } from '../engine/simClient';
import { characterSheet } from '../state/classLogic';

import { useI18n, type TKey } from '../i18n';
import { RANDOM_SUFFIXES, suffixStats, type SuffixScale } from '../data/randomSuffix';
import {
  FAMILIES, SLOTS, buildConfig, computeGear, gearStats, slotFamily, useStore, type ActiveSet, type AppState, type Item, type SlotId,
} from '../state/store';
import { Icon, Progress, StatsEditor, useStatSummary } from './ui';

function ItemName({ item }: { item: Item }) {
  const { L, lang } = useI18n();
  const color = item.quality !== undefined ? QUALITY_COLORS[item.quality] : undefined;
  const label = (
    <span className="item-name" style={{ color }}>
      {item.icon && <Icon name={item.icon} size={20} border={color} />} {L(item.name)}
    </span>
  );
  return item.wowheadId ? (
    <a href={wowheadUrl('item', item.wowheadId, lang)} target="_blank" rel="noreferrer" className="plain">
      {label}
    </a>
  ) : (
    label
  );
}

/** Premier emplacement libre (ou le premier) pour une famille d'objets. */
const slotFor = (family: string, equipped: AppState['equipped']): SlotId | null => {
  const slots = SLOTS.filter((s) => slotFamily(s) === family);
  return slots.find((s) => !equipped[s]) ?? slots[0] ?? null;
};

export function GearPanel() {
  const { state, set, cls } = useStore();
  const { t, num, slot: slotName, L } = useI18n();
  const summary = useStatSummary();
  const gear = computeGear(state);
  const sheet = characterSheet(state);

  const equip = (slot: SlotId, itemId: string) => {
    const equipped = { ...state.equipped };
    if (itemId) equipped[slot] = itemId;
    else delete equipped[slot];
    set({ equipped });
  };

  const enchant = (slot: SlotId, id: string) => {
    const enchants = { ...state.enchants };
    if (id) enchants[slot] = id;
    else delete enchants[slot];
    set({ enchants, weights: null });
  };

  return (
    <div className="grid">
      <div className="panel">
        <h2>{t('charSheet')}</h2>
        <div className="stat-tiles">
          {sheet.entries.map((e) => (
            <Tile
              key={e.label}
              label={t(e.label as TKey)}
              value={`${num(e.value, e.digits)}${e.pct ? ' %' : ''}`}
              sub={
                e.sub && 'key' in e.sub
                  ? t(e.sub.key as TKey, Object.fromEntries(Object.entries(e.sub.vars ?? {}).map(([k, v]) => [k, num(v, Number.isInteger(v) ? 0 : 1)])))
                  : e.sub?.text
              }
            />
          ))}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <h3>{t('equipped')}</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {SLOTS.map((slot) => {
                  const options = state.items.filter((i) => i.slot === slotFamily(slot));
                  const item = state.items.find((i) => i.id === state.equipped[slot]);
                  const enchants = ENCHANTS.filter((e) => e.slot === slotFamily(slot) && buffVisible(e, state.classId, state.spec));
                  const current = state.enchants[slot];
                  return (
                    <tr key={slot}>
                      <td className="muted small" style={{ width: 90 }}>{slotName(slot)}</td>
                      <td>
                        <div className="row" style={{ flexWrap: 'nowrap' }}>
                          {item?.icon && <Icon name={item.icon} size={28} border={QUALITY_COLORS[item.quality ?? 1]} />}
                          <select value={state.equipped[slot] ?? ''} onChange={(e) => equip(slot, e.target.value)} style={{ flex: 1, minWidth: 0 }}>
                            <option value="">{t('empty')}</option>
                            {options.map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.name[state.lang] || i.name.en}
                              </option>
                            ))}
                          </select>
                        </div>
                        {item && (
                          <div className="small muted">
                            {summary(item.stats)}
                            {item.set && <span className="set-tag"> · {L(item.set.name)}</span>}
                          </div>
                        )}
                        {item && (enchants.length > 0 || typeof current === 'object') && (
                          <select
                            className="enchant-select small"
                            aria-label={t('enchant')}
                            value={typeof current === 'object' ? IMPORTED : (current ?? '')}
                            onChange={(e) => e.target.value !== IMPORTED && enchant(slot, e.target.value)}
                          >
                            <option value="">{t('noEnchant')}</option>
                            {typeof current === 'object' && (
                              <option value={IMPORTED}>
                                {L(current.name)} ({summary(current.stats)})
                              </option>
                            )}
                            {enchants.map((e) => (
                              <option key={e.id} value={e.id}>
                                {L(e.name)} ({summary(e.stats)})
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid" style={{ alignContent: 'start' }}>
          <CharacterImport />
          {gear.sets.length > 0 && <SetBonuses sets={gear.sets} />}
          <ItemSearch />
          <Comparator />
          <Optimizer />
          <div className="panel">
            <h3>{t('extraBonuses')}</h3>
            <p className="small muted">{t('extraHelp')}</p>
            <StatsEditor keys={cls.statKeys} stats={state.extraStats} onChange={(s) => set({ extraStats: s, weights: null })} />
          </div>
        </div>
      </div>

      <ItemLibrary />
    </div>
  );
}

function ItemSearch() {
  const { state, set } = useStore();
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ItemSearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [source, setSource] = useState<'wowhead' | 'blizzard'>('wowhead');
  const [status, setStatus] = useState<BlizzardStatus | null>(null);
  const blizzardReady = !!status?.configured && !!status.ok;
  const [suggestions, setSuggestions] = useState<ItemSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const lastQuery = useRef('');
  const [usableOnly, setUsableOnly] = useState(true);
  const [sources, setSources] = useState<Set<ItemSource>>(new Set(ITEM_SOURCES));
  const [minIlvl, setMinIlvl] = useState(0);
  /** Objet à enchantement aléatoire en attente : on choisit son suffixe avant de l'ajouter. */
  const [pending, setPending] = useState<{ item: Item; andEquip: boolean; scale: SuffixScale | null } | null>(null);

  /** Filtres de recherche : la description Wowhead dit d'où vient l'objet et qui peut le porter. */
  const keep = (r: ItemSearchResult) => {
    const info = classifyResult(`${r.name} ${r.description}`);
    if (usableOnly && !info.usable) return false;
    if (minIlvl && info.itemLevel !== null && info.itemLevel < minIlvl) return false;
    if (info.sources.size && ![...info.sources].some((s) => sources.has(s))) return false;
    return true;
  };
  const shownSuggestions = suggestions.filter(keep).slice(0, 8);
  const shownResults = results?.filter(keep) ?? null;
  const hidden = results ? results.length - (shownResults?.length ?? 0) : 0;

  // Suggestions : 250 ms après la dernière frappe, à partir de 3 caractères.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || parseItemRef(q) || q === lastQuery.current) {
      if (q.length < 3) setSuggestions([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      suggestItems(q, lang, 20)
        .then((list) => {
          if (!alive) return; // une réponse plus ancienne ne remplace pas la plus récente
          setSuggestions(list);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => alive && setSuggestions([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, lang]);

  const pick = (sug: ItemSuggestion) => {
    lastQuery.current = sug.name;
    setQuery(sug.name);
    setOpen(false);
    setMessage(null);
    setResults([sug]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || !shownSuggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % shownSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? shownSuggestions.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(shownSuggestions[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  useEffect(() => {
    let alive = true;
    blizzardStatus().then((s) => {
      if (!alive) return;
      setStatus(s);
      if (s.configured && s.ok) setSource('blizzard');
    });
    return () => {
      alive = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    setMessage(null);
    const ref = parseItemRef(q);
    if (ref) {
      await addItem(ref, false);
      return;
    }
    setBusy(true);
    try {
      let r = source === 'blizzard' ? await searchItemsBlizzard(q, lang) : await searchItems(q, lang);
      if (!r.length && source === 'blizzard') {
        // Objet absent de l'API (fréquent pour les sets Forever) : on tente Wowhead.
        r = await searchItems(q, lang);
        if (r.length) setMessage(t('blizzardFallback'));
      }
      setResults(r);
      if (!r.length) setMessage(t('noResults'));
    } catch (err) {
      setMessage(t('searchError', { e: String((err as Error).message ?? err) }));
    } finally {
      setBusy(false);
    }
  };

  /** Range l'objet dans la bibliothèque (et l'équipe si demandé). */
  const store = (item: Item, andEquip: boolean) => {
    const existing = state.items.find((i) => i.id === item.id);
    const items = existing ? state.items : [...state.items, item];
    const equipped = { ...state.equipped };
    if (andEquip) {
      const slot = slotFor(item.slot, state.equipped);
      if (slot) equipped[slot] = item.id;
    }
    set({ items, equipped });
  };

  const addItem = async (id: number, andEquip: boolean) => {
    setBusy(true);
    try {
      const data =
        source === 'blizzard'
          ? await fetchItemBlizzard(id).catch((e) => (e instanceof NotInBlizzardApi ? fetchItem(id) : Promise.reject(e)))
          : await fetchItem(id);
      if (!data.slot) {
        setMessage(t('unknownSlot'));
        return;
      }
      // L'API Blizzard ne donne pas toujours l'ensemble, ni le blocage de base d'un bouclier :
      // on les lit alors dans l'infobulle Wowhead.
      const fromWowhead = 'shieldBlock' in data;
      const wh = fromWowhead ? null : await fetchItem(id).catch(() => null);
      const itemSet = data.set ?? wh?.set ?? null;
      const stats = wh?.shieldBlock ? { ...data.stats, blockValue: data.stats.blockValue + wh.shieldBlock } : data.stats;
      const random = fromWowhead ? (data as { randomEnchant?: boolean }).randomEnchant : wh?.randomEnchant;
      // Un objet à suffixe aléatoire peut exister en plusieurs versions dans la bibliothèque.
      const existing = random ? undefined : state.items.find((i) => i.wowheadId === id);
      const item: Item = existing ?? {
        id: `wh-${id}`,
        wowheadId: id,
        name: data.name,
        icon: data.icon,
        quality: data.quality,
        itemLevel: data.itemLevel ?? undefined,
        slot: data.slot,
        stats,
        set: itemSet,
        weapon: data.weapon ?? wh?.weapon ?? null,
      };
      if (random) {
        const scale = await fetchSuffixScale(id).catch(() => null);
        setPending({ item, andEquip, scale });
        return;
      }
      store(item, andEquip);
      setAdded((s) => new Set(s).add(id));
    } catch (err) {
      setMessage(t('searchError', { e: String((err as Error).message ?? err) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel grid">
      <h3>{t('searchItems')}</h3>
      <div className="row small">
        <span className="muted">{t('source')} :</span>
        <label className="check">
          <input type="radio" name="item-source" checked={source === 'wowhead'} onChange={() => setSource('wowhead')} /> Wowhead
        </label>
        <label className={`check ${blizzardReady ? '' : 'muted'}`}>
          <input type="radio" name="item-source" disabled={!blizzardReady} checked={source === 'blizzard'} onChange={() => setSource('blizzard')} />{' '}
          {t('sourceBlizzard')}
        </label>
      </div>
      {status && !status.configured && <p className="small muted">{t('blizzardNotConfigured')}</p>}
      {status?.configured && !status.ok && <p className="small warn">{t('blizzardError', { e: status.error ?? '?' })}</p>}
      {blizzardReady && <p className="small good">{t('blizzardOk', { ns: status!.namespace ?? '' })}</p>}
      <form className="row" onSubmit={submit}>
        <div className="suggest-wrap">
          <input
            role="combobox"
            aria-expanded={open && shownSuggestions.length > 0}
            aria-controls="item-suggestions"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `sug-${shownSuggestions[active]?.id}` : undefined}
            autoComplete="off"
            style={{ width: '100%' }}
            value={query}
            onChange={(e) => {
              lastQuery.current = '';
              setQuery(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => shownSuggestions.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={t('searchPlaceholder')}
          />
          {open && shownSuggestions.length > 0 && (
            <ul className="suggestions" id="item-suggestions" role="listbox">
              {shownSuggestions.map((sug, i) => (
                <li
                  key={sug.id}
                  id={`sug-${sug.id}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'active' : ''}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(sug)}
                >
                  <Icon name={sug.icon} size={22} border={QUALITY_COLORS[sug.quality]} />
                  <span className="sug-name" style={{ color: QUALITY_COLORS[sug.quality] }}>{sug.name}</span>
                  <span className="small muted">
                    {sug.category}
                    {sug.itemLevel ? ` · ${t('itemLevelShort', { n: sug.itemLevel })}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="btn" disabled={busy}>{busy ? t('searching') : t('search')}</button>
      </form>
      <details className="filters">
        <summary className="small">{t('filters')}</summary>
        <div className="row small" style={{ marginTop: 6 }}>
          <label className="check">
            <input type="checkbox" checked={usableOnly} onChange={(e) => setUsableOnly(e.target.checked)} /> {t('usableOnly')}
          </label>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {t('minIlvl')}
            <input type="number" min={0} value={minIlvl} style={{ width: 64 }} onChange={(e) => setMinIlvl(e.target.valueAsNumber || 0)} />
          </label>
        </div>
        <div className="row small">
          {ITEM_SOURCES.map((src) => (
            <label key={src} className="check">
              <input
                type="checkbox"
                checked={sources.has(src)}
                onChange={(e) => {
                  const next = new Set(sources);
                  if (e.target.checked) next.add(src);
                  else next.delete(src);
                  setSources(next);
                }}
              />{' '}
              {t(`src_${src}` as TKey)}
            </label>
          ))}
        </div>
      </details>
      {message && <p className="small warn">{message}</p>}
      {pending && (
        <SuffixPicker
          item={pending.item}
          scale={pending.scale}
          onCancel={() => setPending(null)}
          onConfirm={(item) => {
            store(item, pending.andEquip);
            setAdded((s) => new Set(s).add(pending.item.wowheadId ?? 0));
            setPending(null);
          }}
        />
      )}
      {hidden > 0 && <p className="small muted">{t('hiddenByFilters', { n: hidden })}</p>}
      {shownResults && shownResults.length > 0 && (
        <div className="search-results">
          {shownResults.map((r) => (
            <div key={r.id} className="search-row">
              <Icon name={r.icon} size={28} border={QUALITY_COLORS[r.quality]} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={wowheadUrl('item', r.id, lang)} target="_blank" rel="noreferrer" style={{ color: QUALITY_COLORS[r.quality] }}>
                  {r.name.replace(/^\[(.*)\]$/, '$1')}
                </a>
                <div className="small muted" dangerouslySetInnerHTML={{ __html: stripTags(r.description) }} />
              </div>
              {added.has(r.id) ? (
                <span className="small good">{t('added')}</span>
              ) : (
                <>
                  <button className="btn secondary small" disabled={busy} onClick={() => addItem(r.id, false)}>{t('add')}</button>
                  <button className="btn small" disabled={busy} onClick={() => addItem(r.id, true)}>{t('addEquip')}</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="small muted">{source === 'blizzard' ? t('blizzardSource') : t('wowheadSource')}</p>
    </div>
  );
}


/** Choix du suffixe d'un objet à enchantement aléatoire (« … du hibou ») et de ses valeurs. */
function SuffixPicker({ item, scale, onCancel, onConfirm }: { item: Item; scale: SuffixScale | null; onCancel: () => void; onConfirm: (item: Item) => void }) {
  const { t, L } = useI18n();
  const fallback: SuffixScale = { pair: Math.max(1, Math.round((item.itemLevel ?? 20) / 5)), single: Math.max(1, Math.round((item.itemLevel ?? 20) / 3.7)) };
  const sc = scale ?? fallback;
  const [key, setKey] = useState(RANDOM_SUFFIXES[0].key);
  const def = RANDOM_SUFFIXES.find((s) => s.key === key)!;
  const [values, setValues] = useState<Stats>({ ...emptyStats(), ...suffixStats(def, sc) });
  const choose = (k: string) => {
    setKey(k);
    const d = RANDOM_SUFFIXES.find((s) => s.key === k)!;
    setValues({ ...emptyStats(), ...suffixStats(d, sc) });
  };
  const confirm = () => {
    const stats = { ...item.stats };
    for (const s of def.stats) stats[s.stat] = (stats[s.stat] ?? 0) + (values[s.stat] ?? 0);
    onConfirm({
      ...item,
      id: `${item.id}-${key}`,
      name: { fr: `${item.name.fr} ${def.name.fr}`, en: `${item.name.en} ${def.name.en}` },
      stats,
    });
  };
  return (
    <div className="panel grid" style={{ borderColor: 'var(--accent, #9b6cf0)' }}>
      <strong>{t('suffixTitle', { item: L(item.name) })}</strong>
      <p className="small muted">{t('suffixHelp')}</p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field">
          {t('suffix')}
          <select value={key} onChange={(e) => choose(e.target.value)}>
            {RANDOM_SUFFIXES.map((s) => (
              <option key={s.key} value={s.key}>{L(item.name)} {L(s.name)}</option>
            ))}
          </select>
        </label>
      </div>
      <StatsEditor stats={values} keys={def.stats.map((s) => s.stat)} onChange={setValues} />
      {(def.estimated || !scale) && <p className="small warn">{t('suffixEstimated')}</p>}
      <div className="row">
        <button className="btn" onClick={confirm}>{t('suffixAdd')}</button>
        <button className="btn secondary" onClick={onCancel}>{t('cancel')}</button>
      </div>
    </div>
  );
}

/** Le texte de Wowhead contient un peu de HTML (<b>) : on n'en garde que le texte. */
const stripTags = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

function Comparator() {
  const { state } = useStore();
  const { t, num, slot: slotName, L } = useI18n();
  const summary = useStatSummary();
  const [slot, setSlot] = useState<SlotId>('chest');
  const [candidateId, setCandidateId] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ before: number; after: number; err: number } | null>(null);

  const candidates = state.items.filter((i) => i.slot === slotFamily(slot) && i.id !== state.equipped[slot]);
  const candidate = state.items.find((i) => i.id === candidateId);
  const current = state.items.find((i) => i.id === state.equipped[slot]);

  const epOf = (s: Stats | undefined) => (s && state.weights ? state.weights.reduce((sum, w) => sum + (s[w.key] ?? 0) * w.ep, 0) : null);
  const epDelta = candidate && state.weights ? epOf(candidate.stats)! - (epOf(current?.stats) ?? 0) : null;

  const simulateSwap = async () => {
    if (!candidate) return;
    setProgress(0);
    setResult(null);
    try {
      const swapped: AppState = { ...state, equipped: { ...state.equipped, [slot]: candidate.id } };
      const iterations = Math.max(state.iterations, 5000);
      const [a, b] = await runCompare([buildConfig(state, { iterations }), buildConfig(swapped, { iterations })], setProgress);
      setResult({ before: a.dps, after: b.dps, err: (1.96 * Math.hypot(a.stdev, b.stdev)) / Math.sqrt(iterations) });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="panel grid">
      <h3>{t('comparator')}</h3>
      <div className="row">
        <label className="field">
          {t('slot')}
          <select value={slot} onChange={(e) => { setSlot(e.target.value as SlotId); setCandidateId(''); setResult(null); }}>
            {SLOTS.map((id) => <option key={id} value={id}>{slotName(id)}</option>)}
          </select>
        </label>
        <label className="field" style={{ flex: 1 }}>
          {t('itemToTest')}
          <select value={candidateId} onChange={(e) => { setCandidateId(e.target.value); setResult(null); }}>
            <option value="">{t('choose')}</option>
            {candidates.map((i) => <option key={i.id} value={i.id}>{L(i.name)}</option>)}
          </select>
        </label>
      </div>
      {candidates.length === 0 && <p className="small muted">{t('noCandidates')}</p>}
      {candidate && (
        <>
          <div className="small">
            {t('current')} : {current ? <ItemName item={current} /> : <b>{t('nothing')}</b>}
            <br />
            {t('candidate')} : <ItemName item={candidate} /> <span className="muted">({summary(candidate.stats)})</span>
          </div>
          {epDelta !== null ? (
            <p>
              {t('epEstimate')} <b className={epDelta >= 0 ? 'good' : 'bad'}>{epDelta >= 0 ? '+' : ''}{num(epDelta, 1)}</b> {t('epUnit')}
            </p>
          ) : (
            <p className="small muted">{t('epHint')}</p>
          )}
          <button className="btn secondary" onClick={simulateSwap} disabled={progress !== null}>
            {progress !== null ? t('simulating') : t('simulateSwap')}
          </button>
          <Progress value={progress} />
          {result && (
            <p>
              {num(result.before, 1)} → {num(result.after, 1)} {t('dps')} :{' '}
              <b className={result.after >= result.before ? 'good' : 'bad'}>
                {result.after >= result.before ? '+' : ''}{num(result.after - result.before, 1)} {t('dps')}
              </b>{' '}
              <span className="small muted">(± {num(result.err, 1)})</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}

const IMPORTED = '__imported__';

function CharacterImport() {
  const { state, set, cls } = useStore();
  const { t, L } = useI18n();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<BlizzardStatus | null>(null);
  const [report, setReport] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const ready = !!status?.configured && !!status.ok;

  useEffect(() => {
    let alive = true;
    blizzardStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setBusy(true);
    setReport(null);
    try {
      const char = await fetchCharacter(input, cls);
      const { patch, talentsApplied } = applyCharacter(state, char, t('beforeCharImport', { name: char.name }));
      set(patch);
      const enchanted = char.items.filter((i) => i.enchant).length;
      const lines = [
        t('charImported', { name: char.name, level: char.level, cls: L(char.className), n: char.items.length, e: enchanted }),
        talentsApplied ? t('charTalentsOk') : char.sameClass ? t('charTalentsNone') : t('charOtherClass', { cls: L(cls.name) }),
      ];
      if (char.unknownTalents.length) lines.push(t('charUnknownTalents', { list: char.unknownTalents.join(', ') }));
      if (char.level < 60) lines.push(t('charLowLevel'));
      lines.push(t('charBackup'));
      setReport({ ok: true, lines });
    } catch (err) {
      const msg = String((err as Error).message ?? err);
      setReport({ ok: false, lines: [/404|Not Found/i.test(msg) ? t('charNotFound') : t('searchError', { e: msg })] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel grid">
      <h3>{t('charImport')}</h3>
      {status && !ready ? (
        <p className="small muted">{status.configured ? t('blizzardError', { e: status.error ?? '?' }) : t('blizzardNotConfigured')}</p>
      ) : (
        <>
          <form className="row" onSubmit={run}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('charPlaceholder')} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn" disabled={busy || !ready}>{busy ? t('searching') : t('import')}</button>
          </form>
          <p className="small muted">{t('charHelp')}</p>
        </>
      )}
      {report && (
        <div className={`small ${report.ok ? '' : 'warn'}`}>
          {report.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function SetBonuses({ sets }: { sets: ActiveSet[] }) {
  const { t, L } = useI18n();
  return (
    <div className="panel grid">
      <h3>{t('setBonuses')}</h3>
      {sets.map(({ set, pieces, bonuses }) => (
        <div key={set.id}>
          <b>{L(set.name)}</b> <span className="small muted">({t('piecesWorn', { n: pieces })})</span>
          <ul className="set-bonuses">
            {bonuses.map((b) => (
              <li key={b.count} className={b.active ? 'active' : 'muted'}>
                ({b.count}) {L(b.text)}
                {b.active && !b.simulated && <span className="small muted"> — {t('notSimulatedShort')}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

interface Swap {
  slot: SlotId;
  item: Item;
  current?: Item;
  ep: number;
}

/**
 * Pour chaque emplacement, l'objet de la bibliothèque qui rapporte le plus d'EP.
 * Les emplacements sont traités l'un après l'autre : deux bagues identiques ne sont pas proposées
 * deux fois, et les bonus d'ensemble des choix précédents sont pris en compte.
 */
function planSwaps(state: AppState): Swap[] {
  const weights = state.weights;
  if (!weights) return [];
  const epOf = (equipped: AppState['equipped']) => {
    const s = gearStats({ ...state, equipped });
    return weights.reduce((sum, w) => sum + (s[w.key] ?? 0) * w.ep, 0);
  };
  const equipped = { ...state.equipped };
  const swaps: Swap[] = [];
  for (const slot of SLOTS) {
    const base = epOf(equipped);
    const taken = new Set(SLOTS.filter((s) => s !== slot).map((s) => equipped[s]));
    let best: Swap | null = null;
    for (const item of state.items) {
      if (item.slot !== slotFamily(slot) || item.id === equipped[slot] || taken.has(item.id)) continue;
      const ep = epOf({ ...equipped, [slot]: item.id }) - base;
      if (ep > 0.05 && (!best || ep > best.ep)) best = { slot, item, ep, current: state.items.find((i) => i.id === equipped[slot]) };
    }
    if (best) {
      swaps.push(best);
      equipped[slot] = best.item.id;
    }
  }
  return swaps;
}

function Optimizer() {
  const { state, set } = useStore();
  const { t, num, L, slot: slotName } = useI18n();
  const [progress, setProgress] = useState<number | null>(null);
  const [sim, setSim] = useState<{ base: number; each: number[]; all: number; err: number } | null>(null);
  const swaps = planSwaps(state);

  const equipAll = (list: Swap[]) => {
    const equipped = { ...state.equipped };
    for (const s of list) equipped[s.slot] = s.item.id;
    set({ equipped });
    setSim(null);
  };

  const simulate = async () => {
    setProgress(0);
    setSim(null);
    try {
      const iterations = Math.max(state.iterations, 3000);
      const variant = (list: Swap[]) => {
        const equipped = { ...state.equipped };
        for (const s of list) equipped[s.slot] = s.item.id;
        return buildConfig({ ...state, equipped }, { iterations });
      };
      const configs = [buildConfig(state, { iterations }), ...swaps.map((s) => variant([s])), variant(swaps)];
      const res = await runCompare(configs, setProgress);
      setSim({
        base: res[0].dps,
        each: res.slice(1, -1).map((r) => r.dps),
        all: res[res.length - 1].dps,
        err: (1.96 * res[0].stdev * Math.SQRT2) / Math.sqrt(iterations),
      });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="panel grid">
      <h3>{t('optimizer')}</h3>
      {!state.weights ? (
        <p className="small muted">{t('optimizerNeedsWeights')}</p>
      ) : swaps.length === 0 ? (
        <p className="small muted">{t('optimizerNothing')}</p>
      ) : (
        <>
          <p className="small muted">{t('optimizerHelp')}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('slot')}</th>
                  <th>{t('candidate')}</th>
                  <th className="num">EP</th>
                  {sim && <th className="num">{t('dps')}</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {swaps.map((s, i) => (
                  <tr key={s.slot}>
                    <td className="muted small">{slotName(s.slot)}</td>
                    <td>
                      <ItemName item={s.item} />
                      <div className="small muted">{t('replaces', { name: s.current ? L(s.current.name) : t('nothing') })}</div>
                    </td>
                    <td className="num good">+{num(s.ep, 1)}</td>
                    {sim && <td className={`num ${sim.each[i] >= sim.base ? 'good' : 'bad'}`}>{sim.each[i] >= sim.base ? '+' : ''}{num(sim.each[i] - sim.base, 1)}</td>}
                    <td className="num">
                      <button className="btn secondary small" onClick={() => equipAll([s])}>{t('equip')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sim && (
            <p>
              {t('allChanges')} : {num(sim.base, 1)} → {num(sim.all, 1)} {t('dps')}{' '}
              <b className={sim.all >= sim.base ? 'good' : 'bad'}>({sim.all >= sim.base ? '+' : ''}{num(sim.all - sim.base, 1)})</b>{' '}
              <span className="small muted">± {num(sim.err, 1)}</span>
            </p>
          )}
          <div className="row">
            <button className="btn secondary" onClick={simulate} disabled={progress !== null}>{progress !== null ? t('simulating') : t('simulateChanges')}</button>
            <button className="btn" onClick={() => equipAll(swaps)}>{t('equipAll')}</button>
          </div>
          <Progress value={progress} />
        </>
      )}
    </div>
  );
}

function ItemLibrary() {
  const { state, set, cls } = useStore();
  const { t, num, L, slot: slotName } = useI18n();
  const summary = useStatSummary();
  const blank = (slot = 'head'): Item => ({ id: '', name: { fr: '', en: '' }, slot, stats: emptyStats() });
  const [draft, setDraft] = useState<Item>(blank());
  const draftName = draft.name[state.lang] || draft.name.en;

  const save = () => {
    if (!draftName.trim()) return;
    const item = { ...draft, name: { ...draft.name, fr: draft.name.fr || draftName, en: draft.name.en || draftName } };
    if (draft.id) set({ items: state.items.map((i) => (i.id === draft.id ? item : i)), weights: state.weights });
    else set({ items: [...state.items, { ...item, id: `item-${Date.now().toString(36)}` }] });
    setDraft(blank(draft.slot));
  };

  const remove = (id: string) => {
    const equipped = Object.fromEntries(Object.entries(state.equipped).filter(([, v]) => v !== id));
    set({ items: state.items.filter((i) => i.id !== id), equipped });
  };

  // Objets importés avant la gestion des ensembles : on va relire leur infobulle Wowhead.
  const unchecked = state.items.filter((i) => i.wowheadId && i.set === undefined);
  const [refreshing, setRefreshing] = useState(false);
  const refreshSets = async () => {
    setRefreshing(true);
    try {
      const found = new Map<string, Item['set']>();
      for (const i of unchecked) found.set(i.id, await fetchItem(i.wowheadId!).then((w) => w.set, () => undefined));
      set({ items: state.items.map((i) => (found.has(i.id) ? { ...i, set: found.get(i.id) } : i)) });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="panel grid">
      <h3>{t('library')}</h3>
      {unchecked.length > 0 && (
        <div className="row small">
          <span className="muted">{t('setsUnknown', { n: unchecked.length })}</span>
          <button className="btn secondary small" disabled={refreshing} onClick={refreshSets}>
            {refreshing ? t('searching') : t('fetchSets')}
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>{t('item')}</th><th>{t('slot')}</th><th>{t('stats')}</th><th /></tr>
          </thead>
          <tbody>
            {state.items.map((i) => (
              <tr key={i.id}>
                <td>
                  <ItemName item={i} />
                  {i.itemLevel && <span className="small muted"> · {t('itemLevelShort', { n: num(i.itemLevel) })}</span>}
                  {i.set && <div className="small set-tag">{L(i.set.name)}</div>}
                </td>
                <td className="muted">{slotName(i.slot)}</td>
                <td className="small">{summary(i.stats)}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn secondary small" onClick={() => setDraft(i)}>{t('edit')}</button>{' '}
                  <button className="btn danger small" onClick={() => remove(i.id)}>{t('delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>{draft.id ? t('edit') : t('manualItem')}</h3>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>
          {t('name')}
          <input value={draftName} onChange={(e) => setDraft({ ...draft, name: { ...draft.name, [state.lang]: e.target.value } })} />
        </label>
        <label className="field">
          {t('slot')}
          <select value={draft.slot} onChange={(e) => setDraft({ ...draft, slot: e.target.value })}>
            {FAMILIES.map((id) => <option key={id} value={id}>{slotName(id)}</option>)}
          </select>
        </label>
      </div>
      <StatsEditor keys={cls.statKeys} stats={{ ...emptyStats(), ...draft.stats }} onChange={(stats) => setDraft({ ...draft, stats })} />
      <div className="row">
        <button className="btn" onClick={save} disabled={!draftName.trim()}>{draft.id ? t('save') : t('addItem')}</button>
        {draft.id && <button className="btn secondary" onClick={() => setDraft(blank(draft.slot))}>{t('cancel')}</button>}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}
