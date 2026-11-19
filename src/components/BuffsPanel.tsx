import { BUFFS, buffVisible, type BuffDef, type BuffKind } from '../data/buffs';
import type { SimModifiers } from '../data/types';
import { wowheadUrl } from '../data/wowhead';
import { rank } from '../engine/talents';
import { useI18n, type TKey } from '../i18n';
import { useStore } from '../state/store';
import { Icon, NumberField, useStatSummary } from './ui';

const KINDS: [BuffKind, TKey][] = [
  ['consumable', 'buffConsumables'],
  ['raid', 'buffRaid'],
  ['world', 'buffWorld'],
  ['debuff', 'buffDebuffs'],
];

/** Texte court pour les effets qui ne sont pas des stats. */
function useModsSummary() {
  const { t, num } = useI18n();
  return (m: Partial<SimModifiers> | undefined) => {
    if (!m) return [];
    const out: string[] = [];
    if (m.statMult && m.statMult !== 1) out.push(t('modStats', { n: num((m.statMult - 1) * 100) }));
    if (m.maxMana) out.push(t('modMana', { n: num(m.maxMana) }));
    if (m.armorReduction) out.push(t('modArmor', { n: num(m.armorReduction) }));
    if (m.weaponDamage) out.push(t('modWeaponDamage', { n: num(m.weaponDamage) }));
    if (m.hastePct) out.push(t('modHaste', { n: num(m.hastePct) }));
    if (m.staminaMult && m.staminaMult !== 1) out.push(t('modStamina', { n: num((m.staminaMult - 1) * 100) }));
    if (m.maxHealth) out.push(t('modHealth', { n: num(m.maxHealth) }));
    return out;
  };
}

export function BuffsPanel() {
  const { state, set } = useStore();
  const { t, L, lang } = useI18n();
  const summary = useStatSummary();
  const modsSummary = useModsSummary();
  const active = new Set(state.consumables);

  const toggle = (b: BuffDef, on: boolean) => {
    // Un seul effet par groupe : choisir un flacon retire l'autre.
    const next = state.consumables.filter((id) => {
      if (id === b.id) return false;
      const other = BUFFS.find((x) => x.id === id);
      return !(on && b.group && other?.group === b.group);
    });
    if (on) next.push(b.id);
    set({ consumables: next, weights: null });
  };

  const setBuffs = (patch: Partial<typeof state.buffs>) => set({ buffs: { ...state.buffs, ...patch }, weights: null });
  const ownIsb = rank(state.talents, 'improvedShadowBolt') > 0;

  return (
    <div className="grid grid-2">
      {KINDS.map(([kind, title]) => (
        <div key={kind} className="panel grid" style={{ alignContent: 'start' }}>
          <h3>{t(title)}</h3>
          {BUFFS.filter((b) => b.kind === kind && buffVisible(b, state.classId, state.spec)).map((b) => {
            const effects = [b.stats ? summary(b.stats) : '', ...modsSummary(b.mods)].filter((x) => x && x !== '—');
            return (
              <label key={b.id} className="check buff-row">
                <input type="checkbox" checked={active.has(b.id)} onChange={(e) => toggle(b, e.target.checked)} />
                <Icon name={b.icon} size={22} />
                <span>
                  <a className="plain" href={wowheadUrl(b.wowhead.type, b.wowhead.id, lang)} target="_blank" rel="noreferrer">
                    {L(b.name)}
                  </a>
                  {effects.length > 0 && <span className="small muted"> · {effects.join(', ')}</span>}
                  {b.note && <div className="small muted">{L(b.note)}</div>}
                </span>
              </label>
            );
          })}
          {kind === 'consumable' && <p className="small muted">{t('buffGroupsNote')}</p>}
          {kind === 'debuff' && state.classId === 'warlock' && (
            <>
              <NumberField
                label={t('raidIsbUptime')}
                value={state.buffs.raidIsbUptime}
                min={0}
                max={100}
                step={5}
                onChange={(v) => setBuffs({ raidIsbUptime: Math.max(0, Math.min(100, v)) })}
              />
              <p className="small muted">{t(ownIsb ? 'raidIsbOwnNote' : 'raidIsbNote')}</p>
              <div className="row">
                <NumberField label={t('shadowPct')} value={state.buffs.shadowDamagePct} onChange={(v) => setBuffs({ shadowDamagePct: v })} />
                <NumberField label={t('firePct')} value={state.buffs.fireDamagePct} onChange={(v) => setBuffs({ fireDamagePct: v })} />
              </div>
              <p className="small muted">{t('otherDebuffsNote')}</p>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
