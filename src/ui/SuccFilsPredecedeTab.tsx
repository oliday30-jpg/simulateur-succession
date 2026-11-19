import type { Situation } from '../model/types';
import { HOLDER_LABEL, quartLabel, resolveLots, summarize } from '../domain/rights';
import type { HolderId } from '../model/types';
import { useContext, useRef, useState } from 'react';
import { shareOrDownload } from '../persistence/io';
import { elementToPdf } from '../print/domToPdf';
import { CheckField, NeedLegend, SelectField, TextField, ValueField } from './fields';
import { countMissing, sfpNeeds } from './essentials';
import { NamesContext, ReadOnlyContext, T, useReadOnly, useT, useWho } from './display';
import { formatFrac } from '../util/fraction';
import { formatEUR } from '../util/money';
import { formatDate, localToday } from '../util/dates';
import { computeSuccFilsPredecede } from '../engine/succFilsPredecede';
import { SuccFilsPredecedeCard } from './SuccFilsPredecedeCard';

type Upd = (fn: (s: Situation) => void) => void;
const HOLDERS: [HolderId, string][] = (Object.keys(HOLDER_LABEL) as HolderId[]).map((h) => [h, HOLDER_LABEL[h]]);

/**
 * Onglet séparé pour la succession du fils prédécédé (dossier ouvert, distinct de la situation du père) :
 * option de la bénéficiaire, valeur de la maison au décès, puis hypothèses, assurances, dettes et droits.
 */
export function SuccFilsPredecedeTab({ s, update }: { s: Situation; update: Upd }) {
  const { names } = useContext(NamesContext);
  const [apercu, setApercu] = useState(false);
  // Destinataire et choix des prénoms : propres à cette impression, jamais enregistrés ni exportés.
  const [dest, setDest] = useState('');
  const [prenoms, setPrenoms] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const docRef = useRef<HTMLElement>(null);
  // PDF construit dans l'application : depuis l'icône de l'écran d'accueil, iOS n'ouvre pas la fenêtre d'impression.
  // Aucune attente avant le partage (l'activation utilisateur doit être conservée sur iOS).
  const creerPdf = async () => {
    if (!docRef.current) return;
    const bytes = elementToPdf(docRef.current, 'Estimation indicative, à valider par le notaire');
    const how = await shareOrDownload(`succession-fils-predecede-${localToday()}.pdf`, bytes, 'application/pdf');
    setMsg(how === 'annule' ? null : how === 'partage' ? 'PDF transmis à la feuille de partage.' : 'PDF téléchargé.');
  };
  if (!apercu) {
    return (
      <div className="stack">
        <section className="card no-print" aria-labelledby="h-sfp-pdf">
          <h2 id="h-sfp-pdf">PDF de cet onglet pour le destinataire</h2>
          <p className="small">Pour envoyer <strong>uniquement</strong> cet onglet (par exemple <T>à la bénéficiaire</T>), sans la sauvegarde JSON ni les autres onglets.</p>
          <button type="button" onClick={() => setApercu(true)}>Préparer le PDF de cet onglet</button>
        </section>
        <SfpContent s={s} update={update} />
      </div>
    );
  }
  return (
    <div className="stack">
      <section className="card no-print apercu-barre" aria-labelledby="h-sfp-apercu">
        <h2 id="h-sfp-apercu">Aperçu du PDF pour le destinataire</h2>
        <div className="grid">
          <TextField label="Préparé pour (facultatif)" value={dest} onChange={setDest} keepRoles hint="Texte libre, ni enregistré ni exporté : il disparaît en quittant l’aperçu ou en rechargeant la page." />
          <CheckField label="Afficher les prénoms dans ce PDF" checked={prenoms} onChange={setPrenoms} hint="Par défaut, le PDF garde les rôles (« père », « fils prédécédé »…). Réglage propre à ce PDF, indépendant de la fiche notaire." />
        </div>
        <DonneesReprises s={s} />
        <p className="small"><strong>Sur iPhone :</strong> touchez « Créer le PDF », puis choisissez « Enregistrer dans Fichiers », Mail ou Messages dans la feuille de partage. Le PDF reprend le texte de l’aperçu ci-dessous, en mise en page simple. Sur ordinateur, « Imprimer » garde la mise en page de l’écran.</p>
        <div className="row">
          <button type="button" onClick={() => void creerPdf()}>Créer le PDF</button>
          <button type="button" onClick={() => window.print()}>Imprimer (ordinateur)</button>
          <button type="button" onClick={() => { setApercu(false); setMsg(null); }}>Revenir à la saisie</button>
        </div>
        {msg && <p className="small" role="status">{msg}</p>}
      </section>
      <NamesContext.Provider value={{ names, show: prenoms }}>
        <ReadOnlyContext.Provider value={true}>
          <article ref={docRef} className="apercu" aria-label="Aperçu du document">
            <EnteteImpression dest={dest} />
            <SfpContent s={s} update={update} />
          </article>
        </ReadOnlyContext.Provider>
      </NamesContext.Provider>
    </div>
  );
}

/** En-tête du PDF : titre, destinataire, date du jour, mention indicative. */
function EnteteImpression({ dest }: { dest: string }) {
  return (
    <header className="card entete-pdf" data-testid="entete-pdf">
      <h2><T>Succession du fils prédécédé</T></h2>
      {dest.trim() && <p>Préparé pour : <strong>{dest.trim()}</strong></p>}
      <p>Document établi le {formatDate(localToday())}.</p>
      <p className="small"><strong>Estimation indicative, à valider par le notaire.</strong> Ce n’est ni un avis juridique, ni un devis, ni une déclaration de succession.</p>
    </header>
  );
}

/** Données issues de la situation du père qui figurent dans le PDF : l'utilisateur vérifie ce qu'il montre. */
function DonneesReprises({ s }: { s: Situation }) {
  const t = useT();
  const who = useWho();
  const r = computeSuccFilsPredecede(s);
  const repartition = summarize(resolveLots(s.house.lots, s.house))
    .map((h) => `${who(h.holder)} — ${[h.pp.n ? `PP ${formatFrac(h.pp)}` : '', h.np.n ? `NP ${formatFrac(h.np)}` : '', h.us.n ? `US ${formatFrac(h.us)}` : ''].filter(Boolean).join(', ')}`).join(' ; ');
  return (
    <div className="donnees-reprises">
      <h3>À vérifier : données de la situation <T>du père</T> reprises dans ce PDF</h3>
      <ul className="small">
        <li>{t('Part du fils prédécédé dans la maison')} : {formatFrac(r.quotePart)} en nue-propriété.</li>
        <li>{t('Valeur de la maison du père au décès du fils prédécédé')} ({formatDate(r.dateDeces)}) : {formatEUR(r.valeurMaison.cents)} ({r.valeurMaison.provenance}).</li>
        <li>{t('Option retenue pour la part du fils prédécédé')} : {t(quartLabel(s.house.quartResolution))}.</li>
        {s.house.quartResolution !== 'inconnu' && <li>Répartition de la maison après cette option : {repartition}.</li>}
      </ul>
      <p className="small muted">Les autres données <T>du père</T> (avoirs, budget, scénarios) ne figurent pas dans ce PDF. Les cases vides y apparaissent comme « non renseigné ».</p>
    </div>
  );
}

function SfpContent({ s, update }: { s: Situation; update: Upd }) {
  const who = useWho();
  const ro = useReadOnly();
  return (
    <>
      {!ro && <NeedLegend missing={countMissing(sfpNeeds(s))} intro="Cases indispensables pour une estimation fiable de cette succession" />}
      <section className="card" aria-labelledby="h-sfp-option">
        <h2 id="h-sfp-option"><T>1. Part du fils prédécédé dans la maison du père</T></h2>
        <p className="muted"><T>Ce dossier est distinct de la situation du père. L’option retenue ici modifie seulement qui détient la part du fils prédécédé (nue-propriété) dans les calculs des autres onglets.</T></p>
        <div className="grid">
          <SelectField label="Part du fils prédécédé (nue-propriété)" help="quartResolution" value={s.house.quartResolution} onChange={(v) => update((d) => { d.house.quartResolution = v; })}
            options={(['inconnu', 'beneficiaire_conserve', 'renonciation', 'personnalise'] as const).map((r) => [r, quartLabel(r)])}
            hint="Les droits des deux options sont estimés ci-dessous." />
          {s.house.quartResolution === 'personnalise' && (
            <>
              <SelectField label="Titulaire validé par le notaire" value={s.house.quartPersonnalise.holder} onChange={(v) => update((d) => { d.house.quartPersonnalise.holder = v; })} options={HOLDERS} />
              <TextField label="Fondement (cession, renonciation…)" value={s.house.quartPersonnalise.note} onChange={(v) => update((d) => { d.house.quartPersonnalise.note = v; })} />
            </>
          )}
          <ValueField label="Valeur de la maison du père au 07/10/2026 (décès du fils prédécédé)" help="valeurDecesFilsPredecede" essential value={s.house.valeurDecesFilsPredecede} onChange={(v) => update((d) => { d.house.valeurDecesFilsPredecede = v; })} hint="Champ distinct — dossier de succession ouvert" />
        </div>
        {s.house.quartResolution !== 'inconnu' && (
          <p className="small">Après l’option retenue : {summarize(resolveLots(s.house.lots, s.house)).map((h) => `${who(h.holder)} — ${[h.pp.n ? `PP ${formatFrac(h.pp)}` : '', h.np.n ? `NP ${formatFrac(h.np)}` : '', h.us.n ? `US ${formatFrac(h.us)}` : ''].filter(Boolean).join(', ')}`).join(' ; ')}</p>
        )}
      </section>

      <SuccFilsPredecedeCard s={s} update={update} />
    </>
  );
}
