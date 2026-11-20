import { describe, expect, it } from 'vitest';
import { canUse } from './upgrades';

const row = (type: string, sub: string) => ({ inventory_type: { type }, item_subclass: { name: { en_US: sub } } });

describe('recherche d’améliorations : objets autorisés', () => {
  it('armure selon la classe', () => {
    expect(canUse('mage', 'head', row('HEAD', 'Cloth'))).toBe(true);
    expect(canUse('mage', 'head', row('HEAD', 'Plate'))).toBe(false);
    expect(canUse('warrior', 'head', row('HEAD', 'Plate'))).toBe(true);
    expect(canUse('rogue', 'chest', row('ROBE', 'Leather'))).toBe(true);
    expect(canUse('priest', 'back', row('CLOAK', 'Cloth'))).toBe(true);
    expect(canUse('druid', 'finger1', row('FINGER', 'Miscellaneous'))).toBe(true);
    expect(canUse('druid', 'head', row('CHEST', 'Leather'))).toBe(false);
  });
  it('armes selon la classe et la main', () => {
    expect(canUse('rogue', 'mainHand', row('WEAPON', 'Dagger'))).toBe(true);
    expect(canUse('rogue', 'mainHand', row('TWOHWEAPON', 'Sword'))).toBe(false);
    expect(canUse('rogue', 'offHand', row('WEAPON', 'Sword'))).toBe(true);
    expect(canUse('mage', 'offHand', row('WEAPON', 'Dagger'))).toBe(false);
    expect(canUse('mage', 'offHand', row('HOLDABLE', 'Miscellaneous'))).toBe(true);
    expect(canUse('mage', 'mainHand', row('TWOHWEAPON', 'Staff'))).toBe(true);
    expect(canUse('priest', 'mainHand', row('WEAPON', 'Sword'))).toBe(false);
    expect(canUse('warrior', 'offHand', row('SHIELD', 'Shield'))).toBe(true);
    expect(canUse('mage', 'offHand', row('SHIELD', 'Shield'))).toBe(false);
    expect(canUse('hunter', 'ranged', row('RANGED', 'Bow'))).toBe(true);
    expect(canUse('warlock', 'ranged', row('RANGEDRIGHT', 'Wand'))).toBe(true);
    expect(canUse('warlock', 'ranged', row('RANGED', 'Bow'))).toBe(false);
    expect(canUse('warrior', 'mainHand', row('WEAPONOFFHAND', 'Fist Weapon'))).toBe(false);
  });
});
