import { Component, type CSSProperties, type ReactNode } from 'react';
import { PCT_STATS, STAT_KEYS, type Stats } from '../data/types';
import { iconUrl } from '../data/wowhead';
import { useI18n } from '../i18n';

export function NumberField(props: {
  label: ReactNode;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  width?: number;
}) {
  return (
    <label className="field">
      {props.label}
      <input
        type="number"
        value={Number.isFinite(props.value) ? props.value : 0}
        step={props.step ?? 1}
        min={props.min}
        max={props.max}
        style={props.width ? { width: props.width } : undefined}
        onChange={(e) => {
          const v = e.target.valueAsNumber;
          props.onChange(Number.isFinite(v) ? v : 0);
        }}
      />
    </label>
  );
}

export function StatsEditor({ stats, onChange, keys = STAT_KEYS }: { stats: Stats; onChange: (s: Stats) => void; keys?: (keyof Stats)[] }) {
  const { stat } = useI18n();
  return (
    <div className="row" style={{ alignItems: 'flex-end' }}>
      {keys.map((k) => (
        <NumberField
          key={k}
          label={stat(k)}
          value={stats[k] ?? 0}
          step={PCT_STATS.has(k) ? 0.1 : 1}
          onChange={(v) => onChange({ ...stats, [k]: v })}
        />
      ))}
    </div>
  );
}

export function Progress({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <div className="progress">
      <div style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function Icon({ name, size = 20, style, border }: { name: string; size?: number; style?: CSSProperties; border?: string }) {
  return (
    <img
      className="icon"
      src={iconUrl(name, size > 36 ? 'large' : 'medium')}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      onError={(e) => {
        // Icône manquante côté Blizzard : on affiche le point d'interrogation de Wowhead.
        const fallback = iconUrl('', size > 36 ? 'large' : 'medium');
        if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
      }}
      style={{ ...(border ? { borderColor: border } : null), ...style }}
    />
  );
}

/** Résumé lisible d'un jeu de stats (« +35 Puissance des sorts, +1 % Critique »). */
export function useStatSummary() {
  const { stat, num } = useI18n();
  return (s: Partial<Stats>) =>
    STAT_KEYS.filter((k) => s[k])
      .map((k) => `${s[k]! > 0 ? '+' : ''}${num(s[k]!, PCT_STATS.has(k) || k === 'weaponDps' ? 1 : 0)}${PCT_STATS.has(k) ? ' %' : ''} ${stat(k).replace(' %', '')}`)
      .join(', ') || '—';
}

/** Isole une erreur d'affichage dans un onglet : message à la place d'une page blanche. */
export class TabErrorBoundary extends Component<{ message: string; children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel">
        <p>{this.props.message}</p>
        <p className="small muted">{this.state.error.message}</p>
      </div>
    );
  }
}
