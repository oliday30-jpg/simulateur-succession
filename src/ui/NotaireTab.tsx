import type { AppState } from '../model/types';
import type { Row } from './ComparisonTab';
import { NumView, Money, useWho } from './display';
import { houseValueOf } from '../engine/simulate';
import { formatEUR } from '../util/money';
import { formatDate } from '../util/dates';
import { SOURCES } from '../tax/rules';
import { CheckField } from './fields';

export function NotaireTab({ state, rows, showNames, setShowNames }: { state: AppState; rows: Row[]; showNames: boolean; setShowNames: (v: boolean) => void }) {
  const who = useWho();
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
          <li>☐ Titres de propriété : {who('pere')} 50 % en pleine propriété et usufruit sur 50 % ; {who('fils')} 25 % en nue-propriété (succession de la mère) — à confirmer.</li>
          <li>☐ Quart en nue-propriété du fils prédécédé : testament, option successorale de {who('beneficiaire')}, éventuelle cession ou renonciation.</li>
          <li>☐ Testament du père : qualité d’héritier légal unique de {who('fils')} ; legs éventuel à {who('petitFils')} (20 000 € / 25 000 €), clause d’imputation des dons, droits à charge de qui.</li>
        </ul>

        <h3>2. Valeurs</h3>
        <ul className="checklist">
          <li>☐ Valeur actuelle de la maison (expertise) : {formatEUR(s.house.valeurExpertise.cents)} — hypothèse utilisée {formatEUR(hv.cents)} ({hv.provenance}).</li>
          <li>☐ Valeur au {formatDate(s.house.dateDecesFilsPredecede)} (décès du fils prédécédé) : {formatEUR(s.house.valeurDecesFilsPredecede.cents)}.</li>
          <li>☐ Soldes bancaires et titres du père : {s.postes.filter((p) => ['compte', 'titres', 'autre_avoir'].includes(p.kind)).map((p) => `${p.label} ${formatEUR(p.value.cents)}`).join(' ; ')}.</li>
          <li>☐ Créance contre la succession du fils prédécédé : nominal {formatEUR(s.creance.nominal.cents)}, solde indicatif {formatEUR(solde)}, montant recouvrable {formatEUR(s.creance.recouvre.cents)} ; traitement fiscal.</li>
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
          <thead><tr><th scope="col">Variante</th><th scope="col">Décès</th><th scope="col">Aujourd’hui</th><th scope="col">Au décès</th><th scope="col">Total fiscal</th><th scope="col">Trésorerie du père</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.sc.id}><td>{r.sc.name}</td><td>{r.sc.deathDate ? formatDate(r.sc.deathDate) : '—'}</td><td><NumView n={r.res.totals.fiscalToday} /></td><td><NumView n={r.res.totals.fiscalDeath} /></td><td><NumView n={r.res.totals.fiscalTotal} /></td><td><Money c={r.res.cash.afterEvents} /></td></tr>)}</tbody>
        </table>

        <h3>7. Points en suspens relevés par la simulation</h3>
        <ul className="small">{pending.slice(0, 30).map((p, i) => <li key={i}>☐ {p}</li>)}</ul>

        <h3>Sources consultées (17/11/2026)</h3>
        <ul className="small">{Object.values(SOURCES).map((x) => <li key={x.url}>{x.titre} — {x.url}</li>)}</ul>
      </article>
    </div>
  );
}
