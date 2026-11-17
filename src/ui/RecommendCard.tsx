import { useMemo } from 'react';
import type { AppState, Scenario } from '../model/types';
import { TEMPLATES } from '../model/sample';
import { alignedReference, simulate } from '../engine/simulate';
import { recommend, type Candidate } from '../engine/recommend';
import { formatEUR } from '../util/money';
import { formatDate } from '../util/dates';
import { NumView, useT } from './display';

/** Variantes de l'utilisateur + modèles pas encore créés (évalués sur la situation actuelle). */
function candidates(state: AppState): { sc: Scenario; fromTemplate: boolean }[] {
  const own = state.scenarios.map((sc) => ({ sc, fromTemplate: false }));
  const used = new Set(state.scenarios.map((s) => s.templateId));
  const extra = TEMPLATES.filter((t) => !used.has(t.id)).map((t) => ({ sc: t.build(), fromTemplate: true }));
  return [...own, ...extra];
}

const saving = (c: Candidate) => (c.saveMin === c.saveMax ? formatEUR(c.saveMax) : `entre ${formatEUR(c.saveMin)} et ${formatEUR(c.saveMax)}`);

/** Classement des variantes + modèles (partagé par la Comparaison et le Rapport). */
export function useRecommendation(state: AppState) {
  return useMemo(() => {
    const list = candidates(state);
    const templ = new Set(list.filter((x) => x.fromTemplate).map((x) => x.sc.id));
    const rows = list.map(({ sc }) => ({ sc, res: simulate(state.situation, sc), ref: simulate(state.situation, alignedReference(sc)) }));
    return { rec: recommend(rows), templ };
  }, [state]);
}

export function RecommendCard({ state }: { state: AppState }) {
  const t = useT();
  const { rec, templ } = useRecommendation(state);
  const name = (sc: Scenario) => `${t(sc.name)}${templ.has(sc.id) ? ' (modèle)' : ''}`;
  const p = rec.piste;
  return (
    <section className="card" aria-labelledby="h-piste">
      <h2 id="h-piste">Piste à étudier en priorité</h2>
      <p className="muted small">Classement <strong>prudent</strong> de vos variantes et des modèles non encore créés, selon l’économie de droits (donation + succession) par rapport à « ne rien faire » à la même date.
        L’économie retenue est la plus faible possible quand une hypothèse n’est pas tranchée. C’est une piste de réflexion à valider avec le notaire, pas un conseil.</p>
      {p ? (
        <div className="piste" role="status">
          <p><span aria-hidden="true">➜ </span><strong>{name(p.sc)}</strong> — économie estimée : <strong>{saving(p)}</strong>
            {p.sc.deathDate && <> (décès simulé le {formatDate(p.sc.deathDate)})</>}.</p>
          <ul className="small">
            <li>Coût payé aujourd’hui : <NumView n={p.res.totals.fiscalToday} /> ; frais non fiscaux : <NumView n={p.res.totals.fraisNonFiscaux} />.</li>
            {p.cashDelta !== null && p.cashDelta < 0 && <li>{t(`Le père dispose de ${formatEUR(-p.cashDelta)} de moins après les événements.`)}</li>}
            <li>{rec.economieCertaine ? '✓ Économie positive même dans l’hypothèse la plus prudente.' : '? Économie possible mais non garantie : elle dépend d’une hypothèse à confirmer.'}</li>
            <li>{rec.robuste ? '✓ Reste la moins coûteuse quelle que soit l’hypothèse retenue.' : '? D’autres variantes pourraient faire mieux selon les hypothèses : voir le classement ci-dessous.'}</li>
            {p.cautions.map((c, i) => <li key={i}>⚠ {t(c)}</li>)}
          </ul>
        </div>
      ) : <p className="warn" role="status">Aucune variante ne réduit les droits avec les données actuelles : ne rien faire reste la référence.</p>}
      {rec.meilleureEcartee && <p className="warn small">⚠ « {name(rec.meilleureEcartee.sc)} » économiserait davantage mais est écartée : {rec.meilleureEcartee.blockers.map(t).join(' ')}</p>}

      <details>
        <summary>Classement complet ({rec.ranked.length} variante(s) chiffrée(s))</summary>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Classement prudent des variantes</caption>
            <thead><tr><th scope="col">Rang</th><th scope="col">Variante</th><th scope="col">Économie vs ne rien faire</th><th scope="col">Payé aujourd’hui</th><th scope="col">{t('Trésorerie du père')}</th><th scope="col">Vigilance</th></tr></thead>
            <tbody>
              {rec.ranked.map((c, i) => (
                <tr key={c.sc.id}>
                  <td>{i + 1}</td>
                  <td>{name(c.sc)}</td>
                  <td>{c.saveMax <= 0 ? 'aucune' : saving(c)}{!c.fraisConnus && <small className="hint block">frais non renseignés</small>}</td>
                  <td><NumView n={c.res.totals.fiscalToday} /></td>
                  <td>{c.cashDelta === null ? '—' : c.cashDelta === 0 ? 'inchangée' : formatEUR(c.cashDelta)}</td>
                  <td className="small">{c.blockers.length ? `⛔ ${c.blockers.map(t).join(' ')}` : c.cautions.length ? `${c.cautions.length} point(s)` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rec.unranked.length > 0 && <>
          <p className="small"><strong>Non classées :</strong></p>
          <ul className="small">{rec.unranked.map((u) => <li key={u.sc.id}>{name(u.sc)} — {t(u.reason)}</li>)}</ul>
        </>}
        <p className="muted small">Les modèles marqués « (modèle) » se créent en un clic dans l’onglet Scénarios pour les ajuster (montants, dates, frais d’acte).</p>
      </details>
    </section>
  );
}
