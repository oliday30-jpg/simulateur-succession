import type { Cents } from '../util/money';

/**
 * Résultat chiffré avec son statut. Un résultat partiel ou à confirmer n'est JAMAIS présenté
 * comme un total final : `value` est alors null et seules les bornes connues sont fournies.
 */
export type NumStatus = 'calcule' | 'manuel' | 'a_confirmer' | 'partiel' | 'non_disponible';

export interface Num {
  value: Cents | null;
  /** borne basse connue (fourchette) */
  lo?: Cents;
  /** borne haute connue (fourchette ou sous-total avant exemption) */
  hi?: Cents;
  status: NumStatus;
  notes: string[];
}

export const exact = (value: Cents, status: NumStatus = 'calcule', notes: string[] = []): Num => ({ value, status, notes });
export const unavailable = (note: string): Num => ({ value: null, status: 'non_disponible', notes: [note] });

const rank: Record<NumStatus, number> = { calcule: 0, manuel: 1, a_confirmer: 2, partiel: 3, non_disponible: 4 };
const worst = (a: NumStatus, b: NumStatus): NumStatus => (rank[a] >= rank[b] ? a : b);

const loOf = (n: Num) => (n.value !== null ? n.value : n.lo);
const hiOf = (n: Num) => (n.value !== null ? n.value : n.hi);

export function addNum(a: Num, b: Num): Num {
  const notes = [...a.notes, ...b.notes];
  if (a.value !== null && b.value !== null) {
    const st = worst(a.status, b.status);
    return { value: a.value + b.value, status: st === 'a_confirmer' ? 'a_confirmer' : st, notes };
  }
  const la = loOf(a), lb = loOf(b), ha = hiOf(a), hb = hiOf(b);
  const status = a.status === 'non_disponible' || b.status === 'non_disponible' ? (la === undefined && lb === undefined ? 'non_disponible' : 'partiel') : worst(worst(a.status, b.status), 'a_confirmer');
  return {
    value: null,
    lo: la !== undefined && lb !== undefined ? la + lb : la ?? lb,
    hi: ha !== undefined && hb !== undefined ? ha + hb : undefined,
    status,
    notes,
  };
}

export const sumNums = (ns: Num[]): Num => ns.reduce((acc, n) => addNum(acc, n), exact(0));

export function subNum(a: Num, b: Num): Num {
  if (a.value !== null && b.value !== null) return { value: a.value - b.value, status: worst(a.status, b.status), notes: [] };
  const la = loOf(a), ha = hiOf(a), lb = loOf(b), hb = hiOf(b);
  return {
    value: null,
    lo: la !== undefined && hb !== undefined ? la - hb : undefined,
    hi: ha !== undefined && lb !== undefined ? ha - lb : undefined,
    status: a.status === 'non_disponible' || b.status === 'non_disponible' ? 'non_disponible' : 'a_confirmer',
    notes: [],
  };
}

/** Fourchette à partir de plusieurs valeurs possibles (variantes d'hypothèses non tranchées). */
export function rangeOf(values: { value: Cents | null; upper?: Cents }[], notes: string[]): Num {
  const determinate = values.filter((v) => v.value !== null).map((v) => v.value!) as Cents[];
  const uppers = values.map((v) => (v.value !== null ? v.value : v.upper)).filter((x): x is Cents => x !== undefined);
  if (determinate.length === values.length) {
    const lo = Math.min(...determinate), hi = Math.max(...determinate);
    if (lo === hi) return exact(lo, 'calcule', notes);
    return { value: null, lo, hi, status: 'a_confirmer', notes };
  }
  return {
    value: null,
    lo: determinate.length ? Math.min(...determinate) : undefined,
    hi: uppers.length ? Math.max(...uppers) : undefined,
    status: 'a_confirmer',
    notes,
  };
}
