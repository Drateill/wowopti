import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { BUFF_BY_ID, buffVisible, enchantMods, enchantStats, type EnchantRef } from '../data/buffs';
import { CLASS_BY_ID, DEFAULT_DRUID_OPTIONS, DEFAULT_MAGE_OPTIONS, DEFAULT_PALADIN_OPTIONS, DEFAULT_PRIEST_OPTIONS, DEFAULT_HUNTER_OPTIONS, DEFAULT_ROGUE_OPTIONS, DEFAULT_SHAMAN_OPTIONS, DEFAULT_WARRIOR_OPTIONS, type ClassId, type ClassModule } from '../data/classes';
import type { MageOptions, MageRules, MageSpec } from '../data/mage/data';
import type { PriestOptions, PriestRules, PriestSpec } from '../data/priest/data';
import type { HunterOptions, HunterRules, HunterSpec } from '../data/hunter/data';
import type { RogueOptions, RogueRules, RogueSpec } from '../data/rogue/data';
import type { ShamanOptions, ShamanRules, ShamanSpec } from '../data/shaman/data';
import type { WarriorOptions, WarriorRules, WarriorSpec } from '../data/warrior/data';
import type { DruidOptions, DruidRules, DruidSpec } from '../data/druid/data';
import type { PaladinOptions, PaladinRules, PaladinSpec } from '../data/paladin/data';
import { parseSetBonus, type ItemSet } from '../data/setBonus';
import { emptyMods, emptyStats, mergeMods, type GameRules, type Lang, type Localized, type SimModifiers, type SpellDef, type Stats, type WeaponInfo } from '../data/types';
import type { DruidSimConfig } from '../engine/druidSim';
import type { MageSimConfig } from '../engine/mageSim';
import type { PriestSimConfig } from '../engine/priestSim';
import type { HunterSimConfig } from '../engine/hunterSim';
import type { RogueSimConfig } from '../engine/rogueSim';
import type { ShamanSimConfig } from '../engine/shamanSim';
import type { WarriorSimConfig } from '../engine/warriorSim';
import type { PaladinSimConfig } from '../engine/paladinSim';
import type { PriorityList } from '../engine/priority';
import { cooldownKey } from '../engine/rotationSteps';
import type { StatWeight } from '../engine/simTypes';
import { pointsInTree, type TalentPoints } from '../engine/talents';
import type { RaidBuffs, RotationOptions, SimConfig } from '../engine/warlockSim';

export const SLOTS = [
  'head', 'neck', 'shoulders', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet',
  'finger1', 'finger2', 'trinket1', 'trinket2', 'mainHand', 'offHand', 'ranged',
] as const;

export type SlotId = (typeof SLOTS)[number];

/** Famille d'emplacement : une bague va dans Doigt 1 ou 2, etc. */
export const slotFamily = (slot: SlotId): string => slot.replace(/[12]$/, '');
export const FAMILIES = [...new Set(SLOTS.map(slotFamily))];

export interface Item {
  id: string;
  name: Localized;
  slot: string; // famille d'emplacement
  stats: Stats;
  icon?: string;
  quality?: number;
  itemLevel?: number;
  wowheadId?: number;
  set?: ItemSet | null;
  weapon?: WeaponInfo | null;
}

/** Ce qui change d'un profil à l'autre (la bibliothèque d'objets est commune à la classe). */
export interface ProfileData {
  spec: string;
  talents: TalentPoints;
  equipped: Partial<Record<SlotId, string>>;
  enchants: Partial<Record<SlotId, EnchantRef>>;
  consumables: string[];
  extraStats: Stats;
  /** Démoniste : rotation et démons. */
  rotation: RotationOptions;
  buffs: RaidBuffs;
  /** Paladin : sceau, rotation, options de soin et de tank. */
  pal: PaladinOptions;
  /** Druide : forme, rotation, soins. */
  dru: DruidOptions;
  /** Mage : sort de remplissage, temps forts, gestion du mana. */
  mage: MageOptions;
  /** Prêtre : rotation d'Ombre, soins. */
  pri: PriestOptions;
  /** Chasseur : familier, tirs, corps à corps de Survie. */
  hun: HunterOptions;
  /** Voleur : techniques, poisons, temps forts. */
  rog: RogueOptions;
  /** Guerrier : rotation, rage, Protection. */
  war: WarriorOptions;
  /** Chaman : sorts, arme, soins. */
  sha: ShamanOptions;
  fightLength: number;
  /** Nombre de cibles (sorts de zone). */
  targets: number;
  /** Part du combat passée à se déplacer, en %. */
  movementPct: number;
  /** Rotation personnalisée, par spécialisation (ordre, étapes désactivées, conditions). */
  priority: Partial<Record<string, PriorityList>>;
}

export const PROFILE_KEYS: (keyof ProfileData)[] = ['spec', 'talents', 'equipped', 'enchants', 'consumables', 'extraStats', 'rotation', 'buffs', 'pal', 'dru', 'mage', 'pri', 'hun', 'rog', 'war', 'sha', 'fightLength', 'targets', 'movementPct', 'priority'];

export interface Profile {
  id: string;
  name: string;
  data: ProfileData;
}

export const profileOf = (s: AppState): ProfileData =>
  Object.fromEntries(PROFILE_KEYS.map((k) => [k, s[k]])) as unknown as ProfileData;

export interface AppState extends ProfileData {
  version: 3;
  classId: ClassId;
  lang: Lang;
  items: Item[];
  profiles: Profile[];
  iterations: number;
  rules: Record<string, number | boolean>;
  spells: SpellDef[];
  weights: StatWeight[] | null;
  /** Dernier personnage importé depuis Blizzard (pour le mettre à jour d'un clic). */
  character?: { slug: string; name: string };
}

const browserLang = (): Lang => {
  try {
    return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
  } catch {
    return 'fr';
  }
};

/** Options de paladin adaptées à une spécialisation (sceau, bouclier, Fureur vertueuse…). */
export function paladinPreset(spec: string, base: PaladinOptions = DEFAULT_PALADIN_OPTIONS): PaladinOptions {
  if (spec === 'prot') return { ...base, seal: 'fury', shield: true, righteousFury: true, consecration: true, crusaderJudgement: 'none' };
  if (spec === 'holy') return { ...base, seal: 'righteousness', shield: false, righteousFury: false };
  return { ...base, seal: 'command', shield: false, righteousFury: false, consecration: false };
}

/** Rotation et démons du démoniste adaptés à la spécialisation. */
export function warlockPreset(spec: string, rotation: RotationOptions, buffs: RaidBuffs): { rotation: RotationOptions; buffs: RaidBuffs } {
  if (spec === 'affliction')
    return { rotation: { ...rotation, bane: 'agony', corruption: true, siphonLife: true, wrack: true, immolate: false, conflagrate: false, filler: 'shadowBolt' }, buffs: { ...buffs, sacrificed: 'none', activePet: 'imp' } };
  if (spec === 'demonology')
    return { rotation: { ...rotation, bane: 'agony', corruption: true, siphonLife: false, wrack: false, immolate: true, conflagrate: false, filler: 'shadowBolt' }, buffs: { ...buffs, sacrificed: 'imp', activePet: 'succubus' } };
  if (spec === 'destruction')
    return { rotation: { ...rotation, bane: 'agony', corruption: true, siphonLife: false, wrack: false, immolate: true, conflagrate: true, filler: 'incinerate' }, buffs: { ...buffs, sacrificed: 'none', activePet: 'imp' } };
  return { rotation, buffs };
}

/** Options de druide adaptées au rôle (forme de sélénien, rotation farouche). */
export function druidPreset(spec: string, base: DruidOptions = DEFAULT_DRUID_OPTIONS): DruidOptions {
  if (spec === 'balance') return { ...base, moonkin: true };
  if (spec === 'resto') return { ...base, moonkin: false };
  return base;
}

/** Options de mage adaptées à la spécialisation (sort de remplissage). */
export function magePreset(spec: string, base: MageOptions = DEFAULT_MAGE_OPTIONS): MageOptions {
  return { ...base, filler: spec === 'fire' ? 'fireball' : 'frostbolt' };
}

/** Options de prêtre adaptées à la spécialisation (boucliers en Discipline, Rénovations en Sacré). */
export function priestPreset(spec: string, base: PriestOptions = DEFAULT_PRIEST_OPTIONS): PriestOptions {
  if (spec === 'disc') return { ...base, shieldTargets: 2, renewTargets: 1 };
  if (spec === 'holy') return { ...base, shieldTargets: 1, renewTargets: 2 };
  return base;
}

/** Options de chasseur adaptées à la spécialisation (Loup solitaire en Précision, mêlée en Survie). */
export function hunterPreset(spec: string, base: HunterOptions = DEFAULT_HUNTER_OPTIONS): HunterOptions {
  if (spec === 'mm') return { ...base, pet: false, sixSecondShot: 'aimedShot' };
  return { ...base, pet: true };
}

/** Options de voleur adaptées à la spécialisation (technique de base, type d'arme, Rupture). */
export function roguePreset(spec: string, base: RogueOptions = DEFAULT_ROGUE_OPTIONS): RogueOptions {
  if (spec === 'assassination') return { ...base, builder: 'mutilate', weaponType: 'dagger', rupture: false };
  if (spec === 'subtlety') return { ...base, builder: 'hemorrhage', weaponType: 'dagger', rupture: true };
  return { ...base, builder: 'sinisterStrike', weaponType: 'sword', rupture: false };
}

/** Options de guerrier adaptées à la spécialisation. */
export function warriorPreset(spec: string, base: WarriorOptions = DEFAULT_WARRIOR_OPTIONS): WarriorOptions {
  if (spec === 'arms') return { ...base, rend: true, slam: true, heroicStrikeRage: 60 };
  if (spec === 'prot') return { ...base, shield: true, heroicStrikeRage: 40 };
  return { ...base, rend: false, heroicStrikeRage: 50 };
}

/** Options de chaman adaptées à la spécialisation. */
export function shamanPreset(spec: string, base: ShamanOptions = DEFAULT_SHAMAN_OPTIONS): ShamanOptions {
  if (spec === 'enhancement') return { ...base, shock: 'earthShock', searingTotem: true, chainLightning: false };
  if (spec === 'elemental') return { ...base, shock: 'flameShock', chainLightning: false };
  return base;
}

/** Toutes les options de classe ramenées aux réglages de la spécialisation choisie. */
export function specPresets(spec: string, state: AppState): Partial<AppState> {
  return {
    pal: paladinPreset(spec, state.pal),
    dru: druidPreset(spec, state.dru),
    mage: magePreset(spec, state.mage),
    pri: priestPreset(spec, state.pri),
    hun: hunterPreset(spec, state.hun),
    rog: roguePreset(spec, state.rog),
    war: warriorPreset(spec, state.war),
    sha: shamanPreset(spec, state.sha),
    ...warlockPreset(spec, state.rotation, state.buffs),
  };
}

const BASE_ROTATION: RotationOptions = { bane: 'agony', corruption: true, immolate: true, siphonLife: true, conflagrate: false, wrack: false, filler: 'shadowBolt', petAttacks: true };
const BASE_BUFFS: RaidBuffs = { shadowDamagePct: 0, fireDamagePct: 0, sacrificed: 'none', activePet: 'imp', raidIsbUptime: 0 };

export function defaultState(classId: ClassId): AppState {
  const cls = CLASS_BY_ID[classId];
  const spec = cls.specs[0];
  return {
    version: 3,
    classId,
    lang: 'fr',
    spec: spec.id,
    talents: spec.defaultTalents,
    items: [],
    profiles: [],
    equipped: {},
    enchants: {},
    consumables: [],
    extraStats: cls.defaultExtraStats,
    ...warlockPreset(spec.id, BASE_ROTATION, BASE_BUFFS),
    pal: paladinPreset(spec.id),
    dru: druidPreset(spec.id),
    mage: magePreset(spec.id),
    pri: priestPreset(spec.id),
    hun: hunterPreset(spec.id),
    rog: roguePreset(spec.id),
    war: warriorPreset(spec.id),
    sha: shamanPreset(spec.id),
    fightLength: 180,
    targets: 1,
    movementPct: 0,
    priority: {},
    iterations: 2000,
    rules: cls.defaultRules,
    spells: cls.spells,
    weights: null,
  };
}

/** État par défaut du démoniste (utilisé par les tests et les anciens appels). */
export const DEFAULT_STATE: AppState = defaultState('warlock');

type Action = { type: 'set'; patch: Partial<AppState> } | { type: 'reset' };

function reducer(state: AppState, action: Action): AppState {
  if (action.type === 'reset') return { ...defaultState(state.classId), lang: state.lang };
  return { ...state, ...action.patch };
}

const storageKey = (classId: ClassId) => `forever-theorycraft:${classId}:v2`;
export const CLASS_KEY = 'forever-theorycraft:class';
const LANG_KEY = 'forever-theorycraft:lang';

/** Complète un état sauvegardé par une version précédente (nouveaux champs, nouveaux sorts). */
export function migrate(parsed: Partial<Omit<AppState, 'version'>> & { version?: number }, classId: ClassId = parsed.classId ?? 'warlock'): AppState {
  const base = defaultState(classId);
  const spells = parsed.spells ?? base.spells;
  const cls = CLASS_BY_ID[classId];
  const fixSpec = (d: Partial<ProfileData>): string => {
    if (d.spec && cls.specs.some((s) => s.id === d.spec)) return d.spec;
    const counts = cls.trees.map((_, i) => pointsInTree(d.talents ?? {}, cls.talents, i));
    const main = counts.indexOf(Math.max(...counts));
    return (cls.specs.find((s) => s.tree === main) ?? cls.specs[0]).id;
  };
  const withProfile = (d: Partial<ProfileData>): ProfileData => ({
    ...profileOf(base),
    ...d,
    spec: fixSpec(d),
    rotation: { ...base.rotation, ...d.rotation },
    buffs: { ...base.buffs, ...d.buffs },
    pal: { ...base.pal, ...d.pal },
    dru: { ...base.dru, ...d.dru },
    mage: { ...base.mage, ...d.mage },
    pri: { ...base.pri, ...d.pri },
    hun: { ...base.hun, ...d.hun },
    rog: { ...base.rog, ...d.rog },
    war: { ...base.war, ...d.war },
    sha: { ...base.sha, ...d.sha },
    priority: { ...d.priority },
  });
  return {
    ...base,
    ...parsed,
    ...withProfile(parsed),
    version: 3,
    classId,
    rules: { ...base.rules, ...parsed.rules },
    spells: [...spells, ...base.spells.filter((d) => !spells.some((s) => s.id === d.id))],
    profiles: (parsed.profiles ?? []).map((p) => ({ ...p, data: withProfile(p.data) })),
  };
}

function load(classId: ClassId): AppState {
  let lang: Lang = browserLang();
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'fr' || saved === 'en') lang = saved;
    const raw = localStorage.getItem(storageKey(classId));
    if (raw) {
      const parsed = JSON.parse(raw) as Omit<AppState, 'version'> & { version: number };
      if (parsed.version === 2 || parsed.version === 3) return { ...migrate(parsed, classId), lang: saved === 'fr' || saved === 'en' ? lang : parsed.lang };
    }
  } catch {
    /* stockage indisponible */
  }
  return { ...defaultState(classId), lang };
}

interface StoreValue {
  state: AppState;
  cls: ClassModule;
  set: (patch: Partial<AppState>) => void;
  reset: () => void;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children, classId = 'warlock' }: { children: ReactNode; classId?: ClassId }) {
  const [state, dispatch] = useReducer(reducer, classId, load);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(state.classId), JSON.stringify(state));
      localStorage.setItem(LANG_KEY, state.lang);
    } catch {
      /* stockage indisponible : l'app fonctionne quand même */
    }
  }, [state]);
  const value = useMemo(
    () => ({
      state,
      cls: CLASS_BY_ID[state.classId],
      set: (patch: Partial<AppState>) => dispatch({ type: 'set', patch }),
      reset: () => dispatch({ type: 'reset' }),
    }),
    [state],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore hors du StoreProvider');
  return v;
}

export function addStats(a: Stats, b: Partial<Stats>): Stats {
  const out = { ...a };
  for (const k of Object.keys(b) as (keyof Stats)[]) out[k] = (a[k] ?? 0) + (b[k] ?? 0);
  return out;
}

export interface ActiveSet {
  set: ItemSet;
  pieces: number;
  bonuses: { count: number; active: boolean; simulated: boolean; text: Localized }[];
}

type GearInput = Pick<AppState, 'items' | 'equipped' | 'extraStats' | 'enchants' | 'consumables'> & Partial<Pick<AppState, 'classId' | 'spec'>>;

/**
 * Tout ce que le personnage porte et consomme : objets, bonus d'ensemble, enchantements,
 * consommables, buffs et débuffs. Renvoie les stats, les effets de sort et l'arme portée.
 */
export function computeGear(state: GearInput): { stats: Stats; mods: SimModifiers; sets: ActiveSet[]; weapon: WeaponInfo | null; rangedWeapon: WeaponInfo | null; offHandWeapon: WeaponInfo | null; shield: boolean } {
  let stats = addStats(emptyStats(), state.extraStats);
  let mods = emptyMods();
  let weapon: WeaponInfo | null = null;
  let rangedWeapon: WeaponInfo | null = null;
  let offHandWeapon: WeaponInfo | null = null;
  let shield = false;
  const sets = new Map<number, { set: ItemSet; ids: Set<string> }>();
  for (const [slot, id] of Object.entries(state.equipped)) {
    const item = state.items.find((i) => i.id === id);
    if (!item) continue;
    stats = addStats(stats, item.stats);
    if (slot === 'mainHand' && item.weapon) weapon = item.weapon;
    if (slot === 'ranged' && item.weapon) rangedWeapon = item.weapon;
    if (slot === 'offHand' && item.weapon) offHandWeapon = item.weapon;
    if (slot === 'offHand' && (item.stats.blockValue ?? 0) > 0) shield = true;
    if (item.set) {
      const entry = sets.get(item.set.id) ?? { set: item.set, ids: new Set<string>() };
      entry.ids.add(item.id); // une même pièce portée deux fois ne compte qu'une fois
      sets.set(item.set.id, entry);
    }
    const ench = enchantStats(state.enchants?.[slot as SlotId], item.slot);
    if (ench) stats = addStats(stats, ench);
    const em = enchantMods(state.enchants?.[slot as SlotId], item.slot);
    if (em) mods = mergeMods(mods, em);
  }
  const active: ActiveSet[] = [];
  for (const { set, ids } of sets.values()) {
    const pieces = ids.size;
    const bonuses = set.bonuses.map((b) => {
      const parsed = parseSetBonus(b.text.en);
      const on = pieces >= b.count;
      if (on) {
        stats = addStats(stats, parsed.stats);
        mods = mergeMods(mods, parsed.mods);
      }
      return { count: b.count, active: on, simulated: parsed.simulated, text: b.text };
    });
    active.push({ set, pieces, bonuses });
  }
  for (const id of state.consumables ?? []) {
    const buff = BUFF_BY_ID.get(id);
    // Un buff d'une autre spécialisation (resté coché avant un changement de spé) ne compte pas.
    if (!buff || (state.classId && !buffVisible(buff, state.classId, state.spec ?? ''))) continue;
    if (buff.stats) stats = addStats(stats, buff.stats);
    if (buff.mods) mods = mergeMods(mods, buff.mods);
  }
  return { stats, mods, sets: active, weapon, rangedWeapon, offHandWeapon, shield };
}

/** Total des stats (objets, sets, enchantements, consommables, bonus divers). */
export const gearStats = (state: GearInput): Stats => computeGear(state).stats;

export type AnySimConfig = (SimConfig & { classId?: 'warlock' }) | PaladinSimConfig | DruidSimConfig | MageSimConfig | PriestSimConfig | HunterSimConfig | RogueSimConfig | WarriorSimConfig | ShamanSimConfig;

type ConfigOverrides = Partial<Pick<SimConfig, 'iterations' | 'seed' | 'fightLength'>>;

/** Configuration de simulation de la classe de l'état. */
export function buildConfig(state: AppState, overrides: ConfigOverrides = {}): AnySimConfig {
  const { stats, mods, weapon, rangedWeapon, offHandWeapon, shield } = computeGear(state);
  const healer = CLASS_BY_ID[state.classId].specs.find((s) => s.id === state.spec)?.metric === 'hps';
  const fight = { targets: state.targets ?? 1, movementPct: state.movementPct ?? 0, healer };
  const common = { spells: state.spells, gear: stats, mods, talents: state.talents, fightLength: state.fightLength, iterations: state.iterations, seed: 12345, fight, priority: state.priority?.[state.spec], cooldowns: state.priority?.[cooldownKey(state.spec)] };
  // Main gauche : l'arme portée ; si aucune main n'est équipée, le simulateur prend ses armes par défaut.
  const offHand = offHandWeapon ?? (state.equipped.offHand || state.equipped.mainHand ? null : undefined);
  if (state.classId === 'rogue') {
    return { ...common, classId: 'rogue', spec: state.spec as RogueSpec, rules: state.rules as unknown as RogueRules, options: state.rog, weapon, offHand, ...overrides };
  }
  if (state.classId === 'warrior') {
    const options = { ...state.war, shield: state.war.shield && (shield || !state.equipped.offHand) };
    return { ...common, classId: 'warrior', spec: state.spec as WarriorSpec, rules: state.rules as unknown as WarriorRules, options, weapon, offHand, ...overrides };
  }
  if (state.classId === 'shaman') {
    return { ...common, classId: 'shaman', spec: state.spec as ShamanSpec, rules: state.rules as unknown as ShamanRules, options: state.sha, weapon, ...overrides };
  }
  if (state.classId === 'hunter') {
    return { ...common, classId: 'hunter', spec: state.spec as HunterSpec, rules: state.rules as unknown as HunterRules, options: state.hun, weapon: rangedWeapon, meleeWeapon: weapon, ...overrides };
  }
  if (state.classId === 'priest') {
    return { ...common, classId: 'priest', spec: state.spec as PriestSpec, rules: state.rules as unknown as PriestRules, options: state.pri, ...overrides };
  }
  if (state.classId === 'mage') {
    return { ...common, classId: 'mage', spec: state.spec as MageSpec, rules: state.rules as unknown as MageRules, options: state.mage, ...overrides };
  }
  if (state.classId === 'druid') {
    return {
      ...common,
      classId: 'druid',
      spec: state.spec as DruidSpec,
      rules: state.rules as unknown as DruidRules,
      weapon,
      options: state.dru,
      ...overrides,
    };
  }
  if (state.classId === 'paladin') {
    return {
      ...common,
      classId: 'paladin',
      spec: state.spec as PaladinSpec,
      rules: state.rules as unknown as PaladinRules,
      weapon,
      // Le bouclier compte s'il est porté, ou si l'option est cochée sans objets saisis.
      options: { ...state.pal, shield: state.pal.shield && (shield || !state.equipped.offHand) },
      ...overrides,
    };
  }
  return {
    ...common,
    classId: 'warlock',
    rules: state.rules as unknown as GameRules,
    rotation: state.rotation,
    buffs: state.buffs,
    ...overrides,
  };
}

/** Classe affichée : on change de classe en remontant un nouveau StoreProvider. */
const ClassSwitchCtx = createContext<{ classId: ClassId; setClassId: (c: ClassId) => void }>({ classId: 'warlock', setClassId: () => {} });

export function savedClass(): ClassId {
  try {
    const c = localStorage.getItem(CLASS_KEY);
    if (c && c in CLASS_BY_ID) return c as ClassId;
  } catch {
    /* stockage indisponible */
  }
  return 'warlock';
}

export function ClassSwitchProvider({ children }: { children: (classId: ClassId) => ReactNode }) {
  const [classId, setClass] = useState<ClassId>(savedClass);
  const setClassId = (c: ClassId) => {
    try {
      localStorage.setItem(CLASS_KEY, c);
    } catch {
      /* stockage indisponible */
    }
    setClass(c);
  };
  return <ClassSwitchCtx.Provider value={{ classId, setClassId }}>{children(classId)}</ClassSwitchCtx.Provider>;
}

export const useClassSwitch = () => useContext(ClassSwitchCtx);
