import type { SpellDef } from '../data/types';
import type { SimResult, SpellBreakdown } from './simTypes';

// Type de combat, appliqué après la simulation mono-cible :
// - cibles : les sorts de zone touchent les cibles en plus (la rotation reste celle du mono-cible) ;
// - déplacements : part du combat où l'on bouge. Les sorts avec temps d'incantation et les coups
//   d'arme sont perdus pendant ce temps ; les sorts instantanés de lanceur et les dégâts sur la durée continuent.

export interface FightSettings {
  /** Nombre de cibles (1 à 10). */
  targets: number;
  /** Pourcentage du combat passé à se déplacer (0 à 60). */
  movementPct: number;
}

export const DEFAULT_FIGHT: FightSettings = { targets: 1, movementPct: 0 };

/** Multiplicateur de dégâts d'un sort de zone selon le nombre de cibles. */
export function aoeMultiplier(id: string, targets: number): number {
  const n = Math.max(1, Math.floor(targets));
  switch (id) {
    case 'chainLightning': {
      // 3 cibles, chaque rebond fait 30 % de moins.
      let m = 0;
      for (let k = 0; k < Math.min(n, 3); k++) m += 0.7 ** k;
      return m;
    }
    case 'multiShot':
    case 'swipe':
      return Math.min(n, 3);
    case 'whirlwind':
      return Math.min(n, 4);
    case 'consecration':
      return n;
    default:
      return 1;
  }
}

/** Coups d'arme et effets qui en découlent : perdus quand on n'est pas au contact ou à portée. */
const WEAPON_IDS = new Set(['melee', 'offHand', 'autoShot', 'windfury', 'extraAttack', 'instantPoison', 'deadlyPoison', 'deepWounds', 'pet', 'hawk']);

/** Classes et spécialisations dont les techniques s'utilisent au contact ou à portée d'arme. */
export function isWeaponBased(classId: string | undefined, spec: string | undefined): boolean {
  if (classId === 'rogue' || classId === 'warrior' || classId === 'hunter') return true;
  if (classId === 'shaman') return spec === 'enhancement';
  if (classId === 'druid') return spec === 'cat' || spec === 'bear';
  if (classId === 'paladin') return spec === 'ret' || spec === 'prot';
  return false;
}

/** Part d'une ligne perdue pendant les déplacements (0 à 1). */
function movementLoss(e: SpellBreakdown, spell: SpellDef | undefined, weaponBased: boolean): number {
  const pureDot = e.ticks > 0 && e.hits === 0 && e.crits === 0;
  if (pureDot) return 0;
  if (WEAPON_IDS.has(e.id)) return 1;
  // Au contact, presque tout demande d'être sur la cible ; un lanceur continue ses instantanés en bougeant.
  if (weaponBased) return 1;
  return spell && spell.castTime > 0 ? 1 : 0;
}

/** Applique cibles et déplacements à un résultat mono-cible. */
export function applyFight(
  res: SimResult,
  config: { classId?: string; spec?: string; spells: SpellDef[]; fightLength: number; options?: unknown },
  fight: FightSettings | undefined,
  healer: boolean,
): SimResult {
  if (!fight) return res;
  const targets = healer ? 1 : Math.max(1, Math.min(10, Math.floor(fight.targets || 1)));
  const moving = Math.max(0, Math.min(60, fight.movementPct || 0)) / 100;
  if (targets === 1 && moving === 0) return res;

  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const weaponBased = isWeaponBased(config.classId, config.spec);
  const breakdown = res.breakdown.map((e) => {
    const keep = 1 - moving * movementLoss(e, spells.get(e.id), weaponBased);
    return { ...e, damage: e.damage * keep * aoeMultiplier(e.id, targets) };
  });

  // Déluge de lames (voleur) : pendant qu'il est actif, chaque coup physique touche une 2e cible.
  if (config.classId === 'rogue' && targets >= 2) {
    const flurry = breakdown.find((e) => e.id === 'bladeFlurry');
    if (flurry && flurry.casts > 0) {
      const uptime = Math.min(1, (flurry.casts * 15) / config.fightLength);
      const physical = breakdown
        .filter((e) => (spells.get(e.id)?.school ?? 'physical') === 'physical' && e.id !== 'bladeFlurry' && e.id !== 'rupture')
        .reduce((a, e) => a + e.damage, 0);
      flurry.damage += physical * uptime;
    }
  }

  const before = res.breakdown.reduce((a, e) => a + e.damage, 0);
  const after = breakdown.reduce((a, e) => a + e.damage, 0);
  const f = before > 0 ? after / before : 1;
  return {
    ...res,
    dps: res.dps * f,
    stdev: res.stdev * f,
    min: res.min * f,
    max: res.max * f,
    breakdown,
    timeline: res.timeline.map((p) => ({ ...p, dps: p.dps * f })),
    histogram: res.histogram.map((h) => ({ ...h, dps: h.dps * f })),
  };
}
