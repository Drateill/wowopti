import { describe, expect, it } from 'vitest';
import { parseSetBonus, parseSetFromTooltip } from '../data/setBonus';
import { classifyResult } from '../data/wowhead';
import { DEFAULT_STATE, buildConfig, computeGear, migrate, type AppState, type Item } from '../state/store';
import { simulateAny as simulate } from './sim';
import { talentEffects } from './warlockSim';

const felheart = {
  id: 2139,
  name: { en: 'Felheart Raiment', fr: 'Grande tenue de Gangrecoeur' },
  bonuses: [
    { count: 3, text: { en: 'Health or Mana gained from Drain Life and Drain Mana increased by 15%.', fr: '' } },
    { count: 8, text: { en: 'Mana cost of Shadow spells reduced by 15%.', fr: '' } },
  ],
};
const piece = (n: number, slot: string): Item => ({
  id: `wh-${n}`, wowheadId: n, name: { en: `P${n}`, fr: `P${n}` }, slot, set: felheart,
  stats: { ...DEFAULT_STATE.extraStats, spellPower: 5, critPct: 0, hitPct: 0, intellect: 0, spirit: 0, stamina: 0, mp5: 0, shadowPower: 0, firePower: 0 },
});
const SLOTS8 = ['head', 'shoulders', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet'] as const;

describe('bonus d’ensemble', () => {
  it('comprend les effets des sets de démoniste', () => {
    expect(parseSetBonus('Mana cost of Shadow spells reduced by 15%.').mods.costPct['school:shadow']).toBe(15);
    expect(parseSetBonus('Increases damage caused by your Corruption by 12%.').mods.dmgMult.corruption).toBeCloseTo(1.12);
    expect(parseSetBonus('5% increased damage on your Immolate spell.').mods.dmgMult.immolate).toBeCloseTo(1.05);
    expect(parseSetBonus('Reduces the mana cost of Shadow Bolt by 15%.').mods.costPct.shadowBolt).toBe(15);
    expect(parseSetBonus('Increases damage and healing done by magical spells and effects by up to 23.').stats.spellPower).toBe(23);
    expect(parseSetBonus('Improves your chance to get a critical strike with spells by 2.0%.').stats.critPct).toBe(2);
    expect(parseSetBonus('Your pet gains 15 stamina and 100 spell resistance.').simulated).toBe(false);
  });

  it('lit l’ensemble dans une infobulle Wowhead', () => {
    const html =
      '<span class="q"><a href="/forever/item-set=2139/felheart-raiment" class="q">Felheart Raiment</a> (0/8)</span>' +
      '<span>(3) Set : <a href="/forever/spell=1">Bonus three.</a></span><br /><span>(8) Set : <a href="/x">Mana cost of Shadow spells reduced by 15%.</a></span>';
    expect(parseSetFromTooltip(html)).toEqual({
      id: 2139,
      name: 'Felheart Raiment',
      bonuses: [
        { count: 3, text: 'Bonus three.' },
        { count: 8, text: 'Mana cost of Shadow spells reduced by 15%.' },
      ],
    });
  });

  it('n’active le bonus qu’avec assez de pièces portées', () => {
    const items = SLOTS8.map((s, i) => piece(i + 1, s));
    const wear = (n: number): AppState => ({
      ...DEFAULT_STATE,
      items,
      equipped: Object.fromEntries(SLOTS8.slice(0, n).map((s, i) => [s, items[i].id])),
    });
    expect(computeGear(wear(7)).mods.costPct['school:shadow']).toBeUndefined();
    const full = computeGear(wear(8));
    expect(full.mods.costPct['school:shadow']).toBe(15);
    expect(full.sets[0].pieces).toBe(8);
    // Le coût réduit fait gagner du mana : moins de Connexions.
    const before = simulate(buildConfig(wear(7), { iterations: 200 }));
    const after = simulate(buildConfig(wear(8), { iterations: 200 }));
    expect(after.lifeTaps).toBeLessThan(before.lifeTaps);
  });
});

describe('buffs et consommables', () => {
  it('un seul flacon compte, les stats s’ajoutent, Rois multiplie', () => {
    const g = computeGear({ ...DEFAULT_STATE, consumables: ['flaskSupreme', 'arcaneIntellect', 'kings'] });
    expect(g.stats.spellPower).toBe(DEFAULT_STATE.extraStats.spellPower + 150);
    expect(g.stats.intellect).toBe(DEFAULT_STATE.extraStats.intellect + 31);
    expect(g.mods.statMult).toBeCloseTo(1.1);
  });

  it('Malédiction des éléments augmente les dégâts d’environ 10 %', () => {
    const rotation = { ...DEFAULT_STATE.rotation, petAttacks: false };
    const base = simulate(buildConfig({ ...DEFAULT_STATE, rotation }, { iterations: 300 }));
    const coe = simulate(buildConfig({ ...DEFAULT_STATE, rotation, consumables: ['curseOfElements'] }, { iterations: 300 }));
    expect(coe.dps / base.dps).toBeGreaterThan(1.08);
    expect(coe.dps / base.dps).toBeLessThan(1.12);
  });

  it('le Trait de l’ombre amélioré d’un autre démoniste aide sans talent', () => {
    const talents = { suppression: 5, improvedCorruption: 5 };
    const base = simulate(buildConfig({ ...DEFAULT_STATE, talents }, { iterations: 300 }));
    const isb = simulate(buildConfig({ ...DEFAULT_STATE, talents, buffs: { ...DEFAULT_STATE.buffs, raidIsbUptime: 100 } }, { iterations: 300 }));
    expect(isb.dps).toBeGreaterThan(base.dps * 1.05);
  });
});

describe('démon et talents de Démonologie', () => {
  it('le diablotin attaque, et pas sans démon', () => {
    const withImp = simulate(buildConfig(DEFAULT_STATE, { iterations: 100 }));
    expect(withImp.breakdown.find((b) => b.id === 'impFirebolt')?.damage).toBeGreaterThan(0);
    const none = simulate(buildConfig({ ...DEFAULT_STATE, buffs: { ...DEFAULT_STATE.buffs, activePet: 'none' } }, { iterations: 100 }));
    expect(none.breakdown.find((b) => b.id === 'impFirebolt')).toBeUndefined();
  });

  it('lit les nouveaux talents simulés', () => {
    const fx = talentEffects({ soulLink: 1, amplifyCurse: 1, soulSiphon: 3, unholyPower: 5, improvedImp: 3 });
    expect(fx.soulLinkPct).toBe(3);
    expect(fx.amplifyPct).toBe(50);
    expect(fx.soulSiphonPer).toBeGreaterThan(0);
    expect(fx.unholyPowerPct).toBe(10);
    expect(fx.improvedImpPct).toBe(30);
  });
});

describe('recherche et migration', () => {
  it('reconnaît la provenance et les objets qu’un démoniste peut porter', () => {
    const a = classifyResult('This epic cloth armor of item level 62 goes in the "Chest" slot. Requires Mage. It is crafted.');
    expect(a.usable).toBe(false);
    expect(a.sources.has('crafted')).toBe(true);
    expect(a.itemLevel).toBe(62);
    expect(classifyResult('Ce bleue armures en tissu d\'objet de niveau 61 va dans l\'emplacement de "Torse". C\'est fabriqué.').usable).toBe(true);
    expect(classifyResult('Patron : Robe en étoffe lunaire Ce/cette patron de couture est utilisé…').usable).toBe(false);
    expect(classifyResult('Plate · item level 60').usable).toBe(false);
  });

  it('complète un état sauvegardé par la version précédente', () => {
    const old = { ...DEFAULT_STATE, version: 2, spells: DEFAULT_STATE.spells.filter((s) => s.id !== 'impFirebolt') } as unknown as Parameters<typeof migrate>[0];
    delete (old as { consumables?: unknown }).consumables;
    const m = migrate({ ...old, buffs: { shadowDamagePct: 0, fireDamagePct: 0, sacrificed: 'none', activePet: 'imp' } as AppState['buffs'] });
    expect(m.version).toBe(3);
    expect(m.consumables).toEqual([]);
    expect(m.buffs.raidIsbUptime).toBe(0);
    expect(m.spells.some((s) => s.id === 'impFirebolt')).toBe(true);
  });
});

describe('démoniste : spécialisations', () => {
  it('trois builds types valides à 51 points', async () => {
    const { WARLOCK } = await import('../data/classes');
    const { isValid, totalPoints } = await import('./talents');
    expect(WARLOCK.specs.map((s) => s.id)).toEqual(['affliction', 'demonology', 'destruction']);
    for (const s of WARLOCK.specs) {
      expect(totalPoints(s.defaultTalents), s.id).toBe(51);
      expect(isValid(s.defaultTalents, WARLOCK.talents), s.id).toBe(true);
    }
  });

  it('chaque spé simule avec sa rotation et ses démons', async () => {
    const { WARLOCK } = await import('../data/classes');
    const { warlockPreset } = await import('../state/store');
    const dps: Record<string, number> = {};
    for (const s of WARLOCK.specs) {
      const preset = warlockPreset(s.id, DEFAULT_STATE.rotation, DEFAULT_STATE.buffs);
      const r = simulate(buildConfig({ ...DEFAULT_STATE, spec: s.id, talents: s.defaultTalents, ...preset }, { iterations: 200 }));
      dps[s.id] = r.dps;
      if (s.id === 'destruction') expect(r.breakdown.find((b) => b.id === 'incinerate')!.casts).toBeGreaterThan(10);
      if (s.id === 'affliction') expect(r.breakdown.find((b) => b.id === 'wrack')!.casts).toBeGreaterThan(3);
    }
    for (const v of Object.values(dps)) expect(v).toBeGreaterThan(100);
  });

  it('un ancien état « dps » devient la spé de l’arbre principal', () => {
    const old = { ...DEFAULT_STATE, spec: 'dps', talents: { suppression: 5, improvedCorruption: 5, shadowMastery: 5, improvedShadowBolt: 5 } };
    expect(migrate(old as unknown as Parameters<typeof migrate>[0]).spec).toBe('affliction');
    const destro = { ...DEFAULT_STATE, spec: 'dps', talents: { improvedShadowBolt: 5, bane: 5, cataclysm: 3 } };
    expect(migrate(destro as unknown as Parameters<typeof migrate>[0]).spec).toBe('destruction');
  });
});
