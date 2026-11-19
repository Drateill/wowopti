import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DruidOptions } from '../data/druid/data';
import type { MageOptions } from '../data/mage/data';
import type { PaladinOptions, PaladinSeal } from '../data/paladin/data';
import { runSim } from '../engine/simClient';
import type { SimResult } from '../engine/simTypes';
import type { Pet } from '../engine/stats';
import { rank } from '../engine/talents';
import { effectivePet, type RotationOptions } from '../engine/warlockSim';
import { useI18n, type TKey } from '../i18n';
import { buildConfig, computeGear, useStore } from '../state/store';
import { Icon, NumberField, Progress } from './ui';

const axis = { stroke: '#9a92a8', fontSize: 11 };
const tooltipStyle = { contentStyle: { background: '#0b0a0f', border: '1px solid #322c3d' }, labelStyle: { color: '#9a92a8' } };
const PETS: Pet[] = ['none', 'imp', 'voidwalker', 'succubus', 'felhunter'];

export function SpellName({ id }: { id: string }) {
  const { L } = useI18n();
  const { cls } = useStore();
  const meta = cls.data.spellMeta[id];
  return (
    <span className="spell-name">
      <Icon name={meta?.icon ?? ''} size={18} /> {meta ? L(meta.name) : id}
    </span>
  );
}

/** Indicateur principal de la spécialisation : DPS, HPS ou menace par seconde. */
export function useMetric() {
  const { state, cls } = useStore();
  return cls.specs.find((s) => s.id === state.spec)?.metric ?? 'dps';
}

export function SimPanel() {
  const { state, set, cls } = useStore();
  const { t } = useI18n();
  const [result, setResult] = useState<SimResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      setResult(await runSim(buildConfig(state)));
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="grid sim-layout">
      <div className="panel grid" style={{ alignContent: 'start' }}>
        <h2>{t('fight')}</h2>
        <div className="row">
          <NumberField label={t('duration')} value={state.fightLength} min={10} onChange={(v) => set({ fightLength: Math.max(10, v), weights: null })} />
          <NumberField label={t('iterations')} value={state.iterations} min={50} step={100} onChange={(v) => set({ iterations: Math.max(50, Math.min(50000, v)), weights: null })} />
        </div>
        {cls.id === 'paladin' ? <PaladinOptionsPanel /> : cls.id === 'druid' ? <DruidOptionsPanel /> : cls.id === 'mage' ? <MageOptionsPanel /> : <WarlockOptions />}
        <p className="small muted">{t('buffsElsewhere')}</p>
        <button className="btn" onClick={run} disabled={running}>{running ? t('simulating') : t('runSim')}</button>
        {error && <p className="bad small">{error}</p>}
      </div>

      <div className="grid" style={{ alignContent: 'start' }}>
        {!result && <div className="panel muted">{t('simEmpty')}</div>}
        {result && <Results r={result} fight={state.fightLength} />}
        {running && <Progress value={null} />}
      </div>
    </div>
  );
}

function WarlockOptions() {
  const { state, set } = useStore();
  const { t, pet, L } = useI18n();
  const { cls } = useStore();
  const rot = state.rotation;
  const setRot = (patch: Partial<RotationOptions>) => set({ rotation: { ...rot, ...patch }, weights: null });
  const setBuffs = (patch: Partial<typeof state.buffs>) => set({ buffs: { ...state.buffs, ...patch }, weights: null });
  const has = (k: string) => rank(state.talents, k) > 0;
  const meta = cls.data.spellMeta;

  const check = (key: keyof RotationOptions, spell: string, talent?: string) => {
    const ok = !talent || has(talent);
    return (
      <label className={`check ${ok ? '' : 'muted'}`}>
        <input type="checkbox" disabled={!ok} checked={!!rot[key] && ok} onChange={(e) => setRot({ [key]: e.target.checked })} />
        <SpellName id={spell} /> {!ok && t('talentRequired')}
      </label>
    );
  };

  const petBlocked = state.buffs.activePet !== 'none' && effectivePet(state.buffs, state.talents) === 'none';

  return (
    <>
      <h3>{t('rotation')}</h3>
      <label className="field">
        {t('bane')}
        <select value={rot.bane} onChange={(e) => setRot({ bane: e.target.value as RotationOptions['bane'] })}>
          <option value="agony">{t('baneAgony')}</option>
          <option value="doom">{t('baneDoom')}</option>
          <option value="none">{t('baneNone')}</option>
        </select>
      </label>
      {check('corruption', 'corruption')}
      {check('siphonLife', 'siphonLife', 'siphonLife')}
      {check('immolate', 'immolate')}
      {check('conflagrate', 'conflagrate', 'conflagrate')}
      {check('wrack', 'wrack', 'wrack')}
      <label className="field">
        {t('filler')}
        <select value={rot.filler} onChange={(e) => setRot({ filler: e.target.value as RotationOptions['filler'] })}>
          {(['shadowBolt', 'searingPain', 'incinerate'] as const).map((id) => (
            <option key={id} value={id} disabled={id === 'incinerate' && !has('incinerate')}>
              {meta[id] ? L(meta[id].name) : id}
              {id === 'incinerate' && !has('incinerate') ? ` ${t('talentRequired')}` : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="small muted">{t('rotationNote')}</p>

      <h3>{t('demons')}</h3>
      <div className="row">
        <label className={`field ${has('demonicSacrifice') ? '' : 'muted'}`}>
          {t('sacrificed')} {!has('demonicSacrifice') && t('talentRequired')}
          <select disabled={!has('demonicSacrifice')} value={state.buffs.sacrificed} onChange={(e) => setBuffs({ sacrificed: e.target.value as Pet })}>
            {PETS.map((p) => <option key={p} value={p}>{pet(p)}</option>)}
          </select>
        </label>
        <label className="field">
          {t('activePet')}
          <select value={state.buffs.activePet} onChange={(e) => setBuffs({ activePet: e.target.value as Pet })}>
            {PETS.map((p) => <option key={p} value={p}>{pet(p)}</option>)}
          </select>
        </label>
      </div>
      {petBlocked && <p className="small warn">{t('petBlocked')}</p>}
      {effectivePet(state.buffs, state.talents) === 'imp' && (
        <label className="check">
          <input type="checkbox" checked={rot.petAttacks !== false} onChange={(e) => setRot({ petAttacks: e.target.checked })} />
          <SpellName id="impFirebolt" />
        </label>
      )}
    </>
  );
}

function PaladinOptionsPanel() {
  const { state, set } = useStore();
  const { t } = useI18n();
  const o = state.pal;
  const setO = (patch: Partial<PaladinOptions>) => set({ pal: { ...o, ...patch }, weights: null });
  const has = (k: string) => rank(state.talents, k) > 0;
  const gear = computeGear(state);
  const box = (key: keyof PaladinOptions, label: React.ReactNode, ok = true, why?: string) => (
    <label className={`check ${ok ? '' : 'muted'}`}>
      <input type="checkbox" disabled={!ok} checked={!!o[key] && ok} onChange={(e) => setO({ [key]: e.target.checked })} />
      {label} {!ok && why}
    </label>
  );

  if (state.spec === 'holy') {
    return (
      <>
        <h3>{t('palHealing')}</h3>
        <div className="row">
          <NumberField label={t('palActivity')} value={o.activityPct} min={5} max={100} step={5} onChange={(v) => setO({ activityPct: Math.max(5, Math.min(100, v)) })} />
          <NumberField label={t('palHolyLightPct')} value={o.holyLightPct} min={0} max={100} step={10} onChange={(v) => setO({ holyLightPct: Math.max(0, Math.min(100, v)) })} />
          <NumberField label={t('palOverheal')} value={o.overhealPct} min={0} max={90} step={5} onChange={(v) => setO({ overhealPct: Math.max(0, Math.min(90, v)) })} />
        </div>
        {box('useHolyShock', <SpellName id="holyShock" />, has('holyShock'), t('talentRequired'))}
        {box('useLightsVigil', <SpellName id="lightsVigil" />, has('lightsVigil'), t('talentRequired'))}
        {o.useLightsVigil && has('lightsVigil') && (
          <NumberField label={t('palVigilTargets')} value={o.vigilTargets} min={1} max={5} onChange={(v) => setO({ vigilTargets: Math.max(1, Math.min(5, v)) })} />
        )}
        {box('useDivineFavor', <SpellName id="divineFavor" />, has('divineFavor'), t('talentRequired'))}
        {box('manaPotions', t('palManaPotions'))}
        <p className="small muted">{t('palHolyNote')}</p>
      </>
    );
  }

  const prot = state.spec === 'prot';
  const seals: PaladinSeal[] = prot ? ['fury', 'righteousness', 'command'] : ['command', 'righteousness', 'crusader'];
  const sealSpell: Record<PaladinSeal, string> = { command: 'sealOfCommand', righteousness: 'sealOfRighteousness', crusader: 'sealOfTheCrusader', fury: 'sealOfFury' };
  return (
    <>
      <h3>{t('rotation')}</h3>
      <label className="field">
        {t('palSeal')}
        <select value={o.seal} onChange={(e) => setO({ seal: e.target.value as PaladinSeal })}>
          {seals.map((s) => (
            <option key={s} value={s} disabled={s === 'command' && !has('sealOfCommand')}>
              {t(`palSeal_${s}` as TKey)}
              {s === 'command' && !has('sealOfCommand') ? ` ${t('talentRequired')}` : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="small muted"><SpellName id={sealSpell[o.seal]} /></p>
      <label className="field">
        {t('palCrusader')}
        <select value={o.crusaderJudgement} onChange={(e) => setO({ crusaderJudgement: e.target.value as PaladinOptions['crusaderJudgement'] })}>
          <option value="self">{t('palCrusaderSelf')}</option>
          <option value="other">{t('palCrusaderOther')}</option>
          <option value="none">{t('palCrusaderNone')}</option>
        </select>
      </label>
      {box('judgement', <SpellName id="judgement" />)}
      {box('holyStrike', <SpellName id="holyStrike" />)}
      {box('consecration', <SpellName id="consecration" />)}
      {box('hammerOfWrath', <SpellName id="hammerOfWrath" />)}
      {box('exorcism', <SpellName id="exorcism" />)}
      {box('undeadOrDemon', t('palUndead'))}
      {prot && (
        <>
          <h3>{t('palTanking')}</h3>
          {box('shield', t('palShield'))}
          {o.shield && state.equipped.offHand && !gear.shield && <p className="small warn">{t('palNoShield')}</p>}
          {box('holyShield', <SpellName id="holyShield" />, has('holyShield'), t('talentRequired'))}
          {box('righteousFury', <SpellName id="righteousFury" />)}
          <p className="small muted">{t('palBossNote')}</p>
        </>
      )}
      {!gear.weapon && <p className="small warn">{t('palNoWeapon')}</p>}
      <p className="small muted">{t(prot ? 'palProtNote' : 'palRetNote')}</p>
    </>
  );
}

function MageOptionsPanel() {
  const { state, set, cls } = useStore();
  const { t, L } = useI18n();
  const o = state.mage;
  const setO = (patch: Partial<MageOptions>) => set({ mage: { ...o, ...patch }, weights: null });
  const has = (k: string) => rank(state.talents, k) > 0;
  const box = (key: keyof MageOptions, label: React.ReactNode, ok = true) => (
    <label className={`check ${ok ? '' : 'muted'}`}>
      <input type="checkbox" disabled={!ok} checked={!!o[key] && ok} onChange={(e) => setO({ [key]: e.target.checked })} />
      {label} {!ok && t('talentRequired')}
    </label>
  );
  const spec = state.spec;
  return (
    <>
      <h3>{t('rotation')}</h3>
      {spec === 'arcane' && (
        <>
          {box('arcaneWrath', <SpellName id="arcaneWrath" />, has('arcaneWrath'))}
          <div className="row">
            <NumberField label={t('mageAbStacks')} value={o.arcaneBlastStacks} min={0} max={4} onChange={(v) => setO({ arcaneBlastStacks: Math.max(0, Math.min(4, v)) })} />
            <NumberField label={t('mageAbFloor')} value={o.arcaneBlastManaFloor} min={0} max={100} step={5} onChange={(v) => setO({ arcaneBlastManaFloor: Math.max(0, Math.min(100, v)) })} />
          </div>
          {!has('arcaneBlast') && <p className="small warn">{t('mageNoBlast')}</p>}
        </>
      )}
      {spec === 'fire' && (
        <>
          {box('scorch', t('mageScorch'), has('improvedScorch'))}
          {box('fireBlast', <SpellName id="fireBlast" />)}
          {box('pyroblast', t('magePyro'), has('pyroblast'))}
        </>
      )}
      {spec === 'frost' && (
        <>
          {box('iceBarrier', <SpellName id="iceBarrier" />, has('iceBarrier'))}
          {box('iceLance', t('mageIceLance'), has('iceLance'))}
        </>
      )}
      {spec !== 'arcane' && (
        <label className="field">
          {t('filler')}
          <select value={o.filler} onChange={(e) => setO({ filler: e.target.value as MageOptions['filler'] })}>
            {(spec === 'fire' ? (['fireball', 'frostfireBolt'] as const) : (['frostbolt', 'frostfireBolt'] as const)).map((id) => (
              <option key={id} value={id}>{L(cls.data.spellMeta[id]?.name)}</option>
            ))}
          </select>
        </label>
      )}
      {box('cooldowns', t('mageCooldowns'))}
      {box('mageArmor', <SpellName id="mageArmor" />)}
      {box('evocation', <SpellName id="evocation" />)}
      {box('manaPotions', t('palManaPotions'))}
      <p className="small muted">{t(`mageNote_${spec}` as TKey)}</p>
    </>
  );
}

function DruidOptionsPanel() {
  const { state, set } = useStore();
  const { t } = useI18n();
  const o = state.dru;
  const setO = (patch: Partial<DruidOptions>) => set({ dru: { ...o, ...patch }, weights: null });
  const has = (k: string) => rank(state.talents, k) > 0;
  const gear = computeGear(state);
  const box = (key: keyof DruidOptions, label: React.ReactNode, ok = true) => (
    <label className={`check ${ok ? '' : 'muted'}`}>
      <input type="checkbox" disabled={!ok} checked={!!o[key] && ok} onChange={(e) => setO({ [key]: e.target.checked })} />
      {label} {!ok && t('talentRequired')}
    </label>
  );
  const mana = (
    <>
      {box('innervate', <SpellName id="innervate" />)}
      {box('manaPotions', t('palManaPotions'))}
    </>
  );

  if (state.spec === 'balance') {
    return (
      <>
        <h3>{t('rotation')}</h3>
        {box('moonfire', <SpellName id="moonfire" />)}
        {box('insectSwarm', <SpellName id="insectSwarm" />, has('insectSwarm'))}
        <label className="field">
          {t('filler')}
          <select value={o.filler} onChange={(e) => setO({ filler: e.target.value as DruidOptions['filler'] })}>
            <option value="starfire">{t('druFillerStarfire')}</option>
            <option value="wrath">{t('druFillerWrath')}</option>
            <option value="eclipse" disabled={!has('eclipse')}>{t('druFillerEclipse')}{has('eclipse') ? '' : ` ${t('talentRequired')}`}</option>
          </select>
        </label>
        {box('moonkin', t('druMoonkin'), has('moonkinForm'))}
        {mana}
        <p className="small muted">{t('druBalanceNote')}</p>
      </>
    );
  }
  if (state.spec === 'resto') {
    return (
      <>
        <h3>{t('palHealing')}</h3>
        <div className="row">
          <NumberField label={t('palActivity')} value={o.activityPct} min={5} max={100} step={5} onChange={(v) => setO({ activityPct: Math.max(5, Math.min(100, v)) })} />
          <NumberField label={t('palOverheal')} value={o.overhealPct} min={0} max={90} step={5} onChange={(v) => setO({ overhealPct: Math.max(0, Math.min(90, v)) })} />
          <NumberField label={t('druHotTargets')} value={o.hotTargets} min={0} max={10} onChange={(v) => setO({ hotTargets: Math.max(0, Math.min(10, v)) })} />
        </div>
        {box('regrowth', <SpellName id="regrowth" />)}
        {box('wildGrowth', <SpellName id="wildGrowth" />, has('wildGrowth'))}
        {o.wildGrowth && has('wildGrowth') && (
          <NumberField label={t('palVigilTargets')} value={o.wildGrowthTargets} min={1} max={5} onChange={(v) => setO({ wildGrowthTargets: Math.max(1, Math.min(5, v)) })} />
        )}
        {box('swiftmend', <SpellName id="swiftmend" />, has('swiftmend'))}
        {box('naturesSwiftness', <SpellName id="naturesSwiftness" />, has('naturesSwiftness'))}
        {mana}
        <p className="small muted">{t('druRestoNote')}</p>
      </>
    );
  }
  if (state.spec === 'bear') {
    return (
      <>
        <h3>{t('rotation')}</h3>
        {box('primalBite', <SpellName id="primalBite" />, has('primalBite'))}
        {box('lacerate', <SpellName id="lacerate" />, has('lacerate'))}
        {box('maul', <SpellName id="maul" />)}
        {box('swipe', <SpellName id="swipe" />)}
        <NumberField label={t('druMaulRage')} value={o.maulRage} min={0} max={85} step={5} onChange={(v) => setO({ maulRage: Math.max(0, Math.min(85, v)) })} />
        <p className="small muted">{t('palBossNote')}</p>
        {!gear.weapon && <p className="small warn">{t('palNoWeapon')}</p>}
        <p className="small muted">{t('druBearNote')}</p>
      </>
    );
  }
  return (
    <>
      <h3>{t('rotation')}</h3>
      {box('behind', t('druBehind'))}
      {box('rake', <SpellName id="rake" />)}
      {box('rip', <SpellName id="rip" />)}
      {box('ferociousBite', <SpellName id="ferociousBite" />)}
      {!gear.weapon && <p className="small warn">{t('palNoWeapon')}</p>}
      <p className="small muted">{t('druCatNote')}</p>
    </>
  );
}

/** Indicateurs propres à la classe, affichés sous le résultat principal. */
const EXTRAS: { key: string; label: TKey; digits: number; suffix?: string; time?: boolean }[] = [
  { key: 'damagePerSecond', label: 'extraDps', digits: 1 },
  { key: 'damageTakenPerSecond', label: 'extraDtps', digits: 0 },
  { key: 'avoidedPct', label: 'extraAvoided', digits: 1, suffix: ' %' },
  { key: 'blockedPct', label: 'extraBlocked', digits: 1, suffix: ' %' },
  { key: 'critTakenPct', label: 'extraCritTaken', digits: 1, suffix: ' %' },
  { key: 'crushTakenPct', label: 'extraCrushTaken', digits: 1, suffix: ' %' },
  { key: 'oomAt', label: 'extraOom', digits: 0, time: true },
  { key: 'manaEnd', label: 'extraManaEnd', digits: 0 },
];

function Results({ r, fight }: { r: SimResult; fight: number }) {
  const { t, num } = useI18n();
  const { cls, state } = useStore();
  const metric = useMetric();
  const m = t(`metric_${metric}` as TKey);
  const total = r.breakdown.reduce((s, b) => s + b.damage, 0);
  const err = (1.96 * r.stdev) / Math.sqrt(r.iterations);
  // En Protection, le DPS est un indicateur secondaire : la menace est déjà la valeur principale.
  const extras = EXTRAS.filter((e) => r.extras?.[e.key] !== undefined && !(e.key === 'damagePerSecond' && metric === 'dps'));
  return (
    <>
      <div className="panel">
        <div className="row" style={{ alignItems: 'baseline' }}>
          <span className="big-number">{num(r.dps, 1)}</span>
          <span className="muted">{t('avgMetric', { m, n: num(err, 1) })}</span>
        </div>
        <div className="stat-tiles" style={{ marginTop: 10 }}>
          <Tile label={t('stdev')} value={num(r.stdev, 1)} />
          <Tile label={t('minMax')} value={`${num(r.min)} / ${num(r.max)}`} />
          <Tile label={t(metric === 'hps' ? 'healPerFight' : metric === 'tps' ? 'threatPerFight' : 'dmgPerFight')} value={num(total)} />
          {cls.id === 'warlock' && <Tile label={t('lifeTapsPerFight')} value={num(r.lifeTaps, 1)} />}
          {extras.map((e) => {
            const v = r.extras![e.key];
            const shown = e.time ? (v >= state.fightLength - 0.5 ? t('never') : `${num(v)} s`) : `${num(v, e.digits)}${e.suffix ?? ''}`;
            return <Tile key={e.key} label={t(e.label)} value={shown} />;
          })}
          <Tile label={t('iterations')} value={num(r.iterations)} />
        </div>
      </div>

      <div className="panel">
        <h3>{t('breakdown')}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('spell')}</th>
                <th className="num">{m}</th>
                <th style={{ width: '22%' }}>{t('share')}</th>
                <th className="num">{t('casts')}</th>
                <th className="num">{t('ticks')}</th>
                <th className="num">{t('critPctCol')}</th>
                <th className="num">{t('misses')}</th>
              </tr>
            </thead>
            <tbody>
              {r.breakdown.filter((b) => b.damage > 0).map((b) => {
                const events = b.hits + b.ticks;
                return (
                  <tr key={b.id}>
                    <td><SpellName id={b.id} /></td>
                    <td className="num">{num(b.damage / fight, 1)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <div className="bar" style={{ flex: 1 }}><div style={{ width: `${total ? (b.damage / total) * 100 : 0}%` }} /></div>
                        <span className="small muted">{num(total ? (b.damage / total) * 100 : 0, 1)} %</span>
                      </div>
                    </td>
                    <td className="num">{num(b.casts, 1)}</td>
                    <td className="num">{b.ticks ? num(b.ticks, 1) : '—'}</td>
                    <td className="num">{events ? num((b.crits / events) * 100, 1) : '—'}</td>
                    <td className="num">{num(b.misses, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="panel">
          <h3>{t('metricOverTime', { m })}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={r.timeline} margin={{ left: -10, right: 8 }}>
              <CartesianGrid stroke="#322c3d" strokeDasharray="3 3" />
              <XAxis dataKey="t" {...axis} unit=" s" />
              <YAxis {...axis} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => num(v, 1)} labelFormatter={(l) => `${l} s`} />
              <Line type="monotone" dataKey="dps" stroke="#9b6cf0" dot={false} strokeWidth={2} name={m} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h3>{t('metricDistribution', { m })}</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={r.histogram} margin={{ left: -10, right: 8 }}>
              <CartesianGrid stroke="#322c3d" strokeDasharray="3 3" />
              <XAxis dataKey="dps" {...axis} />
              <YAxis {...axis} />
              <Tooltip {...tooltipStyle} labelFormatter={(l) => `≈ ${l} ${m}`} />
              <Bar dataKey="count" fill="#9b6cf0" name={t('fights')} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
