import type { ClassModule } from '../data/classes';
import { extraSpellsFor, extraStepId, supportsExtraSpells } from '../data/extraSpells';
import type { OptimizerSetup, Rotation } from '../engine/optimizer';
import { COOLDOWN_TALENT, cooldownKey, cooldownSteps, hasCombo, rotationResource, rotationSteps } from '../engine/rotationSteps';
import { rank } from '../engine/talents';
import { buildConfig, type AnySimConfig, type AppState } from './store';

/** Ce que l'optimiseur peut changer pour la classe et la spécialisation de l'état. */
export function optimizerSetup(state: AppState, cls: ClassModule): OptimizerSetup {
  const hasTalent = (key?: string) => !key || rank(state.talents, key) > 0;
  return {
    steps: rotationSteps(cls.id, state.spec),
    cooldowns: cooldownSteps(cls.id, state.spec).filter((id) => hasTalent(COOLDOWN_TALENT[id])),
    extraSteps: supportsExtraSpells(cls.id, state.spec)
      ? extraSpellsFor(cls)
          // Un sort qui blesse aussi le lanceur paraîtrait gratuit : on ne le propose pas.
          .filter((s) => hasTalent(s.requiresTalent) && !s.selfDamage)
          .map((s) => extraStepId(s.id))
      : [],
    resource: rotationResource(cls.id, state.spec),
    hasCombo: hasCombo(cls.id, state.spec),
  };
}

/** État avec une rotation et des temps forts donnés. */
export const withRotation = (state: AppState, r: Rotation): AppState => ({
  ...state,
  priority: { ...state.priority, [state.spec]: r.priority, [cooldownKey(state.spec)]: r.cooldowns },
});

/** Configuration de simulation d'une rotation candidate. */
export const rotationConfig = (state: AppState, r: Rotation, iterations: number, seed: number): AnySimConfig => ({
  ...buildConfig(withRotation(state, r)),
  iterations,
  seed,
});
