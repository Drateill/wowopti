import { describe, expect, it } from 'vitest';
import { CLASS_BY_ID } from '../data/classes';
import { buildConfig, defaultState, specPresets, type AppState } from '../state/store';
import { DEFAULT_OPT, optimizerSetup, rotationConfig, scenarioEvaluator, searchSpace, type Scenario } from '../state/optimize';
import { diffRotations, explainChanges, neighbors, optimizeRotation, revertChange, startRotation, templatesFor, type Evaluator } from './optimizer';
import { simulateAny } from './sim';

const state = (classId: 'warlock' | 'rogue', spec: string): AppState => {
  const base = defaultState(classId);
  const s = CLASS_BY_ID[classId].specs.find((x) => x.id === spec)!;
  return { ...base, spec, talents: s.defaultTalents, ...specPresets(spec, base) };
};

/** Évaluation directe (sans worker), comme dans l'app. */
const evaluator = (st: AppState, scenarios?: Scenario[]): Evaluator =>
  scenarioEvaluator(
    st,
    scenarios ?? [{ id: 'c', name: '', weight: 1, fightLength: st.fightLength, targets: st.targets ?? 1, movementPct: st.movementPct ?? 0 }],
    async (configs) =>
      configs.map((c) => {
        const r = simulateAny(c);
        return { dps: r.dps, stdev: r.stdev, iterations: r.iterations };
      }),
  );

const FAST = { searchIterations: 120, confirmIterations: 600, maxRounds: 6, minGainPct: 0.15, topN: 3 };

describe('optimiseur de rotation', () => {
  it('propose des variantes variées', () => {
    const st = state('warlock', 'destruction');
    const setup = optimizerSetup(st, CLASS_BY_ID.warlock);
    const start = startRotation(setup, undefined, undefined);
    const n = neighbors(start, setup);
    expect(n.length).toBeGreaterThan(50);
    expect(n.some((r) => r.priority.some((e) => e.id === 'spell:rainOfFire'))).toBe(true);
    // Flammes infernales blesse aussi le démoniste (non simulé) : pas proposée.
    expect(setup.extraSteps).not.toContain('spell:hellfire');
    expect(n.some((r) => r.priority.some((e) => !e.enabled))).toBe(true);
    expect(n.some((r) => r.priority.some((e) => e.conditions.length > 0))).toBe(true);
    expect(n.every((r) => JSON.stringify(r) !== JSON.stringify(start))).toBe(true);
  });

  it('respecte les étapes verrouillées et les changements interdits', () => {
    const st = state('warlock', 'destruction');
    const space = searchSpace(st, CLASS_BY_ID.warlock, { ...DEFAULT_OPT, locked: { destruction: ['immolate'] }, extras: false, conditions: false });
    const start = startRotation(space, undefined, undefined);
    const at = start.priority.findIndex((e) => e.id === 'immolate');
    for (const r of neighbors(start, space)) {
      const e = r.priority.find((x) => x.id === 'immolate')!;
      expect(r.priority.indexOf(e)).toBe(at);
      expect(e.enabled).toBe(true);
      expect(e.conditions).toEqual([]);
      expect(r.priority.some((x) => x.id.startsWith('spell:'))).toBe(false);
      expect(r.priority.every((x) => x.conditions.length === 0)).toBe(true);
    }
  });

  it('répartit les seuils dans la plage et les affine', () => {
    const t = templatesFor([{ kind: 'targetHp', min: 10, max: 50, step: 5 }]);
    expect([...new Set(t.map((c) => c.value))]).toEqual([10, 25, 35, 50]);
    const st = state('warlock', 'destruction');
    const space = searchSpace(st, CLASS_BY_ID.warlock, { ...DEFAULT_OPT, extras: false });
    const start = startRotation(space, undefined, undefined);
    start.priority[0] = { ...start.priority[0], conditions: [{ kind: 'targetHp', op: '<', value: 25 }] };
    const values = neighbors(start, space)
      .map((r) => r.priority[0].conditions[0])
      .filter((c) => c?.kind === 'targetHp')
      .map((c) => `${c.op}${c.value}`);
    expect(values).toEqual(expect.arrayContaining(['<20', '<30', '>=25']));
  });

  it('répare une rotation abîmée et classe ses meilleures variantes', async () => {
    const st = state('warlock', 'affliction');
    const setup = optimizerSetup(st, CLASS_BY_ID.warlock);
    const broken = startRotation(setup, setup.steps.map((id) => ({ id, enabled: id !== 'corruption', conditions: [] })), undefined);
    const res = await optimizeRotation(setup, [broken], evaluator(st), FAST);
    const best = res.candidates[0];
    expect(best.rotation.priority.find((e) => e.id === 'corruption')?.enabled).toBe(true);
    expect(best.gain).toBeGreaterThan(0);
    expect(best.reliable).toBe(true);
    expect(best.eval.iterations).toBe(600);
    expect(res.candidates.length).toBeLessThanOrEqual(3);
    expect(res.candidates.every((c, i) => i === 0 || c.eval.dps <= res.candidates[i - 1].eval.dps)).toBe(true);
    expect(res.history.length).toBeGreaterThan(0);
  }, 60_000);

  it('explique ce que rapporte chaque changement', async () => {
    const st = state('warlock', 'affliction');
    const setup = optimizerSetup(st, CLASS_BY_ID.warlock);
    const start = startRotation(setup, setup.steps.map((id) => ({ id, enabled: id !== 'corruption', conditions: [] })), undefined);
    const best = startRotation(setup, undefined, undefined);
    best.priority = [{ id: 'spell:deathCoil', enabled: true, conditions: [] }, ...best.priority];
    const changes = diffRotations(start, best);
    expect(changes.map((c) => c.kind).sort()).toEqual(['added', 'enabled']);
    // Retirer un changement redonne bien la rotation de départ pour ce point.
    const noCoil = revertChange(best, start, changes.find((c) => c.kind === 'added')!);
    expect(noCoil.priority.some((e) => e.id === 'spell:deathCoil')).toBe(false);
    const list = await explainChanges(start, best, evaluator(st), 300);
    const corruption = list.find((x) => x.change.id === 'corruption')!;
    expect(corruption.dps).toBeGreaterThan(5); // réactiver Corruption rapporte nettement
  }, 60_000);

  it('optimise un mélange de combats pondérés', async () => {
    const st = state('warlock', 'destruction');
    const fights: Scenario[] = [
      { id: 'a', name: 'mono', weight: 1, fightLength: 180, targets: 1, movementPct: 0 },
      { id: 'b', name: 'zone', weight: 1, fightLength: 180, targets: 5, movementPct: 0 },
    ];
    const r = startRotation(optimizerSetup(st, CLASS_BY_ID.warlock), undefined, undefined);
    const [mix] = await evaluator(st, fights)([r], 200, 1);
    const [one] = await evaluator(st, [fights[0]])([r], 200, 1);
    const [five] = await evaluator(st, [fights[1]])([r], 200, 1);
    expect(mix.dps).toBeCloseTo((one.dps + five.dps) / 2, 6);
  });

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
