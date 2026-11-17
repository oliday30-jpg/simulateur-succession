import { divRoundHalfUp, type Cents } from '../util/money';
import type { Bracket } from './rules';

export interface SliceDetail { from: Cents; to: Cents; bp: number; base: Cents; /** produit exact en centimes × points de base */ raw: number }

/**
 * Taxe progressive d'un montant `amount` placé dans le barème à partir de `offset`
 * (placement : les tranches inférieures sont « occupées » par d'autres biens et ne sont pas
 * taxées à nouveau ici). Retourne le produit exact (non arrondi) et le détail des tranches.
 */
export function progressiveRaw(brackets: Bracket[], amount: Cents, offset: Cents = 0): { raw: number; slices: SliceDetail[] } {
  const slices: SliceDetail[] = [];
  if (amount <= 0) return { raw: 0, slices };
  const start = offset;
  const end = offset + amount;
  let lower = 0;
  let raw = 0;
  for (const br of brackets) {
    const upper = br.upTo ?? Number.MAX_SAFE_INTEGER;
    const from = Math.max(lower, start);
    const to = Math.min(upper, end);
    if (to > from) {
      const base = to - from;
      slices.push({ from, to, bp: br.bp, base, raw: base * br.bp });
      raw += base * br.bp;
    }
    lower = upper;
    if (lower >= end) break;
  }
  return { raw, slices };
}

export const rawToCents = (raw: number) => divRoundHalfUp(raw, 10000);

/** Taxe progressive arrondie au centime (un seul arrondi). */
export function progressive(brackets: Bracket[], amount: Cents, offset: Cents = 0): Cents {
  return rawToCents(progressiveRaw(brackets, amount, offset).raw);
}
