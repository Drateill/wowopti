import { emptyMods, type GameRules, type SimModifiers, type SpellDef, type Stats } from '../data/types';
import { LIFE_TAP_BASE } from '../data/warlock/spells';
import { TALENT_BY_KEY, talentValue } from '../data/warlock/talents';
import { createRng } from './rng';
import type { SimResult, SpellBreakdown, StatWeight } from './simTypes';

export type { SimResult, SpellBreakdown, StatWeight };
import { deriveStats, type Pet } from './stats';
import { rank, type TalentPoints } from './talents';

export interface RotationOptions {
  bane: 'agony' | 'doom' | 'none';
  corruption: boolean;
  immolate: boolean;
  siphonLife: boolean;
  conflagrate: boolean;
  wrack: boolean;
  filler: 'shadowBolt' | 'searingPain' | 'incinerate';
  /** Le diablotin lance Éclair de feu pendant tout le combat. */
  petAttacks: boolean;
}

export interface RaidBuffs {
  shadowDamagePct: number;
  fireDamagePct: number;
  /** Démon sacrifié (Sacrifice démoniaque). */
  sacrificed: Pet;
  /** Démon invoqué pendant le combat (Maître démonologue, Connaissance démoniaque). */
  activePet: Pet;
  /** Part du combat (%) où un autre démoniste maintient Trait de l'ombre amélioré sur la cible. */
  raidIsbUptime: number;
}

export interface SimConfig {
  spells: SpellDef[];
  rules: GameRules;
  gear: Stats;
  /** Bonus d'ensemble, consommables et débuffs qui ne sont pas des stats. */
  mods?: SimModifiers;
  talents: TalentPoints;
  rotation: RotationOptions;
  buffs: RaidBuffs;
  fightLength: number;
  iterations: number;
  seed: number;
}

/** Sorts accélérés par Calvaire et améliorés par Pandémie. */
const WRACK_DOTS = new Set(['corruption', 'baneOfAgony', 'siphonLife']);
const PANDEMIC = new Set(['corruption', 'baneOfAgony', 'baneOfDoom', 'siphonLife', 'wrack']);
const NIGHTFALL = new Set(['corruption', 'wrack']);
const TIMELINE_STEP = 5;
const PET_CRIT = 0.05; // chance de critique supposée du diablotin
const AMPLIFY_COOLDOWN = 180;
const SOUL_SIPHON_DOTS = ['corruption', 'siphonLife', 'baneOfAgony'];
const EPS = 1e-9;

/** Démon effectivement présent : sans Pacte démoniaque, le sacrifice empêche d'invoquer. */
export function effectivePet(buffs: RaidBuffs, talents: TalentPoints): Pet {
  if (buffs.sacrificed !== 'none' && rank(talents, 'demonicSacrifice') && !rank(talents, 'demonicPact')) return 'none';
  return buffs.activePet;
}

/** Valeurs des talents au rang choisi, lues dans les descriptions Forever. */
export function talentEffects(talents: TalentPoints) {
  const v = (key: string, re: RegExp) => talentValue(key, rank(talents, key), re);
  return {
    lifeTapPct: v('improvedLifeTap', /by (\d+)%/),
    corruptionCastCut: v('improvedCorruption', /by ([\d.]+) sec/),
    corruptionDmgPct: v('improvedCorruption', /deals by (\d+)%/),
    baneOfAgonyPct: v('improvedBaneOfAgony', /by (\d+)%/),
    pandemicPct: v('pandemic', /by (\d+)%/),
    malevolencePct: v('malevolence', /by (\d+)%/),
    nightfallPct: v('nightfall', /a (\d+)% chance/),
    shadowMasteryPct: v('shadowMastery', /by (\d+)%/),
    sacrificeImpShadowPct: v('demonicSacrifice', /Imp: Increases your Shadow damage by (\d+)%/),
    sacrificeSuccubusFirePct: v('demonicSacrifice', /Incubus: Increases your Fire damage by (\d+)%/),
    sacrificeVoidwalkerManaPct: v('demonicSacrifice', /Restores (\d+)% of your total Mana every 4 sec/),
    masterDemoImpFirePct: v('masterDemonologist', /Imp - Increases Fire damage done by (\d+)%/),
    masterDemoSuccubusShadowPct: v('masterDemonologist', /Incubus - Increases Shadow damage done by (\d+)%/),
    decimationPct: v('decimation', /deal (\d+)% increased damage/),
    isbPct: v('improvedShadowBolt', /by (\d+)% for/),
    baneCastCut: v('bane', /by ([\d.]+) sec/),
    cataclysmPct: v('cataclysm', /by (\d+)%/),
    aftermathPct: v('aftermath', /Immolate spell by (\d+)%/),
    ruinPct: v('ruin', /by (\d+)%/),
    agonizingSearingCrit: v('agonizingFlames', /Searing Pain spell by (\d+)%/),
    agonizingDestroPct: v('agonizingFlames', /Destruction spells by (\d+)%/),
    fireAndBrimstoneCrit: v('fireAndBrimstone', /by (\d+)%/),
    shadowAndFlamePct: v('shadowAndFlame', /Shadow damage you deal by (\d+)%/),
    shadowAndFlameKeepPct: v('shadowAndFlame', /Conflagrate has a (\d+)% chance not to consume/),
    soulLinkPct: v('soulLink', /inflict (\d+)% more damage/),
    amplifyPct: v('amplifyCurse', /Bane of Agony by (\d+)%/),
    soulSiphonPer: v('soulSiphon', /by (\d+)% per each/),
    soulSiphonMax: v('soulSiphon', /maximum increase of (\d+)%/),
    unholyPowerPct: v('unholyPower', /pets by (\d+)%/),
    improvedImpPct: v('improvedImp', /Firebolt spell by (\d+)%/),
  };
}

/** Fonctions de calcul pures, exportées pour les tests et l'onglet Sorts. */
export function makeCalculator(config: SimConfig) {
  const { rules, talents, buffs } = config;
  const pet = effectivePet(buffs, talents);
  const mods = config.mods ?? emptyMods();
  const derived = deriveStats(rules, config.gear, talents, pet, mods);
  const fx = talentEffects(talents);
  const sacrifice = rank(talents, 'demonicSacrifice') ? buffs.sacrificed : 'none';

  const castTime = (s: SpellDef) => {
    let c = s.castTime;
    if (s.id === 'shadowBolt' || s.id === 'immolate' || s.id === 'incinerate') c -= fx.baneCastCut;
    if (s.id === 'corruption') c -= fx.corruptionCastCut;
    return Math.max(0, c);
  };

  const manaCost = (s: SpellDef) => {
    const cut = (s.destruction ? fx.cataclysmPct : 0) + (mods.costPct[s.id] ?? 0) + (mods.costPct[`school:${s.school}`] ?? 0);
    return s.manaCost * Math.max(0, 1 - cut / 100);
  };

  /** Multiplicateurs venant des sets, consommables et débuffs (aussi appliqués au démon pour l'école). */
  const modMult = (s: SpellDef) => (mods.dmgMult[s.id] ?? 1) * (mods.dmgMult[`school:${s.school}`] ?? 1) * (mods.dmgMult.all ?? 1);
  const soulLink = pet !== 'none' ? 1 + fx.soulLinkPct / 100 : 1;

  /** Dégâts du démon : talents de démon, Lien spirituel et débuffs de la cible ; pas les talents du démoniste. */
  const petMult = (s: SpellDef) => {
    let m = modMult(s) * soulLink * (1 + fx.unholyPowerPct / 100);
    if (s.id === 'impFirebolt') m *= 1 + fx.improvedImpPct / 100;
    if (s.school === 'fire') m *= 1 + buffs.fireDamagePct / 100;
    if (s.school === 'shadow') m *= 1 + buffs.shadowDamagePct / 100;
    return m;
  };

  const critChance = (s: SpellDef) => {
    let c = derived.critPct;
    if (s.school === 'shadow') c += fx.malevolencePct;
    if (s.id === 'searingPain') c += fx.agonizingSearingCrit;
    if (s.id === 'conflagrate') c += fx.fireAndBrimstoneCrit;
    return Math.min(100, Math.max(0, c)) / 100;
  };

  const critMult = (s: SpellDef) => {
    const bonus = rules.critMultiplier - 1;
    let extra = 0;
    if (s.destruction) extra += fx.ruinPct;
    if (PANDEMIC.has(s.id)) extra += fx.pandemicPct;
    return 1 + bonus * (1 + extra / 100);
  };

  /** Multiplicateurs permanents (talents, raid, démons). Les buffs temporaires sont gérés dans la boucle. */
  const staticMult = (s: SpellDef) => {
    if (s.pet) return petMult(s);
    let m = modMult(s) * soulLink;
    if (s.school === 'shadow') {
      m *= 1 + fx.shadowMasteryPct / 100;
      m *= 1 + buffs.shadowDamagePct / 100;
      if (sacrifice === 'imp') m *= 1 + fx.sacrificeImpShadowPct / 100;
      if (pet === 'succubus') m *= 1 + fx.masterDemoSuccubusShadowPct / 100;
    }
    if (s.school === 'fire') {
      m *= 1 + buffs.fireDamagePct / 100;
      if (sacrifice === 'succubus') m *= 1 + fx.sacrificeSuccubusFirePct / 100;
      if (pet === 'imp') m *= 1 + fx.masterDemoImpFirePct / 100;
    }
    if (s.destruction) m *= 1 + fx.agonizingDestroPct / 100;
    if (s.id === 'corruption') m *= 1 + fx.corruptionDmgPct / 100;
    if (s.id === 'baneOfAgony') m *= 1 + fx.baneOfAgonyPct / 100;
    return m;
  };

  const power = (s: SpellDef) => (s.school === 'shadow' ? derived.shadowPower : s.school === 'fire' ? derived.firePower : derived.spellPower);

  const directAvg = (s: SpellDef) => {
    if (!s.directMax) return 0;
    let d = (s.directMin! + s.directMax) / 2 + (s.directCoeff ?? 0) * power(s);
    if (s.id === 'immolate') d *= 1 + fx.aftermathPct / 100;
    return d * staticMult(s);
  };
  const dotTotal = (s: SpellDef) => (s.dotTotal ? (s.dotTotal + (s.dotCoeff ?? 0) * power(s)) * staticMult(s) : 0);
  const delayed = (s: SpellDef) => (s.delayedDamage ? (s.delayedDamage + (s.delayedCoeff ?? 0) * power(s)) * staticMult(s) : 0);

  return { derived, mods, fx, pet, sacrifice, castTime, manaCost, critChance, critMult, staticMult, power, directAvg, dotTotal, delayed };
}

interface Dot {
  spell: SpellDef;
  ticksLeft: number;
  interval: number;
  /** Temps « de DoT » restant avant le prochain tick (accéléré par Calvaire). */
  toNext: number;
  tickBase: number; // dégâts du tick avant buffs temporaires
}

export function simulate(config: SimConfig): SimResult {
  const { rules, rotation, fightLength } = config;
  const calc = makeCalculator(config);
  const { derived, fx, castTime, manaCost, critChance, critMult, power } = calc;
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const get = (id: string) => spells.get(id)!;
  const has = (key: string) => rank(config.talents, key) > 0;
  const hitChance = derived.chanceToHitPct / 100;
  const rng = createRng(config.seed);

  const totals = new Map<string, SpellBreakdown>();
  for (const s of config.spells) totals.set(s.id, { id: s.id, damage: 0, casts: 0, hits: 0, crits: 0, misses: 0, ticks: 0 });
  const bins = Math.ceil(fightLength / TIMELINE_STEP);
  const timeline = new Array<number>(bins).fill(0);
  const dpsList: number[] = [];
  let lifeTaps = 0;

  const lifeTapMana = (LIFE_TAP_BASE + derived.spirit) * (1 + fx.lifeTapPct / 100);
  let regenPerSec = derived.mp5 / 5;
  if (calc.sacrifice === 'voidwalker') regenPerSec += (derived.maxMana * fx.sacrificeVoidwalkerManaPct) / 100 / 4;
  const executeAt = fightLength * 0.65; // la cible passe sous 35 % (vie linéaire)
  const isbDef = TALENT_BY_KEY.get('improvedShadowBolt');
  const raidIsb = 1 + (talentValue('improvedShadowBolt', isbDef?.maxRank ?? 0, /by (\d+)% for/) * (config.buffs.raidIsbUptime ?? 0)) / 100 / 100;
  const imp = spells.get('impFirebolt');
  const impActive = !!imp && calc.pet === 'imp' && rotation.petAttacks !== false;

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let mana = derived.maxMana;
    let damage = 0;
    const dots = new Map<string, Dot>();
    const cooldowns = new Map<string, number>();
    let isbUntil = -1;
    let sfShadowUntil = -1;
    let shadowTrance = false;
    let doomAt = -1;
    let doomDamage = 0;
    let wrackUntil = -1;
    let amplifyReady = 0;

    /** Multiplicateur dynamique au moment où les dégâts tombent. */
    const dynMult = (s: SpellDef, at: number) => {
      let m = 1;
      if (s.school === 'shadow') {
        // Notre propre Trait de l'ombre amélioré, sinon celui d'un autre démoniste (moyenne sur sa présence).
        if (at < isbUntil) m *= 1 + fx.isbPct / 100;
        else m *= raidIsb;
        if (at < sfShadowUntil) m *= 1 + fx.shadowAndFlamePct / 100;
      }
      return m;
    };

    const record = (id: string, amount: number, at: number) => {
      if (at > fightLength + EPS) return;
      damage += amount;
      totals.get(id)!.damage += amount;
      timeline[Math.min(bins - 1, Math.floor(at / TIMELINE_STEP))] += amount;
    };

    const speed = (id: string) => (t < wrackUntil - EPS && WRACK_DOTS.has(id) ? 2 : 1);

    const advanceTo = (target: number) => {
      for (;;) {
        // Prochain événement : tick d'un DoT, Plaie funeste, ou fin de Calvaire (changement de vitesse).
        let next = target;
        let kind: 'none' | 'dot' | 'doom' | 'wrackEnd' = 'none';
        let dotId = '';
        for (const [id, d] of dots) {
          const at = t + d.toNext / speed(id);
          if (at < next - EPS || (kind === 'none' && at <= next + EPS)) {
            next = at;
            kind = 'dot';
            dotId = id;
          }
        }
        if (doomAt >= 0 && doomAt <= next + EPS && (kind === 'none' || doomAt < next)) {
          next = doomAt;
          kind = 'doom';
        }
        if (wrackUntil > t + EPS && wrackUntil < next - EPS) {
          next = wrackUntil;
          kind = 'wrackEnd';
        }
        const dt = Math.max(0, next - t);
        for (const [id, d] of dots) d.toNext -= dt * speed(id);
        mana = Math.min(derived.maxMana, mana + regenPerSec * dt);
        t = next;
        if (kind === 'none') break;
        if (kind === 'doom') {
          const s = get('baneOfDoom');
          record('baneOfDoom', doomDamage * dynMult(s, t), t);
          totals.get('baneOfDoom')!.hits++;
          doomAt = -1;
        } else if (kind === 'dot') {
          const d = dots.get(dotId)!;
          let amount = d.tickBase * dynMult(d.spell, t);
          const tot = totals.get(dotId)!;
          tot.ticks++;
          if (rules.dotsCanCrit && rng() < critChance(d.spell)) {
            amount *= critMult(d.spell);
            tot.crits++;
          }
          record(dotId, amount, t);
          if (NIGHTFALL.has(dotId) && fx.nightfallPct > 0 && rng() < fx.nightfallPct / 100) shadowTrance = true;
          d.ticksLeft--;
          d.toNext = d.interval;
          if (d.ticksLeft <= 0) dots.delete(dotId);
        }
      }
    };

    const remaining = () => fightLength - t;
    const dotLeft = (id: string) => {
      const d = dots.get(id);
      return d ? d.toNext + (d.ticksLeft - 1) * d.interval : 0;
    };
    const ready = (id: string) => (cooldowns.get(id) ?? 0) <= t + EPS;
    const worthDot = (s: SpellDef) => remaining() >= (s.dotDuration ?? 0) / 3;
    const baneActive = () => dots.has('baneOfAgony') || doomAt > t;

    const chooseSpell = (): SpellDef => {
      const doom = get('baneOfDoom');
      if (rotation.bane === 'doom' && !baneActive() && ready('baneOfDoom') && remaining() >= (doom.delayedAfter ?? 60)) return doom;
      const agony = get('baneOfAgony');
      if (rotation.bane !== 'none' && !baneActive() && worthDot(agony)) return agony;
      const corr = get('corruption');
      if (rotation.corruption && dotLeft('corruption') <= castTime(corr) && worthDot(corr)) return corr;
      const siphon = get('siphonLife');
      if (rotation.siphonLife && has('siphonLife') && !dots.has('siphonLife') && worthDot(siphon)) return siphon;
      const imm = get('immolate');
      const needImmolate = rotation.immolate || rotation.conflagrate || rotation.filler === 'incinerate';
      if (needImmolate && dotLeft('immolate') <= castTime(imm) && worthDot(imm)) return imm;
      if (rotation.conflagrate && has('conflagrate') && ready('conflagrate') && dots.has('immolate')) return get('conflagrate');
      if (rotation.wrack && has('wrack') && dots.has('corruption') && (rotation.bane !== 'agony' || dots.has('baneOfAgony')) && remaining() >= 3)
        return get('wrack');
      if (shadowTrance) return get('shadowBolt');
      if (rotation.filler === 'incinerate' && !has('incinerate')) return get('shadowBolt');
      return get(rotation.filler);
    };

    const resolveDirect = (s: SpellDef) => {
      const tot = totals.get(s.id)!;
      let amount = s.directMin! + rng() * (s.directMax! - s.directMin!) + (s.directCoeff ?? 0) * power(s);
      amount *= calc.staticMult(s) * dynMult(s, t);
      if (s.id === 'immolate') amount *= 1 + fx.aftermathPct / 100;
      if (s.bonusIfImmolate && dots.has('immolate')) amount *= 1 + s.bonusIfImmolate;
      if ((s.id === 'shadowBolt' || s.id === 'searingPain') && t >= executeAt) amount *= 1 + fx.decimationPct / 100;
      if (rng() < critChance(s)) {
        amount *= critMult(s);
        tot.crits++;
        if (s.id === 'shadowBolt' && fx.isbPct > 0) isbUntil = t + 12;
      }
      tot.hits++;
      record(s.id, amount, t);
    };

    const applyDot = (s: SpellDef) => {
      const interval = s.dotDuration! / s.dotTicks!;
      let mult = 1;
      // Malédiction amplifiée : la prochaine Plaie d'agonie est renforcée (temps de recharge de 3 min, hors GCD).
      if (s.id === 'baneOfAgony' && fx.amplifyPct > 0 && t >= amplifyReady - EPS) {
        mult *= 1 + fx.amplifyPct / 100;
        amplifyReady = t + AMPLIFY_COOLDOWN;
      }
      // Siphon d'âme : Calvaire gagne un bonus par DoT d'Affliction actif.
      if (s.id === 'wrack' && fx.soulSiphonPer > 0) {
        const count = SOUL_SIPHON_DOTS.filter((id) => dots.has(id)).length;
        mult *= 1 + Math.min(fx.soulSiphonMax || Infinity, fx.soulSiphonPer * count) / 100;
      }
      dots.set(s.id, {
        spell: s,
        ticksLeft: s.dotTicks!,
        interval,
        toNext: interval,
        tickBase: (calc.dotTotal(s) / s.dotTicks!) * mult,
      });
    };

    // Le diablotin lance Éclair de feu en continu, indépendamment du démoniste.
    if (impActive) {
      const tot = totals.get(imp.id)!;
      const step = imp.castTime + rules.latency;
      const petHit = (100 - rules.targetMissPct) / 100; // le toucher du démoniste ne profite pas au démon
      for (let at = step; at <= fightLength + EPS; at += step) {
        tot.casts++;
        if (rng() >= petHit) {
          tot.misses++;
          continue;
        }
        let amount = (imp.directMin! + rng() * (imp.directMax! - imp.directMin!)) * calc.staticMult(imp);
        if (rng() < PET_CRIT) {
          amount *= 1.5;
          tot.crits++;
        }
        tot.hits++;
        record(imp.id, amount, at);
      }
    }

    while (t < fightLength - EPS) {
      const spell = chooseSpell();
      const cost = manaCost(spell);
      if (cost > mana) {
        lifeTaps++;
        mana = Math.min(derived.maxMana, mana + lifeTapMana);
        advanceTo(t + rules.gcd + rules.latency);
        continue;
      }
      const tot = totals.get(spell.id)!;
      const start = t;
      mana -= cost;
      if (spell.cooldown) cooldowns.set(spell.id, start + spell.cooldown);

      if (spell.channel) {
        // Canalisé (Calvaire) : le sort touche ou rate au début, puis inflige ses ticks.
        tot.casts++;
        if (rng() >= hitChance) {
          tot.misses++;
          advanceTo(start + rules.gcd + rules.latency);
          continue;
        }
        tot.hits++;
        const duration = castTime(spell);
        if (spell.id === 'wrack') wrackUntil = start + duration;
        applyDot(spell);
        advanceTo(Math.min(fightLength, start + duration + rules.latency));
        continue;
      }

      const instantTrance = spell.id === 'shadowBolt' && shadowTrance;
      const ct = instantTrance ? 0 : castTime(spell);
      if (instantTrance) shadowTrance = false;
      advanceTo(start + ct + rules.latency);
      if (t > fightLength + EPS) break;
      tot.casts++;

      if (rng() >= hitChance) {
        tot.misses++;
      } else {
        if (spell.directMax) resolveDirect(spell);
        if (spell.dotTotal) applyDot(spell);
        if (spell.delayedDamage) {
          tot.hits++;
          doomAt = t + (spell.delayedAfter ?? 60);
          doomDamage = calc.delayed(spell);
        }
        if (spell.id === 'conflagrate') {
          if (fx.shadowAndFlamePct > 0) sfShadowUntil = t + 20;
          if (rng() >= fx.shadowAndFlameKeepPct / 100) dots.delete('immolate');
        }
      }
      const gcdEnd = start + Math.max(rules.gcd, ct) + rules.latency;
      if (gcdEnd > t) advanceTo(gcdEnd);
    }
    advanceTo(fightLength);
    dpsList.push(damage / fightLength);
  }

  const n = config.iterations;
  const mean = dpsList.reduce((a, b) => a + b, 0) / n;
  const variance = dpsList.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1);
  let min = Infinity;
  let max = -Infinity;
  for (const d of dpsList) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const buckets = 20;
  const width = (max - min) / buckets || 1;
  const histogram = Array.from({ length: buckets }, (_, i) => ({ dps: Math.round(min + width * (i + 0.5)), count: 0 }));
  for (const d of dpsList) histogram[Math.min(buckets - 1, Math.floor((d - min) / width))].count++;

  const breakdown = [...totals.values()]
    .map((b) => ({ ...b, damage: b.damage / n, casts: b.casts / n, hits: b.hits / n, crits: b.crits / n, misses: b.misses / n, ticks: b.ticks / n }))
    .filter((b) => b.casts > 0 || b.damage > 0)
    .sort((a, b) => b.damage - a.damage);

  return {
    dps: mean,
    stdev: Math.sqrt(variance),
    min,
    max,
    breakdown,
    timeline: timeline.map((v, i) => ({ t: (i + 1) * TIMELINE_STEP, dps: v / n / Math.min(TIMELINE_STEP, fightLength - i * TIMELINE_STEP) })),
    histogram,
    lifeTaps: lifeTaps / n,
    iterations: n,
  };
}

export const WEIGHT_DELTAS: Partial<Record<keyof Stats, number>> = {
  spellPower: 20,
  shadowPower: 20,
  firePower: 20,
  critPct: 1,
  hitPct: 1,
  intellect: 20,
  spirit: 20,
  mp5: 10,
};

/** Poids de stats par différence finie, avec la même graine pour chaque variante. */
export function statWeights(config: SimConfig, onProgress?: (done: number, total: number) => void): { base: SimResult; weights: StatWeight[] } {
  const keys = Object.keys(WEIGHT_DELTAS) as (keyof Stats)[];
  const total = keys.length + 1;
  const base = simulate(config);
  onProgress?.(1, total);
  const raw = keys.map((key, i) => {
    const delta = WEIGHT_DELTAS[key]!;
    const res = simulate({ ...config, gear: { ...config.gear, [key]: config.gear[key] + delta } });
    onProgress?.(i + 2, total);
    const dpsGain = res.dps - base.dps;
    return { key, delta, dpsGain, perPoint: dpsGain / delta };
  });
  const spValue = raw.find((w) => w.key === 'spellPower')!.perPoint || 1;
  return { base, weights: raw.map((w) => ({ ...w, ep: w.perPoint / spValue })) };
}
