import type { Situation, Poste, PosteKind, HolderId, Lot, PersonId } from '../model/types';
import { CheckField, DateField, FracField, MoneyField, SelectField, TextField, ValueField } from './fields';
import { HOLDER_LABEL, quartLabel, summarize, validateLots } from '../domain/rights';
import { houseValueOf, PERSON_LABEL } from '../engine/simulate';
import { formatFrac } from '../util/fraction';
import { formatEUR } from '../util/money';
import { newId } from '../model/sample';
import { useWho } from './display';

type Upd = (fn: (s: Situation) => void) => void;

const KIND_LABEL: Record<PosteKind, string> = {
  compte: 'Compte', titres: 'Titres / fonds', autre_avoir: 'Autre avoir', dette: 'Dette', frais_funeraires: 'Frais funéraires', autres_frais: 'Autres frais réels', prelevement: 'Prélèvement',
};
const HOLDERS: [HolderId, string][] = (Object.keys(HOLDER_LABEL) as HolderId[]).map((h) => [h, HOLDER_LABEL[h]]);

export function SituationTab({ s, update, names, setName }: { s: Situation; update: Upd; names: Record<string, string>; setName: (id: string, n: string) => void }) {
  const who = useWho();
  const hv = houseValueOf(s);
  const lotIssues = validateLots(s.house.lots);
  const soldeCreance = s.creance.nominal.cents === null ? null : s.creance.nominal.cents - s.creance.remboursements.reduce((a, b) => a + b, 0);
  return (
    <div className="stack">
      <section className="card" aria-labelledby="h-pers">
        <h2 id="h-pers">Personnes (rôles anonymes)</h2>
        <p className="muted">Les noms éventuels restent dans ce navigateur : ils ne sont ni exportés ni imprimés par défaut.</p>
        <div className="grid">
          {s.persons.map((p) => (
            <div key={p.id} className="person">
              <TextField label={`Nom affiché — ${p.role}`} value={names[p.id] ?? ''} onChange={(v) => setName(p.id, v)} hint={p.lien} />
              {p.id !== 'pere' && p.id !== 'filsPredecede' && (
                <SelectField label="Héritier légal du père ?" value={p.heritierLegal} onChange={(v) => update((d) => { d.persons.find((x) => x.id === p.id)!.heritierLegal = v; })}
                  options={[['presume', 'Présumé (à vérifier : testament, situation au décès)'], ['a_confirmer', 'À confirmer'], ['non', 'Non']]} />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="h-maison">
        <h2 id="h-maison">{s.house.label}</h2>
        <p>Occupée par le père depuis {s.house.occupationDepuis}. Valeur utilisée par défaut : <strong>{formatEUR(hv.cents)}</strong> — <em>{hv.provenance}</em>.</p>
        <div className="grid">
          <ValueField label="Ancienne estimation" value={s.house.valeurAncienne} onChange={(v) => update((d) => { d.house.valeurAncienne = v; })} />
          <ValueField label="Hypothèse de travail" value={s.house.valeurHypothese} onChange={(v) => update((d) => { d.house.valeurHypothese = v; })} />
          <ValueField label="Valeur d’expertise actuelle" value={s.house.valeurExpertise} onChange={(v) => update((d) => { d.house.valeurExpertise = v; })} />
          <ValueField label="Valeur au 07/10/2026 (décès du fils prédécédé)" value={s.house.valeurDecesFilsPredecede} onChange={(v) => update((d) => { d.house.valeurDecesFilsPredecede = v; })} hint="Champ distinct — dossier de succession ouvert" />
        </div>
        <SelectField label="Valeur à utiliser par défaut (donation, vente, décès)" value={s.house.sourceValeurCourante} onChange={(v) => update((d) => { d.house.sourceValeurCourante = v; })}
          options={[['hypothese', 'Hypothèse de travail'], ['expertise', 'Valeur d’expertise'], ['ancienne', 'Ancienne estimation']]}
          hint="Chaque événement peut aussi recevoir sa propre valeur à sa date." />

        <h3>Lots de propriété</h3>
        <p className="muted">Chaque lot a un plein propriétaire, ou un couple nu-propriétaire / usufruitier. L’usufruit et la nue-propriété portent sur la même quote-part : ils ne s’additionnent pas en 200 %.</p>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Lots de la maison</caption>
            <thead><tr><th scope="col">Lot</th><th scope="col">Quote-part</th><th scope="col">Pleine propriété</th><th scope="col">Nue-propriété</th><th scope="col">Usufruit</th><th scope="col">Origine</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {s.house.lots.map((l, i) => <LotRow key={l.id} l={l} onChange={(nl) => update((d) => { d.house.lots[i] = nl; })} onRemove={() => update((d) => { d.house.lots.splice(i, 1); })} />)}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => update((d) => { d.house.lots.push({ id: `L${d.house.lots.length + 1}`, share: { n: 0, d: 1 }, pp: 'pere', origine: 'Ajout manuel' }); })}>Ajouter un lot</button>
        {lotIssues.length ? <ul className="issues">{lotIssues.map((x, k) => <li key={k} className="issue lv-bloquant"><span className="lv">⛔ Bloquant :</span> {x.message}</li>)}</ul> : <p className="ok">✓ Lots cohérents : total 100 %, sans chevauchement.</p>}
        <p className="muted">Résumé : {summarize(s.house.lots).map((h) => `${HOLDER_LABEL[h.holder]} — ${[h.pp.n ? `PP ${formatFrac(h.pp)}` : '', h.np.n ? `NP ${formatFrac(h.np)}` : '', h.us.n ? `US ${formatFrac(h.us)}` : ''].filter(Boolean).join(', ')}`).join(' ; ')}</p>

        <div className="grid">
          <SelectField label="Quart du fils prédécédé" value={s.house.quartResolution} onChange={(v) => update((d) => { d.house.quartResolution = v; })}
            options={[['inconnu', quartLabel('inconnu')], ['beneficiaire_conserve', quartLabel('beneficiaire_conserve')], ['personnalise', quartLabel('personnalise')]]}
            hint="La dévolution de cette succession n’est pas calculée par l’outil." />
          {s.house.quartResolution === 'personnalise' && (
            <>
              <SelectField label="Titulaire validé par le notaire" value={s.house.quartPersonnalise.holder} onChange={(v) => update((d) => { d.house.quartPersonnalise.holder = v; })} options={HOLDERS} />
              <TextField label="Fondement (cession, renonciation…)" value={s.house.quartPersonnalise.note} onChange={(v) => update((d) => { d.house.quartPersonnalise.note = v; })} />
            </>
          )}
          <SelectField label="Taux réduit « logement familial »" value={s.house.logementEligibilite} onChange={(v) => update((d) => { d.house.logementEligibilite = v; })}
            options={[['hypothese_eligible', 'Hypothèse : éligible (à confirmer)'], ['eligible_confirme', 'Éligibilité confirmée par le notaire'], ['non_eligible', 'Non éligible'], ['inconnu', 'Inconnu (afficher une fourchette)']]}
            hint="L’ancienneté d’occupation ne suffit pas à garantir le taux réduit." />
          <SelectField label="Situation du logement" value={s.house.logementSituation} onChange={(v) => update((d) => { d.house.logementSituation = v; })}
            options={[['conserve', 'Conservé et occupé'], ['demenagement_volontaire', 'Déménagement volontaire'], ['depart_justifie', 'Départ justifié (soins, hébergement)'], ['inconnu', 'Inconnu']]} />
        </div>
      </section>

      <section className="card" aria-labelledby="h-fin">
        <h2 id="h-fin">Avoirs, dettes et frais du père</h2>
        <SelectField label="Mode de bilan financier" value={s.bilanMode} onChange={(v) => update((d) => { d.bilanMode = v; })}
          options={[['A', 'A — Solde de départ auquel on applique les flux'], ['B', 'B — Solde au décès déjà net des flux']]}
          hint="Les deux modes sont incompatibles : en mode B, les donations ne sont pas retirées une seconde fois." />
        {s.bilanMode === 'B' && <ValueField label="Solde financier au décès (déjà net des donations et flux)" value={s.soldeAuDecesB} onChange={(v) => update((d) => { d.soldeAuDecesB = v; })} />}
        <div className="postes">
          {s.postes.map((p, i) => <PosteEditor key={p.id} p={p} onChange={(np) => update((d) => { d.postes[i] = np; })} onRemove={() => update((d) => { d.postes.splice(i, 1); })} />)}
        </div>
        <div className="row">
          {(Object.keys(KIND_LABEL) as PosteKind[]).map((k) => (
            <button key={k} type="button" onClick={() => update((d) => { d.postes.push({ id: newId('P'), label: KIND_LABEL[k], kind: k, value: { cents: null, certainty: 'approx', source: '' }, liquide: ['compte', 'titres'].includes(k), deductible: ['dette'].includes(k) ? 'oui' : ['frais_funeraires'].includes(k) ? 'a_confirmer' : 'non', payePar: ['dette', 'frais_funeraires', 'autres_frais'].includes(k) ? 'succession' : 'pere' }); })}>+ {KIND_LABEL[k]}</button>
          ))}
        </div>
      </section>

      <section className="card" aria-labelledby="h-cre">
        <h2 id="h-cre">Créance contre la succession du fils prédécédé</h2>
        <div className="grid">
          <ValueField label="Prêt (nominal)" value={s.creance.nominal} onChange={(v) => update((d) => { d.creance.nominal = v; })} />
          <div>
            <p>Remboursements annoncés : {s.creance.remboursements.map((r) => formatEUR(r)).join(' + ') || 'aucun'}</p>
            <p>Solde nominal indicatif : <strong>{formatEUR(soldeCreance)}</strong> (à vérifier)</p>
            <button type="button" onClick={() => update((d) => { d.creance.remboursements.push(25000); })}>+ remboursement de 250 €</button>{' '}
            <button type="button" onClick={() => update((d) => { d.creance.remboursements.pop(); })} disabled={!s.creance.remboursements.length}>− retirer le dernier</button>
          </div>
          <ValueField label="Montant finalement recouvré" value={s.creance.recouvre} onChange={(v) => update((d) => { d.creance.recouvre = v; })} />
          <SelectField label="Prise en compte" value={s.creance.inclusion} onChange={(v) => update((d) => { d.creance.inclusion = v; })}
            options={[['exclue', 'Exclue (par défaut)'], ['solde_nominal', 'Solde nominal comme actif (non liquide)'], ['montant_recouvre', 'Montant recouvré en liquidités']]} />
          <CheckField label="Le montant recouvré est déjà crédité sur les comptes" checked={s.creance.dejaEncaisse} onChange={(v) => update((d) => { d.creance.dejaEncaisse = v; })} hint="Évite de compter à la fois la créance et le cash encaissé." />
          <SelectField label="Traitement fiscal" value={s.creance.traitementFiscal} onChange={(v) => update((d) => { d.creance.traitementFiscal = v; })}
            options={[['a_confirmer', 'À confirmer'], ['actif_valide', 'Actif validé'], ['exclu', 'Exclu (validé)']]} />
          <DateField label="Date de recouvrement" value={s.creance.dateRecouvrement} onChange={(v) => update((d) => { d.creance.dateRecouvrement = v; })} />
        </div>
      </section>

      <section className="card" aria-labelledby="h-bud">
        <h2 id="h-bud">Budget du père (facultatif)</h2>
        <p className="muted">Sert à mesurer la réserve préservée. Aucun rendement n’est supposé.</p>
        <div className="grid">
          <MoneyField label="Pension nette mensuelle" value={s.budget.pensionMensuelle.cents} onChange={(c) => update((d) => { d.budget.pensionMensuelle.cents = c; })} />
          <MoneyField label="Dépenses mensuelles" value={s.budget.depensesMensuelles.cents} onChange={(c) => update((d) => { d.budget.depensesMensuelles.cents = c; })} />
          <MoneyField label="Soins / hébergement mensuels" value={s.budget.soinsMensuels.cents} onChange={(c) => update((d) => { d.budget.soinsMensuels.cents = c; })} />
          <MoneyField label="Réserve minimale à préserver" value={s.budget.reserveMinimale.cents} onChange={(c) => update((d) => { d.budget.reserveMinimale.cents = c; })} />
          <MoneyField label="Travaux" value={s.budget.travaux.cents} onChange={(c) => update((d) => { d.budget.travaux.cents = c; })} />
          <MoneyField label="Relogement : prix (ou coût mensuel si durée)" value={s.budget.prixRelogement.cents} onChange={(c) => update((d) => { d.budget.prixRelogement.cents = c; })} />
          <TextField label="Durée du relogement (mois)" value={s.budget.dureeMois === null ? '' : String(s.budget.dureeMois)} onChange={(v) => update((d) => { const n = parseInt(v, 10); d.budget.dureeMois = Number.isFinite(n) && n >= 0 ? n : null; })} />
        </div>
      </section>

      <section className="card" aria-labelledby="h-hors">
        <h2 id="h-hors">Cas hors périmètre</h2>
        <p className="muted">Périmètre : Wallonie, ligne directe, situation domestique simple. Cochez ce qui s’applique : une validation sera exigée.</p>
        <CheckField label="Le père a changé de région fiscale (5 dernières années)" checked={s.horsPerimetre.changementRegion} onChange={(v) => update((d) => { d.horsPerimetre.changementRegion = v; })} />
        <CheckField label="Indivision litigieuse" checked={s.horsPerimetre.indivisionLitigieuse} onChange={(v) => update((d) => { d.horsPerimetre.indivisionLitigieuse = v; })} />
        <CheckField label="Donation avec charges particulières" checked={s.horsPerimetre.chargesParticulieres} onChange={(v) => update((d) => { d.horsPerimetre.chargesParticulieres = v; })} />
        <CheckField label="Décès possible du donataire avant le donateur" checked={s.horsPerimetre.decesDonataireAvantDonateur} onChange={(v) => update((d) => { d.horsPerimetre.decesDonataireAvantDonateur = v; })} />
        <CheckField label="Fiscalité de la vente à un tiers (plus-value)" checked={s.horsPerimetre.plusValueCession} onChange={(v) => update((d) => { d.horsPerimetre.plusValueCession = v; })} />
      </section>
      <p className="muted">Personne de référence pour les dépenses : {who('pere')}.</p>
    </div>
  );
}

function LotRow({ l, onChange, onRemove }: { l: Lot; onChange: (l: Lot) => void; onRemove: () => void }) {
  const dem = !l.pp;
  const opts: [string, string][] = [['', '—'], ...HOLDERS];
  return (
    <tr>
      <th scope="row">{l.id}</th>
      <td><FracField label={`Quote-part ${l.id}`} value={l.share} onChange={(f) => f && onChange({ ...l, share: f })} /></td>
      <td><SelectField label={`PP ${l.id}`} value={l.pp ?? ''} onChange={(v) => onChange(v ? { ...l, pp: v as HolderId, np: undefined, us: undefined } : { ...l, pp: undefined, np: l.np ?? 'fils', us: l.us ?? 'pere' })} options={opts} /></td>
      <td>{dem ? <SelectField label={`NP ${l.id}`} value={l.np ?? ''} onChange={(v) => onChange({ ...l, np: (v || undefined) as HolderId | undefined })} options={opts} /> : '—'}</td>
      <td>{dem ? <SelectField label={`US ${l.id}`} value={l.us ?? ''} onChange={(v) => onChange({ ...l, us: (v || undefined) as HolderId | undefined })} options={opts} /> : '—'}</td>
      <td className="small">{l.origine}</td>
      <td><button type="button" className="link danger" onClick={onRemove} aria-label={`Supprimer le lot ${l.id}`}>Supprimer</button></td>
    </tr>
  );
}

function PosteEditor({ p, onChange, onRemove }: { p: Poste; onChange: (p: Poste) => void; onRemove: () => void }) {
  const isAsset = ['compte', 'titres', 'autre_avoir'].includes(p.kind);
  const isCharge = ['dette', 'frais_funeraires', 'autres_frais'].includes(p.kind);
  return (
    <fieldset className="poste">
      <legend>{KIND_LABEL[p.kind]} — {p.label}</legend>
      <div className="grid">
        <TextField label="Libellé" value={p.label} onChange={(v) => onChange({ ...p, label: v })} />
        <MoneyField label="Montant" value={p.value.cents} onChange={(c) => onChange({ ...p, value: { ...p.value, cents: c } })} hint={p.value.note} />
        <SelectField label="Fiabilité" value={p.value.certainty} onChange={(c) => onChange({ ...p, value: { ...p.value, certainty: c } })} options={[['approx', '≈ Approximatif'], ['manuel', '✎ Saisi manuellement'], ['verifie', '✓ Vérifié']]} />
        <TextField label="Provenance" value={p.value.source} onChange={(v) => onChange({ ...p, value: { ...p.value, source: v } })} />
        {isAsset && <CheckField label="Mobilisable sans vendre (liquide)" checked={p.liquide} onChange={(v) => onChange({ ...p, liquide: v })} />}
        {isCharge && <SelectField label="Déductible fiscalement au décès" value={p.deductible} onChange={(v) => onChange({ ...p, deductible: v })} options={[['oui', 'Oui'], ['a_confirmer', 'À confirmer'], ['non', 'Non (trésorerie seulement)']]} />}
        {isCharge && <SelectField label="Payé par" value={p.payePar} onChange={(v) => onChange({ ...p, payePar: v })} options={[['succession', 'Succession'], ...(['pere', 'fils', 'petitFils'] as PersonId[]).map((x) => [x, PERSON_LABEL[x]] as [PersonId, string])]} />}
      </div>
      <button type="button" className="link danger" onClick={onRemove}>Supprimer ce poste</button>
    </fieldset>
  );
}
