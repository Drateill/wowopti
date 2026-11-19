import type { GameRules, SimModifiers, Stats } from '../data/types';
import { talentValue } from '../data/warlock/talents';
import { rank, type TalentPoints } from './talents';

export type Pet = 'none' | 'imp' | 'voidwalker' | 'succubus' | 'felhunter';

export interface DerivedStats {
  spellPower: number;
  shadowPower: number; // puissance totale appliquée aux sorts d'ombre
  firePower: number;
  intellect: number;
  spirit: number;
  stamina: number;
  mp5: number;
  maxMana: number;
  /** Crit de base, intelligence et équipement (hors talents propres à un sort). */
  critPct: number;
  hitPct: number;
  chanceToHitPct: number;
  hitToCap: number;
}

export function deriveStats(
  rules: GameRules,
  gear: Stats,
  talents: TalentPoints,
  activePet: Pet = 'none',
  mods?: Pick<SimModifiers, 'statMult' | 'maxMana'>,
): DerivedStats {
  // Bénédiction des rois, Esprit des Zandalar : pourcentage de toutes les caractéristiques.
  const statMult = mods?.statMult ?? 1;
  const intellect = (rules.baseIntellect + gear.intellect) * statMult;
  const spirit = (rules.baseSpirit + gear.spirit) * statMult;
  const felVitality = talentValue('felVitality', rank(talents, 'felVitality'), /maximum Mana by (\d+)%\.?$/);
  const maxMana = (rules.baseMana + intellect * rules.manaPerInt) * (1 + felVitality / 100) + (mods?.maxMana ?? 0);
  const critPct = rules.baseCritPct + intellect / rules.intPerCritPct + gear.critPct;
  const hitPct = gear.hitPct + talentValue('suppression', rank(talents, 'suppression'), /hit by (\d+)%/);
  const missPct = Math.max(rules.minMissPct, rules.targetMissPct - hitPct);
  // Connaissance démoniaque : puissance des sorts = X % du niveau, si un démon est invoqué.
  const knowledge =
    activePet !== 'none'
      ? (rules.level * talentValue('demonicKnowledge', rank(talents, 'demonicKnowledge'), /up to (\d+)% of your level/)) / 100
      : 0;
  const spellPower = gear.spellPower + knowledge;
  return {
    spellPower,
    shadowPower: spellPower + gear.shadowPower,
    firePower: spellPower + gear.firePower,
    intellect,
    spirit,
    stamina: gear.stamina * statMult,
    mp5: gear.mp5,
    maxMana,
    critPct,
    hitPct,
    chanceToHitPct: 100 - missPct,
    hitToCap: Math.max(0, rules.targetMissPct - rules.minMissPct - hitPct),
  };
}
