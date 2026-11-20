import type { AppState, Existence, Value } from '../model/types';
import type { Row } from './ComparisonTab';
import { useContext, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { NamesContext, NumView, Money, T, useT, useWho } from './display';
import { shareOrDownload } from '../persistence/io';
import { elementToPdf } from '../print/domToPdf';
import { houseValueOf } from '../engine/simulate';
import { formatEUR } from '../util/money';
import { formatDate, localToday } from '../util/dates';
import { SOURCES } from '../tax/rules';
import { CheckField } from './fields';
import { summarize } from '../domain/rights';
import { detectRepartition, REPARTITION_LABEL } from '../domain/devolution';
import { formatFrac } from '../util/fraction';

export function NotaireTab({ state, rows, showNames, setShowNames }: { state: AppState; rows: Row[]; showNames: boolean; setShowNames: (v: boolean) => void }) {
  const ctx = useContext(NamesContext);
  // Pendant la fabrication du PDF seulement : prénoms selon la case (à l'écran, la fiche garde l'affichage habituel).
  const [pdfMode, setPdfMode] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ficheRef = useRef<HTMLElement>(null);
  // PDF construit dans l'application (T19, comme T18) : depuis l'icône de l'écran d'accueil, iOS n'ouvre pas l'impression.
  // Rendu synchrone puis partage immédiat : l'activation utilisateur est conservée sur iOS.
  const creerPdf = async () => {
    flushSync(() => setPdfMode(true));
    const bytes = ficheRef.current ? elementToPdf(ficheRef.current, 'Simulation indicative, à valider par le notaire') : null;
    flushSync(() => setPdfMode(false));
    if (!bytes) return;
    const how = await shareOrDownload(`fiche-notaire-${localToday()}.pdf`, bytes, 'application/pdf');
    setMsg(how === 'annule' ? null : how === 'partage' ? 'PDF transmis à la feuille de partage.' : 'PDF téléchargé.');
  };
  return (
    <NamesContext.Provider value={pdfMode ? { names: ctx.names, show: showNames } : ctx}>
      <NotaireContent state={state} rows={rows} showNames={showNames} setShowNames={setShowNames} creerPdf={creerPdf} msg={msg} ficheRef={ficheRef} />
    </NamesContext.Provider>
  );
}

function NotaireContent({ state, rows, showNames, setShowNames, creerPdf, msg, ficheRef }: {
  state: AppState; rows: Row[]; showNames: boolean; setShowNames: (v: boolean) => void;
  creerPdf: () => Promise<void>; msg: string | null; ficheRef: React.RefObject<HTMLElement>;
}) {
  const who = useWho();
  const t = useT();
  const s = state.situation;
  const hv = houseValueOf(s);
  const solde = s.creance.nominal.cents === null ? null : s.creance.nominal.cents - s.creance.remboursements.reduce((a, b) => a + b, 0);
  const pending = [...new Set(rows.flatMap((r) => r.res.pending))];
  return (
    <div className="stack">
      <section className="card no-print">
        <h2>Fiche pour le rendez-vous</h2>
        <p>Le PDF et l’impression ne contiennent pas les prénoms par défaut (rôles anonymes). Le PDF est fabriqué sur l’appareil : aucun service tiers.</p>
        <CheckField label="Inclure les noms affichés à l’impression" checked={showNames} onChange={setShowNames} hint="Vaut pour « Créer le PDF » et pour « Imprimer »." />
        <p className="small"><strong>Sur iPhone :</strong> touchez « Créer le PDF », puis choisissez « Enregistrer dans Fichiers », Mail ou Messages dans la feuille de partage. Le PDF reprend le texte de la fiche ci-dessous, en mise en page simple. Sur ordinateur, « Imprimer » garde la mise en page de l’écran.</p>
        <div className="row">
          <button type="button" onClick={() => void creerPdf()}>Créer le PDF</button>
          <button type="button" onClick={() => window.print()}>Imprimer (ordinateur)</button>
        </div>
        {msg && <p className="small" role="status">{msg}</p>}
      </section>

      <article ref={ficheRef} className="card printable" aria-labelledby="h-fiche">
        <h2 id="h-fiche">Questions à valider avec le notaire</h2>
        <p className="small">Simulation indicative établie le {formatDate(localToday())}. Ce n’est ni un avis juridique, ni un devis, ni une déclaration.</p>

        <h3>1. Titres et testament</h3>
        <ul className="checklist">
          <li>☐ Titres de propriété (répartition simulée : {REPARTITION_LABEL[detectRepartition(s.house.lots)]}) : {summarize(s.house.lots).map((h) => `${who(h.holder)} ${[h.pp.n ? `${formatFrac(h.pp)} en pleine propriété` : '', h.np.n ? `${formatFrac(h.np)} en nue-propriété` : '', h.us.n ? `usufruit sur ${formatFrac(h.us)}` : ''].filter(Boolean).join(' + ')}`).join(' ; ')} — à confirmer.</li>
          <li>☐ Succession de la mère (acte de notoriété de 2005) : la réduction de la donation de survie a-t-elle été demandée par les deux fils ? La maison était-elle détenue pour moitié par chaque époux ?
            <ul>
              <li>☐ L’acte de notoriété et le projet de déclaration sont rédigés « en cas de demande en réduction » : obtenir la <strong>déclaration enregistrée</strong> définitive et une preuve que la réduction a été demandée. Le cadastre (MyMinfin) reprend déjà <T>père PP 4/6 + usufruit 2/6, chaque fils NP 1/6</T> : cela suffit-il ?</li>
              <li>☐ <strong>Quasi-usufruit</strong> <T>du père</T> sur les comptes et titres de la mère : à son décès, <T>chaque fils</T> (ou la succession <T>du fils prédécédé</T>) a-t-il une <strong>créance de restitution</strong> d’environ 1/3 de ces avoirs ? Montant de référence (valeur en 2005, sans intérêts ?) ; dette déductible dans la succession <T>du père</T> ; actif à déclarer dans la succession <T>du fils prédécédé</T> ?</li>
              <li>☐ <strong>Autres immeubles</strong> reçus par la mère en nue-propriété (quote-part d’une autre maison, d’une terre agricole ; usufruit d’une aïeule) : usufruit éteint ? biens vendus (prix partagé ?) ; fraction exacte (le projet indique deux fractions différentes : vérifier sur l’acte signé) ; part à reprendre dans la succession <T>du fils prédécédé</T>.</li>
              <li>☐ Terre agricole : le cadastre inscrit <T>le père</T> en nue-propriété et <T>chaque fils</T> en pleine propriété + usufruit, l’inverse de ce que donne l’acte de 2005 → erreur d’inscription ou autre origine ? Rectification utile (enjeu financier minime) ?</li>
            </ul>
          </li>
          <li>☐ <T>Part en nue-propriété du fils prédécédé</T> : testament, option successorale de {who('beneficiaire')}, éventuelle cession ou renonciation.
            <ul>
              <li>☐ <strong>Existence du testament</strong> : le Registre central des testaments (Fednot) a-t-il été interrogé pour <T>le fils prédécédé</T> ? Résultat, notaire qui conserve le testament ; un testament olographe trouvé chez lui a-t-il été déposé chez un notaire (procès-verbal de dépôt) ?</li>
              <li>☐ En l’absence de descendants, <T>le père et le fils survivant</T> sont héritiers légaux : confirmer leur droit à une <strong>copie complète</strong> du testament (et non un extrait) ; qui en fait la demande, et auprès de quel notaire ?</li>
              <li>☐ Le testament modifie-t-il le bénéficiaire d’une assurance vie ? Contient-il un legs à {who('petitFils')} (barème entre oncle et neveu) ?</li>
              <li>☐ Testament : legs à {who('beneficiaire')} (universel ou particulier ?), clause prévue si elle renonce ? Descendants : aucun ? Le couple ne vivait pas dans la maison familiale (celle <T>du père</T>) ?</li>
              <li>☐ Si elle accepte : barème du cohabitant légal (ligne directe) ; exemption supplémentaire de 12 500 € (part ≤ 125 000 €) applicable au cohabitant ?</li>
              <li>☐ Si elle renonce : dévolution légale (<T>1/4 au père, 3/4 au fils survivant</T> ?), barème entre frères et sœurs, plancher « pas moins que le renonçant » (art. 68 C. succ.) et sa répartition.</li>
              <li>☐ Base taxable de la nue-propriété dont <T>le père</T> garde l’usufruit (valeur de la pleine propriété ou de la nue-propriété ? coefficient ?) ; autres biens et dettes de cette succession ; délai de la déclaration (4 mois ?) et de l’option.</li>
              {s.succFilsPredecede.assuranceExiste !== 'non' && <li>☐ Assurances groupe / vie versées à {who('beneficiaire')} ({assuranceTxt(s.succFilsPredecede.assuranceExiste, s.succFilsPredecede.assurance)}) : soumises aux droits de succession (art. 8 C. succ.) ? Montant brut ou net des retenues ? Les dettes de la succession peuvent-elles s’imputer sur ce capital ? Conservées si elle renonce ?</li>}
              {s.succFilsPredecede.epargnePensionExiste !== 'non' && <li>☐ Épargne-pension du fils prédécédé ({assuranceTxt(s.succFilsPredecede.epargnePensionExiste, s.succFilsPredecede.epargnePension)}){s.succFilsPredecede.epargnePensionBeneficiaire === 'beneficiaire' ? <>, bénéficiaire désignée : {who('beneficiaire')}</> : ''} : clause bénéficiaire exacte (et bénéficiaire « à défaut ») ? Refus annoncé par l’assureur (exclusion du suicide) : réponse écrite ; la réserve constituée (épargne versée) est-elle malgré tout restituée, et à qui (la bénéficiaire désignée ou la succession) ? Fiscalité : taxe sur l’épargne-pension au décès et droits de succession ?</li>}
              {s.succFilsPredecede.assuranceFilsExiste !== 'non' && <li>☐ Assurance groupe / vie <T>au profit du fils survivant (frère du fils prédécédé)</T> ({assuranceTxt(s.succFilsPredecede.assuranceFilsExiste, s.succFilsPredecede.assuranceFils)}) : taxée au barème entre frères et sœurs (art. 8 C. succ.) ? Montant brut ou net des retenues ? Clause bénéficiaire : qui reçoit si <T>le fils survivant</T> renonce au bénéfice ? Délai et forme de cette renonciation ; une renonciation pure et simple est-elle exempte de droits de donation ?
                <ul>
                  <li>☐ Documents à demander à l’assureur (et à l’employeur) : copie exacte de la clause bénéficiaire (nom <T>du fils survivant</T> ou formule du type « mon cohabitant légal » ?), avec le bénéficiaire « à défaut » ; date de la dernière modification de la clause et historique des désignations ; une demande de changement de bénéficiaire a-t-elle été reçue, même incomplète ?</li>
                  <li>☐ Décompte prévu par l’assureur : retenues (précompte, cotisations sociales) et montant net versé ; les droits de succession se calculent-ils sur le brut ou sur le net ?</li>
                  <li>☐ Avant tout paiement : ne pas accepter ni toucher le capital tant que le testament et la clause n’ont pas été vus (pour garder la possibilité de renoncer au bénéfice) ; si un testament désigne un autre bénéficiaire après le paiement, que se passe-t-il ?</li>
                  <li>☐ Pour transmettre ce capital à {who('beneficiaire')} : renonciation au bénéfice, don bancaire (risque de rappel si décès du donateur dans les 5 ans, barème entre non-parents) ou donation enregistrée (5,5 %) ? Faut-il attendre son option successorale (créanciers) ?</li>
                </ul>
              </li>}
              <li>☐ Contrat éventuellement refusé par l’assureur (exclusion du suicide) : clause exacte (en principe, suicide exclu seulement pendant la première année du contrat, sauf clause contraire) ; la réserve déjà constituée est-elle versée malgré tout ? Demander la réponse écrite de l’assureur.</li>
              <li>☐ Dettes de cette succession : nature (crédit hypothécaire ?), assurance solde restant dû ? Si les dettes dépassent les biens et qu’elle renonce : risque pour <T>le père</T> et <T>le fils survivant</T>, acceptation sous bénéfice d’inventaire ou renonciation, délais.
                <ul>
                  <li>☐ Liste exacte des dettes : lesquelles ont été signées par <T>le fils prédécédé</T> seul, lesquelles avec {who('beneficiaire')} (codébitrice : tenue même si elle renonce) ?</li>
                  <li>☐ Assurance solde restant dû sur le logement du couple : existe-t-elle, rembourse-t-elle le crédit (exclusion du suicide ?) ; sinon, la maison du couple doit-elle être vendue ou {who('beneficiaire')} peut-elle racheter la moitié de la succession (à quelle valeur) ?</li>
                  <li>☐ Bénéfice d’inventaire : coût, durée, formalités (déclaration chez le notaire, publication, délai des créanciers) ; actes à éviter d’ici là (acceptation tacite : comptes, objets, paiement de dettes).</li>
                  <li>☐ 1/6 en nue-propriété de la maison <T>du père</T> : l’usufruit du père est-il bien protégé ? Droit pour <T>le père</T> et <T>le fils survivant</T> de racheter ce 1/6 à la succession pour éviter sa vente à un tiers ; à quelle valeur ?</li>
                  <li>☐ Si <T>le fils survivant</T> renonce : ses enfants sont-ils appelés à sa place (représentation du renonçant) ? Renonciation pour un mineur (autorisation du juge de paix) ; et si tout le monde renonce : curateur à succession vacante ?</li>
                </ul>
              </li>
              <li>☐ Logement du couple (détenu pour moitié par chacun) : exemption « logement familial » du cohabitant légal pour la moitié recueillie (non modélisée : cette moitié est comptée dans les « autres biens nets ») ?</li>
            </ul>
          </li>
          <li>☐ <T>Testament du père</T> : qualité d’héritier légal unique de {who('fils')} ; legs éventuel à {who('petitFils')} (20 000 € / 25 000 €), clause d’imputation des dons, droits à charge de qui.</li>
        </ul>

        <h3>2. Valeurs</h3>
        <ul className="checklist">
          <li>☐ Valeur actuelle de la maison (expertise) : {formatEUR(s.house.valeurExpertise.cents)} — hypothèse utilisée {formatEUR(hv.cents)} ({hv.provenance}).</li>
          <li>☐ Valeur au {formatDate(s.house.dateDecesFilsPredecede)} (<T>décès du fils prédécédé</T>) : {formatEUR(s.house.valeurDecesFilsPredecede.cents)}.</li>
          <li>☐ <T>Soldes bancaires et titres du père</T> : {s.postes.filter((p) => ['compte', 'titres', 'autre_avoir'].includes(p.kind)).map((p) => `${p.label} ${formatEUR(p.value.cents)}`).join(' ; ')}.</li>
          <li>☐ <T>Créance contre la succession du fils prédécédé</T> : nominal {formatEUR(s.creance.nominal.cents)}, solde indicatif {formatEUR(solde)}, montant recouvrable {formatEUR(s.creance.recouvre.cents)} ; traitement fiscal.</li>
        </ul>

        <h3>3. Donation et vente</h3>
        <ul className="checklist">
          <li>☐ Coût de l’acte de donation immobilière (honoraires, frais, droits) — devis.</li>
          <li>☐ Base des droits d’une donation avec réserve d’usufruit ; cumul avec des donations antérieures.
            <ul>
              <li>☐ <strong>Démembrement</strong> : une donation de la nue-propriété des 2/3 <T>du père</T> avec réserve d’usufruit est-elle intéressante, sachant que les droits de donation wallons portent sur la valeur de la pleine propriété du lot donné ?</li>
              <li>☐ Donation avec réserve d’usufruit : risque lié à l’art. 9 C. succ. (biens donnés avec réserve d’usufruit) et au rappel des dons non enregistrés (3 ou 5 ans) ?</li>
              <li>☐ Au décès <T>du père</T> : confirmer que l’extinction de son usufruit sur 1/3 de la maison ne déclenche ni frais ni droits de succession, et que seuls ses 2/3 en pleine propriété entrent dans sa succession.</li>
              <li>☐ Usufruit <T>du père</T> sur le 1/6 <T>du fils prédécédé</T> : il se maintient pendant la succession de ce dernier ; effet sur la valeur déclarée de cette nue-propriété et sur une éventuelle cession.</li>
            </ul>
          </li>
          <li>☐ Existence et mécanisme d’une réserve de progressivité pour une donation immobilière dans les 3 ans du décès (non trouvée dans les sources consultées) ; imputation de l’exemption (art. 54 / 66bis).</li>
          <li>☐ En cas de vente : coefficient économique d’usufruit convenu, ventilation du prix par lot, accords de tous les titulaires, report d’usufruit éventuel.</li>
          <li>☐ Enregistrement d’un don bancaire : procédure, date d’effet, preuve, enregistrement distinct de la date du don.</li>
        </ul>

        <h3>4. Fiscalité selon les dates</h3>
        <ul className="checklist">
          <li>☐ Jour exact de bascule des délais de 3 et 5 ans (date anniversaire, 29 février).</li>
          <li>☐ Taux réduit « logement familial » : éligibilité, effet d’un déménagement ou d’un départ en maison de soins, empilement avec les autres biens (art. 60ter).</li>
          <li>☐ Décès à partir du 01/01/2028 : barème du décret du 05/12/2024 et réforme annoncée le 12/10/2026 (exonération de 75 000 € par bénéficiaire) — texte, date d’effet, interaction avec le logement, les legs et les donations.</li>
          <li>☐ Exemption pour {who('petitFils')} légataire (héritier non légal) et traitement d’un don rappelé.</li>
        </ul>

        <h3>5. Réserve à préserver pour {who('pere')}</h3>
        <ul className="checklist">
          <li>☐ Réserve minimale : {formatEUR(s.budget.reserveMinimale.cents)} ; pension {formatEUR(s.budget.pensionMensuelle.cents)} ; dépenses {formatEUR(s.budget.depensesMensuelles.cents)} ; soins/hébergement {formatEUR(s.budget.soinsMensuels.cents)}.</li>
        </ul>

        <h3>6. Synthèse des variantes comparées</h3>
        <table className="print-table">
          <thead><tr><th scope="col">Variante</th><th scope="col">Décès</th><th scope="col">Aujourd’hui</th><th scope="col">Au décès</th><th scope="col">Total fiscal</th><th scope="col"><T>Trésorerie du père</T></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.sc.id}><td><T>{r.sc.name}</T></td><td>{r.sc.deathDate ? formatDate(r.sc.deathDate) : '—'}</td><td><NumView n={r.res.totals.fiscalToday} /></td><td><NumView n={r.res.totals.fiscalDeath} /></td><td><NumView n={r.res.totals.fiscalTotal} /></td><td><Money c={r.res.cash.afterEvents} /></td></tr>)}</tbody>
        </table>

        <h3>7. Points en suspens relevés par la simulation</h3>
        <ul className="small">{pending.slice(0, 30).map((p, i) => <li key={i}>☐ {t(p)}</li>)}</ul>

        <h3>Sources consultées</h3>
        <ul className="small">{Object.values(SOURCES).map((x) => <li key={x.titre}>{x.titre} — {x.url} (consulté le {formatDate(x.consulte)})</li>)}</ul>
      </article>
    </div>
  );
}

/** Montant d'une assurance pour la fiche, avec l'incertitude sur l'existence du contrat. */
function assuranceTxt(e: Existence, v: Value): string {
  if (e === 'inconnu') return 'existence à vérifier';
  const m = v.cents === null ? 'montant à préciser' : formatEUR(v.cents);
  return e === 'possible' ? `${m}, contrat incertain` : m;
}
