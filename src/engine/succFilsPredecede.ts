import type { EpargnePensionBeneficiaire, Existence, Situation, SuccessionFilsPredecede, Value } from '../model/types';
import { allocate, applyRateBp, formatEUR, type Cents } from '../util/money';
import { formatPct, mulCents, sum, type Frac } from '../util/fraction';
import { formatDate } from '../util/dates';
import { PARTS_RENONCIATION } from '../domain/rights';
import { computeBeneficiaryTax, type BenefTaxResult } from '../tax/succession';
import { DON_ACTUEL, resolveSuccession, SOURCES, SUCC_AUTRES_PERSONNES, SUCC_FRERES_SOEURS, type RuleSource, type SuccessionProfile } from '../tax/rules';
import { exact, type Num } from './num';
import { houseValueOf } from './simulate';

/**
 * Droits de succession dus sur la SUCCESSION DU FILS PRÉDÉCÉDÉ (et non celle du père), selon que
 * la bénéficiaire (cohabitante légale, légataire par testament) accepte ou renonce.
 *
 * Périmètre : la part de la maison détenue par le fils prédécédé + un total « autres biens nets »
 * saisi (négatif si les dettes dépassent les avoirs), supposés suivre la même dévolution.
 * Assurance groupe / vie versée à la bénéficiaire : hors succession, ajoutée à sa part taxable
 * (art. 8 C. succ., à confirmer) ; conservée et taxée seule si elle renonce. Pas de logement familial (maison non affectée à la
 * résidence commune), pas de donation antérieure, pas de réserve de progressivité.
 *
 * Hypothèses non tranchées → toutes les combinaisons sont calculées (fourchette) :
 *  - base de la nue-propriété : valeur de la pleine propriété ou valeur de la nue-propriété ;
 *  - exemption supplémentaire de 12 500 € pour la cohabitante (écrite pour la ligne directe seulement).
 * Renonciation : plancher « pas moins que le renonçant » (art. 68 C. succ., non lu dans les sources
 * consultées) appliqué au total des héritiers, non réparti entre eux.
 *
 * Assurance versée au FILS SURVIVANT (T13) : hors succession, taxée au barème entre frères et sœurs
 * (art. 8, à confirmer) — seule si la bénéficiaire accepte, ajoutée à ses 3/4 si elle renonce.
 * `transmission` compare ensuite les façons de faire passer ce capital à la bénéficiaire.
 */

export type SfpWho = 'beneficiaire' | 'pere' | 'fils';
export type SfpKey = 'acceptation' | 'renonciation';

export interface SfpRow {
  id: SfpWho;
  /** Lien et barème appliqué, en clair. */
  bareme: string;
  /** Part nette taxable (fourchette selon la base de la nue-propriété). */
  part: Num;
  droits: Num;
  /** Droits dans l'hypothèse prudente (toujours chiffrés, même si la fourchette est incomplète). */
  prudent: Cents | null;
  /** Détail de l'hypothèse prudente (base la plus haute, sans supplément d'exemption). */
  detail: BenefTaxResult | null;
  manual: Cents | null;
}

export interface SfpScenario {
  key: SfpKey;
  titre: string;
  disponible: boolean;
  raison?: string;
  rows: SfpRow[];
  total: Num;
  totalPrudent: Cents | null;
  /** Le plancher de l'art. 68 relève le total dans au moins une hypothèse. */
  plancherApplique: boolean;
  notes: string[];
  /** Option retenue dans l'onglet Situation. */
  retenu: boolean;
}

export interface SfpResult {
  dateDeces: string;
  valeurMaison: { cents: Cents | null; provenance: string };
  quotePart: Frac;
  /** Valeur de la part en pleine propriété. */
  partPP: Cents | null;
  /** Valeur de la part si la nue-propriété est évaluée avec le coefficient saisi. */
  partNP: Cents | null;
  autres: Cents | null;
  profil: SuccessionProfile | null;
  scenarios: SfpScenario[];
  avertissements: string[];
  sources: RuleSource[];
  /** Description de l'hypothèse prudente. */
  hypothesePrudente: string;
  /** Capital d'assurance du fils survivant : garder ou transmettre à la bénéficiaire (null si non renseigné ou non calculable). */
  transmission: TransmissionResult | null;
}

export type TransKey = 'garder' | 'don_bancaire' | 'donation_enregistree' | 'renonciation_benefice';

export interface TransOption {
  key: TransKey;
  titre: string;
  disponible: boolean;
  raison?: string;
  /** Droits payés (succession du fils prédécédé + donation éventuelle). */
  droits: Num;
  droitsPrudent: Cents | null;
  /** Montant net reçu par la bénéficiaire. */
  recu: Num;
  recuPrudent: Cents | null;
  /** Don non enregistré : droits de succession si le fils survivant décède dans les cinq ans (minimum). */
  risque?: Num;
  risquePrudent?: Cents | null;
  notes: string[];
}

export interface TransmissionResult {
  capital: Cents;
  /** Option de la bénéficiaire prise comme contexte (celle retenue dans l'onglet Situation). */
  contexte: SfpKey;
  options: TransOption[];
  notes: string[];
  sources: RuleSource[];
}

/** `ins` : capital d'assurance taxé dans le chef de la bénéficiaire (0 si non compté). */
/** `insF` : capital d'assurance du fils survivant taxé dans son chef (0 si non compté). */
interface Variant { base: 'pp' | 'np'; supplement: boolean; ins: Cents; insF: Cents }

const taxOf = (p: SuccessionProfile, id: string, part: Cents) =>
  computeBeneficiaryTax(p, { id, partLogement: 0, partAutre: part, rappel: 0, baseReserve: 0, abattementEligible: true });

const sansSupplement = (p: SuccessionProfile): SuccessionProfile => ({ ...p, abattement: { ...p.abattement, supplement: null } });

/**
 * Résultat à partir des valeurs des hypothèses calculées. `loOk` : l'hypothèse la plus basse possible
 * figure parmi les calculs ; `hiOk` : idem pour la plus haute.
 */
function numFrom(values: Cents[], loOk: boolean, hiOk: boolean, notes: string[] = []): Num {
  if (!values.length) return { value: null, status: 'non_disponible', notes };
  const lo = Math.min(...values), hi = Math.max(...values);
  if (loOk && hiOk) return lo === hi ? exact(lo, 'calcule', notes) : { value: null, lo, hi, status: 'a_confirmer', notes };
  return { value: null, lo: loOk ? lo : undefined, hi: hiOk ? hi : undefined, status: hiOk ? 'a_confirmer' : 'partiel', notes };
}

export function computeSuccFilsPredecede(s: Situation): SfpResult {
  const h = s.house;
  const o: SuccessionFilsPredecede = s.succFilsPredecede;
  const avertissements: string[] = [];
  const dateDeces = h.dateDecesFilsPredecede;

  // Valeur de la maison au décès du fils prédécédé (champ distinct) ; à défaut, valeur par défaut.
  const hvDefault = houseValueOf(s);
  const valeurMaison = h.valeurDecesFilsPredecede.cents !== null
    ? { cents: h.valeurDecesFilsPredecede.cents, provenance: `Valeur au ${formatDate(dateDeces)}` }
    : { cents: hvDefault.cents, provenance: `${hvDefault.provenance} — la valeur au ${formatDate(dateDeces)} n’est pas renseignée` };
  if (h.valeurDecesFilsPredecede.cents === null) avertissements.push(`Valeur de la maison au ${formatDate(dateDeces)} non renseignée : la valeur par défaut est utilisée.`);

  const lotsQuart = h.lots.filter((l) => l.pp === 'quart' || l.np === 'quart' || l.us === 'quart');
  const quotePart = sum(lotsQuart.map((l) => l.share));
  if (!lotsQuart.length) avertissements.push('Aucun lot n’est attribué à la part du fils prédécédé dans le tableau des lots : seule la valeur des autres biens est prise en compte.');
  if (lotsQuart.some((l) => l.us === 'quart')) avertissements.push('Un lot donne l’usufruit à la part du fils prédécédé : un usufruit s’éteint au décès et n’est pas transmis ; ce lot est ignoré.');
  const lotsPP = lotsQuart.filter((l) => l.pp === 'quart');
  const lotsNP = lotsQuart.filter((l) => l.np === 'quart');

  const V = valeurMaison.cents;
  const valPP = V === null ? null : mulCents(V, sum(lotsPP.map((l) => l.share)));
  const valNPpleine = V === null ? null : mulCents(V, sum(lotsNP.map((l) => l.share)));
  const partPP = valPP === null || valNPpleine === null ? null : valPP + valNPpleine;
  const partNP = valPP === null || valNPpleine === null || o.coefNP === null ? null : valPP + mulCents(valNPpleine, o.coefNP);
  const autres = o.autresBiensNets.cents;
  if (autres === null) avertissements.push('Autres biens nets de la succession du fils prédécédé non renseignés : les droits affichés sont un minimum (part de maison seule).');
  if (autres !== null && autres < 0) avertissements.push('Autres biens nets négatifs (dettes supérieures aux avoirs) : ils réduisent la part taxable de la maison.');
  /** Passif non couvert par la part de maison (en pleine propriété) et les autres biens. */
  const deficit = autres === null || partPP === null ? null : -(partPP + autres);
  if (deficit !== null && deficit > 0) avertissements.push(`Succession déficitaire : les dettes dépassent les biens d’environ ${formatEUR(deficit)}. Les héritiers qui acceptent purement et simplement en répondent sur leurs propres biens : bénéfice d’inventaire ou renonciation à examiner avec le notaire.`);
  const ass = capitalOf(o.assuranceExiste, o.assurance);
  const assIncertaine = o.assuranceExiste === 'possible';
  if (o.assuranceExiste === 'inconnu') avertissements.push('Existence d’une assurance groupe / vie versée à la bénéficiaire à vérifier : non comptée (si elle existe, ses droits sont sous-estimés).');
  else if (o.assuranceExiste !== 'non' && ass === null) avertissements.push('Assurance groupe / vie versée à la bénéficiaire : montant non renseigné, non comptée (ses droits sont sous-estimés).');
  const assF = capitalOf(o.assuranceFilsExiste, o.assuranceFils);
  const assFIncertaine = o.assuranceFilsExiste === 'possible';
  if (o.assuranceFilsExiste !== 'inconnu' && o.assuranceFilsExiste !== 'non' && assF === null) avertissements.push('Assurance groupe / vie versée au fils survivant (frère du fils prédécédé) : montant non renseigné, non comptée.');
  const epa = capitalOf(o.epargnePensionExiste, o.epargnePension);
  if (o.epargnePensionExiste !== 'inconnu' && o.epargnePensionExiste !== 'non') avertissements.push(epargnePensionAvertissement(epa, o.epargnePensionBeneficiaire));

  const sources = [SOURCES.spfSuccession, SOURCES.spfTarifsAutres];
  const res = resolveSuccession(dateDeces, 'auto');
  const profil = res.ok ? res.profile : null;
  const hypothesePrudente = `Hypothèse prudente : nue-propriété taxée sur ${o.baseNP === 'nue_propriete' ? 'la valeur de la nue-propriété (coefficient saisi)' : 'la valeur de la pleine propriété'}, sans exemption supplémentaire pour la cohabitante, autres biens ${autres === null ? 'non comptés (non renseignés)' : `de ${formatEUR(autres)}`}${ass && o.assuranceTaxee !== 'non' ? `, assurance de ${formatEUR(ass)} taxée` : ''}.`;
  const base: Omit<SfpResult, 'scenarios' | 'transmission'> = { dateDeces, valeurMaison, quotePart, partPP, partNP, autres, profil, avertissements, sources, hypothesePrudente };

  const indispo = (raison: string): SfpResult => ({
    ...base,
    transmission: null,
    scenarios: (['acceptation', 'renonciation'] as SfpKey[]).map((key) => ({
      key, titre: TITRES[key], disponible: false, raison, rows: [], total: { value: null, status: 'non_disponible', notes: [] }, totalPrudent: null, plancherApplique: false, notes: [], retenu: retenuOf(s, key),
    })),
  });

  if (!profil) return indispo(res.ok ? '' : res.reason);
  if (partPP === null) return indispo('Valeur de la maison non renseignée.');
  if (o.residenceCommune === 'oui') return indispo('Le couple habitait la maison familiale (résidence commune) : usufruit légal du cohabitant et exemption du logement familial non modélisés. Validation par le notaire requise.');
  if (o.baseNP === 'nue_propriete' && o.coefNP === null && lotsNP.length) return indispo('Base « valeur de la nue-propriété » choisie, mais le coefficient n’est pas saisi.');

  // Hypothèses calculées.
  const bases: Variant['base'][] = !lotsNP.length || o.baseNP === 'pleine_propriete' ? ['pp'] : o.baseNP === 'nue_propriete' ? ['np'] : o.coefNP !== null ? ['pp', 'np'] : ['pp'];
  // La base la plus basse possible est-elle calculée ? (sinon on n'affiche qu'un maximum)
  const baseLoOk = bases.includes('np') || !lotsNP.length || o.baseNP === 'pleine_propriete';
  const supps = o.supplementCohabitant === 'appliquer' ? [true] : o.supplementCohabitant === 'ne_pas_appliquer' ? [false] : [true, false];
  // Assurance : comptée (taxée), non comptée, ou les deux (fourchette) ; la valeur la plus haute d'abord (hypothèse prudente).
  // Contrat seulement « possible » : calculé avec et sans, même si sa taxation est confirmée.
  const insVals: Cents[] = !ass || o.assuranceTaxee === 'non' ? [0] : o.assuranceTaxee === 'oui' && !assIncertaine ? [ass] : [ass, 0];
  const avecAssurance = insVals.some((x) => x > 0);
  const insFVals: Cents[] = !assF || o.assuranceFilsTaxee === 'non' ? [0] : o.assuranceFilsTaxee === 'oui' && !assFIncertaine ? [assF] : [assF, 0];
  const avecAssFils = insFVals.some((x) => x > 0);
  const variants: Variant[] = bases.flatMap((b) => supps.flatMap((supplement) => insVals.flatMap((ins) => insFVals.map((insF) => ({ base: b, supplement, ins, insF })))));
  const hiOk = autres !== null;
  /** Part recueillie dans la succession (jamais négative : un passif net ne se reporte pas sur l'assurance, hypothèse prudente). */
  const partOf = (v: Variant) => Math.max(0, (v.base === 'pp' ? partPP : partNP!) + (autres ?? 0));
  // Hypothèse prudente détaillée : base la plus haute, sans supplément d'exemption, assurance comptée si possible.
  const prudentV = variants.find((v) => v.base === bases[0] && !v.supplement && v.ins === insVals[0] && v.insF === insFVals[0]) ?? variants[0];

  const profilOf = (v: Variant) => (v.supplement ? profil : sansSupplement(profil));
  /** Bénéficiaire qui accepte : part de succession + capital d'assurance, taxés ensemble (progressivité). */
  const benefTax = (v: Variant) => taxOf(profilOf(v), 'beneficiaire', partOf(v) + v.ins);
  /** Bénéficiaire qui renonce : capital d'assurance seul. */
  const insTax = (v: Variant) => taxOf(profilOf(v), 'beneficiaire', v.ins);
  const denom = PARTS_RENONCIATION.reduce((a, p) => a * p.part.d, 1);
  const split = (v: Variant) => allocate(partOf(v), PARTS_RENONCIATION.map((p) => (p.part.n * denom) / p.part.d));
  const pereTax = (v: Variant) => taxOf(profil, 'pere', split(v)[0]);
  /** Fils survivant héritier (renonciation) : sa part + le capital d'assurance à son profit, taxés ensemble. */
  const filsTax = (v: Variant) => taxOf(SUCC_FRERES_SOEURS, 'fils', split(v)[1] + v.insF);
  /** Fils survivant : capital d'assurance seul (la bénéficiaire accepte, il n'hérite pas). */
  const filsInsTax = (v: Variant) => taxOf(SUCC_FRERES_SOEURS, 'fils', v.insF);

  const partNum = (f: (v: Variant) => Cents) => numFrom(variants.map(f), baseLoOk, hiOk);
  const notaire = o.droitsNotaire;
  const row = (id: SfpWho, bareme: string, part: Num, calc: (v: Variant) => BenefTaxResult, manual: Cents | null = notaire[id]): SfpRow => {
    const droits = manual !== null ? exact(manual, 'manuel', ['Montant saisi d’après le notaire.']) : numFrom(variants.map((v) => calc(v).droits ?? 0), baseLoOk, hiOk);
    const detail = calc(prudentV);
    return { id, bareme, part, droits, prudent: manual ?? detail.droits, detail, manual };
  };

  const notesCommunes = [
    `Décès du ${formatDate(dateDeces)} : ${profil.label}.`,
    bases.length > 1 ? `Nue-propriété taxée sur la valeur de la pleine propriété ou sur ${formatPct(o.coefNP!)} de celle-ci : règle à confirmer, la fourchette couvre les deux.` : '',
    !baseLoOk ? 'La nue-propriété pourrait être taxée sur une valeur plus basse que la pleine propriété : saisissez le coefficient fourni par le notaire pour obtenir le minimum.' : '',
    avecAssurance && assIncertaine ? `Assurance groupe / vie de ${formatEUR(ass)} versée à la bénéficiaire : existence du contrat incertaine ; la fourchette couvre les cas avec et sans ce capital.` : '',
    avecAssurance && insVals.length > 1 && !assIncertaine ? `Assurance groupe / vie de ${formatEUR(ass)} : soumission aux droits de succession à confirmer (art. 8 C. succ., non lu dans les sources consultées) ; la fourchette couvre les deux cas.` : '',
    avecAssurance ? 'Montant de l’assurance : brut ou net des retenues (INAMI, solidarité, impôt) à confirmer ; les dettes de la succession ne s’imputent pas sur ce capital (hypothèse prudente).' : '',
    avecAssFils ? `Assurance de ${formatEUR(assF)} au profit du fils survivant : hors succession, taxée dans son chef au barème entre frères et sœurs (art. 8 C. succ., à confirmer)${assFIncertaine ? ' ; existence du contrat incertaine : la fourchette couvre aussi le cas « pas d’assurance »' : insFVals.length > 1 ? ' ; la fourchette couvre aussi le cas « non taxée »' : ''}.` : '',
  ].filter(Boolean);

  // ── Acceptation : la cohabitante légale recueille la part (barème ligne directe en Wallonie).
  let acceptation: SfpScenario;
  if (o.testament === 'aucun') {
    acceptation = { key: 'acceptation', titre: TITRES.acceptation, disponible: false, raison: 'Pas de testament : la cohabitante légale ne recueille pas cette part (la maison n’était pas la résidence commune).', rows: [], total: { value: null, status: 'non_disponible', notes: [] }, totalPrudent: null, plancherApplique: false, notes: [], retenu: retenuOf(s, 'acceptation') };
  } else {
    const r = row('beneficiaire', `Cohabitante légale : barème « conjoints, cohabitants légaux et ligne directe »${avecAssurance ? ' ; part de succession + assurance' : ''}`, partNum((v) => partOf(v) + v.ins), benefTax);
    // Fils survivant : assurance à son profit seule (il n'hérite pas si la bénéficiaire accepte).
    const rfa = avecAssFils ? row('fils', 'Fils survivant : assurance à son profit seule, barème entre frères et sœurs', partNum((v) => v.insF), filsInsTax, null) : null;
    let total: Num = r.droits;
    if (rfa) {
      total = r.manual === null
        ? numFrom(variants.map((v) => (benefTax(v).droits ?? 0) + (filsInsTax(v).droits ?? 0)), baseLoOk, hiOk)
        : numFrom(insFVals.map((x) => r.manual! + (taxOf(SUCC_FRERES_SOEURS, 'fils', x).droits ?? 0)), true, true, ['Montant du notaire pour la bénéficiaire + estimation pour l’assurance du fils survivant.']);
    }
    acceptation = {
      key: 'acceptation', titre: TITRES.acceptation, disponible: true, rows: rfa ? [r, rfa] : [r], total, totalPrudent: (r.prudent ?? 0) + (rfa?.prudent ?? 0), plancherApplique: false, retenu: retenuOf(s, 'acceptation'),
      notes: [
        ...notesCommunes,
        avecAssurance ? 'Le capital d’assurance s’ajoute à sa part : la part de maison est taxée dans des tranches plus élevées, et l’exemption supplémentaire (part ≤ 125 000 €) peut être perdue.' : '',
        'Exemption de 12 500 € appliquée (confirmée pour le cohabitant légal par la source SPF).',
        o.supplementCohabitant === 'inconnu' ? 'Exemption supplémentaire de 12 500 € (part ≤ 125 000 €) : écrite pour la ligne directe seulement ; la fourchette couvre les deux cas.' : o.supplementCohabitant === 'appliquer' ? 'Exemption supplémentaire de 12 500 € appliquée (choix saisi).' : 'Exemption supplémentaire de 12 500 € non appliquée (choix saisi).',
        o.testament === 'inconnu' ? 'Existence du testament à confirmer.' : 'Legs par testament en faveur de la cohabitante légale.',
        'Au décès du père, l’usufruit s’éteint sans droits : la bénéficiaire devient pleine propriétaire de la part.',
      ].filter(Boolean),
    };
  }

  // ── Renonciation : dévolution légale supposée (père 1/4, fils survivant 3/4).
  let renonciation: SfpScenario;
  if (o.descendants === 'oui') {
    renonciation = { key: 'renonciation', titre: TITRES.renonciation, disponible: false, raison: 'Le fils prédécédé avait des descendants : ils recueillent la part en cas de renonciation ; dévolution non calculée.', rows: [], total: { value: null, status: 'non_disponible', notes: [] }, totalPrudent: null, plancherApplique: false, notes: [], retenu: retenuOf(s, 'renonciation') };
  } else {
    const rp = row('pere', 'Père (1/4) : ligne directe, exemption art. 54', partNum((v) => split(v)[0]), pereTax);
    const rf = row('fils', `Fils survivant (3/4) : barème entre frères et sœurs, sans exemption${avecAssFils ? ' ; part de succession + assurance à son profit' : ''}`, partNum((v) => split(v)[1] + v.insF), filsTax);
    // La bénéficiaire garde l'assurance (droit propre) : elle paie les droits sur ce capital seul.
    // Le montant du notaire « si elle accepte » ne s'applique pas ici.
    const rb = avecAssurance ? row('beneficiaire', 'Bénéficiaire : assurance seule (conservée malgré la renonciation)', partNum((v) => v.ins), insTax, null) : null;
    const insDroits = (v: Variant) => (rb ? insTax(v).droits ?? 0 : 0);
    /** Droits de la renonçante attribuables à la part renoncée (plancher art. 68). */
    const renoncantPart = (v: Variant) => (benefTax(v).droits ?? 0) - insDroits(v);
    /** Droits du fils survivant sur son assurance seule (exclus du plancher : ils ne portent pas sur la part renoncée). */
    const filsInsDroits = (v: Variant) => (avecAssFils ? filsInsTax(v).droits ?? 0 : 0);
    /** Droits des héritiers attribuables à la part renoncée (le surcoût de progressivité dû au capital y reste). */
    const heirsPart = (v: Variant) => (pereTax(v).droits ?? 0) + (filsTax(v).droits ?? 0) - filsInsDroits(v);
    const anyManual = rp.manual !== null || rf.manual !== null;
    let plancherApplique = false;
    let total: Num;
    const heirsPrudent = (rp.prudent ?? 0) + (rf.prudent ?? 0);
    const rbPrudent = rb?.prudent ?? 0;
    const totalPrudent = (anyManual ? heirsPrudent : Math.max(heirsPart(prudentV), renoncantPart(prudentV)) + filsInsDroits(prudentV)) + rbPrudent;
    if (anyManual) {
      const vals = [rp.droits, rf.droits];
      if (!vals.every((n) => n.value !== null)) {
        total = { value: null, status: 'partiel', lo: undefined, notes: ['Saisissez les deux montants du notaire (ou aucun) pour obtenir le total.'] };
      } else {
        const m = vals.reduce((a, n) => a + n.value!, 0);
        const notes = ['Somme des montants saisis ; plancher de l’art. 68 non recalculé.'];
        const d = rb?.droits;
        total = !d || d.value !== null
          ? exact(m + (d?.value ?? 0), 'manuel', notes)
          : { value: null, lo: d.lo === undefined ? undefined : m + d.lo, hi: d.hi === undefined ? undefined : m + d.hi, status: d.status, notes };
      }
    } else {
      const totals = variants.map((v) => {
        const heirs = heirsPart(v);
        const renoncant = renoncantPart(v);
        if (renoncant > heirs) plancherApplique = true;
        return Math.max(heirs, renoncant) + filsInsDroits(v) + insDroits(v);
      });
      total = numFrom(totals, baseLoOk, hiOk);
    }
    renonciation = {
      key: 'renonciation', titre: TITRES.renonciation, disponible: true, rows: rb ? [rb, rp, rf] : [rp, rf], total, totalPrudent, plancherApplique, retenu: retenuOf(s, 'renonciation'),
      notes: [
        ...notesCommunes,
        avecAssurance
          ? 'La bénéficiaire renonce à la succession mais garde en principe l’assurance (droit propre, hors succession) : elle paie les droits sur ce capital seul (à confirmer).'
          : 'La bénéficiaire qui renonce ne paie rien sur cette succession.',
        `Dévolution supposée : ${PARTS_RENONCIATION.map((p) => p.label).join(', ')} (pas de descendant, mère prédécédée, un seul frère) — à confirmer au vu du testament.`,
        o.descendants === 'inconnu' ? 'Absence de descendant à confirmer.' : '',
        'La nue-propriété recueillie par le père, déjà usufruitier, devient pleine propriété (consolidation).',
        autres !== null && autres < 0
          ? `Les héritiers recueillent aussi les dettes de cette succession${deficit !== null && deficit > 0 ? ` : passif non couvert estimé à ${formatEUR(deficit)}, à leur charge s’ils acceptent purement et simplement. Accepter sous bénéfice d’inventaire (dettes payées dans la limite des biens) ou renoncer à leur tour : à voir avec le notaire` : ''}.`
          : '',
        plancherApplique
          ? `Plancher appliqué : les héritiers ne paieraient pas moins que la renonçante${avecAssurance ? ' sur la part renoncée (assurance exclue)' : ''} (art. 68 C. succ., à confirmer) ; le complément n’est pas réparti entre eux.`
          : `Plancher « pas moins que la renonçante » (art. 68 C. succ., à confirmer${avecAssurance ? ', assurance exclue' : ''}) : sans effet ici, les héritiers paient déjà davantage.`,
      ].filter(Boolean),
    };
  }

  // ── Assurance du fils survivant : la garder ou la transmettre à la bénéficiaire.
  let transmission: TransmissionResult | null = null;
  if (assF !== null && assF > 0) {
    const contexte: SfpKey = s.house.quartResolution === 'renonciation' && renonciation.disponible ? 'renonciation' : acceptation.disponible ? 'acceptation' : 'renonciation';
    /** Le résultat dépend-il des hypothèses de la part de maison (base, autres biens) ? */
    const dep = (d: boolean): readonly [boolean, boolean] => (d ? [baseLoOk, hiOk] : [true, true]);
    const fsTax = (x: Cents) => taxOf(SUCC_FRERES_SOEURS, 'fils', x).droits ?? 0;
    /** Droits du fils survivant dus à cause du capital (marginaux s'il hérite aussi des 3/4). */
    const capTax = (v: Variant) => (contexte === 'renonciation' ? fsTax(split(v)[1] + v.insF) - fsTax(split(v)[1]) : fsTax(v.insF));
    const net = (v: Variant) => assF - capTax(v);
    const donTax = (v: Variant) => applyRateBp(net(v), DON_ACTUEL.mobilierAutresBp);
    const rappel = (v: Variant) => taxOf(SUCC_AUTRES_PERSONNES, 'beneficiaire', net(v)).droits ?? 0;
    /** Base déjà taxée dans le chef de la bénéficiaire (sa part si elle accepte + son assurance). */
    const herBase = (v: Variant) => (contexte === 'acceptation' ? partOf(v) + v.ins : v.ins);
    /** Droits marginaux de la bénéficiaire sur le capital (même incertitude de taxation art. 8 : `insF`). */
    const herCapTax = (v: Variant) =>
      (taxOf(profilOf(v), 'beneficiaire', herBase(v) + v.insF).droits ?? 0) - (taxOf(profilOf(v), 'beneficiaire', herBase(v)).droits ?? 0);
    const d1 = dep(contexte === 'renonciation');
    const opt = (key: TransKey, droits: (v: Variant) => Cents, recu: (v: Variant) => Cents, d: readonly [boolean, boolean], notes: string[], risque?: (v: Variant) => Cents): TransOption => ({
      key, titre: TRANS_TITRES[key], disponible: true,
      droits: numFrom(variants.map(droits), d[0], d[1]), droitsPrudent: droits(prudentV),
      recu: numFrom(variants.map(recu), d[0], d[1]), recuPrudent: recu(prudentV),
      ...(risque ? { risque: numFrom(variants.map(risque), d[0], d[1]), risquePrudent: risque(prudentV) } : {}),
      notes,
    });
    const nd: Num = { value: null, status: 'non_disponible', notes: [] };
    const indispoOpt = (key: TransKey, raison: string): TransOption => ({ key, titre: TRANS_TITRES[key], disponible: false, raison, droits: nd, droitsPrudent: null, recu: nd, recuPrudent: null, notes: [] });
    const suivant = o.assuranceFilsSuivant;
    transmission = {
      capital: assF, contexte, sources: [SOURCES.spfTarifsAutres, SOURCES.spfTarifsNonParents, SOURCES.spfDonationsAutres],
      notes: [
        `Contexte : ${contexte === 'acceptation' ? 'la bénéficiaire accepte le legs (le fils survivant n’hérite pas : capital taxé seul)' : 'la bénéficiaire renonce (le capital s’ajoute aux 3/4 du fils survivant : droits marginaux, tranches plus élevées)'} — option retenue dans « Part du fils prédécédé ».`,
        assFIncertaine ? 'Existence du contrat incertaine (« peut-être ») : ce tableau ne vaut que si le capital est effectivement versé.' : '',
        'Une fois versé, le capital appartient au fils survivant : il peut le donner librement.',
        'Attendre que la bénéficiaire ait choisi d’accepter ou de renoncer : si elle acceptait purement et simplement une succession déficitaire, les créanciers pourraient saisir ce qu’elle reçoit.',
        `Droits de donation : profil « ${DON_ACTUEL.label} » (dons jusqu’au 31/12/2027).`,
        o.assuranceFilsTaxee !== 'oui' ? 'Taxation du capital (art. 8) à confirmer : la fourchette couvre « taxé » et « non taxé » ; hypothèse prudente : taxé.' : '',
      ].filter(Boolean),
      options: [
        opt('garder', capTax, () => 0, d1, ['Le fils survivant paie les droits sur le capital et garde le solde.']),
        opt('don_bancaire', capTax, net, d1, [
          'Virement du solde net, sans acte : aucun droit de donation.',
          'Si le fils survivant décède dans les cinq ans, le don est réintégré dans sa succession et taxé au barème entre non-parents (minimum affiché : sans ses autres biens éventuellement légués à la bénéficiaire). Garder une preuve datée ; enregistrer le don si sa santé change.',
        ], rappel),
        opt('donation_enregistree', (v) => capTax(v) + donTax(v), (v) => net(v) - donTax(v), d1, [
          'Acte notarié ou don présenté à l’enregistrement : 5,5 % « entre toutes les autres personnes » (une belle-sœur n’est pas parente au sens fiscal), sans risque de rappel.',
          'Hypothèse : les droits de donation sont payés par la bénéficiaire sur le montant donné.',
        ]),
        suivant === 'beneficiaire'
          ? opt('renonciation_benefice', herCapTax, (v) => assF - herCapTax(v), dep(contexte === 'acceptation'), [
            'Le fils survivant renonce au bénéfice AVANT de l’accepter (avant toute quittance) ; la clause désigne ensuite la bénéficiaire, taxée au barème des cohabitants légaux au-dessus de ce qu’elle recueille déjà (tranches élevées).',
            'Une renonciation pure et simple n’est en principe pas une donation (à confirmer). Seule option sans double taxation.',
          ])
          : indispoOpt('renonciation_benefice', suivant === 'succession'
            ? 'La clause ne désigne personne après le fils survivant : le capital tomberait dans la succession du fils prédécédé, servirait d’abord à payer les dettes, puis irait aux héritiers. À éviter.'
            : suivant === 'autre'
              ? 'La clause désigne une autre personne que la bénéficiaire : le capital lui échapperait.'
              : 'Clause bénéficiaire à lire avant toute démarche (qui reçoit si le fils survivant renonce ?). Ne pas accepter le capital ni signer de quittance avant.'),
      ],
    };
  }

  return { ...base, scenarios: [acceptation, renonciation], transmission };
}

/** Capital pris en compte : 0 si le contrat n'existe pas, rien (null) si son existence n'est pas vérifiée. */
const EPA_BENEF: Record<EpargnePensionBeneficiaire, string> = {
  inconnu: 'bénéficiaire à établir (pas la bénéficiaire de la part, selon les informations reçues)',
  heritiers: 'versée aux héritiers légaux ou à la succession selon la clause',
  fils: 'versée au fils survivant (frère du fils prédécédé) selon la clause',
  pere: 'versée au père selon la clause',
  autre: 'versée à une autre personne selon la clause',
};

/**
 * Épargne-pension : jamais comptée dans les droits estimés (régime fiscal propre et bénéficiaire à établir).
 * Le texte rappelle seulement ce qu'elle pourrait changer.
 */
export function epargnePensionAvertissement(capital: Cents | null, b: EpargnePensionBeneficiaire): string {
  const m = capital === null ? 'montant non renseigné' : formatEUR(capital);
  const effet = b === 'heritiers' ? ' Si elle tombe dans la succession, elle s’ajoute aux biens partagés et aux droits des héritiers.'
    : b === 'fils' ? ' Le fils survivant la recevrait en plus de son assurance (barème entre frères et sœurs, à confirmer).'
    : b === 'pere' ? ' Le père la recevrait (barème en ligne directe, à confirmer).' : '';
  return `Épargne-pension (${m}) : ${EPA_BENEF[b]} ; non comptée dans les droits estimés (régime fiscal propre de l’épargne-pension et droits de succession à confirmer).${effet}`;
}

function capitalOf(existe: Existence, v: Value): Cents | null {
  return existe === 'non' ? 0 : existe === 'inconnu' ? null : v.cents;
}

const TRANS_TITRES: Record<TransKey, string> = {
  garder: 'Le fils survivant garde le capital',
  don_bancaire: 'Don bancaire non enregistré à la bénéficiaire',
  donation_enregistree: 'Donation enregistrée à la bénéficiaire (5,5 %)',
  renonciation_benefice: 'Renonciation au bénéfice du contrat',
};

const TITRES: Record<SfpKey, string> = {
  acceptation: 'La bénéficiaire accepte le legs',
  renonciation: 'La bénéficiaire renonce',
};

const retenuOf = (s: Situation, key: SfpKey) =>
  (key === 'acceptation' && s.house.quartResolution === 'beneficiaire_conserve') || (key === 'renonciation' && s.house.quartResolution === 'renonciation');

/** Écart entre les deux options (renonciation − acceptation), si les deux totaux sont connus ou bornés. */
export function ecartRenonciation(r: SfpResult): string | null {
  const [a, b] = r.scenarios;
  if (!a.disponible || !b.disponible) return null;
  const lo = (n: Num) => n.value ?? n.lo;
  const hi = (n: Num) => n.value ?? n.hi;
  const la = lo(a.total), ha = hi(a.total), lb = lo(b.total), hb = hi(b.total);
  if (la === undefined || ha === undefined || lb === undefined || hb === undefined) return null;
  const min = lb - ha, max = hb - la;
  if (min === max) return `${min >= 0 ? 'La renonciation coûte' : 'La renonciation économise'} ${formatEUR(Math.abs(min))} de droits au total.`;
  return `Écart total (renonciation − acceptation) : entre ${formatEUR(min)} et ${formatEUR(max)}.`;
}
