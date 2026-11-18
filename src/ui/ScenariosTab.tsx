import type { AppState, Scenario, SimEvent, DonBancaire, DonationImmo, Vente, Cession, Flux, Legs, HolderId, RulesMode, PersonId, Donee } from '../model/types';
import { TEMPLATES, newId, mkDonBancaire, mkDonationImmo, mkVente, mkFlux, mkCession, mkLegs, DEFAULT_ACT_DATE, buildCustomScenario, customLineValid, type CustomGiftKind, type CustomGiftLine } from '../model/sample';
import { useState } from 'react';
import { CheckField, DateField, FracField, MoneyField, NeedLegend, SelectField, TextField } from './fields';
import { countMissing, petitFilsInherits, scenarioNeeds } from './essentials';
import { eventLabel, sortEvents, type SimResult } from '../engine/simulate';
import { addDays, addYears, formatDate } from '../util/dates';
import { HOLDER_LABEL } from '../domain/rights';
import { IssueList, NumView, T, useT, useWho } from './display';
import { formatEUR } from '../util/money';

type UpdState = (fn: (s: AppState) => void) => void;

const RULES_OPTS: [RulesMode, string][] = [
  ['auto', 'Automatique : profil en vigueur à la date (sinon « projection non disponible »)'],
  ['constant2026', 'Comparaison à barème 2026 constant (CONTREFACTUEL)'],
  ['decret2024', 'Décret du 05/12/2024 (voté, décès dès 2028)'],
  ['annonce2026', 'Hypothèse personnalisée : annonce du 12/10/2026'],
  ['manuel', 'Droits de succession saisis manuellement'],
];
const DONEES: [Donee, string][] = [['fils', 'Fils survivant'], ['petitFils', 'Petit-fils']];
const PAYERS: [PersonId, string][] = [['pere', 'Père'], ['fils', 'Fils survivant'], ['petitFils', 'Petit-fils']];
const HOLDERS: [HolderId, string][] = (Object.keys(HOLDER_LABEL) as HolderId[]).map((h) => [h, HOLDER_LABEL[h]]);

/** Modèles à montant figé (dons 10 000 / 20 000 €, legs 20 000 / 25 000 €) : remplacés par la donation sur mesure. */
const FIXED_AMOUNT_TPL = /^(don\d+k_|legs\d+k$)/;

const KINDS: [CustomGiftKind, string][] = [
  ['don_enr', 'Don bancaire enregistré (droit payé aujourd’hui)'],
  ['don_nenr', 'Don bancaire non enregistré (rappel si décès dans le délai)'],
  ['legs', 'Legs (au décès, par testament)'],
];
const newLine = (donataire: Donee = 'fils'): CustomGiftLine => ({ kind: 'don_enr', donataire, montant: null });

/** Composer une variante : montants libres, bénéficiaire au choix, plusieurs lignes possibles. */
function DonationComposer({ update }: { update: UpdState }) {
  const who = useWho();
  const [lines, setLines] = useState<CustomGiftLine[]>([newLine()]);
  const [date, setDate] = useState<string>(DEFAULT_ACT_DATE);
  const set = (i: number, patch: Partial<CustomGiftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const valid = lines.filter(customLineValid);
  const totals = DONEES.map(([d]) => [d, valid.filter((l) => l.donataire === d).reduce((a, l) => a + (l.montant ?? 0), 0)] as const).filter(([, t]) => t > 0);
  const hasDon = lines.some((l) => l.kind !== 'legs');
  return (
    <section className="card" aria-labelledby="h-compose">
      <h2 id="h-compose">Donation sur mesure</h2>
      <p className="muted">Choisissez librement le montant et le bénéficiaire. Ajoutez plusieurs lignes pour répartir entre plusieurs personnes (ex. 15 000 € au fils et 5 000 € au petit-fils). Une nouvelle variante est créée et ajoutée à la comparaison.</p>
      {lines.map((l, i) => (
        <fieldset key={i} className="event">
          <legend>Ligne {i + 1}{customLineValid(l) ? ` — ${formatEUR(l.montant)} → ${who(l.donataire)}` : ''}</legend>
          <div className="grid">
            <MoneyField label="Montant" value={l.montant} onChange={(v) => set(i, { montant: v })} hint={l.montant === null ? 'Saisir le montant souhaité, ex. 15 000' : undefined} />
            <SelectField label="Bénéficiaire" value={l.donataire} onChange={(v) => set(i, { donataire: v })} options={DONEES} />
            <SelectField label="Type" value={l.kind} onChange={(v) => set(i, { kind: v })} options={KINDS} />
          </div>
          {lines.length > 1 && <button type="button" className="link danger" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Retirer la ligne {i + 1}</button>}
        </fieldset>
      ))}
      <div className="row">
        <button type="button" onClick={() => setLines((ls) => [...ls, newLine(ls[ls.length - 1]?.donataire === 'fils' ? 'petitFils' : 'fils')])}>+ Autre bénéficiaire / autre montant</button>
      </div>
      {hasDon && <div className="grid"><DateField label="Date des dons" value={date} allowEmpty={false} onChange={(v) => v && setDate(v)} /></div>}
      {totals.length > 0 && <p className="small" role="status">Total : {totals.map(([d, t]) => `${formatEUR(t)} → ${who(d)}`).join(' ; ')}</p>}
      <p className="muted small"><T>Bénéficiaires couverts par le calcul : fils survivant et petit-fils (ligne directe). Une donation à la bénéficiaire de la part du fils prédécédé relève d’un autre barème, non modélisé.</T></p>
      <div className="row">
        <button type="button" disabled={valid.length === 0} onClick={() => {
          update((st) => {
            const sc = buildCustomScenario(lines, date);
            st.scenarios.push(sc); st.activeId = sc.id;
            if (st.selectedIds.length < 4) st.selectedIds.push(sc.id);
          });
          setLines([newLine()]);
        }}>Créer la variante</button>
        {valid.length === 0 && <small className="hint">Saisir au moins un montant.</small>}
      </div>
    </section>
  );
}

export function datePresets(sc: Scenario): { label: string; date: string }[] {
  const anchor = sortEvents(sc.events).find((e) => e.type === 'donation_immobiliere' || e.type === 'don_bancaire')?.date ?? DEFAULT_ACT_DATE;
  const out: { label: string; date: string }[] = [];
  for (const n of [3, 5]) {
    const a = addYears(anchor, n).date;
    out.push({ label: `${n} ans − 1 jour`, date: addDays(a, -1) }, { label: `${n} ans pile`, date: a }, { label: `${n} ans + 1 jour`, date: addDays(a, 1) });
  }
  out.push({ label: '31/12/2027 (veille réforme)', date: '2027-12-31' }, { label: '01/01/2028 (réforme)', date: '2028-01-01' });
  return out;
}

export function ScenariosTab({ state, update, results }: { state: AppState; update: UpdState; results: Map<string, SimResult> }) {
  const active = state.scenarios.find((s) => s.id === state.activeId) ?? state.scenarios[0];
  const idx = state.scenarios.findIndex((s) => s.id === active?.id);
  const upd = (fn: (s: Scenario) => void) => update((st) => { fn(st.scenarios[idx]); });
  const res = active ? results.get(active.id) : undefined;

  return (
    <div className="stack">
      <section className="card" aria-labelledby="h-tpl">
        <h2 id="h-tpl">Modèles en un clic</h2>
        <div className="tpl-grid">
          {TEMPLATES.filter((t) => !FIXED_AMOUNT_TPL.test(t.id)).map((t) => (
            <button key={t.id} type="button" className="tpl" title={t.description} onClick={() => update((st) => {
              const sc = t.build();
              st.scenarios.push(sc); st.activeId = sc.id;
              if (st.selectedIds.length < 4) st.selectedIds.push(sc.id);
            })}><strong><T>{t.label}</T></strong><small><T>{t.description}</T></small></button>
          ))}
        </div>
      </section>

      <DonationComposer update={update} />

      <section className="card" aria-labelledby="h-list">
        <h2 id="h-list">Mes variantes</h2>
        <p className="muted">Cochez les variantes à comparer (au moins trois conseillées). Chaque variante est comparée à une référence recalculée à sa propre date et à ses propres hypothèses.</p>
        <ul className="sc-list">
          {state.scenarios.map((s) => (
            <li key={s.id} className={s.id === active?.id ? 'active' : ''}>
              <CheckField label={`Comparer « ${s.name} »`} checked={state.selectedIds.includes(s.id)} onChange={(v) => update((st) => { st.selectedIds = v ? [...st.selectedIds, s.id] : st.selectedIds.filter((x) => x !== s.id); })} />
              <div className="row">
                <button type="button" aria-pressed={s.id === active?.id} onClick={() => update((st) => { st.activeId = s.id; })}>Modifier</button>
                <button type="button" onClick={() => update((st) => {
                  const copy: Scenario = { ...structuredClone(s), id: newId('S'), name: `${s.name} (copie)`, snapshot: null };
                  copy.events = copy.events.map((e) => ({ ...e, id: newId('E') }));
                  st.scenarios.push(copy); st.activeId = copy.id;
                  if (!st.selectedIds.includes(copy.id)) st.selectedIds.push(copy.id);
                })}>Dupliquer</button>
                <button type="button" className="danger" disabled={state.scenarios.length <= 1} onClick={() => update((st) => {
                  st.scenarios = st.scenarios.filter((x) => x.id !== s.id);
                  st.selectedIds = st.selectedIds.filter((x) => x !== s.id);
                  if (st.activeId === s.id) st.activeId = st.scenarios[0]?.id ?? null;
                })}>Supprimer</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {active && (
        <section className="card" aria-labelledby="h-edit">
          <h2 id="h-edit">Variante : {active.name}</h2>
          <NeedLegend missing={countMissing(scenarioNeeds(active))} />
          <div className="grid">
            <TextField label="Nom de la variante" value={active.name} onChange={(v) => upd((s) => { s.name = v; })} />
            <DateField label="Décès simulé du père" essential value={active.deathDate} onChange={(v) => upd((s) => { s.deathDate = v; })} hint="jj/mm/aaaa — vide = pas de décès simulé" />
            <MoneyField label="Valeur de la maison au décès" value={active.valeurMaisonDeces} onChange={(v) => upd((s) => { s.valeurMaisonDeces = v; })} hint={active.valeurMaisonDeces === null ? 'Vide = hérite de l’hypothèse de la situation' : 'Valeur propre à cette variante'} />
            <SelectField label="Règles fiscales" value={active.rulesMode} onChange={(v) => upd((s) => { s.rulesMode = v; })} options={RULES_OPTS} />
            <SelectField label="Réserve de progressivité immobilière" value={active.reserveProgressivite} onChange={(v) => upd((s) => { s.reserveProgressivite = v; })}
              options={[['inconnu', 'Inconnue : afficher la fourchette'], ['appliquer', 'Appliquer (si confirmée)'], ['ne_pas_appliquer', 'Ne pas appliquer (si confirmé)']]}
              hint="Règle non trouvée dans les sources consultées le 17/11/2026." />
            <SelectField label="Exemption pour le petit-fils légataire" value={active.abattementLegataire} onChange={(v) => upd((s) => { s.abattementLegataire = v; })}
              options={[['non', 'Non appliquée (par défaut)'], ['oui_confirme', 'Appliquée (confirmée par le notaire)']]} />
          </div>
          <div className="presets" role="group" aria-label="Préréglages de date de décès">
            <span>Préréglages :</span>
            {datePresets(active).map((p) => (
              <button key={p.label} type="button" className="chip" aria-pressed={active.deathDate === p.date} onClick={() => upd((s) => { s.deathDate = p.date; })}>{p.label} <small>({formatDate(p.date)})</small></button>
            ))}
          </div>
          {active.rulesMode === 'manuel' && (
            <div className="grid">
              {(['fils', 'petitFils'] as PersonId[]).map((pid) => (
                <MoneyField key={pid} label={`Droits de succession manuels — ${pid === 'fils' ? 'fils' : 'petit-fils'}`} value={active.manualDeathTax[pid] ?? null} essential={pid === 'fils' || petitFilsInherits(active)} onChange={(v) => upd((s) => { s.manualDeathTax[pid] = v; })} hint="Montant fiscal manuel clairement étiqueté" />
              ))}
            </div>
          )}

          <h3>Chronologie (événements du vivant)</h3>
          <div className="row">
            <button type="button" onClick={() => upd((s) => { s.events.push({ ...(mkDonBancaire(0, true) as DonBancaire), montant: null }); })}>+ Don bancaire</button>
            <button type="button" onClick={() => upd((s) => { s.events.push(mkDonationImmo()); })}>+ Donation immobilière</button>
            <button type="button" onClick={() => upd((s) => { s.events.push(mkVente('2027-06-01')); })}>+ Vente</button>
            <button type="button" onClick={() => upd((s) => { s.events.push(mkCession('2027-01-15')); })}>+ Cession / rachat</button>
            <button type="button" onClick={() => upd((s) => { s.events.push(mkFlux('depense', '2027-01-15')); })}>+ Dépense</button>
            <button type="button" onClick={() => upd((s) => { s.events.push(mkFlux('recette', '2027-01-15')); })}>+ Recette</button>
          </div>
          {active.events.length === 0 && <p className="muted">Aucun événement : situation inchangée jusqu’au décès.</p>}
          <ol className="events">
            {sortEvents(active.events).map((e) => {
              const i = active.events.findIndex((x) => x.id === e.id);
              return (
                <li key={e.id}>
                  <EventEditor e={e} onChange={(ne) => upd((s) => { s.events[i] = ne; })} onRemove={() => upd((s) => { s.events.splice(i, 1); })} />
                </li>
              );
            })}
            {active.deathDate && <li className="death-marker">✝ <T>Décès simulé du père</T> le {formatDate(active.deathDate)} — extinction des usufruits, ouverture de la succession.</li>}
          </ol>

          <h3>Legs (dispositions au décès)</h3>
          <p className="muted">Un legs n’est pas une sortie du vivant : il est délivré par l’héritier à l’ouverture de la succession.</p>
          <button type="button" onClick={() => upd((s) => { s.legs.push({ ...mkLegs(0), montant: null }); })}>+ Legs</button>
          {active.legs.map((l, i) => <LegsEditor key={l.id} l={l} onChange={(nl) => upd((s) => { s.legs[i] = nl; })} onRemove={() => upd((s) => { s.legs.splice(i, 1); })} />)}

          <TextField label="Notes" value={active.notes} onChange={(v) => upd((s) => { s.notes = v; })} />

          {res && (
            <div className="summary" aria-live="polite">
              <h3>Résultat rapide</h3>
              <dl className="kv">
                <dt>Coût fiscal aujourd’hui</dt><dd><NumView n={res.totals.fiscalToday} /></dd>
                <dt>Droits au décès</dt><dd><NumView n={res.totals.fiscalDeath} /></dd>
                <dt>Total fiscal</dt><dd><NumView n={res.totals.fiscalTotal} /></dd>
                <dt><T>Trésorerie du père après événements</T></dt><dd>{formatEUR(res.cash.afterEvents)}</dd>
                <dt>Règles utilisées</dt><dd>{res.ruleIds.join(', ') || '—'}</dd>
              </dl>
              <div className="row">
                <button type="button" onClick={() => upd((s) => { s.snapshot = { savedAt: new Date().toISOString().slice(0, 10), ruleIds: res.ruleIds, fiscalTotal: res.totals.fiscalTotal.value, label: 'Résultat figé' }; })}>Figer ce résultat</button>
                {active.snapshot && <SnapshotDiff sc={active} res={res} />}
              </div>
              <h4>Points en suspens</h4>
              <IssueList issues={res.issues.filter((x) => x.level !== 'info')} max={8} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function SnapshotDiff({ sc, res }: { sc: Scenario; res: SimResult }) {
  const snap = sc.snapshot!;
  const changedRules = snap.ruleIds.join() !== res.ruleIds.join();
  const changedTotal = snap.fiscalTotal !== res.totals.fiscalTotal.value;
  return (
    <p className={changedRules || changedTotal ? 'warn' : 'ok'} role="status">
      Instantané du {formatDate(snap.savedAt)} : {formatEUR(snap.fiscalTotal)} ({snap.ruleIds.join(', ')}).
      {changedRules && <> ⚠ Barème différent aujourd’hui : {res.ruleIds.join(', ')}.</>}
      {!changedRules && changedTotal && <> ⚠ Total différent (hypothèses modifiées).</>}
      {!changedRules && !changedTotal && <> ✓ Inchangé.</>}
    </p>
  );
}

function OrderField({ e, onChange }: { e: SimEvent; onChange: (e: SimEvent) => void }) {
  return <TextField label="Ordre le même jour" value={String(e.order)} onChange={(v) => { const n = parseInt(v, 10); if (Number.isFinite(n)) onChange({ ...e, order: n }); }} hint="Entier ; impose l’ordre si plusieurs événements ont la même date" />;
}

function EventEditor({ e, onChange, onRemove }: { e: SimEvent; onChange: (e: SimEvent) => void; onRemove: () => void }) {
  const who = useWho();
  const t = useT();
  return (
    <fieldset className={`event ev-${e.type}`}>
      <legend>{formatDate(e.date)} — {t(eventLabel(e))}</legend>
      <div className="grid">
        <DateField label="Date" value={e.date} allowEmpty={false} onChange={(v) => v && onChange({ ...e, date: v })} />
        <OrderField e={e} onChange={onChange} />
        {e.type === 'don_bancaire' && <DonFields e={e} onChange={onChange} />}
        {e.type === 'donation_immobiliere' && <ImmoFields e={e} onChange={onChange} />}
        {e.type === 'vente' && <VenteFields e={e} onChange={onChange} />}
        {e.type === 'cession_quote_part' && <CessionFields e={e} onChange={onChange} />}
        {(e.type === 'depense' || e.type === 'recette') && <FluxFields e={e} onChange={onChange} />}
      </div>
      <p className="muted small">Concerné : {e.type === 'don_bancaire' || e.type === 'donation_immobiliere' ? `${who('pere')} → ${who(e.donataire)}` : who('pere')}</p>
      <button type="button" className="link danger" onClick={onRemove}>Supprimer l’événement</button>
    </fieldset>
  );
}

function DonFields({ e, onChange }: { e: DonBancaire; onChange: (e: SimEvent) => void }) {
  return (
    <>
      <MoneyField label="Montant du don" essential value={e.montant} onChange={(v) => onChange({ ...e, montant: v })} />
      <SelectField label="Donataire" value={e.donataire} onChange={(v) => onChange({ ...e, donataire: v })} options={DONEES} />
      <SelectField label="Statut" value={e.statut} onChange={(v) => onChange({ ...e, statut: v, dateEnregistrement: v === 'realise_non_enregistre' ? null : e.dateEnregistrement })}
        options={[['prevu', 'Prévu (enregistrement à faire)'], ['realise_non_enregistre', 'Réalisé, non enregistré'], ['enregistrement_confirme', 'Enregistrement confirmé']]} />
      {e.statut !== 'realise_non_enregistre' && <DateField label="Date d’enregistrement" value={e.dateEnregistrement} onChange={(v) => onChange({ ...e, dateEnregistrement: v })} hint="Peut différer de la date du don" />}
      <SelectField label="Droit payé par" value={e.droitsPayesPar} onChange={(v) => onChange({ ...e, droitsPayesPar: v })} options={PAYERS} />
      <MoneyField label="Frais d’enregistrement" value={e.fraisEnregistrement.cents} onChange={(v) => onChange({ ...e, fraisEnregistrement: { ...e.fraisEnregistrement, cents: v } })} />
    </>
  );
}

function ImmoFields({ e, onChange }: { e: DonationImmo; onChange: (e: SimEvent) => void }) {
  return (
    <>
      <FracField label="Fraction de la maison donnée" essential value={e.fraction} onChange={(f) => f && onChange({ ...e, fraction: f })} hint="Fraction de toute la maison, au plus la pleine propriété du père (2/3 selon l’acte de 2005). Ex. 1/2, 2/3" />
      <SelectField label="Donataire" value={e.donataire} onChange={(v) => onChange({ ...e, donataire: v })} options={DONEES} />
      <CheckField label="Réserve d’usufruit au profit du père" checked={e.reserveUsufruit} onChange={(v) => onChange({ ...e, reserveUsufruit: v })} />
      <MoneyField label="Valeur de la maison à la date de l’acte" value={e.valeurBien} onChange={(v) => onChange({ ...e, valeurBien: v })} hint={e.valeurBien === null ? 'Vide = hérite de l’hypothèse de la situation' : undefined} />
      <MoneyField label="Frais d’acte (devis)" value={e.fraisActe.cents} onChange={(v) => onChange({ ...e, fraisActe: { ...e.fraisActe, cents: v } })} hint={e.fraisActe.cents === null ? 'Non renseigné : pas un zéro' : undefined} />
      <SelectField label="Droits payés par" value={e.droitsPayesPar} onChange={(v) => onChange({ ...e, droitsPayesPar: v })} options={PAYERS} />
      <SelectField label="Frais payés par" value={e.fraisPayesPar} onChange={(v) => onChange({ ...e, fraisPayesPar: v })} options={PAYERS} />
    </>
  );
}

function VenteFields({ e, onChange }: { e: Vente; onChange: (e: SimEvent) => void }) {
  return (
    <>
      <MoneyField label="Prix de vente" value={e.prix} onChange={(v) => onChange({ ...e, prix: v })} hint={e.prix === null ? 'Vide = valeur de la maison selon l’hypothèse' : undefined} />
      <MoneyField label="Frais de vente" value={e.frais.cents} onChange={(v) => onChange({ ...e, frais: { ...e.frais, cents: v } })} />
      <SelectField label="Frais supportés par" value={e.fraisRepartition} onChange={(v) => onChange({ ...e, fraisRepartition: v })} options={[['prorata', 'Au prorata des parts'], ...HOLDERS]} />
      <SelectField label="Mode de répartition" value={e.mode} onChange={(v) => onChange({ ...e, mode: v })} options={[['coefficient', 'Coefficient d’usufruit convenu'], ['montants_saisis', 'Montants validés saisis à la main']]} />
      {e.mode === 'coefficient' && <FracField label="Coefficient économique d’usufruit (convenu)" essential value={e.coefUsufruit} onChange={(f) => onChange({ ...e, coefUsufruit: f })} hint="Ni déduit de l’âge, ni coefficient fiscal, ni table civile : valeur convenue entre parties" />}
      {e.mode === 'montants_saisis' && HOLDERS.map(([h, l]) => (
        <MoneyField key={h} label={`Montant — ${l}`} value={e.montantsSaisis[h] ?? null} onChange={(v) => onChange({ ...e, montantsSaisis: { ...e.montantsSaisis, [h]: v } })} />
      ))}
      <CheckField label="Accords de tous les titulaires confirmés" checked={e.accordsConfirmes} onChange={(v) => onChange({ ...e, accordsConfirmes: v })} hint="Y compris la clarification de la part du fils prédécédé" />
    </>
  );
}

function CessionFields({ e, onChange }: { e: Cession; onChange: (e: SimEvent) => void }) {
  return (
    <>
      <TextField label="Lot concerné (identifiant)" value={e.lotId} onChange={(v) => onChange({ ...e, lotId: v })} />
      <SelectField label="Cédant" value={e.de} onChange={(v) => onChange({ ...e, de: v })} options={HOLDERS} />
      <SelectField label="Cessionnaire" value={e.vers} onChange={(v) => onChange({ ...e, vers: v })} options={HOLDERS} />
      <MoneyField label="Prix" value={e.prix} onChange={(v) => onChange({ ...e, prix: v })} />
      <MoneyField label="Frais" value={e.frais.cents} onChange={(v) => onChange({ ...e, frais: { ...e.frais, cents: v } })} />
      <SelectField label="Statut" value={e.statut} onChange={(v) => onChange({ ...e, statut: v })} options={[['hypothese', 'Hypothèse (non appliquée)'], ['confirme_notaire', 'Confirmée par le notaire']]} hint="Aucun droit de partage, vente ou donation n’est appliqué automatiquement." />
    </>
  );
}

function FluxFields({ e, onChange }: { e: Flux; onChange: (e: SimEvent) => void }) {
  return (
    <>
      <TextField label="Libellé" value={e.label} onChange={(v) => onChange({ ...e, label: v })} />
      <MoneyField label="Montant" essential value={e.montant} onChange={(v) => onChange({ ...e, montant: v })} />
    </>
  );
}

function LegsEditor({ l, onChange, onRemove }: { l: Legs; onChange: (l: Legs) => void; onRemove: () => void }) {
  const who = useWho();
  return (
    <fieldset className="event">
      <legend>Legs {formatEUR(l.montant)} — {who(l.beneficiaire)}{l.actif ? '' : ' (désactivé)'}</legend>
      <div className="grid">
        <MoneyField label="Montant du legs" essential={l.actif} value={l.montant} onChange={(v) => onChange({ ...l, montant: v })} />
        <SelectField label="Légataire" value={l.beneficiaire} onChange={(v) => onChange({ ...l, beneficiaire: v })} options={DONEES} />
        <CheckField label="Legs actif" checked={l.actif} onChange={(v) => onChange({ ...l, actif: v })} />
        <SelectField label="Imputation des dons antérieurs" value={l.imputation} onChange={(v) => onChange({ ...l, imputation: v })} options={[['aucune', 'Aucune clause confirmée'], ['imputation_confirmee', 'Clause d’imputation confirmée']]} />
        <SelectField label="Droits du legs à charge de" value={l.droitsACharge} onChange={(v) => onChange({ ...l, droitsACharge: v })} options={[['legataire', 'Légataire'], ['heritier', 'Héritier (legs net de droits)']]} />
      </div>
      <button type="button" className="link danger" onClick={onRemove}>Supprimer le legs</button>
    </fieldset>
  );
}
