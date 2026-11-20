import { useEffect, useMemo, useState } from 'react';
import { BuffsPanel } from './components/BuffsPanel';
import { GearPanel } from './components/GearPanel';
import { ProfilesPanel } from './components/ProfilesPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { SimPanel } from './components/SimPanel';
import { TalentPlanner } from './components/TalentPlanner';
import { Icon, TabErrorBoundary } from './components/ui';
import { WeightsPanel } from './components/WeightsPanel';
import { CLASSES, CLASS_BY_ID, type ClassId } from './data/classes';
import type { Lang } from './data/types';
import { decodeTalents, pointsInTree } from './engine/talents';
import { useI18n, type TKey } from './i18n';
import { characterSheet } from './state/classLogic';
import { decodeProfile, importShared } from './state/share';
import { profileOf, specPresets, useClassSwitch, useStore } from './state/store';

const TABS: [string, TKey][] = [
  ['talents', 'tabTalents'],
  ['gear', 'tabGear'],
  ['buffs', 'tabBuffs'],
  ['sim', 'tabSim'],
  ['weights', 'tabWeights'],
  ['profiles', 'tabProfiles'],
  ['settings', 'tabSettings'],
];

export default function App() {
  const { state, set, cls } = useStore();
  const { classId, setClassId } = useClassSwitch();
  const { t, L, num, lang } = useI18n();
  const [tab, setTab] = useState('sim');
  const [importMsg, setImportMsg] = useState<string | null>(null);

  // Un lien partagé charge le build de talents (#t=...) ou toute la configuration (#p=...),
  // en passant d'abord sur la bonne classe si besoin.
  useEffect(() => {
    const linkClass = location.hash.match(/[#&]c=(\w+)/)?.[1] as ClassId | undefined;
    const full = location.hash.match(/p=([\w-]+)/);
    if (full) {
      setImportMsg(t('importing'));
      decodeProfile(full[1])
        .then(async ({ classId: target }) => {
          if (target !== classId) {
            setClassId(target); // la nouvelle instance de l'app reprendra le lien
            return;
          }
          const patch = await importShared(full[1], state);
          // La configuration actuelle est gardée dans un profil avant d'être remplacée.
          const backup = { id: `p-${Date.now().toString(36)}`, name: t('beforeImport'), data: profileOf(state) };
          set({ ...patch, profiles: [...state.profiles, backup], weights: null });
          setImportMsg(t('imported'));
          setTab('gear');
          history.replaceState(null, '', location.pathname);
        })
        .catch((e) => {
          setImportMsg(t('importFailed', { e: String((e as Error).message ?? e) }));
          history.replaceState(null, '', location.pathname);
        });
      return;
    }
    const m = location.hash.match(/t=([\d-]+)/);
    if (!m) return;
    if (linkClass && linkClass in CLASS_BY_ID && linkClass !== classId) {
      setClassId(linkClass);
      return;
    }
    const pts = decodeTalents(m[1], cls.talents, cls.trees.length);
    if (pts) {
      set({ talents: pts, weights: null });
      setTab('talents');
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const sheet = useMemo(() => characterSheet(state), [state]);
  const points = cls.trees.map((_, i) => pointsInTree(state.talents, cls.talents, i)).join('/');
  const spec = cls.specs.find((s) => s.id === state.spec) ?? cls.specs[0];

  /** Changer de spécialisation charge son build de talents type et ses options (sceau, bouclier…). */
  const changeSpec = (id: string) => {
    const next = cls.specs.find((s) => s.id === id);
    if (!next) return;
    set({ spec: id, talents: next.defaultTalents, ...specPresets(id, state), weights: null });
  };

  return (
    <div className="app">
      <header className="header">
        <h1>{t('appTitle')}</h1>
        <label className="class-pill">
          <Icon name={cls.icon} size={18} />
          <select aria-label={t('class')} value={classId} onChange={(e) => setClassId(e.target.value as ClassId)}>
            {CLASSES.map((c) => (
              <option key={c.id} value={c.id}>{L(c.name)}</option>
            ))}
          </select>
        </label>
        {cls.specs.length > 1 && (
          <div className="spec-switch" role="radiogroup" aria-label={t('spec')}>
            {cls.specs.map((s) => (
              <button
                key={s.id}
                role="radio"
                aria-checked={s.id === spec.id}
                className={s.id === spec.id ? 'active' : ''}
                title={t('specSwitchHelp')}
                onClick={() => s.id !== spec.id && changeSpec(s.id)}
              >
                <Icon name={s.icon} size={16} /> {L(s.name)}
              </button>
            ))}
          </div>
        )}
        <select className="lang-select" aria-label={t('language')} value={lang} onChange={(e) => set({ lang: e.target.value as Lang })}>
          <option value="fr">FR</option>
          <option value="en">EN</option>
        </select>
        <div className="summary">
          <span>{t('sumTalents')} <b>{points}</b></span>
          {sheet.entries
            .filter((e) => e.short)
            .map((e) => (
              <span key={e.label}>
                {t(e.short as TKey)} <b>{num(e.value, e.digits)}{e.pct ? ' %' : ''}</b>
                {e.label === 'hitWithTalents' || e.label === 'sheetHit' ? (
                  <>
                    {' '}
                    {e.tone === 'warn' ? (
                      <span className="warn">({t('belowCap', { n: num((e.sub as { vars?: { n: number } })?.vars?.n ?? 0, 1) })})</span>
                    ) : (
                      <span className="good">({t('capped')})</span>
                    )}
                  </>
                ) : null}
              </span>
            ))}
        </div>
      </header>
      <nav className="tabs">
        {TABS.map(([id, key]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {t(key)}
          </button>
        ))}
      </nav>
      {importMsg && (
        <div className="panel small" role="status">
          {importMsg}{' '}
          <button className="btn secondary small" onClick={() => setImportMsg(null)}>×</button>
        </div>
      )}
      <TabErrorBoundary key={`${tab}-${state.classId}-${state.spec}`} message={t('tabCrashed')}>
        {tab === 'talents' && <TalentPlanner />}
        {tab === 'gear' && <GearPanel />}
        {tab === 'buffs' && <BuffsPanel />}
        {tab === 'profiles' && <ProfilesPanel />}
        {tab === 'sim' && <SimPanel />}
        {tab === 'weights' && <WeightsPanel />}
        {tab === 'settings' && <SettingsPanel />}
      </TabErrorBoundary>
    </div>
  );
}
