import { WARRIOR_DATA, type WarriorOptions, type WarriorRules, type WarriorSpec } from '../data/warrior/data';
import { emptyMods, type SimModifiers, type SpellDef, type Stats, type WeaponInfo } from '../data/types';
import { armorReduction } from './paladinSim';
import { makeCooldownGate, makePriority, type PriorityList, type StepImpl } from './priority';
import { WARRIOR_STEPS, cooldownSteps } from './rotationSteps';
import { createRng } from './rng';
import { createRecorder, type SimResult } from './simTypes';
import { rank, type TalentPoints } from './talents';

// Simulateur du guerrier Forever : rage (dégâts infligés et subis), coups blancs à une ou deux armes, Frappe héroïque,
// Frappe mortelle et Heurtoir (Armes), Sanguinaire et Tourbillon (Fureur), Heurt de bouclier et Vengeance (Protection, menace).

export interface WarriorSimConfig {
  classId: 'warrior';
  spec: WarriorSpec;
  rules: WarriorRules;
  spells: SpellDef[];
  gear: Stats;
  mods?: SimModifiers;
  talents: TalentPoints;
  options: WarriorOptions;
  weapon?: WeaponInfo | null;
  /** Arme de main gauche (Fureur à deux armes) ; null = rien ou un bouclier. */
  offHand?: WeaponInfo | null;
  fightLength: number;
  iterations: number;
  seed: number;
  priority?: PriorityList;
  /** Temps forts : désactivés ou soumis à des conditions. */
  cooldowns?: PriorityList;
}

const EPS = 1e-9;
/** Armes par défaut quand aucune n'est équipée (ordre de grandeur d'un début de raid). */
export const DEFAULT_WARRIOR_2H: WeaponInfo = { min: 150, max: 230, speed: 3.6, twoHand: true };
export const DEFAULT_WARRIOR_1H: WeaponInfo = { min: 80, max: 150, speed: 2.6, twoHand: false };

export function warriorTalents(t: TalentPoints) {
  const v = (key: string, re: RegExp) => WARRIOR_DATA.talentValue(key, rank(t, key), re);
  return {
    improvedHeroicStrike: v('improvedHeroicStrike', /by (\d+) Rage/),
    improvedRendPct: v('improvedRend', /by (\d+)%/),
    angerManagement: rank(t, 'angerManagement') > 0,
    deepWoundsPct: v('deepWounds', /dealing (\d+)%/),
    twoHandPct: v('twohandedWeaponSpecialization', /by (\d+)%/),
    impalePct: v('impale', /by (\d+)%/),
    bloodthrillChance: v('bloodthrill', /a (\d+)% chance/),
    weaponmasterCrit: v('weaponmaster', /critical strike chance by (\d+)%/),
    weaponmasterArmor: v('weaponmaster', /ignore (\d+)%/),
    weaponmasterExtra: v('weaponmaster', /a (\d+)% chance/),
    improvedSlam: rank(t, 'improvedSlam') >= 2,
    improvedOverpowerPct: v('improvedOverpower', /by (\d+)%/),
    mortalStrike: rank(t, 'mortalStrike') > 0,
    boomingVoicePct: v('boomingVoice', /Rage cost by of your Shouts and Howls by (\d+)%/),
    crueltyPct: v('cruelty', /by (\d+)%/),
    unbridledChance: v('unbridledWrath', /a (\d+)% chance/),
    furiousPrecisionPct: v('furiousPrecision', /by (\d+)%/),
    enrageChance: v('enrage', /a (\d+)% chance/),
    dualWieldPct: v('dualWieldSpecialization', /weapon by (\d+)%/),
    dualWieldRagePct: v('dualWieldSpecialization', /attacks by (\d+)%/),
    recklessSwings: rank(t, 'recklessSwings') > 0,
    improvedExecute: v('improvedExecute', /by (\d+)\./),
    improvedBerserkerRage: v('improvedBerserkerRage', /generate (\d+) Rage/),
    deathWish: rank(t, 'deathWish') > 0,
    improvedWhirlwindSec: v('improvedWhirlwind', /by (\d+) sec/),
    improvedWhirlwindPct: v('improvedWhirlwind', /by (\d+)%/),
    flurryPct: v('flurry', /by (\d+)%/),
    bloodthirst: rank(t, 'bloodthirst') > 0,
    improvedBloodragePct: v('improvedBloodrage', /by (\d+)%/),
    shieldSpecPct: v('shieldSpecialization', /shield by (\d+)%/),
    shieldSpecRage: v('shieldSpecialization', /generate (\d+) Rage/),
    anticipation: v('anticipation', /by (\d+)\./),
    improvedRevengePct: v('improvedRevenge', /by (\d+)%/),
    masterOfDefenseRage: v('masterOfDefense', /generate (\d+) Rage/),
    defiancePct: v('defiance', /additional (\d+)%/),
    improvedSunder: v('improvedSunderArmor', /by (\d+)\./),
    focusedRage: v('focusedRage', /by (\d+)\./),
    bastionPct: v('bastion', /by (\d+)%/),
    shieldSlam: rank(t, 'shieldSlam') > 0,
  };
}

export function deriveWarrior(rules: WarriorRules, gear: Stats, talents: TalentPoints, spec: WarriorSpec, mods: SimModifiers = emptyMods(), o?: Pick<WarriorOptions, 'weaponType'>) {
  const fx = warriorTalents(talents);
  const sm = mods.statMult;
  const strength = (rules.baseStrength + (gear.strength ?? 0)) * sm;
  const agility = (rules.baseAgility + (gear.agility ?? 0)) * sm;
  const stamina = (rules.baseStamina + gear.stamina) * sm * mods.staminaMult;
  const hitPct = gear.hitPct;
  const defense = rules.baseDefense + (gear.defense ?? 0) + fx.anticipation;
  const defDiff = (defense - rules.bossDefenseSkill) * 0.04;
  const armor = (gear.armor ?? 0) + agility * 2;
  const stanceCrit = spec === 'fury' ? rules.berserkerCritPct : 0;
  const axeCrit = o?.weaponType === 'axe' ? fx.weaponmasterCrit : 0;
  return {
    strength,
    agility,
    stamina,
    attackPower: rules.baseAttackPower + strength * rules.apPerStr + (gear.attackPower ?? 0),
    critPct: rules.baseCritPct + agility / rules.agiPerCritPct + gear.critPct + fx.crueltyPct + stanceCrit + axeCrit,
    hitPct,
    hitToCap: Math.max(0, rules.missPct - hitPct),
    maxHealth: rules.baseHealth + stamina * rules.healthPerSta + mods.maxHealth,
    armor,
    defense,
    dodgePct: Math.max(0, rules.baseDodgePct + agility / rules.agiPerCritPct + (gear.dodgePct ?? 0) + defDiff),
    parryPct: Math.max(0, rules.baseParryPct + (gear.parryPct ?? 0) + defDiff),
    blockPct: Math.max(0, rules.baseBlockPct + (gear.blockPct ?? 0) + fx.shieldSpecPct + defDiff),
    blockValue: (gear.blockValue ?? 0) + strength / 20,
    bossMissPct: Math.max(0, 5 + defDiff),
    bossCritPct: Math.max(0, 5 - defDiff),
    damageTakenReduction: armorReduction(armor, rules.level + 3),
  };
}

interface Dot {
  ticksLeft: number;
  next: number;
  interval: number;
  tick: number;
}

/** Menace en plus des dégâts (valeurs de Classic). */
const BONUS_THREAT: Record<string, number> = { heroicStrike: 175, revenge: 355, shieldSlam: 250 };

export function simulateWarrior(config: WarriorSimConfig): SimResult {
  const { rules, options: o, fightLength, spec } = config;
  const mods = config.mods ?? emptyMods();
  const fx = warriorTalents(config.talents);
  const d = deriveWarrior(rules, config.gear, config.talents, spec, mods, o);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);
  const haste = 1 + mods.hastePct / 100;
  const prot = spec === 'prot';
  const mh = config.weapon ?? (spec === 'arms' ? DEFAULT_WARRIOR_2H : DEFAULT_WARRIOR_1H);
  const oh = spec === 'fury' ? (config.offHand === undefined ? DEFAULT_WARRIOR_1H : config.offHand) : null;
  const shield = prot && o.shield;
  const armorIgnore = o.weaponType === 'mace' ? fx.weaponmasterArmor / 100 : 0;
  const armorMult = 1 - armorReduction(Math.max(0, rules.bossArmor - mods.armorReduction) * (1 - armorIgnore), rules.level);
  const baseMult =
    (mods.dmgMult.all ?? 1) * (mods.dmgMult['school:physical'] ?? 1) * (mh.twoHand ? 1 + fx.twoHandPct / 100 : 1) *
    (shield ? 1 + fx.bastionPct / 100 : 1) * (prot ? 1 - rules.defensiveDamagePct / 100 : 1);
  const threatMult = prot ? rules.defensiveThreat * (shield ? 1 + fx.defiancePct / 100 : 1) : 1;
  const specialMiss = Math.max(0, rules.missPct - d.hitPct) / 100;
  const whiteMiss = Math.max(0, (oh ? rules.dwMissPct : rules.missPct) - d.hitPct) / 100;
  const ohWhiteMiss = Math.max(0, whiteMiss - fx.furiousPrecisionPct / 100);
  const dodge = rules.bossDodgePct / 100;
  const parry = prot ? rules.bossParryPct / 100 : 0;
  const crit = Math.max(0, d.critPct - rules.critSuppressionPct) / 100;
  const abilityCritMult = 1 + (rules.critMultiplier - 1) * (1 + fx.impalePct / 100);
  const ohMult = (rules.offHandPct / 100) * (1 + fx.dualWieldPct / 100);
  const isSword = o.weaponType === 'sword';
  const cost = (id: string) => {
    let c = sp(id).manaCost;
    if (id === 'heroicStrike') c -= fx.improvedHeroicStrike;
    if (id === 'execute') c -= fx.improvedExecute;
    if (id === 'sunderArmor') c -= fx.improvedSunder;
    if (id === 'battleShout') c *= 1 - fx.boomingVoicePct / 100;
    if (['heroicStrike', 'mortalStrike', 'bloodthirst', 'whirlwind', 'slam', 'overpower', 'execute', 'revenge', 'shieldSlam', 'sunderArmor'].includes(id)) c -= fx.focusedRage;
    return Math.max(0, c);
  };
  // Heurtoir amélioré (2/2) : −5 s de recharge, −0,5 s d'incantation et de temps de recharge global, sans retarder le coup blanc.
  const slamCast = fx.improvedSlam ? Math.max(0.5, sp('slam').castTime - 0.5) : sp('slam').castTime;
  const slamCd = (sp('slam').cooldown ?? 15) - (fx.improvedSlam ? 5 : 0);
  const executeStart = fightLength * (1 - Math.max(0, Math.min(100, rules.executePct)) / 100);
  const weaponRoll = (w: WeaponInfo, ap: number) => w.min + rng() * (w.max - w.min) + mods.weaponDamage + (ap / 14) * w.speed;
  const avgWeapon = (w: WeaponInfo) => (w.min + w.max) / 2 + mods.weaponDamage + (d.attackPower / 14) * w.speed;
  const rageFromHit = (dmg: number) => (dmg * 7.5) / rules.rageConversion;
  const takenMult = 1 - d.damageTakenReduction;

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let rage = 0;
    let gcdReady = 0;
    let nextMh = 0;
    let nextOh = oh ? 0.2 : Infinity;
    let nextBoss = prot ? rules.bossSwingSpeed * rng() : Infinity;
    let nextAnger = fx.angerManagement ? 3 : Infinity;
    let hsQueued = false;
    let flurryLeft = 0;
    let recklessLeft = 0;
    let recklessUntil = -1;
    let deathWishUntil = -1;
    let recklessnessUntil = -1;
    let enrageUntil = -1;
    let opUntil = -1;
    let bloodrageTicks = 0;
    let nextBloodrage = Infinity;
    let sunders = 0;
    let taken = 0;
    const ready = new Map<string, number>();
    const dots = new Map<string, Dot>();

    const isReady = (id: string) => (ready.get(id) ?? 0) <= t + EPS;
    const gain = (n: number) => {
      rage = Math.min(100, rage + n);
    };
    const dmgMult = () => baseMult * (t < deathWishUntil ? 1.2 : 1) * (t < enrageUntil ? 1.1 : 1);
    const critChance = (bonus = 0) => Math.min(1, crit + bonus / 100 + (t < recklessnessUntil ? 1 : 0));
    const speed = (w: WeaponInfo) => w.speed / (flurryLeft > 0 ? 1 + fx.flurryPct / 100 : 1) / haste;
    const record = (id: string, amount: number) => rec.add(id, prot ? (amount + (BONUS_THREAT[id] ?? 0)) * threatMult : amount, t);

    const onCrit = () => {
      if (fx.flurryPct) flurryLeft = 3;
      if (fx.deepWoundsPct) {
        const total = (avgWeapon(mh) * fx.deepWoundsPct) / 100;
        dots.set('deepWounds', { ticksLeft: 4, interval: 3, next: t + 3, tick: total / 4 });
      }
    };

    /** Coup : raté, esquive, parade (de face), éraflure (coups blancs), critique. */
    const strike = (id: string, base: number, kind: 'white' | 'special', opts: { miss?: number; critBonus?: number; noArmor?: boolean } = {}) => {
      const e = rec.entry(id);
      const miss = opts.miss ?? (kind === 'white' ? whiteMiss : specialMiss);
      const u = rng();
      if (u < miss) {
        e.misses++;
        return { dmg: 0, crit: false, dodged: false };
      }
      if (u < miss + dodge + parry) {
        e.misses++;
        return { dmg: 0, crit: false, dodged: u < miss + dodge };
      }
      e.hits++;
      let amount = base * dmgMult() * (opts.noArmor ? 1 : armorMult);
      let isCrit = false;
      if (kind === 'white' && u < miss + dodge + parry + rules.glancingPct / 100) amount *= 1 - rules.glancingPenaltyPct / 100;
      else if (rng() < critChance(opts.critBonus)) {
        amount *= kind === 'white' ? rules.critMultiplier : abilityCritMult;
        e.crits++;
        isCrit = true;
        onCrit();
      }
      record(id, amount);
      if (fx.unbridledChance && rng() < fx.unbridledChance / 100) gain(1);
      return { dmg: amount, crit: isCrit, dodged: false };
    };

    const swing = (hand: 'mh' | 'oh', id = hand === 'mh' ? 'melee' : 'offHand') => {
      const w = hand === 'mh' ? mh : oh!;
      if (flurryLeft > 0) flurryLeft--;
      const swingRage = t < recklessUntil && recklessLeft > 0 ? (recklessLeft--, 5) : 0;
      gain(swingRage);
      // Frappe héroïque : remplace le prochain coup de la main droite ; pas de rage gagnée sur ce coup.
      if (hand === 'mh' && hsQueued && id === 'melee') {
        hsQueued = false;
        if (rage >= cost('heroicStrike')) {
          rage -= cost('heroicStrike');
          const s = sp('heroicStrike');
          rec.entry('heroicStrike').casts++;
          const r = strike('heroicStrike', weaponRoll(w, d.attackPower) + s.directMin!, 'special');
          if (r.dodged) opUntil = t + 5;
          afterMhHit(r.dmg);
          return;
        }
      }
      rec.entry(id).casts++;
      const miss = hand === 'oh' ? (hsQueued ? Math.max(0, specialMiss - fx.furiousPrecisionPct / 100) : ohWhiteMiss) : whiteMiss;
      const r = strike(id, weaponRoll(w, d.attackPower) * (hand === 'oh' ? ohMult : 1), 'white', { miss });
      if (r.dodged) opUntil = t + 5;
      if (r.dmg > 0) gain(rageFromHit(r.dmg) * (hand === 'oh' ? 1 + fx.dualWieldRagePct / 100 : 1));
      if (hand === 'mh') afterMhHit(r.dmg);
    };
    const afterMhHit = (dmg: number) => {
      if (dmg <= 0) return;
      if (fx.bloodthrillChance && dots.has('rend') && rng() < fx.bloodthrillChance / 100) opUntil = t + 5;
      if (isSword && fx.weaponmasterExtra && rng() < fx.weaponmasterExtra / 100) swing('mh', 'extraAttack');
    };

    const bossSwing = () => {
      const table = [d.bossMissPct, d.dodgePct, d.parryPct, shield ? d.blockPct : 0, d.bossCritPct];
      let u = rng() * 100;
      let kind = 5;
      for (let i = 0; i < table.length; i++) {
        if (u < table[i]) {
          kind = i;
          break;
        }
        u -= table[i];
      }
      if (kind === 1 || kind === 2) {
        gain(fx.masterOfDefenseRage);
        ready.set('revengeProc', t + 5);
        return;
      }
      if (kind === 0) return;
      let dmg = rules.bossSwingDamage * takenMult * (kind === 4 ? 2 : 1);
      if (kind === 3) {
        dmg = Math.max(0, dmg - d.blockValue);
        gain(fx.shieldSpecRage);
        ready.set('revengeProc', t + 5);
      }
      taken += dmg;
      gain((dmg * 2.5) / rules.rageConversion);
      if (fx.enrageChance && rng() < fx.enrageChance / 100) enrageUntil = t + 12;
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
        consider(nextBoss, 'boss');
        consider(nextAnger, 'anger');
        consider(nextBloodrage, 'bloodrage');
        for (const [k, dot] of dots) consider(dot.next, `dot:${k}`);
        t = next;
        if (!what || t > fightLength + EPS) break;
        if (what === 'mh') {
          swing('mh');
          nextMh = t + speed(mh);
        } else if (what === 'oh') {
          swing('oh');
          nextOh = t + speed(oh!);
        } else if (what === 'boss') {
          bossSwing();
          nextBoss = t + rules.bossSwingSpeed;
        } else if (what === 'anger') {
          gain(1);
          nextAnger = t + 3;
        } else if (what === 'bloodrage') {
          gain(1 * (1 + fx.improvedBloodragePct / 100));
          bloodrageTicks--;
          nextBloodrage = bloodrageTicks > 0 ? t + 1 : Infinity;
        } else {
          const id = what.slice(4);
          const dot = dots.get(id)!;
          rec.entry(id).ticks++;
          // Les saignements ignorent l'armure.
          record(id, dot.tick * dmgMult());
          dot.ticksLeft--;
          dot.next += dot.interval;
          if (dot.ticksLeft <= 0) dots.delete(id);
        }
      }
    };

    const spend = (id: string, gcd = rules.gcd) => {
      rage -= cost(id);
      if (sp(id).cooldown) ready.set(id, t + sp(id).cooldown!);
      gcdReady = t + gcd + rules.latency;
      rec.entry(id).casts++;
    };
    const can = (id: string) => isReady(id) && rage >= cost(id);

    const s = (id: string) => sp(id);
    const steps: Record<string, StepImpl<boolean>> = {
      shieldSlam: {
        when: () => prot && fx.shieldSlam && shield && can('shieldSlam'),
        run: () => {
          spend('shieldSlam');
          const sl = s('shieldSlam');
          strike('shieldSlam', sl.directMin! + rng() * (sl.directMax! - sl.directMin!) + d.blockValue, 'special');
          return true;
        },
      },
      revenge: {
        when: () => prot && o.revenge && (ready.get('revengeProc') ?? -1) > t && can('revenge'),
        run: () => {
          spend('revenge');
          ready.set('revengeProc', -1);
          const rv = s('revenge');
          strike('revenge', (rv.directMin! + rng() * (rv.directMax! - rv.directMin!) + rv.directCoeff! * d.attackPower) * (1 + fx.improvedRevengePct / 100), 'special');
          return true;
        },
      },
      sunderArmor: {
        when: () => prot && o.sunderArmor && can('sunderArmor'),
        run: () => {
          spend('sunderArmor');
          // Fracasser armure ne fait pas de dégâts : seule la menace compte.
          if (rng() < specialMiss + dodge + parry) rec.entry('sunderArmor').misses++;
          else {
            rec.entry('sunderArmor').hits++;
            sunders = Math.min(5, sunders + 1);
            rec.add('sunderArmor', rules.sunderThreat * threatMult, t);
          }
          return true;
        },
      },
      execute: {
        when: () => !prot && o.execute && t >= executeStart && rage >= cost('execute'),
        run: () => {
          const extra = rage - cost('execute');
          spend('execute');
          rage = 0;
          strike('execute', s('execute').directMin! + 15 * extra, 'special');
          return true;
        },
      },
      bloodthirst: {
        when: () => spec === 'fury' && fx.bloodthirst && can('bloodthirst'),
        run: () => {
          spend('bloodthirst');
          strike('bloodthirst', s('bloodthirst').directCoeff! * d.attackPower + s('bloodthirst').directMin!, 'special');
          return true;
        },
      },
      mortalStrike: {
        when: () => spec !== 'fury' && fx.mortalStrike && can('mortalStrike'),
        run: () => {
          spend('mortalStrike');
          strike('mortalStrike', weaponRoll(mh, d.attackPower) + s('mortalStrike').directMin!, 'special');
          return true;
        },
      },
      rend: {
        when: () => spec === 'arms' && o.rend && !dots.has('rend') && can('rend'),
        run: () => {
          spend('rend');
          if (rng() < specialMiss + dodge) rec.entry('rend').misses++;
          else {
            rec.entry('rend').hits++;
            const r = s('rend');
            dots.set('rend', { ticksLeft: r.dotTicks!, interval: r.dotDuration! / r.dotTicks!, next: t + 3, tick: (r.dotTotal! * (1 + fx.improvedRendPct / 100)) / r.dotTicks! });
          }
          return true;
        },
      },
      overpower: {
        when: () => spec === 'arms' && o.overpower && t < opUntil && can('overpower'),
        run: () => {
          spend('overpower');
          opUntil = -1;
          strike('overpower', weaponRoll(mh, d.attackPower) + s('overpower').directMin!, 'special', { miss: specialMiss, critBonus: fx.improvedOverpowerPct });
          return true;
        },
      },
      whirlwind: {
        when: () => spec === 'fury' && o.whirlwind && can('whirlwind'),
        run: () => {
          spend('whirlwind');
          ready.set('whirlwind', t + (s('whirlwind').cooldown ?? 10) - fx.improvedWhirlwindSec);
          const ww = 1 + fx.improvedWhirlwindPct / 100;
          strike('whirlwind', weaponRoll(mh, d.attackPower) * ww, 'special');
          if (oh) strike('whirlwind', weaponRoll(oh, d.attackPower) * ohMult * ww, 'special');
          return true;
        },
      },
      slam: {
        when: () => spec === 'arms' && o.slam && isReady('slam') && rage >= cost('slam'),
        run: () => {
          rage -= cost('slam');
          ready.set('slam', t + slamCd);
          rec.entry('slam').casts++;
          const cast = slamCast / haste;
          gcdReady = t + Math.max(fx.improvedSlam ? 1 : rules.gcd, cast) + rules.latency;
          // Sans Heurtoir amélioré, l'incantation retarde le prochain coup blanc.
          if (!fx.improvedSlam) nextMh = Math.max(nextMh, t + cast + 0.01);
          advance(cast);
          if (t <= fightLength + EPS) strike('slam', weaponRoll(mh, d.attackPower) + s('slam').directMin!, 'special');
          return true;
        },
      },
    };
    const act = makePriority(WARRIOR_STEPS[spec], steps, config.priority, { time: () => t, fightLength, resource: () => rage, resourceMax: () => 100 });
    const cd = makeCooldownGate(cooldownSteps('warrior', spec), config.cooldowns, { time: () => t, fightLength, resource: () => rage, resourceMax: () => 100 });

    while (t < fightLength - EPS) {
      // Hors temps de recharge global : Rage sanguinaire, Rage berserker, Frappes téméraires, Souhait mortel, Témérité.
      if (o.bloodrage && isReady('bloodrage') && cd('bloodrage')) {
        gain(10 * (1 + fx.improvedBloodragePct / 100));
        bloodrageTicks = 10;
        nextBloodrage = t + 1;
        ready.set('bloodrage', t + 60);
        rec.entry('bloodrage').casts++;
      }
      if (spec === 'fury' && o.berserkerRage && fx.improvedBerserkerRage && isReady('berserkerRage') && cd('berserkerRage')) {
        gain(fx.improvedBerserkerRage);
        ready.set('berserkerRage', t + 30);
        rec.entry('berserkerRage').casts++;
      }
      if (o.recklessSwings && fx.recklessSwings && isReady('recklessSwings') && cd('recklessSwings')) {
        recklessLeft = 4;
        recklessUntil = t + 8;
        ready.set('recklessSwings', t + 15);
        rec.entry('recklessSwings').casts++;
      }
      if (!prot && o.deathWish && fx.deathWish && isReady('deathWish') && rage >= 10 && cd('deathWish')) {
        rage -= 10;
        deathWishUntil = t + 30;
        ready.set('deathWish', t + 180);
        rec.entry('deathWish').casts++;
      }
      if (spec === 'fury' && o.recklessness && isReady('recklessness') && t >= Math.max(0, fightLength - 15 - 1) && cd('recklessness')) {
        recklessnessUntil = t + 15;
        ready.set('recklessness', t + 1800);
        rec.entry('recklessness').casts++;
      }
      // Frappe héroïque en file quand la rage déborde (pas pendant l'Exécution).
      const executing = !prot && o.execute && t >= executeStart;
      hsQueued = o.heroicStrike && !executing && rage >= Math.max(cost('heroicStrike'), o.heroicStrikeRage);
      if (t < gcdReady - EPS) {
        advance(gcdReady - t);
        continue;
      }
      if (act()) continue;
      advance(Math.max(0.05, Math.min(0.5, Math.min(nextMh, nextOh, nextBoss) - t + EPS)));
    }
    if (prot) rec.extra('damageTakenPerSecond', taken / fightLength);
    rec.extra('sunders', sunders);
    rec.endFight();
  }
  return rec.finish();
}

export function warriorWeightSpec(spec: WarriorSpec): { deltas: Partial<Record<keyof Stats, number>>; base: keyof Stats } {
  if (spec === 'prot') return { deltas: { attackPower: 60, strength: 30, critPct: 1, hitPct: 1, blockValue: 30, weaponDps: 5 }, base: 'attackPower' };
  return { deltas: { attackPower: 60, strength: 30, agility: 30, critPct: 1, hitPct: 1, weaponDps: 5 }, base: 'attackPower' };
}
