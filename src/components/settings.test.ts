import { describe, expect, it } from 'vitest';
import { CLASSES } from '../data/classes';
import { defaultState, specPresets, type AppState } from '../state/store';
import { spellAverages } from './SettingsPanel';

describe('Sorts & règles : valeurs moyennes', () => {
  for (const cls of CLASSES) {
    for (const spec of cls.specs) {
      it(`${cls.id} / ${spec.id} : calcule sans erreur`, () => {
        const base = defaultState(cls.id);
        const state = { ...base, spec: spec.id, talents: spec.defaultTalents, ...specPresets(spec.id, base) } as AppState;
        const avg = spellAverages(state);
        const values = state.spells.map((s) => avg(s));
        expect(values.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
        expect(values.some((v) => v > 0)).toBe(true);
      });
    }
  }
});
