import { ROGUE_DATA, type RogueOptions, type RogueRules, type RogueSpec } from '../data/rogue/data';
import { emptyMods, type SimModifiers, type SpellDef, type Stats, type WeaponInfo } from '../data/types';
import { armorReduction } from './paladinSim';
import { createRng } from './rng';
import { createRecorder, type SimResult } from './simTypes';
import { rank, type TalentPoints } from './talents';

// Simulateur du voleur Forever : énergie, points de combo, deux armes, poisons, Surin (Shank),
// Débiter, Éviscération et Rupture ; Estropier (Assassinat), Attaque pernicieuse (Combat), Hémorragie (Finesse).

export interface RogueSimConfig {
  classId: 'rogue';
  spec: RogueSpec;
  rules: RogueRules;
  spells: SpellDef[];
  gear: Stats;
  mods?: SimModifiers;
  talents: TalentPoints;
  options: RogueOptions;
  weapon?: WeaponInfo | null;
  offHand?: WeaponInfo | null;
  fightLength: number;
  iterations: number;
  seed: number;
}

const EPS = 1e-9;
/** Armes par défaut quand aucune n'est équipée (ordre de grandeur d'un début de raid). */
export const DEFAULT_ROGUE_MH: WeaponInfo = { min: 80, max: 150, speed: 2.6, twoHand: false };
export const DEFAULT_ROGUE_OH: WeaponInfo = { min: 55, max: 100, speed: 1.8, twoHand: false };

export function rogueTalents(t: TalentPoints) {
  const v = (key: string, re: RegExp) => ROGUE_DATA.talentValue(key, rank(t, key), re);
  return {
    malicePct: v('malice', /by (\d+)%/),
    ruthlessnessChance: v('ruthlessness', /a (\d+)% chance/),
    improvedSndPct: v('improvedSliceAndDice', /by (\d+)%/),
    vigor: v('vigor', /by (\d+)\./),
    ruptureExtraSec: v('bloodSplatter', /Rupture ability by (\d+) sec/),
    lethalityPct: v('lethality', /by (\d+)%/),
    vilePoisonsPct: v('vilePoisons', /by (\d+)%/),
    coldBlood: rank(t, 'coldBlood') > 0,
    improvedPoisonsPct: v('improvedPoisons', /by (\d+)%/),
    relentlessPct: v('relentlessStrikes', /a (\d+)% chance/),
    venom: rank(t, 'venom') > 0,
    sealFateChance: v('sealFate', /a (\d+)% chance/),
    mutilate: rank(t, 'mutilate') > 0,
    coupDeGracePct: v('coupDeGrace', /by (\d+)%/),
    efficientStrikes: v('efficientStrikes', /by (\d+)\./),
    puncturingBackstabPct: v('puncturingWounds', /Backstab by (\d+)%/),
    puncturingMutilatePct: v('puncturingWounds', /Mutilate by (\d+)%/),
    puncturingCpChance: v('puncturingWounds', /a (\d+)% chance/),
    precisionPct: v('precision', /by (\d+)%/),
    flawlessExecution: v('flawlessExecution', /by (\d+)\./),
    weaponExpertisePct: v('weaponExpertise', /by (\d+)%/),
    aggressionPct: v('aggression', /by (\d+)%/),
    dualWieldPct: v('dualWieldSpecialization', /by (\d+)%/),
    bladeFlurry: rank(t, 'bladeFlurry') > 0,
    hackAndSlashPct: v('hackAndSlash', /a (\d+)% chance/),
    hackAndSlashArmorPct: v('hackAndSlash', /ignore (\d+)%/),
    flashOfSteelEnergy: v('flashOfSteel', /by (\d+) and/),
    flashOfSteelSec: v('flashOfSteel', /by ([\d.]+) sec/),
    adrenalineRush: rank(t, 'adrenalineRush') > 0,
    opportunityPct: v('opportunity', /by (\d+)%/),
    serratedArmorPct: v('serratedBlades', /ignore (\d+)%/),
    serratedRupturePct: v('serratedBlades', /Rupture ability by (\d+)%/),
    hemorrhage: rank(t, 'hemorrhage') > 0,
    bootKnifeChance: v('bootKnife', /a (\d+)% chance/),
  };
}

export function deriveRogue(rules: RogueRules, gear: Stats, talents: TalentPoints, mods: SimModifiers = emptyMods(), o?: Pick<RogueOptions, 'weaponType'>) {
  const fx = rogueTalents(talents);
  const sm = mods.statMult;
  const agility = (rules.baseAgility + (gear.agility ?? 0)) * sm;
  const strength = (rules.baseStrength + (gear.strength ?? 0)) * sm;
  const stamina = (rules.baseStamina + gear.stamina) * sm * mods.staminaMult;
  const daggerCrit = o && (o.weaponType === 'dagger' || o.weaponType === 'fist') ? fx.hackAndSlashPct : 0;
  const hitPct = gear.hitPct + fx.precisionPct;
  return {
    agility,
    strength,
    stamina,
    attackPower: rules.baseAttackPower + strength + agility + (gear.attackPower ?? 0),
    critPct: rules.baseCritPct + agility / rules.agiPerCritPct + gear.critPct + fx.malicePct + daggerCrit,
    hitPct,
    hitToCap: Math.max(0, rules.missPct - hitPct),
    maxEnergy: rules.maxEnergy + fx.vigor,
    maxHealth: rules.baseHealth + stamina * rules.healthPerSta + mods.maxHealth,
  };
}

interface Dot {
  ticksLeft: number;
  next: number;
  interval: number;
  tick: number;
}

export function simulateRogue(config: RogueSimConfig): SimResult {
  const { rules, options: o, fightLength } = config;
  const mods = config.mods ?? emptyMods();
  const fx = rogueTalents(config.talents);
  const d = deriveRogue(rules, config.gear, config.talents, mods, o);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);
  const haste = 1 + mods.hastePct / 100;
  const mh = config.weapon ?? DEFAULT_ROGUE_MH;
  const oh = config.offHand === undefined ? DEFAULT_ROGUE_OH : config.offHand;
  const isSword = o.weaponType === 'sword';
  const armorIgnore = (fx.serratedArmorPct + (o.weaponType === 'mace' ? fx.hackAndSlashArmorPct : 0)) / 100;
  const armorMult = 1 - armorReduction(Math.max(0, rules.bossArmor - mods.armorReduction) * (1 - armorIgnore), rules.level);
  const allMult = mods.dmgMult.all ?? 1;
  const schoolMult = (s: string) => mods.dmgMult[`school:${s}`] ?? 1;
  const specialMiss = Math.max(0, rules.missPct - d.hitPct) / 100;
  const whiteMiss = Math.max(0, (oh ? rules.dwMissPct : rules.missPct) - d.hitPct) / 100;
  const dodge = Math.max(0, rules.bossDodgePct - fx.weaponExpertisePct) / 100;
  const crit = Math.max(0, d.critPct - rules.critSuppressionPct) / 100;
  const ohMult = (rules.offHandPct / 100) * (1 + fx.dualWieldPct / 100);
  const lethal = new Set(['sinisterStrike', 'backstab', 'mutilate', 'hemorrhage']);
  const builderCost = (id: string) => sp(id).manaCost - (id === 'sinisterStrike' || id === 'hemorrhage' ? fx.efficientStrikes : 0);
  const eviscerateCost = sp('eviscerate').manaCost - fx.flawlessExecution;
  const shankCd = (sp('shank').cooldown ?? 10) - fx.flashOfSteelSec;
  const builder = o.builder === 'mutilate' && !fx.mutilate ? 'sinisterStrike' : o.builder === 'hemorrhage' && !fx.hemorrhage ? 'sinisterStrike' : o.builder;
  const weaponRoll = (w: WeaponInfo, ap: number) => w.min + rng() * (w.max - w.min) + mods.weaponDamage + (ap / 14) * w.speed;

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let energy = d.maxEnergy;
    let cp = 0;
    let gcdReady = 0;
    let nextMh = 0;
    let nextOh = oh ? 0.2 : Infinity;
    let sndUntil = -1;
    let arUntil = -1;
    let bfUntil = -1;
    let venomUntil = -1;
    let hemoUntil = -1;
    let coldBloodUp = false;
    let deadlyStacks = 0;
    let deadlyUntil = -1;
    let nextDeadly = Infinity;
    const ready = new Map<string, number>();
    const dots = new Map<string, Dot>();

    const isReady = (id: string) => (ready.get(id) ?? 0) <= t + EPS;
    const energyRate = () => rules.energyPerSecond * (t < arUntil ? 2 : 1);
    const gain = (n: number) => {
      energy = Math.min(d.maxEnergy, energy + n);
    };
    const speedMult = () => (t < sndUntil ? 1.3 : 1) * (t < bfUntil ? 1.2 : 1) * haste;
    const poisonMult = () => (1 + fx.vilePoisonsPct / 100) * (t < venomUntil ? 1.3 : 1) * allMult * schoolMult('nature');
    const poisonBonus = () => fx.improvedPoisonsPct + (t < venomUntil ? 20 : 0);

    /** Poisons : Instantané sur la main droite, Mortel (cumulable) sur la main gauche. */
    const poison = (hand: 'mh' | 'oh') => {
      if (hand === 'mh' && o.instantPoison && rng() < (rules.instantPoisonChance + poisonBonus()) / 100) {
        const s = sp('instantPoison');
        const e = rec.entry('instantPoison');
        if (rng() < specialMiss) {
          e.misses++;
          return;
        }
        e.hits++;
        let amount = (s.directMin! + rng() * (s.directMax! - s.directMin!)) * poisonMult();
        if (rng() < crit) {
          amount *= 1.5;
          e.crits++;
        }
        rec.add('instantPoison', amount, t);
      }
      if (hand === 'oh' && o.deadlyPoison && rng() < (rules.deadlyPoisonChance + poisonBonus()) / 100) {
        if (rng() < specialMiss) {
          rec.entry('deadlyPoison').misses++;
          return;
        }
        rec.entry('deadlyPoison').hits++;
        if (deadlyStacks === 0) nextDeadly = t + 3;
        deadlyStacks = Math.min(rules.deadlyPoisonStacks, deadlyStacks + 1);
        deadlyUntil = t + 12;
      }
    };

    /** Résolution d'un coup : raté, esquive, éraflure (coups blancs), critique. Renvoie les dégâts (0 si évité). */
    const strike = (id: string, base: number, kind: 'white' | 'special', opts: { critBonus?: number; critMult?: number; canMiss?: boolean } = {}) => {
      const e = rec.entry(id);
      const miss = opts.canMiss === false ? 0 : kind === 'white' ? whiteMiss : specialMiss;
      const u = rng();
      if (u < miss + dodge) {
        e.misses++;
        return { dmg: 0, crit: false };
      }
      e.hits++;
      let amount = base * armorMult * allMult * schoolMult('physical');
      let isCrit = false;
      if (kind === 'white' && u < miss + dodge + rules.glancingPct / 100) amount *= 1 - rules.glancingPenaltyPct / 100;
      else if (rng() < crit + (opts.critBonus ?? 0) / 100) {
        amount *= opts.critMult ?? rules.critMultiplier;
        e.crits++;
        isCrit = true;
      }
      rec.add(id, amount, t);
      return { dmg: amount, crit: isCrit };
    };

    const swing = (hand: 'mh' | 'oh', id = hand === 'mh' ? 'melee' : 'offHand') => {
      const w = hand === 'mh' ? mh : oh!;
      rec.entry(id).casts++;
      const r = strike(id, weaponRoll(w, d.attackPower) * (hand === 'oh' ? ohMult : 1), 'white');
      if (r.dmg > 0) {
        poison(hand);
        if (isSword && hand === 'mh' && fx.hackAndSlashPct && rng() < fx.hackAndSlashPct / 100) swing('mh', 'extraAttack');
      }
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
        consider(nextMh, 'mh');
        if (oh) consider(nextOh, 'oh');
        if (deadlyStacks > 0) consider(nextDeadly, 'deadly');
        for (const [k, dot] of dots) consider(dot.next, `dot:${k}`);
        gain(energyRate() * (next - t));
        t = next;
        if (!what || t > fightLength + EPS) break;
        if (what === 'mh') {
          swing('mh');
          nextMh = t + mh.speed / speedMult();
        } else if (what === 'oh') {
          swing('oh');
          nextOh = t + oh!.speed / speedMult();
        } else if (what === 'deadly') {
          if (t > deadlyUntil + EPS) {
            deadlyStacks = 0;
            nextDeadly = Infinity;
            continue;
          }
          const e = rec.entry('deadlyPoison');
          e.ticks++;
          rec.add('deadlyPoison', sp('deadlyPoison').dotTotal! * deadlyStacks * poisonMult(), t);
          nextDeadly = t + 3;
        } else {
          const id = what.slice(4);
          const dot = dots.get(id)!;
          rec.entry(id).ticks++;
          const hemo = t < hemoUntil ? 1.15 : 1;
          // Les saignements ignorent l'armure.
          rec.add(id, dot.tick * hemo * allMult * schoolMult('physical'), t);
          dot.ticksLeft--;
          dot.next += dot.interval;
          if (dot.ticksLeft <= 0) dots.delete(id);
        }
      }
    };
    const addCp = (n: number) => {
      cp = Math.min(5, cp + n);
    };
    const spend = (cost: number) => {
      energy -= cost;
      gcdReady = t + rules.gcd + rules.latency;
    };
    /** Fin de coup de grâce : Frappes implacables (énergie) et Némésis (point de combo). */
    const finish = (used: number) => {
      if (fx.relentlessPct && rng() < (fx.relentlessPct * used) / 100) gain(25);
      cp = fx.ruthlessnessChance && rng() < fx.ruthlessnessChance / 100 ? 1 : 0;
    };
    const critMultFor = (id: string) => 1 + (rules.critMultiplier - 1) * (1 + (lethal.has(id) ? fx.lethalityPct : 0) / 100);

    const useBuilder = (): boolean => {
      const cost = builderCost(builder);
      if (energy < cost) return false;
      spend(cost);
      const s = sp(builder);
      rec.entry(builder).casts++;
      const cb = coldBloodUp && builder !== 'hemorrhage' ? 100 : 0;
      if (cb) coldBloodUp = false;
      if (builder === 'mutilate') {
        const poisoned = deadlyStacks > 0 ? 1.2 : 1;
        const mult = (1 + fx.opportunityPct / 100) * poisoned;
        const bonus = fx.puncturingMutilatePct + cb;
        const a = strike('mutilate', (weaponRoll(mh, d.attackPower) * s.directCoeff! + s.directMin!) * mult, 'special', { critBonus: bonus, critMult: critMultFor('mutilate') });
        if (a.dmg === 0) return true;
        poison('mh');
        const b = oh ? strike('mutilate', (weaponRoll(oh, d.attackPower) * s.directCoeff! + s.directMin!) * mult, 'special', { critBonus: bonus, critMult: critMultFor('mutilate'), canMiss: false }) : { dmg: 0, crit: false };
        if (b.dmg > 0) poison('oh');
        addCp(2 + ((a.crit || b.crit) && rng() < fx.sealFateChance / 100 ? 1 : 0));
        return true;
      }
      let mult = 1;
      let bonus = cb;
      if (builder === 'sinisterStrike') mult *= 1 + fx.aggressionPct / 100;
      if (builder === 'backstab') {
        mult *= 1 + fx.opportunityPct / 100;
        bonus += fx.puncturingBackstabPct;
      }
      const coeff = builder === 'hemorrhage' && o.weaponType === 'dagger' ? 1.45 : s.directCoeff!;
      const r = strike(builder, (weaponRoll(mh, d.attackPower) * coeff + s.directMin!) * mult, 'special', { critBonus: bonus, critMult: critMultFor(builder) });
      if (r.dmg === 0) return true;
      poison('mh');
      if (builder === 'hemorrhage') hemoUntil = t + 15;
      let n = 1;
      if (r.crit && rng() < fx.sealFateChance / 100) n++;
      if (builder === 'backstab' && rng() < fx.puncturingCpChance / 100) n++;
      addCp(n);
      return true;
    };

    const act = (): boolean => {
      // Surin : main gauche, rend de l'énergie (L'éclat de l'acier) et des points de combo (Couteau de jet).
      if (o.shank && oh && isReady('shank') && energy >= sp('shank').manaCost) {
        spend(sp('shank').manaCost);
        ready.set('shank', t + shankCd);
        rec.entry('shank').casts++;
        const r = strike('shank', weaponRoll(oh, d.attackPower) * sp('shank').directCoeff!, 'special', { canMiss: false });
        gain(25 + fx.flashOfSteelEnergy);
        if (fx.venom) venomUntil = t + 6;
        if (r.dmg > 0) poison('oh');
        if (fx.bootKnifeChance && rng() < fx.bootKnifeChance / 100) addCp(2);
        return true;
      }
      if (o.sliceAndDice && t >= sndUntil - 1 && cp >= 1 && (cp >= 2 || t >= sndUntil) && energy >= sp('sliceAndDice').manaCost) {
        spend(sp('sliceAndDice').manaCost);
        rec.entry('sliceAndDice').casts++;
        sndUntil = t + (9 + 3 * (cp - 1)) * (1 + fx.improvedSndPct / 100);
        finish(cp);
        return true;
      }
      if (o.bladeFlurry && fx.bladeFlurry && isReady('bladeFlurry') && energy >= 25) {
        spend(25);
        bfUntil = t + 15;
        ready.set('bladeFlurry', t + 120);
        rec.entry('bladeFlurry').casts++;
        return true;
      }
      if (cp >= Math.max(1, Math.min(5, o.finisherCp))) {
        const rup = sp('rupture');
        if (o.rupture && !dots.has('rupture') && energy >= rup.manaCost) {
          spend(rup.manaCost);
          rec.entry('rupture').casts++;
          if (rng() < specialMiss + dodge) rec.entry('rupture').misses++;
          else {
            rec.entry('rupture').hits++;
            const dur = 8 + 2 * (cp - 1) + fx.ruptureExtraSec;
            const total = ((rup.dotTotal! * (4 + cp)) / 8 + (rules.ruptureApAt5 * d.attackPower * cp) / 5) * (1 + fx.serratedRupturePct / 100) * (dur / (8 + 2 * (cp - 1)));
            const ticks = Math.round(dur / 2);
            dots.set('rupture', { ticksLeft: ticks, interval: 2, next: t + 2, tick: total / ticks });
          }
          finish(cp);
          return true;
        }
        if (energy >= eviscerateCost) {
          spend(eviscerateCost);
          const s = sp('eviscerate');
          rec.entry('eviscerate').casts++;
          const cb = coldBloodUp ? 100 : 0;
          coldBloodUp = false;
          const base = s.directMin! + rng() * (s.directMax! - s.directMin!) + 170 * (cp - 1) + rules.eviscerateApPerCp * d.attackPower * cp;
          strike('eviscerate', base * (1 + fx.coupDeGracePct / 100) * (1 + fx.aggressionPct / 100), 'special', { critBonus: cb });
          finish(cp);
          return true;
        }
        return false;
      }
      return useBuilder();
    };

    while (t < fightLength - EPS) {
      if (o.adrenalineRush && fx.adrenalineRush && isReady('adrenalineRush')) {
        arUntil = t + 15;
        ready.set('adrenalineRush', t + 300);
        rec.entry('adrenalineRush').casts++;
      }
      if (o.coldBlood && fx.coldBlood && !coldBloodUp && isReady('coldBlood')) {
        coldBloodUp = true;
        ready.set('coldBlood', t + 180);
        rec.entry('coldBlood').casts++;
      }
      if (t < gcdReady - EPS) {
        advance(gcdReady - t);
        continue;
      }
      if (act()) continue;
      // Pas assez d'énergie : on attend un peu (les coups blancs continuent).
      advance(Math.max(0.05, Math.min(0.5, 10 / energyRate())));
    }
    rec.endFight();
  }
  return rec.finish();
}

export function rogueWeightSpec(): { deltas: Partial<Record<keyof Stats, number>>; base: keyof Stats } {
  return { deltas: { attackPower: 60, agility: 30, strength: 30, critPct: 1, hitPct: 1, weaponDps: 5 }, base: 'attackPower' };
}
