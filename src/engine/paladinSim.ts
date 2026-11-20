import { PALADIN_DATA, type PaladinOptions, type PaladinRules, type PaladinSeal, type PaladinSpec } from '../data/paladin/data';
import { emptyMods, type SimModifiers, type SpellDef, type Stats, type WeaponInfo } from '../data/types';
import { makePriority, type PriorityList, type StepImpl } from './priority';
import { PALADIN_STEPS } from './rotationSteps';
import { createRng } from './rng';
import { createRecorder, type SimResult } from './simTypes';
import { rank, type TalentPoints } from './talents';

// Simulateur du paladin Forever : Vindicte (dégâts au corps à corps), Protection (menace et
// encaissement) et Sacré (soins). Les valeurs des talents sont lues dans leurs descriptions Forever.

export interface PaladinSimConfig {
  classId: 'paladin';
  spec: PaladinSpec;
  rules: PaladinRules;
  spells: SpellDef[];
  gear: Stats;
  mods?: SimModifiers;
  weapon: WeaponInfo | null;
  talents: TalentPoints;
  options: PaladinOptions;
  fightLength: number;
  iterations: number;
  seed: number;
  priority?: PriorityList;
}

const EPS = 1e-9;

export function paladinTalents(t: TalentPoints) {
  const v = (key: string, re: RegExp) => PALADIN_DATA.talentValue(key, rank(t, key), re);
  return {
    divineStrengthPct: v('divineStrength', /Strength by (\d+)%/),
    healingLightPct: v('healingLight', /by (\d+)%/),
    reverencePct: v('reverence', /Allows (\d+)% of your Mana regeneration/),
    improvedSealsPct: v('improvedSeals', /by (\d+)%/),
    divineFavor: rank(t, 'divineFavor') > 0,
    illuminationChance: v('illumination', /have a (\d+)% chance/),
    illuminationPct: v('illumination', /equal to (\d+)% of the base cost/),
    holyConduitPct: v('holyConduit', /by (\d+)%/),
    divinePrecisionPct: v('divinePrecision', /Holy spells by (\d+)%/),
    infusionSec: v('infusionOfLight', /by ([\d.]+) sec/),
    holyShock: rank(t, 'holyShock') > 0,
    boundlessLightPct: v('boundlessLight', /by (\d+)%/),
    holyPowerPct: v('holyPower', /bonus of your Holy spells by (\d+)%/),
    lightsVigil: rank(t, 'lightsVigil') > 0,
    divineIntellectPct: v('divineIntellect', /Intellect by (\d+)%/),
    redoubtChance: v('redoubt', /have a (\d+)% chance/),
    redoubtBlockPct: v('redoubt', /chance to block by (\d+)%/),
    precisionPct: v('precision', /hit by (\d+)%/),
    shieldSpecChance: v('shieldSpecialization', /a (\d+)% chance to restore/),
    shieldSpecManaPct: v('shieldSpecialization', /restore (\d+)% of your maximum Mana/),
    toughnessPct: v('toughness', /by (\d+)%/),
    improvedRfPct: v('improvedRighteousFury', /reduced by (\d+)%/),
    anticipation: v('anticipation', /by (\d+)/),
    holyShieldTalent: rank(t, 'holyShield') > 0,
    reckoningBlockPct: v('reckoning', /Gives you a (\d+)% chance after Blocking/),
    reckoningCritPct: v('reckoning', /and a (\d+)% chance after receiving/),
    ironCreedPct: v('ironCreed', /by (\d+)%/),
    shieldswornSec: v('shieldsworn', /by (\d+) sec/),
    deflectionPct: v('deflection', /by (\d+)%/),
    benedictionPct: v('benediction', /by (\d+)%/),
    improvedJudgementSec: v('improvedJudgement', /by (\d+) sec/),
    convictionPct: v('conviction', /by (\d+)%/),
    sanctifiedChance: v('sanctifiedJudgement', /a (\d+)% chance to return/),
    sanctifiedPct: v('sanctifiedJudgement', /return (\d+)% of the Mana cost/),
    sealOfCommand: rank(t, 'sealOfCommand') > 0,
    sacredArbiterPct: v('sacredArbiter', /by (\d+)%/),
    twoHandPct: v('twohandedWeaponSpecialization', /by (\d+)%/),
    vengeancePct: v('vengeance', /dealt by (\d+)%/),
    championPct: v('championOfTheLight', /up to (\d+)% of your Intellect/),
    championCastCut: v('championOfTheLight', /by ([\d.]+) sec/),
  };
}

/** Réduction des dégâts physiques par l'armure, pour un attaquant de niveau ≥ 60 (formule Classic). */
export const armorReduction = (armor: number, attackerLevel: number) => {
  const a = Math.max(0, armor);
  return a / (a + 467.5 * attackerLevel - 22167.5);
};

export function derivePaladin(rules: PaladinRules, gear: Stats, talents: TalentPoints, mods: SimModifiers = emptyMods()) {
  const fx = paladinTalents(talents);
  const sm = mods.statMult;
  const strength = (rules.baseStrength + (gear.strength ?? 0)) * sm * (1 + fx.divineStrengthPct / 100);
  const agility = (rules.baseAgility + (gear.agility ?? 0)) * sm;
  const stamina = (rules.baseStamina + gear.stamina) * sm * mods.staminaMult;
  const intellect = (rules.baseIntellect + gear.intellect) * sm * (1 + fx.divineIntellectPct / 100);
  const spirit = (rules.baseSpirit + gear.spirit) * sm;
  const attackPower = rules.baseAttackPower + strength * rules.apPerStr + (gear.attackPower ?? 0);
  const meleeCritPct = rules.baseMeleeCritPct + agility / rules.agiPerCritPct + gear.critPct + fx.convictionPct;
  const spellCritPct = rules.baseSpellCritPct + intellect / rules.intPerSpellCritPct + gear.critPct + fx.convictionPct;
  const hitPct = gear.hitPct + fx.precisionPct;
  const defense = rules.baseDefense + (gear.defense ?? 0) + fx.anticipation;
  const defDiff = (defense - rules.bossDefenseSkill) * 0.04;
  const armor = (gear.armor ?? 0) * (1 + fx.toughnessPct / 100) + agility * 2;
  return {
    strength,
    agility,
    stamina,
    intellect,
    spirit,
    attackPower,
    meleeCritPct,
    spellCritPct,
    hitPct,
    holySpellHitPct: hitPct + fx.divinePrecisionPct,
    meleeHitToCap: Math.max(0, rules.meleeMissPct - hitPct),
    /** Puissance des sorts sacrés offensifs (Champion de la Lumière ajoute une part de l'Intelligence). */
    spellPower: gear.spellPower + (intellect * fx.championPct) / 100,
    healingPower: gear.spellPower + (gear.healingPower ?? 0),
    maxMana: rules.baseMana + intellect * rules.manaPerInt + mods.maxMana,
    maxHealth: rules.baseHealth + stamina * rules.healthPerSta + mods.maxHealth,
    mp5: gear.mp5,
    /** Mana par seconde venant de l'Esprit hors « règle des 5 secondes ». */
    spiritRegen: (rules.regenBase + spirit / rules.regenSpiritDivisor) / 2,
    armor,
    defense,
    dodgePct: Math.max(0, rules.baseDodgePct + agility / rules.agiPerCritPct + (gear.dodgePct ?? 0) + defDiff),
    parryPct: Math.max(0, rules.baseParryPct + (gear.parryPct ?? 0) + fx.deflectionPct + defDiff),
    blockPct: Math.max(0, rules.baseBlockPct + (gear.blockPct ?? 0) + defDiff),
    blockValue: (gear.blockValue ?? 0) + strength / 20,
    bossMissPct: Math.max(0, 5 + defDiff),
    bossCritPct: Math.max(0, 5 - defDiff),
    damageTakenReduction: armorReduction(armor, rules.level + 3),
  };
}

export type PaladinDerived = ReturnType<typeof derivePaladin>;

export function simulatePaladin(config: PaladinSimConfig): SimResult {
  return config.spec === 'holy' ? simulateHoly(config) : simulateMelee(config);
}

const SEAL_SPELL: Record<PaladinSeal, string> = {
  command: 'sealOfCommand',
  righteousness: 'sealOfRighteousness',
  crusader: 'sealOfTheCrusader',
  fury: 'sealOfFury',
};
const JUDGEMENT_SPELL: Record<PaladinSeal, string> = {
  command: 'judgementOfCommand',
  righteousness: 'judgementOfRighteousness',
  crusader: 'judgementOfTheCrusader',
  fury: 'judgementOfFury',
};

/** Vindicte et Protection : coups blancs, sceaux, Jugement, Frappe sacrée, et coups du boss en Protection. */
function simulateMelee(config: PaladinSimConfig): SimResult {
  const { rules, options: o, fightLength } = config;
  const prot = config.spec === 'prot';
  const mods = config.mods ?? emptyMods();
  const fx = paladinTalents(config.talents);
  const d = derivePaladin(rules, config.gear, config.talents, mods);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);

  const weapon = config.weapon ?? { min: 1, max: 2, speed: 2, twoHand: false }; // à mains nues
  const physSpec = weapon.twoHand ? 1 + fx.twoHandPct / 100 : 1.02; // Spécialisation arme à une main : 2 % de base
  const holySpec = weapon.twoHand ? 1 + fx.twoHandPct / 100 : 1;
  const physBuff = mods.dmgMult['school:physical'] ?? 1;
  const holyBuff = (mods.dmgMult['school:holy'] ?? 1) * (mods.dmgMult.all ?? 1);
  const armorMult = 1 - armorReduction(rules.bossArmor - mods.armorReduction, rules.level);
  const haste = 1 + mods.hastePct / 100;

  const missWhite = Math.max(0, rules.meleeMissPct - d.hitPct) / 100;
  const dodge = rules.bossDodgePct / 100;
  const parry = prot ? rules.bossParryPct / 100 : 0; // de dos en Vindicte, de face en Protection
  const glance = rules.glancingPct / 100;
  const critMelee = Math.max(0, d.meleeCritPct - rules.critSuppressionPct) / 100;
  const critSpell = Math.min(100, d.spellCritPct) / 100;
  const spellHit = 1 - Math.max(1, rules.spellMissPct - d.holySpellHitPct) / 100;

  // Le Sceau d'autorité demande le talent : sans lui, on prend le Sceau de piété.
  const mainSeal: PaladinSeal = o.seal === 'command' && !fx.sealOfCommand ? 'righteousness' : o.seal;
  const instantCost = (s: SpellDef) => s.manaCost * (1 - fx.benedictionPct / 100);
  const sealCost = (seal: PaladinSeal) => instantCost(sp(SEAL_SPELL[seal]));
  const judgementCost = 0.06 * rules.baseMana * (1 - fx.benedictionPct / 100);
  const conduit = (s: SpellDef) => s.manaCost * (1 - fx.holyConduitPct / 100) * (1 - fx.benedictionPct / 100);
  const judgementCd = 10 - fx.improvedJudgementSec;
  const holyStrikeCd = (sp('holyStrike').cooldown ?? 10) - fx.shieldswornSec;
  const howCast = Math.max(0, sp('hammerOfWrath').castTime - fx.championCastCut);
  const useShield = prot && o.shield;
  const rf = prot && o.righteousFury;
  // Menace : Fureur vertueuse (+33 %, sacré +90 % en plus), Spécialisation deux mains (−20 %).
  const threatBase = weapon.twoHand && fx.twoHandPct ? 0.8 : 1;
  const threatPhys = threatBase * (rf ? 1.33 : 1);
  const threatHoly = threatBase * (rf ? 2.23 : 1);
  const executeAt = fightLength * 0.8;
  const takenMult = (1 - d.damageTakenReduction) * (rf ? 1 - fx.improvedRfPct / 100 : 1);

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let mana = d.maxMana;
    let lastSpend = -10;
    let gcdReady = 0;
    let swingAt = 0;
    const ready = new Map<string, number>();
    let seal: PaladinSeal | null = null;
    let sealUntil = -1;
    let crusaderOn = o.crusaderJudgement === 'other';
    let openCrusader = o.crusaderJudgement === 'self' && mainSeal !== 'crusader';
    let vengStacks = 0;
    let vengUntil = -1;
    const consTicks: { at: number; base: number }[] = [];
    let hsCharges = 0;
    let hsUntil = -1;
    let redoubtUntil = -1;
    let redoubtCharges = 0;
    let reckStored = 0;
    let lastReckBlock = -10;
    let lastShieldMana = -10;
    let bossSwingAt = prot ? rules.bossSwingSpeed * rng() : Infinity;
    let damage = 0;
    let taken = 0;
    const outcome = { swings: 0, avoided: 0, blocked: 0, crit: 0, crush: 0 };

    const isReady = (id: string) => (ready.get(id) ?? 0) <= t + EPS;
    const veng = () => (t < vengUntil ? 1 + (fx.vengeancePct * vengStacks) / 100 : 1);
    const onCrit = () => {
      if (!fx.vengeancePct) return;
      vengStacks = Math.min(5, (t < vengUntil ? vengStacks : 0) + 1);
      vengUntil = t + 30;
    };
    /** Puissance des sorts sacrés contre la cible (le Jugement du Croisé agit comme un bonus de puissance). */
    const holyPower = () => d.spellPower + (crusaderOn ? (sp('judgementOfTheCrusader').directMin ?? 0) : 0);
    const holyMult = (sealOrJudgement: boolean) => holySpec * veng() * holyBuff * (sealOrJudgement ? 1 + fx.improvedSealsPct / 100 : 1);
    const spend = (cost: number) => {
      mana -= cost;
      lastSpend = t;
    };
    const record = (id: string, dmg: number, holy: boolean, extraThreat = 1) => {
      damage += dmg;
      rec.add(id, prot ? dmg * (holy ? threatHoly : threatPhys) * extraThreat : dmg, t);
    };
    const weaponHit = (scale = 1) => (weapon.min + rng() * (weapon.max - weapon.min) + mods.weaponDamage) * scale + (d.attackPower / 14) * weapon.speed * scale;

    /** Effet du sceau actif sur un coup qui touche. */
    const sealEffect = () => {
      if (seal === 'command') {
        if (rng() >= (rules.sealOfCommandPpm * weapon.speed) / 60) return;
        const s = sp('sealOfCommand');
        let dmg = (0.7 * weaponHit() + (s.directCoeff ?? 0) * holyPower()) * holyMult(true);
        const e = rec.entry('sealOfCommandProc');
        e.casts++;
        e.hits++;
        if (rng() < critMelee) {
          dmg *= rules.meleeCritMultiplier;
          e.crits++;
          onCrit();
        }
        record('sealOfCommandProc', dmg, true);
      } else if (seal === 'righteousness' || seal === 'fury') {
        const s = sp(SEAL_SPELL[seal]);
        const base = s.directMin! + rng() * (s.directMax! - s.directMin!);
        const scaled = seal === 'righteousness' ? (base * weapon.speed) / rules.sorReferenceSpeed : base;
        rec.entry(s.id).hits++;
        record(s.id, (scaled + (s.directCoeff ?? 0) * holyPower()) * holyMult(true), true);
      }
    };

    const whiteSwing = () => {
      const e = rec.entry('melee');
      e.casts++;
      const crusader = seal === 'crusader' ? 1 / 1.4 : 1; // Croisé : 40 % de coups en plus, moins forts chacun
      let dmg = weaponHit(crusader) * physSpec * veng() * physBuff * armorMult;
      const u = rng();
      if (u < missWhite) return void e.misses++;
      if (u < missWhite + dodge + parry) return void e.misses++;
      e.hits++;
      if (u < missWhite + dodge + parry + glance) dmg *= 1 - rules.glancingPenaltyPct / 100;
      else if (u < missWhite + dodge + parry + glance + critMelee) {
        dmg *= rules.meleeCritMultiplier;
        e.crits++;
        onCrit();
      }
      record('melee', dmg, false);
      sealEffect();
    };

    const spellRoll = (id: string, base: number, sealOrJudgement: boolean) => {
      const e = rec.entry(id);
      e.casts++;
      if (rng() >= spellHit) return void e.misses++;
      e.hits++;
      let dmg = base * holyMult(sealOrJudgement);
      if (rng() < critSpell) {
        dmg *= rules.spellCritMultiplier;
        e.crits++;
        onCrit();
      }
      record(id, dmg, true);
    };

    const holyStrike = () => {
      const e = rec.entry('holyStrike');
      e.casts++;
      const u = rng();
      if (u < missWhite + dodge + parry) return void e.misses++;
      e.hits++;
      const s = sp('holyStrike');
      const phys = 0.5 * weaponHit() * physSpec * veng() * physBuff * armorMult;
      const holy = (s.directMin! + rng() * (s.directMax! - s.directMin!) + (s.directCoeff ?? 0) * holyPower()) * holyMult(false);
      let mult = 1 + fx.sacredArbiterPct / 100;
      if (rng() < critMelee) {
        mult *= rules.meleeCritMultiplier;
        e.crits++;
        onCrit();
      }
      const creed = 1 + fx.ironCreedPct / 100;
      record('holyStrike', phys * mult, false, creed);
      record('holyStrike', holy * mult, true, creed);
    };

    /** Choisit et lance la capacité prioritaire. Renvoie false si rien n'est possible maintenant. */
    const wanted = (): PaladinSeal => (openCrusader ? 'crusader' : mainSeal);
    const how = sp('hammerOfWrath');
    const exo = sp('exorcism');
    const cons = sp('consecration');
    const steps: Record<string, StepImpl<boolean>> = {
      seal: {
        when: () => seal !== wanted() || t >= sealUntil - EPS,
        run: () => {
          if (mana < sealCost(wanted())) return false;
          spend(sealCost(wanted()));
          seal = wanted();
          sealUntil = t + 30;
          rec.entry(SEAL_SPELL[wanted()]).casts++;
          return true;
        },
      },
      holyShield: {
        when: () => useShield && o.holyShield && fx.holyShieldTalent && isReady('holyShield') && mana >= instantCost(sp('holyShield')),
        run: () => {
          spend(instantCost(sp('holyShield')));
          ready.set('holyShield', t + (sp('holyShield').cooldown ?? 10));
          hsCharges = 4;
          hsUntil = t + 10;
          rec.entry('holyShield').casts++;
          return true;
        },
      },
      // Il faut un sceau actif pour le juger.
      judgement: {
        when: () => !!seal && t < sealUntil && (o.judgement || openCrusader) && isReady('judgement') && mana >= judgementCost && !(seal === 'crusader' && crusaderOn && !openCrusader),
        run: () => {
          spend(judgementCost);
          ready.set('judgement', t + judgementCd);
          // Jugement sanctifié : une partie du coût du sceau est rendue.
          if (rng() < fx.sanctifiedChance / 100) mana = Math.min(d.maxMana, mana + (sealCost(seal!) * fx.sanctifiedPct) / 100);
          if (seal === 'crusader') {
            crusaderOn = true;
            openCrusader = false;
            rec.entry('judgementOfTheCrusader').casts++;
          } else {
            const s = sp(JUDGEMENT_SPELL[seal!]);
            spellRoll(s.id, s.directMin! + rng() * (s.directMax! - s.directMin!) + (s.directCoeff ?? 0) * holyPower(), true);
          }
          return true;
        },
      },
      holyStrike: {
        when: () => o.holyStrike && isReady('holyStrike') && mana >= instantCost(sp('holyStrike')),
        run: () => {
          spend(instantCost(sp('holyStrike')));
          ready.set('holyStrike', t + holyStrikeCd);
          holyStrike();
          return true;
        },
      },
      hammerOfWrath: {
        when: () => o.hammerOfWrath && t >= executeAt && isReady('hammerOfWrath') && mana >= conduit(how),
        run: () => {
          spend(conduit(how));
          ready.set('hammerOfWrath', t + (how.cooldown ?? 6));
          spellRoll(how.id, how.directMin! + rng() * (how.directMax! - how.directMin!) + (how.directCoeff ?? 0) * holyPower(), false);
          gcdReady = t + Math.max(rules.gcd, howCast) + rules.latency;
          return true;
        },
      },
      exorcism: {
        when: () => o.exorcism && o.undeadOrDemon && isReady('exorcism') && mana >= conduit(exo),
        run: () => {
          spend(conduit(exo));
          ready.set('exorcism', t + (exo.cooldown ?? 15));
          spellRoll(exo.id, exo.directMin! + rng() * (exo.directMax! - exo.directMin!) + (exo.directCoeff ?? 0) * holyPower(), false);
          return true;
        },
      },
      // On garde de quoi relancer le sceau.
      consecration: {
        when: () => o.consecration && isReady('consecration') && mana >= conduit(cons) + sealCost(mainSeal),
        run: () => {
          spend(conduit(cons));
          ready.set('consecration', t + (cons.cooldown ?? 8));
          rec.entry('consecration').casts++;
          const total = cons.dotTotal! + (cons.dotCoeff ?? 0) * holyPower();
          for (let i = 1; i <= cons.dotTicks!; i++) consTicks.push({ at: t + (i * cons.dotDuration!) / cons.dotTicks!, base: total / cons.dotTicks! });
          return true;
        },
      },
    };
    const act = makePriority(PALADIN_STEPS, steps, config.priority, { time: () => t, fightLength, resource: () => mana, resourceMax: () => d.maxMana });

    const bossSwing = () => {
      outcome.swings++;
      const hs = t < hsUntil && hsCharges > 0;
      const redoubt = t < redoubtUntil && redoubtCharges > 0;
      const block = useShield ? d.blockPct + (hs ? 30 : 0) + (redoubt ? fx.redoubtBlockPct : 0) : 0;
      const table = [d.bossMissPct, d.dodgePct, d.parryPct, block, d.bossCritPct, rules.crushingPct];
      let u = rng() * 100;
      let kind = 6; // 0 raté, 1 esquive, 2 parade, 3 blocage, 4 critique, 5 écrasant, 6 coup normal
      for (let i = 0; i < table.length; i++) {
        if (u < table[i]) {
          kind = i;
          break;
        }
        u -= table[i];
      }
      if (kind <= 2) {
        outcome.avoided++;
        return;
      }
      let dmg = rules.bossSwingDamage * takenMult;
      if (kind === 3) {
        outcome.blocked++;
        dmg = Math.max(0, dmg - d.blockValue);
        if (hs) {
          hsCharges--;
          const s = sp('holyShield');
          const e = rec.entry('holyShield');
          e.hits++;
          record('holyShield', (s.directMin! + (s.directCoeff ?? 0) * holyPower()) * holyMult(false), true, 1.2);
        }
        if (redoubt) redoubtCharges--;
        if (t - lastReckBlock >= 1.5 && rng() < fx.reckoningBlockPct / 100) {
          reckStored = Math.min(4, reckStored + 1);
          lastReckBlock = t;
        }
        if (t - lastShieldMana >= 3 && rng() < fx.shieldSpecChance / 100) {
          mana = Math.min(d.maxMana, mana + (d.maxMana * fx.shieldSpecManaPct) / 100);
          lastShieldMana = t;
        }
      } else if (kind === 4) {
        outcome.crit++;
        dmg *= 2;
        if (rng() < fx.reckoningCritPct / 100) reckStored = Math.min(4, reckStored + 1);
      } else if (kind === 5) {
        outcome.crush++;
        dmg *= 1.5;
      }
      taken += dmg;
      if (useShield && rng() < fx.redoubtChance / 100) {
        redoubtUntil = t + 10;
        redoubtCharges = 5;
      }
    };

    while (t < fightLength - EPS) {
      if (gcdReady <= t + EPS && act()) {
        if (gcdReady <= t + EPS) gcdReady = t + rules.gcd + rules.latency;
      }
      // Prochain événement : coup blanc, coup du boss, tick de Consécration, fin du GCD (ou nouvelle tentative).
      let next = Math.min(swingAt, bossSwingAt, fightLength);
      for (const c of consTicks) next = Math.min(next, c.at);
      next = Math.min(next, gcdReady > t + EPS ? gcdReady : t + 0.5);
      const dt = Math.max(0, next - t);
      const spirit = t - lastSpend >= 5 ? d.spiritRegen : (d.spiritRegen * fx.reverencePct) / 100;
      mana = Math.min(d.maxMana, mana + (d.mp5 / 5 + spirit) * dt);
      t = next;
      if (t >= fightLength - EPS) break;
      if (swingAt <= t + EPS) {
        const attacks = 1 + reckStored;
        reckStored = 0;
        for (let i = 0; i < attacks; i++) whiteSwing();
        swingAt = t + weapon.speed / haste / (seal === 'crusader' ? 1.4 : 1);
      }
      if (bossSwingAt <= t + EPS) {
        bossSwing();
        bossSwingAt = t + rules.bossSwingSpeed;
      }
      for (let i = consTicks.length - 1; i >= 0; i--) {
        if (consTicks[i].at <= t + EPS) {
          rec.entry('consecration').ticks++;
          record('consecration', consTicks[i].base * holyMult(false), true);
          consTicks.splice(i, 1);
        }
      }
    }
    rec.extra('damagePerSecond', damage / fightLength);
    rec.extra('manaEnd', mana);
    if (prot) {
      rec.extra('damageTakenPerSecond', taken / fightLength);
      const n = outcome.swings || 1;
      rec.extra('avoidedPct', (outcome.avoided / n) * 100);
      rec.extra('blockedPct', (outcome.blocked / n) * 100);
      rec.extra('critTakenPct', (outcome.crit / n) * 100);
      rec.extra('crushTakenPct', (outcome.crush / n) * 100);
    }
    rec.endFight();
  }
  return rec.finish();
}

/** Sacré : soins en continu jusqu'à la fin du combat, avec la gestion du mana. */
function simulateHoly(config: PaladinSimConfig): SimResult {
  const { rules, options: o, fightLength } = config;
  const mods = config.mods ?? emptyMods();
  const fx = paladinTalents(config.talents);
  const d = derivePaladin(rules, config.gear, config.talents, mods);
  const spells = new Map(config.spells.map((s) => [s.id, s]));
  const sp = (id: string) => spells.get(id)!;
  const rng = createRng(config.seed);
  const rec = createRecorder(fightLength);
  const haste = 1 + mods.hastePct / 100;
  const effective = 1 - o.overhealPct / 100;
  const critMult = 1 + (rules.healCritMultiplier - 1) * (1 + fx.holyPowerPct / 100);
  const healMult = (id: string) => (['holyLight', 'flashOfLight', 'holyShock'].includes(id) ? 1 + fx.healingLightPct / 100 : 1) * (mods.dmgMult.healing ?? 1);
  const instant = (s: SpellDef) => s.manaCost * (1 - fx.benedictionPct / 100);
  const dfCost = 0.04 * rules.baseMana * (1 - fx.benedictionPct / 100);
  const useHs = o.useHolyShock && fx.holyShock;
  const useVigil = o.useLightsVigil && fx.lightsVigil && fx.holyShock;

  for (let it = 0; it < config.iterations; it++) {
    let t = 0;
    let mana = d.maxMana;
    let lastSpend = -10;
    let hsReady = 0;
    let vigilReady = 0;
    let vigilActive = false;
    let dfReady = 0;
    let dfActive = false;
    let potionReady = 0;
    let infusionUntil = -1;
    let hlDebt = 0;
    let oomAt = fightLength;

    const regen = (dt: number) => {
      const spirit = t - lastSpend >= 5 ? d.spiritRegen : (d.spiritRegen * fx.reverencePct) / 100;
      mana = Math.min(d.maxMana, mana + (d.mp5 / 5 + spirit) * dt);
    };
    const advance = (dt: number) => {
      regen(dt);
      t += dt;
    };

    /** Soin d'un sort : critique (Faveur divine, Lumière sans limites), Illumination, Infusion de lumière. */
    const heal = (s: SpellDef, recordId = s.id, targets = 1, extraCrit = 0) => {
      const e = rec.entry(recordId);
      e.casts++;
      for (let i = 0; i < targets; i++) {
        let amount = (s.directMin! + rng() * (s.directMax! - s.directMin!) + (s.directCoeff ?? 0) * d.healingPower) * healMult(s.id);
        e.hits++;
        const forced = dfActive && ['holyLight', 'flashOfLight', 'holyShock'].includes(s.id) && i === 0;
        if (forced || rng() < (d.spellCritPct + extraCrit) / 100) {
          if (forced) dfActive = false;
          amount *= critMult;
          e.crits++;
          if (i === 0 && rng() < fx.illuminationChance / 100) mana = Math.min(d.maxMana, mana + (s.manaCost * fx.illuminationPct) / 100);
          if (i === 0 && (s.id === 'holyShock' || s.id === 'flashOfLight') && fx.infusionSec) infusionUntil = t + 15;
        }
        rec.add(recordId, amount * effective, t);
      }
    };

    while (t < fightLength - EPS) {
      // Hors temps de recharge global : Faveur divine et potion de mana.
      if (o.useDivineFavor && fx.divineFavor && !dfActive && t >= dfReady && mana >= dfCost) {
        mana -= dfCost;
        lastSpend = t;
        dfActive = true;
        dfReady = t + 120;
      }
      if (o.manaPotions && t >= potionReady && d.maxMana - mana >= 2250) {
        mana += 1350 + rng() * 900;
        potionReady = t + 120;
        rec.entry('manaPotion').casts++;
      }

      const vigil = sp('lightsVigil');
      const hs = sp('holyShock');
      // Vigile de Lumière coûte cher : seulement au-dessus de 60 % de mana.
      if (useVigil && t >= vigilReady && !vigilActive && mana >= Math.max(vigil.manaCost + instant(hs), 0.6 * d.maxMana)) {
        mana -= vigil.manaCost;
        lastSpend = t;
        vigilReady = t + (vigil.cooldown ?? 6);
        rec.entry('lightsVigil').casts++;
        advance(Math.max(rules.gcd, vigil.castTime / haste) + rules.latency);
        vigilActive = true;
        continue;
      }
      if (useHs && (t >= hsReady || vigilActive) && mana >= instant(hs)) {
        mana -= instant(hs);
        lastSpend = t;
        heal(hs, 'holyShock', 1, fx.boundlessLightPct);
        if (vigilActive) {
          // Vigile de Lumière : ce Horion sacré n'a pas de temps de recharge et soigne aussi le groupe.
          vigilActive = false;
          heal(vigil, 'lightsVigilParty', o.vigilTargets);
        } else hsReady = t + (hs.cooldown ?? 10);
        advance(rules.gcd + rules.latency);
        continue;
      }

      // Remplissage : une part de Lumière sacrée, le reste en Éclair lumineux.
      hlDebt += o.holyLightPct;
      let s = sp('flashOfLight');
      if (hlDebt >= 100) {
        hlDebt -= 100;
        s = sp('holyLight');
      }
      if (mana < s.manaCost) s = sp('flashOfLight');
      if (mana < s.manaCost) {
        // Plus de mana : on attend d'en regagner assez pour un Éclair lumineux.
        if (oomAt === fightLength) oomAt = t;
        advance(1);
        continue;
      }
      let cast = s.castTime;
      if (s.id === 'holyLight' && t < infusionUntil) {
        cast -= fx.infusionSec;
        infusionUntil = -1;
      }
      cast = Math.max(rules.gcd, cast / haste);
      mana -= s.manaCost;
      lastSpend = t;
      advance(cast + rules.latency);
      heal(s);
      // Activité : le reste du temps, personne n'a besoin de soins (le mana remonte).
      if (o.activityPct < 100) advance(((cast + rules.latency) * (100 - Math.max(5, o.activityPct))) / Math.max(5, o.activityPct));
    }
    rec.extra('manaEnd', mana);
    rec.extra('oomAt', oomAt);
    rec.endFight();
  }
  return rec.finish();
}

/** Poids de stats du paladin : stats testées et stat de référence (EP = 1) selon la spécialisation. */
export function paladinWeightSpec(spec: PaladinSpec): { deltas: Partial<Record<keyof Stats, number>>; base: keyof Stats } {
  if (spec === 'holy') return { deltas: { healingPower: 30, spellPower: 30, intellect: 20, spirit: 20, mp5: 10, critPct: 1 }, base: 'healingPower' };
  if (spec === 'prot')
    return { deltas: { strength: 20, agility: 20, attackPower: 40, hitPct: 1, critPct: 1, spellPower: 30, weaponDps: 5 }, base: 'strength' };
  return { deltas: { strength: 20, agility: 20, attackPower: 40, hitPct: 1, critPct: 1, spellPower: 30, intellect: 30, weaponDps: 5 }, base: 'attackPower' };
}
