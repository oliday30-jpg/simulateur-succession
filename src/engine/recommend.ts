/**
 * Piste à étudier en priorité : classement PRUDENT des variantes selon l'écart de charge fiscale
 * (droits de donation + droits de succession) par rapport à la référence alignée.
 *
 * Ce n'est pas une décision : une variante n'est proposée que si elle n'entame pas la réserve
 * minimale du père et n'a pas de point bloquant ; les incertitudes sont toujours affichées.
 * Critère prudent : on compare l'économie la plus FAIBLE possible (borne haute de l'écart).
 */
import type { Cents } from '../util/money';
import type { Scenario } from '../model/types';
import { subNum, type Num } from './num';
import type { SimResult } from './simulate';

export interface Candidate {
  sc: Scenario;
  res: SimResult;
  /** Écart total fiscal vs référence alignée (négatif = économie). */
  delta: Num;
  /** Économie minimale / maximale (positif = économie), après frais connus. */
  saveMin: Cents;
  saveMax: Cents;
  /** Frais non fiscaux (actes…) connus et déduits de l'économie ? */
  fraisConnus: boolean;
  /** Variation de la trésorerie du père après événements (négatif = il dispose de moins). */
  cashDelta: Cents | null;
  /** Empêche de proposer la variante comme piste. */
  blockers: string[];
  /** Points de vigilance (n'empêchent pas la proposition). */
  cautions: string[];
}

export interface Recommendation {
  ranked: Candidate[];
  unranked: { sc: Scenario; reason: string }[];
  piste: Candidate | null;
  /** La piste reste la moins coûteuse quelle que soit l'hypothèse non tranchée. */
  robuste: boolean;
  /** L'économie de la piste est garantie (> 0 même dans l'hypothèse prudente). */
  economieCertaine: boolean;
  /** Variante la plus économique avant filtres (si différente de la piste, elle est écartée). */
  meilleureEcartee: Candidate | null;
}

const loOf = (n: Num): Cents | undefined => (n.value !== null ? n.value : n.lo);
const hiOf = (n: Num): Cents | undefined => (n.value !== null ? n.value : n.hi);

export function recommend(rows: { sc: Scenario; res: SimResult; ref: SimResult }[]): Recommendation {
  const ranked: Candidate[] = [];
  const unranked: { sc: Scenario; reason: string }[] = [];
  for (const { sc, res, ref } of rows) {
    if (sc.templateId === 'reference' && !sc.events.length && !sc.legs.length) continue; // la référence elle-même
    if (!sc.deathDate) { unranked.push({ sc, reason: 'pas de décès simulé : les droits de succession ne sont pas calculés' }); continue; }
    const delta = subNum(res.totals.fiscalTotal, ref.totals.fiscalTotal);
    const lo = loOf(delta), hi = hiOf(delta);
    if (lo === undefined || hi === undefined) {
      const after2027 = sc.deathDate >= '2028-01-01' && sc.rulesMode === 'auto';
      unranked.push({ sc, reason: after2027
        ? 'décès simulé après 2027 : règles non disponibles en mode automatique (choisir un profil de règles dans la variante)'
        : res.sale && res.sale.status !== 'calcule'
          ? 'vente : coefficient d’usufruit convenu non saisi, la part de chacun n’est pas calculable'
          : 'résultat partiel : données manquantes (voir Détail fiscal)' });
      continue;
    }
    const cautions: string[] = [];
    const blockers: string[] = [];
    // Frais non fiscaux : déduits s'ils sont connus des deux côtés, sinon signalés.
    const fr = res.totals.fraisNonFiscaux, frRef = ref.totals.fraisNonFiscaux;
    const fraisConnus = fr.value !== null && frRef.value !== null;
    const extra = fraisConnus ? fr.value! - frRef.value! : 0;
    if (!fraisConnus) cautions.push('Frais d’acte ou de notaire non renseignés : l’économie doit être comparée au devis.');
    if (delta.value === null) cautions.push('Montant en fourchette : une hypothèse reste à confirmer par le notaire (voir Points en suspens).');
    if (sc.rulesMode === 'constant2026' || sc.rulesMode === 'annonce2026' || sc.rulesMode === 'manuel') cautions.push('Calcul sur des règles choisies explicitement (contrefactuel ou hypothèse), pas sur une loi en vigueur.');
    const cashDelta = res.cash.afterEvents !== null && ref.cash.afterEvents !== null ? res.cash.afterEvents - ref.cash.afterEvents : null;
    if (res.budget.ecartReserve !== null && res.budget.ecartReserve < 0) blockers.push('Entame la réserve minimale du père.');
    if (res.issues.some((i) => i.level === 'bloquant')) blockers.push('Point bloquant dans la variante (voir Détail fiscal).');
    const fils = res.beneficiaries.find((b) => b.id === 'fils');
    if (fils?.peutPayerSansVendre === false) cautions.push('Le fils ne pourrait pas payer les droits avec les seules liquidités héritées.');
    const versPetitFils = sc.legs.some((l) => l.actif && l.beneficiaire === 'petitFils')
      || sc.events.some((e) => (e.type === 'don_bancaire' || e.type === 'donation_immobiliere') && e.donataire === 'petitFils');
    if (versPetitFils) cautions.push('Une partie va au petit-fils au lieu du fils : l’économie vient en partie de ce changement de bénéficiaire.');
    if (res.timeline.some((t) => t.label.startsWith('Donation immobilière'))) cautions.push('Donation de la maison : acte notarié, irrévocable ; le père garde l’usufruit mais ne peut plus vendre seul.');
    if (res.timeline.some((t) => t.label.startsWith('Don bancaire')) && sc.events.some((e) => e.type === 'don_bancaire' && e.statut === 'realise_non_enregistre')) cautions.push('Don non enregistré : économie seulement si le décès survient après la période de rappel.');
    ranked.push({ sc, res, delta, saveMin: -hi - extra || 0, saveMax: -lo - extra || 0, fraisConnus, cashDelta, blockers, cautions });
  }
  // Prudent : la plus grande économie minimale d'abord ; à égalité, la plus grande économie maximale.
  ranked.sort((a, b) => b.saveMin - a.saveMin || b.saveMax - a.saveMax);
  const eligible = ranked.filter((c) => !c.blockers.length && c.saveMax > 0);
  const piste = eligible[0] ?? null;
  const others = piste ? ranked.filter((c) => c !== piste && !c.blockers.length) : [];
  const robuste = !!piste && others.every((o) => piste.saveMin >= o.saveMax);
  const best = ranked[0] ?? null;
  return { ranked, unranked, piste, robuste, economieCertaine: !!piste && piste.saveMin > 0, meilleureEcartee: best && best !== piste && best.blockers.length ? best : null };
}
