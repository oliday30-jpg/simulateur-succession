import { useMemo, useState } from 'react';
import type { AppState, HolderId, Scenario, Situation, Lot, Vente } from '../model/types';
import { simulate, alignedReference, type SimResult } from '../engine/simulate';
import { subNum, type Num } from '../engine/num';
import { NumView, Money, T, useT, useWho } from './display';
import { formatEUR, euros, type Cents } from '../util/money';
import { formatFrac, type Frac } from '../util/fraction';
import { formatDate } from '../util/dates';
import { TEMPLATES } from '../model/sample';
import { comparisonCsv, shareOrDownload } from '../persistence/io';
import { datePresets } from './ScenariosTab';
import { FracField, MoneyField, SelectField } from './fields';
import { HOLDER_LABEL } from '../domain/rights';

export interface Row { sc: Scenario; res: SimResult; ref: SimResult }

const lotsText = (lots: Lot[] | null) => !lots ? 'non disponible' : lots.length === 0 ? 'maison vendue' :
  lots.map((l) => `${formatFrac(l.share)} ${l.pp ? `PP ${HOLDER_LABEL[l.pp]}` : `NP ${HOLDER_LABEL[l.np!]} / US ${HOLDER_LABEL[l.us!]}`}`).join(' ; ');

/** Compromis : on ne déclare jamais une option « meilleure » automatiquement. */
export function tradeoffs(res: SimResult, ref: SimResult): string[] {
  const out: string[] = [];
  const dF = res.totals.fiscalTotal.value !== null && ref.totals.fiscalTotal.value !== null ? res.totals.fiscalTotal.value - ref.totals.fiscalTotal.value : null;
  const dCash = res.cash.afterEvents !== null && ref.cash.afterEvents !== null ? res.cash.afterEvents - ref.cash.afterEvents : null;
  if (dF !== null && dF < 0) out.push(`Réduit l’impôt familial de ${formatEUR(-dF)} par rapport à la référence alignée.`);
  if (dF !== null && dF > 0) out.push(`Augmente l’impôt familial de ${formatEUR(dF)} par rapport à la référence alignée.`);
  if (dF === null) out.push('Écart fiscal non chiffrable exactement (résultat à confirmer ou partiel).');
  if (dCash !== null && dCash < 0) out.push(`Le père dispose de ${formatEUR(-dCash)} de moins après les événements.`);
  if (res.budget.ecartReserve !== null && res.budget.ecartReserve < 0) out.push('⚠ Fragilise la réserve minimale du père : à ne pas retenir sans arbitrage.');
  const fr = res.totals.fraisNonFiscaux;
  if (fr.value === null) out.push('Frais non fiscaux non renseignés : l’économie éventuelle doit être comparée au devis.');
  else if (dF !== null && dF < 0 && fr.value > -dF) out.push(`Les frais (${formatEUR(fr.value)}) dépassent l’économie fiscale.`);
  const pereSale = res.sale?.byHolder.pere;
  if (res.sale && ref.sale === null && pereSale !== undefined) out.push(`À la vente, le père perçoit ${formatEUR(pereSale)}.`);
  if (res.timeline.some((t) => t.label.startsWith('Donation immobilière')) && res.sale) out.push('Après donation, le père ne perçoit plus que la valeur convenue de son usufruit sur le prix.');
  const fils = res.beneficiaries.find((b) => b.id === 'fils');
  if (fils?.peutPayerSansVendre === false) out.push('Le fils ne peut pas payer les droits avec les seules liquidités héritées.');
  return out;
}

const deltaNum = (a: Num, b: Num) => subNum(a, b);

export function ComparisonTab({ state, rows }: { state: AppState; rows: Row[] }) {
  const who = useWho();
  const t = useT();
  const bases = new Set(rows.map((r) => `${r.sc.deathDate}|${r.sc.rulesMode}|${r.sc.valeurMaisonDeces}|${r.sc.reserveProgressivite}`));
  const metric = (label: string, f: (r: Row) => React.ReactNode, help?: string) => (
    <tr><th scope="row">{t(label)}{help && <small className="hint block">{t(help)}</small>}</th>{rows.map((r) => <td key={r.sc.id}>{f(r)}</td>)}</tr>
  );
  return (
    <div className="stack">
      <section className="card" aria-labelledby="h-cmp">
        <h2 id="h-cmp">Comparaison des variantes</h2>
        {rows.length < 3 && <p className="warn" role="status">Sélectionnez au moins trois variantes dans l’onglet Scénarios pour une comparaison complète ({rows.length} sélectionnée(s)).</p>}
        {bases.size > 1 && <p className="warn" role="alert">⚠ Les variantes sélectionnées n’ont pas la même base (date de décès, règles, valeur au décès ou réserve). Les écarts entre colonnes ne sont pas comparables : lisez la ligne « écart vs référence alignée », recalculée pour chaque variante à sa propre base.</p>}
        <div className="row">
          <button type="button" onClick={() => void shareOrDownload(`comparaison-${new Date().toISOString().slice(0, 10)}.csv`, comparisonCsv(rows), 'text/csv;charset=utf-8')} aria-describedby="csv-note">Exporter la comparaison (CSV)</button>
          <button type="button" onClick={() => window.print()}>Imprimer / PDF</button>
        </div>
        <p id="csv-note" className="muted small">L’export CSV contient les montants de la simulation (pas les noms).</p>
        <div className="table-wrap">
          <table className="cmp">
            <caption className="sr-only">Comparaison des variantes sélectionnées</caption>
            <thead><tr><th scope="col">Indicateur</th>{rows.map((r) => <th key={r.sc.id} scope="col">{t(r.sc.name)}</th>)}</tr></thead>
            <tbody>
              {metric('Décès simulé', (r) => (r.sc.deathDate ? formatDate(r.sc.deathDate) : 'non simulé'))}
              {metric('Règles appliquées', (r) => <span className="small">{r.res.ruleIds.join(' + ') || '—'}{r.sc.rulesMode === 'constant2026' && <strong> (contrefactuel)</strong>}</span>)}
              {metric('Droits sur la maison avant décès', (r) => <span className="small">{t(lotsText(r.res.lotsAvantDeces))}</span>)}
              {metric('Droits sur la maison après décès', (r) => <span className="small">{t(lotsText(r.res.houseSold ? [] : r.res.lotsApresDeces))}</span>)}
              {metric('Montant donné du vivant', (r) => <Money c={r.res.beneficiaries.filter((b) => b.id !== 'pere').reduce((a, b) => a + (b.recuVivant ?? 0), 0)} />, 'à part du montant disponible au père')}
              {metric('Trésorerie du père après événements', (r) => <Money c={r.res.cash.afterEvents} />)}
              {metric('Écart à la réserve minimale', (r) => r.res.budget.ecartReserve === null ? <span className="na">non renseigné</span> : <span>{r.res.budget.ecartReserve < 0 ? '⚠ ' : ''}<Money c={r.res.budget.ecartReserve} /></span>)}
              {metric('Coût fiscal aujourd’hui', (r) => <NumView n={r.res.totals.fiscalToday} />)}
              {metric('Droits au décès', (r) => <NumView n={r.res.totals.fiscalDeath} />)}
              {metric('Total fiscal', (r) => <NumView n={r.res.totals.fiscalTotal} />)}
              {metric('Frais non fiscaux', (r) => <NumView n={r.res.totals.fraisNonFiscaux} />)}
              {metric('Total frais compris', (r) => <NumView n={r.res.totals.totalFraisCompris} />, 'seulement si tout est renseigné')}
              {metric('Écart total fiscal vs référence alignée', (r) => <NumView n={deltaNum(r.res.totals.fiscalTotal, r.ref.totals.fiscalTotal)} />, 'négatif = économie')}
              {metric('Net reçu — fils survivant', (r) => <NumView n={r.res.beneficiaries.find((b) => b.id === 'fils')?.net ?? { value: null, status: 'non_disponible', notes: [] }} />, 'dons + héritage − impôts − frais à sa charge')}
              {metric('Liquidités héritées par le fils / peut payer sans vendre ?', (r) => { const f = r.res.beneficiaries.find((b) => b.id === 'fils'); return <span><Money c={f?.liquiditesDeces} /> — {f?.peutPayerSansVendre === null || f?.peutPayerSansVendre === undefined ? 'indéterminé' : f.peutPayerSansVendre ? '✓ oui' : '✗ non'}</span>; })}
              {metric('Net reçu — petit-fils', (r) => { const b = r.res.beneficiaries.find((x) => x.id === 'petitFils'); return b ? <NumView n={b.net} /> : '—'; })}
              {metric('Vente : part du père', (r) => r.res.sale ? (r.res.sale.status === 'calcule' ? <Money c={r.res.sale.byHolder.pere ?? 0} /> : <span className="na">non disponible (coefficient)</span>) : '—')}
              {metric('Points en suspens', (r) => `${r.res.pending.length}`)}
              {metric('Compromis', (r) => <ul className="small">{tradeoffs(r.res, r.ref).map((x, i) => <li key={i}>{t(x)}</li>)}</ul>)}
            </tbody>
          </table>
        </div>
        <p className="muted small">Aucune option n’est déclarée « meilleure » automatiquement. Personnes : {who('pere')}, {who('fils')}, {who('petitFils')}.</p>
      </section>
      <GuidedAnswers situation={state.situation} />
      <Sensitivity state={state} rows={rows} />
    </div>
  );
}

function GuidedAnswers({ situation }: { situation: Situation }) {
  const [coef, setCoef] = useState<Frac | null>(null);
  const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!.build();
  const sim = (sc: Scenario) => simulate(situation, sc);
  const a = useMemo(() => {
    const ref = sim(tpl('reference'));
    const d10 = sim(tpl('don10k_enr')), d20 = sim(tpl('don20k_enr'));
    const n10in = sim(tpl('don10k_nenr'));
    const n10out = sim({ ...tpl('don10k_nenr'), deathDate: '2031-12-16', rulesMode: 'constant2026' });
    const refOut = sim({ ...tpl('reference'), deathDate: '2031-12-16', rulesMode: 'constant2026' });
    const immoIn = sim(tpl('donation_immo'));
    const immoOut = sim({ ...tpl('donation_immo'), deathDate: '2030-06-01', rulesMode: 'constant2026' });
    const refImmoOut = sim({ ...tpl('reference'), deathDate: '2030-06-01', rulesMode: 'constant2026' });
    const withC = (sc: Scenario) => ({ ...sc, events: sc.events.map((e) => (e.type === 'vente' ? ({ ...e, coefUsufruit: coef, accordsConfirmes: true } as Vente) : e)) });
    const vAvant = sim(withC(tpl('vente_actuelle')));
    const vApres = sim(withC(tpl('vente_apres_donation')));
    const l25 = sim(tpl('legs25k'));
    const don25 = sim({ ...tpl('reference'), events: [{ ...(tpl('don10k_enr').events[0]), donataire: 'petitFils', montant: euros(25000) } as Scenario['events'][number]] });
    return { ref, d10, d20, n10in, n10out, refOut, immoIn, immoOut, refImmoOut, vAvant, vApres, l25, don25 };
  }, [situation, coef]);
  const fils = (r: SimResult) => r.death.rows.find((x) => x.id === 'fils')?.droits;
  const pf = (r: SimResult) => r.beneficiaries.find((x) => x.id === 'petitFils');
  const who = useWho();
  const t = useT();
  return (
    <section className="card" aria-labelledby="h-qa">
      <h2 id="h-qa">Réponses guidées (modèles appliqués à la situation actuelle)</h2>
      <p className="muted">Les résultats après 2027 utilisent explicitement le barème 2026 constant (contrefactuel) : ce ne sont pas des prédictions.</p>
      <details open><summary><T>1. Coût d’un don bancaire enregistré et ce qui reste au père</T></summary>
        <ul>
          <li>10 000 € : droit <NumView n={a.d10.totals.fiscalToday} /> ; <T>reste au père</T> <Money c={a.d10.cash.afterEvents} /></li>
          <li>20 000 € : droit <NumView n={a.d20.totals.fiscalToday} /> ; <T>reste au père</T> <Money c={a.d20.cash.afterEvents} /></li>
        </ul></details>
      <details><summary>2. Don non enregistré : décès avant ou après la période de rappel (5 ans)</summary>
        <ul>
          <li>Décès le {formatDate('2027-11-30')} (dans les 5 ans) : droits au décès <NumView n={a.n10in.totals.fiscalDeath} /> (référence <NumView n={a.ref.totals.fiscalDeath} />) — le don est rappelé.</li>
          <li>Décès le {formatDate('2031-12-16')} (après 5 ans, contrefactuel) : <NumView n={a.n10out.totals.fiscalDeath} /> contre <NumView n={a.refOut.totals.fiscalDeath} /> sans don.</li>
        </ul></details>
      <details><summary>3. Donation de la moitié avec réserve d’usufruit</summary>
        <ul>
          <li>Coût au jour de l’acte : <NumView n={a.immoIn.totals.fiscalToday} /> hors frais d’acte (frais : <NumView n={a.immoIn.totals.fraisNonFiscaux} />).</li>
          <li>Décès dans les 3 ans : droits au décès <NumView n={a.immoIn.totals.fiscalDeath} /> (réserve de progressivité non vérifiée).</li>
          <li>Décès après 3 ans (contrefactuel) : <NumView n={a.immoOut.totals.fiscalDeath} /> ; total avec l’acte <NumView n={a.immoOut.totals.fiscalTotal} /> contre <NumView n={a.refImmoOut.totals.fiscalTotal} /> sans donation.</li>
        </ul></details>
      <details><summary>4. Vente du vivant, avant et après donation</summary>
        <FracField label="Coefficient d’usufruit CONVENU (aucune valeur par défaut)" value={coef} onChange={setCoef} hint="Ex. 15 % pour un contrôle arithmétique — pas une estimation" />
        {[['Avant donation', a.vAvant], ['Après donation', a.vApres]].map(([lbl, r]) => {
          const res = r as SimResult;
          return <div key={lbl as string}><strong>{lbl as string}</strong> : {res.sale?.status === 'calcule'
            ? <>{Object.entries(res.sale.byHolder).map(([h, c]) => `${who(h as HolderId)} ${formatEUR(c as Cents)}`).join(' ; ')} — <T>trésorerie du père ensuite :</T> {formatEUR(res.cash.afterEvents)}</>
            : <span className="na">non disponible : saisissez un coefficient convenu.</span>}</div>;
        })}
        {a.vAvant.sale?.sensitivity && <SensGrid sale={a.vAvant.sale} title={t('Grille FICTIVE avant donation (part du père)')} />}
        {a.vApres.sale?.sensitivity && <SensGrid sale={a.vApres.sale} title={t('Grille FICTIVE après donation (part du père)')} />}
      </details>
      <details><summary><T>5. Petit-fils : legs plutôt que don</T></summary>
        <ul>
          <li><T>Legs 25 000 € : droits du petit-fils</T> <NumView n={a.l25.death.rows.find((x) => x.id === 'petitFils')?.droits ?? { value: null, status: 'non_disponible', notes: [] }} /> ; net <NumView n={pf(a.l25)?.net ?? { value: null, status: 'non_disponible', notes: [] }} /> ; total familial au décès <NumView n={a.l25.totals.fiscalDeath} />.</li>
          <li>Don enregistré 25 000 € : droit <NumView n={a.don25.totals.fiscalToday} /> aujourd’hui ; net <NumView n={pf(a.don25)?.net ?? { value: null, status: 'non_disponible', notes: [] }} /> ; total familial <NumView n={a.don25.totals.fiscalTotal} />.</li>
          <li><T>Pour le fils : droits</T> <NumView n={fils(a.l25) ?? { value: null, status: 'non_disponible', notes: [] }} /> avec legs contre <NumView n={fils(a.ref) ?? { value: null, status: 'non_disponible', notes: [] }} /> sans legs.</li>
        </ul></details>
      <details><summary>6. Sensibilité à la valeur de la maison, à l’épargne et à la créance</summary><p>Voir la matrice ci-dessous.</p></details>
      <details><summary>7. Quand une option moins taxée devient moins favorable</summary>
        <p><T>Ligne « Compromis » du tableau : frais d’acte supérieurs à l’économie, trésorerie ou réserve du père réduite, perte de la pleine propriété en cas de vente (seule la valeur de l’usufruit revient au père), liquidités insuffisantes pour payer les droits.</T></p></details>
    </section>
  );
}

function SensGrid({ sale, title }: { sale: NonNullable<SimResult['sale']>; title: string }) {
  const who = useWho();
  return (
    <table className="slices"><caption>{title}</caption>
      <thead><tr><th scope="col">Coefficient fictif</th><th scope="col">{who('pere')}</th></tr></thead>
      <tbody>{sale.sensitivity!.map((s, i) => <tr key={i}><td>{formatFrac(s.coef)}</td><td>{formatEUR(s.byHolder.pere ?? 0)}</td></tr>)}</tbody>
    </table>
  );
}

function Sensitivity({ state, rows }: { state: AppState; rows: Row[] }) {
  const [scId, setScId] = useState(rows[0]?.sc.id ?? state.scenarios[0]?.id ?? '');
  const [houseCustom, setHouseCustom] = useState<Cents | null>(null);
  const [savCustom, setSavCustom] = useState<Cents | null>(null);
  const [creance, setCreance] = useState(false);
  const t = useT();
  const sc = state.scenarios.find((s) => s.id === scId) ?? state.scenarios[0];
  const houses = [250000, 275000, 300000, 325000].map(euros).concat(houseCustom !== null ? [houseCustom] : []);
  const savs = [150000, 170000, 175000].map(euros).concat(savCustom !== null ? [savCustom] : []);
  const grid = useMemo(() => {
    if (!sc) return [];
    return houses.map((h) => savs.map((sv) => {
      const s2 = structuredClone(state.situation);
      s2.house.sourceValeurCourante = 'hypothese';
      s2.house.valeurHypothese.cents = h;
      const acc = s2.postes.find((p) => p.kind === 'compte');
      if (acc) acc.value.cents = sv;
      if (creance) { s2.creance.inclusion = 'montant_recouvre'; s2.creance.recouvre.cents = s2.creance.recouvre.cents ?? euros(14000); s2.creance.dejaEncaisse = false; }
      const r = simulate(s2, sc);
      const ref = simulate(s2, alignedReference(sc));
      return { r, ref };
    }));
  }, [state.situation, sc, houseCustom, savCustom, creance]);
  const dateGrid = useMemo(() => {
    const presets = sc ? datePresets(sc) : [];
    return presets.map((p) => ({ p, cells: rows.map((r) => simulate(state.situation, { ...r.sc, deathDate: p.date })) }));
  }, [state.situation, rows, sc]);
  return (
    <section className="card" aria-labelledby="h-sens">
      <h2 id="h-sens">Matrices de sensibilité</h2>
      <div className="grid">
        <SelectField label="Variante analysée" value={sc?.id ?? ''} onChange={setScId} options={state.scenarios.map((s) => [s.id, s.name] as [string, string])} />
        <MoneyField label="Autre valeur de maison" value={houseCustom} onChange={setHouseCustom} />
        <MoneyField label="Autre montant d’épargne" value={savCustom} onChange={setSavCustom} />
        <SelectField label="Créance" value={creance ? 'oui' : 'non'} onChange={(v) => setCreance(v === 'oui')} options={[['non', 'Non récupérée'], ['oui', 'Récupérée (montant saisi ou 14 000 € indicatif)']]} />
      </div>
      <div className="table-wrap">
        <table className="matrix">
          <caption>Total fiscal de « {t(sc?.name ?? '')} » (et écart vs référence alignée) — valeur maison × épargne du compte principal</caption>
          <thead><tr><th scope="col">Maison \ Épargne</th>{savs.map((s) => <th key={s} scope="col">{formatEUR(s, { round: true })}</th>)}</tr></thead>
          <tbody>
            {grid.map((row, i) => (
              <tr key={i}><th scope="row">{formatEUR(houses[i], { round: true })}</th>
                {row.map((c, j) => <td key={j}><NumView n={c.r.totals.fiscalTotal} /><br /><small>écart : <NumView n={subNum(c.r.totals.fiscalTotal, c.ref.totals.fiscalTotal)} showStatus={false} /></small></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table className="matrix">
          <caption>Total fiscal selon la date de décès × variante (préréglages autour des seuils de 3 et 5 ans)</caption>
          <thead><tr><th scope="col">Date de décès</th>{rows.map((r) => <th key={r.sc.id} scope="col">{t(r.sc.name)}</th>)}</tr></thead>
          <tbody>
            {dateGrid.map(({ p, cells }) => (
              <tr key={p.label}><th scope="row">{p.label}<br /><small>{formatDate(p.date)}</small></th>{cells.map((c, i) => <td key={i}><NumView n={c.totals.fiscalTotal} /></td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Après le 31/12/2027, le mode « automatique » affiche « non disponible » : choisissez explicitement un profil dans la variante.</p>
    </section>
  );
}
