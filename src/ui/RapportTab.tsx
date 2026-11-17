/**
 * Rapport en langage simple, pour une personne sans connaissance juridique ou fiscale
 * qui doit gérer la succession « en bon père de famille ».
 * Tout est calculé à partir des données saisies ; rien n'est inventé ni présenté comme certain.
 */
import { useMemo } from 'react';
import type { AppState, HolderId, PersonId, Scenario } from '../model/types';
import { TEMPLATES } from '../model/sample';
import { houseValueOf, simulate, type SimResult } from '../engine/simulate';
import type { Num } from '../engine/num';
import type { Candidate } from '../engine/recommend';
import { summarize } from '../domain/rights';
import { formatEUR, type Cents } from '../util/money';
import { formatDate } from '../util/dates';
import { formatFrac, type Frac } from '../util/fraction';
import { useRecommendation } from './RecommendCard';
import { useNames, useT } from './display';
import { deNom, renameText } from './naming';

const WORDS: Record<string, string> = {
  '1/2': 'la moitié', '1/3': 'un tiers', '2/3': 'deux tiers', '1/4': 'un quart', '3/4': 'trois quarts',
  '1/6': 'un sixième', '5/6': 'cinq sixièmes', '1/1': 'la totalité',
};
const fracWords = (f: Frac) => WORDS[`${f.n}/${f.d}`] ?? formatFrac(f);
/** « d’un tiers », « de la moitié ». */
const deFrac = (f: Frac) => { const w = fracWords(f); return /^[aeiouy]/i.test(w) ? `d’${w}` : `de ${w}`; };

type Who = PersonId | HolderId;
const ROLE_ART: Record<Who, string> = {
  pere: 'le père', fils: 'le fils survivant', petitFils: 'le petit-fils', filsPredecede: 'le fils prédécédé',
  beneficiaire: 'la bénéficiaire de la part du fils prédécédé', quart: 'le titulaire de la part du fils prédécédé (à déterminer)',
};
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** Désignation grammaticale : « Marcel » / « le père », « à Marcel » / « au père », « de Marcel » / « du père ». */
function useSay() {
  const names = useNames();
  const le = (id: Who): string => {
    const n = id !== 'quart' ? names[id]?.trim() : '';
    return n || renameText(ROLE_ART[id], names);
  };
  const a = (id: Who) => { const x = le(id); return x.startsWith('le ') ? `au ${x.slice(3)}` : `à ${x}`; };
  const de = (id: Who) => { const x = le(id); return x.startsWith('le ') ? `du ${x.slice(3)}` : x.startsWith('la ') ? `de ${x}` : deNom(x); };
  return { le, Le: (id: Who) => cap(le(id)), a, de };
}
type Say = ReturnType<typeof useSay>;
const part = (value: Cents | null, f: Frac): string => (value === null ? '' : ` (environ ${formatEUR(Math.round((value * f.n) / f.d), { round: true })})`);

/** Montant expliqué sans jargon. */
function plain(n: Num): string {
  if (n.value !== null) return formatEUR(n.value);
  if (n.lo !== undefined && n.hi !== undefined) return `entre ${formatEUR(n.lo)} et ${formatEUR(n.hi)} (selon un point que le notaire doit confirmer)`;
  if (n.lo !== undefined) return `au moins ${formatEUR(n.lo)} (calcul incomplet : il manque des informations)`;
  return 'impossible à calculer pour l’instant (informations manquantes)';
}

const savingText = (c: Candidate) => (c.saveMin === c.saveMax ? formatEUR(c.saveMax) : `entre ${formatEUR(c.saveMin)} et ${formatEUR(c.saveMax)}`);

/** Ce que fait la variante, en phrases simples. */
function explain(sc: Scenario, say: Say): string[] {
  const out: string[] = [];
  const pere = say.Le('pere'), pereMin = say.le('pere');
  for (const e of sc.events) {
    if (e.type === 'don_bancaire') {
      const m = e.montant === null ? 'une somme' : formatEUR(e.montant);
      out.push(e.statut === 'realise_non_enregistre'
        ? `${pere} donne ${m} ${say.a(e.donataire)} par virement, sans le déclarer. Rien à payer aujourd’hui ; mais si ${pereMin} décède dans les 5 ans, cette somme est ajoutée à la succession et taxée comme si le don n’avait pas eu lieu.`
        : `${pere} donne ${m} ${say.a(e.donataire)} et le don est « enregistré » (déclaré officiellement). On paie tout de suite une petite taxe (3,3 % en Wallonie), mais cette somme ne sera plus taxée au décès, qui l’est à un taux bien plus élevé.`);
    } else if (e.type === 'donation_immobiliere') {
      out.push(e.reserveUsufruit
        ? `${pere} donne ${fracWords(e.fraction)} de la maison ${say.a(e.donataire)} devant notaire, mais garde le droit d’y vivre et d’en profiter jusqu’à son décès (il « se réserve l’usufruit »). Au décès, ${say.le(e.donataire)} devient automatiquement plein propriétaire de cette part, sans nouvelle taxe.`
        : `${pere} donne ${fracWords(e.fraction)} de la maison ${say.a(e.donataire)} devant notaire, sans garder de droit dessus.`);
    } else if (e.type === 'vente') out.push('La maison est vendue ; le prix est partagé entre les propriétaires selon les droits de chacun (une règle de partage doit être convenue).');
    else if (e.type === 'cession_quote_part') out.push(`${say.Le(e.de)} cède sa part de la maison ${say.a(e.vers)}.`);
    else if (e.type === 'depense') out.push(`Dépense prévue : ${e.label}${e.montant !== null ? ` (${formatEUR(e.montant)})` : ''}.`);
    else if (e.type === 'recette') out.push(`Rentrée d’argent prévue : ${e.label}${e.montant !== null ? ` (${formatEUR(e.montant)})` : ''}.`);
  }
  for (const l of sc.legs.filter((x) => x.actif)) {
    out.push(`Par testament, ${pereMin} laisse ${l.montant === null ? 'une somme' : formatEUR(l.montant)} ${say.a(l.beneficiaire)}. Rien ne change de son vivant ; c’est réglé au moment de la succession.`);
  }
  if (!out.length) out.push('Rien n’est fait du vivant : tout est transmis au décès.');
  return out;
}

function Figures({ res, c }: { res: SimResult; c?: Candidate }) {
  const t = useT();
  const fils = res.beneficiaries.find((b) => b.id === 'fils');
  return (
    <dl className="kv">
      <dt>À payer maintenant</dt><dd>{plain(res.totals.fiscalToday)}</dd>
      <dt>Taxes au décès</dt><dd>{plain(res.totals.fiscalDeath)}</dd>
      <dt>Total des taxes</dt><dd><strong>{plain(res.totals.fiscalTotal)}</strong></dd>
      {c && <><dt>Économie par rapport à « ne rien faire »</dt><dd><strong>{c.saveMax <= 0 ? 'aucune' : savingText(c)}</strong>{!c.fraisConnus && ' — avant frais de notaire (à demander)'}</dd></>}
      <dt>{t('Argent qui reste au père')}</dt><dd>{formatEUR(res.cash.afterEvents)}</dd>
      {fils && <><dt>{t('Ce que le fils survivant reçoit au total, taxes déduites')}</dt><dd>{plain(fils.net)}</dd></>}
    </dl>
  );
}

export function RapportTab({ state }: { state: AppState }) {
  const say = useSay();
  const t = useT();
  const s = state.situation;
  const hv = houseValueOf(s);
  const { rec, templ } = useRecommendation(state);
  const { ref, refDeath } = useMemo(() => {
    const own = state.scenarios.find((x) => x.templateId === 'reference' && !x.events.length && !x.legs.length);
    const sc = own ?? TEMPLATES.find((x) => x.id === 'reference')!.build();
    return { ref: simulate(s, sc), refDeath: sc.deathDate };
  }, [state, s]);
  const fils = ref.beneficiaries.find((b) => b.id === 'fils');
  const holders = summarize(s.house.lots);
  const options = rec.ranked.filter((c) => !c.blockers.length && c.saveMax > 0).slice(0, 3);
  const name = (sc: Scenario) => `${t(sc.name)}${templ.has(sc.id) ? ' (modèle à créer dans l’onglet Scénarios)' : ''}`;
  const reserveConnue = s.budget.reserveMinimale.cents !== null;
  const pistePure = rec.piste;

  const ownership = (h: (typeof holders)[number]) => {
    const bits: string[] = [];
    if (h.pp.n) bits.push(`est pleinement propriétaire de ${fracWords(h.pp)} de la maison${part(hv.cents, h.pp)}`);
    if (h.us.n) bits.push(`a l’usufruit ${deFrac(h.us)} : le droit d’y habiter ou de la louer, mais pas de vendre cette part seul`);
    if (h.np.n) bits.push(`possède ${fracWords(h.np)} de la maison « sans l’usage » (nue-propriété)${part(hv.cents, h.np)} : cette part lui reviendra entièrement au décès ${say.de('pere')}, sans taxe`);
    return `${say.Le(h.holder as HolderId)} ${bits.join(' ; il ')}.`;
  };

  return (
    <div className="stack rapport">
      <section className="card no-print">
        <p>Ce rapport explique la situation <strong>sans jargon</strong>, à partir des chiffres saisis dans les autres onglets. Il se met à jour tout seul.</p>
        <button type="button" onClick={() => window.print()}>Imprimer / enregistrer en PDF</button>
      </section>

      <article className="card printable" aria-labelledby="h-rapport">
        <h2 id="h-rapport">{t('Rapport simple — transmettre le patrimoine du père')}</h2>
        <p className="small">Établi le {formatDate(new Date().toISOString().slice(0, 10))}. Chiffres <strong>indicatifs</strong> : seul le notaire peut confirmer.</p>

        <h3>1. L’essentiel en trois phrases</h3>
        <ul>
          <li>{t('Si on ne fait rien')}, la famille paiera environ <strong>{plain(ref.totals.fiscalTotal)}</strong> de taxes de succession{refDeath ? ` (calcul fait pour un décès simulé le ${formatDate(refDeath)})` : ''}.</li>
          <li>{pistePure
            ? <>La piste la plus intéressante à étudier est « <strong>{name(pistePure.sc)}</strong> » : elle permettrait d’économiser {savingText(pistePure)}{!pistePure.fraisConnus && ', avant frais de notaire'}.</>
            : 'Aucune option ne fait clairement baisser les taxes avec les chiffres actuels : ne rien faire reste une solution raisonnable.'}</li>
          <li>Avant de décider : <strong>{t('les besoins du père passent en premier')}</strong>, et une donation ne peut pas être annulée.</li>
        </ul>

        <h3>2. Qui possède quoi aujourd’hui</h3>
        <p>La maison (« {s.house.label} ») est estimée à <strong>{formatEUR(hv.cents)}</strong>. Elle appartient à plusieurs personnes, suite à la succession de la mère en 2005 :</p>
        <ul>{holders.map((h) => <li key={h.holder}>{ownership(h)}</li>)}</ul>
        <p>{say.Le('pere')} dispose en plus d’environ <strong>{formatEUR(ref.cash.start)}</strong> d’épargne.</p>
        <p className="small muted">{t('La part du fils prédécédé n’est pas encore attribuée : le notaire dira à qui elle revient (testament, cohabitante légale…).')}</p>

        <h3>3. {t('Si on ne fait rien')}</h3>
        <p>{t(`Au décès du père, ses biens passent à ses héritiers, qui paient des « droits de succession » à la Région wallonne. Plus la part reçue est grande, plus le taux grimpe (de 3 % à 30 % par tranches).`)}</p>
        <ul>
          {ref.death.rows.map((r) => <li key={r.id}>{say.Le(r.id)} paierait {plain(r.droits)}.</li>)}
          {fils && fils.peutPayerSansVendre !== null && <li>{fils.peutPayerSansVendre
            ? t(`Bonne nouvelle : l’épargne héritée (${formatEUR(fils.liquiditesDeces)}) suffit pour payer ces taxes, sans devoir vendre la maison.`)
            : t(`Attention : l’épargne héritée (${formatEUR(fils.liquiditesDeces)}) ne suffit pas pour payer ces taxes ; il faudrait vendre ou emprunter.`)}</li>}
        </ul>
        <p>{t('Ne rien faire a un avantage : le père garde tout, et la liberté de changer d’avis.')}</p>

        <h3>4. Les options qui font baisser les taxes</h3>
        {options.length === 0 && <p>Aucune option chiffrée ne fait baisser les taxes avec les données actuelles.</p>}
        {options.map((c, i) => (
          <section key={c.sc.id} className="option">
            <h4>{i === 0 ? '➜ ' : ''}Option {i + 1} : {name(c.sc)}</h4>
            <p><strong>Ce que c’est :</strong></p>
            <ul>{explain(c.sc, say).map((x, k) => <li key={k}>{x}</li>)}</ul>
            <Figures res={c.res} c={c} />
            {c.cautions.length > 0 && <><p><strong>À savoir avant de choisir :</strong></p><ul>{c.cautions.map((x, k) => <li key={k}>{t(x)}</li>)}</ul></>}
          </section>
        ))}
        {rec.meilleureEcartee && <p className="warn">« {name(rec.meilleureEcartee.sc)} » ferait économiser davantage, mais elle n’est pas présentée ici : {rec.meilleureEcartee.blockers.map(t).join(' ')}</p>}

        <h3>5. Agir « en bon père de famille » : nos conseils de prudence</h3>
        <ol>
          <li><strong>{t('D’abord protéger le père.')}</strong> {reserveConnue
            ? t(`Il doit garder au moins ${formatEUR(s.budget.reserveMinimale.cents)} : les options qui passent sous ce montant sont écartées.`)
            : t('Le montant minimum que le père doit garder pour vivre sereinement (soins, maison de repos, imprévus) n’est pas encore indiqué : remplissez-le dans l’onglet Situation, rubrique Budget, avant toute donation.')}</li>
          <li><strong>Ne rien signer dans l’urgence.</strong> Une donation est définitive. Économiser des taxes ne vaut pas la peine si cela crée des tensions ou met quelqu’un en difficulté.</li>
          <li><strong>Commencer simple.</strong> Un don d’argent enregistré est simple, peu coûteux et facile à comprendre. Une donation de la maison demande un acte notarié et engage tout le monde.</li>
          <li><strong>Comparer l’économie aux frais.</strong> Demandez un devis au notaire : une économie de quelques milliers d’euros peut être absorbée par les frais d’acte.</li>
          <li><strong>Traiter tout le monde de façon claire.</strong> Si une option avantage une personne (par exemple le petit-fils), en parler ouvertement en famille et le noter.</li>
          <li><strong>Garder des traces.</strong> Conservez les preuves de chaque don, l’enregistrement et les extraits bancaires.</li>
        </ol>

        <h3>6. Prochaines étapes</h3>
        <ol>
          <li>Rassembler : actes de propriété, acte de notoriété de 2005, extraits des comptes, testament éventuel.</li>
          <li>{t('Clarifier avec le notaire à qui revient la part du fils prédécédé.')}</li>
          <li>Demander au notaire de confirmer les chiffres de ce rapport et le coût des actes.</li>
          <li>Décider en famille, sans précipitation, puis faire les démarches choisies.</li>
        </ol>
        <p className="small">La liste détaillée des questions se trouve dans l’onglet « Questions pour le notaire ».</p>

        <h3>7. Petit lexique</h3>
        <dl className="glossary">
          <dt>Succession</dt><dd>Ce qui se passe au décès : les biens passent aux héritiers.</dd>
          <dt>Droits de succession</dt><dd>La taxe payée par les héritiers à la Région sur ce qu’ils reçoivent.</dd>
          <dt>Donation</dt><dd>Donner un bien de son vivant. C’est définitif.</dd>
          <dt>Don enregistré</dt><dd>Don déclaré officiellement : petite taxe tout de suite, plus rien au décès.</dd>
          <dt>Délai de 5 ans (rappel)</dt><dd>Un don non déclaré est rattrapé par la succession si le donateur décède dans les 5 ans.</dd>
          <dt>Pleine propriété</dt><dd>Posséder un bien et pouvoir tout en faire : y vivre, le louer, le vendre.</dd>
          <dt>Usufruit</dt><dd>Le droit d’utiliser un bien (y vivre, le louer) sans pouvoir le vendre seul. Il s’éteint au décès.</dd>
          <dt>Nue-propriété</dt><dd>Posséder un bien sans pouvoir l’utiliser pour l’instant ; on récupère l’usage complet au décès de l’usufruitier.</dd>
          <dt>Legs</dt><dd>Ce qu’on laisse à quelqu’un par testament ; rien ne change de son vivant.</dd>
          <dt>Acte notarié</dt><dd>Document officiel signé chez le notaire, obligatoire pour donner ou vendre une maison.</dd>
        </dl>

        <p className="small muted">Ce rapport est un outil d’aide à la discussion. Il ne remplace ni le notaire, ni un conseil juridique ou fiscal. Les règles fiscales après 2027 ne sont pas encore connues avec certitude.</p>
      </article>
    </div>
  );
}
