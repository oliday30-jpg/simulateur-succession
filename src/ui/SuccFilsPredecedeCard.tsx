import type { EpargnePensionBeneficiaire, Existence, Situation, SuccessionFilsPredecede } from '../model/types';
import { assuranceAChiffrer } from './essentials';
import { computeSuccFilsPredecede, ecartRenonciation, type NetBenefResult, type SfpScenario, type TransmissionResult } from '../engine/succFilsPredecede';
import { FracField, MoneyField, SelectField, ValueField, useHelp } from './fields';
import { NumView, SliceTable, T, useReadOnly, useT, useWho } from './display';
import { formatEUR } from '../util/money';
import { formatFrac } from '../util/fraction';
import { formatDate } from '../util/dates';

type Upd = (fn: (s: Situation) => void) => void;

const EXISTE: [Existence, string][] = [['inconnu', 'Je ne sais pas encore'], ['non', 'Non, aucune'], ['possible', 'Peut-être (calcul avec et sans)'], ['oui', 'Oui, confirmée']];

/** Succession du fils prédécédé : hypothèses et droits estimés selon l'option de la bénéficiaire. */
export function SuccFilsPredecedeCard({ s, update }: { s: Situation; update: Upd }) {
  const who = useWho();
  const t = useT();
  const o = s.succFilsPredecede;
  const set = (fn: (o: SuccessionFilsPredecede) => void) => update((d) => fn(d.succFilsPredecede));
  const r = computeSuccFilsPredecede(s);
  const ecart = ecartRenonciation(r);
  const ro = useReadOnly();
  return (
    <section className="card" aria-labelledby="h-sfp">
      <h2 id="h-sfp"><T>Succession du fils prédécédé : droits selon l’option de la bénéficiaire</T></h2>
      <p className="muted">
        {t(`Droits de succession dus sur la succession du fils prédécédé (décès du ${formatDate(r.dateDeces)}), pas sur celle du père.`)}{' '}
        Les deux options sont toujours calculées pour pouvoir les comparer ; l’option retenue se choisit dans « Part du fils prédécédé » en haut de cet onglet. Estimation indicative, à valider par le notaire.
      </p>
      <h3><T>2. Famille et testament</T></h3>
      <div className="grid">
        <SelectField label="Testament" help="sfpTestament" essential filled={o.testament !== 'inconnu'} value={o.testament} onChange={(v) => set((x) => { x.testament = v; })}
          options={[['inconnu', 'Inconnu'], ['legs_beneficiaire', t('Oui, en faveur de la bénéficiaire')], ['aucun', 'Pas de testament']]}
          hint={o.testament === 'aucun' ? 'Sans testament, la cohabitante légale ne recueille pas cette part : seule la renonciation (dévolution légale) est calculée.' : undefined} />
        <SelectField label="Descendants du fils prédécédé" help="sfpDescendants" essential filled={o.descendants !== 'inconnu'} value={o.descendants} onChange={(v) => set((x) => { x.descendants = v; })}
          options={[['inconnu', 'Inconnu'], ['aucun', 'Aucun enfant'], ['oui', 'Un ou plusieurs enfants']]} />
        <SelectField label={t('Le fils prédécédé et sa cohabitante habitaient-ils la maison familiale (celle du père) ?')} help="sfpResidence" essential filled={o.residenceCommune !== 'inconnu'} value={o.residenceCommune} onChange={(v) => set((x) => { x.residenceCommune = v; })}
          options={[['inconnu', 'Inconnu'], ['non', 'Non'], ['oui', 'Oui']]}
          hint="Non s’ils vivaient dans leur propre logement (celui-ci va dans « Autres biens nets »). Si oui : usufruit légal du cohabitant et exemption du logement familial (non modélisés, calcul indisponible)." />
      </div>

      <h3><T>3. Biens et dettes du fils prédécédé</T></h3>
      <div className="grid">
        <ValueField label="Autres biens nets de cette succession" help="sfpAutresBiens" essential value={o.autresBiensNets} onChange={(v) => set((x) => { x.autresBiensNets = v; })} allowNegative
          hint="Sa moitié de son propre logement, comptes, voiture… moins les dettes et frais (y compris la créance du père). Plus ce qui vient de la succession de la mère hors maison (créance de restitution du quasi-usufruit, quotes-parts d’autres immeubles). Sans les assurances. Négatif (« -40 000 ») si les dettes dépassent ; « 0 » s’il n’y a rien." />
      </div>

      <h3><T>4. Assurances groupe / vie (hors succession)</T></h3>
      <p className="small muted">Indiquez d’abord si chaque contrat existe : le montant et les options n’apparaissent que pour « Oui » ou « Peut-être ». « Peut-être » calcule avec et sans le capital.</p>
      <div className="grid">
        <SelectField<Existence> label="Une assurance groupe / vie est-elle versée à la bénéficiaire ?" help="sfpAssuranceExiste" essential filled={o.assuranceExiste !== 'inconnu'} value={o.assuranceExiste} onChange={(v) => set((x) => { x.assuranceExiste = v; })} options={EXISTE} />
        {assuranceAChiffrer(o.assuranceExiste) && (
          <>
            <ValueField label="Assurance groupe / vie versée à la bénéficiaire" help="sfpAssurance" essential value={o.assurance} onChange={(v) => set((x) => { x.assurance = v; })}
              hint="Capital versé directement par l’assureur : hors succession, les dettes ne s’y imputent pas." />
            <SelectField label="Assurance soumise aux droits de succession ?" help="sfpAssuranceTaxee" value={o.assuranceTaxee} onChange={(v) => set((x) => { x.assuranceTaxee = v; })}
              options={[['inconnu', 'À confirmer (fourchette)'], ['oui', 'Oui (confirmé)'], ['non', 'Non (confirmé)']]}
              hint="En principe oui (art. 8 C. succ.), à confirmer pour une assurance groupe." />
          </>
        )}
      </div>
      <div className="grid">
        <SelectField<Existence> label="Une assurance groupe / vie est-elle versée au fils survivant (frère du fils prédécédé) ?" help="sfpAssuranceFilsExiste" essential filled={o.assuranceFilsExiste !== 'inconnu'} value={o.assuranceFilsExiste} onChange={(v) => set((x) => { x.assuranceFilsExiste = v; })} options={EXISTE} />
        {assuranceAChiffrer(o.assuranceFilsExiste) && (
          <>
            <ValueField label="Assurance groupe / vie versée au fils survivant (frère du fils prédécédé)" help="sfpAssuranceFils" essential value={o.assuranceFils} onChange={(v) => set((x) => { x.assuranceFils = v; })}
              hint="Contrat du fils prédécédé dont son frère, le fils survivant, est le bénéficiaire désigné (il ne s’agit pas d’un enfant du fils prédécédé) : hors succession, taxé au barème entre frères et sœurs." />
            <SelectField label="Assurance du fils survivant (frère du fils prédécédé) soumise aux droits de succession ?" help="sfpAssuranceFilsTaxee" value={o.assuranceFilsTaxee} onChange={(v) => set((x) => { x.assuranceFilsTaxee = v; })}
              options={[['inconnu', 'À confirmer (fourchette)'], ['oui', 'Oui (confirmé)'], ['non', 'Non (confirmé)']]} />
            <SelectField label="Si le fils survivant (frère du fils prédécédé) renonce au bénéfice du contrat, le capital va à…" help="sfpAssuranceFilsSuivant" value={o.assuranceFilsSuivant} onChange={(v) => set((x) => { x.assuranceFilsSuivant = v; })}
              options={[['inconnu', 'Inconnu (clause à lire)'], ['beneficiaire', t('La bénéficiaire (cohabitante légale)')], ['succession', 'Personne : la succession'], ['autre', 'Une autre personne']]}
              hint="Lire la clause bénéficiaire (ou le règlement du plan) avant d’accepter le capital." />
          </>
        )}
      </div>

      <div className="grid">
        <SelectField<Existence> label="Une épargne-pension du fils prédécédé existe-t-elle ?" help="sfpEpargnePensionExiste" value={o.epargnePensionExiste} onChange={(v) => set((x) => { x.epargnePensionExiste = v; })} options={EXISTE} />
        {assuranceAChiffrer(o.epargnePensionExiste) && (
          <>
            <ValueField label="Épargne-pension (capital au décès)" help="sfpEpargnePension" value={o.epargnePension} onChange={(v) => set((x) => { x.epargnePension = v; })}
              hint="Non comptée dans les droits estimés : versement incertain (refus possible de l’assureur) et régime fiscal propre." />
            <SelectField<EpargnePensionBeneficiaire> label="Bénéficiaire de l’épargne-pension selon la clause" help="sfpEpargnePensionBenef" value={o.epargnePensionBeneficiaire} onChange={(v) => set((x) => { x.epargnePensionBeneficiaire = v; })}
              options={[['inconnu', 'À établir (clause à lire)'], ['beneficiaire', t('La bénéficiaire (cohabitante légale)')], ['heritiers', 'Les héritiers légaux / la succession'], ['fils', t('Le fils survivant (frère du fils prédécédé)')], ['pere', t('Le père')], ['autre', 'Une autre personne']]} />
          </>
        )}
      </div>

      <h3><T>5. Règles fiscales à confirmer</T></h3>
      <p className="small muted">Laissées « à confirmer », elles donnent une fourchette ; à préciser avec le notaire.</p>
      <div className="grid">
        <SelectField label="Base taxable de la nue-propriété" help="sfpBaseNP" value={o.baseNP} onChange={(v) => set((x) => { x.baseNP = v; })}
          options={[['a_confirmer', 'À confirmer (fourchette)'], ['pleine_propriete', 'Valeur de la pleine propriété'], ['nue_propriete', 'Valeur de la nue-propriété (coefficient)']]}
          hint="Le père garde l’usufruit : la règle d’évaluation n’a pas été trouvée dans les sources consultées." />
        {o.baseNP !== 'pleine_propriete' && (
          <FracField label="Valeur de la nue-propriété (% de la pleine propriété)" help="sfpCoefNP" essential={o.baseNP === 'nue_propriete'} value={o.coefNP} onChange={(f) => set((x) => { x.coefNP = f; })}
            hint="Donné par le notaire (dépend notamment de l’âge du père). Ex. « 60 % »." />
        )}
        {o.testament !== 'aucun' && (
          <SelectField label="Exemption supplémentaire de 12 500 € pour la cohabitante" value={o.supplementCohabitant} onChange={(v) => set((x) => { x.supplementCohabitant = v; })}
            options={[['inconnu', 'À confirmer (fourchette)'], ['appliquer', 'Oui (confirmé)'], ['ne_pas_appliquer', 'Non (confirmé)']]}
            hint="Le SPF l’écrit pour l’héritier en ligne directe seulement." />
        )}
      </div>

      <h3><T>6. Résultats</T></h3>
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
      {r.net && <NetBlock net={r.net} tr={r.transmission} />}
      {r.transmission && <TransmissionBlock tr={r.transmission} />}

      <details open={ro || undefined}>
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

/** Ce que la bénéficiaire garde au final selon son option : assurance − droits ± solde de la succession. */
function NetBlock({ net, tr }: { net: NetBenefResult; tr: TransmissionResult | null }) {
  const t = useT();
  const who = useWho();
  const recus = tr ? tr.options.filter((op) => op.disponible && op.key !== 'garder' && op.recuPrudent !== null).map((op) => op.recuPrudent!) : [];
  return (
    <section aria-labelledby="h-sfp-net">
      <h3 id="h-sfp-net">{t('Ce que la bénéficiaire garderait au final (net), selon son option')}</h3>
      <p className="small muted">Toutes les options sont calculées, quelle que soit celle retenue. Fourchette = hypothèses fiscales non tranchées ; « hypothèse prudente » = droits les plus élevés.</p>
      <div className="sfp-grid">
        {net.cases.map((c) => (
          <article key={c.key} className="sfp-scenario" aria-label={t(c.titre)}>
            <h4>{t(c.titre)}</h4>
            {!c.disponible ? <p><span aria-hidden="true">—</span> Non calculé : {t(c.raison ?? '')}</p> : (
              <>
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">Montant net pour {who('beneficiaire')} — {t(c.titre)}</caption>
                    <tbody>
                      <tr><th scope="row">Assurance reçue (brut)</th><td><NumView n={c.assurance} showStatus={false} /></td></tr>
                      <tr><th scope="row">− Droits de succession</th><td><NumView n={c.droits} showStatus={false} /></td></tr>
                      <tr><th scope="row">± Biens reçus moins dettes payées{c.partMaison ? <div className="small muted">dont part de maison (nue-propriété) : {formatEUR(c.partMaison)}</div> : null}</th><td><NumView n={c.solde} showStatus={false} /></td></tr>
                    </tbody>
                    <tfoot><tr><th scope="row">= Net au final</th><td><NumView n={c.net} /></td></tr></tfoot>
                  </table>
                </div>
                {c.netPrudent !== null && <p>Hypothèse prudente : <strong>{formatEUR(c.netPrudent)}</strong></p>}
                <ul className="small">{c.notes.map((n, i) => <li key={i}>{t(n)}</li>)}</ul>
              </>
            )}
          </article>
        ))}
      </div>
      <ul className="small">
        {net.epargnePension !== null && net.epargnePension > 0 && (
          <li><span aria-hidden="true">?</span> {t(`Épargne-pension de ${formatEUR(net.epargnePension)} désignée au profit de la bénéficiaire : non comptée (versement refusé par l’assureur pour exclusion du suicide). Si elle était versée, jusqu’à ${formatEUR(net.epargnePension)} de plus, moins l’impôt et les droits (à confirmer).`)}</li>
        )}
        {recus.length > 0 && tr && (
          <li>{t(`Si le fils survivant (frère du fils prédécédé) lui transmet son assurance de ${formatEUR(tr.capital)} : jusqu’à ${formatEUR(Math.max(...recus))} de plus (hypothèse prudente, voir le tableau suivant).`)}</li>
        )}
        {net.notes.map((n, i) => <li key={i}>{t(n)}</li>)}
      </ul>
    </section>
  );
}

/** Capital d'assurance du fils survivant : le garder ou le transmettre à la bénéficiaire. */
function TransmissionBlock({ tr }: { tr: TransmissionResult }) {
  const who = useWho();
  const t = useT();
  const help = useHelp('sfpTransmission', 'Garder ou transmettre l’assurance du fils survivant (frère du fils prédécédé)');
  return (
    <section aria-labelledby="h-sfp-trans">
      <h3 id="h-sfp-trans">{t(`Assurance du fils survivant, frère du fils prédécédé (${formatEUR(tr.capital)}) : la garder ou la transmettre à la bénéficiaire ?`)} {help.button}</h3>
      {help.panel}
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
