import { describe, expect, it } from 'vitest';
import { CLASS_BY_ID } from '../data/classes';
import { buildConfig, defaultState, specPresets, type AppState } from '../state/store';
import { optimizerSetup, rotationConfig } from '../state/optimize';
import { neighbors, optimizeRotation, startRotation, type Evaluator } from './optimizer';
import { simulateAny } from './sim';

const state = (classId: 'warlock' | 'rogue', spec: string): AppState => {
  const base = defaultState(classId);
  const s = CLASS_BY_ID[classId].specs.find((x) => x.id === spec)!;
  return { ...base, spec, talents: s.defaultTalents, ...specPresets(spec, base) };
};

/** Évaluation directe (sans worker), comme dans l'app. */
const evaluator =
  (st: AppState): Evaluator =>
  async (rotations, iterations, seed) =>
    rotations.map((r) => {
      const res = simulateAny(rotationConfig(st, r, iterations, seed));
      return { dps: res.dps, stdev: res.stdev, iterations: res.iterations };
    });

describe('optimiseur de rotation', () => {
  it('propose des variantes variées', () => {
    const st = state('warlock', 'destruction');
    const setup = optimizerSetup(st, CLASS_BY_ID.warlock);
    const start = startRotation(setup, undefined, undefined);
    const n = neighbors(start, setup);
    expect(n.length).toBeGreaterThan(50);
    // Ajout de la Pluie de feu, désactivation d'une étape, condition sur une étape.
    expect(n.some((r) => r.priority.some((e) => e.id === 'spell:rainOfFire'))).toBe(true);
    // Flammes infernales blesse aussi le démoniste (non simulé) : pas proposée.
    expect(setup.extraSteps).not.toContain('spell:hellfire');
    expect(n.some((r) => r.priority.some((e) => !e.enabled))).toBe(true);
    expect(n.some((r) => r.priority.some((e) => e.conditions.length > 0))).toBe(true);
    // Une seule différence par variante.
    expect(n.every((r) => JSON.stringify(r) !== JSON.stringify(start))).toBe(true);
  });

  it('répare une rotation abîmée', async () => {
    const st = state('warlock', 'affliction');
    const setup = optimizerSetup(st, CLASS_BY_ID.warlock);
    // Corruption désactivée : l'optimiseur doit la réactiver et le gain doit être confirmé.
    const broken = startRotation(setup, setup.steps.map((id) => ({ id, enabled: id !== 'corruption', conditions: [] })), undefined);
    const res = await optimizeRotation(setup, broken, evaluator(st), { searchIterations: 120, confirmIterations: 600, maxRounds: 6, minGainPct: 0.15 });
    expect(res.best.priority.find((e) => e.id === 'corruption')?.enabled).toBe(true);
    expect(res.gain).toBeGreaterThan(0);
    expect(res.reliable).toBe(true);
    expect(res.bestEval.iterations).toBe(600);
  }, 60_000);

  it('la configuration d’une rotation candidate reprend tout le reste de l’état', () => {
    const st = { ...state('rogue', 'combat'), targets: 3 };
    const setup = optimizerSetup(st, CLASS_BY_ID.rogue);
    const cfg = rotationConfig(st, startRotation(setup, undefined, undefined), 50, 9);
    expect(cfg.iterations).toBe(50);
    expect(cfg.seed).toBe(9);
    expect((cfg as { fight?: { targets: number } }).fight?.targets).toBe(3);
    expect(cfg.classId).toBe(buildConfig(st).classId);
  });
});
