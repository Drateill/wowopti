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

describe('Sorts & règles : techniques physiques', () => {
  const avgOf = (classId: AppState['classId'], spec: string, id: string) => {
    const base = defaultState(classId);
    const cls = CLASSES.find((c) => c.id === classId)!;
    const state = { ...base, spec, talents: cls.specs.find((s) => s.id === spec)!.defaultTalents, ...specPresets(spec, base) } as AppState;
    return spellAverages(state)(state.spells.find((s) => s.id === id)!);
  };
  it('calcule les coups d’arme avec l’arme et la puissance d’attaque', () => {
    expect(avgOf('rogue', 'combat', 'sinisterStrike')).toBeGreaterThan(100);
    expect(avgOf('rogue', 'combat', 'eviscerate')).toBeGreaterThan(avgOf('rogue', 'combat', 'sinisterStrike'));
    expect(avgOf('warrior', 'arms', 'mortalStrike')).toBeGreaterThan(200);
    expect(avgOf('warrior', 'prot', 'shieldSlam')).toBeGreaterThan(600);
    expect(avgOf('shaman', 'enhancement', 'stormstrike')).toBeGreaterThan(100);
    expect(avgOf('druid', 'cat', 'shred')).toBeGreaterThan(80);
    expect(avgOf('hunter', 'mm', 'aimedShot')).toBeGreaterThan(350);
  });
});
