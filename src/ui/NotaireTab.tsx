import type { AppState } from '../model/types';
import type { Row } from './ComparisonTab';
import { NumView, Money, T, useT, useWho } from './display';
import { houseValueOf } from '../engine/simulate';
import { formatEUR } from '../util/money';
import { formatDate } from '../util/dates';
import { SOURCES } from '../tax/rules';
import { CheckField } from './fields';
import { summarize } from '../domain/rights';
import { detectRepartition, REPARTITION_LABEL } from '../domain/devolution';
import { formatFrac } from '../util/fraction';

export function NotaireTab({ state, rows, showNames, setShowNames }: { state: AppState; rows: Row[]; showNames: boolean; setShowNames: (v: boolean) => void }) {
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
        <p>Cette fiche s’imprime sans données personnelles par défaut (rôles anonymes). Utilisez « Imprimer » puis « Enregistrer en PDF » dans le navigateur : aucun service tiers.</p>
        <CheckField label="Inclure les noms affichés à l’impression" checked={showNames} onChange={setShowNames} />
        <button type="button" onClick={() => window.print()}>Imprimer / enregistrer en PDF</button>
      </section>

      <article className="card printable" aria-labelledby="h-fiche">
        <h2 id="h-fiche">Questions à valider avec le notaire</h2>
        <p className="small">Simulation indicative établie le {formatDate(new Date().toISOString().slice(0, 10))}. Ce n’est ni un avis juridique, ni un devis, ni une déclaration.</p>

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
              <li>☐ Testament : legs à {who('beneficiaire')} (universel ou particulier ?), clause prévue si elle renonce ? Descendants : aucun ? Le couple ne vivait pas dans la maison familiale (celle <T>du père</T>) ?</li>
              <li>☐ Si elle accepte : barème du cohabitant légal (ligne directe) ; exemption supplémentaire de 12 500 € (part ≤ 125 000 €) applicable au cohabitant ?</li>
              <li>☐ Si elle renonce : dévolution légale (<T>1/4 au père, 3/4 au fils survivant</T> ?), barème entre frères et sœurs, plancher « pas moins que le renonçant » (art. 68 C. succ.) et sa répartition.</li>
              <li>☐ Base taxable de la nue-propriété dont <T>le père</T> garde l’usufruit (valeur de la pleine propriété ou de la nue-propriété ? coefficient ?) ; autres biens et dettes de cette succession ; délai de la déclaration (4 mois ?) et de l’option.</li>
              <li>☐ Assurances groupe / vie versées à {who('beneficiaire')} ({formatEUR(s.succFilsPredecede.assurance.cents)}) : soumises aux droits de succession (art. 8 C. succ.) ? Montant brut ou net des retenues ? Les dettes de la succession peuvent-elles s’imputer sur ce capital ? Conservées si elle renonce ?</li>
              <li>☐ Dettes de cette succession : nature (crédit hypothécaire ?), assurance solde restant dû ? Si les dettes dépassent les biens et qu’elle renonce : risque pour <T>le père</T> et <T>le fils survivant</T>, acceptation sous bénéfice d’inventaire ou renonciation, délais.</li>
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
          <li>☐ Base des droits d’une donation avec réserve d’usufruit ; cumul avec des donations antérieures.</li>
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
