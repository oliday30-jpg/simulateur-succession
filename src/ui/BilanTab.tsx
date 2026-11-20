/**
 * T20 — « Point de situation » : document à partager (PDF) avec une personne de confiance (conseiller bancaire,
 * proche…) qui résume ce que la famille sait aujourd'hui : d'abord la situation du père (maison, répartition, épargne,
 * budget), puis la succession du fils prédécédé avec les points encore ouverts.
 * Tout vient des données saisies sur l'appareil ; rien n'est inventé. Les inconnues sont écrites « non renseigné ».
 */
import { useContext, useMemo, useRef, useState } from 'react';
import type { AppState, Existence, HolderId, Value } from '../model/types';
import { TEMPLATES } from '../model/sample';
import { houseValueOf, simulate } from '../engine/simulate';
import { computeSuccFilsPredecede } from '../engine/succFilsPredecede';
import { quartLabel, summarize } from '../domain/rights';
import { detectRepartition, REPARTITION_LABEL, REPARTITION_NOTE } from '../domain/devolution';
import { formatEUR, type Cents } from '../util/money';
import { formatFrac, type Frac } from '../util/fraction';
import { formatDate, localToday } from '../util/dates';
import { shareOrDownload } from '../persistence/io';
import { elementToPdf } from '../print/domToPdf';
import { CheckField, TextField } from './fields';
import { isAvoir, situationNeeds, sfpNeeds } from './essentials';
import { NamesContext, NumView, T, useT, useWho } from './display';

const NR = 'non renseigné';
const CERT: Record<Value['certainty'], string> = { approx: 'approximatif', manuel: 'saisi à la main', verifie: 'vérifié' };
const EXISTE: Record<Existence, string> = { inconnu: 'on ne sait pas encore', non: 'non', possible: 'peut-être (à vérifier)', oui: 'oui' };
const TAXEE = { inconnu: 'à confirmer', oui: 'oui (confirmé)', non: 'non (confirmé)' } as const;

const partOf = (c: Cents | null, f: Frac): Cents | null => (c === null ? null : Math.round((c * f.n) / f.d));
const fiab = (v: Value) => [CERT[v.certainty], v.source.trim()].filter(Boolean).join(' — ');

export function BilanTab({ state }: { state: AppState }) {
  const { names } = useContext(NamesContext);
  // Destinataire et choix des prénoms : propres à ce document, jamais enregistrés ni exportés.
  const [dest, setDest] = useState('');
  const [prenoms, setPrenoms] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const docRef = useRef<HTMLElement>(null);
  // PDF construit dans l'application (comme T18/T19) : aucune attente avant le partage (activation utilisateur iOS).
  const creerPdf = async () => {
    if (!docRef.current) return;
    const bytes = elementToPdf(docRef.current, 'Point de situation indicatif, à valider par le notaire');
    const how = await shareOrDownload(`point-de-situation-${localToday()}.pdf`, bytes, 'application/pdf');
    setMsg(how === 'annule' ? null : how === 'partage' ? 'PDF transmis à la feuille de partage.' : 'PDF téléchargé.');
  };
  return (
    <div className="stack">
      <section className="card no-print" aria-labelledby="h-bilan-pdf">
        <h2 id="h-bilan-pdf">Point de situation à partager</h2>
        <p className="small">Résumé de ce que nous savons aujourd’hui, pour une personne de confiance (conseiller bancaire, proche…) : <T>la situation du père</T>, puis <T>la succession du fils prédécédé</T> et les questions encore ouvertes. Le document se met à jour avec les données des autres onglets ; vérifiez-le avant de l’envoyer.</p>
        <div className="grid">
          <TextField label="Préparé pour (facultatif)" value={dest} onChange={setDest} keepRoles hint="Texte libre, ni enregistré ni exporté : il disparaît en changeant d’onglet ou en rechargeant la page." />
          <CheckField label="Afficher les prénoms dans ce document" checked={prenoms} onChange={setPrenoms} hint="Par défaut, le document garde les rôles (« père », « fils prédécédé »…)." />
        </div>
        <p className="small"><strong>Sur iPhone :</strong> touchez « Créer le PDF », puis choisissez Mail, Messages, WhatsApp ou « Enregistrer dans Fichiers » dans la feuille de partage. Le PDF est fabriqué sur l’appareil : aucun service tiers.</p>
        <div className="row">
          <button type="button" onClick={() => void creerPdf()}>Créer le PDF</button>
          <button type="button" onClick={() => window.print()}>Imprimer (ordinateur)</button>
        </div>
        {msg && <p className="small" role="status">{msg}</p>}
      </section>
      <NamesContext.Provider value={{ names, show: prenoms }}>
        <article ref={docRef} className="card printable apercu" aria-label="Point de situation">
          <BilanContent state={state} dest={dest} />
        </article>
      </NamesContext.Provider>
    </div>
  );
}

function BilanContent({ state, dest }: { state: AppState; dest: string }) {
  const t = useT();
  const who = useWho();
  const s = state.situation;
  const hv = houseValueOf(s);
  const ref = useMemo(() => {
    const own = state.scenarios.find((x) => x.templateId === 'reference' && !x.events.length && !x.legs.length);
    const sc = own ?? TEMPLATES.find((x) => x.id === 'reference')!.build();
    return { res: simulate(s, sc), sc };
  }, [state, s]);
  const avoirs = s.postes.filter((p) => isAvoir(p.kind));
  const autresPostes = s.postes.filter((p) => !isAvoir(p.kind));
  const avoirsConnus = avoirs.filter((p) => p.value.cents !== null);
  const totalAvoirs = avoirsConnus.reduce((a, p) => a + (p.value.cents ?? 0), 0);
  const rembourse = s.creance.remboursements.reduce((a, b) => a + b, 0);
  const solde = s.creance.nominal.cents === null ? null : s.creance.nominal.cents - rembourse;
  const rep = detectRepartition(s.house.lots);
  const holders = summarize(s.house.lots);
  const sfp = computeSuccFilsPredecede(s);
  const o = s.succFilsPredecede;
  const manquePere = situationNeeds(s).filter((n) => !n.filled).map((n) => n.label);
  const b = s.budget;
  for (const [lbl, v] of [['Pension mensuelle', b.pensionMensuelle], ['Dépenses mensuelles', b.depensesMensuelles], ['Réserve minimale à garder', b.reserveMinimale]] as const) {
    if (v.cents === null) manquePere.push(lbl);
  }
  const manqueSfp = sfpNeeds(s).filter((n) => !n.filled).map((n) => n.label);
  const droitsTxt = (h: (typeof holders)[number]) => [
    h.pp.n ? `${formatFrac(h.pp)} en pleine propriété` : '',
    h.np.n ? `${formatFrac(h.np)} en nue-propriété` : '',
    h.us.n ? `usufruit sur ${formatFrac(h.us)}` : '',
  ].filter(Boolean).join(' + ');

  return (
    <>
      <header className="entete-pdf" data-testid="entete-bilan">
        <h2>Point de situation — ce que nous savons aujourd’hui</h2>
        {dest.trim() && <p>Préparé pour : <strong>{dest.trim()}</strong></p>}
        <p>Document établi le {formatDate(localToday())}.</p>
        <p className="small"><strong>Informations rassemblées par la famille, en partie approximatives.</strong> Ce n’est ni un avis juridique, ni une déclaration de succession : les montants et les droits sont indicatifs et doivent être validés par le notaire. « {NR} » signifie que l’information n’est pas encore connue (ce n’est pas zéro).</p>
      </header>

      <section>
        <h2><T>Partie 1 — Situation du père</T></h2>

        <h3>1.1 La maison</h3>
        <p>{s.house.label}, {t('occupée par le père')} depuis {s.house.occupationDepuis}.</p>
        <table className="print-table">
          <thead><tr><th scope="col">Valeur</th><th scope="col">Montant</th><th scope="col">Fiabilité et provenance</th></tr></thead>
          <tbody>
            {([['Hypothèse de travail', s.house.valeurHypothese], ['Ancienne estimation', s.house.valeurAncienne], ['Expertise', s.house.valeurExpertise],
              [`Valeur au ${formatDate(s.house.dateDecesFilsPredecede)} (${t('décès du fils prédécédé')})`, s.house.valeurDecesFilsPredecede]] as const).map(([lbl, v]) => (
              <tr key={lbl}><td>{lbl}</td><td>{v.cents === null ? NR : formatEUR(v.cents)}</td><td>{t(fiab(v))}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="small">Valeur utilisée pour les calculs : <strong>{formatEUR(hv.cents)}</strong> ({hv.provenance}).</p>

        <h3>1.2 Qui possède la maison (succession de la mère, 2005)</h3>
        <p>{t(REPARTITION_LABEL[rep])}.</p>
        <table className="print-table">
          <thead><tr><th scope="col">Titulaire</th><th scope="col">Droits</th><th scope="col">Valeur indicative en pleine propriété</th></tr></thead>
          <tbody>
            {holders.map((h) => (
              <tr key={h.holder}><td>{who(h.holder as HolderId)}</td><td>{droitsTxt(h)}</td><td>{h.pp.n ? formatEUR(partOf(hv.cents, h.pp)) : h.np.n ? `${formatEUR(partOf(hv.cents, h.np))} (part récupérée sans usufruit au décès ${t('du père')})` : '—'}</td></tr>
            ))}
          </tbody>
        </table>
        <ul className="small">
          <li>{t(REPARTITION_NOTE[rep])}</li>
          <li>{t('Pleine propriété : tous les droits. Nue-propriété : propriétaire sans pouvoir habiter ni louer ; l’usage complet revient au décès de l’usufruitier. Usufruit : droit d’habiter ou de louer, sans pouvoir vendre seul ; il s’éteint au décès du père.')}</li>
          <li>{t(`La part du fils prédécédé (nue-propriété) fait partie de sa succession, encore ouverte : son titulaire final n’est pas connu. Option retenue dans les calculs : ${quartLabel(s.house.quartResolution)}.`)}</li>
        </ul>

        <h3>1.3 <T>Épargne et avoirs du père</T></h3>
        {avoirs.length === 0 ? <p>{NR}.</p> : (
          <table className="print-table">
            <thead><tr><th scope="col">Poste</th><th scope="col">Montant</th><th scope="col">Fiabilité et provenance</th></tr></thead>
            <tbody>
              {avoirs.map((p) => <tr key={p.id}><td>{t(p.label)}{p.value.note ? ` (${t(p.value.note)})` : ''}</td><td>{p.value.cents === null ? NR : formatEUR(p.value.cents)}</td><td>{t(fiab(p.value))}</td></tr>)}
            </tbody>
          </table>
        )}
        {avoirs.length > 0 && <p>Total {avoirsConnus.length < avoirs.length ? <>des montants connus (<strong>incomplet</strong>) : </> : ': '}<strong>{formatEUR(totalAvoirs)}</strong>.</p>}
        {autresPostes.length > 0 && (
          <ul className="small">{autresPostes.map((p) => <li key={p.id}>{t(p.label)} : {p.value.cents === null ? NR : formatEUR(p.value.cents)}{p.value.source.trim() ? ` (${t(p.value.source.trim())})` : ''}.</li>)}</ul>
        )}
        <p><strong>{t('Prêt du père au fils prédécédé')}</strong> : {formatEUR(s.creance.nominal.cents)}{s.creance.remboursements.length > 0 && <>, {s.creance.remboursements.length} remboursement(s) pour {formatEUR(rembourse)}, solde indicatif {formatEUR(solde)}</>}. {t(s.creance.inclusion === 'exclue'
          ? 'Ce montant est à réclamer à la succession du fils prédécédé ; il n’est pas compté dans les avoirs tant qu’on ne sait pas s’il sera remboursé.'
          : 'Ce montant est compté dans les avoirs du père (hypothèse).')}</p>

        <h3>1.4 <T>Budget du père</T></h3>
        <ul>
          <li>Pension mensuelle : {b.pensionMensuelle.cents === null ? NR : formatEUR(b.pensionMensuelle.cents)}</li>
          <li>Dépenses mensuelles : {b.depensesMensuelles.cents === null ? NR : formatEUR(b.depensesMensuelles.cents)}</li>
          <li>Soins / hébergement (mensuel) : {b.soinsMensuels.cents === null ? NR : formatEUR(b.soinsMensuels.cents)}</li>
          <li>Réserve minimale à garder : {b.reserveMinimale.cents === null ? NR : formatEUR(b.reserveMinimale.cents)}</li>
        </ul>

        <h3>1.5 {t('Ordre de grandeur des droits de succession du père si rien ne change')}</h3>
        <p className="small">{t(`Simulation indicative (décès simulé le ${ref.sc.deathDate ? formatDate(ref.sc.deathDate) : NR}, règles wallonnes actuelles ; au-delà de 2027 les règles ne sont pas encore connues).`)}</p>
        <ul>
          {ref.res.death.rows.map((r) => <li key={r.id}>{who(r.id)} : <NumView n={r.droits} /></li>)}
          <li>Total : <NumView n={ref.res.death.total} /></li>
        </ul>
        {!ref.res.death.simulated && ref.res.death.reason && <p className="small">{t(ref.res.death.reason)}</p>}

        <h3>1.6 <T>Questions ouvertes pour le père</T></h3>
        <ul>
          <li>☐ Déclaration de succession de la mère <strong>enregistrée</strong> (définitive) et preuve que la réduction de la donation de survie a été demandée : nous n’avons qu’un projet et l’acte de notoriété (conditionnel). Le cadastre reprend déjà la répartition ci-dessus.</li>
          <li>☐ {t('Comptes et titres de la mère : le père en a-t-il gardé l’usage (quasi-usufruit) ? Dans ce cas, chaque fils aurait une créance de restitution (environ 1/3) à son décès — montant de référence à établir.')}</li>
          <li>☐ Autres biens reçus de la mère (quote-part d’une autre maison, terre agricole) : encore détenus, vendus ? Inscription au cadastre à vérifier (enjeu minime).</li>
          <li>☐ Valeur réelle de la maison (expertise) ; {t('existence d’un testament du père')}.</li>
          {manquePere.length > 0 && <li>☐ Informations à compléter : {manquePere.map(t).join(' ; ')}.</li>}
        </ul>
      </section>

      <section>
        <h2><T>Partie 2 — Succession du fils prédécédé</T></h2>

        <h3>2.1 Ce que nous savons</h3>
        <ul>
          <li>{t(`Décès du fils prédécédé le ${formatDate(sfp.dateDeces)}. Il vivait en cohabitation légale ; sa cohabitante légale est la bénéficiaire potentielle de sa part.`)}</li>
          <li>Testament : {{ inconnu: 'on ne sait pas encore s’il existe', legs_beneficiaire: t('oui, en faveur de la bénéficiaire'), aucun: 'pas de testament' }[o.testament]}.</li>
          <li>Enfants : {{ inconnu: NR, aucun: 'aucun', oui: 'un ou plusieurs' }[o.descendants]}.{o.descendants !== 'oui' && <> {t('Sans enfant, les héritiers légaux sont en principe le père (1/4) et le fils survivant (3/4) ; la cohabitante légale n’hérite de cette part que par testament (à confirmer).')}</>}</li>
          <li>{t('Le couple habitait-il la maison du père ?')} {{ inconnu: NR, non: 'non (le couple avait son propre logement)', oui: 'oui' }[o.residenceCommune]}.</li>
        </ul>

        <h3>2.2 Biens et dettes connus</h3>
        <ul>
          <li>{t(`Part du fils prédécédé dans la maison du père : ${formatFrac(sfp.quotePart)} en nue-propriété`)}, soit {formatEUR(sfp.partPP)} en pleine propriété ({t(`sur une valeur de ${formatEUR(sfp.valeurMaison.cents)}`)}, {sfp.valeurMaison.provenance}). {t('L’usufruit du père continue sur cette part.')}</li>
          <li>Autres biens nets (logement du couple pour sa moitié, comptes, véhicule… moins les dettes) : {o.autresBiensNets.cents === null ? NR : formatEUR(o.autresBiensNets.cents)}{o.autresBiensNets.cents !== null && ` (${t(fiab(o.autresBiensNets))})`}.</li>
          <li>{t('Dette envers le père (prêt)')} : solde indicatif {formatEUR(solde)}.</li>
        </ul>

        <h3>2.3 Assurances (versées hors succession)</h3>
        <ul>
          <li>{t('Assurance groupe / vie au profit de la bénéficiaire')} : {EXISTE[o.assuranceExiste]}{(o.assuranceExiste === 'oui' || o.assuranceExiste === 'possible') && <> — montant {o.assurance.cents === null ? NR : formatEUR(o.assurance.cents)} ; soumise aux droits de succession : {TAXEE[o.assuranceTaxee]}</>}.</li>
          <li>{t('Assurance groupe / vie au profit du fils survivant (frère du fils prédécédé)')} : {EXISTE[o.assuranceFilsExiste]}{(o.assuranceFilsExiste === 'oui' || o.assuranceFilsExiste === 'possible') && <> — montant {o.assuranceFils.cents === null ? NR : formatEUR(o.assuranceFils.cents)} ; soumise aux droits : {TAXEE[o.assuranceFilsTaxee]} ; {t('s’il y renonce, le capital va à')} : {{ inconnu: 'clause à lire', beneficiaire: t('la bénéficiaire'), succession: 'la succession', autre: 'une autre personne' }[o.assuranceFilsSuivant]}</>}.</li>
          <li>Un autre contrat (capital pension) serait refusé par l’assureur (exclusion du suicide) : réponse écrite à obtenir.</li>
        </ul>

        <h3>2.4 Option de la cohabitante légale et droits estimés</h3>
        <p>{t(`Option retenue dans les calculs : ${quartLabel(s.house.quartResolution)}.`)}</p>
        <table className="print-table">
          <thead><tr><th scope="col">Si…</th><th scope="col">Droits de succession estimés</th><th scope="col">Hypothèse prudente</th></tr></thead>
          <tbody>
            {sfp.scenarios.map((sc) => (
              <tr key={sc.key}><td>{t(sc.titre)}</td><td>{sc.disponible ? <NumView n={sc.total} /> : `non calculé : ${t(sc.raison ?? '')}`}</td><td>{sc.disponible ? formatEUR(sc.totalPrudent) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
        {sfp.avertissements.length > 0 && <ul className="small">{sfp.avertissements.map((a, i) => <li key={i}>? À confirmer : {t(a)}</li>)}</ul>}

        <h3>2.5 Points d’interrogation</h3>
        <ul>
          <li>☐ {t('Testament : le Registre central des testaments a-t-il été interrogé ? Contenu exact (legs à la bénéficiaire ? au petit-fils ?).')}</li>
          <li>☐ {t('Décision de la cohabitante légale : accepter, accepter sous bénéfice d’inventaire ou renoncer — et délais. Si elle renonce, le père et le fils survivant deviennent héritiers et doivent à leur tour choisir.')}</li>
          <li>☐ Liste exacte des dettes : lesquelles ont été signées par le défunt seul, lesquelles à deux (la codébitrice reste tenue même si elle renonce) ? Les dettes dépassent-elles les biens ?</li>
          <li>☐ Crédit du logement du couple : une assurance solde restant dû existe-t-elle et paie-t-elle ? Sinon, vente du logement ou rachat de la moitié du défunt ?</li>
          <li>☐ Assurances : copie exacte des clauses bénéficiaires (et du bénéficiaire « à défaut »), décompte des retenues, montant brut ou net pour les droits. Ne pas toucher un capital avant d’avoir vu le testament et la clause.</li>
          <li>☐ {t('Part de la maison du père : rachat possible par le père ou le fils survivant si elle devait être vendue ; base taxable de cette nue-propriété.')}</li>
          <li>☐ {t('Prêt du père : sera-t-il remboursé par la succession du fils prédécédé ?')} Délai de dépôt de la déclaration de succession (4 mois ?).</li>
          {manqueSfp.length > 0 && <li>☐ Informations à compléter : {manqueSfp.map(t).join(' ; ')}.</li>}
        </ul>

        <h3>2.6 Ce qu’un regard bancaire pourrait nous aider à clarifier</h3>
        <ul>
          <li>☐ Comment obtenir la liste complète des comptes, crédits, cartes et coffres du défunt (banques connues et inconnues) ?</li>
          <li>☐ Comptes bloqués : qu’est-ce qui peut être libéré avant l’attestation ou l’acte d’hérédité (frais funéraires, montant pour la cohabitante légale) sans que cela vaille acceptation de la succession ?</li>
          <li>☐ Assurance solde restant dû et assurances groupe : démarches auprès de la banque et de l’assureur, documents à demander.</li>
          <li>☐ {t('Pour le père : placement de l’épargne en gardant une réserve disponible ; procuration ou mandat de protection extrajudiciaire en cas de besoin.')}</li>
        </ul>
      </section>

      <p className="small muted">Document généré par un simulateur familial local (aucune donnée envoyée en ligne). Il sert à préparer les échanges et ne remplace ni le notaire, ni un conseil juridique, fiscal ou bancaire.</p>
    </>
  );
}

