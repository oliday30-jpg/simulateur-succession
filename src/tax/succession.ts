import type { Cents } from '../util/money';
import { progressiveRaw, rawToCents, type SliceDetail } from './brackets';
import type { SuccessionProfile } from './rules';

export interface BenefTaxInput {
  id: string;
  /** Part nette dans le logement familial éligible au taux réduit. */
  partLogement: Cents;
  /** Autres biens nets recueillis (y compris legs reçus, part de maison non éligible). */
  partAutre: Cents;
  /** Donations mobilières non enregistrées rappelées (base fiscale, pas de liquidités). */
  rappel: Cents;
  /** Base de placement d'une réserve de progressivité (non taxée, ni héritée). */
  baseReserve: Cents;
  /** L'abattement de l'art. 54 est-il applicable à ce bénéficiaire ? */
  abattementEligible: boolean;
}

export interface BenefTaxResult {
  id: string;
  partNette: Cents;
  logementSlices: SliceDetail[];
  ordinaireSlices: SliceDetail[];
  ordinaireOffset: Cents;
  avantAbattement: Cents;
  abattementMontant: Cents;
  abattementReduction: Cents | null;
  abattementSlices: SliceDetail[];
  droits: Cents | null;
  status: 'calcule' | 'a_confirmer';
  notes: string[];
}

export function computeBeneficiaryTax(p: SuccessionProfile, inp: BenefTaxInput): BenefTaxResult {
  const notes: string[] = [];
  const homeBrackets = p.logement;
  const L = homeBrackets ? Math.max(0, inp.partLogement) : 0;
  const O = Math.max(0, inp.partAutre + (homeBrackets ? 0 : inp.partLogement)) + Math.max(0, inp.rappel);
  const partNette = L + O;
  const reserve = Math.max(0, inp.baseReserve);

  const home = homeBrackets ? progressiveRaw(homeBrackets, L, 0) : { raw: 0, slices: [] };
  const ordOffset = reserve + L;
  const ord = progressiveRaw(p.ordinaire, O, ordOffset);
  const rawTotal = home.raw + ord.raw;
  const avant = rawToCents(rawTotal);
  if (reserve > 0) notes.push(`Réserve de progressivité : ${(reserve / 100).toLocaleString('fr-BE')} € de base déjà donnée placés sous les biens recueillis (base de placement, ni héritée ni taxée à nouveau).`);
  if (reserve > 0 && L > 0) notes.push('Interaction réserve de progressivité / taux réduit logement non documentée : placement du logement à confirmer.');

  // Exemption (art. 54) ou exonération annoncée, imputée sur les tranches les plus basses.
  let A = 0;
  if (p.exonerationBeneficiaire !== null) {
    A = p.exonerationBeneficiaire;
    notes.push(`Hypothèse « annonce » : ${(A / 100).toLocaleString('fr-BE')} € exonérés sur la part nette.`);
  } else if (inp.abattementEligible) {
    A = p.abattement.base;
    if (p.abattement.supplement && partNette <= p.abattement.supplement.seuilPartNette) {
      A += p.abattement.supplement.montant;
      notes.push('Part nette ≤ 125 000 € : exemption supplémentaire de 12 500 € dans la deuxième tranche.');
    }
  } else notes.push('Pas d’exemption art. 54 appliquée à ce bénéficiaire (non héritier légal ou non confirmé).');
  A = Math.min(A, partNette);

  if (A > 0 && reserve > 0) {
    notes.push('Imputation de l’exemption en présence d’une réserve de progressivité (art. 66bis) non validée : sous-total avant exemption publié, résultat final à confirmer.');
    return { id: inp.id, partNette, logementSlices: home.slices, ordinaireSlices: ord.slices, ordinaireOffset: ordOffset, avantAbattement: avant, abattementMontant: A, abattementReduction: null, abattementSlices: [], droits: null, status: 'a_confirmer', notes };
  }
  const aHome = Math.min(A, L);
  const redHome = homeBrackets ? progressiveRaw(homeBrackets, aHome, 0) : { raw: 0, slices: [] };
  const redOrd = progressiveRaw(p.ordinaire, A - aHome, ordOffset);
  const rawRed = redHome.raw + redOrd.raw;
  const droits = rawToCents(rawTotal - rawRed);
  return {
    id: inp.id, partNette, logementSlices: home.slices, ordinaireSlices: ord.slices, ordinaireOffset: ordOffset,
    avantAbattement: avant, abattementMontant: A, abattementReduction: avant - droits, abattementSlices: [...redHome.slices, ...redOrd.slices],
    droits, status: 'calcule', notes,
  };
}
