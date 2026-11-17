import { applyRateBp, type Cents } from '../util/money';
import { progressiveRaw, rawToCents, type SliceDetail } from './brackets';
import type { DonationProfile } from './rules';

export function donationMobiliere(p: DonationProfile, montant: Cents): Cents {
  return applyRateBp(montant, p.mobilierBp);
}

/**
 * Donation immobilière en ligne directe, barème progressif.
 * `cumulAnterieur` : base des donations immobilières antérieures pertinentes entre les mêmes
 * parties (placement dans le barème). Règle de cumul non vérifiée → signalée par l'appelant.
 */
export function donationImmobiliere(p: DonationProfile, base: Cents, cumulAnterieur: Cents = 0): { droits: Cents; slices: SliceDetail[] } {
  const r = progressiveRaw(p.immobilier, base, cumulAnterieur);
  return { droits: rawToCents(r.raw), slices: r.slices };
}
