/**
 * Remplacement des rôles anonymes (« Père », « Fils survivant »…) par les prénoms saisis,
 * À L'AFFICHAGE SEULEMENT. Le moteur et les exports restent anonymes.
 */
import type { HolderId, PersonId } from '../model/types';

export type Names = Partial<Record<string, string>>;

const L = '\\p{L}';
/** Pas de lettre ni de trait d'union juste avant / après (évite « petit-fils » pour « fils »). */
const word = (body: string) => new RegExp(`(?<![${L}-])(?:${body})(?![${L}-])`, 'gu');

/** « de Marcel », « d’Olivier ». */
export function deNom(n: string): string {
  return /^[aeiouyhàâäéèêëîïôöûü]/i.test(n) ? `d’${n}` : `de ${n}`;
}

/** Noms renseignés (non vides), sans espaces superflus. */
function clean(names: Names): Partial<Record<PersonId, string>> {
  const out: Partial<Record<PersonId, string>> = {};
  for (const [k, v] of Object.entries(names)) { const t = v?.trim(); if (t) out[k as PersonId] = t; }
  return out;
}

/** Formes du rôle dans les textes (article + nom commun), de la plus longue à la plus courte. */
const FORMS: { id: PersonId; labels: string[]; noun: string }[] = [
  // La bénéficiaire d'abord : son libellé contient « fils prédécédé ».
  { id: 'beneficiaire', labels: ['Bénéficiaire potentielle de la part du fils prédécédé', 'Bénéficiaire de la part du fils prédécédé \\(sous réserve\\)', 'Bénéficiaire de la part du fils prédécédé'], noun: '' },
  { id: 'filsPredecede', labels: [], noun: 'fils prédécédé' },
  { id: 'petitFils', labels: [], noun: 'petit-fils' },
  { id: 'fils', labels: [], noun: 'fils survivant' },
  { id: 'fils', labels: [], noun: 'fils(?! prédécédé)' },
  { id: 'pere', labels: [], noun: 'père' },
];

/** Remplace les rôles par les prénoms dans un texte libre. Sans prénom : texte inchangé. */
export function renameText(text: string, names: Names): string {
  const n = clean(names);
  if (!Object.keys(n).length || !text) return text;
  // Pluriels (« chaque fils », « les deux fils »…) : ils désignent plusieurs personnes,
  // on ne les remplace jamais par un seul prénom (marqueur provisoire, restauré à la fin).
  const PLURAL = '\u0000';
  let s = text.replace(word(`(?:chaque|Chaque|les|Les|des|Des|aux|Aux|ces|Ces|ses|Ses|leurs|Leurs)(?: deux)? fils`), (m) => m.replace(/fils$/, PLURAL));
  for (const f of FORMS) {
    const name = n[f.id];
    if (!name) continue;
    for (const lbl of f.labels) s = s.replace(word(lbl), name);
    if (!f.noun) continue;
    const cap = f.noun[0].toUpperCase() + f.noun.slice(1);
    const nouns = `(?:${f.noun}|${cap})`;
    s = s
      .replace(word(`du ${nouns}`), deNom(name))
      .replace(word(`Du ${nouns}`), deNom(name).replace(/^d/, 'D'))
      .replace(word(`au ${nouns}`), `à ${name}`)
      .replace(word(`Au ${nouns}`), `À ${name}`)
      .replace(word(`(?:le|Le) ${nouns}`), name)
      .replace(word(nouns), name);
  }
  return s.split(PLURAL).join('fils');
}

export const ROLE_LABEL: Record<PersonId | HolderId, string> = {
  pere: 'Père',
  fils: 'Fils survivant',
  filsPredecede: 'Fils prédécédé',
  beneficiaire: 'Bénéficiaire de la part du fils prédécédé (sous réserve)',
  petitFils: 'Petit-fils',
  quart: 'Titulaire de la part du fils prédécédé (à déterminer)',
};

/** Libellé d'une personne ou d'un titulaire : prénom s'il est saisi, sinon le rôle. */
export function whoLabel(id: PersonId | HolderId | 'succession', names: Names): string {
  if (id === 'succession') return 'Succession';
  const n = clean(names);
  if (id !== 'quart' && n[id]) return n[id]!;
  return renameText(ROLE_LABEL[id], names);
}
