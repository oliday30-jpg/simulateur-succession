import type { AppState, HolderId, Lot, PersonId, Scenario, SimEvent, Situation, DonBancaire, DonationImmo } from '../model/types';
import { applyCession, applyDeath, applyDonation, HOLDER_LABEL, ppOf, resolveLots, validateLots } from '../domain/rights';
import { splitSale, type SaleResult } from '../domain/sale';
import { mulCents, formatFrac } from '../util/fraction';
import { cmpISO, formatDate, isValidISO, withinYears, type ISODate } from '../util/dates';
import { formatEUR, type Cents } from '../util/money';
import { resolveDonation, resolveSuccession, STATUS_LABEL, type RuleSource, type SuccessionProfile } from '../tax/rules';
import { donationImmobiliere, donationMobiliere } from '../tax/donation';
import { computeBeneficiaryTax, type BenefTaxInput, type BenefTaxResult } from '../tax/succession';
import type { SliceDetail } from '../tax/brackets';
import { addNum, exact, rangeOf, sumNums, unavailable, type Num } from './num';
import { computeBudget, type BudgetResult } from '../cash/budget';

export type IssueLevel = 'bloquant' | 'validation_requise' | 'a_confirmer' | 'info';
export interface Issue { level: IssueLevel; message: string; ref?: string }

export interface Detail {
  id: string;
  title: string;
  lines: string[];
  slices?: SliceDetail[];
  slicesLabel?: string;
  extraSlices?: { label: string; slices: SliceDetail[] }[];
  rule?: { id: string; label: string; statut: string };
  sources?: RuleSource[];
  hypotheses: string[];
  rounding?: string;
}

export interface CostLine { eventId: string; date: ISODate; label: string; kind: 'fiscal' | 'frais'; amount: Cents | null; payer: PersonId | HolderId | 'succession'; ruleId?: string }
export interface Flow { date: ISODate; label: string; amount: Cents | null; who: PersonId | HolderId }
export interface TimelineRow { eventId: string; date: ISODate; order: number; label: string; effects: string[] }

export interface DeathTaxRow {
  id: PersonId;
  label: string;
  input: BenefTaxInput;
  result: BenefTaxResult | null;
  manual: Cents | null;
  droits: Num;
  payePar: PersonId;
}

export interface BeneficiaryRow {
  id: PersonId | HolderId;
  label: string;
  recuVivant: Cents | null;
  recuDeces: Cents | null;
  produitVente: Cents | null;
  impots: Num;
  frais: Cents | null;
  fraisIncomplets: boolean;
  net: Num;
  liquiditesDeces: Cents | null;
  peutPayerSansVendre: boolean | null;
}

export interface Toggle { key: string; label: string }

export interface SimResult {
  scenarioId: string;
  name: string;
  issues: Issue[];
  timeline: TimelineRow[];
  houseValue: { cents: Cents | null; provenance: string };
  houseValueAtDeath: { cents: Cents | null; provenance: string };
  lotsInitial: Lot[];
  lotsAvantDeces: Lot[];
  lotsApresDeces: Lot[] | null;
  houseSold: boolean;
  sale: (SaleResult & { eventId: string }) | null;
  costsToday: CostLine[];
  flows: Flow[];
  cash: { mode: 'A' | 'B'; start: Cents | null; afterEvents: Cents | null; atDeath: Cents | null; nonLiquide: Cents | null };
  estate: { lines: { label: string; amount: Cents | null; note?: string }[]; masse: Cents | null; legsTotal: Cents | null; residuelHeritier: Cents | null };
  death: { simulated: boolean; profile: SuccessionProfile | null; reason?: string; warnings: string[]; rows: DeathTaxRow[]; total: Num; toggles: Toggle[] };
  budget: BudgetResult;
  totals: { fiscalToday: Num; fiscalDeath: Num; fiscalTotal: Num; fraisNonFiscaux: Num; totalFraisCompris: Num };
  beneficiaries: BeneficiaryRow[];
  details: Detail[];
  ruleIds: string[];
  pending: string[];
}

export function houseValueOf(s: Situation): { cents: Cents | null; provenance: string } {
  const h = s.house;
  const map = { hypothese: h.valeurHypothese, expertise: h.valeurExpertise, ancienne: h.valeurAncienne } as const;
  const v = map[h.sourceValeurCourante];
  const lbl = { hypothese: 'Hypothèse de travail', expertise: 'Valeur d’expertise', ancienne: 'Ancienne estimation' }[h.sourceValeurCourante];
  const cert = { approx: 'approximative', manuel: 'saisie manuelle', verifie: 'vérifiée' }[v.certainty];
  return { cents: v.cents, provenance: `${lbl} (${cert})` };
}

export const PERSON_LABEL: Record<PersonId, string> = {
  pere: 'Père', fils: 'Fils survivant', beneficiaire: 'Bénéficiaire de la part du fils prédécédé', petitFils: 'Petit-fils', filsPredecede: 'Fils prédécédé',
};

export function eventLabel(e: SimEvent): string {
  switch (e.type) {
    case 'don_bancaire': return `Don bancaire ${formatEUR(e.montant)} → ${PERSON_LABEL[e.donataire]}`;
    case 'donation_immobiliere': return `Donation immobilière ${formatFrac(e.fraction)} de la maison → ${PERSON_LABEL[e.donataire]}${e.reserveUsufruit ? ' (réserve d’usufruit)' : ''}`;
    case 'vente': return 'Vente de la maison';
    case 'cession_quote_part': return `Cession du lot ${e.lotId} : ${HOLDER_LABEL[e.de]} → ${HOLDER_LABEL[e.vers]}`;
    case 'depense': return `Dépense : ${e.label}`;
    case 'recette': return `Recette : ${e.label}`;
  }
}

export function sortEvents(events: SimEvent[]): SimEvent[] {
  return [...events].sort((a, b) => cmpISO(a.date, b.date) || a.order - b.order);
}

interface GiftRec { ev: DonBancaire; montant: Cents }
interface ImmoRec { ev: DonationImmo; base: Cents }

const PRUDENT = 'Hypothèse prudente retenue dans le détail ; la fourchette couvre les deux cas.';

/** Simule un scénario sur une situation. Fonction pure. */
export function simulate(situation: Situation, sc: Scenario): SimResult {
  const issues: Issue[] = [];
  const pending = new Set<string>();
  const add = (level: IssueLevel, message: string, ref?: string) => {
    issues.push({ level, message, ref });
    if (level !== 'info') pending.add(message);
  };
  const details: Detail[] = [];
  const ruleIds = new Set<string>();
  const house = situation.house;
  const hv = houseValueOf(situation);

  // ── Contrôles de la situation
  const lotIssues = validateLots(house.lots);
  lotIssues.forEach((i) => add('bloquant', `Lots : ${i.message}`, 'lots'));
  const lotsOk = lotIssues.length === 0;
  if (hv.cents === null) add('bloquant', 'Valeur de la maison non renseignée : résultats immobiliers indisponibles.', 'house');
  else if (hv.cents < 0) add('bloquant', 'Valeur de la maison négative.', 'house');
  if (house.valeurDecesFilsPredecede.cents === null) add('a_confirmer', 'Valeur de la maison au 07/10/2026 (décès du fils prédécédé) à confirmer — utile au dossier de succession ouvert.', 'house');
  if (house.quartResolution === 'inconnu') add('a_confirmer', 'Titulaire de la part du fils prédécédé non déterminé (testament, option successorale de la bénéficiaire).', 'quart');
  const hp = situation.horsPerimetre;
  const hors: string[] = [];
  if (hp.changementRegion) hors.push('défunt ayant changé de région fiscale');
  if (hp.indivisionLitigieuse) hors.push('indivision litigieuse');
  if (hp.chargesParticulieres) hors.push('donation avec charges particulières');
  if (hp.decesDonataireAvantDonateur) hors.push('décès du donataire avant le donateur');
  if (hp.plusValueCession) hors.push('fiscalité de cession à un tiers (plus-value)');
  hors.forEach((h) => add('validation_requise', `Hors périmètre : ${h}. Validation par le notaire requise ; montant fiscal manuel possible (mode « manuel »).`));

  let lots: Lot[] = resolveLots(house.lots, house);
  const lotsInitial = lots;
  let houseSold = false;

  // ── Trésorerie de départ (mode A)
  const flows: Flow[] = [];
  let cash: Cents | null = 0;
  let nonLiquide: Cents | null = 0;
  const assetKinds = ['compte', 'titres', 'autre_avoir'];
  for (const p of situation.postes) {
    if (assetKinds.includes(p.kind)) {
      if (p.value.cents === null) {
        add('bloquant', `Avoir « ${p.label} » non renseigné : trésorerie et masse successorale indisponibles.`, p.id);
        if (p.liquide) cash = null; else nonLiquide = null;
      } else if (p.liquide) cash = cash === null ? null : cash + p.value.cents;
      else nonLiquide = nonLiquide === null ? null : nonLiquide + p.value.cents;
    } else if (p.kind === 'prelevement') {
      if (p.value.cents === null) add('a_confirmer', `Prélèvement « ${p.label} » non renseigné : non pris en compte.`, p.id);
      else { cash = cash === null ? null : cash - p.value.cents; flows.push({ date: '', label: p.label, amount: -p.value.cents, who: 'pere' }); }
    }
  }
  const cashStart = cash;
  const cr = situation.creance;
  const soldeCreance = cr.nominal.cents === null ? null : cr.nominal.cents - cr.remboursements.reduce((a, b) => a + b, 0);
  if (cr.inclusion === 'montant_recouvre' && !cr.dejaEncaisse) {
    if (cr.recouvre.cents === null) { add('bloquant', 'Créance : montant recouvré non renseigné alors qu’il est inclus.', 'creance'); cash = null; }
    else if (soldeCreance !== null && cr.recouvre.cents > soldeCreance) add('a_confirmer', 'Créance : montant recouvré supérieur au solde indicatif.', 'creance');
  }
  if (cr.inclusion !== 'exclue' && cr.traitementFiscal === 'a_confirmer') add('a_confirmer', 'Créance incluse : traitement fiscal à valider.', 'creance');

  // ── Événements
  const events = sortEvents(sc.events);
  const timeline: TimelineRow[] = [];
  const costsToday: CostLine[] = [];
  const gifts: GiftRec[] = [];
  const immos: ImmoRec[] = [];
  let sale: SimResult['sale'] = null;
  const saleByHolder: Partial<Record<HolderId, Cents | null>> = {};
  const death = sc.deathDate && isValidISO(sc.deathDate) ? sc.deathDate : null;
  if (sc.deathDate && !death) add('bloquant', 'Date de décès simulée invalide.', 'deathDate');

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!isValidISO(e.date)) { add('bloquant', `Événement « ${eventLabel(e)} » : date invalide.`, e.id); continue; }
    const twin = events.find((o, j) => j !== i && o.date === e.date && o.order === e.order);
    if (twin && i < events.indexOf(twin)) add('a_confirmer', `Deux événements le ${formatDate(e.date)} sans ordre explicite (${eventLabel(e)} / ${eventLabel(twin)}) : précisez l’ordre.`, e.id);
    if (death && cmpISO(e.date, death) > 0) { add('info', `Événement du ${formatDate(e.date)} postérieur au décès simulé : ignoré.`, e.id); continue; }
    const effects: string[] = [];
    const row: TimelineRow = { eventId: e.id, date: e.date, order: e.order, label: eventLabel(e), effects };
    timeline.push(row);

    if (e.type === 'don_bancaire') {
      if (e.montant === null) { add('bloquant', 'Don bancaire : montant non renseigné.', e.id); cash = null; continue; }
      if (e.montant < 0) { add('bloquant', 'Don bancaire : montant négatif invalide.', e.id); continue; }
      if (e.montant === 0) { add('info', 'Don bancaire de 0 € : sans effet.', e.id); continue; }
      if (!['fils', 'petitFils'].includes(e.donataire)) add('validation_requise', 'Don hors ligne directe : barème non couvert.', e.id);
      const { profile, warnings } = resolveDonation(e.date, sc.rulesMode);
      ruleIds.add(profile.id);
      warnings.forEach((w) => add('a_confirmer', w, e.id));
      const taxed = e.statut !== 'realise_non_enregistre';
      const tax = taxed ? donationMobiliere(profile, e.montant) : 0;
      cash = cash === null ? null : cash - e.montant;
      flows.push({ date: e.date, label: 'Don bancaire versé', amount: -e.montant, who: 'pere' });
      effects.push(`Le père verse ${formatEUR(e.montant)}`);
      if (taxed) {
        costsToday.push({ eventId: e.id, date: e.date, label: `Droit de donation mobilière ${formatEUR(e.montant)}`, kind: 'fiscal', amount: tax, payer: e.droitsPayesPar, ruleId: profile.id });
        if (e.droitsPayesPar === 'pere') { cash = cash === null ? null : cash - tax; flows.push({ date: e.date, label: 'Droit de donation', amount: -tax, who: 'pere' }); }
        effects.push(`Droit de donation ${formatEUR(tax)} (${PERSON_LABEL[e.droitsPayesPar]})`);
        details.push({
          id: `don-${e.id}`, title: `Droit de donation mobilière — ${formatEUR(e.montant)} au ${formatDate(e.date)}`,
          lines: [`${formatEUR(e.montant)} × ${profile.mobilierBp / 100} % = ${formatEUR(tax)}`, `Payé par : ${PERSON_LABEL[e.droitsPayesPar]}`, `Statut : ${e.statut === 'prevu' ? 'prévu (enregistrement à réaliser)' : 'enregistrement confirmé'}`],
          rule: { id: profile.id, label: profile.label, statut: STATUS_LABEL[profile.statut] }, sources: profile.sources,
          hypotheses: ['L’exemption au décès suppose un enregistrement effectif ; une intention ou une demande n’est pas une preuve.'],
          rounding: 'Arrondi unique au centime, demi-centime vers le haut.',
        });
        if (e.statut === 'prevu') add('a_confirmer', `Don du ${formatDate(e.date)} : enregistrement seulement prévu — preuve d’enregistrement requise pour l’exemption au décès.`, e.id);
        if (e.statut === 'enregistrement_confirme' && !e.dateEnregistrement) add('a_confirmer', `Don du ${formatDate(e.date)} : date d’enregistrement non renseignée.`, e.id);
        if (e.dateEnregistrement && e.dateEnregistrement !== e.date) add('a_confirmer', `Don du ${formatDate(e.date)} enregistré le ${formatDate(e.dateEnregistrement)} : effets d’un enregistrement distinct/tardif à confirmer.`, e.id);
      } else effects.push('Pas de droit de donation immédiat (non enregistré)');
      if (e.fraisEnregistrement.cents === null) add('a_confirmer', 'Frais d’enregistrement du don non renseignés.', e.id);
      else if (e.fraisEnregistrement.cents > 0 && taxed) costsToday.push({ eventId: e.id, date: e.date, label: 'Frais d’enregistrement', kind: 'frais', amount: e.fraisEnregistrement.cents, payer: e.droitsPayesPar });
      if (taxed && e.fraisEnregistrement.cents === null) costsToday.push({ eventId: e.id, date: e.date, label: 'Frais d’enregistrement', kind: 'frais', amount: null, payer: e.droitsPayesPar });
      gifts.push({ ev: e, montant: e.montant });
    }

    if (e.type === 'donation_immobiliere') {
      if (houseSold) { add('bloquant', 'Donation immobilière après la vente de la maison : impossible.', e.id); continue; }
      if (!lotsOk) continue;
      const val = e.valeurBien ?? hv.cents;
      const prov = e.valeurBien !== null ? 'valeur saisie à la date de l’acte' : hv.provenance;
      const r = applyDonation(lots, 'pere', e.donataire, e.fraction, e.reserveUsufruit, e.id.slice(-4));
      if (r.error) { add('bloquant', `Donation immobilière : ${r.error}`, e.id); continue; }
      lots = r.lots;
      effects.push(`Lots modifiés : ${formatFrac(e.fraction)} de la maison ${e.reserveUsufruit ? 'en nue-propriété au donataire, usufruit réservé au père' : 'en pleine propriété au donataire'}`);
      if (val === null) { add('bloquant', 'Donation immobilière : valeur du bien inconnue — droits non calculables.', e.id); costsToday.push({ eventId: e.id, date: e.date, label: 'Droits de donation immobilière', kind: 'fiscal', amount: null, payer: e.droitsPayesPar }); continue; }
      const base = mulCents(val, e.fraction);
      const { profile, warnings } = resolveDonation(e.date, sc.rulesMode);
      ruleIds.add(profile.id);
      warnings.forEach((w) => add('a_confirmer', w, e.id));
      const prev = immos.filter((x) => x.ev.donataire === e.donataire).reduce((a, x) => a + x.base, 0);
      if (prev > 0) add('a_confirmer', 'Plusieurs donations immobilières au même donataire : cumul dans le barème appliqué à titre indicatif, règle à vérifier.', e.id);
      const { droits, slices } = donationImmobiliere(profile, base, prev);
      immos.push({ ev: e, base });
      costsToday.push({ eventId: e.id, date: e.date, label: `Droits de donation immobilière (base ${formatEUR(base)})`, kind: 'fiscal', amount: droits, payer: e.droitsPayesPar, ruleId: profile.id });
      costsToday.push({ eventId: e.id, date: e.date, label: 'Frais d’acte (devis notaire)', kind: 'frais', amount: e.fraisActe.cents, payer: e.fraisPayesPar });
      if (e.fraisActe.cents === null) add('a_confirmer', 'Frais d’acte de la donation immobilière non renseignés (pas un zéro implicite) : total frais compris incomplet.', e.id);
      if (e.droitsPayesPar === 'pere') { cash = cash === null ? null : cash - droits; flows.push({ date: e.date, label: 'Droits de donation immobilière', amount: -droits, who: 'pere' }); }
      if (e.fraisPayesPar === 'pere') { cash = cash === null || e.fraisActe.cents === null ? null : cash - e.fraisActe.cents; flows.push({ date: e.date, label: 'Frais d’acte', amount: e.fraisActe.cents === null ? null : -e.fraisActe.cents, who: 'pere' }); }
      effects.push(`Droits ${formatEUR(droits)} sur une base de ${formatEUR(base)}`);
      details.push({
        id: `immo-${e.id}`, title: `Donation immobilière du ${formatDate(e.date)} — droits d’enregistrement`,
        lines: [
          `Valeur du bien : ${formatEUR(val)} (${prov})`,
          `Base = ${formatEUR(val)} × ${formatFrac(e.fraction)} = ${formatEUR(base)}${e.reserveUsufruit ? ' (valeur de la pleine propriété du lot donné, usufruit réservé)' : ''}`,
          prev > 0 ? `Placement après ${formatEUR(prev)} de donations immobilières antérieures (cumul à vérifier)` : 'Aucune donation immobilière antérieure pertinente saisie',
          `Droits = ${formatEUR(droits)} ; frais d’acte : ${formatEUR(e.fraisActe.cents)}`,
        ],
        slices, slicesLabel: 'Barème donation immobilière', rule: { id: profile.id, label: profile.label, statut: STATUS_LABEL[profile.statut] }, sources: profile.sources,
        hypotheses: profile.notes, rounding: 'Produit exact par tranche, arrondi unique au centime.',
      });
    }

    if (e.type === 'vente') {
      if (houseSold) { add('bloquant', 'Deuxième vente de la maison : impossible.', e.id); continue; }
      if (!lotsOk) continue;
      const prix = e.prix ?? hv.cents;
      const sr = splitSale(lots, e, prix);
      sale = { ...sr, eventId: e.id };
      sr.warnings.forEach((w) => add('a_confirmer', `Vente : ${w}`, e.id));
      sr.reasons.forEach((w) => add('bloquant', `Vente : ${w}`, e.id));
      add('info', 'Vente : fiscalité de la cession à un tiers (éventuelle plus-value) hors périmètre.', e.id);
      houseSold = true;
      lots = [];
      costsToday.push({ eventId: e.id, date: e.date, label: 'Frais de vente', kind: 'frais', amount: e.frais.cents, payer: e.fraisRepartition === 'prorata' ? 'succession' : e.fraisRepartition });
      if (sr.status === 'calcule') {
        for (const [h, amt] of Object.entries(sr.byHolder) as [HolderId, Cents][]) saleByHolder[h] = amt;
        const pere = sr.byHolder.pere ?? 0;
        cash = cash === null ? null : cash + pere;
        flows.push({ date: e.date, label: 'Part du prix de vente', amount: pere, who: 'pere' });
        effects.push(...(Object.entries(sr.byHolder) as [HolderId, Cents][]).map(([h, a]) => `${HOLDER_LABEL[h]} : ${formatEUR(a)}`));
      } else {
        cash = null;
        for (const h of ['pere', 'fils', 'beneficiaire', 'quart', 'petitFils'] as HolderId[]) saleByHolder[h] = null;
        effects.push('Ventilation non disponible (coefficient d’usufruit ou prix manquant)');
      }
    }

    if (e.type === 'cession_quote_part') {
      add('info', 'Cession/rachat : aucun droit (partage, vente, donation) appliqué automatiquement — à chiffrer par le notaire.', e.id);
      if (e.statut !== 'confirme_notaire') { add('a_confirmer', `Cession du lot ${e.lotId} non confirmée : non appliquée aux droits.`, e.id); effects.push('Non appliquée (hypothèse)'); continue; }
      if (houseSold) { add('bloquant', 'Cession après la vente de la maison.', e.id); continue; }
      const r = applyCession(lots, e.lotId, e.de, e.vers);
      if (r.error) { add('bloquant', `Cession : ${r.error}`, e.id); continue; }
      lots = r.lots;
      effects.push('Droits du lot transférés');
      if (e.prix === null) add('a_confirmer', 'Cession : prix non renseigné.', e.id);
      if (e.vers === 'pere') cash = cash === null || e.prix === null ? null : cash - e.prix;
      if (e.de === 'pere') cash = cash === null || e.prix === null ? null : cash + e.prix;
      costsToday.push({ eventId: e.id, date: e.date, label: 'Frais de cession', kind: 'frais', amount: e.frais.cents, payer: e.vers });
    }

    if (e.type === 'depense' || e.type === 'recette') {
      if (e.montant === null) { add('bloquant', `${e.type === 'depense' ? 'Dépense' : 'Recette'} « ${e.label} » : montant non renseigné.`, e.id); cash = null; continue; }
      if (e.montant < 0) { add('bloquant', 'Montant négatif : utilisez le type dépense ou recette.', e.id); continue; }
      const s = e.type === 'depense' ? -1 : 1;
      cash = cash === null ? null : cash + s * e.montant;
      flows.push({ date: e.date, label: e.label, amount: s * e.montant, who: 'pere' });
      effects.push(`${s < 0 ? '−' : '+'}${formatEUR(e.montant)} pour le père`);
    }
  }

  // Créance recouvrée en espèces
  if (cr.inclusion === 'montant_recouvre' && !cr.dejaEncaisse && cr.recouvre.cents !== null) {
    cash = cash === null ? null : cash + cr.recouvre.cents;
    flows.push({ date: cr.dateRecouvrement ?? '', label: 'Créance recouvrée', amount: cr.recouvre.cents, who: 'pere' });
  }
  if (cash !== null && cash < 0) add('a_confirmer', `Trésorerie du père négative après les événements (${formatEUR(cash)}) : scénario non finançable tel quel.`);
  const afterEvents = cash;
  const lotsAvantDeces = lots;

  // ── Décès simulé
  const hvDeath = sc.valeurMaisonDeces !== null ? { cents: sc.valeurMaisonDeces, provenance: 'valeur saisie au décès' } : { cents: hv.cents, provenance: `${hv.provenance} — héritée` };
  const deathRes: SimResult['death'] = { simulated: !!death, profile: null, warnings: [], rows: [], total: unavailable('Décès non simulé'), toggles: [] };
  const estateLines: SimResult['estate']['lines'] = [];
  let masse: Cents | null = null;
  let legsTotal: Cents | null = 0;
  let residuel: Cents | null = null;
  let lotsApres: Lot[] | null = null;
  let cashAtDeath: Cents | null = null;
  let heirCashInherited: Cents | null = null;
  const legsEff: { id: string; benef: PersonId; montant: Cents | null; charge: 'legataire' | 'heritier' }[] = [];

  if (death) {
    lotsApres = lotsOk ? applyDeath(lotsAvantDeces, 'pere', 'fils').lots : null;
    const pereHousePP = lotsOk ? ppOf(lotsAvantDeces, 'pere') : null;
    const housePart = pereHousePP === null ? null : pereHousePP.n === 0 ? 0 : hvDeath.cents === null ? null : mulCents(hvDeath.cents, pereHousePP);
    if (housePart === null && pereHousePP && pereHousePP.n > 0) add('bloquant', 'Valeur de la maison au décès inconnue : masse successorale indisponible.');
    cashAtDeath = situation.bilanMode === 'B' ? situation.soldeAuDecesB.cents : afterEvents;
    if (situation.bilanMode === 'B') {
      add('info', 'Mode B : le solde au décès est déjà net des donations et flux — rien n’est retiré une seconde fois.');
      if (situation.soldeAuDecesB.cents === null) add('bloquant', 'Mode B : solde au décès non renseigné.');
    }
    estateLines.push({ label: situation.bilanMode === 'B' ? 'Avoirs financiers au décès (mode B, saisi)' : 'Avoirs liquides après événements (mode A)', amount: cashAtDeath });
    if (situation.bilanMode === 'A' && nonLiquide) estateLines.push({ label: 'Autres avoirs non liquides', amount: nonLiquide });
    let creanceActif: Cents | null = 0;
    if (cr.inclusion === 'solde_nominal') { creanceActif = soldeCreance; estateLines.push({ label: 'Créance (solde nominal indicatif, non liquide)', amount: soldeCreance, note: 'Solde nominal ≠ montant recouvré' }); }
    if (cr.inclusion === 'montant_recouvre') estateLines.push({ label: 'Créance recouvrée', amount: cr.dejaEncaisse ? 0 : cr.recouvre.cents, note: cr.dejaEncaisse ? 'déjà comprise dans les comptes — pas comptée deux fois' : 'ajoutée en liquidités' });
    estateLines.push({ label: `Maison : part du père en pleine propriété (${pereHousePP ? formatFrac(pereHousePP) : '?'})`, amount: housePart, note: 'L’usufruit qui s’éteint n’entre pas dans la masse ; un lot déjà donné non plus.' });

    // Déductions fiscales
    let deductions: Cents | null = 0;
    let fraisNonDeductibles: Cents = 0;
    for (const p of situation.postes) {
      if (!['dette', 'frais_funeraires', 'autres_frais'].includes(p.kind)) continue;
      if (p.value.cents === null) { add('a_confirmer', `« ${p.label} » non renseigné : non déduit.`, p.id); continue; }
      if (p.deductible === 'oui') { deductions = deductions === null ? null : deductions + p.value.cents; estateLines.push({ label: `− ${p.label} (déductible)`, amount: -p.value.cents }); }
      else {
        fraisNonDeductibles += p.value.cents;
        if (p.deductible === 'a_confirmer') add('a_confirmer', `« ${p.label} » : déductibilité à confirmer — non déduit de la base fiscale, payé en trésorerie.`, p.id);
        estateLines.push({ label: `${p.label} (trésorerie, non déduit)`, amount: -p.value.cents });
      }
    }
    const nl = situation.bilanMode === 'A' ? nonLiquide : 0;
    masse = cashAtDeath === null || nl === null || creanceActif === null || housePart === null || deductions === null ? null : cashAtDeath + nl + creanceActif + housePart - deductions;

    // Legs
    for (const l of sc.legs.filter((x) => x.actif)) {
      const giftsTo = gifts.filter((g) => g.ev.donataire === l.beneficiaire).reduce((a, g) => a + g.montant, 0);
      let montant = l.montant;
      if (montant === null) add('bloquant', 'Legs : montant non renseigné.', l.id);
      if (giftsTo > 0 && l.imputation === 'aucune') add('a_confirmer', `Risque de double versement : don de ${formatEUR(giftsTo)} et legs de ${formatEUR(l.montant)} au même bénéficiaire sans clause d’imputation confirmée. Le legs n’est pas annulé automatiquement.`, l.id);
      if (giftsTo > 0 && l.imputation === 'imputation_confirmee' && montant !== null) { montant = Math.max(0, montant - giftsTo); add('info', `Imputation confirmée : legs réduit à ${formatEUR(montant)}.`, l.id); }
      if (!['petitFils', 'fils'].includes(l.beneficiaire)) add('validation_requise', 'Legs à une personne hors ligne directe : barème non couvert.', l.id);
      legsEff.push({ id: l.id, benef: l.beneficiaire, montant, charge: l.droitsACharge });
      legsTotal = legsTotal === null || montant === null ? null : legsTotal + montant;
    }
    if (legsTotal) estateLines.push({ label: 'Legs (délivrés par l’héritier, déduits de sa part)', amount: -legsTotal });
    residuel = masse === null || legsTotal === null ? null : masse - legsTotal;
    if (residuel !== null && residuel < 0) add('bloquant', 'Les legs dépassent la masse successorale.');
    heirCashInherited = cashAtDeath === null || legsTotal === null ? null : cashAtDeath - legsTotal - fraisNonDeductibles - (deductions ?? 0);

    // Profil successoral
    const res = resolveSuccession(death, sc.rulesMode);
    if (res.ok) { deathRes.profile = res.profile; deathRes.warnings = res.warnings; ruleIds.add(res.profile.id); res.warnings.forEach((w) => add('a_confirmer', w)); }
    else { deathRes.reason = res.reason; ruleIds.add(sc.rulesMode === 'manuel' ? 'MANUEL' : 'PROJECTION-NON-DISPONIBLE'); if (sc.rulesMode !== 'manuel') add('a_confirmer', res.reason); }

    // Variantes d'hypothèses non tranchées
    const toggles: Toggle[] = [];
    const homeInEstate = housePart !== null && housePart > 0 && !houseSold;
    let homeMode: 'oui' | 'non' | 'toggle' = 'non';
    if (homeInEstate) {
      const el = house.logementEligibilite;
      homeMode = el === 'eligible_confirme' ? 'oui' : el === 'hypothese_eligible' ? 'oui' : el === 'non_eligible' ? 'non' : 'toggle';
      if (el === 'hypothese_eligible') add('a_confirmer', 'Taux réduit logement familial appliqué par HYPOTHÈSE : éligibilité à confirmer (l’ancienneté d’occupation ne suffit pas à la garantir).', 'logement');
      if (homeMode === 'toggle') toggles.push({ key: 'home', label: 'Éligibilité au taux réduit logement inconnue' });
      if (house.logementSituation === 'demenagement_volontaire') add('a_confirmer', 'Déménagement volontaire du père : maintien du taux réduit logement à vérifier.', 'logement');
      if (house.logementSituation === 'depart_justifie') add('a_confirmer', 'Départ justifié (soins, hébergement) : maintien du taux réduit logement à vérifier.', 'logement');
    }
    // Rappel des dons non enregistrés
    const prof = res.ok ? res.profile : null;
    const giftModes = gifts.map((g) => {
      const e = g.ev;
      const ans = prof ? (cmpISO(e.date, prof.rappel.avantDate) < 0 ? prof.rappel.ansAvant : prof.rappel.ans) : 5;
      const w = withinYears(e.date, death, ans);
      const registeredOk = e.statut !== 'realise_non_enregistre';
      let mode: 'exempt' | 'rappel' | 'toggle' = 'exempt';
      if (registeredOk) {
        if (e.statut === 'enregistrement_confirme' && e.dateEnregistrement && cmpISO(e.dateEnregistrement, death) > 0) {
          mode = w.status === 'hors_delai' ? 'exempt' : 'toggle';
          add('a_confirmer', `Don du ${formatDate(e.date)} : enregistrement daté après le décès — effet à confirmer.`, e.id);
        }
      } else if (w.status === 'dans_le_delai') mode = 'rappel';
      else if (w.status === 'a_confirmer') { mode = 'toggle'; add('a_confirmer', `Don du ${formatDate(e.date)} : ${w.reason} (délai de ${ans} ans, anniversaire ${formatDate(w.anniversary)}).`, e.id); }
      if (!registeredOk) add('info', `Don non enregistré du ${formatDate(e.date)} : délai de rappel de ${ans} ans, fin au ${formatDate(w.anniversary)} → ${w.status === 'dans_le_delai' ? 'rappelé' : w.status === 'hors_delai' ? 'hors rappel' : 'à confirmer'}.`, e.id);
      if (mode !== 'exempt' && e.donataire === 'petitFils') add('a_confirmer', 'Rappel d’un don au petit-fils (non héritier légal) : traitement à vérifier ou à saisir manuellement.', e.id);
      if (mode === 'toggle') toggles.push({ key: `gift:${e.id}`, label: `Rappel du don du ${formatDate(e.date)}` });
      return { g, mode, ans, w };
    });
    // Réserve de progressivité immobilière
    const immoModes = immos.map((im) => {
      const n = prof?.reserveProgressivite.ans ?? 3;
      const w = withinYears(im.ev.date, death, n);
      let mode: 'oui' | 'non' | 'toggle' = 'non';
      if (w.status !== 'hors_delai') {
        if (sc.reserveProgressivite === 'appliquer') mode = w.status === 'a_confirmer' ? 'toggle' : 'oui';
        else if (sc.reserveProgressivite === 'inconnu') mode = 'toggle';
        if (sc.reserveProgressivite !== 'ne_pas_appliquer') add('a_confirmer', `Donation immobilière du ${formatDate(im.ev.date)} dans les ${n} ans du décès (fin ${formatDate(w.anniversary)}) : réserve de progressivité non trouvée dans les sources consultées${w.status === 'a_confirmer' ? ` ; ${w.reason}` : ''}.`, im.ev.id);
      }
      if (mode === 'toggle') toggles.push({ key: `immo:${im.ev.id}`, label: `Réserve de progressivité — donation du ${formatDate(im.ev.date)}` });
      return { im, mode, w };
    });
    deathRes.toggles = toggles;

    const heirs: PersonId[] = situation.persons.filter((p) => p.heritierLegal === 'presume' || p.heritierLegal === 'a_confirmer').map((p) => p.id);
    const heir: PersonId = heirs.includes('fils') ? 'fils' : heirs[0] ?? 'fils';
    if (situation.persons.find((p) => p.id === heir)?.heritierLegal === 'a_confirmer') add('a_confirmer', 'Qualité d’héritier légal à confirmer (testament, situation au décès).');

    const buildInputs = (combo: Record<string, boolean>): BenefTaxInput[] | null => {
      if (residuel === null) return null;
      const applyHome = homeMode === 'oui' || (homeMode === 'toggle' && combo.home);
      const rappelOf = (pid: PersonId) => giftModes.filter((x) => x.g.ev.donataire === pid && (x.mode === 'rappel' || (x.mode === 'toggle' && combo[`gift:${x.g.ev.id}`]))).reduce((a, x) => a + x.g.montant, 0);
      const reserveOf = (pid: PersonId) => immoModes.filter((x) => x.im.ev.donataire === pid && (x.mode === 'oui' || (x.mode === 'toggle' && combo[`immo:${x.im.ev.id}`]))).reduce((a, x) => a + x.im.base, 0);
      const hp2 = housePart ?? 0;
      const otherNet = residuel - hp2;
      const partLogement = applyHome ? Math.max(0, hp2 + Math.min(0, otherNet)) : 0;
      const partAutre = applyHome ? Math.max(0, otherNet) : residuel;
      const inputs: BenefTaxInput[] = [{ id: heir, partLogement, partAutre, rappel: rappelOf(heir), baseReserve: reserveOf(heir), abattementEligible: true }];
      const legatees = new Set<PersonId>([...legsEff.map((l) => l.benef), ...gifts.map((g) => g.ev.donataire)]);
      legatees.delete(heir);
      for (const pid of legatees) {
        const legs = legsEff.filter((l) => l.benef === pid).reduce((a, l) => a + (l.montant ?? 0), 0);
        inputs.push({ id: pid, partLogement: 0, partAutre: legs, rappel: rappelOf(pid), baseReserve: reserveOf(pid), abattementEligible: sc.abattementLegataire === 'oui_confirme' });
      }
      return inputs;
    };

    const keys = toggles.map((t) => t.key);
    const combos: Record<string, boolean>[] = [];
    const nCombos = Math.min(1 << keys.length, 64);
    for (let m = 0; m < nCombos; m++) combos.push(Object.fromEntries(keys.map((k, i) => [k, !!(m & (1 << i))])));
    // Combinaison prudente (affichée en détail) : logement non éligible, rappel, réserve appliquée.
    const prudent: Record<string, boolean> = Object.fromEntries(keys.map((k) => [k, k !== 'home']));

    const evalCombo = (combo: Record<string, boolean>) => {
      const inputs = buildInputs(combo);
      if (!inputs || !prof) return null;
      return inputs.map((inp) => ({ inp, r: computeBeneficiaryTax(prof, inp) }));
    };

    if (sc.rulesMode === 'manuel') {
      const inputs = buildInputs(prudent) ?? [];
      deathRes.rows = inputs.map((inp) => {
        const m = sc.manualDeathTax[inp.id as PersonId] ?? null;
        return { id: inp.id as PersonId, label: PERSON_LABEL[inp.id as PersonId], input: inp, result: null, manual: m, droits: m === null ? unavailable('Montant manuel non saisi') : exact(m, 'manuel', ['Montant saisi manuellement']), payePar: inp.id as PersonId };
      });
      deathRes.total = deathRes.rows.length ? sumNums(deathRes.rows.map((r) => r.droits)) : unavailable('Masse successorale indisponible');
      if (deathRes.rows.length) deathRes.total = { ...deathRes.total, status: deathRes.total.value !== null ? 'manuel' : deathRes.total.status };
    } else if (!prof) {
      deathRes.total = unavailable(deathRes.reason ?? 'Profil indisponible');
      const inputs = buildInputs(prudent) ?? [];
      deathRes.rows = inputs.map((inp) => ({ id: inp.id as PersonId, label: PERSON_LABEL[inp.id as PersonId], input: inp, result: null, manual: null, droits: unavailable('Projection non disponible'), payePar: inp.id as PersonId }));
    } else if (residuel === null) {
      deathRes.total = unavailable('Masse successorale indisponible (valeur manquante).');
    } else {
      const all = combos.map(evalCombo);
      const main = evalCombo(prudent)!;
      deathRes.rows = main.map(({ inp, r }) => {
        const vals = all.map((c) => { const x = c!.find((y) => y.inp.id === inp.id)!; return { value: x.r.droits, upper: x.r.avantAbattement }; });
        const legsCharge = legsEff.find((l) => l.benef === inp.id)?.charge ?? 'legataire';
        return { id: inp.id as PersonId, label: PERSON_LABEL[inp.id as PersonId], input: inp, result: r, manual: null, droits: rangeOf(vals, r.notes), payePar: legsCharge === 'heritier' ? heir : (inp.id as PersonId) };
      });
      const totals = all.map((c) => {
        const anyNull = c!.some((x) => x.r.droits === null);
        return { value: anyNull ? null : c!.reduce((a, x) => a + x.r.droits!, 0), upper: c!.reduce((a, x) => a + (x.r.droits ?? x.r.avantAbattement), 0) };
      });
      deathRes.total = rangeOf(totals, toggles.length ? [PRUDENT] : []);
      if (hors.length && deathRes.total.status === 'calcule') deathRes.total = { ...deathRes.total, status: 'a_confirmer', notes: [...deathRes.total.notes, 'Hors périmètre : validation requise.'] };
      for (const { inp, r } of main) {
        details.push({
          id: `succ-${inp.id}`, title: `Droits de succession — ${PERSON_LABEL[inp.id as PersonId]} (décès simulé le ${formatDate(death)})`,
          lines: [
            `Part nette recueillie : ${formatEUR(r.partNette)} (logement au taux réduit ${formatEUR(inp.partLogement)} ; autres biens ${formatEUR(inp.partAutre)} ; dons rappelés ${formatEUR(inp.rappel)})`,
            inp.baseReserve ? `Base de placement (réserve de progressivité, hypothèse) : ${formatEUR(inp.baseReserve)} — non héritée, non taxée à nouveau` : 'Aucune base de réserve de progressivité',
            `Barème ordinaire placé à partir de ${formatEUR(r.ordinaireOffset)}`,
            `Sous-total avant exemption : ${formatEUR(r.avantAbattement)}`,
            `Exemption : ${formatEUR(r.abattementMontant)} sur les tranches les plus basses → réduction ${r.abattementReduction === null ? 'à confirmer' : formatEUR(r.abattementReduction)}`,
            `Droits : ${r.droits === null ? 'à confirmer (voir sous-total)' : formatEUR(r.droits)}`,
            toggles.length ? PRUDENT : '',
          ].filter(Boolean),
          slices: r.ordinaireSlices, slicesLabel: 'Barème ordinaire',
          extraSlices: [{ label: 'Taux réduit logement familial', slices: r.logementSlices }, { label: 'Tranches couvertes par l’exemption', slices: r.abattementSlices }],
          rule: { id: prof.id, label: prof.label, statut: STATUS_LABEL[prof.statut] }, sources: prof.sources,
          hypotheses: [...r.notes, ...prof.notes], rounding: 'Produit exact par tranche, arrondi unique au centime après exemption.',
        });
      }
    }
    if (death && lotsApres) {
      details.push({ id: 'rights-death', title: 'Droits sur la maison après le décès simulé', lines: lotsApres.map((l) => `${l.id} — ${formatFrac(l.share)} : ${l.pp ? `PP ${HOLDER_LABEL[l.pp]}` : `NP ${HOLDER_LABEL[l.np!]} / US ${HOLDER_LABEL[l.us!]}`}`), hypotheses: ['L’extinction de l’usufruit ne déclenche ni frais ni droits de succession (notaire.be).', 'La nue-propriété déjà détenue par le fils n’est pas héritée une deuxième fois.'] });
    }
  }

  // ── Totaux
  const fiscalLines = costsToday.filter((c) => c.kind === 'fiscal');
  const fraisLines = costsToday.filter((c) => c.kind === 'frais');
  const lineNum = (c: CostLine): Num => (c.amount === null ? { value: null, status: 'partiel', notes: [c.label + ' non renseigné'] } : exact(c.amount));
  const fiscalToday = fiscalLines.length ? sumNums(fiscalLines.map(lineNum)) : exact(0);
  const fiscalDeath = death ? deathRes.total : exact(0, 'calcule', ['Pas de décès simulé']);
  const fiscalTotal = addNum(fiscalToday, fiscalDeath);
  const fraisNonFiscaux = fraisLines.length ? sumNums(fraisLines.map(lineNum)) : exact(0);
  const totalFraisCompris = addNum(fiscalTotal, fraisNonFiscaux);

  // ── Bénéficiaires
  const taxPaid = (pid: PersonId | HolderId): Num => {
    const today = fiscalLines.filter((c) => c.payer === pid).map(lineNum);
    const dt = deathRes.rows.filter((r) => r.payePar === pid).map((r) => r.droits);
    return sumNums([...today, ...dt]);
  };
  const fraisPaid = (pid: PersonId | HolderId) => {
    const ls = fraisLines.filter((c) => c.payer === pid);
    return { sum: ls.reduce((a, c) => a + (c.amount ?? 0), 0), incomplete: ls.some((c) => c.amount === null) };
  };
  const ids: (PersonId | HolderId)[] = ['pere', 'fils', 'petitFils', 'beneficiaire', 'quart'];
  const beneficiaries: BeneficiaryRow[] = ids.map((id) => {
    const giftsCash = gifts.filter((g) => g.ev.donataire === id).reduce((a, g) => a + g.montant, 0);
    const giftsImmo = immos.filter((x) => x.ev.donataire === id);
    const recuVivant = id === 'pere' ? null : giftsCash + giftsImmo.reduce((a, x) => a + x.base, 0);
    let recuDeces: Cents | null = 0;
    if (death && id !== 'pere') {
      if (id === 'fils') recuDeces = residuel;
      else recuDeces = legsEff.filter((l) => l.benef === id).reduce<Cents | null>((a, l) => (a === null || l.montant === null ? null : a + l.montant), 0);
    }
    const produitVente = saleByHolder[id as HolderId] === undefined ? 0 : saleByHolder[id as HolderId] ?? null;
    const impots = taxPaid(id);
    const fp = fraisPaid(id);
    const gross: Num = recuVivant === null || recuDeces === null ? (id === 'pere' ? exact(0) : unavailable('Montant reçu inconnu')) : exact(recuVivant + recuDeces);
    let net = addNum(gross, { ...impots, value: impots.value === null ? null : -impots.value, lo: impots.hi !== undefined ? -impots.hi : undefined, hi: impots.lo !== undefined ? -impots.lo : undefined });
    net = addNum(net, exact(-fp.sum));
    if (fp.incomplete && net.value !== null) net = { value: null, lo: undefined, hi: net.value, status: 'partiel', notes: [...net.notes, 'Frais non renseignés'] };
    let liq: Cents | null = null;
    let canPay: boolean | null = null;
    if (death && id === 'fils') {
      liq = heirCashInherited;
      const dt = deathRes.rows.filter((r) => r.payePar === 'fils').map((r) => r.droits);
      const t = sumNums(dt);
      const tmax = t.value ?? t.hi ?? null;
      canPay = liq === null || tmax === null ? null : liq >= tmax;
      if (canPay === false) add('a_confirmer', 'Le fils ne peut pas payer les droits de succession avec les seules liquidités héritées : vente ou fonds propres nécessaires.');
    }
    if (death && id !== 'fils' && id !== 'pere') {
      liq = recuDeces;
      const t = sumNums(deathRes.rows.filter((r) => r.payePar === id).map((r) => r.droits));
      const tmax = t.value ?? t.hi ?? null;
      canPay = liq === null || tmax === null || (liq === 0 && tmax === 0) ? null : liq >= tmax;
    }
    return { id, label: id === 'quart' ? HOLDER_LABEL.quart : PERSON_LABEL[id as PersonId], recuVivant, recuDeces, produitVente, impots, frais: fp.sum, fraisIncomplets: fp.incomplete, net: id === 'pere' ? exact(0) : net, liquiditesDeces: liq, peutPayerSansVendre: canPay };
  }).filter((b) => b.id === 'pere' || b.id === 'fils' || (b.recuVivant ?? 0) !== 0 || (b.recuDeces ?? 0) !== 0 || b.produitVente !== 0 || b.impots.value !== 0);

  const budget = computeBudget(situation.budget, afterEvents);
  if (budget.ecartReserve !== null && budget.ecartReserve < 0) add('a_confirmer', `Réserve du père insuffisante : écart ${formatEUR(budget.ecartReserve)}.`);

  details.unshift({
    id: 'estate', title: 'Composition de la masse au décès simulé',
    lines: death ? [...estateLines.map((l) => `${l.label} : ${formatEUR(l.amount)}${l.note ? ` — ${l.note}` : ''}`), `Masse nette : ${formatEUR(masse)}`, `Part résiduelle de l’héritier : ${formatEUR(residuel)}`] : ['Aucun décès simulé'],
    hypotheses: [`Mode de bilan ${situation.bilanMode}`, cr.inclusion === 'exclue' ? 'Créance exclue des avoirs (par défaut)' : `Créance : ${cr.inclusion}`],
  });

  return {
    scenarioId: sc.id, name: sc.name, issues, timeline, houseValue: hv, houseValueAtDeath: hvDeath,
    lotsInitial, lotsAvantDeces, lotsApresDeces: lotsApres, houseSold, sale, costsToday, flows,
    cash: { mode: situation.bilanMode, start: cashStart, afterEvents, atDeath: cashAtDeath, nonLiquide },
    estate: { lines: estateLines, masse, legsTotal, residuelHeritier: residuel },
    death: deathRes, budget,
    totals: { fiscalToday, fiscalDeath, fiscalTotal, fraisNonFiscaux, totalFraisCompris },
    beneficiaries, details, ruleIds: [...ruleIds], pending: [...pending],
  };
}


/** Référence recalculée aux MÊMES hypothèses et à la MÊME date que la variante. */
export function alignedReference(sc: Scenario): Scenario {
  return { ...sc, id: `ref-${sc.id}`, name: `Référence alignée (${sc.name})`, templateId: 'reference', events: [], legs: [], snapshot: null };
}

export function simulateAll(state: AppState) {
  return state.scenarios.map((s) => ({ sc: s, res: simulate(state.situation, s), ref: simulate(state.situation, alignedReference(s)) }));
}
