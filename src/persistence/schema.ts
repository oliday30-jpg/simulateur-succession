import { z } from 'zod';
import type { AppState } from '../model/types';
import { CONTRATS_CONNUS, NOTE_EPARGNE_PENSION, NOTE_EPARGNE_PENSION_V1 } from '../model/contratsConnus';

/** Version courante du format d'export JSON. */
export const SCHEMA_VERSION = 1 as const;
export const APP_ID = 'simulateur-succession-wallonie';

const cents = z.number().int().safe();
const ncents = cents.nullable();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const fracS = z.object({ n: z.number().int().nonnegative(), d: z.number().int().positive() });
const value = z.object({ cents: ncents, certainty: z.enum(['approx', 'manuel', 'verifie']), source: z.string(), note: z.string().optional() });
const holder = z.enum(['pere', 'fils', 'beneficiaire', 'petitFils', 'quart']);
const person = z.enum(['pere', 'fils', 'beneficiaire', 'petitFils', 'filsPredecede']);
const donee = z.enum(['fils', 'petitFils']);

const lot = z.object({ id: z.string(), share: fracS, pp: holder.optional(), np: holder.optional(), us: holder.optional(), origine: z.string() });

const defaultAssurance = () => ({ cents: null, certainty: 'approx' as const, source: 'Assurance groupe / vie (organisme assureur)' });
const defaultAssuranceFils = () => ({ cents: null, certainty: 'approx' as const, source: 'Assurance groupe / vie au profit du fils survivant (organisme assureur)' });

/** Ajouté le 18/11/2026 : valeur par défaut pour les données enregistrées avant (pas de changement de version). */
export const defaultSuccFilsPredecede = () => ({
  testament: 'inconnu' as const, descendants: 'inconnu' as const, residenceCommune: 'inconnu' as const,
  autresBiensNets: { cents: null, certainty: 'approx' as const, source: 'Succession du fils prédécédé (notaire)' },
  assuranceTaxee: 'inconnu' as const, assuranceFilsTaxee: 'inconnu' as const, assuranceFilsSuivant: 'inconnu' as const,
  baseNP: 'a_confirmer' as const, coefNP: null, supplementCohabitant: 'inconnu' as const,
  droitsNotaire: { beneficiaire: null, pere: null, fils: null },
  // Contrats connus au 20/11/2026 (situation de base).
  ...CONTRATS_CONNUS(),
});
const existence = z.enum(['inconnu', 'non', 'possible', 'oui']);
/** Données enregistrées avant le 19/11/2026 (sans « existe ? ») : un montant > 0 vaut « oui », 0 vaut « non », vide « inconnu ». */
const existeDepuis = (v: unknown) => {
  const c = (v as { cents?: unknown } | undefined)?.cents;
  return typeof c === 'number' ? (c > 0 ? 'oui' : 'non') : 'inconnu';
};
/**
 * Données enregistrées avant le 20/11/2026 (sans épargne-pension) : mise à jour unique avec les contrats connus.
 * Un contrat déjà renseigné (existence ≠ « je ne sais pas » ou montant saisi) est conservé tel quel.
 */
const avecContratsConnus = (o: Record<string, unknown>): Record<string, unknown> => {
  const k = CONTRATS_CONNUS();
  const vierge = (e: unknown, v: unknown) => (e === undefined || e === 'inconnu') && (v as { cents?: unknown } | undefined)?.cents == null;
  return {
    ...o,
    ...(vierge(o.assuranceExiste, o.assurance) ? { assuranceExiste: k.assuranceExiste, assurance: k.assurance } : {}),
    ...(vierge(o.assuranceFilsExiste, o.assuranceFils) ? { assuranceFilsExiste: k.assuranceFilsExiste, assuranceFils: k.assuranceFils } : {}),
    epargnePensionExiste: k.epargnePensionExiste, epargnePension: k.epargnePension, epargnePensionBeneficiaire: k.epargnePensionBeneficiaire,
  };
};
/**
 * Données enregistrées avec la première version de l'épargne-pension (commit fddcf5e, 20/11/2026) : laissée telle que
 * publiée (bénéficiaire « à établir » et note d'origine), elle passe à « la bénéficiaire » avec la note à jour.
 * Toute modification de l'utilisateur est conservée.
 */
const epargnePensionV2 = (o: Record<string, unknown>): Record<string, unknown> => {
  const e = o.epargnePension as { note?: unknown } | undefined;
  if (o.epargnePensionBeneficiaire !== 'inconnu' || e?.note !== NOTE_EPARGNE_PENSION_V1) return o;
  return { ...o, epargnePensionBeneficiaire: 'beneficiaire', epargnePension: { ...e, note: NOTE_EPARGNE_PENSION } };
};
const succFilsPredecede = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object') return raw;
  const r = raw as Record<string, unknown>;
  const o = { ...r, assuranceExiste: r.assuranceExiste ?? existeDepuis(r.assurance), assuranceFilsExiste: r.assuranceFilsExiste ?? existeDepuis(r.assuranceFils) };
  return r.epargnePensionExiste === undefined ? avecContratsConnus(o) : epargnePensionV2(o);
}, z.object({
  testament: z.enum(['inconnu', 'legs_beneficiaire', 'aucun']),
  descendants: z.enum(['inconnu', 'aucun', 'oui']),
  residenceCommune: z.enum(['inconnu', 'non', 'oui']),
  autresBiensNets: value,
  // Ajoutés le 18/11/2026 (T10) : valeurs par défaut pour les données enregistrées avant.
  assurance: value.default(defaultAssurance),
  assuranceTaxee: z.enum(['inconnu', 'oui', 'non']).default('inconnu'),
  // Ajoutés le 19/11/2026 (T13).
  assuranceFils: value.default(defaultAssuranceFils),
  assuranceFilsTaxee: z.enum(['inconnu', 'oui', 'non']).default('inconnu'),
  assuranceFilsSuivant: z.enum(['inconnu', 'beneficiaire', 'succession', 'autre']).default('inconnu'),
  baseNP: z.enum(['a_confirmer', 'pleine_propriete', 'nue_propriete']),
  coefNP: fracS.nullable(),
  supplementCohabitant: z.enum(['inconnu', 'appliquer', 'ne_pas_appliquer']),
  droitsNotaire: z.object({ beneficiaire: ncents, pere: ncents, fils: ncents }),
  // Ajoutés le 19/11/2026 (T15) : déduits du montant pour les données enregistrées avant (voir ci-dessus).
  assuranceExiste: existence,
  assuranceFilsExiste: existence,
  // Ajoutés le 20/11/2026 : complétés par `avecContratsConnus` pour les données enregistrées avant.
  epargnePensionExiste: existence,
  epargnePension: value,
  epargnePensionBeneficiaire: z.enum(['inconnu', 'beneficiaire', 'heritiers', 'fils', 'pere', 'autre']),
}));

const situation = z.object({
  region: z.literal('wallonie'),
  persons: z.array(z.object({ id: person, role: z.string(), lien: z.string(), heritierLegal: z.enum(['presume', 'non', 'a_confirmer']) })),
  house: z.object({
    label: z.string(), occupationDepuis: z.number().int(),
    valeurAncienne: value, valeurHypothese: value, valeurExpertise: value, valeurDecesFilsPredecede: value,
    dateDecesFilsPredecede: iso,
    sourceValeurCourante: z.enum(['hypothese', 'expertise', 'ancienne']),
    lots: z.array(lot),
    quartResolution: z.enum(['inconnu', 'beneficiaire_conserve', 'renonciation', 'personnalise']),
    quartPersonnalise: z.object({ holder, note: z.string() }),
    logementEligibilite: z.enum(['inconnu', 'hypothese_eligible', 'eligible_confirme', 'non_eligible']),
    logementSituation: z.enum(['conserve', 'demenagement_volontaire', 'depart_justifie', 'inconnu']),
  }),
  postes: z.array(z.object({
    id: z.string(), label: z.string(), kind: z.enum(['compte', 'titres', 'autre_avoir', 'dette', 'frais_funeraires', 'autres_frais', 'prelevement']),
    value, liquide: z.boolean(), deductible: z.enum(['oui', 'non', 'a_confirmer']), payePar: z.union([person, z.literal('succession')]),
  })),
  creance: z.object({
    nominal: value, remboursements: z.array(cents), recouvre: value,
    traitementFiscal: z.enum(['a_confirmer', 'actif_valide', 'exclu']), inclusion: z.enum(['exclue', 'solde_nominal', 'montant_recouvre']),
    dejaEncaisse: z.boolean(), dateRecouvrement: iso.nullable(),
  }),
  bilanMode: z.enum(['A', 'B']),
  soldeAuDecesB: value,
  budget: z.object({
    pensionMensuelle: value, depensesMensuelles: value, soinsMensuels: value, reserveMinimale: value, travaux: value, prixRelogement: value,
    dureeMois: z.number().int().nonnegative().nullable(),
  }),
  horsPerimetre: z.object({ changementRegion: z.boolean(), indivisionLitigieuse: z.boolean(), chargesParticulieres: z.boolean(), decesDonataireAvantDonateur: z.boolean(), plusValueCession: z.boolean() }),
  succFilsPredecede: succFilsPredecede.default(defaultSuccFilsPredecede),
});

const evBase = { id: z.string(), date: iso, order: z.number().int(), note: z.string().optional() };
const event = z.discriminatedUnion('type', [
  z.object({ ...evBase, type: z.literal('donation_immobiliere'), fraction: fracS, donataire: donee, reserveUsufruit: z.boolean(), valeurBien: ncents, fraisActe: value, droitsPayesPar: person, fraisPayesPar: person }),
  z.object({ ...evBase, type: z.literal('don_bancaire'), montant: ncents, donataire: donee, statut: z.enum(['prevu', 'realise_non_enregistre', 'enregistrement_confirme']), dateEnregistrement: iso.nullable(), droitsPayesPar: person, fraisEnregistrement: value }),
  z.object({ ...evBase, type: z.literal('vente'), prix: ncents, frais: value, fraisRepartition: z.union([z.literal('prorata'), holder]), mode: z.enum(['coefficient', 'montants_saisis']), coefUsufruit: fracS.nullable(), coefParLot: z.record(fracS.nullable()), montantsSaisis: z.record(ncents), accordsConfirmes: z.boolean() }),
  z.object({ ...evBase, type: z.literal('cession_quote_part'), lotId: z.string(), de: holder, vers: holder, prix: ncents, frais: value, statut: z.enum(['hypothese', 'confirme_notaire']) }),
  z.object({ ...evBase, type: z.literal('depense'), label: z.string(), montant: ncents }),
  z.object({ ...evBase, type: z.literal('recette'), label: z.string(), montant: ncents }),
]);

const scenario = z.object({
  id: z.string(), name: z.string().max(200), templateId: z.string(),
  deathDate: iso.nullable(), valeurMaisonDeces: ncents,
  rulesMode: z.enum(['auto', 'constant2026', 'decret2024', 'annonce2026', 'manuel']),
  reserveProgressivite: z.enum(['inconnu', 'appliquer', 'ne_pas_appliquer']),
  abattementLegataire: z.enum(['non', 'oui_confirme']),
  manualDeathTax: z.record(ncents),
  events: z.array(event),
  legs: z.array(z.object({ id: z.string(), beneficiaire: donee, montant: ncents, actif: z.boolean(), imputation: z.enum(['aucune', 'imputation_confirmee']), droitsACharge: z.enum(['legataire', 'heritier']) })),
  snapshot: z.object({ savedAt: iso, ruleIds: z.array(z.string()), fiscalTotal: ncents, label: z.string() }).nullable(),
  notes: z.string(),
});

export const stateSchema = z.object({
  schemaVersion: z.literal(1),
  situation,
  scenarios: z.array(scenario).max(50),
  selectedIds: z.array(z.string()),
  activeId: z.string().nullable(),
});

export const exportSchema = z.object({
  app: z.literal(APP_ID),
  schemaVersion: z.literal(SCHEMA_VERSION),
  exportedAt: iso,
  avertissement: z.string(),
  noms: z.record(z.string()).optional(),
  state: stateSchema,
});

export type ExportFile = z.infer<typeof exportSchema>;

/**
 * Migrations successives. v0 (prototype) : montants en euros décimaux sous `house.value` et
 * `savings` — converti en v1 (centimes, postes). Toute version future inconnue est refusée.
 */
export function migrate(raw: unknown): { ok: true; data: unknown; migratedFrom?: number } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Fichier JSON vide ou invalide.' };
  const r = raw as Record<string, unknown>;
  if (r.app !== APP_ID) return { ok: false, error: 'Ce fichier ne provient pas du simulateur.' };
  const v = typeof r.schemaVersion === 'number' ? r.schemaVersion : 0;
  if (v > SCHEMA_VERSION) return { ok: false, error: `Version de fichier ${v} plus récente que l’application (${SCHEMA_VERSION}).` };
  if (v === SCHEMA_VERSION) return { ok: true, data: raw };
  if (v === 0) {
    // Format v0 : { app, houseValue (euros), savings (euros), scenarios: [...v1 scenarios] }
    return { ok: false, error: 'Format v0 : utilisez migrateV0(base, fichier).' };
  }
  return { ok: false, error: `Version ${v} non prise en charge.` };
}

export function migrateV0(base: AppState, raw: { houseValue?: number; savings?: number }): AppState {
  const s = structuredClone(base);
  if (typeof raw.houseValue === 'number') s.situation.house.valeurHypothese.cents = Math.round(raw.houseValue * 100);
  if (typeof raw.savings === 'number' && s.situation.postes[0]) s.situation.postes[0].value.cents = Math.round(raw.savings * 100);
  return s;
}
