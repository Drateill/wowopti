// Compare les données Forever fraîchement téléchargées (src/data/generated/*.json) à la version
// du dernier commit, en ignorant la date de récupération. Écrit un résumé Markdown sur la sortie
// standard (vide s'il n'y a aucun changement). Utilisé par le workflow hebdomadaire.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = 'src/data/generated';

function previous(file) {
  try {
    return JSON.parse(execFileSync('git', ['show', `HEAD:${DIR}/${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch {
    return null; // fichier nouveau
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lines = [];

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const cls = file.replace(/\.json$/, '');
  const now = JSON.parse(readFileSync(`${DIR}/${file}`, 'utf8'));
  const before = previous(file);
  if (!before) {
    lines.push(`### ${cls}`, '- nouveau fichier', '');
    continue;
  }
  const out = [];
  const oldTalents = new Map(before.talents.map((t) => [t.key, t]));
  const newTalents = new Map(now.talents.map((t) => [t.key, t]));
  for (const [key, t] of newTalents) {
    const o = oldTalents.get(key);
    if (!o) out.push(`- talent ajouté : **${t.name.en}** (${key})`);
    else if (!same(o.desc, t.desc)) {
      const i = t.desc.en.findIndex((d, r) => d !== o.desc.en[r]);
      out.push(`- talent modifié : **${t.name.en}** — rang ${i + 1} : « ${o.desc.en[i] ?? '∅'} » → « ${t.desc.en[i] ?? '∅'} »`);
    } else if (o.maxRank !== t.maxRank || o.row !== t.row || o.col !== t.col || o.tree !== t.tree) {
      out.push(`- talent déplacé ou rangs changés : **${t.name.en}**`);
    }
  }
  for (const [key, t] of oldTalents) if (!newTalents.has(key)) out.push(`- talent retiré : **${t.name.en}** (${key})`);
  for (const [key, s] of Object.entries(now.spells)) {
    const o = before.spells[key];
    if (!o) out.push(`- sort ajouté : **${s.name.en}** (${key})`);
    else if (o.id !== s.id || o.tooltip.en !== s.tooltip.en) out.push(`- sort modifié : **${s.name.en}** (${key})`);
  }
  if (!same(before.trees, now.trees)) out.push('- arbres de talents modifiés');
  if (out.length) lines.push(`### ${cls}`, ...out, '');
}

process.stdout.write(lines.join('\n'));
