import type { HolderId, Lot, Vente } from '../model/types';
import { allocate, type Cents } from '../util/money';
import { sub, ONE, type Frac, frac, formatPct } from '../util/fraction';

export interface SalePiece { lotId: string; holder: HolderId; droit: 'PP' | 'NP' | 'US'; weight: Frac; amount: Cents }
export interface SaleResult {
  status: 'calcule' | 'non_disponible';
  reasons: string[];
  prix: Cents | null;
  frais: Cents | null;
  net: Cents | null;
  pieces: SalePiece[];
  byHolder: Partial<Record<HolderId, Cents>>;
  /** Grille FICTIVE de sensibilité quand le coefficient n'est pas renseigné. */
  sensitivity?: { coef: Frac; byHolder: Partial<Record<HolderId, Cents>> }[];
  warnings: string[];
}

const lcm = (a: number, b: number) => { const g = (x: number, y: number): number => (y ? g(y, x % y) : x); return (a / g(a, b)) * b; };

/** Coefficient applicable à un lot démembré : surcharge par lot sinon coefficient commun. */
export function coefFor(v: Pick<Vente, 'coefUsufruit' | 'coefParLot'>, lotId: string): Frac | null {
  const o = v.coefParLot?.[lotId];
  return o !== undefined && o !== null ? o : v.coefUsufruit;
}

function piecesFor(lots: Lot[], coef: (lotId: string) => Frac | null): { pieces: Omit<SalePiece, 'amount'>[]; missing: string[] } {
  const pieces: Omit<SalePiece, 'amount'>[] = [];
  const missing: string[] = [];
  for (const l of lots) {
    if (l.pp) { pieces.push({ lotId: l.id, holder: l.pp, droit: 'PP', weight: l.share }); continue; }
    const c = coef(l.id);
    if (!c) { missing.push(l.id); continue; }
    pieces.push({ lotId: l.id, holder: l.us!, droit: 'US', weight: { n: l.share.n * c.n, d: l.share.d * c.d } });
    const npShare = sub(ONE, c);
    pieces.push({ lotId: l.id, holder: l.np!, droit: 'NP', weight: { n: l.share.n * npShare.n, d: l.share.d * npShare.d } });
  }
  return { pieces, missing };
}

/** Répartit exactement `total` selon les poids rationnels (somme des parts = total). */
function distribute(total: Cents, pieces: Omit<SalePiece, 'amount'>[]): SalePiece[] {
  const den = pieces.reduce((acc, p) => lcm(acc, p.weight.d), 1);
  const ws = pieces.map((p) => (p.weight.n * den) / p.weight.d);
  const amounts = allocate(total, ws);
  return pieces.map((p, i) => ({ ...p, amount: amounts[i] }));
}

const group = (pieces: SalePiece[]) => {
  const out: Partial<Record<HolderId, Cents>> = {};
  for (const p of pieces) out[p.holder] = (out[p.holder] ?? 0) + p.amount;
  return out;
};

/**
 * Ventilation du prix d'une vente de TOUTE la maison.
 *  - Frais au prorata : répartition du prix net (prix − frais).
 *  - Frais à charge d'un titulaire : répartition du prix brut, puis frais retirés de sa part.
 *  - Coefficient d'usufruit : valeur CONVENUE saisie, jamais déduite de l'âge.
 */
export function splitSale(lots: Lot[], v: Vente, prix: Cents | null): SaleResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  if (!v.accordsConfirmes) warnings.push('La vente de toute la pleine propriété suppose l’accord de tous les titulaires (nus-propriétaires et usufruitier) : non confirmé.');
  if (lots.some((l) => l.pp === 'quart' || l.np === 'quart' || l.us === 'quart'))
    warnings.push('La part du fils prédécédé n’est pas clarifiée : la part correspondante est attribuée à « titulaire à déterminer ».');
  const frais = v.frais.cents;
  if (prix === null) reasons.push('Prix de vente non renseigné (et valeur de la maison inconnue)');
  if (frais === null) warnings.push('Frais de vente non renseignés : répartition calculée sans frais (non pris pour 0 dans le total frais compris).');
  const fraisEff = frais ?? 0;

  if (v.mode === 'montants_saisis') {
    const entries = Object.entries(v.montantsSaisis) as [HolderId, Cents | null][];
    const byHolder: Partial<Record<HolderId, Cents>> = {};
    let total = 0;
    let incomplete = false;
    for (const [h, c] of entries) { if (c === null) incomplete = true; else { byHolder[h] = c; total += c; } }
    const net = prix === null ? null : prix - fraisEff;
    if (incomplete) reasons.push('Montant saisi manquant pour un titulaire');
    if (net !== null && total !== net) reasons.push(`Les montants saisis totalisent ${(total / 100).toFixed(2)} € au lieu du prix net ${(net / 100).toFixed(2)} €`);
    return { status: reasons.length ? 'non_disponible' : 'calcule', reasons, prix, frais, net, pieces: [], byHolder, warnings };
  }

  const { pieces, missing } = piecesFor(lots, (id) => coefFor(v, id));
  if (missing.length) reasons.push(`Coefficient économique d’usufruit non renseigné pour ${missing.join(', ')} : pas de résultat de vente précis`);
  if (prix === null || missing.length) {
    let sensitivity: SaleResult['sensitivity'];
    if (prix !== null) {
      sensitivity = [10, 15, 20, 25, 30, 40].map((pct) => {
        const c = frac(pct, 100);
        const ps = piecesFor(lots, () => c).pieces;
        return { coef: c, byHolder: group(distribute(prix - (v.fraisRepartition === 'prorata' ? fraisEff : 0), ps)) };
      });
      warnings.push(`Grille de sensibilité FICTIVE (${sensitivity.map((s) => formatPct(s.coef)).join(', ')}) : aucun de ces coefficients n’est une estimation de l’usufruit.`);
    }
    return { status: 'non_disponible', reasons, prix, frais, net: prix === null ? null : prix - fraisEff, pieces: [], byHolder: {}, sensitivity, warnings };
  }

  if (v.fraisRepartition === 'prorata') {
    const net = prix - fraisEff;
    const ps = distribute(net, pieces);
    return { status: 'calcule', reasons, prix, frais, net, pieces: ps, byHolder: group(ps), warnings };
  }
  const ps = distribute(prix, pieces);
  const byHolder = group(ps);
  byHolder[v.fraisRepartition] = (byHolder[v.fraisRepartition] ?? 0) - fraisEff;
  return { status: 'calcule', reasons, prix, frais, net: prix - fraisEff, pieces: ps, byHolder, warnings };
}
