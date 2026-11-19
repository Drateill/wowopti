import type { Stats } from './types';

/**
 * Ajoute aux stats les effets « Équipé : » (texte anglais), communs à Wowhead, à l'API Blizzard
 * et aux bonus d'ensemble. Dans Forever, toucher et critique s'appliquent aux sorts comme aux attaques.
 */
export function addEquipEffects(text: string, stats: Stats): Stats {
  const num = (re: RegExp) => {
    let total = 0;
    for (const m of text.matchAll(re)) total += parseFloat(m[1]);
    return total;
  };
  stats.hitPct += num(/Improves your chance to hit(?: with spells)? by ([\d.]+)%/g);
  stats.critPct += num(/Improves your chance to (?:get|land) a critical strike(?: with spells)? by ([\d.]+)%/g);
  stats.spellPower += num(/Increases damage (?:and healing )?done by magical spells and effects by up to ([\d.]+)/g);
  stats.shadowPower += num(/Increases damage done by Shadow spells and effects by up to ([\d.]+)/g);
  stats.firePower += num(/Increases damage done by Fire spells and effects by up to ([\d.]+)/g);
  stats.mp5 += num(/Restores ([\d.]+) mana per 5 sec/g);
  stats.attackPower += num(/Increases (?:melee )?attack power by ([\d.]+)/gi) + num(/\+([\d.]+) Attack Power/g);
  stats.defense += num(/Increased Defense \+([\d.]+)/g);
  stats.blockPct += num(/Increases your chance to block attacks with a shield by ([\d.]+)/gi);
  stats.blockValue += num(/Increases the block value of your shield by ([\d.]+)/gi) + num(/\+([\d.]+) Block Value/g);
  stats.dodgePct += num(/Increases your chance to dodge an attack by ([\d.]+)/gi);
  stats.parryPct += num(/Increases your chance to parry an attack by ([\d.]+)/gi);
  // Objets de soin : « soins jusqu'à 23 et dégâts jusqu'à 8 ». La part dégâts compte aussi pour les soins.
  for (const m of text.matchAll(/Increases healing done by (?:magical )?spells and effects by up to ([\d.]+)(?:,? and damage done by up to ([\d.]+))?/gi)) {
    const heal = parseFloat(m[1]);
    const dmg = m[2] ? parseFloat(m[2]) : 0;
    stats.spellPower += dmg;
    stats.healingPower += heal - dmg;
  }
  for (const m of text.matchAll(/Increases healing done by up to ([\d.]+) and damage done by up to ([\d.]+)/gi)) {
    stats.spellPower += parseFloat(m[2]);
    stats.healingPower += parseFloat(m[1]) - parseFloat(m[2]);
  }
  return stats;
}

/** Arme dans une infobulle (« 52 - 98 Damage … Speed 3.50 »), en texte brut. */
export function parseWeaponText(text: string): { min: number; max: number; speed: number } | null {
  const dmg = /(\d+)\s*-\s*(\d+)\s+Damage/.exec(text);
  const speed = /Speed\s+([\d.]+)/.exec(text);
  return dmg && speed ? { min: Number(dmg[1]), max: Number(dmg[2]), speed: Number(speed[1]) } : null;
}
