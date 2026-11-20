import { SHAMAN_DATA, type ShamanOptions, type ShamanRules, type ShamanSpec } from '../data/shaman/data';
import { emptyMods, type SimModifiers, type SpellDef, type Stats, type WeaponInfo } from '../data/types';
import { armorReduction } from './paladinSim';
import { makeCooldownGate, makePriority, type PriorityList, type StepImpl } from './priority';
import { SHAMAN_STEPS, cooldownSteps } from './rotationSteps';
import { createRng } from './rng';
import { createRecorder, type SimResult } from './simTypes';
import { rank, type TalentPoints } from './talents';

// Simulateur du chaman Forever : Éclair, Chaîne d'éclairs, Horions et Totem incendiaire (Élémentaire) ;
// arme à deux mains, Furie-des-vents, Courroux naturel (Stormstrike) et Arme du Maelström (Amélioration) ; soins (Restauration).

export interface ShamanSimConfig {
  classId: 'shaman';
  spec: ShamanSpec;
  rules: ShamanRules;
  spells: SpellDef[];
  gear: Stats;
  mods?: SimModifiers;
  talents: TalentPoints;
  options: ShamanOptions;
  weapon?: WeaponInfo | null;
  fightLength: number;
  iterations: number;
  seed: number;
  priority?: PriorityList;
  /** Temps forts : désactivés ou soumis à des conditions. */
  cooldowns?: PriorityList;
}

const EPS = 1e-9;
export const DEFAULT_SHAMAN_2H: WeaponInfo = { min: 150, max: 230, speed: 3.6, twoHand: true };

export function shamanTalents(t: TalentPoints) {
  const v = (key: string, re: RegExp) => SHAMAN_DATA.talentValue(key, rank(t, key), re);
  return {
    convectionPct: v('convection', /by (\d+)%/),
    concussionPct: v('concussion', /by (\d+)%/),
    elementalDevastationPct: v('elementalDevastation', /by (\d+)%/),
    reverberationSec: v('reverberation', /by ([\d.]+) sec/),
    elementalAlacritySec: v('elementalAlacrity', /by ([\d.]+) sec/),
    callOfFlamePct: v('callOfFlame', /by (\d+)%/),
    callOfFlameSec: v('callOfFlame', /by (\d+) sec/),
    elementalFocusChance: v('elementalFocus', /a (\d+)% chance/),
    callOfThunderPct: v('callOfThunder', /by (\d+)%/),
    lightningOverloadChance: v('lightningOverload', /a (\d+)% chance/),
    elementalFuryPct: v('elementalFury', /by (\d+)%/),
    lightningMastery: rank(t, 'lightningMastery') > 0,
    thunderingStrikesPct: v('thunderingStrikes', /by (\d+)%/),
    ancestralKnowledgePct: v('ancestralKnowledge', /by (\d+)%/),
    mentalDexterityPct: v('mentalDexterity', /equal to (\d+)%/),
    elementalWeaponsRbPct: v('elementalWeapons', /Rockbiter Weapon by (\d+)%/),
    elementalWeaponsWfPct: v('elementalWeapons', /Windfury Weapon effect by (\d+)%/),
    shamanisticFocusPct: v('shamanisticFocus', /by (\d+)%/),
    toughnessPct: v('toughness', /by (\d+)%/),
    flurryPct: v('flurry', /by (\d+)%/),
    stormstrike: rank(t, 'stormstrike') > 0,
    mentalQuicknessPct: v('mentalQuickness', /up to (\d+)%/),
    improvedStormstrikeRegen: v('improvedStormstrike', /gain (\d+)% mana/),
    maelstromRank: rank(t, 'maelstromWeapon'),
    rageOfTheFarseer: rank(t, 'rageOfTheFarseer') > 0,
    improvedHealingWaveSec: v('improvedHealingWave', /by ([\d.]+) sec/),
    tidalFocusCostPct: v('tidalFocus', /by (\d+)% and/),
    tidalFocusHitPct: v('tidalFocus', /hit by (\d+)%/),
    mindfulnessPct: v('mindfulness', /Allows (\d+)%/),
    totemicFocusPct: v('totemicFocus', /by (\d+)%/),
    waterShield: rank(t, 'waterShield') > 0,
    tidalMasteryPct: v('tidalMastery', /by (\d+)%/),
    manaTide: rank(t, 'manaTideTotem') > 0,
    healingWayPct: v('healingWay', /by (\d+)%/),
    naturesSwiftness: rank(t, 'naturesSwiftness') > 0,
    purificationPct: v('purification', /by (\d+)%/),
    riptide: rank(t, 'riptide') > 0,
  };
}

export function deriveShaman(rules: ShamanRules, gear: Stats, talents: TalentPoints, mods: SimModifiers = emptyMods()) {
  const fx = shamanTalents(talents);
  const sm = mods.statMult;
  const strength = (rules.baseStrength + (gear.strength ?? 0)) * sm;
  const agility = (rules.baseAgility + (gear.agility ?? 0)) * sm;
  const stamina = (rules.baseStamina + gear.stamina) * sm * mods.staminaMult * (1 + fx.toughnessPct / 100);
  const intellect = (rules.baseIntellect + gear.intellect) * sm * (1 + fx.ancestralKnowledgePct / 100);
  const spirit = (rules.baseSpirit + gear.spirit) * sm;
  const fromInt = (intellect * fx.mentalQuicknessPct) / 100;
  return {
    strength,
    agility,
    stamina,
    intellect,
    spirit,
    attackPower: rules.baseAttackPower + strength * rules.apPerStr + (gear.attackPower ?? 0) + (intellect * fx.mentalDexterityPct) / 100,
    meleeCritPct: rules.baseCritPct + agility / rules.agiPerCritPct + gear.critPct + fx.thunderingStrikesPct,
    spellCritPct: rules.baseSpellCritPct + intellect / rules.intPerSpellCritPct + gear.critPct + fx.thunderingStrikesPct,
    hitPct: gear.hitPct,
    spellHitPct: gear.hitPct + fx.tidalFocusHitPct,
    meleeHitToCap: Math.max(0, rules.missPct - gear.hitPct),
    spellHitToCap: Math.max(0, rules.spellMissPct - 1 - gear.hitPct - fx.tidalFocusHitPct),
    spellPower: gear.spellPower + fromInt,
    naturePower: gear.spellPower + fromInt,
    firePower: gear.spellPower + (gear.firePower ?? 0) + fromInt,
    frostPower: gear.spellPower + fromInt,
    healingPower: gear.spellPower + (gear.healingPower ?? 0) + fromInt,
    maxMana: rules.baseMana + intellect * rules.manaPerInt + mods.maxMana,
    maxHealth: rules.baseHealth + stamina * rules.healthPerSta + mods.maxHealth,
    mp5: gear.mp5,
    spiritRegen: (rules.regenBase + spirit / rules.regenSpiritDivisor) / 2,
  };
}

interface Tick {
  id: string;
  ticksLeft: number;
  next: number;
  interval: number;
  tick: number;
  school: string;
}

const SHOCKS = new Set(['earthShock', 'flameShock', 'frostShock']);
const LIGHTNING = new Set(['lightningBolt', 'chainLightning']);
const HEALS = new Set(['healingWave', 'lesserHealingWave', 'chainHeal', 'riptide']);

export function simulateShaman(config: ShamanSimConfig): SimResult {
  const { rules, options: o, fightLength, spec } = config;
  const mods = config.mods ?? emptyMods();
  const fx = shamanTalents(config.talents);
  const d = deriveShaman(rules, config.gear, config.talents, mods);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);
  const haste = 1 + mods.hastePct / 100;
  const healer = spec === 'resto';
  const melee = spec === 'enhancement';
  const w = config.weapon ?? DEFAULT_SHAMAN_2H;
  const armorMult = 1 - armorReduction(Math.max(0, rules.bossArmor - mods.armorReduction), rules.level);
  const allMult = mods.dmgMult.all ?? 1;
  const schoolMult = (s: string) => mods.dmgMult[`school:${s}`] ?? 1;
  const spellMiss = Math.max(1, rules.spellMissPct - d.spellHitPct) / 100;
  const meleeMiss = Math.max(0, rules.missPct - d.hitPct) / 100;
  const dodge = rules.bossDodgePct / 100;
  const spellCritMult = 1 + (rules.spellCritMultiplier - 1) * (1 + fx.elementalFuryPct / 100);
  const effective = 1 - o.overhealPct / 100;
  const activity = Math.max(5, Math.min(100, o.activityPct));
  const imbueAp = o.imbue === 'rockbiter' ? rules.rockbiterAp * (1 + fx.elementalWeaponsRbPct / 100) : 0;
  const ap = d.attackPower + imbueAp;
  const wfAp = rules.windfuryAp * (1 + fx.elementalWeaponsWfPct / 100);
  const maelstromChance = (w.speed * 2 * fx.maelstromRank) / 60;
  const power = (school: string) => (healer ? d.healingPower : school === 'fire' ? d.firePower : school === 'frost' ? d.frostPower : d.naturePower);
  const castTimeOf = (s: SpellDef) => {
    let c = s.castTime;
    if (LIGHTNING.has(s.id)) c -= fx.elementalAlacritySec;
    if (s.id === 'healingWave') c -= fx.improvedHealingWaveSec;
    return Math.max(0, c);
  };
  const baseCost = (s: SpellDef) => {
    let c = s.manaCost;
    if (SHOCKS.has(s.id) || LIGHTNING.has(s.id)) c *= 1 - fx.convectionPct / 100;
    if (SHOCKS.has(s.id)) c *= 1 - fx.shamanisticFocusPct / 100;
    if (HEALS.has(s.id)) c *= 1 - fx.tidalFocusCostPct / 100;
    if (s.id === 'searingTotem') c *= 1 - fx.totemicFocusPct / 100;
    return c * (1 - (mods.costPct[s.id] ?? 0) / 100);
  };
  const weaponRoll = (apNow: number) => w.min + rng() * (w.max - w.min) + mods.weaponDamage + (apNow / 14) * w.speed;

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let mana = d.maxMana;
    let lastSpend = -10;
    let gcdReady = 0;
    let nextMelee = melee ? 0 : Infinity;
    let flurryLeft = 0;
    let devastationUntil = -1;
    let stormUntil = -1;
    let improvedSsUntil = -1;
    let farseerUntil = -1;
    let masteryUntil = -1;
    let clearcasting = false;
    let maelstrom = 0;
    let potionReady = 0;
    let lastGlobe = -100;
    let totemUntil = -1;
    let nextTotem = Infinity;
    let tideTicks = 0;
    let nextTide = Infinity;
    let oomAt = fightLength;
    const ready = new Map<string, number>();
    const ticks: Tick[] = [];

    const isReady = (id: string) => (ready.get(id) ?? 0) <= t + EPS;
    const regen = (dt: number) => {
      const casting = t - lastSpend < 5;
      let whileCasting = fx.mindfulnessPct;
      if (t < improvedSsUntil) whileCasting = Math.max(whileCasting, fx.improvedStormstrikeRegen);
      return (d.mp5 / 5 + d.spiritRegen * (casting ? whileCasting / 100 : 1)) * dt;
    };
    const globe = () => {
      if (o.waterShield && fx.waterShield && t - lastGlobe >= rules.waterShieldInterval) {
        mana = Math.min(d.maxMana, mana + (d.maxMana * rules.waterShieldPct) / 100);
        lastGlobe = t;
      }
    };

    /** Sort offensif : raté, critique ; Surcharge relance la moitié des dégâts. */
    const spellHit = (id: string, base: number, school: string, critBonus = 0, mult = 1): number => {
      const e = rec.entry(id);
      if (rng() < spellMiss) {
        e.misses++;
        return 0;
      }
      e.hits++;
      let amount = base * mult * allMult * schoolMult(school);
      if (rng() < (d.spellCritPct + critBonus) / 100) {
        amount *= spellCritMult;
        e.crits++;
        if (fx.elementalDevastationPct) devastationUntil = t + 10;
      }
      rec.add(id, amount, t);
      return amount;
    };

    const meleeHit = (id: string, base: number, white: boolean) => {
      const e = rec.entry(id);
      const u = rng();
      if (u < meleeMiss + dodge) {
        e.misses++;
        return 0;
      }
      e.hits++;
      let amount = base * armorMult * allMult * schoolMult('physical');
      const critPct = d.meleeCritPct + (t < devastationUntil ? fx.elementalDevastationPct : 0) - rules.critSuppressionPct;
      if (white && u < meleeMiss + dodge + rules.glancingPct / 100) amount *= 1 - rules.glancingPenaltyPct / 100;
      else if (rng() < critPct / 100) {
        amount *= rules.critMultiplier;
        e.crits++;
        if (fx.flurryPct) flurryLeft = 3;
      }
      rec.add(id, amount, t);
      if (fx.maelstromRank && rng() < maelstromChance) maelstrom = Math.min(5, maelstrom + 1);
      return amount;
    };

    const swing = () => {
      if (flurryLeft > 0) flurryLeft--;
      rec.entry('melee').casts++;
      const dmg = meleeHit('melee', weaponRoll(ap), true);
      // Furie-des-vents : deux attaques en plus avec un bonus de puissance d'attaque (pas de relance en chaîne).
      if (dmg > 0 && o.imbue === 'windfury' && rng() < rules.windfuryChance / 100) {
        for (let i = 0; i < 2; i++) {
          rec.entry('windfury').casts++;
          meleeHit('windfury', weaponRoll(ap + wfAp), false);
        }
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
        consider(nextMelee, 'melee');
        consider(nextTotem, 'totem');
        consider(nextTide, 'tide');
        ticks.forEach((h, i) => consider(h.next, `tick${i}`));
        mana = Math.min(d.maxMana, mana + regen(next - t));
        t = next;
        if (!what || t > fightLength + EPS) break;
        if (what === 'melee') {
          swing();
          nextMelee = t + w.speed / (flurryLeft > 0 ? 1 + fx.flurryPct / 100 : 1) / (t < farseerUntil ? 1.3 : 1) / haste;
        } else if (what === 'totem') {
          const s = sp('searingTotem');
          rec.entry('searingTotem').casts++;
          spellHit('searingTotem', s.directMin! + rng() * (s.directMax! - s.directMin!) + (s.directCoeff ?? 0) * d.firePower, 'fire', 0, 1 + fx.callOfFlamePct / 100);
          nextTotem = t + rules.searingInterval;
          if (nextTotem > totemUntil) nextTotem = Infinity;
        } else if (what === 'tide') {
          mana = Math.min(d.maxMana, mana + rules.manaTidePerTick);
          tideTicks--;
          nextTide = tideTicks > 0 ? t + 3 : Infinity;
        } else {
          const i = Number(what.slice(4));
          const h = ticks[i];
          rec.entry(h.id).ticks++;
          if (healer) {
            let amount = h.tick;
            if (rng() < (d.spellCritPct + fx.tidalMasteryPct) / 100) amount *= rules.healCritMultiplier;
            rec.add(h.id, amount * effective, t);
          } else rec.add(h.id, h.tick * allMult * schoolMult(h.school), t);
          h.ticksLeft--;
          h.next += h.interval;
          if (h.ticksLeft <= 0) ticks.splice(i, 1);
        }
      }
    };

    const pay = (s: SpellDef, free = false) => {
      if (!free) mana -= baseCost(s);
      lastSpend = t;
      rec.entry(s.id).casts++;
      if (s.cooldown) {
        let cd = s.cooldown;
        if (SHOCKS.has(s.id)) cd -= fx.reverberationSec;
        if (s.id === 'chainLightning' && t < masteryUntil) cd = 0;
        ready.set(SHOCKS.has(s.id) ? 'shock' : s.id, t + cd);
      }
    };
    /** Lance un sort à incantation (ou instantané) et attend la fin de l'incantation ou du temps de recharge global. */
    const cast = (_s: SpellDef, time: number) => {
      const busy = Math.max(rules.gcd / haste, time / haste) + rules.latency;
      advance(time > 0 ? time / haste + rules.latency : 0);
      gcdReady = t + Math.max(0, busy - (time > 0 ? time / haste + rules.latency : 0));
      return t <= fightLength + EPS;
    };

    /** Éclair ou Chaîne d'éclairs, avec Courroux naturel, Commotion, Appel du tonnerre et Surcharge de foudre. */
    const lightning = (id: string, instant: boolean, maelstromStacks = 0) => {
      const s = sp(id);
      const free = clearcasting || maelstromStacks >= 5;
      if (!free && mana < baseCost(s) * (1 - maelstromStacks * 0.2)) return false;
      if (!free) mana += baseCost(s) * maelstromStacks * 0.2;
      clearcasting = false;
      pay(s, free);
      let time = instant ? 0 : castTimeOf(s);
      if (id === 'lightningBolt' && t < masteryUntil) time = Math.max(0, time - 0.5);
      time *= 1 - maelstromStacks * 0.2;
      if (!cast(s, time)) return true;
      const mult = (1 + fx.concussionPct / 100) * (t < stormUntil ? 1.2 : 1);
      if (t < stormUntil) stormUntil = -1;
      const base = s.directMin! + rng() * (s.directMax! - s.directMin!) + (s.directCoeff ?? 0) * d.naturePower;
      const dmg = spellHit(id, base, 'nature', fx.callOfThunderPct, mult);
      if (dmg > 0 && fx.lightningOverloadChance && rng() < fx.lightningOverloadChance / 100) spellHit('lightningOverload', base / 2, 'nature', fx.callOfThunderPct, mult);
      if (fx.elementalFocusChance && rng() < fx.elementalFocusChance / 100) clearcasting = true;
      return true;
    };

    const shock = (): boolean => {
      if (o.shock === 'none' || !isReady('shock')) return false;
      const s = sp(o.shock);
      if (o.shock === 'flameShock' && ticks.some((h) => h.id === 'flameShock')) return false;
      const free = clearcasting;
      if (!free && mana < baseCost(s)) return false;
      clearcasting = false;
      pay(s, free);
      cast(s, 0);
      const school = s.school;
      let mult = 1;
      if (o.shock === 'earthShock') {
        mult *= (1 + fx.concussionPct / 100) * (t < stormUntil ? 1.2 : 1);
        if (t < stormUntil) stormUntil = -1;
      }
      if (o.shock === 'flameShock') mult *= 1 + fx.callOfFlamePct / 100;
      const dmg = spellHit(o.shock, s.directMin! + rng() * (s.directMax! - s.directMin!) + (s.directCoeff ?? 0) * power(school), school, 0, mult);
      if (dmg > 0 && o.shock === 'flameShock') {
        const dur = s.dotDuration! + fx.callOfFlameSec;
        const n = Math.round((s.dotTicks! * dur) / s.dotDuration!);
        const total = ((s.dotTotal! + (s.dotCoeff ?? 0) * d.firePower) * (dur / s.dotDuration!)) * mult;
        ticks.push({ id: 'flameShock', ticksLeft: n, next: t + 3, interval: 3, tick: total / n, school: 'fire' });
      }
      if (fx.elementalFocusChance && rng() < fx.elementalFocusChance / 100) clearcasting = true;
      return true;
    };

    const totem = (): boolean => {
      if (!o.searingTotem || t < totemUntil - EPS) return false;
      const s = sp('searingTotem');
      if (mana < baseCost(s)) return false;
      pay(s);
      cast(s, 0);
      totemUntil = t + 55;
      nextTotem = t + 0.5;
      return true;
    };

    const orUndef = (done: boolean) => (done ? true : undefined);
    const steps: Record<string, StepImpl<boolean>> = {
      stormstrike: {
        when: () => melee && o.stormstrike && fx.stormstrike && isReady('stormstrike') && mana >= baseCost(sp('stormstrike')),
        run: () => {
          pay(sp('stormstrike'));
          cast(sp('stormstrike'), 0);
          meleeHit('stormstrike', weaponRoll(ap), false);
          stormUntil = t + 12;
          if (fx.improvedStormstrikeRegen) improvedSsUntil = t + 15;
          return true;
        },
      },
      maelstromBolt: {
        when: () => melee && o.maelstromBolt && maelstrom >= 5,
        run: () => {
          const stacks = maelstrom;
          maelstrom = 0;
          return lightning('lightningBolt', false, stacks);
        },
      },
      chainLightning: { when: () => !melee && o.chainLightning && isReady('chainLightning'), run: () => orUndef(lightning('chainLightning', false)) },
      shock: { when: () => true, run: () => orUndef(shock()) },
      searingTotem: { when: () => true, run: () => orUndef(totem()) },
      lightningBolt: { when: () => !melee, run: () => lightning('lightningBolt', false) },
    };
    const pick = makePriority(SHAMAN_STEPS[spec], steps, config.priority, { time: () => t, fightLength, resource: () => mana, resourceMax: () => d.maxMana });
    const actDps = (): boolean => pick() ?? false;
    const cd = makeCooldownGate(cooldownSteps('shaman', spec), config.cooldowns, { time: () => t, fightLength, resource: () => mana, resourceMax: () => d.maxMana });

    // Soins
    const healCrit = (bonus = 0) => (d.spellCritPct + fx.tidalMasteryPct + bonus) / 100;
    const heal = (id: string, amount: number) => {
      const e = rec.entry(id);
      e.hits++;
      if (rng() < healCrit()) {
        amount *= rules.healCritMultiplier;
        e.crits++;
        globe();
      }
      rec.add(id, amount * effective, t);
    };
    const healMult = (id: string) => (mods.dmgMult.healing ?? 1) * (1 + fx.purificationPct / 100) * (id === 'healingWave' ? 1 + fx.healingWayPct / 100 : 1);
    const idle = (dur: number) => {
      if (activity < 100) advance((dur * (100 - activity)) / activity);
    };
    const actHeal = (): boolean => {
      if (o.riptide && fx.riptide && isReady('riptide') && mana >= baseCost(sp('riptide'))) {
        const s = sp('riptide');
        pay(s);
        cast(s, 0);
        const total = (s.dotTotal! + (s.dotCoeff ?? 0) * d.healingPower) * healMult('riptide');
        ticks.push({ id: 'riptide', ticksLeft: s.dotTicks!, next: t + 3, interval: s.dotDuration! / s.dotTicks!, tick: total / s.dotTicks!, school: 'nature' });
        ready.set('riptideTarget', t + 15);
        idle(rules.gcd / haste);
        return true;
      }
      const s = sp(o.healFiller);
      const instant = o.naturesSwiftness && fx.naturesSwiftness && isReady('naturesSwiftness');
      if (mana < baseCost(s)) return false;
      if (instant) {
        ready.set('naturesSwiftness', t + 180);
        rec.entry('naturesSwiftness').casts++;
      }
      pay(s);
      const time = instant ? 0 : castTimeOf(s);
      if (!cast(s, time)) return true;
      const base = (s.directMin! + rng() * (s.directMax! - s.directMin!) + (s.directCoeff ?? 0) * d.healingPower) * healMult(s.id);
      if (s.id === 'chainHeal') {
        const onRiptide = (ready.get('riptideTarget') ?? -1) > t ? 1.25 : 1;
        let amount = base * onRiptide;
        for (let i = 0; i < Math.max(1, Math.min(3, o.chainHealTargets)); i++) {
          heal('chainHeal', amount);
          amount = (amount / (i === 0 ? onRiptide : 1)) * rules.chainHealJump;
        }
      } else heal(s.id, base);
      idle(Math.max(rules.gcd / haste, time / haste) + rules.latency);
      return true;
    };

    while (t < fightLength - EPS) {
      if (!healer && o.lightningMastery && fx.lightningMastery && isReady('lightningMastery') && cd('lightningMastery')) {
        masteryUntil = t + 15;
        ready.set('lightningMastery', t + 180);
        rec.entry('lightningMastery').casts++;
      }
      if (melee && o.rageOfTheFarseer && fx.rageOfTheFarseer && isReady('rageOfTheFarseer') && cd('rageOfTheFarseer')) {
        farseerUntil = t + 25;
        ready.set('rageOfTheFarseer', t + 180);
        rec.entry('rageOfTheFarseer').casts++;
      }
      if (healer && o.manaTide && fx.manaTide && isReady('manaTide') && d.maxMana - mana > rules.manaTidePerTick * 4) {
        tideTicks = 4;
        nextTide = t + 3;
        ready.set('manaTide', t + 300);
        rec.entry('manaTideTotem').casts++;
      }
      if (o.manaPotions && t >= potionReady && d.maxMana - mana >= 2250) {
        mana += 1350 + rng() * 900;
        potionReady = t + 120;
      }
      if (t < gcdReady - EPS) {
        advance(gcdReady - t);
        continue;
      }
      if (healer ? actHeal() : actDps()) continue;
      if (!melee && oomAt === fightLength) oomAt = t;
      advance(melee ? Math.max(0.1, Math.min(0.5, nextMelee - t + EPS)) : 1);
    }
    rec.extra('manaEnd', mana);
    rec.extra('oomAt', oomAt);
    rec.endFight();
  }
  return rec.finish();
}

export function shamanWeightSpec(spec: ShamanSpec): { deltas: Partial<Record<keyof Stats, number>>; base: keyof Stats } {
  if (spec === 'resto') return { deltas: { healingPower: 30, spellPower: 30, intellect: 20, spirit: 20, mp5: 10, critPct: 1 }, base: 'healingPower' };
  if (spec === 'enhancement') return { deltas: { attackPower: 60, strength: 30, agility: 30, intellect: 30, critPct: 1, hitPct: 1, spellPower: 30, weaponDps: 5 }, base: 'attackPower' };
  return { deltas: { spellPower: 30, critPct: 1, hitPct: 1, intellect: 30, spirit: 30, mp5: 10 }, base: 'spellPower' };
}
