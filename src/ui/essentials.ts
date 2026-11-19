import type { Existence, Scenario, Situation } from '../model/types';
import { validateLots } from '../domain/rights';

/**
 * Cases indispensables pour qu'une estimation puisse se faire : celles dont l'absence
 * produit un point « bloquant » dans le moteur (voir `src/engine/simulate.ts`).
 * Les autres cases affinent le résultat (fourchette, « à confirmer ») sans le bloquer.
 */

/** Champ de valeur de la maison réellement utilisé par défaut. */
export function houseValueKey(s: Situation): 'valeurHypothese' | 'valeurExpertise' | 'valeurAncienne' {
  return s.house.sourceValeurCourante === 'expertise' ? 'valeurExpertise' : s.house.sourceValeurCourante === 'ancienne' ? 'valeurAncienne' : 'valeurHypothese';
}

export const isAvoir = (kind: string) => kind === 'compte' || kind === 'titres' || kind === 'autre_avoir';

/** Liste des cases indispensables de l'onglet Situation, avec leur état (rempli ou non). */
export function situationNeeds(s: Situation): { label: string; filled: boolean }[] {
  const out: { label: string; filled: boolean }[] = [];
  out.push({ label: 'Valeur de la maison utilisée par défaut', filled: s.house[houseValueKey(s)].cents !== null });
  out.push({ label: 'Répartition de la maison (lots cohérents)', filled: validateLots(s.house.lots).length === 0 });
  if (s.bilanMode === 'B') out.push({ label: 'Solde financier au décès (mode B)', filled: s.soldeAuDecesB.cents !== null });
  for (const p of s.postes) if (isAvoir(p.kind)) out.push({ label: `Montant — ${p.label}`, filled: p.value.cents !== null });
  if (s.creance.inclusion === 'montant_recouvre') out.push({ label: 'Créance : montant recouvré', filled: s.creance.recouvre.cents !== null });
  if (s.creance.inclusion === 'solde_nominal') out.push({ label: 'Créance : prêt (nominal)', filled: s.creance.nominal.cents !== null });
  return out;
}

/** Le petit-fils reçoit-il quelque chose au décès (legs actif) ? */
export const petitFilsInherits = (sc: Scenario) => sc.legs.some((l) => l.actif && l.beneficiaire === 'petitFils');

/** Liste des cases indispensables d'une variante, avec leur état. */
export function scenarioNeeds(sc: Scenario): { label: string; filled: boolean }[] {
  const out: { label: string; filled: boolean }[] = [];
  out.push({ label: 'Décès simulé du père', filled: sc.deathDate !== null });
  if (sc.rulesMode === 'manuel') {
    out.push({ label: 'Droits de succession manuels — fils', filled: (sc.manualDeathTax.fils ?? null) !== null });
    if (petitFilsInherits(sc)) out.push({ label: 'Droits de succession manuels — petit-fils', filled: (sc.manualDeathTax.petitFils ?? null) !== null });
  }
  for (const e of sc.events) {
    if (e.type === 'don_bancaire' || e.type === 'depense' || e.type === 'recette') out.push({ label: 'Montant', filled: e.montant !== null });
    if (e.type === 'donation_immobiliere') out.push({ label: 'Fraction de la maison donnée', filled: e.fraction.n > 0 });
    if (e.type === 'vente' && e.mode === 'coefficient') out.push({ label: 'Coefficient d’usufruit', filled: e.coefUsufruit !== null });
  }
  for (const l of sc.legs) if (l.actif) out.push({ label: 'Montant du legs', filled: l.montant !== null });
  return out;
}

export const countMissing = (needs: { filled: boolean }[]) => needs.filter((n) => !n.filled).length;

/** Le contrat d'assurance existe (ou peut-être) : son montant devient indispensable. */
export const assuranceAChiffrer = (e: Existence) => e === 'oui' || e === 'possible';

/**
 * Cases indispensables de l'onglet « Succession du fils prédécédé » : sans elles, l'estimation repose
 * sur une valeur par défaut, ne donne qu'un minimum ou laisse une option non calculée.
 */
export function sfpNeeds(s: Situation): { label: string; filled: boolean }[] {
  const o = s.succFilsPredecede;
  const out: { label: string; filled: boolean }[] = [
    { label: 'Valeur de la maison au décès du fils prédécédé', filled: s.house.valeurDecesFilsPredecede.cents !== null },
    { label: 'Testament', filled: o.testament !== 'inconnu' },
    { label: 'Descendants', filled: o.descendants !== 'inconnu' },
    { label: 'Résidence commune', filled: o.residenceCommune !== 'inconnu' },
    { label: 'Autres biens nets', filled: o.autresBiensNets.cents !== null },
    { label: 'Assurance versée à la bénéficiaire : existe-t-elle ?', filled: o.assuranceExiste !== 'inconnu' },
  ];
  if (assuranceAChiffrer(o.assuranceExiste)) out.push({ label: 'Montant de l’assurance de la bénéficiaire', filled: o.assurance.cents !== null });
  out.push({ label: 'Assurance versée au fils survivant : existe-t-elle ?', filled: o.assuranceFilsExiste !== 'inconnu' });
  if (assuranceAChiffrer(o.assuranceFilsExiste)) out.push({ label: 'Montant de l’assurance du fils survivant', filled: o.assuranceFils.cents !== null });
  if (o.baseNP === 'nue_propriete') out.push({ label: 'Valeur de la nue-propriété (%)', filled: o.coefNP !== null });
  return out;
}
