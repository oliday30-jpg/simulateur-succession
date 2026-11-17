import { useState } from 'react';
import type { Row } from './ComparisonTab';
import { IssueList, Money, NumView, SliceTable, T, useT, useWho } from './display';
import { SelectField } from './fields';
import { formatDate } from '../util/dates';
import { formatEUR } from '../util/money';
import { formatFrac } from '../util/fraction';
import { ALL_PROFILES, STATUS_LABEL } from '../tax/rules';

export function DetailTab({ rows, allRows }: { rows: Row[]; allRows: Row[] }) {
  const who = useWho();
  const t = useT();
  const [id, setId] = useState(rows[0]?.sc.id ?? allRows[0]?.sc.id);
  const row = allRows.find((r) => r.sc.id === id) ?? allRows[0];
  if (!row) return <p>Aucune variante.</p>;
  const { res, sc } = row;
  return (
    <div className="stack">
      <section className="card">
        <h2>Détail fiscal</h2>
        <SelectField label="Variante" value={row.sc.id} onChange={setId} options={allRows.map((r) => [r.sc.id, r.sc.name] as [string, string])} />
        <dl className="kv">
          <dt>Valeur de la maison (actes)</dt><dd>{formatEUR(res.houseValue.cents)} — {res.houseValue.provenance}</dd>
          <dt>Valeur de la maison au décès</dt><dd>{formatEUR(res.houseValueAtDeath.cents)} — {res.houseValueAtDeath.provenance}</dd>
          <dt>Décès simulé</dt><dd>{sc.deathDate ? formatDate(sc.deathDate) : 'non simulé'}</dd>
          <dt>Total fiscal</dt><dd><NumView n={res.totals.fiscalTotal} /></dd>
        </dl>
        <h3>Points en suspens et hypothèses</h3>
        <IssueList issues={res.issues} />
      </section>

      <section className="card">
        <h3>Chronologie</h3>
        <ol className="timeline">
          {res.timeline.map((ev) => <li key={ev.eventId}><strong>{formatDate(ev.date)}</strong> (ordre {ev.order}) — {t(ev.label)}<ul>{ev.effects.map((e, i) => <li key={i}>{t(e)}</li>)}</ul></li>)}
          {sc.deathDate && <li><strong>{formatDate(sc.deathDate)}</strong> — <T>décès simulé du père</T></li>}
        </ol>
        <h3><T>Trésorerie du père</T> (mode {res.cash.mode})</h3>
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">Date</th><th scope="col">Flux</th><th scope="col">Montant</th></tr></thead>
          <tbody>
            <tr><td>—</td><td>Avoirs liquides de départ</td><td><Money c={res.cash.start} /></td></tr>
            {res.flows.map((f, i) => <tr key={i}><td>{f.date ? formatDate(f.date) : '—'}</td><td>{t(f.label)} ({who(f.who)})</td><td><Money c={f.amount} /></td></tr>)}
            <tr><th scope="row" colSpan={2}>Après événements</th><td><Money c={res.cash.afterEvents} /></td></tr>
            {res.cash.mode === 'B' && <tr><th scope="row" colSpan={2}>Solde au décès saisi (mode B)</th><td><Money c={res.cash.atDeath} /></td></tr>}
          </tbody>
        </table></div>
        <h3>Budget et réserve</h3>
        {res.budget.renseigne ? (
          <dl className="kv">
            <dt>Disponible après événements</dt><dd><Money c={res.budget.disponible} /></dd>
            <dt>Besoins ponctuels (travaux, relogement)</dt><dd><Money c={res.budget.besoinsPonctuels} /></dd>
            <dt>Écart à la réserve minimale</dt><dd><Money c={res.budget.ecartReserve} /></dd>
            <dt>Déficit mensuel</dt><dd><Money c={res.budget.deficitMensuel} /></dd>
            <dt>Durée indicative (sans rendement)</dt><dd>{res.budget.dureeMois === null ? 'non calculable' : `${res.budget.dureeMois} mois`}</dd>
            {res.budget.manquants.length > 0 && <><dt>Champs manquants</dt><dd>{res.budget.manquants.join(', ')}</dd></>}
          </dl>
        ) : <p className="muted">Budget non renseigné (onglet Situation).</p>}
      </section>

      <section className="card">
        <h3>Coûts du vivant</h3>
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">Date</th><th scope="col">Poste</th><th scope="col">Nature</th><th scope="col">Payé par</th><th scope="col">Montant</th></tr></thead>
          <tbody>{res.costsToday.map((c, i) => <tr key={i}><td>{formatDate(c.date)}</td><td>{t(c.label)}</td><td>{c.kind === 'fiscal' ? 'fiscal' : 'frais'}</td><td>{who(c.payer)}</td><td><Money c={c.amount} /></td></tr>)}
            {!res.costsToday.length && <tr><td colSpan={5} className="muted">Aucun coût du vivant.</td></tr>}</tbody>
        </table></div>
        {res.sale && (
          <>
            <h3>Ventilation de la vente</h3>
            <p>Prix {formatEUR(res.sale.prix)} ; frais {formatEUR(res.sale.frais)} ; net {formatEUR(res.sale.net)} — statut : {res.sale.status === 'calcule' ? 'calculé' : 'non disponible'}</p>
            {res.sale.pieces.length > 0 && <div className="table-wrap"><table>
              <thead><tr><th scope="col">Lot</th><th scope="col">Droit</th><th scope="col">Titulaire</th><th scope="col">Poids</th><th scope="col">Montant</th></tr></thead>
              <tbody>{res.sale.pieces.map((p, i) => <tr key={i}><td>{p.lotId}</td><td>{p.droit}</td><td>{who(p.holder)}</td><td>{formatFrac(p.weight)}</td><td>{formatEUR(p.amount)}</td></tr>)}</tbody>
            </table></div>}
            <ul>{[...res.sale.reasons, ...res.sale.warnings].map((w, i) => <li key={i}>{t(w)}</li>)}</ul>
          </>
        )}
      </section>

      <section className="card">
        <h3>Calculs dépliables</h3>
        {res.details.map((d) => (
          <details key={d.id} className="detail">
            <summary>{t(d.title)}</summary>
            <ul>{d.lines.map((l, i) => <li key={i}>{t(l)}</li>)}</ul>
            {d.slices && <SliceTable slices={d.slices} caption={d.slicesLabel ?? 'Tranches'} />}
            {d.extraSlices?.map((x) => <SliceTable key={x.label} slices={x.slices} caption={t(x.label)} />)}
            {d.rounding && <p className="small">Arrondi : {d.rounding}</p>}
            {d.rule && <p className="small">Version de règle : <code>{d.rule.id}</code> — {d.rule.label} — <strong>{d.rule.statut}</strong></p>}
            {d.hypotheses.length > 0 && <><h4>Hypothèses</h4><ul className="small">{d.hypotheses.map((h, i) => <li key={i}>{t(h)}</li>)}</ul></>}
            {d.sources && <><h4>Sources</h4><ul className="small">{d.sources.map((s) => <li key={s.url}>{s.titre}{s.article ? ` — ${s.article}` : ''} — consulté le {formatDate(s.consulte)}{s.dateEffet ? ` — effet : ${s.dateEffet}` : ''}<br /><span className="url">{s.url}</span><br />Constat : {s.constat}</li>)}</ul></>}
          </details>
        ))}
        {res.death.reason && <p className="warn">{t(res.death.reason)}</p>}
      </section>

      <section className="card">
        <h3>Catalogue des versions de règles</h3>
        <div className="table-wrap"><table>
          <thead><tr><th scope="col">Identifiant</th><th scope="col">Libellé</th><th scope="col">Statut</th><th scope="col">Validité</th></tr></thead>
          <tbody>{ALL_PROFILES.map((p) => <tr key={p.id}><td><code>{p.id}</code></td><td>{p.label}</td><td>{STATUS_LABEL[p.statut]}</td><td>{p.validFrom ? formatDate(p.validFrom) : '…'} → {p.validTo ? formatDate(p.validTo) : '…'}</td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}
