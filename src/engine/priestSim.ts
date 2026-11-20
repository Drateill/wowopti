import { PRIEST_DATA, type PriestOptions, type PriestRules, type PriestSpec } from '../data/priest/data';
import { emptyMods, type SimModifiers, type SpellDef, type Stats } from '../data/types';
import { createRng } from './rng';
import { makePriority, type PriorityList, type StepImpl } from './priority';
import { PRIEST_STEPS } from './rotationSteps';
import { createRecorder, type SimResult } from './simTypes';
import { rank, type TalentPoints } from './talents';

// Simulateur du prêtre Forever : Ombre (Mot de l'ombre : Douleur, Attaque mentale, Fouet mental, Peste dévorante),
// Discipline (Mot de pouvoir : Bouclier, Pénitence, Égide divine) et Sacré (Rénovation, Prière de guérison, Soins supérieurs).

export interface PriestSimConfig {
  classId: 'priest';
  spec: PriestSpec;
  rules: PriestRules;
  spells: SpellDef[];
  gear: Stats;
  mods?: SimModifiers;
  talents: TalentPoints;
  options: PriestOptions;
  fightLength: number;
  iterations: number;
  seed: number;
  priority?: PriorityList;
}

const EPS = 1e-9;
/** Sorts instantanés (Disciplines jumelles, Agilité mentale). */
const INSTANT = new Set(['shadowWordPain', 'devouringPlague', 'shadowWordDeath', 'vampiricEmbrace', 'renew', 'powerWordShield', 'prayerOfMending']);
const HEALS = new Set(['greaterHeal', 'heal', 'flashHeal', 'prayerOfHealing', 'renew', 'penance', 'prayerOfMending']);

export function priestTalents(t: TalentPoints) {
  const v = (key: string, re: RegExp) => PRIEST_DATA.talentValue(key, rank(t, key), re);
  return {
    twinDisciplinesPct: v('twinDisciplines', /by (\d+)%/),
    holyPrecisionPct: v('holyPrecision', /by (\d+)%/),
    mentalStrengthPct: v('mentalStrength', /Intellect by (\d+)%/),
    mentalAgilityPct: v('mentalAgility', /by (\d+)%/),
    innerFocus: rank(t, 'innerFocus') > 0,
    improvedShieldPct: v('improvedPowerWordShield', /by (\d+)%/),
    meditationPct: v('meditation', /Allows (\d+)%/),
    soulWardingSec: v('soulWarding', /by (\d+) sec/),
    soulWardingCostPct: v('soulWarding', /mana cost by (\d+)%/),
    penance: rank(t, 'penance') > 0,
    renewedHopeCritPct: v('renewedHope', /gain (\d+)% increased critical/),
    renewedHopeSec: v('renewedHope', /by (\d+) sec/),
    divineAegisPct: v('divineAegis', /absorbing (\d+)%/),
    powerInfusion: rank(t, 'powerInfusion') > 0,
    improvedRenewPct: v('improvedRenew', /by (\d+)%/),
    holySpecializationPct: v('holySpecialization', /by (\d+)%/),
    divineFurySec: v('divineFury', /by ([\d.]+) sec/),
    improvedHealingPct: v('improvedHealing', /by (\d+)%/),
    searingLightPct: v('searingLight', /damage done by (\d+)%/),
    litanyPct: v('litanyOfLight', /equal to (\d+)%/),
    spiritualGuidanceHealPct: v('spiritualGuidance', /healing by up to (\d+)%/),
    spiritualGuidanceDmgPct: v('spiritualGuidance', /spell damage by up to (\d+)%/),
    spiritualHealingPct: v('spiritualHealing', /by (\d+)%/),
    prayerOfMending: rank(t, 'prayerOfMending') > 0,
    shadowFocusPct: v('shadowFocus', /by (\d+)%/),
    improvedMindBlastSec: v('improvedMindBlast', /by ([\d.]+) sec/),
    improvedSwpSec: v('improvedShadowWordPain', /by (\d+) sec/),
    mindFlay: rank(t, 'mindFlay') > 0,
    improvedMindFlayPct: v('improvedMindFlay', /deals (\d+)% more/),
    darkInspirationPct: v('darkInspiration', /Spirit by (\d+)%/),
    vampiricEmbrace: rank(t, 'vampiricEmbrace') > 0,
    shadowWeavingPct: v('shadowWeaving', /by (\d+)% for/),
    shadowWeavingStacks: v('shadowWeaving', /up to (\d+) times/),
    devouringContagionPct: v('devouringContagion', /by (\d+)%/),
    darknessPct: v('darkness', /by (\d+)%/),
    shadowform: rank(t, 'shadowform') > 0,
  };
}

export function derivePriest(rules: PriestRules, gear: Stats, talents: TalentPoints, mods: SimModifiers = emptyMods()) {
  const fx = priestTalents(talents);
  const intellect = (rules.baseIntellect + gear.intellect) * mods.statMult * (1 + fx.mentalStrengthPct / 100);
  const spirit = (rules.baseSpirit + gear.spirit) * mods.statMult;
  const stamina = (rules.baseStamina + gear.stamina) * mods.statMult * mods.staminaMult;
  const spellPower = gear.spellPower + (spirit * fx.spiritualGuidanceDmgPct) / 100;
  return {
    intellect,
    spirit,
    stamina,
    spellPower,
    shadowPower: spellPower + gear.shadowPower,
    healingPower: gear.spellPower + (gear.healingPower ?? 0) + (spirit * fx.spiritualGuidanceHealPct) / 100,
    spellCritPct: rules.baseSpellCritPct + intellect / rules.intPerSpellCritPct + gear.critPct,
    hitPct: gear.hitPct,
    shadowHitPct: gear.hitPct + fx.shadowFocusPct,
    shadowHitToCap: Math.max(0, rules.spellMissPct - 1 - gear.hitPct - fx.shadowFocusPct),
    maxMana: rules.baseMana + intellect * rules.manaPerInt + mods.maxMana,
    maxHealth: rules.baseHealth + stamina * rules.healthPerSta + mods.maxHealth,
    mp5: gear.mp5,
    /** Régénération par l'Esprit, en mana par seconde (hors incantation). */
    spiritRegen: (rules.regenBase + spirit / rules.regenSpiritDivisor) / 2,
  };
}

type Derived = ReturnType<typeof derivePriest>;
type Fx = ReturnType<typeof priestTalents>;

/** Mana : régénération (règle des 5 secondes, Méditation), potions. */
function manaModel(d: Derived, fx: Fx, o: PriestOptions) {
  let lastSpend = -10;
  let potionReady = 0;
  let spiritBonusUntil = -1;
  let spiritBonusPct = 0;
  return {
    spend(t: number) {
      lastSpend = t;
    },
    /** Inspiration sombre : +X % d'Esprit pendant 10 s. */
    inspire(t: number) {
      if (!fx.darkInspirationPct) return;
      spiritBonusUntil = t + 10;
      spiritBonusPct = fx.darkInspirationPct;
    },
    regen(t: number, dt: number) {
      const casting = t - lastSpend < 5;
      const spiritMult = t < spiritBonusUntil ? 1 + spiritBonusPct / 100 : 1;
      return (d.mp5 / 5 + d.spiritRegen * spiritMult * (casting ? fx.meditationPct / 100 : 1)) * dt;
    },
    potion(t: number, mana: number, rng: () => number) {
      if (!o.manaPotions || t < potionReady || d.maxMana - mana < 2250) return 0;
      potionReady = t + 120;
      return 1350 + rng() * 900;
    },
  };
}

export function simulatePriest(config: PriestSimConfig): SimResult {
  return config.spec === 'shadow' ? simulateShadow(config) : simulateHealer(config);
}

/** Ombre : Douleur et Peste entretenues, Attaque mentale en recharge, Fouet mental en remplissage. */
function simulateShadow(config: PriestSimConfig): SimResult {
  const { rules, options: o, fightLength } = config;
  const mods = config.mods ?? emptyMods();
  const fx = priestTalents(config.talents);
  const d = derivePriest(rules, config.gear, config.talents, mods);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);
  const haste = 1 + mods.hastePct / 100;
  const shadowform = fx.shadowform;
  const critMult = (s: SpellDef) => 1 + (rules.critMultiplier - 1) * (s.school === 'shadow' && shadowform ? 2 : 1);

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let mana = d.maxMana;
    const mm = manaModel(d, fx, o);
    const dots = new Map<string, { spell: SpellDef; ticksLeft: number; next: number; interval: number; tick: number }>();
    const ready = new Map<string, number>();
    let weaving = 0;
    let weavingUntil = -1;
    let piUntil = -1;
    let innerFocus = false;
    let veUntil = -1;
    let oomAt = fightLength;

    const isReady = (id: string) => (ready.get(id) ?? 0) <= t + EPS;
    const mult = (s: SpellDef) => {
      let m = (mods.dmgMult[`school:${s.school}`] ?? 1) * (mods.dmgMult.all ?? 1);
      if (s.school === 'shadow') {
        m *= 1 + fx.darknessPct / 100;
        if (shadowform) m *= 1.1;
        if (t < weavingUntil) m *= 1 + (fx.shadowWeavingPct * weaving) / 100;
      } else m *= 1 + fx.searingLightPct / 100;
      if (INSTANT.has(s.id)) m *= 1 + fx.twinDisciplinesPct / 100;
      if (t < piUntil) m *= 1.2;
      return m;
    };
    const critChance = (s: SpellDef, bonus = 0) =>
      Math.min(100, d.spellCritPct + (s.school === 'holy' ? fx.holySpecializationPct : 0) + bonus) / 100;
    const hitChance = (s: SpellDef) =>
      1 - Math.max(1, rules.spellMissPct - d.hitPct - (s.school === 'shadow' ? fx.shadowFocusPct : fx.holyPrecisionPct)) / 100;
    const power = (s: SpellDef) => (s.school === 'shadow' ? d.shadowPower : d.spellPower);
    const costOf = (s: SpellDef) => {
      if (innerFocus && s.id === 'mindBlast') return 0;
      let c = s.manaCost;
      if (INSTANT.has(s.id) || s.id === 'smite') c *= 1 - fx.mentalAgilityPct / 100;
      if (s.id === 'devouringPlague') c *= 1 - fx.devouringContagionPct / 100;
      if (shadowform && s.school === 'shadow') c *= 0.5;
      return c;
    };
    const weave = () => {
      if (!fx.shadowWeavingPct) return;
      weaving = Math.min(fx.shadowWeavingStacks || 5, (t < weavingUntil ? weaving : 0) + 1);
      weavingUntil = t + 15;
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
        mana = Math.min(d.maxMana, mana + mm.regen(t, next - t));
        t = next;
        if (!id) break;
        const dot = dots.get(id)!;
        let amount = dot.tick * mult(dot.spell);
        const e = rec.entry(id);
        e.ticks++;
        if (rules.dotsCanCrit && rng() < critChance(dot.spell)) {
          amount *= critMult(dot.spell);
          e.crits++;
        }
        rec.add(id, amount, t);
        dot.ticksLeft--;
        dot.next += dot.interval;
        if (dot.ticksLeft <= 0) dots.delete(id);
      }
    };

    const filler = () => (fx.mindFlay ? sp('mindFlay') : sp('smite'));
    const steps: Record<string, StepImpl<SpellDef>> = {
      vampiricEmbrace: { when: () => o.vampiricEmbrace && !!fx.vampiricEmbrace && t >= veUntil && isReady('vampiricEmbrace'), run: () => sp('vampiricEmbrace') },
      shadowWordPain: { when: () => !dots.has('shadowWordPain'), run: () => sp('shadowWordPain') },
      devouringPlague: { when: () => o.devouringPlague && isReady('devouringPlague'), run: () => sp('devouringPlague') },
      mindBlast: { when: () => o.mindBlast && isReady('mindBlast'), run: () => sp('mindBlast') },
      shadowWordDeath: { when: () => o.shadowWordDeath && isReady('shadowWordDeath'), run: () => sp('shadowWordDeath') },
      filler: { when: () => true, run: filler },
    };
    const pick = makePriority(PRIEST_STEPS, steps, config.priority, { time: () => t, fightLength, resource: () => mana, resourceMax: () => d.maxMana });
    const choose = (): SpellDef => pick() ?? filler();

    while (t < fightLength - EPS) {
      if (o.powerInfusion && fx.powerInfusion && isReady('powerInfusion')) {
        piUntil = t + 15;
        ready.set('powerInfusion', t + 180);
        rec.entry('powerInfusion').casts++;
      }
      if (o.innerFocus && fx.innerFocus && isReady('innerFocus') && !innerFocus) {
        innerFocus = true;
        ready.set('innerFocus', t + 180);
      }
      mana += mm.potion(t, mana, rng);

      const s = choose()!;
      const cost = costOf(s);
      if (mana < cost) {
        if (oomAt === fightLength) oomAt = t;
        advance(1);
        continue;
      }
      mana -= cost;
      mm.spend(t);
      const e = rec.entry(s.id);
      e.casts++;
      if (s.cooldown) ready.set(s.id, t + s.cooldown - (s.id === 'mindBlast' ? fx.improvedMindBlastSec : 0));

      if (s.id === 'vampiricEmbrace') {
        veUntil = t + 30;
        advance(rules.gcd / haste + rules.latency);
        continue;
      }

      if (s.id === 'mindFlay') {
        const duration = s.castTime / haste;
        if (rng() >= hitChance(s)) {
          e.misses++;
          advance(duration + rules.latency);
          continue;
        }
        e.hits++;
        weave();
        const base = (s.dotTotal! + (s.dotCoeff ?? 0) * power(s)) / s.dotTicks!;
        for (let i = 0; i < s.dotTicks!; i++) {
          advance(duration / s.dotTicks!);
          if (t > fightLength + EPS) break;
          let amount = base * (1 + fx.improvedMindFlayPct / 100) ** i * mult(s);
          e.ticks++;
          if (rules.dotsCanCrit && rng() < critChance(s)) {
            amount *= critMult(s);
            e.crits++;
          }
          rec.add(s.id, amount, t);
        }
        mm.inspire(t);
        advance(rules.latency);
        continue;
      }

      const castTime = s.castTime;
      advance(Math.max(rules.gcd / haste, castTime / haste) + rules.latency);
      if (t > fightLength + EPS) break;
      const focused = innerFocus && s.id === 'mindBlast';
      if (focused) innerFocus = false;
      if (rng() >= hitChance(s)) {
        e.misses++;
        continue;
      }
      e.hits++;
      if (s.school === 'shadow') weave();
      if (s.directMax) {
        let amount = (s.directMin! + rng() * (s.directMax - s.directMin!) + (s.directCoeff ?? 0) * power(s)) * mult(s);
        if (rng() < critChance(s, focused ? 25 : 0)) {
          amount *= critMult(s);
          e.crits++;
        }
        rec.add(s.id, amount, t);
      }
      if (s.dotTotal) {
        const interval = s.dotDuration! / s.dotTicks!;
        const extra = s.id === 'shadowWordPain' ? Math.round(fx.improvedSwpSec / interval) : 0;
        dots.set(s.id, {
          spell: s, ticksLeft: s.dotTicks! + extra, interval, next: t + interval,
          tick: (s.dotTotal + (s.dotCoeff ?? 0) * power(s)) / s.dotTicks!,
        });
      }
      if (s.id === 'mindBlast') mm.inspire(t);
    }
    rec.extra('manaEnd', mana);
    rec.extra('oomAt', oomAt);
    rec.endFight();
  }
  return rec.finish();
}

interface Hot {
  id: string;
  target: number;
  ticksLeft: number;
  interval: number;
  toNext: number;
  tick: number;
  /** Prière de guérison : chaque saut est un soin direct (peut être critique, déclenche l'Égide). */
  direct?: boolean;
}

/** Discipline et Sacré : boucliers, Pénitence, Prière de guérison, Rénovation, puis le soin de remplissage. */
function simulateHealer(config: PriestSimConfig): SimResult {
  const { rules, options: o, fightLength } = config;
  const mods = config.mods ?? emptyMods();
  const fx = priestTalents(config.talents);
  const d = derivePriest(rules, config.gear, config.talents, mods);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);
  const haste = 1 + mods.hastePct / 100;
  const effective = 1 - o.overhealPct / 100;
  const weakenedSoul = Math.max(0, 15 - fx.renewedHopeSec);
  const shieldCd = Math.max(0, (sp('powerWordShield').cooldown ?? 4) - fx.soulWardingSec);
  const activity = Math.max(5, Math.min(100, o.activityPct));

  const costOf = (s: SpellDef, focused: boolean) => {
    if (focused) return 0;
    let c = s.manaCost;
    if (['heal', 'greaterHeal', 'penance', 'prayerOfMending'].includes(s.id)) c *= 1 - fx.improvedHealingPct / 100;
    if (INSTANT.has(s.id)) c *= 1 - fx.mentalAgilityPct / 100;
    if (s.id === 'powerWordShield') c *= 1 - fx.soulWardingCostPct / 100;
    return c;
  };
  const castTime = (s: SpellDef) => (s.id === 'heal' || s.id === 'greaterHeal' ? s.castTime - fx.divineFurySec : s.castTime);

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let mana = d.maxMana;
    const mm = manaModel(d, fx, o);
    const hots: Hot[] = [];
    const ready = new Map<string, number>();
    const weakened = new Map<number, number>(); // cible → fin d'Âme affaiblie
    let piUntil = -1;
    let lastHeal = '';
    let oomAt = fightLength;

    const isReady = (id: string) => (ready.get(id) ?? 0) <= t + EPS;
    const healMult = (s: SpellDef) => {
      let m = (mods.dmgMult.healing ?? 1) * (t < piUntil ? 1.2 : 1);
      if (s.id !== 'powerWordShield') m *= 1 + fx.spiritualHealingPct / 100;
      else m *= 1 + fx.improvedShieldPct / 100;
      if (INSTANT.has(s.id)) m *= 1 + fx.twinDisciplinesPct / 100;
      if (s.id === 'renew') m *= 1 + fx.improvedRenewPct / 100;
      return m;
    };
    const critChance = (target: number, bonus = 0) => {
      const hope = (weakened.get(target) ?? -1) > t ? fx.renewedHopeCritPct : 0;
      return Math.min(100, d.spellCritPct + fx.holySpecializationPct + hope + bonus) / 100;
    };
    const heal = (id: string, amount: number, target: number, critBonus = 0, canCrit = true) => {
      const e = rec.entry(id);
      e.hits++;
      if (canCrit && rng() < critChance(target, critBonus)) {
        amount *= rules.healCritMultiplier;
        e.crits++;
        // Égide divine : bouclier égal à une part du soin critique (plafonné à 20 × niveau).
        if (fx.divineAegisPct) rec.add('divineAegis', Math.min(20 * rules.level, (amount * fx.divineAegisPct) / 100) * effective, t);
      }
      rec.add(id, amount * effective, t);
    };
    const roll = (s: SpellDef) => s.directMin! + rng() * (s.directMax! - s.directMin!) + (s.directCoeff ?? 0) * d.healingPower;

    const advance = (dt: number) => {
      const end = t + dt;
      for (;;) {
        let next = end;
        let idx = -1;
        hots.forEach((h, i) => {
          if (t + h.toNext < next - EPS) {
            next = t + h.toNext;
            idx = i;
          }
        });
        const step = next - t;
        mana = Math.min(d.maxMana, mana + mm.regen(t, step));
        for (const h of hots) h.toNext -= step;
        t = next;
        if (idx < 0) break;
        const h = hots[idx];
        if (h.direct) heal(h.id, h.tick, h.target);
        else {
          rec.entry(h.id).ticks++;
          // Les soins périodiques peuvent être critiques sur Forever, sans déclencher l'Égide.
          const e = rec.entry(h.id);
          let amount = h.tick;
          if (rules.dotsCanCrit && rng() < critChance(h.target)) {
            amount *= rules.healCritMultiplier;
            e.crits++;
          }
          rec.add(h.id, amount * effective, t);
        }
        h.ticksLeft--;
        h.toNext = h.interval;
        if (h.ticksLeft <= 0) hots.splice(idx, 1);
      }
    };
    const begin = (s: SpellDef, focused = false) => {
      mana -= costOf(s, focused);
      mm.spend(t);
      rec.entry(s.id).casts++;
      if (s.cooldown) ready.set(s.id, t + (s.id === 'powerWordShield' ? shieldCd : s.cooldown));
      // Litanie de lumière : du mana quand on change de sort de soin.
      if (HEALS.has(s.id)) {
        if (fx.litanyPct && lastHeal && lastHeal !== s.id) mana = Math.min(d.maxMana, mana + (s.manaCost * fx.litanyPct) / 100);
        lastHeal = s.id;
      }
    };
    /** Activité : après chaque soin, une part du temps où personne n'a besoin de soins. */
    const idle = (duration: number) => {
      if (activity < 100) advance((duration * (100 - activity)) / activity);
    };
    const gcd = () => {
      const g = rules.gcd / haste + rules.latency;
      advance(g);
      idle(g);
    };
    const affordable = (s: SpellDef) => mana >= costOf(s, false);

    while (t < fightLength - EPS) {
      if (o.powerInfusion && fx.powerInfusion && isReady('powerInfusion')) {
        piUntil = t + 15;
        ready.set('powerInfusion', t + 180);
        rec.entry('powerInfusion').casts++;
      }
      mana += mm.potion(t, mana, rng);
      const shield = sp('powerWordShield');
      const renew = sp('renew');

      // Mot de pouvoir : Bouclier sur chaque cible dont l'Âme affaiblie est terminée.
      const shieldTarget = Array.from({ length: o.shieldTargets }, (_, i) => i).find((i) => (weakened.get(i) ?? -1) <= t + EPS);
      if (shieldTarget !== undefined && isReady('powerWordShield') && affordable(shield)) {
        begin(shield);
        weakened.set(shieldTarget, t + weakenedSoul);
        heal('powerWordShield', (shield.directMin! + (shield.directCoeff ?? 0) * d.healingPower) * healMult(shield), shieldTarget, 0, false);
        gcd();
        continue;
      }
      if (o.penance && fx.penance && isReady('penance') && affordable(sp('penance'))) {
        const pen = sp('penance');
        begin(pen);
        const bolts = 3;
        const each = roll(pen) * healMult(pen);
        heal('penance', each, 0);
        for (let i = 1; i < bolts; i++) {
          advance(pen.castTime / (bolts - 1) / haste);
          if (t > fightLength + EPS) break;
          heal('penance', each, 0);
        }
        advance(rules.latency);
        idle(pen.castTime / haste + rules.latency);
        continue;
      }
      if (o.prayerOfMending && fx.prayerOfMending && isReady('prayerOfMending') && affordable(sp('prayerOfMending'))) {
        const pom = sp('prayerOfMending');
        begin(pom);
        const i = hots.findIndex((h) => h.id === 'prayerOfMending');
        if (i >= 0) hots.splice(i, 1);
        const jump = Math.max(0.5, rules.pomJumpInterval);
        hots.push({ id: 'prayerOfMending', target: 0, ticksLeft: Math.max(1, o.pomCharges), interval: jump, toNext: jump, tick: roll(pom) * healMult(pom), direct: true });
        gcd();
        continue;
      }
      const renewTarget = Array.from({ length: o.renewTargets }, (_, i) => i).find((i) => !hots.some((h) => h.id === 'renew' && h.target === i));
      if (renewTarget !== undefined && affordable(renew)) {
        begin(renew);
        const interval = renew.dotDuration! / renew.dotTicks!;
        const total = (renew.dotTotal! + (renew.dotCoeff ?? 0) * d.healingPower) * healMult(renew);
        hots.push({ id: 'renew', target: renewTarget, ticksLeft: renew.dotTicks!, interval, toNext: interval, tick: total / renew.dotTicks! });
        gcd();
        continue;
      }

      // Soin de remplissage, avec Focalisation intérieure quand elle est prête.
      const filler = sp(o.healFiller);
      const focused = o.innerFocus && fx.innerFocus && isReady('innerFocus');
      if (!focused && !affordable(filler)) {
        if (oomAt === fightLength) oomAt = t;
        advance(1);
        continue;
      }
      if (focused) ready.set('innerFocus', t + 180);
      begin(filler, focused);
      const time = castTime(filler);
      advance(Math.max(rules.gcd / haste, time / haste) + rules.latency);
      if (t > fightLength + EPS) break;
      const targets = filler.id === 'prayerOfHealing' ? Math.max(1, o.pohTargets) : 1;
      for (let i = 0; i < targets; i++) heal(filler.id, roll(filler) * healMult(filler), filler.id === 'prayerOfHealing' ? 10 + i : 0, focused ? 25 : 0);
      idle(Math.max(rules.gcd / haste, time / haste) + rules.latency);
    }
    rec.extra('manaEnd', mana);
    rec.extra('oomAt', oomAt);
    rec.endFight();
  }
  return rec.finish();
}

export function priestWeightSpec(spec: PriestSpec): { deltas: Partial<Record<keyof Stats, number>>; base: keyof Stats } {
  if (spec === 'shadow') return { deltas: { spellPower: 30, shadowPower: 30, critPct: 1, hitPct: 1, intellect: 30, spirit: 30, mp5: 10 }, base: 'spellPower' };
  return { deltas: { healingPower: 30, spellPower: 30, intellect: 20, spirit: 20, mp5: 10, critPct: 1 }, base: 'healingPower' };
}
