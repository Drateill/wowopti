import type { Stats } from '../data/types';
import type { AnySimConfig } from '../state/store';
import { druidWeightSpec, simulateDruid } from './druidSim';
import { mageWeightSpec, simulateMage } from './mageSim';
import { paladinWeightSpec, simulatePaladin } from './paladinSim';
import { priestWeightSpec, simulatePriest } from './priestSim';
import { DEFAULT_MELEE, DEFAULT_RANGED, hunterWeightSpec, simulateHunter } from './hunterSim';
import { DEFAULT_ROGUE_MH, rogueWeightSpec, simulateRogue } from './rogueSim';
import { DEFAULT_SHAMAN_2H, shamanWeightSpec, simulateShaman } from './shamanSim';
import { DEFAULT_WARRIOR_1H, DEFAULT_WARRIOR_2H, simulateWarrior, warriorWeightSpec } from './warriorSim';
import { applyFight, type FightSettings } from './fight';
import type { SimResult, StatWeight } from './simTypes';
import { WEIGHT_DELTAS, simulate as simulateWarlock, type SimConfig } from './warlockSim';

// Point d'entrée commun : choisit le simulateur de la classe.

export function simulateAny(config: AnySimConfig): SimResult {
  const fight = (config as { fight?: FightSettings & { healer?: boolean } }).fight;
  const res = simulateSingle(config);
  return applyFight(res, config as Parameters<typeof applyFight>[1], fight, !!fight?.healer);
}

function simulateSingle(config: AnySimConfig): SimResult {
  if (config.classId === 'druid') return simulateDruid(config);
  if (config.classId === 'mage') return simulateMage(config);
  if (config.classId === 'priest') return simulatePriest(config);
  if (config.classId === 'hunter') return simulateHunter(config);
  if (config.classId === 'rogue') return simulateRogue(config);
  if (config.classId === 'warrior') return simulateWarrior(config);
  if (config.classId === 'shaman') return simulateShaman(config);
  return config.classId === 'paladin' ? simulatePaladin(config) : simulateWarlock(config as SimConfig);
}

/** Stats testées pour les poids, et stat de référence (EP = 1). */
export function weightSpec(config: AnySimConfig): { deltas: Partial<Record<keyof Stats, number>>; base: keyof Stats } {
  if (config.classId === 'druid') return druidWeightSpec(config.spec);
  if (config.classId === 'mage') return mageWeightSpec();
  if (config.classId === 'priest') return priestWeightSpec(config.spec);
  if (config.classId === 'hunter') return hunterWeightSpec(config.spec);
  if (config.classId === 'rogue') return rogueWeightSpec();
  if (config.classId === 'warrior') return warriorWeightSpec(config.spec);
  if (config.classId === 'shaman') return shamanWeightSpec(config.spec);
  return config.classId === 'paladin' ? paladinWeightSpec(config.spec) : { deltas: WEIGHT_DELTAS, base: 'spellPower' };
}

/** Ajoute `delta` à une stat. Le DPS d'arme modifie les dégâts de l'arme portée. */
function withDelta(config: AnySimConfig, key: keyof Stats, delta: number): AnySimConfig {
  if (key === 'weaponDps' && config.classId === 'hunter') {
    const bump = (w: { min: number; max: number; speed: number; twoHand: boolean }) => ({ ...w, min: w.min + delta * w.speed, max: w.max + delta * w.speed });
    return config.spec === 'surv'
      ? { ...config, meleeWeapon: bump(config.meleeWeapon ?? DEFAULT_MELEE) }
      : { ...config, weapon: bump(config.weapon ?? DEFAULT_RANGED) };
  }
  if (key === 'weaponDps' && (config.classId === 'rogue' || config.classId === 'warrior' || config.classId === 'shaman')) {
    const fallback = config.classId === 'rogue' ? DEFAULT_ROGUE_MH : config.classId === 'shaman' ? DEFAULT_SHAMAN_2H : config.spec === 'arms' ? DEFAULT_WARRIOR_2H : DEFAULT_WARRIOR_1H;
    const w = config.weapon ?? fallback;
    return { ...config, weapon: { ...w, min: w.min + delta * w.speed, max: w.max + delta * w.speed } };
  }
  if (key === 'weaponDps' && (config.classId === 'paladin' || config.classId === 'druid')) {
    const w = config.weapon ?? { min: 1, max: 2, speed: 2, twoHand: false };
    return { ...config, weapon: { ...w, min: w.min + delta * w.speed, max: w.max + delta * w.speed } };
  }
  return { ...config, gear: { ...config.gear, [key]: (config.gear[key] ?? 0) + delta } } as AnySimConfig;
}

/** Poids de stats par différence finie, avec la même graine pour chaque variante. */
export function statWeightsAny(config: AnySimConfig, onProgress?: (done: number, total: number) => void): { base: SimResult; weights: StatWeight[] } {
  const { deltas, base: baseKey } = weightSpec(config);
  const keys = Object.keys(deltas) as (keyof Stats)[];
  const total = keys.length + 1;
  const base = simulateAny(config);
  onProgress?.(1, total);
  const raw = keys.map((key, i) => {
    const delta = deltas[key]!;
    const res = simulateAny(withDelta(config, key, delta));
    onProgress?.(i + 2, total);
    const dpsGain = res.dps - base.dps;
    return { key, delta, dpsGain, perPoint: dpsGain / delta };
  });
  const ref = raw.find((w) => w.key === baseKey)?.perPoint || 1;
  return { base, weights: raw.map((w) => ({ ...w, ep: w.perPoint / ref })) };
}
