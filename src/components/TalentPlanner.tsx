import { useState } from 'react';
import type { TalentDef } from '../data/types';
import { MAX_POINTS, canDecrease, canIncrease, encodeTalents, pointsInTree, rank, totalPoints } from '../engine/talents';
import { useI18n } from '../i18n';
import { useStore } from '../state/store';
import { Icon } from './ui';

// Géométrie de la grille (4 colonnes × 7 rangées, comme en jeu).
const CELL = 44;
const GAP_X = 18;
const GAP_Y = 16;
const COLS = 4;
const ROWS = 7;
const W = COLS * CELL + (COLS - 1) * GAP_X;
const H = ROWS * CELL + (ROWS - 1) * GAP_Y;
const x = (col: number) => col * (CELL + GAP_X);
const y = (row: number) => row * (CELL + GAP_Y);

export function TalentPlanner() {
  const { state, set, cls } = useStore();
  const { t, L, num } = useI18n();
  const pts = state.talents;
  const [hover, setHover] = useState<{ t: TalentDef; x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const update = (next: Record<string, number>) => set({ talents: next, weights: null });
  const inc = (tal: TalentDef) => canIncrease(pts, cls.talents, tal) && update({ ...pts, [tal.key]: rank(pts, tal.key) + 1 });
  const dec = (tal: TalentDef) => {
    if (!canDecrease(pts, cls.talents, tal)) return;
    const next = { ...pts, [tal.key]: rank(pts, tal.key) - 1 };
    if (next[tal.key] === 0) delete next[tal.key];
    update(next);
  };

  const share = async () => {
    const code = encodeTalents(pts, cls.talents, cls.trees.length);
    const url = `${location.origin}${location.pathname}#t=${code}&c=${cls.id}`;
    history.replaceState(null, '', `#t=${code}&c=${cls.id}`);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt(t('buildLink'), url);
    }
  };

  return (
    <div className="grid">
      <div className="panel row">
        <span>
          {t('points')} : <b>{totalPoints(pts)}</b> / {MAX_POINTS} <span className="muted small">({t('talentHelp')})</span>
        </span>
        <span className="spacer" />
        <span className="small muted">{t('legendNoSim')}</span>
        <button className="btn secondary small" onClick={() => update({})}>{t('reset')}</button>
        <button className="btn small" onClick={share}>{copied ? t('linkCopied') : t('copyLink')}</button>
      </div>

      <div className="trees">
        {cls.trees.map((tree, ti) => {
          const list = cls.talents.filter((tal) => tal.tree === ti);
          return (
            <div className="tree" key={tree.key}>
              <div className="tree-head">
                <h3 style={{ color: tree.color, margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Icon name={tree.icon} size={24} /> {L(tree.name)}
                </h3>
                <span className="muted">{t('pts', { n: num(pointsInTree(pts, cls.talents, ti)) })}</span>
              </div>
              <div className="tree-grid" style={{ width: W, height: H }}>
                <svg className="arrows" width={W} height={H}>
                  {list.flatMap((tal) =>
                    tal.requires.map((r) => {
                      const from = cls.data.byKey.get(r.key);
                      if (!from) return null;
                      const met = rank(pts, r.key) >= r.qty;
                      const x1 = x(from.col) + CELL / 2;
                      const y1 = y(from.row) + CELL / 2;
                      const x2 = x(tal.col) + CELL / 2;
                      const y2 = y(tal.row);
                      // Même rangée : flèche horizontale. Sinon : on descend puis on tourne.
                      const d =
                        from.row === tal.row
                          ? `M${x1 + (x2 > x1 ? CELL / 2 : -CELL / 2)},${y1} H${x2 + (x2 > x1 ? -CELL / 2 : CELL / 2)}`
                          : from.col === tal.col
                            ? `M${x1},${y(from.row) + CELL} V${y2}`
                            : `M${x1 + (x2 > x1 ? CELL / 2 : -CELL / 2)},${y1} H${x2} V${y2}`;
                      return <path key={tal.key + r.key} d={d} className={met ? 'arrow met' : 'arrow'} markerEnd={met ? 'url(#tip-met)' : 'url(#tip)'} />;
                    }),
                  )}
                  <defs>
                    <marker id="tip" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
                      <path d="M0,0 L6,3 L0,6 z" fill="#5a5068" />
                    </marker>
                    <marker id="tip-met" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
                      <path d="M0,0 L6,3 L0,6 z" fill="#e8b84a" />
                    </marker>
                  </defs>
                </svg>
                {list.map((tal) => {
                  const r = rank(pts, tal.key);
                  const avail = canIncrease(pts, cls.talents, tal);
                  const look = r === tal.maxRank ? 'maxed' : r > 0 ? 'partial' : avail ? 'available' : 'locked';
                  return (
                    <div
                      key={tal.key}
                      className={`talent ${look}`}
                      style={{ left: x(tal.col), top: y(tal.row), width: CELL, height: CELL }}
                      onClick={() => inc(tal)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        dec(tal);
                      }}
                      onMouseMove={(e) => setHover({ t: tal, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(null)}
                      aria-label={`${L(tal.name)} ${r}/${tal.maxRank}`}
                    >
                      <Icon name={tal.icon} size={CELL - 4} />
                      {!tal.simulated && <span className="nosim" />}
                      <span className="rank">
                        {r}/{tal.maxRank}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {hover && <TalentTooltip tal={hover.t} r={rank(pts, hover.t.key)} x={hover.x} y={hover.y} />}
    </div>
  );
}

function TalentTooltip({ tal, r, x: mx, y: my }: { tal: TalentDef; r: number; x: number; y: number }) {
  const { t, L, lang } = useI18n();
  const { cls } = useStore();
  const left = Math.min(mx + 14, window.innerWidth - 330);
  const top = Math.min(my + 14, window.innerHeight - 260);
  const desc = (rk: number) => tal.desc[lang][rk - 1] ?? tal.desc.en[rk - 1];
  return (
    <div className="tooltip" style={{ left, top }}>
      <div className="t-title">
        <Icon name={tal.icon} size={20} /> {L(tal.name)} <span className="muted">({r}/{tal.maxRank})</span>
      </div>
      {r > 0 && <p className="pre">{desc(r)}</p>}
      {r < tal.maxRank && (
        <p className="muted pre">
          {r > 0 ? `${t('nextRank')} ` : ''}
          {desc(r + 1)}
        </p>
      )}
      {tal.requires.map((req) => {
        const other = cls.data.byKey.get(req.key);
        return other ? <p key={req.key} className="small warn">{t('requiresTalent', { n: req.qty, name: L(other.name) })}</p> : null;
      })}
      {tal.row > 0 && <p className="small muted">{t('requiresTree', { n: tal.row * 5 })}</p>}
      {!tal.simulated && <p className="small muted">{t('notSimulated')}</p>}
    </div>
  );
}
