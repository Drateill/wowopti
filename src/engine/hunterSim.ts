import { HUNTER_DATA, type HunterOptions, type HunterRules, type HunterSpec } from '../data/hunter/data';
import { emptyMods, type SimModifiers, type SpellDef, type Stats, type WeaponInfo } from '../data/types';
import { armorReduction } from './paladinSim';
import { makePriority, type PriorityList, type StepImpl } from './priority';
import { HUNTER_STEPS } from './rotationSteps';
import { createRng } from './rng';
import { createRecorder, type SimResult } from './simTypes';
import { rank, type TalentPoints } from './talents';

// Simulateur du chasseur Forever : Tir automatique, Morsure de serpent, Tir des arcanes, Visée ou Flèches multiples,
// Tir de précision, faucons et familier (Maîtrise des bêtes, Précision) ; corps à corps pour la Survie.

export interface HunterSimConfig {
  classId: 'hunter';
  spec: HunterSpec;
  rules: HunterRules;
  spells: SpellDef[];
  gear: Stats;
  mods?: SimModifiers;
  talents: TalentPoints;
  options: HunterOptions;
  /** Arme à distance (emplacement Baguette/À distance). */
  weapon?: WeaponInfo | null;
  /** Arme de mêlée (main droite), pour la Survie. */
  meleeWeapon?: WeaponInfo | null;
  fightLength: number;
  iterations: number;
  seed: number;
  priority?: PriorityList;
}

const EPS = 1e-9;
/** Armes par défaut quand aucune n'est équipée (ordre de grandeur d'un début de raid). */
export const DEFAULT_RANGED: WeaponInfo = { min: 90, max: 168, speed: 3, twoHand: true };
export const DEFAULT_MELEE: WeaponInfo = { min: 140, max: 210, speed: 3.4, twoHand: true };

export function hunterTalents(t: TalentPoints) {
  const v = (key: string, re: RegExp) => HUNTER_DATA.talentValue(key, rank(t, key), re);
  return {
    deadlyAspectsChance: v('deadlyAspects', /a (\d+)% chance/),
    deadlyAspectsSpeed: v('deadlyAspects', /speed by (\d+)% for/),
    focusedFirePct: v('focusedFire', /by (\d+)%/),
    unleashedFuryPct: v('unleashedFury', /by (\d+)%/),
    ferocityPct: v('ferocity', /by (\d+)%/),
    summonHawk: rank(t, 'summonHawk') > 0,
    bestialDisciplineRegen: v('bestialDiscipline', /allows (\d+)% of your Mana/),
    frenzyChance: v('frenzy', /a (\d+)% chance/),
    frenzySpeed: v('frenzy', /a (\d+)% attack speed/),
    bestialWrath: rank(t, 'bestialWrath') > 0,
    lethalAttacksPct: v('lethalAttacks', /by (\d+)%/),
    improvedStingsPct: v('improvedStings', /Serpent Sting ability by (\d+)%/),
    efficiencyPct: v('efficiency', /by (\d+)%/),
    carefulAimPct: v('carefulAim', /by (\d+)% of your Intellect/),
    rapidKillingMin: v('rapidKilling', /by (\d+) min/),
    improvedArcaneShotSec: v('improvedArcaneShot', /by ([\d.]+) sec/),
    loneWolfPct: v('loneWolf', /deal (\d+)% increased/),
    trueshotAp: v('trueshotAura', /by (\d+)\./),
    mortalShotsPct: v('mortalShots', /by (\d+)%/),
    rapidRecuperationRegen: v('rapidRecuperation', /allows (\d+)% of your Mana/),
    barragePct: v('barrage', /by (\d+)%/),
    rangedWeaponSpecPct: v('rangedWeaponSpecialization', /by (\d+)%/),
    sniperShot: rank(t, 'sniperShot') > 0,
    improvedTrackingPct: v('improvedTracking', /increased by (\d+)%/),
    savageStrikesPct: v('savageStrikes', /by (\d+)%/),
    surefootedPct: v('surefooted', /hit chance by (\d+)%/),
    predatorsEdgePct: v('predatorsEdge', /damage by (\d+)%/),
    resourcefulnessCostPct: v('resourcefulness', /abilities by (\d+)%/),
    resourcefulnessRegen: v('resourcefulness', /allow (\d+)% of your Mana/),
    exposePreyChance: v('exposePrey', /a (\d+)% chance/),
    striderKick: rank(t, 'striderKick') > 0,
    lightningReflexesPct: v('lightningReflexes', /Agility by (\d+)%/),
    laceratingPct: v('laceratingStrikes', /equal to (\d+)%/),
    laceratingSec: v('laceratingStrikes', /over (\d+) sec/),
  };
}

export function deriveHunter(rules: HunterRules, gear: Stats, talents: TalentPoints, mods: SimModifiers = emptyMods(), o?: Pick<HunterOptions, 'aspectOfTheHawk' | 'huntersMark'>) {
  const fx = hunterTalents(talents);
  const sm = mods.statMult;
  const agility = (rules.baseAgility + (gear.agility ?? 0)) * sm * (1 + fx.lightningReflexesPct / 100);
  const strength = (rules.baseStrength + (gear.strength ?? 0)) * sm;
  const stamina = (rules.baseStamina + gear.stamina) * sm * mods.staminaMult;
  const intellect = (rules.baseIntellect + gear.intellect) * sm;
  const spirit = (rules.baseSpirit + gear.spirit) * sm;
  const fromInt = (intellect * fx.carefulAimPct) / 100;
  const ap = gear.attackPower ?? 0;
  const mark = o?.huntersMark ?? true ? rules.huntersMarkAp : 0;
  const hitPct = gear.hitPct + fx.surefootedPct;
  return {
    agility,
    strength,
    stamina,
    intellect,
    spirit,
    rangedAp: rules.baseRangedAp + agility * 2 + ap + fromInt + fx.trueshotAp + (o?.aspectOfTheHawk ?? true ? rules.hawkAspectAp : 0) + mark,
    meleeAp: rules.baseMeleeAp + strength + agility + ap + fromInt,
    critPct: rules.baseCritPct + agility / rules.agiPerCritPct + gear.critPct + fx.lethalAttacksPct,
    hitPct,
    hitToCap: Math.max(0, rules.missPct - hitPct),
    maxMana: rules.baseMana + intellect * rules.manaPerInt + mods.maxMana,
    maxHealth: rules.baseHealth + stamina * rules.healthPerSta + mods.maxHealth,
    mp5: gear.mp5,
    spiritRegen: (rules.regenBase + spirit / rules.regenSpiritDivisor) / 2,
  };
}

interface Dot {
  ticksLeft: number;
  next: number;
  interval: number;
  tick: number;
}

export function simulateHunter(config: HunterSimConfig): SimResult {
  const { rules, options: o, fightLength, spec } = config;
  const mods = config.mods ?? emptyMods();
  const fx = hunterTalents(config.talents);
  const d = deriveHunter(rules, config.gear, config.talents, mods, o);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);
  const haste = 1 + mods.hastePct / 100;
  const melee = spec === 'surv';
  const ranged = config.weapon ?? DEFAULT_RANGED;
  const mw = config.meleeWeapon ?? DEFAULT_MELEE;
  const pet = o.pet;
  const armorMult = 1 - armorReduction(Math.max(0, rules.bossArmor - mods.armorReduction), rules.level);
  const allMult = (mods.dmgMult.all ?? 1) * (1 + fx.improvedTrackingPct / 100) * (pet ? 1 + fx.focusedFirePct / 100 : 1 + fx.loneWolfPct / 100);
  const schoolMult = (s: string) => mods.dmgMult[`school:${s}`] ?? 1;
  const miss = Math.max(0, rules.missPct - d.hitPct) / 100;
  const dodge = rules.bossDodgePct / 100;
  const crit = Math.max(0, d.critPct - rules.critSuppressionPct) / 100;
  const rangedCritMult = 1 + (rules.critMultiplier - 1) * (1 + fx.mortalShotsPct / 100);
  const meleeCritMult = 1 + (rules.critMultiplier - 1) * (1 + fx.predatorsEdgePct / 100);
  const cost = (s: SpellDef) => {
    let c = s.manaCost * (1 - fx.efficiencyPct / 100);
    if (['raptorStrike', 'mongooseBite', 'striderKick'].includes(s.id)) c *= 1 - fx.resourcefulnessCostPct / 100;
    return c;
  };
  /** Dégâts d'une arme : jet entre min et max, munitions (à distance), puissance d'attaque. */
  const weaponHit = (w: WeaponInfo, ap: number, isRanged: boolean) =>
    w.min + rng() * (w.max - w.min) + (isRanged ? rules.ammoDps * w.speed : mods.weaponDamage) + (ap / 14) * w.speed;

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let mana = d.maxMana;
    let lastSpend = -10;
    let lastCrit = -100;
    let gcdReady = 0;
    let castEnd = 0;
    const ready = new Map<string, number>();
    let nextAuto = 0;
    let nextMelee = 0;
    let nextPet = pet ? 0.5 : Infinity;
    let rapidUntil = -1;
    let deadlyUntil = -1;
    let frenzyUntil = -1;
    let bwUntil = -1;
    let mongooseUntil = -1;
    let raptorQueued = false;
    let potionReady = 0;
    const hawks: { next: number; end: number }[] = [];
    const dots = new Map<string, Dot>();
    let oomAt = fightLength;

    const isReady = (id: string) => (ready.get(id) ?? 0) <= t + EPS;
    const regen = (dt: number) => {
      const casting = t - lastSpend < 5;
      let whileCasting = fx.bestialDisciplineRegen;
      if (dots.has('serpentSting')) whileCasting = Math.max(whileCasting, fx.rapidRecuperationRegen);
      if (t - lastCrit < 30) whileCasting = Math.max(whileCasting, fx.resourcefulnessRegen);
      return (d.mp5 / 5 + d.spiritRegen * (casting ? whileCasting / 100 : 1)) * dt;
    };
    const rangedSpeed = () =>
      ranged.speed / (1 + rules.quiverHastePct / 100) / (t < rapidUntil ? 1.4 : 1) / (t < deadlyUntil ? 1 + fx.deadlyAspectsSpeed / 100 : 1) / haste;
    const meleeSpeed = () => mw.speed / (t < rapidUntil ? 1.4 : 1) / (t < deadlyUntil ? 1 + fx.deadlyAspectsSpeed / 100 : 1) / haste;
    const onHit = () => {
      if (o.huntersMark && fx.exposePreyChance && rng() < fx.exposePreyChance / 100) mongooseUntil = t + 10;
    };

    /** Attaque du chasseur : table de résolution (raté, esquive, éraflure en mêlée blanche, critique). */
    const attack = (id: string, base: number, kind: 'ranged' | 'white' | 'special', school = 'physical', critBonus = 0) => {
      const e = rec.entry(id);
      const u = rng();
      const dodgeChance = kind === 'ranged' ? (rules.rangedDodge ? dodge : 0) : dodge;
      if (u < miss) {
        e.misses++;
        return 0;
      }
      if (u < miss + dodgeChance) {
        e.misses++;
        return 0;
      }
      e.hits++;
      let amount = base * allMult * schoolMult(school) * (school === 'physical' ? armorMult : 1);
      const glance = kind === 'white' ? rules.glancingPct / 100 : 0;
      if (u < miss + dodgeChance + glance) amount *= 1 - rules.glancingPenaltyPct / 100;
      else if (rng() < crit + critBonus / 100) {
        amount *= kind === 'ranged' ? (id === 'autoShot' ? rules.critMultiplier : rangedCritMult) : kind === 'special' ? meleeCritMult : rules.critMultiplier;
        e.crits++;
        lastCrit = t;
      }
      rec.add(id, amount, t);
      onHit();
      return amount;
    };

    const petAttack = () => {
      const e = rec.entry('pet');
      const u = rng();
      if (u < rules.missPct / 100 + dodge) {
        e.misses++;
        return;
      }
      e.hits++;
      const speed = rules.petAttackSpeed;
      let amount = (rules.petBaseDamage + ((d.rangedAp * rules.petApFromRap) / 14) * speed + rules.petAbilityDps * speed) * armorMult;
      amount *= (1 + fx.unleashedFuryPct / 100) * (t < bwUntil ? 1.5 : 1) * allMult * schoolMult('physical');
      if (u < rules.missPct / 100 + dodge + rules.glancingPct / 100) amount *= 1 - rules.glancingPenaltyPct / 100;
      else if (rng() < Math.max(0, rules.petCritPct + fx.ferocityPct - rules.critSuppressionPct) / 100) {
        amount *= 2;
        e.crits++;
        if (fx.frenzyChance && rng() < fx.frenzyChance / 100) frenzyUntil = t + 8;
      }
      rec.add('pet', amount, t);
    };

    const hawkAttack = () => {
      const s = sp('summonHawk');
      const e = rec.entry('summonHawk');
      e.hits++;
      const base = s.directMin! + (fx.ferocityPct ? 16 : 0) + (fx.unleashedFuryPct ? 4 : 0) + (s.directCoeff ?? 0) * d.rangedAp;
      let amount = base * (1 + fx.unleashedFuryPct / 100) * armorMult * allMult * schoolMult('physical');
      if (rng() < Math.max(0, rules.petCritPct + fx.ferocityPct - rules.critSuppressionPct) / 100) {
        amount *= 2;
        e.crits++;
      }
      rec.add('summonHawk', amount, t);
    };

    const advance = (dt: number) => {
      const end = t + dt;
      for (;;) {
        let next = end;
        let what = '';
        const consider = (at: number, id: string) => {
          if (at < next - EPS) {
            next = at;
            what = id;
          }
        };
        if (!melee) consider(Math.max(nextAuto, castEnd), 'auto');
        else consider(nextMelee, 'melee');
        if (pet) consider(nextPet, 'pet');
        hawks.forEach((h, i) => consider(h.next, `hawk${i}`));
        for (const [k, dot] of dots) consider(dot.next, `dot:${k}`);
        mana = Math.min(d.maxMana, mana + regen(next - t));
        t = next;
        if (!what) break;
        if (t > fightLength + EPS) break;
        if (what === 'auto') {
          const dmg = weaponHit(ranged, d.rangedAp, true) * (1 + fx.rangedWeaponSpecPct / 100);
          rec.entry('autoShot').casts++;
          if (attack('autoShot', dmg, 'ranged') > 0 && o.aspectOfTheHawk && fx.deadlyAspectsChance && rng() < fx.deadlyAspectsChance / 100) deadlyUntil = t + 12;
          nextAuto = t + rangedSpeed();
        } else if (what === 'melee') {
          if (raptorQueued) {
            raptorQueued = false;
            const s = sp('raptorStrike');
            rec.entry('raptorStrike').casts++;
            attack('raptorStrike', weaponHit(mw, d.meleeAp, false) + s.directMin!, 'special', 'physical', fx.savageStrikesPct);
          } else {
            rec.entry('melee').casts++;
            attack('melee', weaponHit(mw, d.meleeAp, false), 'white');
          }
          nextMelee = t + meleeSpeed();
        } else if (what === 'pet') {
          petAttack();
          nextPet = t + rules.petAttackSpeed / (t < frenzyUntil ? 1 + fx.frenzySpeed / 100 : 1) / haste;
        } else if (what.startsWith('hawk')) {
          const h = hawks[Number(what.slice(4))];
          hawkAttack();
          h.next = t + rules.hawkAttackInterval;
          if (h.next > h.end + EPS) hawks.splice(hawks.indexOf(h), 1);
        } else {
          const id = what.slice(4);
          const dot = dots.get(id)!;
          rec.entry(id).ticks++;
          rec.add(id, dot.tick * allMult * schoolMult(id === 'serpentSting' ? 'nature' : 'physical'), t);
          dot.ticksLeft--;
          dot.next += dot.interval;
          if (dot.ticksLeft <= 0) dots.delete(id);
        }
      }
    };

    /** Lance une technique : coût, temps de recharge, temps de recharge global. */
    const use = (s: SpellDef, cd = s.cooldown ?? 0) => {
      mana -= cost(s);
      lastSpend = t;
      if (cd) ready.set(s.id, t + cd);
      gcdReady = t + rules.gcd / haste;
      rec.entry(s.id).casts++;
    };
    const affordable = (s: SpellDef) => mana >= cost(s);
    const shot = (s: SpellDef) => {
      const dmg = (weaponHit(ranged, d.rangedAp, true) + s.directMin!) * (1 + fx.rangedWeaponSpecPct / 100) * (s.id === 'sniperShot' ? 1 : 1 + fx.barragePct / 100);
      attack(s.id, dmg, 'ranged');
    };

    // Choisit et lance la prochaine technique sous temps de recharge global ; renvoie un résultat faux s'il n'y a rien à faire.
    const sting = sp('serpentSting');
    const mb = sp('mongooseBite');
    const sk = sp('striderKick');
    const rs = sp('raptorStrike');
    const hawk = sp('summonHawk');
    const sniper = sp('sniperShot');
    const arcane = sp('arcaneShot');
    const steps: Record<string, StepImpl<boolean>> = {
      serpentSting: {
        when: () => o.serpentSting && !dots.has('serpentSting') && affordable(sting),
        run: () => {
          use(sting);
          if (rng() >= miss) {
            rec.entry('serpentSting').hits++;
            const total = (sting.dotTotal! + (sting.dotCoeff ?? 0) * d.rangedAp) * (1 + fx.improvedStingsPct / 100);
            dots.set('serpentSting', { ticksLeft: sting.dotTicks!, interval: sting.dotDuration! / sting.dotTicks!, next: t + sting.dotDuration! / sting.dotTicks!, tick: total / sting.dotTicks! });
          } else rec.entry('serpentSting').misses++;
          return true;
        },
      },
      mongooseBite: {
        when: () => melee && o.mongooseBite && t < mongooseUntil && isReady('mongooseBite') && affordable(mb),
        run: () => {
          use(mb);
          mongooseUntil = -1;
          const dmg = attack('mongooseBite', weaponHit(mw, d.meleeAp, false) + mb.directMin!, 'special', 'physical', fx.savageStrikesPct);
          if (dmg > 0 && fx.laceratingPct) {
            const ticks = Math.max(1, Math.round(fx.laceratingSec / 3));
            dots.set('laceratingStrikes', { ticksLeft: ticks, interval: 3, next: t + 3, tick: (dmg * fx.laceratingPct) / 100 / ticks / allMult });
          }
          return true;
        },
      },
      striderKick: {
        when: () => melee && o.striderKick && fx.striderKick && isReady('striderKick') && affordable(sk),
        run: () => {
          use(sk);
          attack('striderKick', weaponHit(mw, d.meleeAp, false), 'special', 'physical', fx.savageStrikesPct);
          return true;
        },
      },
      raptorStrike: {
        when: () => melee && o.raptorStrike && !raptorQueued && isReady('raptorStrike') && affordable(rs),
        run: () => {
          // Attaque du raptor : remplace le prochain coup blanc, sans temps de recharge global.
          mana -= cost(rs);
          lastSpend = t;
          ready.set('raptorStrike', t + (rs.cooldown ?? 6));
          raptorQueued = true;
          return false;
        },
      },
      summonHawk: {
        when: () => o.summonHawk && fx.summonHawk && hawks.length < 2 && isReady('arcaneShot') && affordable(hawk),
        run: () => {
          use(hawk, 0);
          ready.set('arcaneShot', t + (hawk.cooldown ?? 6));
          hawks.push({ next: t + 0.5, end: t + 18 });
          return true;
        },
      },
      sniperShot: {
        when: () => o.sniperShot && fx.sniperShot && isReady('sniperShot') && affordable(sniper),
        run: () => {
          use(sniper);
          castEnd = t + sniper.castTime / haste;
          advance(sniper.castTime / haste);
          if (t <= fightLength + EPS) shot(sniper);
          return true;
        },
      },
      sixSecondShot: {
        when: () => o.sixSecondShot !== 'none' && isReady('sixSecond') && affordable(sp(o.sixSecondShot)),
        run: () => {
          const s = sp(o.sixSecondShot);
          use(s, 0);
          ready.set('sixSecond', t + (s.cooldown ?? 6));
          if (s.castTime > 0) {
            castEnd = t + s.castTime / haste;
            advance(s.castTime / haste);
            if (t > fightLength + EPS) return true;
          }
          shot(s);
          return true;
        },
      },
      arcaneShot: {
        when: () => o.arcaneShot && isReady('arcaneShot') && affordable(arcane),
        run: () => {
          use(arcane, 0);
          ready.set('arcaneShot', t + (arcane.cooldown ?? 6) - fx.improvedArcaneShotSec);
          attack('arcaneShot', arcane.directMin! + (arcane.directCoeff ?? 0) * d.rangedAp, 'ranged', 'arcane');
          return true;
        },
      },
    };
    const act = makePriority(HUNTER_STEPS[spec], steps, config.priority, { time: () => t, fightLength, resource: () => mana, resourceMax: () => d.maxMana });

    while (t < fightLength - EPS) {
      // Hors temps de recharge global : Tir rapide, Courroux bestial, potion.
      if (o.rapidFire && isReady('rapidFire')) {
        rapidUntil = t + 15;
        ready.set('rapidFire', t + 300 - fx.rapidKillingMin * 60);
        rec.entry('rapidFire').casts++;
      }
      if (pet && o.bestialWrath && fx.bestialWrath && isReady('bestialWrath')) {
        bwUntil = t + 18;
        ready.set('bestialWrath', t + 120);
        rec.entry('bestialWrath').casts++;
      }
      if (o.manaPotions && t >= potionReady && d.maxMana - mana >= 2250) {
        mana += 1350 + rng() * 900;
        potionReady = t + 120;
      }
      if (t < gcdReady - EPS) {
        advance(gcdReady - t);
        continue;
      }
      if (act()) continue;
      // Rien à lancer : on attend le prochain événement (tir automatique, coup, recharge).
      const waits = [...ready.values()].filter((r) => r > t + EPS);
      const nextReady = waits.length ? Math.min(...waits) : t + 0.5;
      if (mana < 300 && oomAt === fightLength) oomAt = t;
      advance(Math.max(0.1, Math.min(nextReady - t, 0.5)));
    }
    rec.extra('manaEnd', mana);
    rec.extra('oomAt', oomAt);
    rec.endFight();
  }
  return rec.finish();
}

export function hunterWeightSpec(spec: HunterSpec): { deltas: Partial<Record<keyof Stats, number>>; base: keyof Stats } {
  const deltas: Partial<Record<keyof Stats, number>> = { attackPower: 60, agility: 30, critPct: 1, hitPct: 1, intellect: 30, weaponDps: 5 };
  if (spec === 'surv') deltas.strength = 30;
  return { deltas, base: 'attackPower' };
}
