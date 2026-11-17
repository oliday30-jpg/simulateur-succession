/** Fraction rationnelle exacte (numérateur/dénominateur entiers), toujours normalisée. */
export interface Frac { n: number; d: number }

const gcd = (a: number, b: number): number => {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

export function frac(n: number, d = 1): Frac {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error(`Fraction invalide ${n}/${d}`);
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
export const ZERO = frac(0);
export const ONE = frac(1);
export const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
export const div = (a: Frac, b: Frac) => frac(a.n * b.d, a.d * b.n);
export const eq = (a: Frac, b: Frac) => a.n * b.d === b.n * a.d;
export const cmp = (a: Frac, b: Frac) => Math.sign(a.n * b.d - b.n * a.d);
export const isZero = (a: Frac) => a.n === 0;
export const sum = (xs: Frac[]) => xs.reduce(add, ZERO);

/** centimes × fraction, arrondi demi vers le haut. */
export function mulCents(c: number, f: Frac): number {
  const num = c * f.n;
  const a = Math.abs(num);
  const q = Math.floor(a / f.d);
  const r = a - q * f.d;
  return Math.sign(num) * (2 * r >= f.d ? q + 1 : q);
}

export function formatPct(f: Frac): string {
  return ((f.n / f.d) * 100).toLocaleString('fr-BE', { maximumFractionDigits: 2 }) + ' %';
}

export function formatFrac(f: Frac): string {
  if (f.d === 1 || f.d === 100) return formatPct(f);
  return `${f.n}/${f.d} (${formatPct(f)})`;
}

/** Saisie « 1/4 », « 25 », « 25 % », « 12,5 % » → fraction (pourcentage sauf forme a/b). */
export function parseFrac(input: string): Frac | null {
  const s = input.trim().replace(/\s/g, '');
  const m1 = s.match(/^(\d+)\/(\d+)$/);
  if (m1) { const d = Number(m1[2]); return d ? frac(Number(m1[1]), d) : null; }
  const m2 = s.replace('%', '').replace(',', '.').match(/^(\d+)(?:\.(\d{1,4}))?$/);
  if (m2) {
    const decs = m2[2] ?? '';
    const scale = 10 ** decs.length;
    return frac(Number(m2[1]) * scale + Number(decs || '0'), 100 * scale);
  }
  return null;
}
