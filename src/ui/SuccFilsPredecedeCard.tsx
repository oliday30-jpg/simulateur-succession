import type { Situation, SuccessionFilsPredecede } from '../model/types';
import { computeSuccFilsPredecede, ecartRenonciation, type SfpScenario, type TransmissionResult } from '../engine/succFilsPredecede';
import { FracField, MoneyField, SelectField, ValueField } from './fields';
import { NumView, SliceTable, T, useT, useWho } from './display';
import { formatEUR } from '../util/money';
import { formatFrac } from '../util/fraction';
import { formatDate } from '../util/dates';

type Upd = (fn: (s: Situation) => void) => void;

/** Succession du fils prédécédé : hypothèses et droits estimés selon l'option de la bénéficiaire. */
export function SuccFilsPredecedeCard({ s, update }: { s: Situation; update: Upd }) {
  const who = useWho();
  const t = useT();
  const o = s.succFilsPredecede;
  const set = (fn: (o: SuccessionFilsPredecede) => void) => update((d) => fn(d.succFilsPredecede));
  const r = computeSuccFilsPredecede(s);
  const ecart = ecartRenonciation(r);
  return (
    <section className="card" aria-labelledby="h-sfp">
      <h2 id="h-sfp"><T>Succession du fils prédécédé : droits selon l’option de la bénéficiaire</T></h2>
      <p className="muted">
        {t(`Droits de succession dus sur la succession du fils prédécédé (décès du ${formatDate(r.dateDeces)}), pas sur celle du père.`)}{' '}
        Les deux options sont toujours calculées pour pouvoir les comparer ; l’option retenue se choisit dans « Part du fils prédécédé » ci-dessus. Estimation indicative, à valider par le notaire.
      </p>
      <div className="grid">
        <SelectField label="Testament" help="sfpTestament" value={o.testament} onChange={(v) => set((x) => { x.testament = v; })}
          options={[['inconnu', 'Inconnu'], ['legs_beneficiaire', t('Oui, en faveur de la bénéficiaire')], ['aucun', 'Pas de testament']]} />
        <SelectField label="Descendants du fils prédécédé" value={o.descendants} onChange={(v) => set((x) => { x.descendants = v; })}
          options={[['inconnu', 'Inconnu'], ['aucun', 'Aucun enfant'], ['oui', 'Un ou plusieurs enfants']]} />
        <SelectField label={t('Le fils prédécédé et sa cohabitante habitaient-ils la maison familiale (celle du père) ?')} value={o.residenceCommune} onChange={(v) => set((x) => { x.residenceCommune = v; })}
          options={[['inconnu', 'Inconnu'], ['non', 'Non'], ['oui', 'Oui']]}
          hint="Non s’ils vivaient dans leur propre logement (celui-ci va dans « Autres biens nets »). Si oui : usufruit légal du cohabitant et exemption du logement familial (non modélisés, calcul indisponible)." />
        <ValueField label="Autres biens nets de cette succession" help="sfpAutresBiens" value={o.autresBiensNets} onChange={(v) => set((x) => { x.autresBiensNets = v; })} allowNegative
          hint="Sa moitié de son propre logement, comptes, voiture… moins les dettes et frais (y compris la créance du père). Plus ce qui vient de la succession de la mère hors maison (créance de restitution du quasi-usufruit, quotes-parts d’autres immeubles). Sans les assurances. Négatif (« -40 000 ») si les dettes dépassent." />
        <ValueField label="Assurance groupe / vie versée à la bénéficiaire" help="sfpAssurance" value={o.assurance} onChange={(v) => set((x) => { x.assurance = v; })}
          hint="Capital versé directement par l’assureur : hors succession, les dettes ne s’y imputent pas. Mettre 0 s’il n’y en a pas." />
        <SelectField label="Assurance soumise aux droits de succession ?" help="sfpAssuranceTaxee" value={o.assuranceTaxee} onChange={(v) => set((x) => { x.assuranceTaxee = v; })}
          options={[['inconnu', 'À confirmer (fourchette)'], ['oui', 'Oui (confirmé)'], ['non', 'Non (confirmé)']]}
          hint="En principe oui (art. 8 C. succ.), à confirmer pour une assurance groupe." />
        <ValueField label={t('Assurance groupe / vie versée au fils survivant')} help="sfpAssuranceFils" value={o.assuranceFils} onChange={(v) => set((x) => { x.assuranceFils = v; })}
          hint="Contrat dont le fils survivant est le bénéficiaire désigné : hors succession, taxé au barème entre frères et sœurs. Mettre 0 s’il n’y en a pas." />
        <SelectField label={t('Assurance du fils survivant soumise aux droits de succession ?')} help="sfpAssuranceTaxee" value={o.assuranceFilsTaxee} onChange={(v) => set((x) => { x.assuranceFilsTaxee = v; })}
          options={[['inconnu', 'À confirmer (fourchette)'], ['oui', 'Oui (confirmé)'], ['non', 'Non (confirmé)']]} />
        <SelectField label={t('Si le fils survivant renonce au bénéfice du contrat, le capital va à…')} help="sfpAssuranceFilsSuivant" value={o.assuranceFilsSuivant} onChange={(v) => set((x) => { x.assuranceFilsSuivant = v; })}
          options={[['inconnu', 'Inconnu (clause à lire)'], ['beneficiaire', t('La bénéficiaire (cohabitante légale)')], ['succession', 'Personne : la succession'], ['autre', 'Une autre personne']]}
          hint="Lire la clause bénéficiaire (ou le règlement du plan) avant d’accepter le capital." />
        <SelectField label="Base taxable de la nue-propriété" help="sfpBaseNP" value={o.baseNP} onChange={(v) => set((x) => { x.baseNP = v; })}
          options={[['a_confirmer', 'À confirmer (fourchette)'], ['pleine_propriete', 'Valeur de la pleine propriété'], ['nue_propriete', 'Valeur de la nue-propriété (coefficient)']]}
          hint="Le père garde l’usufruit : la règle d’évaluation n’a pas été trouvée dans les sources consultées." />
        <FracField label="Valeur de la nue-propriété (% de la pleine propriété)" help="sfpCoefNP" value={o.coefNP} onChange={(f) => set((x) => { x.coefNP = f; })}
          hint="Donné par le notaire (dépend notamment de l’âge du père). Ex. « 60 % »." />
        <SelectField label="Exemption supplémentaire de 12 500 € pour la cohabitante" value={o.supplementCohabitant} onChange={(v) => set((x) => { x.supplementCohabitant = v; })}
          options={[['inconnu', 'À confirmer (fourchette)'], ['appliquer', 'Oui (confirmé)'], ['ne_pas_appliquer', 'Non (confirmé)']]}
          hint="Le SPF l’écrit pour l’héritier en ligne directe seulement." />
      </div>

      <p>
        Part de la maison : <strong>{formatFrac(r.quotePart)}</strong> × {formatEUR(r.valeurMaison.cents)} <span className="small muted">({r.valeurMaison.provenance})</span>
        {' '}= <strong>{formatEUR(r.partPP)}</strong> en pleine propriété{r.partNP !== null && <> ; {formatEUR(r.partNP)} avec le coefficient de nue-propriété</>}.
      </p>
      {r.avertissements.length > 0 && (
        <ul className="issues">{r.avertissements.map((a, i) => <li key={i} className="issue lv-a_confirmer"><span className="lv"><span aria-hidden="true">?</span> À confirmer :</span> {t(a)}</li>)}</ul>
      )}

      <div className="sfp-grid">
        {r.scenarios.map((sc) => <ScenarioBlock key={sc.key} sc={sc} />)}
      </div>
      <p className="small muted">{t(r.hypothesePrudente)}</p>
      {ecart && <p><strong>{ecart}</strong></p>}
      {r.transmission && <TransmissionBlock tr={r.transmission} />}

      <details>
        <summary>Montants calculés par le notaire (remplacent l’estimation)</summary>
        <div className="grid">
          <MoneyField help="sfpDroitsNotaire" label={`Droits — ${who('beneficiaire')} (si elle accepte)`} value={o.droitsNotaire.beneficiaire} onChange={(c) => set((x) => { x.droitsNotaire.beneficiaire = c; })} />
          <MoneyField label={`Droits — ${who('pere')} (si renonciation)`} value={o.droitsNotaire.pere} onChange={(c) => set((x) => { x.droitsNotaire.pere = c; })} />
          <MoneyField label={`Droits — ${who('fils')} (si renonciation, assurance à son profit comprise)`} value={o.droitsNotaire.fils} onChange={(c) => set((x) => { x.droitsNotaire.fils = c; })} />
        </div>
      </details>
      <p className="small muted">Sources : {r.sources.map((x) => `${x.titre} (consulté le ${formatDate(x.consulte)})`).join(' ; ')}.</p>
    </section>
  );
}

/** Capital d'assurance du fils survivant : le garder ou le transmettre à la bénéficiaire. */
function TransmissionBlock({ tr }: { tr: TransmissionResult }) {
  const who = useWho();
  const t = useT();
  return (
    <section aria-labelledby="h-sfp-trans">
      <h3 id="h-sfp-trans">{t(`Assurance du fils survivant (${formatEUR(tr.capital)}) : la garder ou la transmettre à la bénéficiaire ?`)}</h3>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">Comparaison des façons de transmettre le capital</caption>
          <thead><tr><th scope="col">Option</th><th scope="col">Droits payés</th><th scope="col">Reçu par {who('beneficiaire')}</th><th scope="col">Hypothèse prudente (droits / reçu)</th></tr></thead>
          <tbody>
            {tr.options.map((op) => (
              <tr key={op.key}>
                <th scope="row">{t(op.titre)}
                  {!op.disponible && <div className="small"><span aria-hidden="true">—</span> Non calculé : {t(op.raison ?? '')}</div>}
                  {op.risque && <div className="small"><span aria-hidden="true">⚠</span> {t('Risque si le fils survivant décède dans les 5 ans')} : <NumView n={op.risque} showStatus={false} /> de droits pour {who('beneficiaire')}</div>}
                </th>
                <td>{op.disponible ? <NumView n={op.droits} /> : '—'}</td>
                <td>{op.disponible ? <NumView n={op.recu} showStatus={false} /> : '—'}</td>
                <td>{op.disponible ? <>{formatEUR(op.droitsPrudent)} / {formatEUR(op.recuPrudent)}</> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="small">
        {tr.notes.map((n, i) => <li key={`n${i}`}>{t(n)}</li>)}
        {tr.options.flatMap((op) => op.notes.map((n, i) => <li key={`${op.key}${i}`}><strong>{t(op.titre)} :</strong> {t(n)}</li>))}
      </ul>
      <p className="small muted">Sources : {tr.sources.map((x) => `${x.titre} (consulté le ${formatDate(x.consulte)})`).join(' ; ')}.</p>
    </section>
  );
}

function ScenarioBlock({ sc }: { sc: SfpScenario }) {
  const who = useWho();
  const t = useT();
  return (
    <article className="sfp-scenario" aria-label={t(sc.titre)}>
      <h3><T>{sc.titre}</T>{sc.retenu && <span className="badge st-calcule"> <span aria-hidden="true">✓</span> option retenue</span>}</h3>
      {!sc.disponible ? <p><span aria-hidden="true">—</span> Non calculé : {t(sc.raison ?? '')}</p> : (
        <>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Droits par personne — {t(sc.titre)}</caption>
              <thead><tr><th scope="col">Personne</th><th scope="col">Part taxable</th><th scope="col">Droits (fourchette)</th><th scope="col">Hypothèse prudente</th></tr></thead>
              <tbody>
                {sc.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{who(row.id)}<div className="small muted">{t(row.bareme)}</div></th>
                    <td><NumView n={row.part} showStatus={false} /></td>
                    <td><NumView n={row.droits} /></td>
                    <td>{formatEUR(row.prudent)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row">Total{sc.plancherApplique && ' (plancher art. 68)'}</th><td /><td><NumView n={sc.total} /></td><td><strong>{formatEUR(sc.totalPrudent)}</strong></td></tr></tfoot>
            </table>
          </div>
          <ul className="small">{sc.notes.map((n, i) => <li key={i}>{t(n)}</li>)}</ul>
          {sc.rows.map((row) => row.detail && row.manual === null && (
            <details key={row.id}>
              <summary>Détail du calcul — {who(row.id)} (hypothèse prudente)</summary>
              <p className="small">Part nette {formatEUR(row.detail.partNette)} ; avant exemption {formatEUR(row.detail.avantAbattement)} ; exemption {formatEUR(row.detail.abattementMontant)} (−{formatEUR(row.detail.abattementReduction)}) ; droits {formatEUR(row.detail.droits)}.</p>
              <SliceTable slices={row.detail.ordinaireSlices} caption="Tranches du barème" />
            </details>
          ))}
        </>
      )}
    </article>
  );
}
