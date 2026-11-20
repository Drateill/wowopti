import type { DruidSpec } from '../data/druid/data';
import type { SpellDef } from '../data/types';
import { wowheadUrl } from '../data/wowhead';
import { deriveDruid } from '../engine/druidSim';
import { deriveHunter } from '../engine/hunterSim';
import { deriveMage } from '../engine/mageSim';
import { derivePaladin } from '../engine/paladinSim';
import { derivePriest } from '../engine/priestSim';
import { deriveShaman } from '../engine/shamanSim';
import { makeCalculator, type SimConfig } from '../engine/warlockSim';
import { useI18n, type TKey } from '../i18n';
import { buildConfig, computeGear, useStore, type AppState } from '../state/store';
import { SpellName } from './SimPanel';
import { NumberField } from './ui';

const SPELL_FIELDS: [keyof SpellDef, TKey, number][] = [
  ['castTime', 'colCast', 0.1],
  ['manaCost', 'colMana', 1],
  ['directMin', 'colMin', 1],
  ['directMax', 'colMax', 1],
  ['directCoeff', 'colCoeff', 0.01],
  ['dotTotal', 'colDot', 1],
  ['dotCoeff', 'colDotCoeff', 0.01],
];

// Soins : valeur moyenne calculée avec la puissance de soins.
const HEALS = new Set([
  'holyLight', 'flashOfLight', 'holyShock', 'lightsVigil',
  'healingTouch', 'regrowth', 'rejuvenation', 'wildGrowth',
  'greaterHeal', 'heal', 'flashHeal', 'prayerOfHealing', 'renew', 'powerWordShield', 'penance', 'prayerOfMending',
  'healingWave', 'lesserHealingWave', 'chainHeal', 'riptide',
]);

/** Puissance qui s'applique à un sort (null : technique physique, dont la valeur dépend de l'arme). */
function powerResolver(state: AppState): (s: SpellDef) => number | null {
  const g = computeGear(state);
  const rules = state.rules as never;
  const heal = (hp: number, other: (s: SpellDef) => number | null) => (s: SpellDef) => (HEALS.has(s.id) ? hp : other(s));
  switch (state.classId) {
    case 'paladin': {
      const d = derivePaladin(rules, g.stats, state.talents, g.mods);
      return heal(d.healingPower, (s) => (s.school === 'physical' ? null : d.spellPower));
    }
    case 'druid': {
      const d = deriveDruid(rules, g.stats, state.talents, state.spec as DruidSpec, g.mods);
      return heal(d.healingPower, (s) => (s.school === 'physical' ? null : d.spellPower));
    }
    case 'mage': {
      const d = deriveMage(rules, g.stats, state.talents, g.mods);
      return (s) => (s.school === 'fire' ? d.firePower : d.spellPower) + (s.id === 'arcaneWrath' ? 0.05 * d.maxMana : 0);
    }
    case 'priest': {
      const d = derivePriest(rules, g.stats, state.talents, g.mods);
      return heal(d.healingPower, (s) => (s.school === 'shadow' ? d.shadowPower : d.spellPower));
    }
    case 'shaman': {
      const d = deriveShaman(rules, g.stats, state.talents, g.mods);
      return heal(d.healingPower, (s) =>
        s.school === 'physical' ? null : s.school === 'fire' ? d.firePower : s.school === 'frost' ? d.frostPower : d.naturePower,
      );
    }
    case 'hunter': {
      const d = deriveHunter(rules, g.stats, state.talents, g.mods);
      return (s) => (s.school === 'physical' ? null : d.rangedAp);
    }
    // Voleur et guerrier : poisons et saignements sans coefficient, le reste dépend de l'arme.
    default:
      return (s) => (s.school === 'physical' && (s.directCoeff || s.dotCoeff) ? null : 0);
  }
}

/** Dégâts (ou soins) moyens d'un sort hors critique, avec la puissance actuelle (0 : non calculable ici). */
export function spellAverages(state: AppState): (s: SpellDef) => number {
  if (state.classId === 'warlock') {
    const calc = makeCalculator(buildConfig(state) as SimConfig);
    return (s) => calc.directAvg(s) + calc.dotTotal(s) + calc.delayed(s);
  }
  const power = powerResolver(state);
  return (s) => {
    if (s.directMax === undefined && s.dotTotal === undefined) return 0;
    const p = power(s);
    if (p === null) return 0;
    return ((s.directMin ?? 0) + (s.directMax ?? 0)) / 2 + (s.dotTotal ?? 0) + ((s.directCoeff ?? 0) + (s.dotCoeff ?? 0)) * p;
  };
}

export function SettingsPanel() {
  const { state, set, reset, cls } = useStore();
  const { t, num, lang } = useI18n();
  const average = spellAverages(state);
  const setRule = (k: string, v: number | boolean) => set({ rules: { ...state.rules, [k]: v }, weights: null });
  const setSpell = (id: string, k: keyof SpellDef, v: number) =>
    set({ spells: state.spells.map((s) => (s.id === id ? { ...s, [k]: v } : s)), weights: null });

  return (
    <div className="grid">
      <div className="panel">
        <h2>{t('settingsWhy')}</h2>
        <p className="muted">{t('settingsWhyText')}</p>
        <p className="small muted">{t('dataFetched', { d: new Date(cls.data.dataSource.fetchedAt).toLocaleDateString(lang) })}</p>
      </div>

      <div className="panel grid">
        <h3>{t('gameRules')}</h3>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {cls.ruleFields.map(([k, step]) => (
            <NumberField key={k} label={t(`rule_${k}` as TKey)} step={step} value={state.rules[k] as number} onChange={(v) => setRule(k, v)} width={120} />
          ))}
        </div>
        {cls.ruleBooleans.map((k) => (
          <label key={k} className="check">
            <input type="checkbox" checked={!!state.rules[k]} onChange={(e) => setRule(k, e.target.checked)} />
            {t(k as TKey)}
          </label>
        ))}
      </div>

      <div className="panel grid">
        <h3>{t('spellsMaxRank')}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('spell')}</th>
                {SPELL_FIELDS.map(([, label]) => <th key={label} className="num">{t(label)}</th>)}
                <th className="num">{t('avgDamage')}</th>
              </tr>
            </thead>
            <tbody>
              {state.spells.map((s) => {
                const avg = average(s);
                const meta = cls.data.spellMeta[s.id];
                return (
                  <tr key={s.id}>
                    <td>
                      {meta ? (
                        <a className="plain" href={wowheadUrl('spell', meta.id, lang)} target="_blank" rel="noreferrer" title={meta.tooltip[lang] || undefined}>
                          <SpellName id={s.id} />
                        </a>
                      ) : (
                        <SpellName id={s.id} />
                      )}
                    </td>
                    {SPELL_FIELDS.map(([k, label, step]) => (
                      <td key={label} className="num">
                        {s[k] === undefined ? (
                          <span className="muted">—</span>
                        ) : (
                          <input type="number" step={step} value={s[k] as number} style={{ width: 76 }} onChange={(e) => setSpell(s.id, k, e.target.valueAsNumber || 0)} />
                        )}
                      </td>
                    ))}
                    <td className="num">{avg ? num(avg) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">{t('avgDamageNote')}</p>
      </div>

      <div className="panel row">
        <button className="btn secondary" onClick={() => set({ rules: cls.defaultRules, spells: cls.spells, weights: null })}>
          {t('resetSpells')}
        </button>
        <button className="btn danger" onClick={() => confirm(t('confirmReset')) && reset()}>
          {t('resetAll')}
        </button>
      </div>
    </div>
  );
}
