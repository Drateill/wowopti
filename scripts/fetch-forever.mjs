// Télécharge les données de WoW Forever depuis Wowhead (talents, sorts, icônes, noms FR/EN)
// et écrit src/data/generated/<classe>.json. Usage : npm run fetch-data
// Données Wowhead : à usage personnel, vérifier leurs conditions avant toute diffusion publique.
import { writeFileSync, mkdirSync } from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (theorycraft local tool)' };
const LOCALES = { en: { path: '', id: 0 }, fr: { path: '/fr', id: 2 } };
// Pour chaque classe : arbres (identifiant Wowhead, compétence du jeu) et sorts au rang maximum utilisés par le simulateur.
const CLASSES = {
  warlock: {
    trees: [
      { wid: 302, key: 'curses', skill: 355 },
      { wid: 303, key: 'summoning', skill: 354 },
      { wid: 301, key: 'destruction', skill: 593 },
    ],
    spells: {
      shadowBolt: 25307, searingPain: 17923, immolate: 25309, conflagrate: 18932, incinerate: 1293813,
      shadowburn: 18871, soulFire: 17924, corruption: 25311, baneOfAgony: 11713, baneOfDoom: 603,
      siphonLife: 18881, lifeTap: 11689, wrack: 1316697,
    },
  },
  paladin: {
    trees: [
      { wid: 382, key: 'holy', skill: 594 },
      { wid: 383, key: 'protection', skill: 267 },
      { wid: 381, key: 'retribution', skill: 184 },
    ],
    spells: {
      melee: 6603, holyStrike: 10333, judgement: 20271, sealOfCommand: 20920, sealOfTheCrusader: 20308,
      sealOfRighteousness: 20293, sealOfFury: 20423, consecration: 20924, exorcism: 10314, hammerOfWrath: 24239,
      holyLight: 25292, flashOfLight: 19943, holyShock: 20930, lightsVigil: 1311595, holyShield: 1239570,
      righteousFury: 25780, divineFavor: 20216, reckoning: 20178,
    },
  },
  druid: {
    trees: [
      { wid: 283, key: 'balance', skill: 574 },
      { wid: 281, key: 'feral', skill: 134 },
      { wid: 282, key: 'restoration', skill: 573 },
    ],
    spells: {
      melee: 6603, wrath: 9912, starfire: 25298, moonfire: 9835, insectSwarm: 24977, hurricane: 17402,
      healingTouch: 25297, regrowth: 9858, rejuvenation: 25299, wildGrowth: 1238215, tranquility: 9863, innervate: 29166,
      claw: 9850, shred: 9830, rake: 9904, rip: 9896, ferociousBite: 31018, maul: 9881, swipe: 9908, lacerate: 1235827,
      primalBite: 1238070, catForm: 768, direBearForm: 9634, omenOfClarity: 16864, faerieFire: 9907,
    },
  },
  mage: {
    trees: [
      { wid: 81, key: 'arcane', skill: 237 },
      { wid: 41, key: 'fire', skill: 8 },
      { wid: 61, key: 'frost', skill: 6 },
    ],
    spells: {
      frostbolt: 25304, iceLance: 1240047, iceBarrier: 13033, fireBlast: 10199, fireball: 10151, frostfireBolt: 1237313,
      pyroblast: 18809, scorch: 10207, arcaneMissiles: 10212, arcaneWrath: 1326082, arcaneBlast: 1239700, combustion: 11129,
      arcanePower: 12042, presenceOfMind: 12043, evocation: 12051, mageArmor: 22783, coldSnap: 12472,
    },
  },
  hunter: {
    trees: [
      { wid: 361, key: 'beastMastery', skill: 50 },
      { wid: 363, key: 'marksmanship', skill: 163 },
      { wid: 362, key: 'survival', skill: 51 },
    ],
    spells: {
      autoShot: 75, aimedShot: 20904, multiShot: 2643, arcaneShot: 14287, serpentSting: 25295, huntersMark: 14325,
      rapidFire: 3045, raptorStrike: 14266, mongooseBite: 14271, bestialWrath: 19574, aspectOfTheHawk: 25296,
    },
  },
  priest: {
    trees: [
      { wid: 201, key: 'discipline', skill: 613 },
      { wid: 202, key: 'holy', skill: 56 },
      { wid: 203, key: 'shadow', skill: 78 },
    ],
    spells: {
      smite: 10934, holyFire: 15261, mindBlast: 10947, shadowWordPain: 10894, mindFlay: 18807, devouringPlague: 19280,
      vampiricEmbrace: 15286, shadowform: 15473, greaterHeal: 25314, heal: 6064, flashHeal: 10917, renew: 25315,
      prayerOfHealing: 25316, powerWordShield: 10901, innerFire: 10952, powerInfusion: 10060, innerFocus: 14751,
      holyNova: 15431, penance: 1316995, prayerOfMending: 1240827, shadowWordDeath: 1309636,
    },
  },
  rogue: {
    trees: [
      { wid: 182, key: 'assassination', skill: 253 },
      { wid: 181, key: 'combat', skill: 38 },
      { wid: 183, key: 'subtlety', skill: 39 },
    ],
    spells: {
      melee: 6603, sinisterStrike: 11294, backstab: 25300, eviscerate: 31016, sliceAndDice: 6774, rupture: 11275,
      ambush: 11269, garrote: 11290, bladeFlurry: 13877, adrenalineRush: 13750, coldBlood: 14177, exposeArmor: 11198,
      instantPoison: 11338, deadlyPoison: 25349,
    },
  },
  warrior: {
    trees: [
      { wid: 161, key: 'arms', skill: 26 },
      { wid: 164, key: 'fury', skill: 256 },
      { wid: 163, key: 'protection', skill: 257 },
    ],
    spells: {
      melee: 6603, heroicStrike: 25286, mortalStrike: 21553, bloodthirst: 23894, whirlwind: 1680, execute: 20662, slam: 11605,
      overpower: 11585, cleave: 20569, battleShout: 25289, revenge: 25288, shieldSlam: 23925, sunderArmor: 11597, rend: 11574,
      deathWish: 12328, recklessness: 1719, sweepingStrikes: 12292, bloodrage: 2687, shieldBlock: 2565,
    },
  },
  shaman: {
    trees: [
      { wid: 261, key: 'elemental', skill: 375 },
      { wid: 263, key: 'enhancement', skill: 373 },
      { wid: 262, key: 'restoration', skill: 374 },
    ],
    spells: {
      melee: 6603, lightningBolt: 15208, chainLightning: 10605, earthShock: 10414, flameShock: 29228, frostShock: 10473,
      stormstrike: 17364, windfuryWeapon: 16362, flametongueWeapon: 16342, rockbiterWeapon: 16316, healingWave: 25357,
      lesserHealingWave: 10468, chainHeal: 10623, lightningShield: 10432, manaSpringTotem: 10497, searingTotem: 10438,
      lightningMastery: 16166, naturesSwiftness: 16188, windfuryTotem: 10614, manaTideTotem: 17359,
    },
  },
};

const get = async (url) => {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};

/** Le fichier de talents est une suite d'appels WH.xxx(...) : on en extrait les objets JSON. */
function parseWhCalls(src) {
  return src.split(/\n(?=WH\.)/).flatMap((st) => {
    const m = /^WH\.([\w.]+)\((.*)\);?\s*$/s.exec(st.trim());
    if (!m) return [];
    const i = m[2].indexOf('{');
    return [{ fn: m[1], head: m[2].slice(0, i), body: JSON.parse(m[2].slice(i)) }];
  });
}

const clean = (html) =>
  html
    .replace(/<!--[^>]*-->/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

const camel = (s) =>
  s.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('');

async function fetchClass(cls, { trees: TREES, spells: SPELLS }) {
  const page = await get(`https://www.wowhead.com/forever/talent-calc/${cls}`);
  const m = page.match(/https:\/\/nether\.wowhead\.com\/forever\/data\/talents-classic\?[^"']+/);
  if (!m) throw new Error('URL des talents introuvable');
  const base = m[0].replace(/&amp;/g, '&');

  const data = {};
  for (const [loc, { path }] of Object.entries(LOCALES)) {
    const url = base.replace('/forever/data/', `/forever${path}/data/`);
    const calls = parseWhCalls(await get(url));
    data[loc] = {
      calc: calls.find((c) => c.fn === 'setPageData').body,
      skills: calls.find((c) => c.fn === 'Gatherer.addData' && c.head.startsWith('15'))?.body ?? {},
    };
  }

  const trees = TREES.map((t) => ({
    key: t.key,
    icon: data.en.skills[t.skill]?.icon ?? '',
    name: Object.fromEntries(Object.keys(LOCALES).map((l) => {
      const s = data[l].skills[t.skill] ?? {};
      return [l, s[`name_${l === 'en' ? 'enus' : 'frfr'}`] ?? s.name_enus ?? t.key];
    })),
  }));

  const talents = [];
  TREES.forEach((t, ti) => {
    const en = Object.values(data.en.calc.talents[t.wid]).sort((a, b) => a.row - b.row || a.col - b.col);
    const idToKey = new Map(en.map((x) => [x.id, camel(x.name)]));
    for (const x of en) {
      const fr = data.fr.calc.talents[t.wid][x.id];
      const descs = (o) => Array.from({ length: x.ranks.length }, (_, i) => clean(o.descriptions[i + 1] ?? ''));
      talents.push({
        key: camel(x.name),
        wowheadId: x.id,
        tree: ti,
        row: x.row,
        col: x.col,
        maxRank: x.ranks.length,
        spellIds: x.ranks,
        icon: x.icon,
        name: { en: x.name, fr: fr?.name ?? x.name },
        desc: { en: descs(x), fr: fr ? descs(fr) : descs(x) },
        requires: x.requires.map((r) => ({ key: idToKey.get(r.id), qty: r.qty })),
      });
    }
  });

  const spells = {};
  for (const [key, id] of Object.entries(SPELLS)) {
    const entry = { id, name: {}, tooltip: {}, icon: '' };
    for (const [loc, { id: lid }] of Object.entries(LOCALES)) {
      const j = JSON.parse(await get(`https://nether.wowhead.com/forever/tooltip/spell/${id}?locale=${lid}`));
      entry.name[loc] = j.name;
      entry.tooltip[loc] = clean(j.tooltip);
      entry.icon = j.icon;
    }
    spells[key] = entry;
  }

  mkdirSync('src/data/generated', { recursive: true });
  writeFileSync(
    `src/data/generated/${cls}.json`,
    JSON.stringify({ source: 'wowhead.com/forever', fetchedAt: new Date().toISOString(), trees, talents, spells }, null, 1),
  );
  console.log(`${cls} : ${trees.length} arbres, ${talents.length} talents, ${Object.keys(spells).length} sorts`);
}

async function main() {
  const only = process.argv[2];
  for (const [cls, conf] of Object.entries(CLASSES)) if (!only || only === cls) await fetchClass(cls, conf);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
