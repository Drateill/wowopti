// Étapes de rotation de chaque simulateur, dans l'ordre par défaut.
// Un identifiant d'étape est celui du sort quand il y en a un (le nom vient alors des données du sort),
// sinon une clé de traduction `step_<id>` (sort de remplissage, attente…).
// Les soigneurs n'ont pas de liste : leurs choix dépendent des dégâts reçus, pas d'un ordre fixe.

export const WARLOCK_STEPS = ['baneOfDoom', 'baneOfAgony', 'corruption', 'siphonLife', 'immolate', 'conflagrate', 'wrack', 'shadowTrance', 'filler'] as const;

export const MAGE_STEPS = {
  frost: ['iceBarrier', 'iceLance', 'filler'],
  fire: ['scorch', 'pyroblast', 'fireBlast', 'filler'],
  arcane: ['arcaneWrath', 'missileBarrage', 'arcaneBlast', 'arcaneMissiles', 'filler'],
} as const;

export const PRIEST_STEPS = ['vampiricEmbrace', 'shadowWordPain', 'devouringPlague', 'mindBlast', 'shadowWordDeath', 'filler'] as const;

export const ROGUE_STEPS = ['shank', 'sliceAndDice', 'bladeFlurry', 'rupture', 'eviscerate', 'pool', 'builder'] as const;

const WARRIOR_DPS = ['execute', 'bloodthirst', 'mortalStrike', 'rend', 'overpower', 'whirlwind', 'slam'] as const;
export const WARRIOR_STEPS = { arms: WARRIOR_DPS, fury: WARRIOR_DPS, prot: ['shieldSlam', 'revenge', 'sunderArmor'] } as const;

const HUNTER_RANGED = ['serpentSting', 'summonHawk', 'sniperShot', 'sixSecondShot', 'arcaneShot'] as const;
export const HUNTER_STEPS = { bm: HUNTER_RANGED, mm: HUNTER_RANGED, surv: ['serpentSting', 'mongooseBite', 'striderKick', 'raptorStrike'] } as const;

export const SHAMAN_STEPS = {
  elemental: ['chainLightning', 'shock', 'searingTotem', 'lightningBolt'],
  enhancement: ['stormstrike', 'maelstromBolt', 'shock', 'searingTotem'],
  resto: [],
} as const;

export const PALADIN_STEPS = ['seal', 'holyShield', 'judgement', 'holyStrike', 'hammerOfWrath', 'exorcism', 'consecration'] as const;

export const DRUID_STEPS = {
  balance: ['moonfire', 'insectSwarm', 'filler'],
  cat: ['rip', 'ferociousBite', 'pool', 'rake', 'builder'],
  bear: ['primalBite', 'lacerate', 'swipe'],
} as const;

const HEALERS = new Set(['paladin:holy', 'priest:disc', 'priest:holy', 'shaman:resto', 'druid:resto']);

/** Étapes de la rotation d'une classe et spécialisation (vide pour un soigneur). */
export function rotationSteps(classId: string, spec: string): readonly string[] {
  if (HEALERS.has(`${classId}:${spec}`)) return [];
  const pick = <T extends Record<string, readonly string[]>>(m: T) => m[spec as keyof T] ?? [];
  switch (classId) {
    case 'warlock':
      return WARLOCK_STEPS;
    case 'mage':
      return pick(MAGE_STEPS);
    case 'priest':
      return PRIEST_STEPS;
    case 'rogue':
      return ROGUE_STEPS;
    case 'warrior':
      return pick(WARRIOR_STEPS);
    case 'hunter':
      return pick(HUNTER_STEPS);
    case 'shaman':
      return pick(SHAMAN_STEPS);
    case 'paladin':
      return PALADIN_STEPS;
    case 'druid':
      return pick(DRUID_STEPS);
    default:
      return [];
  }
}

/** Ressource lue par les conditions « ressource » de la classe. */
export function rotationResource(classId: string, spec: string): 'mana' | 'energy' | 'rage' {
  if (classId === 'rogue' || (classId === 'druid' && spec === 'cat')) return 'energy';
  if (classId === 'warrior' || (classId === 'druid' && spec === 'bear')) return 'rage';
  return 'mana';
}

/** La classe a-t-elle des points de combo ? */
export const hasCombo = (classId: string, spec: string) => classId === 'rogue' || (classId === 'druid' && spec === 'cat');
