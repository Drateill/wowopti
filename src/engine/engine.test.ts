import { describe, expect, it } from 'vitest';
import { WARLOCK } from '../data/classes';
import { talentValue } from '../data/warlock/talents';
import { parseItemTooltip, parseItemRef } from '../data/wowhead';
import { DEFAULT_STATE, buildConfig } from '../state/store';
import { canIncrease, decodeTalents, encodeTalents, isValid } from './talents';
import { simulateAny as simulate, statWeightsAny as statWeights } from './sim';
import { effectivePet, talentEffects } from './warlockSim';

const cfg = (over = {}) => buildConfig(DEFAULT_STATE, { iterations: 300, ...over });
/** Rotation classique Trait de l'ombre (sans Calvaire), pour les tests écrits avant les spécialisations. */
const boltRotation = { ...DEFAULT_STATE.rotation, wrack: false };

describe('données Forever', () => {
  it('a 3 arbres et des talents placés sur une grille 4 × 7', () => {
    expect(WARLOCK.trees).toHaveLength(3);
    for (const t of WARLOCK.talents) {
      expect(t.col).toBeGreaterThanOrEqual(0);
      expect(t.col).toBeLessThan(4);
      expect(t.row).toBeLessThan(7);
      expect(t.icon).not.toBe('');
      expect(t.name.fr).not.toBe('');
    }
  });

  it('lit les valeurs dans les descriptions des talents', () => {
    expect(talentValue('ruin', 5, /by (\d+)%/)).toBe(100);
    expect(talentValue('suppression', 5, /hit by (\d+)%/)).toBe(5);
    expect(talentValue('cataclysm', 3, /by (\d+)%/)).toBe(10);
    const fx = talentEffects({ demonicSacrifice: 1, masterDemonologist: 5, improvedCorruption: 5 });
    expect(fx.sacrificeImpShadowPct).toBe(15);
    expect(fx.sacrificeSuccubusFirePct).toBe(15);
    expect(fx.masterDemoImpFirePct).toBe(10);
    expect(fx.corruptionCastCut).toBe(2);
    expect(fx.corruptionDmgPct).toBe(10);
  });
});

describe('talents', () => {
  it('le build par défaut est valide et fait 51 points', () => {
    expect(isValid(DEFAULT_STATE.talents, WARLOCK.talents)).toBe(true);
    expect(Object.values(DEFAULT_STATE.talents).reduce((a, b) => a + b, 0)).toBe(51);
  });

  it('bloque une rangée tant que 5 points par rangée ne sont pas dépensés', () => {
    const ruin = WARLOCK.talents.find((t) => t.key === 'ruin')!;
    expect(canIncrease({}, WARLOCK.talents, ruin)).toBe(false);
  });

  it('respecte les prérequis (Calvaire demande Siphon de vie)', () => {
    const wrack = WARLOCK.talents.find((t) => t.key === 'wrack')!;
    const pts = { ...DEFAULT_STATE.talents };
    delete pts.siphonLife;
    expect(isValid({ ...pts, wrack: 1 }, WARLOCK.talents)).toBe(false);
    expect(canIncrease({ ...pts }, WARLOCK.talents, wrack)).toBe(false);
  });

  it('encode puis décode le même build', () => {
    const code = encodeTalents(DEFAULT_STATE.talents, WARLOCK.talents, 3);
    expect(decodeTalents(code, WARLOCK.talents, 3)).toEqual(DEFAULT_STATE.talents);
  });
});

describe('simulation', () => {
  it('est déterministe avec la même graine', () => {
    expect(simulate(cfg()).dps).toBe(simulate(cfg()).dps);
  });

  it('donne un DPS positif et un Trait de l’ombre souvent lancé', () => {
    const r = simulate(cfg({ rotation: boltRotation }));
    expect(r.dps).toBeGreaterThan(100);
    expect(r.breakdown.find((b) => b.id === 'shadowBolt')!.casts).toBeGreaterThan(15);
  });

  it('plus de puissance des sorts = plus de DPS', () => {
    const base = cfg();
    const more = cfg({ gear: { ...base.gear, spellPower: base.gear.spellPower + 200 } });
    expect(simulate(more).dps).toBeGreaterThan(simulate(base).dps);
  });

  it('le sacrifice du diablotin augmente les dégâts d’ombre (Forever)', () => {
    const talents = { ...DEFAULT_STATE.talents, demonicSacrifice: 1 };
    const noPet = { ...DEFAULT_STATE.rotation, petAttacks: false }; // on compare les seuls dégâts d'ombre
    const none = simulate(cfg({ talents, rotation: noPet, buffs: { ...DEFAULT_STATE.buffs, sacrificed: 'none' } }));
    const imp = simulate(cfg({ talents, rotation: noPet, buffs: { ...DEFAULT_STATE.buffs, sacrificed: 'imp' } }));
    expect(imp.dps).toBeGreaterThan(none.dps * 1.05);
  });

  it('sans Pacte démoniaque, le sacrifice retire le démon actif', () => {
    expect(effectivePet({ shadowDamagePct: 0, fireDamagePct: 0, sacrificed: 'imp', activePet: 'imp', raidIsbUptime: 0 }, { demonicSacrifice: 1 })).toBe('none');
    expect(effectivePet({ shadowDamagePct: 0, fireDamagePct: 0, sacrificed: 'imp', activePet: 'imp', raidIsbUptime: 0 }, { demonicSacrifice: 1, demonicPact: 1 })).toBe('imp');
  });

  it('Calvaire est lancé et fait des dégâts quand il est talenté', () => {
    const talents = DEFAULT_STATE.talents; // le build Affliction type prend Calvaire
    expect(isValid(talents, WARLOCK.talents)).toBe(true);
    const r = simulate(cfg({ talents, rotation: { ...DEFAULT_STATE.rotation, wrack: true } }));
    const wrack = r.breakdown.find((b) => b.id === 'wrack');
    expect(wrack?.casts).toBeGreaterThan(3);
    expect(wrack!.damage).toBeGreaterThan(0);
  });

  it('le toucher ne vaut plus rien une fois plafonné', () => {
    const base = cfg();
    const { weights } = statWeights({ ...base, gear: { ...base.gear, hitPct: 20 } });
    expect(weights.find((w) => w.key === 'hitPct')!.dpsGain).toBeCloseTo(0, 6);
  });

  it('les poids de stats sont dans un ordre cohérent', () => {
    const { weights } = statWeights(cfg({ iterations: 1000, rotation: boltRotation }));
    const w = Object.fromEntries(weights.map((x) => [x.key, x.ep]));
    expect(w.spellPower).toBe(1);
    expect(w.shadowPower).toBeGreaterThan(0.5);
    expect(w.critPct).toBeGreaterThan(3);
    expect(w.hitPct).toBeGreaterThan(3);
  });
});

describe('objets Wowhead', () => {
  const html =
    '<table><tr><td><b class="q4">Felheart Robes</b><span class="q"><br>Item Level <!--ilvl-->30</span><table width="100%"><tr><td>Chest</td><th>Cloth</th></tr></table>' +
    '<span><!--stat7-->+15 Stamina</span><br><span><!--stat5-->+10 Intellect</span></td></tr></table><table><tr><td>' +
    '<span class="q2">Equip: Improves your chance to hit by 0.5%.</span><br><span class="q2">Equip: Increases damage and healing done by magical spells and effects by up to <span><!--rtg41-->6</span>.</span>' +
    '<a href="/forever/item-set=2139/felheart-raiment">Felheart Raiment</a> (8) Set: Improves your chance to hit by 1%.';

  it('lit l’emplacement et les stats, sans les bonus de set', () => {
    const r = parseItemTooltip(html);
    expect(r.slot).toBe('chest');
    expect(r.itemLevel).toBe(30);
    expect(r.stats.stamina).toBe(15);
    expect(r.stats.intellect).toBe(10);
    expect(r.stats.hitPct).toBe(0.5);
    expect(r.stats.spellPower).toBe(6);
  });

  it('accepte un lien Wowhead ou un numéro', () => {
    expect(parseItemRef('https://www.wowhead.com/forever/item=288837/felheart-robes')).toBe(288837);
    expect(parseItemRef(' 288837 ')).toBe(288837);
    expect(parseItemRef('robe')).toBeNull();
  });
});

describe('objets API Blizzard', () => {
  it('convertit une vraie fiche Forever (Fel Cape) : scores → %, dégâts d’ombre', async () => {
    const { parseBlizzardItem } = await import('../data/blizzard');
    const r = parseBlizzardItem({
      id: 279269,
      name: { en_US: 'Fel Cape', fr_FR: 'Cape gangrenée' },
      quality: { type: 'RARE' },
      level: 65,
      inventory_type: { type: 'CLOAK' },
      media: { id: 279269 },
      preview_item: {
        stats: [
          { type: { type: 'STAMINA' }, value: 16 },
          { type: { type: 'CRIT_RATING' }, value: 14 },
          { type: { type: 'BONUS_STAT_SHADOW_DAMAGE_DONE' }, value: 15 },
          { type: { type: 'SPELL_HEALING_DONE' }, value: 30 },
          { value: 4 }, // « +4 à toutes les résistances » : pas de type
        ],
      },
    });
    expect(r.name).toEqual({ en: 'Fel Cape', fr: 'Cape gangrenée' });
    expect(r.slot).toBe('back');
    expect(r.quality).toBe(3);
    expect(r.stats.stamina).toBe(16);
    expect(r.stats.critPct).toBeCloseTo(1, 6);
    expect(r.stats.shadowPower).toBe(15);
    expect(r.stats.spellPower).toBe(0);
  });

  it('10 points de toucher = 1 %', async () => {
    const { parseBlizzardItem } = await import('../data/blizzard');
    const r = parseBlizzardItem({ id: 1, name: 'x', preview_item: { stats: [{ type: { type: 'HIT_RATING' }, value: 10 }] } });
    expect(r.stats.hitPct).toBeCloseTo(1, 6);
  });
});

describe('recherche d’objets (API Blizzard)', () => {
  it('cherche en français et en anglais, garde les objets équipables, sans doublon', async () => {
    const { vi } = await import('vitest');
    const { searchItemsBlizzard } = await import('../data/blizzard');
    const cape = { id: 279269, level: 65, name: { en_US: 'Fel Cape', fr_FR: 'Pèlerine gangrenée' }, quality: { type: 'EPIC' }, inventory_type: { type: 'CLOAK' }, item_subclass: { name: { en_US: 'Cloth', fr_FR: 'Tissu' } }, media: { id: 1 } };
    const sergeant = { id: 16342, level: 63, name: { en_US: "Sergeant's Cape", fr_FR: 'Pèlerine de sergent' }, quality: { type: 'RARE' }, inventory_type: { type: 'CLOAK' }, item_subclass: { name: { en_US: 'Cloth', fr_FR: 'Tissu' } }, media: { id: 2 } };
    const pattern = { id: 279318, level: 1, name: { en_US: 'Pattern: Fel Cape', fr_FR: 'Patron : pèlerine gangrenée' }, quality: { type: 'EPIC' }, inventory_type: { type: 'NON_EQUIP' } };
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url);
        const body = url.includes('/media/')
          ? { assets: [{ key: 'icon', value: 'https://render.example/icon.jpg' }] }
          : { results: (url.includes('fr_FR') ? [sergeant, cape, pattern] : [cape]).map((data) => ({ data })) };
        return { ok: true, status: 200, json: async () => body };
      }),
    );
    const list = await searchItemsBlizzard('pèlerine gangrenée', 'fr', 1);
    vi.unstubAllGlobals();
    expect(list.map((s) => s.id)).toEqual([279269, 16342]); // nom complet d'abord, pas de recette, pas de doublon
    expect(list[0]).toMatchObject({ name: 'Pèlerine gangrenée', itemLevel: 65, inventoryType: 'CLOAK', subclass: 'Cloth', category: 'Tissu', quality: 4 });
    expect(list[0].icon).toBe('https://render.example/icon.jpg');
    expect(list[1].icon).toBe(''); // icônes demandées pour le premier résultat seulement
    expect(calls.every((u) => u.startsWith('/blizzard/'))).toBe(true);
  });
});
