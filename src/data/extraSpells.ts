import type { ClassModule } from './classes';
import WAGO from './generated/wago-spells.json';
import type { Localized, School, SpellDef } from './types';

// Sorts de dégâts lus dans les tables du client WoW Forever (wago.tools, scripts/fetch-wago.mjs).
// Ils complètent les sorts saisis à la main : on peut les ajouter à la rotation personnalisée.

interface WagoSpell {
  id: string;
  spellId: number;
  name: Localized;
  icon: string;
  tree: number;
  level: number;
  school: School;
  castTime: number;
  manaCost: number;
  manaCostPct?: number;
  channel?: boolean;
  cooldown?: number;
  directMin?: number;
  directMax?: number;
  directCoeff?: number;
  dotTotal?: number;
  dotDuration?: number;
  dotTicks?: number;
  dotCoeff?: number;
  aoe?: boolean;
}

export interface ExtraSpell extends SpellDef {
  name: Localized;
  icon: string;
  spellId: number;
}

/** Préfixe des étapes de rotation qui lancent un sort ajouté. */
export const EXTRA_PREFIX = 'spell:';
export const extraStepId = (spellId: string) => `${EXTRA_PREFIX}${spellId}`;
export const isExtraStep = (stepId: string) => stepId.startsWith(EXTRA_PREFIX);

/** Spécialisations dont le simulateur sait lancer un sort ajouté (lanceurs de sorts). */
const EXTRA_SPELL_SPECS = new Set(['warlock:*', 'mage:*', 'priest:shadow', 'druid:balance']);
export const supportsExtraSpells = (classId: string, spec: string) => EXTRA_SPELL_SPECS.has(`${classId}:*`) || EXTRA_SPELL_SPECS.has(`${classId}:${spec}`);

export const WAGO_SOURCE = { source: WAGO.source, build: WAGO.build, fetchedAt: WAGO.fetchedAt };

const cache = new Map<string, ExtraSpell[]>();

/**
 * Sorts ajoutables pour une classe : ceux que le simulateur ne connaît pas déjà, avec le talent requis
 * quand le sort porte le nom d'un talent (Brûlure de l'ombre…).
 */
export function extraSpellsFor(cls: ClassModule): ExtraSpell[] {
  const hit = cache.get(cls.id);
  if (hit) return hit;
  const known = new Set(cls.spells.map((s) => s.id));
  const talentByName = new Map(cls.talents.map((t) => [t.name.en.toLowerCase(), t.key]));
  const baseMana = Number(cls.defaultRules.baseMana ?? 0);
  const list = ((WAGO.classes as Record<string, WagoSpell[]>)[cls.id] ?? [])
    .filter((s) => !known.has(s.id))
    .map(({ tree, level: _level, manaCostPct, ...s }): ExtraSpell => {
      const spell: ExtraSpell = {
        ...s,
        manaCost: s.manaCost || ((manaCostPct ?? 0) * baseMana) / 100,
        // Démoniste : l'arbre Destruction profite de Ruine, Cataclysme…
        destruction: cls.id === 'warlock' && tree === 2,
      };
      const talent = talentByName.get(s.name.en.toLowerCase());
      if (talent) spell.requiresTalent = talent;
      return spell;
    });
  cache.set(cls.id, list);
  return list;
}

/** Sorts ajoutés utilisés par une rotation personnalisée. */
export function extraSpellsInRotation(cls: ClassModule, stepIds: string[]): ExtraSpell[] {
  const wanted = new Set(stepIds.filter(isExtraStep).map((id) => id.slice(EXTRA_PREFIX.length)));
  return extraSpellsFor(cls).filter((s) => wanted.has(s.id));
}
