import { describe, expect, it } from 'vitest';
import { parseEnchantText } from '../data/buffs';
import { characterSlug, matchEnchant, talentKey, type ImportedCharacter } from '../data/character';
import { applyCharacter } from '../state/importCharacter';
import { DEFAULT_STATE, computeGear } from '../state/store';

describe('import de personnage', () => {
  it('construit le slug Forever (nom-surnom, sans royaume)', () => {
    expect(characterSlug('Judgement Judy')).toBe('judgement-judy');
    expect(characterSlug(' myscelia-calamis ')).toBe('myscelia-calamis');
    expect(characterSlug('https://worldofwarcraft.blizzard.com/fr-fr/character/forever/eu/Myscelia-Calamis')).toBe('myscelia-calamis');
  });

  it('retrouve les clés de talents à partir des noms anglais', () => {
    expect(talentKey('Improved Shadow Bolt')).toBe('improvedShadowBolt');
    expect(talentKey('Fire and Brimstone')).toBe('fireAndBrimstone');
    expect(talentKey('Bane of Havoc')).toBe('baneOfHavoc');
  });

  it('lit les stats des enchantements', () => {
    expect(parseEnchantText('Enchanted: Stamina +3 and Armor +24')).toEqual({ stamina: 3 });
    expect(parseEnchantText('+8 Spell Damage and Healing')).toEqual({ spellPower: 8 });
    expect(parseEnchantText('Enchanted: +4 All Stats')).toEqual({ intellect: 4, spirit: 4, stamina: 4 });
    expect(parseEnchantText('Fire Damage +20')).toEqual({ firePower: 20 });
  });

  it('reconnaît un enchantement du catalogue, sinon garde ses stats', () => {
    expect(matchEnchant({ display_string: { en_US: 'Enchanted: +8 Spell Damage and Healing' }, source_item: { id: 18330 } }, 'head')).toBe('arcanumFocus');
    expect(matchEnchant({ display_string: { en_US: 'Enchanted: Intellect +7' } }, 'wrist')).toBe('wristInt');
    expect(matchEnchant({ display_string: { en_US: 'Enchanted: Stamina +3 and Armor +24', fr_FR: 'Enchanté : Endurance +3 et Armure +24' } }, 'legs')).toEqual({
      name: { en: 'Stamina +3 and Armor +24', fr: 'Endurance +3 et Armure +24' },
      stats: { stamina: 3 },
    });
    expect(matchEnchant({ display_string: { en_US: 'Enchanted: Armor +24' } }, 'chest')).toBeNull();
  });

  it('applique le personnage : objets, enchantements, talents, sauvegarde', () => {
    const stats = { ...DEFAULT_STATE.extraStats, spellPower: 10, critPct: 0, hitPct: 0, intellect: 5, spirit: 0, stamina: 0, mp5: 0, shadowPower: 0, firePower: 0 };
    const char: ImportedCharacter = {
      slug: 'a-b', name: 'A B', level: 60, className: { en: 'Warlock', fr: 'Démoniste' }, sameClass: true,
      items: [
        { slot: 'head', id: 1, name: { en: 'Hood', fr: 'Capuche' }, icon: 'x', quality: 3, itemLevel: 60, stats, set: null, weapon: null, enchant: 'arcanumFocus' },
        { slot: 'finger2', id: 2, name: { en: 'Ring', fr: 'Anneau' }, icon: 'y', quality: 2, itemLevel: 55, stats, set: null, weapon: null, enchant: null },
      ],
      talents: { suppression: 5, improvedCorruption: 5 },
      unknownTalents: [],
    };
    const { patch, talentsApplied } = applyCharacter(DEFAULT_STATE, char, 'Avant');
    expect(talentsApplied).toBe(true);
    expect(patch.equipped).toEqual({ head: 'wh-1', finger2: 'wh-2' });
    expect(patch.items?.find((i) => i.id === 'wh-2')?.slot).toBe('finger');
    expect(patch.profiles?.[0].name).toBe('Avant');
    const g = computeGear({ ...DEFAULT_STATE, ...patch });
    expect(g.stats.spellPower).toBe(10 + 10 + 8); // deux objets + Arcanum, bonus divers remis à zéro

    // Un autre personnage que démoniste : équipement seul, talents conservés.
    const other = applyCharacter(DEFAULT_STATE, { ...char, sameClass: false, talents: {} }, 'Avant');
    expect(other.talentsApplied).toBe(false);
    expect(other.patch.talents).toBeUndefined();
  });
});

describe('objets à enchantement aléatoire', () => {
  it('repère « <Random enchantment> » et ignore les résistances', async () => {
    const { parseItemTooltip } = await import('../data/wowhead');
    const base = parseItemTooltip('<table><tr><td>Waist</td></tr></table><span><!--amr-->22 Armor</span><br><span class="q2">&lt;Random enchantment&gt;</span>');
    expect(base.randomEnchant).toBe(true);
    const resist = parseItemTooltip('<span class="q1">+<!--stat6-->7 Arcane Resistance<br />+<!--stat5-->4 Intellect<br />+<!--stat38-->14 Attack Power</span>');
    expect(resist.randomEnchant).toBe(false);
    expect(resist.stats.spirit).toBe(0);
    expect(resist.stats.intellect).toBe(4);
    expect(resist.stats.attackPower).toBe(14);
  });

  it('calcule les valeurs d’un suffixe', async () => {
    const { RANDOM_SUFFIXES, suffixStats } = await import('../data/randomSuffix');
    const scale = { pair: 5, single: 7 };
    expect(suffixStats(RANDOM_SUFFIXES.find((s) => s.key === 'owl')!, scale)).toEqual({ intellect: 5, spirit: 5 });
    expect(suffixStats(RANDOM_SUFFIXES.find((s) => s.key === 'intellect')!, scale)).toEqual({ intellect: 7 });
    expect(suffixStats(RANDOM_SUFFIXES.find((s) => s.key === 'shadowWrath')!, scale).shadowPower).toBe(5);
  });
});
