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
 * saisi, supposés suivre la même dévolution. Pas de logement familial (maison non affectée à la
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

interface Variant { base: 'pp' | 'np'; supplement: boolean }

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

  const sources = [SOURCES.spfSuccession, SOURCES.spfTarifsAutres];
  const res = resolveSuccession(dateDeces, 'auto');
  const profil = res.ok ? res.profile : null;
  const hypothesePrudente = `Hypothèse prudente : nue-propriété taxée sur ${o.baseNP === 'nue_propriete' ? 'la valeur de la nue-propriété (coefficient saisi)' : 'la valeur de la pleine propriété'}, sans exemption supplémentaire pour la cohabitante, autres biens ${autres === null ? 'non comptés (non renseignés)' : `de ${formatEUR(autres)}`}.`;
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
  const variants: Variant[] = bases.flatMap((b) => supps.map((supplement) => ({ base: b, supplement })));
  const hiOk = autres !== null;
  const partOf = (v: Variant) => Math.max(0, (v.base === 'pp' ? partPP : partNP!) + (autres ?? 0));
  // Hypothèse prudente détaillée : base la plus haute (pleine propriété si calculée), sans supplément d'exemption.
  const prudentV = variants.find((v) => v.base === bases[0] && !v.supplement) ?? variants[0];

  const benefTax = (v: Variant) => taxOf(v.supplement ? profil : sansSupplement(profil), 'beneficiaire', partOf(v));
  const denom = PARTS_RENONCIATION.reduce((a, p) => a * p.part.d, 1);
  const split = (v: Variant) => allocate(partOf(v), PARTS_RENONCIATION.map((p) => (p.part.n * denom) / p.part.d));
  const pereTax = (v: Variant) => taxOf(profil, 'pere', split(v)[0]);
  const filsTax = (v: Variant) => taxOf(SUCC_FRERES_SOEURS, 'fils', split(v)[1]);

  const partNum = (f: (v: Variant) => Cents) => numFrom(variants.map(f), baseLoOk, hiOk);
  const notaire = o.droitsNotaire;
  const row = (id: SfpWho, bareme: string, part: Num, calc: (v: Variant) => BenefTaxResult): SfpRow => {
    const manual = notaire[id];
    const droits = manual !== null ? exact(manual, 'manuel', ['Montant saisi d’après le notaire.']) : numFrom(variants.map((v) => calc(v).droits ?? 0), baseLoOk, hiOk);
    const detail = calc(prudentV);
    return { id, bareme, part, droits, prudent: manual ?? detail.droits, detail, manual };
  };

  const notesCommunes = [
    `Décès du ${formatDate(dateDeces)} : ${profil.label}.`,
    bases.length > 1 ? `Nue-propriété taxée sur la valeur de la pleine propriété ou sur ${formatPct(o.coefNP!)} de celle-ci : règle à confirmer, la fourchette couvre les deux.` : '',
    !baseLoOk ? 'La nue-propriété pourrait être taxée sur une valeur plus basse que la pleine propriété : saisissez le coefficient fourni par le notaire pour obtenir le minimum.' : '',
  ].filter(Boolean);

  // ── Acceptation : la cohabitante légale recueille la part (barème ligne directe en Wallonie).
  let acceptation: SfpScenario;
  if (o.testament === 'aucun') {
    acceptation = { key: 'acceptation', titre: TITRES.acceptation, disponible: false, raison: 'Pas de testament : la cohabitante légale ne recueille pas cette part (la maison n’était pas la résidence commune).', rows: [], total: { value: null, status: 'non_disponible', notes: [] }, totalPrudent: null, plancherApplique: false, notes: [], retenu: retenuOf(s, 'acceptation') };
  } else {
    const r = row('beneficiaire', 'Cohabitante légale : barème « conjoints, cohabitants légaux et ligne directe »', partNum(partOf), benefTax);
    acceptation = {
      key: 'acceptation', titre: TITRES.acceptation, disponible: true, rows: [r], total: r.droits, totalPrudent: r.prudent, plancherApplique: false, retenu: retenuOf(s, 'acceptation'),
      notes: [
        ...notesCommunes,
        'Exemption de 12 500 € appliquée (confirmée pour le cohabitant légal par la source SPF).',
        o.supplementCohabitant === 'inconnu' ? 'Exemption supplémentaire de 12 500 € (part ≤ 125 000 €) : écrite pour la ligne directe seulement ; la fourchette couvre les deux cas.' : o.supplementCohabitant === 'appliquer' ? 'Exemption supplémentaire de 12 500 € appliquée (choix saisi).' : 'Exemption supplémentaire de 12 500 € non appliquée (choix saisi).',
        o.testament === 'inconnu' ? 'Existence du testament à confirmer.' : 'Legs par testament en faveur de la cohabitante légale.',
        'Au décès du père, l’usufruit s’éteint sans droits : la bénéficiaire devient pleine propriétaire de la part.',
      ],
    };
  }

  // ── Renonciation : dévolution légale supposée (père 1/4, fils survivant 3/4).
  let renonciation: SfpScenario;
  if (o.descendants === 'oui') {
    renonciation = { key: 'renonciation', titre: TITRES.renonciation, disponible: false, raison: 'Le fils prédécédé avait des descendants : ils recueillent la part en cas de renonciation ; dévolution non calculée.', rows: [], total: { value: null, status: 'non_disponible', notes: [] }, totalPrudent: null, plancherApplique: false, notes: [], retenu: retenuOf(s, 'renonciation') };
  } else {
    const rp = row('pere', 'Père (1/4) : ligne directe, exemption art. 54', partNum((v) => split(v)[0]), pereTax);
    const rf = row('fils', 'Fils survivant (3/4) : barème entre frères et sœurs, sans exemption', partNum((v) => split(v)[1]), filsTax);
    const anyManual = rp.manual !== null || rf.manual !== null;
    let plancherApplique = false;
    let total: Num;
    const heirsPrudent = (rp.prudent ?? 0) + (rf.prudent ?? 0);
    const totalPrudent = anyManual ? heirsPrudent : Math.max(heirsPrudent, benefTax(prudentV).droits ?? 0);
    if (anyManual) {
      const vals = [rp.droits, rf.droits];
      total = vals.every((n) => n.value !== null)
        ? exact(vals.reduce((a, n) => a + n.value!, 0), 'manuel', ['Somme des montants saisis ; plancher de l’art. 68 non recalculé.'])
        : { value: null, status: 'partiel', lo: undefined, notes: ['Saisissez les deux montants du notaire (ou aucun) pour obtenir le total.'] };
    } else {
      const totals = variants.map((v) => {
        const heirs = (pereTax(v).droits ?? 0) + (filsTax(v).droits ?? 0);
        const renoncant = benefTax(v).droits ?? 0;
        if (renoncant > heirs) plancherApplique = true;
        return Math.max(heirs, renoncant);
      });
      total = numFrom(totals, baseLoOk, hiOk);
    }
    renonciation = {
      key: 'renonciation', titre: TITRES.renonciation, disponible: true, rows: [rp, rf], total, totalPrudent, plancherApplique, retenu: retenuOf(s, 'renonciation'),
      notes: [
        ...notesCommunes,
        'La bénéficiaire qui renonce ne paie rien sur cette succession.',
        `Dévolution supposée : ${PARTS_RENONCIATION.map((p) => p.label).join(', ')} (pas de descendant, mère prédécédée, un seul frère) — à confirmer au vu du testament.`,
        o.descendants === 'inconnu' ? 'Absence de descendant à confirmer.' : '',
        'La nue-propriété recueillie par le père, déjà usufruitier, devient pleine propriété (consolidation).',
        plancherApplique
          ? 'Plancher appliqué : les héritiers ne paieraient pas moins que la renonçante (art. 68 C. succ., à confirmer) ; le complément n’est pas réparti entre eux.'
          : 'Plancher « pas moins que la renonçante » (art. 68 C. succ., à confirmer) : sans effet ici, les héritiers paient déjà davantage.',
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
