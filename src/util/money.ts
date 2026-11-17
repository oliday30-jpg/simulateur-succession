/**
 * Montants en CENTIMES ENTIERS (number entier, sûr jusqu'à ~90 000 milliards d'euros).
 *
 * Règle d'arrondi documentée :
 *  - les taux sont exprimés en points de base sur 10 000 (3,3 % = 330 ; 14 % = 1400) ;
 *  - le calcul d'un barème accumule le produit exact (centimes × points de base) sans arrondi
 *    intermédiaire, puis arrondit UNE seule fois au centime, demi-centime vers le haut ;
 *  - une répartition (vente, prorata) utilise la méthode du plus fort reste pour que
 *    la somme des parts retrouve exactement le total.
 */
export type Cents = number;

export const euros = (e: number): Cents => Math.round(e * 100);

/** Division entière arrondie demi vers le haut (symétrique pour les négatifs). */
export function divRoundHalfUp(num: number, den: number): number {
  if (den <= 0) throw new Error('dénominateur invalide');
  const sign = num < 0 ? -1 : 1;
  const a = Math.abs(num);
  const q = Math.floor(a / den);
  const r = a - q * den;
  return sign * (2 * r >= den ? q + 1 : q);
}

/** centimes × taux (points de base / 10 000), arrondi au centime. */
export function applyRateBp(c: Cents, bp: number): Cents {
  return divRoundHalfUp(c * bp, 10000);
}

/** Répartition exacte d'un total selon des poids entiers (plus fort reste). */
export function allocate(total: Cents, weights: number[]): Cents[] {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sumW);
  const floors = raw.map((x) => Math.floor(x));
  let rest = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) floors[order[k].i] += 1;
  return floors;
}

const fmt = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });
const fmt0 = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, minimumFractionDigits: 0 });

/** Affichage EUR fr-BE. `null` → « non renseigné » (jamais 0). */
export function formatEUR(c: Cents | null | undefined, opts: { round?: boolean } = {}): string {
  if (c === null || c === undefined) return 'non renseigné';
  const f = opts.round && c % 100 === 0 ? fmt0 : fmt;
  return f.format(c / 100).replace(/ /g, ' ');
}

/** Saisie au format belge : « 170 000,50 », « 170.000,50 », « 170000.5 », « 170 000 € ». */
export function parseEUR(input: string): { ok: true; value: Cents | null } | { ok: false; error: string } {
  const s = input.trim().replace(/€|eur/gi, '').replace(/[\s  ’']/g, '');
  if (s === '') return { ok: true, value: null };
  if (!/^-?[\d.,]+$/.test(s)) return { ok: false, error: 'Montant invalide : utilisez des chiffres, ex. 170 000,50' };
  let normalized: string;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) normalized = s.replace(/\./g, '').replace(',', '.');
    else normalized = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    if ((s.match(/,/g) ?? []).length > 1) return { ok: false, error: 'Plusieurs virgules : montant ambigu' };
    normalized = s.replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = s.split('.');
    // « 170.000 » = milliers à la belge ; « 170.5 » = décimale
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) normalized = s.replace(/\./g, '');
    else normalized = s;
  } else normalized = s;
  const m = normalized.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return { ok: false, error: 'Montant invalide (2 décimales maximum)' };
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents) || cents > 1e14) return { ok: false, error: 'Montant trop grand' };
  return { ok: true, value: m[1] === '-' ? -cents : cents };
}

/** Pour remplir un champ de saisie à partir d'une valeur. */
export function centsToInput(c: Cents | null | undefined): string {
  if (c === null || c === undefined) return '';
  const neg = c < 0;
  const a = Math.abs(c);
  const ent = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const dec = a % 100;
  return (neg ? '-' : '') + ent + (dec ? ',' + String(dec).padStart(2, '0') : '');
}

/** Taux en points de base → « 3,3 % ». */
export function formatBp(bp: number): string {
  return (bp / 100).toLocaleString('fr-BE', { maximumFractionDigits: 2 }) + ' %';
}
