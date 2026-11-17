import type { Budget } from '../model/types';
import type { Cents } from '../util/money';

export interface BudgetResult {
  disponible: Cents | null;
  besoinsPonctuels: Cents | null;
  ecartReserve: Cents | null;
  deficitMensuel: Cents | null;
  /** Durée indicative (mois) de couverture du déficit, SANS rendement implicite. */
  dureeMois: number | null;
  relogementSurDuree: Cents | null;
  manquants: string[];
  renseigne: boolean;
}

/**
 * Budget facultatif du père. Les champs non renseignés ne valent pas 0 : ils rendent
 * indisponibles seulement les résultats qui en dépendent.
 */
export function computeBudget(b: Budget, disponible: Cents | null): BudgetResult {
  const manquants: string[] = [];
  const need = (v: { cents: Cents | null }, label: string) => { if (v.cents === null) manquants.push(label); return v.cents; };
  const renseigne = [b.pensionMensuelle, b.depensesMensuelles, b.soinsMensuels, b.reserveMinimale, b.travaux, b.prixRelogement].some((x) => x.cents !== null);
  const reserve = need(b.reserveMinimale, 'réserve minimale');
  const travaux = b.travaux.cents ?? 0;
  const reloge = b.prixRelogement.cents;
  // Le relogement est un coût mensuel × durée si une durée est saisie, sinon un prix ponctuel.
  const relogementSurDuree = reloge === null ? null : b.dureeMois ? reloge * b.dureeMois : reloge;
  const besoinsPonctuels = travaux + (relogementSurDuree ?? 0);
  const ecartReserve = disponible === null || reserve === null ? null : disponible - reserve - besoinsPonctuels;
  const pension = need(b.pensionMensuelle, 'pension nette');
  const dep = need(b.depensesMensuelles, 'dépenses mensuelles');
  const soins = b.soinsMensuels.cents ?? 0;
  const deficitMensuel = pension === null || dep === null ? null : dep + soins - pension;
  let dureeMois: number | null = null;
  if (deficitMensuel !== null && deficitMensuel > 0 && ecartReserve !== null) dureeMois = Math.max(0, Math.floor(ecartReserve / deficitMensuel));
  return { disponible, besoinsPonctuels, ecartReserve, deficitMensuel, dureeMois, relogementSurDuree, manquants, renseigne };
}
