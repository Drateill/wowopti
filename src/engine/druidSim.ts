import { DRUID_DATA, type DruidOptions, type DruidRules, type DruidSpec } from '../data/druid/data';
import { emptyMods, type SimModifiers, type SpellDef, type Stats, type WeaponInfo } from '../data/types';
import { armorReduction } from './paladinSim';
import { extraSpellSteps, makePriority, type PriorityList, type StepImpl } from './priority';
import { DRUID_STEPS } from './rotationSteps';
import { createRng } from './rng';
import { createRecorder, type SimResult } from './simTypes';
import { rank, type TalentPoints } from './talents';

// Simulateur du druide Forever : Équilibre (sorts), Restauration (soins), Chat (dégâts) et Ours (tank).

export interface DruidSimConfig {
  classId: 'druid';
  spec: DruidSpec;
  rules: DruidRules;
  spells: SpellDef[];
  gear: Stats;
  mods?: SimModifiers;
  weapon: WeaponInfo | null;
  talents: TalentPoints;
  options: DruidOptions;
  fightLength: number;
  iterations: number;
  seed: number;
  priority?: PriorityList;
  /** Sorts ajoutés à la rotation (tables du client), en plus des sorts de base. */
  extraSpells?: SpellDef[];
}

const EPS = 1e-9;

export function druidTalents(t: TalentPoints) {
  const v = (key: string, re: RegExp) => DRUID_DATA.talentValue(key, rank(t, key), re);
  return {
    improvedWrathSec: v('improvedWrath', /by ([\d.]+) sec/),
    improvedWrathManaPct: v('improvedWrath', /Mana cost by (\d+)%/),
    genesisPct: v('genesis', /by (\d+)%/),
    moonglowPct: v('moonglow', /by (\d+)%/),
    improvedMoonfirePct: v('improvedMoonfire', /by (\d+)%/),
    naturesMajestyPct: v('naturesMajesty', /by (\d+)%/),
    naturesReachPct: v('naturesReach', /hit by (\d+)%/),
    splendorMoonfire: v('naturesSplendor', /Moonfire and Rejuvenation spells by (\d+) sec/),
    splendorRegrowth: v('naturesSplendor', /Regrowth spell by (\d+) sec/),
    splendorSwarm: v('naturesSplendor', /Insect Swarm spell by (\d+) sec/),
    insectSwarm: rank(t, 'insectSwarm') > 0,
    vengeancePct: v('vengeance', /by (\d+)%/),
    improvedStarfireSec: v('improvedStarfire', /by ([\d.]+) sec/),
    naturesGracePct: v('naturesGrace', /by (\d+)% for/),
    eclipseSec: v('eclipse', /by ([\d.]+) sec/),
    moonfuryPct: v('moonfury', /by (\d+)%/),
    moonkinForm: rank(t, 'moonkinForm') > 0,
    ferocity: v('ferocity', /by (\d+) Rage/),
    furorRage: v('furor', /gain (\d+) Rage/),
    feralSwiftnessDodge: v('feralSwiftness', /Dodge by (\d+)%/),
    feralInstinctPct: v('feralInstinct', /by (\d+)%/),
    thickHidePerLevel: v('thickHide', /gain (\d+) additional base Armor per level/),
    thickHidePerDefense: v('thickHide', /another ([\d.]+) base Armor/),
    shredCut: v('shreddingAttacks', /Shred ability by (\d+)/),
    lacerateCut: v('shreddingAttacks', /Lacerate ability by (\d+)/),
    savageFuryPct: v('savageFury', /by (\d+)%/),
    sharpenedClawsPct: v('sharpenedClaws', /by (\d+)%/),
    predatoryStrikesPct: v('predatoryStrikes', /by (\d+)% of your level/),
    lacerate: rank(t, 'lacerate') > 0,
    predatoryDiscipline: rank(t, 'predatoryDiscipline') > 0,
    bloodFrenzyRageChance: v('bloodFrenzy', /a (\d+)% chance to gain/),
    bloodFrenzyCpChance: v('bloodFrenzy', /have a (\d+)% chance to add/),
    leaderOfThePack: rank(t, 'leaderOfThePack') > 0,
    naturalInstinctPct: v('naturalInstinct', /bonus of your melee abilities by (\d+)%/),
    naturalInstinctHealPct: v('naturalInstinct', /by (\d+)% of your Intellect/),
    rendAndTearPct: v('rendAndTear', /by (\d+)%/),
    naturalReactionDodge: v('naturalReaction', /dodge chance by (\d+)%/),
    naturalReactionChance: v('naturalReaction', /a (\d+)% chance to gain/),
    primalBite: rank(t, 'primalBite') > 0,
    heartIntPct: v('heartOfTheWild', /Intellect by (\d+)%/),
    heartStaPct: v('heartOfTheWild', /Stamina is increased by (\d+)%/),
    heartStrPct: v('heartOfTheWild', /Strength is increased by (\d+)%/),
    naturalistSec: v('naturalist', /by ([\d.]+) sec/),
    naturalistPct: v('naturalist', /all damage you deal by (\d+)%/),
    reflectionPct: v('reflection', /Allows (\d+)%/),
    giftOfNaturePct: v('giftOfNature', /by (\d+)%/),
    bloomPct: v('bloom', /equal to (\d+)% of your Spirit/),
    tranquilSpiritPct: v('tranquilSpirit', /by (\d+)%/),
    improvedRejuvPct: v('improvedRejuvenation', /by (\d+)%/),
    swiftmend: rank(t, 'swiftmend') > 0,
    naturesSwiftness: rank(t, 'naturesSwiftness') > 0,
    livingSpiritPct: v('livingSpirit', /by (\d+)%/),
    improvedRegrowthPct: v('improvedRegrowth', /by (\d+)%/),
    wildGrowth: rank(t, 'wildGrowth') > 0,
  };
}

/** Stats dérivées selon la forme (chat, ours, sélénien ou forme normale). */
export function deriveDruid(rules: DruidRules, gear: Stats, talents: TalentPoints, spec: DruidSpec, mods: SimModifiers = emptyMods(), moonkin = false) {
  const fx = druidTalents(talents);
  const sm = mods.statMult;
  const cat = spec === 'cat';
  const bear = spec === 'bear';
  const form = cat || bear;
  const strength = (rules.baseStrength + (gear.strength ?? 0)) * sm * (cat ? 1 + fx.heartStrPct / 100 : 1);
  const agility = (rules.baseAgility + (gear.agility ?? 0)) * sm;
  const stamina = (rules.baseStamina + gear.stamina) * sm * mods.staminaMult * (bear ? 1 + fx.heartStaPct / 100 : 1);
  const intellect = (rules.baseIntellect + gear.intellect) * sm * (1 + fx.heartIntPct / 100);
  const spirit = (rules.baseSpirit + gear.spirit) * sm * (1 + fx.livingSpiritPct / 100);
  const formAp = cat ? rules.catApBonus + agility : bear ? rules.direBearApBonus : 0;
  const attackPower =
    rules.baseAttackPower + strength * rules.apPerStr + (gear.attackPower ?? 0) + formAp + (form ? (rules.level * fx.predatoryStrikesPct) / 100 : 0);
  const formCrit = form ? fx.sharpenedClawsPct + (fx.leaderOfThePack ? 3 : 0) : 0;
  const moonkinActive = moonkin && fx.moonkinForm && spec === 'balance';
  const defense = rules.baseDefense + (gear.defense ?? 0);
  const defDiff = (defense - rules.bossDefenseSkill) * 0.04;
  // Peau épaisse : armure de base par niveau, plus par point de défense au-delà de 5 × le niveau.
  const thickHide = form || moonkinActive ? fx.thickHidePerLevel * rules.level + fx.thickHidePerDefense * Math.max(0, defense - 5 * rules.level) : 0;
  const itemArmor = (gear.armor ?? 0) * (bear || moonkinActive ? 1 + rules.direBearArmorPct / 100 : 1);
  const armor = itemArmor + thickHide + agility * 2;
  return {
    strength,
    agility,
    stamina,
    intellect,
    spirit,
    attackPower,
    meleeCritPct: rules.baseMeleeCritPct + agility / rules.agiPerCritPct + gear.critPct + fx.naturesMajestyPct + formCrit,
    spellCritPct: rules.baseSpellCritPct + intellect / rules.intPerSpellCritPct + gear.critPct + fx.naturesMajestyPct + (moonkinActive ? 3 : 0),
    hitPct: gear.hitPct + fx.naturesReachPct,
    meleeHitToCap: Math.max(0, rules.meleeMissPct - gear.hitPct - fx.naturesReachPct),
    spellHitToCap: Math.max(0, rules.spellMissPct - 1 - gear.hitPct - fx.naturesReachPct),
    spellPower: gear.spellPower,
    healingPower: gear.spellPower + (gear.healingPower ?? 0) + (intellect * fx.naturalInstinctHealPct) / 100,
    maxMana: rules.baseMana + intellect * rules.manaPerInt + mods.maxMana,
    maxHealth: rules.baseHealth + stamina * rules.healthPerSta + mods.maxHealth + (bear ? rules.direBearHealth : 0),
    mp5: gear.mp5,
    spiritRegen: (rules.regenBase + spirit / rules.regenSpiritDivisor) / 2,
    armor,
    defense,
    dodgePct: Math.max(0, rules.baseDodgePct + agility / rules.agiPerCritPct + (gear.dodgePct ?? 0) + fx.feralSwiftnessDodge + fx.naturalReactionDodge + defDiff),
    bossMissPct: Math.max(0, 5 + defDiff),
    bossCritPct: Math.max(0, 5 - defDiff),
    damageTakenReduction: armorReduction(armor, rules.level + 3),
    moonkinActive,
  };
}

export type DruidDerived = ReturnType<typeof deriveDruid>;

export function simulateDruid(config: DruidSimConfig): SimResult {
  if (config.spec === 'balance') return simulateBalance(config);
  if (config.spec === 'resto') return simulateResto(config);
  return simulateFeral(config);
}

/** Mana commun aux deux spécialisations lanceuses de sorts : Esprit, Réflexion, Innervation, potions. */
function manaModel(d: DruidDerived, fx: ReturnType<typeof druidTalents>, o: DruidOptions, rules: DruidRules) {
  let lastSpend = -10;
  let innervateUntil = -1;
  let innervateReady = 0;
  let potionReady = 0;
  return {
    spend: (t: number) => (lastSpend = t),
    regen(t: number, dt: number) {
      const innervate = t < innervateUntil;
      const casting = t - lastSpend < 5;
      const spirit = d.spiritRegen * (innervate ? 5 : 1) * (casting && !innervate ? fx.reflectionPct / 100 : 1);
      return (d.mp5 / 5 + spirit) * dt;
    },
    /** Innervation sur soi sous 30 % de mana, potion quand il manque au moins 2250 mana. */
    cooldowns(t: number, mana: number, rng: () => number): number {
      let gain = 0;
      if (o.innervate && t >= innervateReady && mana < 0.3 * d.maxMana) {
        innervateUntil = t + 20;
        innervateReady = t + 360;
        gain -= 0.05 * rules.baseMana;
      }
      if (o.manaPotions && t >= potionReady && d.maxMana - mana >= 2250) {
        gain += 1350 + rng() * 900;
        potionReady = t + 120;
      }
      return gain;
    },
  };
}

interface Hot {
  id: string;
  target: number;
  ticksLeft: number;
  interval: number;
  toNext: number;
  tick: number;
  total: number; // soin total sur la durée de base (Prompte guérison)
}

/** Équilibre : DoT (Éclat lunaire, Essaim d'insectes) puis Feu stellaire, Colère ou alternance Éclipse. */
function simulateBalance(config: DruidSimConfig): SimResult {
  const { rules, options: o, fightLength } = config;
  const mods = config.mods ?? emptyMods();
  const fx = druidTalents(config.talents);
  const d = deriveDruid(rules, config.gear, config.talents, 'balance', mods, o.moonkin);
  const spells = new Map([...config.spells, ...(config.extraSpells ?? [])].map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);
  const haste = 1 + mods.hastePct / 100;
  const hit = 1 - Math.max(1, rules.spellMissPct - d.hitPct) / 100;
  const critMult = 1 + (rules.spellCritMultiplier - 1) * (1 + fx.vengeancePct / 100);
  const omenChance = (rules.omenChancePct / 100) * (d.moonkinActive ? 2 : 1);
  const schoolMult = (s: SpellDef) =>
    (1 + fx.moonfuryPct / 100) * (1 + fx.naturalistPct / 100) * (mods.dmgMult[`school:${s.school}`] ?? 1) * (mods.dmgMult.all ?? 1) * (s.id === 'moonfire' ? 1 + fx.improvedMoonfirePct / 100 : 1);
  const cost = (s: SpellDef) => s.manaCost * (1 - fx.moonglowPct / 100) * (s.id === 'wrath' ? 1 - fx.improvedWrathManaPct / 100 : 1);
  const crit = (s: SpellDef) => Math.min(100, d.spellCritPct + (s.id === 'moonfire' ? fx.improvedMoonfirePct : 0)) / 100;
  const durationBonus = (s: SpellDef) => (s.id === 'moonfire' ? fx.splendorMoonfire : s.id === 'insectSwarm' ? fx.splendorSwarm : 0);

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let mana = d.maxMana;
    const mm = manaModel(d, fx, o, rules);
    const dots = new Map<string, Hot>();
    let graceUntil = -1;
    let eclipseCharges = 0;
    let eclipseUntil = -1;
    let clearcast = false;
    let omenReady = 0;
    let oomAt = fightLength;

    const advance = (dt: number) => {
      const end = t + dt;
      for (;;) {
        let next = end;
        let id = '';
        for (const [k, dt2] of dots) if (t + dt2.toNext < next - EPS) {
          next = t + dt2.toNext;
          id = k;
        }
        const step = next - t;
        mana = Math.min(d.maxMana, mana + mm.regen(t, step));
        for (const dot of dots.values()) dot.toNext -= step;
        t = next;
        if (!id) break;
        const dot = dots.get(id)!;
        let amount = dot.tick;
        const e = rec.entry(id);
        e.ticks++;
        if (rng() < crit(sp(id))) {
          amount *= critMult;
          e.crits++;
        }
        rec.add(id, amount, t);
        dot.ticksLeft--;
        dot.toNext = dot.interval;
        if (dot.ticksLeft <= 0) dots.delete(id);
      }
    };

    const balanceFiller = () =>
      o.filler === 'wrath' || (o.filler === 'eclipse' && fx.eclipseSec > 0 && (eclipseCharges === 0 || t >= eclipseUntil)) ? sp('wrath') : sp('starfire');
    const balanceSteps: Record<string, StepImpl<SpellDef>> = {
      moonfire: { when: () => o.moonfire && !dots.has('moonfire') && fightLength - t > 6, run: () => sp('moonfire') },
      insectSwarm: { when: () => o.insectSwarm && fx.insectSwarm && !dots.has('insectSwarm') && fightLength - t > 6, run: () => sp('insectSwarm') },
      filler: { when: () => true, run: balanceFiller },
    };
    const cdReady = new Map<string, number>();
    const extra = extraSpellSteps(spells, { hasTalent: (k) => rank(config.talents, k) > 0, ready: (id) => (cdReady.get(id) ?? 0) <= t + EPS, dotUp: (id) => dots.has(id) }, (s) => s);
    const pickBalance = makePriority(DRUID_STEPS.balance, balanceSteps, config.priority, { time: () => t, fightLength, resource: () => mana, resourceMax: () => d.maxMana }, extra);
    const chooseBalance = (): SpellDef => pickBalance() ?? balanceFiller();

    while (t < fightLength - EPS) {
      mana += mm.cooldowns(t, mana, rng);
      const s = chooseBalance();
      const free = clearcast && s.id !== 'wrath';
      if (!free && mana < cost(s)) {
        if (oomAt === fightLength) oomAt = t;
        advance(1);
        continue;
      }
      if (free) clearcast = false;
      else mana -= cost(s);
      mm.spend(t);
      // Canalisé (Ouragan…) : dégâts à chaque tick pendant la canalisation.
      if (s.channel && s.dotTotal) {
        const e = rec.entry(s.id);
        e.casts++;
        if (s.cooldown) cdReady.set(s.id, t + s.cooldown);
        const duration = s.castTime / haste;
        if (rng() >= hit) {
          e.misses++;
          advance(Math.max(1, rules.gcd / haste) + rules.latency);
          continue;
        }
        e.hits++;
        const tick = ((s.dotTotal + (s.dotCoeff ?? 0) * d.spellPower) / s.dotTicks!) * schoolMult(s);
        for (let i = 0; i < s.dotTicks! && t < fightLength - EPS; i++) {
          advance(duration / s.dotTicks!);
          e.ticks++;
          rec.add(s.id, tick, t);
        }
        advance(rules.latency);
        continue;
      }
      const grace = t < graceUntil ? 1 - fx.naturesGracePct / 100 : 1;
      let cast = s.castTime;
      if (s.id === 'wrath') cast -= fx.improvedWrathSec;
      if (s.id === 'starfire') {
        cast -= fx.improvedStarfireSec;
        if (eclipseCharges > 0 && t < eclipseUntil) {
          cast -= fx.eclipseSec;
          eclipseCharges--;
        }
      }
      const gcd = Math.max(1, rules.gcd * grace / haste);
      const time = Math.max(gcd, (cast * grace) / haste);
      advance(time + rules.latency);
      if (t > fightLength + EPS) break;
      const e = rec.entry(s.id);
      e.casts++;
      if (s.cooldown) cdReady.set(s.id, t - time - rules.latency + s.cooldown);
      if (t >= omenReady && rng() < omenChance) {
        clearcast = true;
        omenReady = t + 10;
      }
      if (rng() >= hit) {
        e.misses++;
        continue;
      }
      if (s.directMax) {
        let amount = (s.directMin! + rng() * (s.directMax - s.directMin!) + (s.directCoeff ?? 0) * d.spellPower) * schoolMult(s);
        e.hits++;
        if (rng() < crit(s)) {
          amount *= critMult;
          e.crits++;
          if (fx.naturesGracePct) graceUntil = t + 3;
        }
        rec.add(s.id, amount, t);
      }
      if (s.dotTotal) {
        const extra = durationBonus(s);
        const interval = s.dotDuration! / s.dotTicks!;
        const ticks = s.dotTicks! + Math.round(extra / interval);
        const tick = ((s.dotTotal + (s.dotCoeff ?? 0) * d.spellPower) / s.dotTicks!) * schoolMult(s) * (1 + fx.genesisPct / 100);
        dots.set(s.id, { id: s.id, target: 0, ticksLeft: ticks, interval, toNext: interval, tick, total: tick * ticks });
      }
      if (s.id === 'wrath' && fx.eclipseSec > 0) {
        eclipseCharges = Math.min(4, eclipseCharges + 2);
        eclipseUntil = t + 15;
      }
    }
    rec.extra('manaEnd', mana);
    rec.extra('oomAt', oomAt);
    rec.endFight();
  }
  return rec.finish();
}

/** Restauration : Récupération sur plusieurs cibles, Rétablissement, Croissance sauvage, puis Toucher guérisseur. */
function simulateResto(config: DruidSimConfig): SimResult {
  const { rules, options: o, fightLength } = config;
  const mods = config.mods ?? emptyMods();
  const fx = druidTalents(config.talents);
  const d = deriveDruid(rules, config.gear, config.talents, 'resto', mods);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);
  const haste = 1 + mods.hastePct / 100;
  const effective = 1 - o.overhealPct / 100;
  const healBonus = (1 + fx.giftOfNaturePct / 100) * (mods.dmgMult.healing ?? 1);
  const critChance = (id: string) => (d.spellCritPct + (id === 'regrowth' ? fx.improvedRegrowthPct : 0)) / 100;
  const cost = (s: SpellDef) => s.manaCost * (s.id === 'healingTouch' ? 1 - fx.tranquilSpiritPct / 100 : 1);
  const hotTotal = (s: SpellDef) => (s.dotTotal! + (s.dotCoeff ?? 0) * d.healingPower) * healBonus * (1 + fx.genesisPct / 100) * (s.id === 'rejuvenation' ? 1 + fx.improvedRejuvPct / 100 : 1);
  const extraTicks = (s: SpellDef) => {
    const interval = s.dotDuration! / s.dotTicks!;
    const extra = s.id === 'rejuvenation' ? fx.splendorMoonfire : s.id === 'regrowth' ? fx.splendorRegrowth : 0;
    return Math.round(extra / interval);
  };

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let mana = d.maxMana;
    const mm = manaModel(d, fx, o, rules);
    const hots: Hot[] = [];
    let wgReady = 0;
    let swiftmendReady = 0;
    let nsReady = 0;
    let oomAt = fightLength;

    const heal = (id: string, amount: number, canCrit: boolean, critId = id) => {
      const e = rec.entry(id);
      e.hits++;
      if (canCrit && rng() < critChance(critId)) {
        amount *= rules.healCritMultiplier;
        e.crits++;
      }
      rec.add(id, amount * effective, t);
    };

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
        rec.entry(h.id).ticks++;
        heal(h.id, h.tick, true);
        h.ticksLeft--;
        h.toNext = h.interval;
        if (h.ticksLeft <= 0) {
          hots.splice(idx, 1);
          // Floraison : soin égal à l'Esprit quand Récupération ou Rétablissement expire.
          if (fx.bloomPct && (h.id === 'rejuvenation' || h.id === 'regrowth')) heal('bloom', (d.spirit * fx.bloomPct) / 100, false);
        }
      }
    };
    const hasHot = (id: string, target: number) => hots.some((h) => h.id === id && h.target === target);
    const addHot = (s: SpellDef, target: number, total = hotTotal(s)) => {
      const ticks = s.dotTicks! + extraTicks(s);
      const interval = s.dotDuration! / s.dotTicks!;
      const i = hots.findIndex((h) => h.id === s.id && h.target === target);
      if (i >= 0) hots.splice(i, 1);
      hots.push({ id: s.id, target, ticksLeft: ticks, interval, toNext: interval, tick: total / s.dotTicks!, total });
    };
    const cast = (s: SpellDef, time: number) => {
      mana -= cost(s);
      mm.spend(t);
      rec.entry(s.id).casts++;
      advance(Math.max(rules.gcd / haste, time / haste) + rules.latency);
    };

    while (t < fightLength - EPS) {
      mana += mm.cooldowns(t, mana, rng);
      const rejuv = sp('rejuvenation');
      const regrowth = sp('regrowth');
      const wg = sp('wildGrowth');
      const ht = sp('healingTouch');

      // Prompte guérison : consomme une Récupération pour soigner sa durée complète d'un coup.
      const sm = hots.find((h) => h.id === 'rejuvenation' || h.id === 'regrowth');
      if (o.swiftmend && fx.swiftmend && sm && t >= swiftmendReady) {
        hots.splice(hots.indexOf(sm), 1);
        swiftmendReady = t + 15;
        rec.entry('swiftmend').casts++;
        heal('swiftmend', sm.id === 'rejuvenation' ? sm.total : hotTotal(rejuv), true);
        advance(rules.gcd / haste + rules.latency);
        continue;
      }
      if (o.wildGrowth && fx.wildGrowth && t >= wgReady && mana >= cost(wg)) {
        wgReady = t + (wg.cooldown ?? 6);
        cast(wg, wg.castTime - fx.naturalistSec);
        for (let i = 0; i < o.wildGrowthTargets; i++) addHot(wg, 100 + i);
        continue;
      }
      const target = Array.from({ length: o.hotTargets }, (_, i) => i).find((i) => !hasHot('rejuvenation', i));
      if (target !== undefined && mana >= cost(rejuv)) {
        cast(rejuv, 0);
        addHot(rejuv, target);
        continue;
      }
      if (o.regrowth && !hasHot('regrowth', 0) && mana >= cost(regrowth)) {
        cast(regrowth, regrowth.castTime);
        heal('regrowth', (regrowth.directMin! + rng() * (regrowth.directMax! - regrowth.directMin!) + (regrowth.directCoeff ?? 0) * d.healingPower) * healBonus, true);
        addHot(regrowth, 0);
        continue;
      }
      if (mana < cost(ht)) {
        if (oomAt === fightLength) oomAt = t;
        advance(1);
        continue;
      }
      // Rapidité de la nature : un Toucher guérisseur instantané toutes les 3 minutes.
      const instant = o.naturesSwiftness && fx.naturesSwiftness && t >= nsReady;
      if (instant) {
        nsReady = t + 180;
        rec.entry('naturesSwiftness').casts++;
      }
      const castTime = instant ? 0 : ht.castTime - fx.naturalistSec;
      cast(ht, castTime);
      heal('healingTouch', (ht.directMin! + rng() * (ht.directMax! - ht.directMin!) + (ht.directCoeff ?? 0) * d.healingPower) * healBonus, true);
      // Activité : le reste du temps, personne n'a besoin de soins.
      if (o.activityPct < 100) advance(((Math.max(rules.gcd, castTime) + rules.latency) * (100 - Math.max(5, o.activityPct))) / Math.max(5, o.activityPct));
    }
    rec.extra('manaEnd', mana);
    rec.extra('oomAt', oomAt);
    rec.endFight();
  }
  return rec.finish();
}

/** Chat et Ours : coups blancs au rythme de la forme, techniques, saignements ; en Ours, coups du boss et rage. */
function simulateFeral(config: DruidSimConfig): SimResult {
  const { rules, options: o, fightLength } = config;
  const bear = config.spec === 'bear';
  const mods = config.mods ?? emptyMods();
  const fx = druidTalents(config.talents);
  const d = deriveDruid(rules, config.gear, config.talents, config.spec, mods);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);

  // En forme, l'arme ne compte que par son DPS, ramené à la vitesse de la forme.
  const weapon = config.weapon ?? { min: 1, max: 2, speed: 2, twoHand: false };
  const speed = bear ? rules.bearAttackSpeed : rules.catAttackSpeed;
  const wMin = (weapon.min / weapon.speed) * speed;
  const wMax = (weapon.max / weapon.speed) * speed;
  const haste = 1 + mods.hastePct / 100;
  const physBuff = (mods.dmgMult['school:physical'] ?? 1) * (mods.dmgMult.all ?? 1) * (1 + fx.naturalistPct / 100);
  const armorMult = 1 - armorReduction(rules.bossArmor - mods.armorReduction, rules.level);
  const missWhite = Math.max(0, rules.meleeMissPct - d.hitPct) / 100;
  const dodge = rules.bossDodgePct / 100;
  const parry = bear ? 0.14 : 0; // l'ours tape de face
  const glance = rules.glancingPct / 100;
  const crit = Math.max(0, d.meleeCritPct - rules.critSuppressionPct) / 100;
  const abilityCritMult = 1 + (rules.meleeCritMultiplier - 1) * (1 + fx.naturalInstinctPct / 100);
  const threat = bear ? rules.bearThreatMultiplier : 1;
  const takenMult = 1 - d.damageTakenReduction;
  const gcd = bear ? rules.gcd : 1; // le chat a un temps de recharge global d'une seconde

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let resource = bear ? fx.furorRage : 100; // rage ou énergie
    let nextTick = 2;
    let swingAt = 0;
    let gcdReady = 0;
    let bossSwingAt = bear ? rules.bossSwingSpeed * rng() : Infinity;
    let cp = 0;
    let clearcast = false;
    let omenReady = 0;
    let maulQueued = false;
    let primalReady = 0;
    let lacerateStacks = 0;
    let lacerateUntil = -1;
    let nextLacerateTick = Infinity;
    const bleeds = new Map<string, { ticksLeft: number; next: number; interval: number; tick: number }>();
    let damage = 0;
    let taken = 0;
    const outcome = { swings: 0, avoided: 0, crit: 0, crush: 0 };

    const bleeding = () => bleeds.size > 0 || lacerateStacks > 0;
    const abilityMult = () => physBuff * (bleeding() ? 1 + fx.rendAndTearPct / 100 : 1);
    const addRage = (r: number) => (resource = Math.min(100, resource + r));
    const record = (id: string, dmg: number, threatMult = 1) => {
      damage += dmg;
      rec.add(id, bear ? dmg * threat * threatMult : dmg, t);
    };
    const whiteBase = () => wMin + rng() * (wMax - wMin) + (d.attackPower / 14) * speed;
    const omen = () => {
      if (t >= omenReady && rng() < rules.omenChancePct / 100) {
        clearcast = true;
        omenReady = t + 10;
      }
    };
    /** Attaque spéciale : un jet pour toucher, un autre pour le critique. Renvoie le multiplicateur (0 si raté). */
    const special = (id: string): number => {
      const e = rec.entry(id);
      e.casts++;
      if (rng() < missWhite + dodge + parry) {
        e.misses++;
        return 0;
      }
      e.hits++;
      if (rng() < crit) {
        e.crits++;
        if (bear && rng() < fx.bloodFrenzyRageChance / 100) addRage(5);
        return -abilityCritMult; // négatif : critique
      }
      return 1;
    };

    const whiteSwing = () => {
      const e = rec.entry('melee');
      e.casts++;
      let dmg = whiteBase() * physBuff * armorMult;
      const u = rng();
      if (u < missWhite + dodge + parry) return void e.misses++;
      e.hits++;
      if (u < missWhite + dodge + parry + glance) dmg *= 1 - rules.glancingPenaltyPct / 100;
      else if (u < missWhite + dodge + parry + glance + crit) {
        dmg *= rules.meleeCritMultiplier;
        e.crits++;
        if (bear && rng() < fx.bloodFrenzyRageChance / 100) addRage(5);
      }
      record('melee', dmg);
      if (bear) addRage((dmg / rules.rageConversion) * 7.5);
      omen();
    };

    const maulSwing = () => {
      const s = sp('maul');
      const r = special('maul');
      if (!r) return;
      const dmg = (whiteBase() * (s.directCoeff ?? 1) + s.directMin!) * abilityMult() * (1 + fx.savageFuryPct / 100) * armorMult * Math.abs(r);
      record('maul', dmg, 1.75);
    };

    const costOf = (id: string) => {
      const base = sp(id).manaCost;
      if (id === 'claw' || id === 'rake' || id === 'maul' || id === 'swipe' || id === 'primalBite') return Math.max(0, base - fx.ferocity);
      if (id === 'shred') return Math.max(0, base - fx.shredCut);
      if (id === 'lacerate') return Math.max(0, base - fx.lacerateCut);
      return base;
    };
    const pay = (id: string) => {
      if (clearcast) clearcast = false;
      else resource -= costOf(id);
    };
    const canPay = (id: string) => clearcast || resource >= costOf(id);

    const catBuilder = () => (o.behind ? 'shred' : 'claw');
    const catSteps: Record<string, StepImpl<boolean>> = {
      rip: {
        when: () => cp >= 5 && o.rip && !bleeds.has('rip') && fightLength - t >= 10 && canPay('rip'),
        run: () => {
          pay('rip');
          const r = special('rip');
          if (r) {
            const s = sp('rip');
            const total = (s.dotTotal! + (s.dotCoeff ?? 0) * d.attackPower) * physBuff;
            bleeds.set('rip', { ticksLeft: s.dotTicks!, next: t + s.dotDuration! / s.dotTicks!, interval: s.dotDuration! / s.dotTicks!, tick: total / s.dotTicks! });
            cp = 0;
          }
          return true;
        },
      },
      ferociousBite: {
        when: () => cp >= 5 && o.ferociousBite && canPay('ferociousBite'),
        run: () => {
          const free = clearcast;
          pay('ferociousBite');
          const r = special('ferociousBite');
          if (r) {
            const s = sp('ferociousBite');
            // Énergie restante convertie en dégâts (3,3 par point) ; Discipline prédatrice la garde.
            const extra = resource;
            if (!fx.predatoryDiscipline && !free) resource = 0;
            const dmg = (s.directMin! + rng() * (s.directMax! - s.directMin!) + (s.directCoeff ?? 0) * d.attackPower + extra * 3.3) * abilityMult() * armorMult * Math.abs(r);
            record('ferociousBite', dmg);
            cp = 0;
          }
          return true;
        },
      },
      // Cinq points de combo sans assez d'énergie pour finir : on attend l'énergie pour le coup de grâce.
      pool: { when: () => cp >= 5 && (o.rip || o.ferociousBite), run: () => false },
      rake: {
        when: () => o.rake && !bleeds.has('rake') && fightLength - t >= 9 && canPay('rake'),
        run: () => {
          pay('rake');
          const r = special('rake');
          if (r) {
            const s = sp('rake');
            record('rake', s.directMin! * abilityMult() * (1 + fx.savageFuryPct / 100) * Math.abs(r));
            bleeds.set('rake', { ticksLeft: s.dotTicks!, next: t + s.dotDuration! / s.dotTicks!, interval: s.dotDuration! / s.dotTicks!, tick: (s.dotTotal! / s.dotTicks!) * physBuff * (1 + fx.savageFuryPct / 100) });
            cp = Math.min(5, cp + 1 + (r < 0 && rng() < fx.bloodFrenzyCpChance / 100 ? 1 : 0));
          }
          return true;
        },
      },
      builder: {
        when: () => canPay(catBuilder()),
        run: () => {
          const builder = catBuilder();
          pay(builder);
          const r = special(builder);
          if (r) {
            const s = sp(builder);
            const dmg = (whiteBase() * (s.directCoeff ?? 1) + s.directMin!) * abilityMult() * (1 + fx.savageFuryPct / 100) * armorMult * Math.abs(r);
            record(builder, dmg);
            cp = Math.min(5, cp + 1 + (r < 0 && rng() < fx.bloodFrenzyCpChance / 100 ? 1 : 0));
          }
          return true;
        },
      },
    };
    const catAct = makePriority(DRUID_STEPS.cat, catSteps, config.priority, { time: () => t, fightLength, resource: () => resource, resourceMax: () => 100, combo: () => cp });

    const bearSteps: Record<string, StepImpl<boolean>> = {
      primalBite: {
        when: () => o.primalBite && fx.primalBite && t >= primalReady && canPay('primalBite'),
        run: () => {
          pay('primalBite');
          primalReady = t + (sp('primalBite').cooldown ?? 6);
          const r = special('primalBite');
          if (r) {
            const s = sp('primalBite');
            record('primalBite', (whiteBase() * (s.directCoeff ?? 1) + s.directMin!) * abilityMult() * armorMult * Math.abs(r), 2);
          }
          return true;
        },
      },
      lacerate: {
        when: () => o.lacerate && fx.lacerate && (lacerateStacks < 5 || lacerateUntil - t < 4) && canPay('lacerate'),
        run: () => {
          pay('lacerate');
          const r = special('lacerate');
          if (r) {
            lacerateStacks = Math.min(5, (t < lacerateUntil ? lacerateStacks : 0) + 1);
            lacerateUntil = t + sp('lacerate').dotDuration!;
            if (nextLacerateTick === Infinity) nextLacerateTick = t + 3;
            record('lacerate', 0, 1.5);
          }
          return true;
        },
      },
      swipe: {
        when: () => o.swipe && resource >= costOf('swipe') + o.maulRage,
        run: () => {
          pay('swipe');
          const r = special('swipe');
          if (r) record('swipe', sp('swipe').directMin! * (1 + fx.feralInstinctPct / 100) * (1 + fx.savageFuryPct / 100) * abilityMult() * armorMult * Math.abs(r), 1.75);
          return true;
        },
      },
    };
    const bearAct = makePriority(DRUID_STEPS.bear, bearSteps, config.priority, { time: () => t, fightLength, resource: () => resource, resourceMax: () => 100 });

    const bossSwing = () => {
      outcome.swings++;
      const table = [d.bossMissPct, d.dodgePct, d.bossCritPct, rules.crushingPct];
      let u = rng() * 100;
      let kind = 4;
      for (let i = 0; i < table.length; i++) {
        if (u < table[i]) {
          kind = i;
          break;
        }
        u -= table[i];
      }
      if (kind <= 1) {
        outcome.avoided++;
        if (kind === 1 && rng() < fx.naturalReactionChance / 100) addRage(5);
        return;
      }
      let dmg = rules.bossSwingDamage * takenMult;
      if (kind === 2) {
        outcome.crit++;
        dmg *= 2;
      } else if (kind === 3) {
        outcome.crush++;
        dmg *= 1.5;
      }
      taken += dmg;
      addRage((dmg / rules.rageConversion) * 2.5);
    };

    while (t < fightLength - EPS) {
      if (gcdReady <= t + EPS && (bear ? bearAct() : catAct())) gcdReady = t + gcd + rules.latency;
      if (bear && o.maul && !maulQueued && resource >= costOf('maul') + o.maulRage) maulQueued = true;

      let next = Math.min(swingAt, bossSwingAt, fightLength, nextLacerateTick, bear ? Infinity : nextTick);
      for (const b of bleeds.values()) next = Math.min(next, b.next);
      next = Math.min(next, gcdReady > t + EPS ? gcdReady : t + 0.25);
      t = Math.max(t, next);
      if (t >= fightLength - EPS) break;

      if (!bear && nextTick <= t + EPS) {
        resource = Math.min(100, resource + rules.energyPerTick);
        nextTick += 2;
      }
      if (swingAt <= t + EPS) {
        if (maulQueued && resource >= costOf('maul')) {
          pay('maul');
          maulSwing();
        } else whiteSwing();
        maulQueued = false;
        swingAt = t + speed / haste;
      }
      if (bossSwingAt <= t + EPS) {
        bossSwing();
        bossSwingAt = t + rules.bossSwingSpeed;
      }
      for (const [id, b] of bleeds) {
        if (b.next > t + EPS) continue;
        rec.entry(id).ticks++;
        record(id, b.tick);
        b.ticksLeft--;
        b.next += b.interval;
        if (b.ticksLeft <= 0) bleeds.delete(id);
      }
      if (nextLacerateTick <= t + EPS) {
        if (t < lacerateUntil) {
          const s = sp('lacerate');
          rec.entry('lacerate').ticks++;
          const tick = lacerateStacks * (s.dotTotal! / s.dotTicks! + ((s.dotCoeff ?? 0) * whiteBase()) / s.dotTicks!) * physBuff;
          record('lacerate', tick, 1.5);
          nextLacerateTick = t + 3;
        } else {
          lacerateStacks = 0;
          nextLacerateTick = Infinity;
        }
      }
    }
    rec.extra('damagePerSecond', damage / fightLength);
    if (bear) {
      rec.extra('damageTakenPerSecond', taken / fightLength);
      const n = outcome.swings || 1;
      rec.extra('avoidedPct', (outcome.avoided / n) * 100);
      rec.extra('critTakenPct', (outcome.crit / n) * 100);
      rec.extra('crushTakenPct', (outcome.crush / n) * 100);
    }
    rec.endFight();
  }
  return rec.finish();
}

/** Poids de stats du druide selon le rôle. */
export function druidWeightSpec(spec: DruidSpec): { deltas: Partial<Record<keyof Stats, number>>; base: keyof Stats } {
  if (spec === 'balance') return { deltas: { spellPower: 30, critPct: 1, hitPct: 1, intellect: 30, spirit: 30, mp5: 10 }, base: 'spellPower' };
  if (spec === 'resto') return { deltas: { healingPower: 30, spellPower: 30, intellect: 20, spirit: 20, mp5: 10, critPct: 1 }, base: 'healingPower' };
  return { deltas: { strength: 20, agility: 20, attackPower: 40, critPct: 1, hitPct: 1, weaponDps: 5 }, base: spec === 'bear' ? 'strength' : 'attackPower' };
}
