import { describe, expect, it } from 'vitest';
import { CLASSES } from '../data/classes';
import { buildConfig, defaultState, specPresets, type AppState } from '../state/store';
import { conditionsHold, isCustomized, makeCooldownGate, makePriority, resolveOrder, type PriorityList } from './priority';
import { cooldownKey, rotationSteps } from './rotationSteps';
import { simulateAny } from './sim';

const stateFor = (classId: (typeof CLASSES)[number]['id'], spec: string, priority?: PriorityList, cooldowns?: PriorityList): AppState => {
  const base = defaultState(classId);
  const s = CLASSES.find((c) => c.id === classId)!.specs.find((x) => x.id === spec)!;
  return { ...base, spec, talents: s.defaultTalents, ...specPresets(spec, base), iterations: 100, priority: { ...(priority ? { [spec]: priority } : {}), ...(cooldowns ? { [cooldownKey(spec)]: cooldowns } : {}) } };
};

describe('liste de priorités', () => {
  it('garde l’ordre de l’utilisateur et replace les étapes ajoutées depuis', () => {
    const order = resolveOrder(['a', 'b', 'c', 'd'], [
      { id: 'c', enabled: true, conditions: [] },
      { id: 'a', enabled: false, conditions: [] },
      { id: 'zz', enabled: true, conditions: [] },
    ]);
    // « b » suit « a » et « d » suit « c », comme dans l'ordre par défaut.
    expect(order.map((e) => e.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(order[2].enabled).toBe(false);
    expect(isCustomized(['a', 'b'], [])).toBe(false);
    expect(isCustomized(['a', 'b'], [{ id: 'b', enabled: true, conditions: [] }, { id: 'a', enabled: true, conditions: [] }])).toBe(true);
  });

  it('évalue les conditions sur l’état du combat', () => {
    const ctx = { time: () => 150, fightLength: 200, resource: () => 30, resourceMax: () => 100, combo: () => 4 };
    expect(conditionsHold([{ kind: 'targetHp', op: '<', value: 30 }], ctx)).toBe(true); // 25 %
    expect(conditionsHold([{ kind: 'remaining', op: '>=', value: 60 }], ctx)).toBe(false);
    expect(conditionsHold([{ kind: 'resourcePct', op: '<', value: 50 }, { kind: 'combo', op: '>=', value: 4 }], ctx)).toBe(true);
  });

  it('passe à l’étape suivante quand une étape renonce', () => {
    const pick = makePriority(
      ['a', 'b'],
      { a: { when: () => true, run: () => undefined }, b: { when: () => true, run: () => 'b' } },
      undefined,
      { time: () => 0, fightLength: 10, resource: () => 0, resourceMax: () => 1 },
    );
    expect(pick()).toBe('b');
  });

  it('chaque spécialisation simule avec sa rotation inversée', () => {
    for (const c of CLASSES)
      for (const s of c.specs) {
        const steps = rotationSteps(c.id, s.id);
        const reversed = [...steps].reverse().map((id) => ({ id, enabled: true, conditions: [] }));
        const res = simulateAny(buildConfig(stateFor(c.id, s.id, reversed)));
        expect(res.dps, `${c.id}:${s.id}`).toBeGreaterThan(0);
      }
  });

  it('une étape désactivée n’est plus lancée', () => {
    const casts = (p?: PriorityList) => simulateAny(buildConfig(stateFor('warlock', 'affliction', p))).breakdown.find((b) => b.id === 'corruption')?.casts ?? 0;
    expect(casts()).toBeGreaterThan(0);
    expect(casts([{ id: 'corruption', enabled: false, conditions: [] }])).toBe(0);
  });

  it('une condition de vie limite une étape à la fin du combat', () => {
    const run = (p?: PriorityList) => simulateAny(buildConfig(stateFor('priest', 'shadow', p))).breakdown.find((b) => b.id === 'mindBlast')?.casts ?? 0;
    const all = run();
    const late = run([{ id: 'mindBlast', enabled: true, conditions: [{ kind: 'targetHp', op: '<', value: 20 }] }]);
    expect(late).toBeGreaterThan(0);
    expect(late).toBeLessThan(all * 0.35);
  });

  it('un temps fort peut être désactivé ou gardé pour la fin du combat', () => {
    const gate = makeCooldownGate(['a', 'b'], [{ id: 'a', enabled: false, conditions: [] }, { id: 'b', enabled: true, conditions: [{ kind: 'elapsed', op: '>=', value: 60 }] }], {
      time: () => 30, fightLength: 180, resource: () => 0, resourceMax: () => 1,
    });
    expect([gate('a'), gate('b'), gate('autre')]).toEqual([false, false, true]);

    const run = (cd?: PriorityList) => simulateAny(buildConfig(stateFor('rogue', 'combat', undefined, cd)));
    const casts = (r: ReturnType<typeof run>) => r.breakdown.find((b) => b.id === 'adrenalineRush')?.casts ?? 0;
    const base = run();
    expect(casts(base)).toBeGreaterThan(0);
    expect(casts(run([{ id: 'adrenalineRush', enabled: false, conditions: [] }]))).toBe(0);
    // Gardée jusqu'à 10 % de vie, elle est quand même lancée (une fois, en fin de combat), et le résultat change.
    const late = run([{ id: 'adrenalineRush', enabled: true, conditions: [{ kind: 'targetHp', op: '<', value: 10 }] }]);
    expect(casts(late)).toBe(1);
    expect(late.dps).not.toBe(base.dps);
  });
});
