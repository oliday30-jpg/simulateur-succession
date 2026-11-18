import type { Situation, SuccessionFilsPredecede } from '../model/types';
import { allocate, formatEUR, type Cents } from '../util/money';
import { formatPct, mulCents, sum, type Frac } from '../util/fraction';
import { formatDate } from '../util/dates';
import { PARTS_RENONCIATION } from '../domain/rights';
import { computeBeneficiaryTax, type BenefTaxResult } from '../tax/succession';
import { resolveSuccession, SOURCES, SUCC_FRERES_SOEURS, type RuleSource, type SuccessionProfile } from '../tax/rules';
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
}

/** `ins` : capital d'assurance taxé dans le chef de la bénéficiaire (0 si non compté). */
interface Variant { base: 'pp' | 'np'; supplement: boolean; ins: Cents }

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
  const ass = o.assurance.cents;
  if (ass === null) avertissements.push('Assurance groupe / vie versée à la bénéficiaire non renseignée : non comptée (si elle existe, ses droits sont sous-estimés).');

  const sources = [SOURCES.spfSuccession, SOURCES.spfTarifsAutres];
  const res = resolveSuccession(dateDeces, 'auto');
  const profil = res.ok ? res.profile : null;
  const hypothesePrudente = `Hypothèse prudente : nue-propriété taxée sur ${o.baseNP === 'nue_propriete' ? 'la valeur de la nue-propriété (coefficient saisi)' : 'la valeur de la pleine propriété'}, sans exemption supplémentaire pour la cohabitante, autres biens ${autres === null ? 'non comptés (non renseignés)' : `de ${formatEUR(autres)}`}${ass && o.assuranceTaxee !== 'non' ? `, assurance de ${formatEUR(ass)} taxée` : ''}.`;
  const base: Omit<SfpResult, 'scenarios'> = { dateDeces, valeurMaison, quotePart, partPP, partNP, autres, profil, avertissements, sources, hypothesePrudente };

  const indispo = (raison: string): SfpResult => ({
    ...base,
    scenarios: (['acceptation', 'renonciation'] as SfpKey[]).map((key) => ({
      key, titre: TITRES[key], disponible: false, raison, rows: [], total: { value: null, status: 'non_disponible', notes: [] }, totalPrudent: null, plancherApplique: false, notes: [], retenu: retenuOf(s, key),
    })),
  });

  if (!profil) return indispo(res.ok ? '' : res.reason);
  if (partPP === null) return indispo('Valeur de la maison non renseignée.');
  if (o.residenceCommune === 'oui') return indispo('La maison était la résidence commune : usufruit légal du cohabitant et exemption du logement familial non modélisés. Validation par le notaire requise.');
  if (o.baseNP === 'nue_propriete' && o.coefNP === null && lotsNP.length) return indispo('Base « valeur de la nue-propriété » choisie, mais le coefficient n’est pas saisi.');

  // Hypothèses calculées.
  const bases: Variant['base'][] = !lotsNP.length || o.baseNP === 'pleine_propriete' ? ['pp'] : o.baseNP === 'nue_propriete' ? ['np'] : o.coefNP !== null ? ['pp', 'np'] : ['pp'];
  // La base la plus basse possible est-elle calculée ? (sinon on n'affiche qu'un maximum)
  const baseLoOk = bases.includes('np') || !lotsNP.length || o.baseNP === 'pleine_propriete';
  const supps = o.supplementCohabitant === 'appliquer' ? [true] : o.supplementCohabitant === 'ne_pas_appliquer' ? [false] : [true, false];
  // Assurance : comptée (taxée), non comptée, ou les deux (fourchette) ; la valeur la plus haute d'abord (hypothèse prudente).
  const insVals: Cents[] = !ass || o.assuranceTaxee === 'non' ? [0] : o.assuranceTaxee === 'oui' ? [ass] : [ass, 0];
  const avecAssurance = insVals.some((x) => x > 0);
  const variants: Variant[] = bases.flatMap((b) => supps.flatMap((supplement) => insVals.map((ins) => ({ base: b, supplement, ins }))));
  const hiOk = autres !== null;
  /** Part recueillie dans la succession (jamais négative : un passif net ne se reporte pas sur l'assurance, hypothèse prudente). */
  const partOf = (v: Variant) => Math.max(0, (v.base === 'pp' ? partPP : partNP!) + (autres ?? 0));
  // Hypothèse prudente détaillée : base la plus haute, sans supplément d'exemption, assurance comptée si possible.
  const prudentV = variants.find((v) => v.base === bases[0] && !v.supplement && v.ins === insVals[0]) ?? variants[0];

  const profilOf = (v: Variant) => (v.supplement ? profil : sansSupplement(profil));
  /** Bénéficiaire qui accepte : part de succession + capital d'assurance, taxés ensemble (progressivité). */
  const benefTax = (v: Variant) => taxOf(profilOf(v), 'beneficiaire', partOf(v) + v.ins);
  /** Bénéficiaire qui renonce : capital d'assurance seul. */
  const insTax = (v: Variant) => taxOf(profilOf(v), 'beneficiaire', v.ins);
  const denom = PARTS_RENONCIATION.reduce((a, p) => a * p.part.d, 1);
  const split = (v: Variant) => allocate(partOf(v), PARTS_RENONCIATION.map((p) => (p.part.n * denom) / p.part.d));
  const pereTax = (v: Variant) => taxOf(profil, 'pere', split(v)[0]);
  const filsTax = (v: Variant) => taxOf(SUCC_FRERES_SOEURS, 'fils', split(v)[1]);

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
    avecAssurance && insVals.length > 1 ? `Assurance groupe / vie de ${formatEUR(ass)} : soumission aux droits de succession à confirmer (art. 8 C. succ., non lu dans les sources consultées) ; la fourchette couvre les deux cas.` : '',
    avecAssurance ? 'Montant de l’assurance : brut ou net des retenues (INAMI, solidarité, impôt) à confirmer ; les dettes de la succession ne s’imputent pas sur ce capital (hypothèse prudente).' : '',
  ].filter(Boolean);

  // ── Acceptation : la cohabitante légale recueille la part (barème ligne directe en Wallonie).
  let acceptation: SfpScenario;
  if (o.testament === 'aucun') {
    acceptation = { key: 'acceptation', titre: TITRES.acceptation, disponible: false, raison: 'Pas de testament : la cohabitante légale ne recueille pas cette part (la maison n’était pas la résidence commune).', rows: [], total: { value: null, status: 'non_disponible', notes: [] }, totalPrudent: null, plancherApplique: false, notes: [], retenu: retenuOf(s, 'acceptation') };
  } else {
    const r = row('beneficiaire', `Cohabitante légale : barème « conjoints, cohabitants légaux et ligne directe »${avecAssurance ? ' ; part de succession + assurance' : ''}`, partNum((v) => partOf(v) + v.ins), benefTax);
    acceptation = {
      key: 'acceptation', titre: TITRES.acceptation, disponible: true, rows: [r], total: r.droits, totalPrudent: r.prudent, plancherApplique: false, retenu: retenuOf(s, 'acceptation'),
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
    const rf = row('fils', 'Fils survivant (3/4) : barème entre frères et sœurs, sans exemption', partNum((v) => split(v)[1]), filsTax);
    // La bénéficiaire garde l'assurance (droit propre) : elle paie les droits sur ce capital seul.
    // Le montant du notaire « si elle accepte » ne s'applique pas ici.
    const rb = avecAssurance ? row('beneficiaire', 'Bénéficiaire : assurance seule (conservée malgré la renonciation)', partNum((v) => v.ins), insTax, null) : null;
    const insDroits = (v: Variant) => (rb ? insTax(v).droits ?? 0 : 0);
    /** Droits de la renonçante attribuables à la part renoncée (plancher art. 68). */
    const renoncantPart = (v: Variant) => (benefTax(v).droits ?? 0) - insDroits(v);
    const anyManual = rp.manual !== null || rf.manual !== null;
    let plancherApplique = false;
    let total: Num;
    const heirsPrudent = (rp.prudent ?? 0) + (rf.prudent ?? 0);
    const rbPrudent = rb?.prudent ?? 0;
    const totalPrudent = (anyManual ? heirsPrudent : Math.max(heirsPrudent, renoncantPart(prudentV))) + rbPrudent;
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
        const heirs = (pereTax(v).droits ?? 0) + (filsTax(v).droits ?? 0);
        const renoncant = renoncantPart(v);
        if (renoncant > heirs) plancherApplique = true;
        return Math.max(heirs, renoncant) + insDroits(v);
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

  return { ...base, scenarios: [acceptation, renonciation] };
}

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
