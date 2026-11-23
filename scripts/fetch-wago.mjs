// Génère les sorts de chaque classe à partir des tables du client WoW Forever publiées par wago.tools
// (https://wago.tools, produit « wowf »). wago.tools autorise le téléchargement automatique des exports CSV
// (/db2/{table}/csv, voir https://wago.tools/robots.txt et /llms.txt). Les données appartiennent à Blizzard.
//
// Usage : npm run fetch-spells [-- --build 1.60.1.71037]
// Écrit src/data/generated/wago-spells.json : pour chaque classe, les sorts de dégâts au rang le plus haut
// apprenable au niveau 60 (dégâts directs, dégâts sur la durée, sorts canalisés et de zone).
//
// Limites :
// - les corrections envoyées par le serveur (hotfixes) ne sont pas dans les tables du client ;
// - certains sorts canalisés de Forever passent par un script serveur (Pluie de feu) : on retrouve leur sort
//   de dégâts par son nom et son niveau ;
// - les techniques d'arme (dégâts d'arme) ne sont pas encore prises en compte.
import { mkdirSync, writeFileSync } from 'node:fs';

const UA = { 'User-Agent': 'forever-theorycraft data script' };
const PLAYER_LEVEL = 60;
/**
 * Niveau utilisé pour la progression des dégâts par niveau (EffectRealPointsPerLevel). Les sorts déjà saisis
 * dans l'app (repris des infobulles) correspondent au niveau maximum du rang : on fait pareil pour rester
 * comparable. Dans le jeu, un personnage de niveau 60 aurait la valeur au niveau 60.
 */
const scaleLevel = (lv) => lv.max || PLAYER_LEVEL;

// Arbres de talents de chaque classe : compétence du jeu (SkillLine), dans l'ordre des arbres de l'app.
const CLASSES = {
  warlock: [355, 354, 593],
  paladin: [594, 267, 184],
  druid: [574, 134, 573],
  mage: [237, 8, 6],
  hunter: [50, 163, 51],
  priest: [613, 56, 78],
  rogue: [253, 38, 39],
  warrior: [26, 256, 257],
  shaman: [375, 373, 374],
};
const SCHOOLS = { 1: 'physical', 2: 'holy', 4: 'fire', 8: 'nature', 16: 'frost', 32: 'shadow', 64: 'arcane' };
/** École d'un sort ; pour un sort à plusieurs écoles, la plus « magique » d'entre elles. */
const schoolOf = (mask) => SCHOOLS[mask] ?? SCHOOLS[[32, 4, 16, 64, 8, 2, 1].find((b) => mask & b) ?? 1];

// Effets et auras utiles (numéros du client).
const E_SCHOOL_DAMAGE = 2;
const E_HEALTH_LEECH = 9;
const E_APPLY_AURA = 6;
const E_PERSISTENT_AREA = 27;
const A_PERIODIC_DAMAGE = 3;
const A_PERIODIC_TRIGGER = 23;
const A_PERIODIC_LEECH = 53;
const A_PERIODIC_DUMMY = 226;
/** Cibles de zone (autour du lanceur, de la cible ou d'un point au sol). */
const AREA_TARGETS = new Set([8, 15, 16, 20, 22, 24, 28, 30, 31, 53, 54, 56, 87, 104, 108, 110]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

async function table(name, build, locale) {
  const url = `https://wago.tools/db2/${name}/csv?build=${build}${locale ? `&locale=${locale}` : ''}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${name} : ${res.status}`);
  return parseCsv(await res.text());
}

async function latestBuild() {
  const res = await fetch('https://wago.tools/api/builds', { headers: UA });
  const all = await res.json();
  const v = all.wowf?.[0]?.version;
  if (!v) throw new Error('aucune version « wowf » sur wago.tools');
  return v;
}

const camel = (s) =>
  s
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join('');

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

async function main() {
  const arg = process.argv.indexOf('--build');
  const build = arg > 0 ? process.argv[arg + 1] : await latestBuild();
  console.log(`wago.tools, version ${build}`);
  const [names, namesFr, effects, misc, castTimes, durations, cooldowns, power, levels, skills] = await Promise.all([
    table('SpellName', build),
    table('SpellName', build, 'frFR'),
    table('SpellEffect', build),
    table('SpellMisc', build),
    table('SpellCastTimes', build),
    table('SpellDuration', build),
    table('SpellCooldowns', build),
    table('SpellPower', build),
    table('SpellLevels', build),
    table('SkillLineAbility', build),
  ]);
  const by = (rows, key) => new Map(rows.map((r) => [r[key], r]));
  const nameEn = by(names, 'ID');
  const nameFr = by(namesFr, 'ID');
  const miscOf = by(misc, 'SpellID');
  const castOf = by(castTimes, 'ID');
  const durOf = by(durations, 'ID');
  const levelOf = by(levels, 'SpellID');
  const cdOf = by(cooldowns, 'SpellID');
  const powerOf = new Map();
  for (const p of power) if (!powerOf.has(p.SpellID) && (p.PowerType === '0' || p.PowerType === '')) powerOf.set(p.SpellID, p);
  const anyPower = new Set(power.map((p) => p.SpellID));
  const effectsOf = new Map();
  for (const e of effects) {
    if (!effectsOf.has(e.SpellID)) effectsOf.set(e.SpellID, []);
    effectsOf.get(e.SpellID).push(e);
  }
  for (const list of effectsOf.values()) list.sort((a, b) => Number(a.EffectIndex) - Number(b.EffectIndex));
  // Sorts de dégâts par nom (pour retrouver le sort déclenché par script serveur).
  const byName = new Map();
  for (const n of names) {
    if (!byName.has(n.Name_lang)) byName.set(n.Name_lang, []);
    byName.get(n.Name_lang).push(n.ID);
  }

  const lv = (id) => {
    const l = levelOf.get(id);
    return { base: Number(l?.BaseLevel || 0), spell: Number(l?.SpellLevel || 0), max: Number(l?.MaxLevel || 0) };
  };
  /** Valeur d'un effet au niveau retenu (moyenne), avec son écart min/max. */
  const amount = (e, id) => {
    const l = lv(id);
    const gain = Number(e.EffectRealPointsPerLevel || 0) * Math.max(0, Math.min(scaleLevel(l), PLAYER_LEVEL + 10) - (l.spell || l.base));
    const avg = Number(e.EffectBasePointsF || 0) + gain;
    const v = Number(e.Variance || 0);
    return { min: avg * (1 - v / 2), max: avg * (1 + v / 2), coef: Number(e.EffectBonusCoefficient || 0) };
  };
  const isArea = (e) => AREA_TARGETS.has(Number(e.ImplicitTarget_0)) || AREA_TARGETS.has(Number(e.ImplicitTarget_1)) || Number(e.EffectRadiusIndex_0) > 0;
  const directOf = (id) => (effectsOf.get(id) ?? []).find((e) => [E_SCHOOL_DAMAGE, E_HEALTH_LEECH].includes(Number(e.Effect)) && Number(e.EffectBasePointsF) > 0);

  const out = {};
  for (const [classId, trees] of Object.entries(CLASSES)) {
    const ranks = new Map();
    for (const s of skills) {
      const tree = trees.indexOf(Number(s.SkillLine));
      if (tree < 0) continue;
      const name = nameEn.get(s.Spell)?.Name_lang;
      if (!name) continue;
      const l = lv(s.Spell);
      // Niveau 0 : capacités spéciales de Forever (runes, formes) dont on ne sait pas qui les possède.
      if (l.base < 1 || l.base > PLAYER_LEVEL) continue;
      const cur = ranks.get(name);
      // Au même niveau, on préfère le sort qui a un coût (le sort lancé, pas un effet déclenché du même nom).
      const better =
        !cur ||
        l.base > cur.level ||
        (l.base === cur.level && (anyPower.has(s.Spell) ? 1 : 0) - (anyPower.has(cur.id) ? 1 : 0) > 0) ||
        (l.base === cur.level && anyPower.has(s.Spell) === anyPower.has(cur.id) && Number(s.Spell) > Number(cur.id));
      if (better) ranks.set(name, { id: s.Spell, level: l.base, tree });
    }

    // Sorts déclenchés par un autre sort de la liste (« Effet Flammes infernales ») : comptés dans leur sort parent.
    const triggered = new Set();
    for (const { id } of ranks.values()) for (const e of effectsOf.get(id) ?? []) if (Number(e.EffectTriggerSpell) > 0) triggered.add(e.EffectTriggerSpell);

    const spells = [];
    for (const [name, { id, level, tree }] of ranks) {
      if (triggered.has(id)) continue;
      const m = miscOf.get(id);
      if (!m) continue;
      const a0 = Number(m.Attributes_0 || 0);
      if (a0 & 0x40) continue; // passif
      const effs = effectsOf.get(id) ?? [];
      const duration = Number(durOf.get(m.DurationIndex)?.Duration || 0) / 1000;
      const channel = (Number(m.Attributes_1 || 0) & 0x44) !== 0;
      const def = {
        id: spells.some((x) => x.id === camel(name)) ? `${camel(name)}${id}` : camel(name),
        spellId: Number(id),
        name: { en: name, fr: nameFr.get(id)?.Name_lang || name },
        iconFileId: Number(m.SpellIconFileDataID || 0),
        tree,
        level,
        school: schoolOf(Number(m.SchoolMask)),
        castTime: channel ? duration : Number(castOf.get(m.CastingTimeIndex)?.Base || 0) / 1000,
        manaCost: Number(powerOf.get(id)?.ManaCost || 0),
      };
      // Coût en % du mana de base (sorts récents) : converti par le simulateur.
      const pct = Number(powerOf.get(id)?.PowerCostPct || 0);
      if (!def.manaCost && pct > 0) def.manaCostPct = pct;
      if (channel) def.channel = true;
      const cd = cdOf.get(id);
      const cooldown = Math.max(Number(cd?.RecoveryTime || 0), Number(cd?.CategoryRecoveryTime || 0)) / 1000;
      if (cooldown > 1.5) def.cooldown = cooldown;
      let aoe = false;

      const direct = effs.find((e) => [E_SCHOOL_DAMAGE, E_HEALTH_LEECH].includes(Number(e.Effect)) && Number(e.EffectBasePointsF) > 0);
      if (direct) {
        const a = amount(direct, id);
        Object.assign(def, { directMin: round(a.min, 1), directMax: round(a.max, 1), directCoeff: round(a.coef) });
        aoe ||= isArea(direct);
      }
      const periodic = effs.find(
        (e) => [E_APPLY_AURA, E_PERSISTENT_AREA].includes(Number(e.Effect)) && [A_PERIODIC_DAMAGE, A_PERIODIC_LEECH].includes(Number(e.EffectAura)) && Number(e.ImplicitTarget_0) !== 1,
      );
      const trigger = effs.find((e) => Number(e.EffectAura) === A_PERIODIC_TRIGGER && Number(e.EffectTriggerSpell) > 0);
      const dummy = effs.find((e) => Number(e.EffectAura) === A_PERIODIC_DUMMY && Number(e.EffectAuraPeriod) > 0);
      if (periodic && duration > 0) {
        const period = Number(periodic.EffectAuraPeriod) / 1000 || 3;
        const ticks = Math.max(1, Math.round(duration / period));
        const a = amount(periodic, id);
        Object.assign(def, { dotTotal: round(((a.min + a.max) / 2) * ticks, 1), dotDuration: duration, dotTicks: ticks, dotCoeff: round(a.coef * ticks) });
        aoe ||= isArea(periodic);
      } else if ((trigger || dummy) && duration > 0) {
        // Canalisé à impulsions : chaque impulsion lance un sort de dégâts (Flammes infernales, Pluie de feu).
        const pulse = trigger ?? dummy;
        const period = Number(pulse.EffectAuraPeriod) / 1000 || 1;
        const ticks = Math.max(1, Math.round(duration / period));
        let hitId = trigger ? String(trigger.EffectTriggerSpell) : null;
        if (!hitId || !directOf(hitId)) {
          // Script serveur : sort du même nom et du même niveau qui inflige des dégâts.
          hitId = (byName.get(name) ?? []).find((x) => x !== id && directOf(x) && lv(x).spell === lv(id).spell) ?? null;
        }
        const hit = hitId ? directOf(hitId) : null;
        if (hit) {
          const a = amount(hit, hitId);
          Object.assign(def, { dotTotal: round(((a.min + a.max) / 2) * ticks, 1), dotDuration: duration, dotTicks: ticks, dotCoeff: round(a.coef * ticks) });
          aoe ||= isArea(hit) || isArea(pulse) || Number(pulse.ImplicitTarget_0) === 1;
        }
      }
      if (!def.directMax && !def.dotTotal) continue; // pas un sort de dégâts
      // Effet déclenché (Bouclier de foudre, Garde de l'ombre) : instantané, sans coût ni temps de recharge.
      if (!anyPower.has(id) && !def.castTime && !def.cooldown) continue;
      if (aoe) def.aoe = true;
      // Dégâts aussi infligés au lanceur (Flammes infernales) : non simulés, l'optimiseur ne propose pas ce sort.
      if (effs.some((e) => Number(e.EffectAura) === A_PERIODIC_DAMAGE && Number(e.ImplicitTarget_0) === 1)) def.selfDamage = true;
      spells.push(def);
    }
    spells.sort((a, b) => a.tree - b.tree || a.level - b.level);
    out[classId] = spells;
    console.log(`${classId} : ${spells.length} sorts de dégâts`);
  }

  // Noms d'icônes (fichier interface/icons/<nom>.blp).
  const fileIds = [...new Set(Object.values(out).flat().map((s) => s.iconFileId).filter(Boolean))];
  const icons = new Map();
  for (const fid of fileIds) {
    try {
      const res = await fetch(`https://wago.tools/api/info/${fid}`, { headers: UA });
      const info = await res.json();
      const m = /icons\/([^/.]+)\.blp$/i.exec(info.filename ?? '');
      if (m) icons.set(fid, m[1].toLowerCase());
    } catch {
      /* icône inconnue */
    }
  }
  for (const list of Object.values(out))
    for (const s of list) {
      s.icon = icons.get(s.iconFileId) ?? 'inv_misc_questionmark';
      delete s.iconFileId;
    }

  mkdirSync('src/data/generated', { recursive: true });
  const file = 'src/data/generated/wago-spells.json';
  writeFileSync(
    file,
    JSON.stringify({ source: `wago.tools (client WoW Forever ${build})`, build, fetchedAt: new Date().toISOString().slice(0, 10), classes: out }, null, 1) + '\n',
  );
  console.log(`écrit : ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
