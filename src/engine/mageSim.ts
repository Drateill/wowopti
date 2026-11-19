import { FROSTFIRE, MAGE_DATA, type MageOptions, type MageRules, type MageSpec } from '../data/mage/data';
import { emptyMods, type SimModifiers, type SpellDef, type Stats } from '../data/types';
import { createRng } from './rng';
import { createRecorder, type SimResult } from './simTypes';
import { rank, type TalentPoints } from './talents';

// Simulateur du mage Forever : Arcanes (Explosion, Courroux, Projectiles), Feu (Brûlure, Trait de feu,
// Explosion pyrotechnique, Enflammer) et Givre (Éclair de givre, Javelot de glace, Barrière de glace).

export interface MageSimConfig {
  classId: 'mage';
  spec: MageSpec;
  rules: MageRules;
  spells: SpellDef[];
  gear: Stats;
  mods?: SimModifiers;
  talents: TalentPoints;
  options: MageOptions;
  fightLength: number;
  iterations: number;
  seed: number;
}

const EPS = 1e-9;
/** Capacités de base du mage Forever (sans talent) : Glace perçante +2 % givre, Focalisation des arcanes +2 % toucher. */
const PIERCING_ICE = 0.02;
const ARCANE_FOCUS = 2;
/** Barrière de glace : +15 % de dégâts de givre, +5 % tant que le bouclier tient (infobulle Forever). */
const ICE_BARRIER_BONUS = 0.2;

export function mageTalents(t: TalentPoints) {
  const v = (key: string, re: RegExp) => MAGE_DATA.talentValue(key, rank(t, key), re);
  return {
    arcaneConcentrationPct: v('arcaneConcentration', /a (\d+)% chance of entering/),
    barrageBlastPct: v('missileBarrage', /Arcane Blast spell a (\d+)% chance/),
    barrageOtherPct: v('missileBarrage', /Frostfire Bolt spells a (\d+)% chance/),
    arcaneImpactPct: v('arcaneImpact', /by (\d+)%/),
    arcaneBlast: rank(t, 'arcaneBlast') > 0,
    arcaneMeditationPct: v('arcaneMeditation', /Allows (\d+)%/),
    arcaneWrath: rank(t, 'arcaneWrath') > 0,
    presenceOfMind: rank(t, 'presenceOfMind') > 0,
    arcaneMindIntPct: v('arcaneMind', /Intellect by (\d+)%/),
    arcaneMindCritPct: v('arcaneMind', /bonus of your Arcane spells by (\d+)%/),
    instabilityDmgPct: v('arcaneInstability', /spells by (\d+)%/),
    instabilityCritPct: v('arcaneInstability', /critical strike chance by (\d+)%/),
    arcanePower: rank(t, 'arcanePower') > 0,
    incinerationPct: v('incineration', /by (\d+)%/),
    accelerantSec: v('accelerant', /by ([\d.]+) sec/),
    ignitePct: v('ignite', /additional (\d+)% of your spell/),
    pyroblast: rank(t, 'pyroblast') > 0,
    improvedFireBlastSec: v('improvedFireBlast', /by (\d+) sec/),
    scorchChance: v('improvedScorch', /a (\d+)% chance to cause/),
    scorchStackPct: v('improvedScorch', /damage you deal to your target by (\d+)%/),
    heatingUpPct: v('heatingUp', /by (\d+)%, stacking/),
    masterOfElementsPct: v('masterOfElements', /refund (\d+)%/),
    criticalMassPct: v('criticalMass', /by (\d+)%/),
    firePowerPct: v('firePower', /by (\d+)% per/),
    firePowerMax: v('firePower', /maximum increase of (\d+)%/),
    combustion: rank(t, 'combustion') > 0,
    improvedFrostboltSec: v('improvedFrostbolt', /by ([\d.]+) sec/),
    precisionPct: v('precision', /by (\d+)%/),
    iceShardsPct: v('iceShards', /by (\d+)%/),
    frostChannelingPct: v('frostChanneling', /by (\d+)%/),
    iceLance: rank(t, 'iceLance') > 0,
    shatterPct: v('shatter', /by (\d+)%/),
    fingersChance: v('fingersOfFrost', /a (\d+)% chance/),
    fingersCharges: v('fingersOfFrost', /next (\d+) spell/),
    iceBarrier: rank(t, 'iceBarrier') > 0,
  };
}

export function deriveMage(rules: MageRules, gear: Stats, talents: TalentPoints, mods: SimModifiers = emptyMods()) {
  const fx = mageTalents(talents);
  const intellect = (rules.baseIntellect + gear.intellect) * mods.statMult * (1 + fx.arcaneMindIntPct / 100);
  const spirit = (rules.baseSpirit + gear.spirit) * mods.statMult;
  const stamina = (rules.baseStamina + gear.stamina) * mods.statMult * mods.staminaMult;
  const hitPct = gear.hitPct + fx.precisionPct;
  return {
    intellect,
    spirit,
    stamina,
    spellPower: gear.spellPower,
    firePower: gear.spellPower + gear.firePower,
    spellCritPct: rules.baseSpellCritPct + intellect / rules.intPerSpellCritPct + gear.critPct + fx.instabilityCritPct,
    hitPct,
    hitToCap: Math.max(0, rules.spellMissPct - 1 - hitPct),
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
  spell: SpellDef;
}

export function simulateMage(config: MageSimConfig): SimResult {
  const { rules, options: o, fightLength, spec } = config;
  const mods = config.mods ?? emptyMods();
  const fx = mageTalents(config.talents);
  const d = deriveMage(rules, config.gear, config.talents, mods);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);
  const haste = 1 + mods.hastePct / 100;
  const isFire = (s: SpellDef) => s.school === 'fire' || FROSTFIRE.has(s.id);
  const isFrost = (s: SpellDef) => s.school === 'frost' || FROSTFIRE.has(s.id);
  const regenWhileCasting = Math.min(1, (fx.arcaneMeditationPct + (o.mageArmor ? 50 : 0)) / 100);
  const arcaneBlastBase = 0.15 * rules.baseMana;

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let mana = d.maxMana;
    let lastSpend = -10;
    const dots = new Map<string, Dot>();
    const ready = new Map<string, number>();
    let clearcast = false;
    let barrage = false;
    let abStacks = 0;
    let abUntil = -1;
    let fofCharges = 0;
    let fofUntil = -1;
    let heating = 0;
    let heatingUntil = -1;
    let scorchStacks = 0;
    let scorchUntil = -1;
    let barrierUntil = -1;
    let apUntil = -1;
    let pom = false;
    let combustionStacks = 0;
    let combustionCrits = 0;
    let evocationUntil = -1;
    let ignitePool = 0;
    let igniteTicks = 0;
    let igniteNext = Infinity;
    let oomAt = fightLength;

    const isReady = (id: string) => (ready.get(id) ?? 0) <= t + EPS;
    const regenRate = () => {
      if (t < evocationUntil) return d.mp5 / 5 + d.spiritRegen * 16;
      const casting = t - lastSpend < 5;
      return d.mp5 / 5 + d.spiritRegen * (casting ? regenWhileCasting : 1);
    };
    const fireEffects = () => [...dots.keys()].filter((k) => !FROSTFIRE.has(k)).length + (igniteTicks > 0 ? 1 : 0) + (t < scorchUntil ? 1 : 0);

    const mult = (s: SpellDef) => {
      let m = (1 + fx.instabilityDmgPct / 100) * (mods.dmgMult[`school:${s.school}`] ?? 1) * (mods.dmgMult.all ?? 1);
      if (t < apUntil) m *= 1.3;
      if (isFrost(s)) m *= 1 + PIERCING_ICE + (t < barrierUntil ? ICE_BARRIER_BONUS : 0);
      if (isFire(s)) {
        if (t < scorchUntil) m *= 1 + (fx.scorchStackPct * scorchStacks) / 100;
        m *= 1 + Math.min(fx.firePowerMax, fx.firePowerPct * fireEffects()) / 100;
      }
      return m;
    };
    const critBonus = (s: SpellDef) =>
      Math.max(s.school === 'arcane' ? fx.arcaneMindCritPct : 0, isFrost(s) ? fx.iceShardsPct : 0);
    const critChance = (s: SpellDef, frozen: boolean) => {
      let c = d.spellCritPct;
      if (s.school === 'arcane') c += fx.arcaneImpactPct;
      if (isFire(s)) c += fx.criticalMassPct + combustionStacks * 10;
      if (['fireBlast', 'iceLance', 'arcaneBlast', 'scorch'].includes(s.id)) c += fx.incinerationPct;
      if (frozen) c += fx.shatterPct;
      return Math.min(100, c) / 100;
    };
    const hitChance = (s: SpellDef) => 1 - Math.max(1, rules.spellMissPct - d.hitPct - (s.school === 'arcane' ? ARCANE_FOCUS : 0)) / 100;
    const power = (s: SpellDef) => (isFire(s) ? d.firePower : d.spellPower) + (s.id === 'arcaneWrath' ? 0.05 * d.maxMana : 0);
    const costOf = (s: SpellDef) => {
      if (clearcast && s.id !== 'iceBarrier') return 0;
      if (s.id === 'arcaneMissiles' && barrage) return 0;
      let c = s.id === 'arcaneBlast' ? arcaneBlastBase * (1 + (t < abUntil ? abStacks : 0)) : s.manaCost;
      if (isFrost(s)) c *= 1 - fx.frostChannelingPct / 100;
      if (t < apUntil) c *= 1.3;
      return c;
    };

    const advance = (dt: number) => {
      const end = t + dt;
      for (;;) {
        let next = end;
        let id = '';
        for (const [k, dot] of dots) if (dot.next < next - EPS) {
          next = dot.next;
          id = k;
        }
        if (igniteNext < next - EPS) {
          next = igniteNext;
          id = '__ignite';
        }
        mana = Math.min(d.maxMana, mana + regenRate() * (next - t));
        t = next;
        if (!id) break;
        if (id === '__ignite') {
          const tick = ignitePool / igniteTicks;
          ignitePool -= tick;
          igniteTicks--;
          rec.entry('ignite').ticks++;
          rec.add('ignite', tick, t);
          igniteNext = igniteTicks > 0 ? t + 2 : Infinity;
          continue;
        }
        const dot = dots.get(id)!;
        let amount = dot.tick * mult(dot.spell);
        const e = rec.entry(id);
        e.ticks++;
        if (rules.dotsCanCrit && rng() < critChance(dot.spell, false)) {
          amount *= 1 + (rules.critMultiplier - 1) * (1 + critBonus(dot.spell) / 100);
          e.crits++;
        }
        rec.add(id, amount, t);
        dot.ticksLeft--;
        dot.next += dot.interval;
        if (dot.ticksLeft <= 0) dots.delete(id);
      }
    };

    /** Résout un sort qui touche : dégâts directs, critique et effets déclenchés. */
    const land = (s: SpellDef, frozen: boolean, base: number, scale = 1) => {
      const e = rec.entry(s.id);
      e.hits++;
      let amount = base * mult(s) * scale;
      const crit = rng() < critChance(s, frozen);
      if (crit) {
        amount *= 1 + (rules.critMultiplier - 1) * (1 + critBonus(s) / 100);
        e.crits++;
        if (isFire(s) || isFrost(s)) mana = Math.min(d.maxMana, mana + (s.manaCost * fx.masterOfElementsPct) / 100);
        if (isFire(s) && fx.ignitePct) {
          ignitePool += (amount * fx.ignitePct) / 100;
          igniteTicks = 2;
          if (igniteNext === Infinity) igniteNext = t + 2;
        }
        if (fx.heatingUpPct && ['fireball', 'frostfireBolt', 'fireBlast', 'scorch'].includes(s.id)) {
          heating = Math.min(3, (t < heatingUntil ? heating : 0) + 1);
          heatingUntil = t + 20;
        }
        if (isFire(s) && combustionCrits > 0 && --combustionCrits === 0) combustionStacks = 0;
      }
      if (isFire(s) && combustionCrits > 0) combustionStacks++;
      rec.add(s.id, amount, t);
      return crit;
    };

    const afterHit = (s: SpellDef) => {
      if (fx.arcaneConcentrationPct && rng() < fx.arcaneConcentrationPct / 100) clearcast = true;
      const barrageChance = s.id === 'arcaneBlast' ? fx.barrageBlastPct : ['arcaneWrath', 'fireball', 'frostbolt', 'frostfireBolt'].includes(s.id) ? fx.barrageOtherPct : 0;
      if (barrageChance && rng() < barrageChance / 100) barrage = true;
      // Doigts de givre : les effets de froid (Éclair de givre, Éclair de givrefeu) peuvent geler la cible pour 2 sorts.
      if ((s.id === 'frostbolt' || s.id === 'frostfireBolt') && fx.fingersChance && rng() < fx.fingersChance / 100) {
        fofCharges = fx.fingersCharges;
        fofUntil = t + 15;
      }
    };

    const choose = (): SpellDef => {
      const filler = sp(o.filler);
      if (spec === 'frost') {
        if (o.iceBarrier && fx.iceBarrier && t >= barrierUntil - 1 && isReady('iceBarrier')) return sp('iceBarrier');
        if (o.iceLance && fx.iceLance && fofCharges > 0 && t < fofUntil && isReady('iceLance')) return sp('iceLance');
        return filler;
      }
      if (spec === 'fire') {
        if (o.scorch && fx.scorchChance && (scorchStacks < 5 || scorchUntil - t < 6)) return sp('scorch');
        if (o.pyroblast && fx.pyroblast && heating >= 3 && t < heatingUntil) return sp('pyroblast');
        if (o.fireBlast && isReady('fireBlast')) return sp('fireBlast');
        return o.filler === 'frostbolt' ? sp('fireball') : filler;
      }
      // Arcanes
      if (o.arcaneWrath && fx.arcaneWrath && isReady('arcaneWrath')) return sp('arcaneWrath');
      if (barrage) return sp('arcaneMissiles');
      if (fx.arcaneBlast) {
        const stacks = t < abUntil ? abStacks : 0;
        if (stacks < o.arcaneBlastStacks || mana > (o.arcaneBlastManaFloor / 100) * d.maxMana) return sp('arcaneBlast');
        return sp('arcaneMissiles');
      }
      return filler;
    };

    while (t < fightLength - EPS) {
      // Hors temps de recharge global : temps forts, Évocation, potion.
      if (o.cooldowns) {
        if (fx.arcanePower && isReady('arcanePower')) {
          apUntil = t + 15;
          ready.set('arcanePower', t + 180);
        }
        if (fx.presenceOfMind && isReady('presenceOfMind')) {
          pom = true;
          ready.set('presenceOfMind', t + 180);
        }
        if (fx.combustion && isReady('combustion')) {
          combustionCrits = 3;
          combustionStacks = 0;
          ready.set('combustion', t + 180);
        }
      }
      if (o.manaPotions && isReady('potion') && d.maxMana - mana >= 2250) {
        mana += 1350 + rng() * 900;
        ready.set('potion', t + 120);
      }
      if (o.evocation && isReady('evocation') && mana < 0.15 * d.maxMana && fightLength - t > 20) {
        ready.set('evocation', t + 480);
        evocationUntil = t + 8;
        rec.entry('evocation').casts++;
        advance(8);
        continue;
      }

      const s = choose();
      const cost = costOf(s);
      if (mana < cost) {
        if (oomAt === fightLength) oomAt = t;
        advance(1);
        continue;
      }
      if (cost === 0 && clearcast && s.id !== 'iceBarrier') clearcast = false;
      mana -= cost;
      lastSpend = t;
      const e = rec.entry(s.id);
      e.casts++;
      const frozen = fofCharges > 0 && t < fofUntil;
      if (frozen && s.id !== 'iceBarrier') fofCharges--;
      if (s.cooldown) {
        const cd = s.id === 'fireBlast' ? s.cooldown - fx.improvedFireBlastSec : s.cooldown;
        ready.set(s.id, t + cd);
      }

      if (s.id === 'iceBarrier') {
        barrierUntil = t + 60;
        advance(rules.gcd / haste + rules.latency);
        continue;
      }

      if (s.id === 'arcaneMissiles') {
        const fast = barrage;
        barrage = false;
        const duration = (s.castTime * (fast ? 0.5 : 1)) / haste;
        if (rng() >= hitChance(s)) {
          e.misses++;
          advance(duration + rules.latency);
          continue;
        }
        const ticks = s.dotTicks!;
        const each = (s.dotTotal! + (s.dotCoeff ?? 0) * power(s)) / ticks;
        for (let i = 0; i < ticks; i++) {
          advance(duration / ticks);
          e.ticks++;
          land(s, false, each);
          e.hits--; // un seul « coup » par canalisation : les projectiles sont comptés en ticks
        }
        e.hits++;
        afterHit(s);
        advance(rules.latency);
        continue;
      }

      let cast = s.castTime;
      if (s.id === 'frostbolt') cast -= fx.improvedFrostboltSec;
      if (['fireball', 'frostfireBolt', 'arcaneWrath'].includes(s.id)) cast -= fx.accelerantSec;
      if (s.id === 'pyroblast') {
        cast *= 1 - (fx.heatingUpPct * heating) / 100;
        heating = 0;
      }
      if (pom && cast > rules.gcd) {
        cast = 0;
        pom = false;
      }
      if (s.id === 'arcaneBlast') {
        if (t >= abUntil) {
          abStacks = 0;
          abUntil = t + 18;
        }
      }
      advance(Math.max(rules.gcd / haste, cast / haste) + rules.latency);
      if (t > fightLength + EPS) break;
      if (rng() >= hitChance(s)) {
        e.misses++;
        continue;
      }
      // Explosion des arcanes : chaque charge donne 12 % de l'Intelligence en puissance des sorts.
      const abPower = s.id === 'arcaneBlast' ? 0.12 * d.intellect * abStacks : 0;
      if (s.directMax) {
        const base = s.directMin! + rng() * (s.directMax - s.directMin!) + (s.directCoeff ?? 0) * (power(s) + abPower);
        land(s, frozen, base, s.id === 'iceLance' && frozen ? 4 : 1);
      }
      if (s.dotTotal) {
        const interval = s.dotDuration! / s.dotTicks!;
        dots.set(s.id, { spell: s, ticksLeft: s.dotTicks!, interval, next: t + interval, tick: (s.dotTotal + (s.dotCoeff ?? 0) * power(s)) / s.dotTicks! });
      }
      if (s.id === 'arcaneBlast') abStacks = Math.min(4, abStacks + 1);
      if (s.id === 'scorch' && rng() < fx.scorchChance / 100) {
        scorchStacks = Math.min(5, (t < scorchUntil ? scorchStacks : 0) + 1);
        scorchUntil = t + 30;
      }
      // Échauffement : le Trait de feu donne une charge de plus à chaque fois qu'il touche.
      if (s.id === 'fireBlast' && fx.heatingUpPct) {
        heating = Math.min(3, (t < heatingUntil ? heating : 0) + 1);
        heatingUntil = t + 20;
      }
      afterHit(s);
    }
    rec.extra('manaEnd', mana);
    rec.extra('oomAt', oomAt);
    rec.endFight();
  }
  return rec.finish();
}

export function mageWeightSpec(): { deltas: Partial<Record<keyof Stats, number>>; base: keyof Stats } {
  return { deltas: { spellPower: 30, critPct: 1, hitPct: 1, intellect: 30, spirit: 30, mp5: 10 }, base: 'spellPower' };
}
