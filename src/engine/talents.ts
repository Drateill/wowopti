import type { TalentDef } from '../data/types';

export type TalentPoints = Record<string, number>;

export const MAX_POINTS = 51; // niveau 60
export const POINTS_PER_ROW = 5;

export const rank = (points: TalentPoints, key: string) => points[key] ?? 0;

export function pointsInTree(points: TalentPoints, talents: TalentDef[], treeIndex: number): number {
  return talents.filter((t) => t.tree === treeIndex).reduce((s, t) => s + rank(points, t.key), 0);
}

export function totalPoints(points: TalentPoints): number {
  return Object.values(points).reduce((s, v) => s + v, 0);
}

/** Points dépensés dans les rangées strictement au-dessus de `row`. */
function pointsAboveRow(points: TalentPoints, talents: TalentDef[], treeIndex: number, row: number): number {
  return talents
    .filter((t) => t.tree === treeIndex && t.row < row)
    .reduce((s, t) => s + rank(points, t.key), 0);
}

const requirementsMet = (points: TalentPoints, talent: TalentDef) =>
  talent.requires.every((r) => rank(points, r.key) >= r.qty);

export function canIncrease(points: TalentPoints, talents: TalentDef[], talent: TalentDef): boolean {
  if (totalPoints(points) >= MAX_POINTS) return false;
  if (rank(points, talent.key) >= talent.maxRank) return false;
  if (pointsAboveRow(points, talents, talent.tree, talent.row) < talent.row * POINTS_PER_ROW) return false;
  return requirementsMet(points, talent);
}

/** Un point peut être retiré si l'arbre reste valide ensuite. */
export function canDecrease(points: TalentPoints, talents: TalentDef[], talent: TalentDef): boolean {
  if (rank(points, talent.key) <= 0) return false;
  return isValid({ ...points, [talent.key]: rank(points, talent.key) - 1 }, talents);
}

export function isValid(points: TalentPoints, talents: TalentDef[]): boolean {
  if (totalPoints(points) > MAX_POINTS) return false;
  for (const t of talents) {
    const r = rank(points, t.key);
    if (r === 0) continue;
    if (r > t.maxRank) return false;
    if (pointsAboveRow(points, talents, t.tree, t.row) < t.row * POINTS_PER_ROW) return false;
    if (!requirementsMet(points, t)) return false;
  }
  return Object.keys(points).every((k) => talents.some((t) => t.key === k));
}

/** Encodage compact pour le partage par lien : un chiffre par talent, arbres séparés par « - ». */
export function encodeTalents(points: TalentPoints, talents: TalentDef[], treeCount: number): string {
  const parts: string[] = [];
  for (let i = 0; i < treeCount; i++) {
    parts.push(
      talents
        .filter((t) => t.tree === i)
        .map((t) => String(rank(points, t.key)))
        .join('')
        .replace(/0+$/, ''),
    );
  }
  return parts.join('-');
}

export function decodeTalents(code: string, talents: TalentDef[], treeCount: number): TalentPoints | null {
  const parts = code.split('-');
  if (parts.length !== treeCount) return null;
  const points: TalentPoints = {};
  for (let i = 0; i < treeCount; i++) {
    const list = talents.filter((t) => t.tree === i);
    const digits = parts[i];
    if (!/^\d*$/.test(digits) || digits.length > list.length) return null;
    list.forEach((t, j) => {
      const v = Number(digits[j] ?? 0);
      if (v > 0) points[t.key] = Math.min(v, t.maxRank);
    });
  }
  return isValid(points, talents) ? points : null;
}
