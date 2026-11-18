import type { Cents } from '../util/money';
import type { Frac } from '../util/fraction';
import type { ISODate } from '../util/dates';

/** Rôles anonymes. Les noms affichés ne vivent que dans le navigateur (voir persistence/names). */
export type PersonId = 'pere' | 'fils' | 'beneficiaire' | 'petitFils' | 'filsPredecede';
/**
 * Titulaire d'un droit sur un lot. « quart » = le quart en nue-propriété du fils prédécédé,
 * dont le titulaire final dépend de la succession ouverte (jamais présenté comme certain).
 */
export type HolderId = 'pere' | 'fils' | 'beneficiaire' | 'petitFils' | 'quart';
/** Donataires / légataires couverts par le périmètre (ligne directe). */
export type Donee = 'fils' | 'petitFils';

/** Degré de fiabilité d'une valeur saisie. `null` = non renseigné (≠ 0). */
export type Certainty = 'approx' | 'manuel' | 'verifie';

export interface Value {
  cents: Cents | null;
  certainty: Certainty;
  /** Provenance : « rendez-vous notaire », « estimation agence », « extrait bancaire »... */
  source: string;
  note?: string;
}

export interface Person {
  id: PersonId;
  role: string;
  lien: string;
  /** Héritier légal présumé du père ? */
  heritierLegal: 'presume' | 'non' | 'a_confirmer';
}

/** Lot fractionnaire du bien : pleine propriété (pp) OU couple nue-propriété (np) / usufruit (us). */
export interface Lot {
  id: string;
  share: Frac;
  pp?: HolderId;
  np?: HolderId;
  us?: HolderId;
  origine: string;
}

export type HouseValueSource = 'hypothese' | 'expertise' | 'ancienne';
export type QuartResolution = 'inconnu' | 'beneficiaire_conserve' | 'renonciation' | 'personnalise';
export type LogementEligibilite = 'inconnu' | 'hypothese_eligible' | 'eligible_confirme' | 'non_eligible';
export type LogementSituation = 'conserve' | 'demenagement_volontaire' | 'depart_justifie' | 'inconnu';

export interface House {
  label: string;
  occupationDepuis: number;
  valeurAncienne: Value;
  valeurHypothese: Value;
  valeurExpertise: Value;
  /** Valeur au jour du décès du fils prédécédé — champ distinct, à confirmer. */
  valeurDecesFilsPredecede: Value;
  dateDecesFilsPredecede: ISODate;
  sourceValeurCourante: HouseValueSource;
  lots: Lot[];
  quartResolution: QuartResolution;
  /** Titulaire validé par le notaire si `personnalise` (cession, renonciation, autre bénéficiaire). */
  quartPersonnalise: { holder: HolderId; note: string };
  logementEligibilite: LogementEligibilite;
  logementSituation: LogementSituation;
}

export type PosteKind = 'compte' | 'titres' | 'autre_avoir' | 'dette' | 'frais_funeraires' | 'autres_frais' | 'prelevement';

export interface Poste {
  id: string;
  label: string;
  kind: PosteKind;
  value: Value;
  /** Mobilisable sans vendre un bien non liquide. */
  liquide: boolean;
  /** Déductible fiscalement au décès (dettes, frais funéraires admissibles). */
  deductible: 'oui' | 'non' | 'a_confirmer';
  /** Qui supporte la dépense de trésorerie. */
  payePar: PersonId | 'succession';
}

export interface Creance {
  nominal: Value;
  remboursements: Cents[];
  recouvre: Value;
  traitementFiscal: 'a_confirmer' | 'actif_valide' | 'exclu';
  /** Par défaut la créance n'est PAS ajoutée aux avoirs. */
  inclusion: 'exclue' | 'solde_nominal' | 'montant_recouvre';
  /** Le montant recouvré est-il déjà crédité sur les comptes ? (évite le double comptage) */
  dejaEncaisse: boolean;
  dateRecouvrement: ISODate | null;
}

export interface Budget {
  pensionMensuelle: Value;
  depensesMensuelles: Value;
  soinsMensuels: Value;
  reserveMinimale: Value;
  travaux: Value;
  prixRelogement: Value;
  dureeMois: number | null;
}

/**
 * Succession du fils prédécédé (décès du 07/10/2026) : hypothèses utiles à l'estimation des droits
 * selon que la bénéficiaire accepte ou renonce. La dévolution complète n'est pas calculée :
 * seule la part de la maison et un total « autres biens nets » sont pris en compte.
 */
export interface SuccessionFilsPredecede {
  testament: 'inconnu' | 'legs_beneficiaire' | 'aucun';
  descendants: 'inconnu' | 'aucun' | 'oui';
  /** La maison était-elle la résidence commune du couple ? (usufruit légal du cohabitant, exemption logement) */
  residenceCommune: 'inconnu' | 'non' | 'oui';
  /** Autres biens nets de la succession (après dettes), supposés suivre la même dévolution que la part de maison. */
  autresBiensNets: Value;
  /**
   * Assurance groupe / vie versée à la bénéficiaire désignée : hors succession civile (les dettes ne s'y
   * imputent pas), en principe soumise aux droits de succession dans son chef (art. 8 C. succ., à confirmer).
   * Conservée même si elle renonce à la succession.
   */
  assurance: Value;
  assuranceTaxee: 'inconnu' | 'oui' | 'non';
  /** Base taxable de la nue-propriété recueillie (règle d'évaluation non trouvée dans les sources consultées). */
  baseNP: 'a_confirmer' | 'pleine_propriete' | 'nue_propriete';
  /** Valeur de la nue-propriété en fraction de la pleine propriété (fournie par le notaire). */
  coefNP: Frac | null;
  /** Exemption supplémentaire de 12 500 € pour la cohabitante légale (formulée pour la ligne directe seulement). */
  supplementCohabitant: TriState;
  /** Droits calculés par le notaire : remplacent l'estimation. */
  droitsNotaire: { beneficiaire: Cents | null; pere: Cents | null; fils: Cents | null };
}

export interface HorsPerimetre {
  changementRegion: boolean;
  indivisionLitigieuse: boolean;
  chargesParticulieres: boolean;
  decesDonataireAvantDonateur: boolean;
  plusValueCession: boolean;
}

export interface Situation {
  region: 'wallonie';
  persons: Person[];
  house: House;
  postes: Poste[];
  creance: Creance;
  bilanMode: 'A' | 'B';
  /** Mode B : solde financier au décès, DÉJÀ net des donations et flux. */
  soldeAuDecesB: Value;
  budget: Budget;
  horsPerimetre: HorsPerimetre;
  succFilsPredecede: SuccessionFilsPredecede;
}

// ───────────── Scénarios et événements ─────────────

interface EventBase { id: string; date: ISODate; /** ordre explicite entre événements de même date */ order: number; note?: string }

export interface DonationImmo extends EventBase {
  type: 'donation_immobiliere';
  /** Fraction de la maison (pas de la moitié) donnée, prélevée sur la pleine propriété du père. */
  fraction: Frac;
  donataire: Donee;
  reserveUsufruit: boolean;
  /** Valeur du bien à la date de l'acte ; null → hérite de l'hypothèse de la situation. */
  valeurBien: Cents | null;
  fraisActe: Value;
  droitsPayesPar: PersonId;
  fraisPayesPar: PersonId;
}

export type DonStatut = 'prevu' | 'realise_non_enregistre' | 'enregistrement_confirme';

export interface DonBancaire extends EventBase {
  type: 'don_bancaire';
  montant: Cents | null;
  donataire: Donee;
  statut: DonStatut;
  dateEnregistrement: ISODate | null;
  droitsPayesPar: PersonId;
  fraisEnregistrement: Value;
}

export interface Vente extends EventBase {
  type: 'vente';
  /** Prix ; null → valeur de la maison à cette date selon l'hypothèse. */
  prix: Cents | null;
  frais: Value;
  fraisRepartition: 'prorata' | HolderId;
  mode: 'coefficient' | 'montants_saisis';
  /** Coefficient économique d'usufruit CONVENU (pas déduit de l'âge), commun à tous les lots démembrés. */
  coefUsufruit: Frac | null;
  /** Surcharges par lot (id → coefficient). */
  coefParLot: Record<string, Frac | null>;
  montantsSaisis: Partial<Record<HolderId, Cents | null>>;
  accordsConfirmes: boolean;
}

export interface Cession extends EventBase {
  type: 'cession_quote_part';
  lotId: string;
  de: HolderId;
  vers: HolderId;
  prix: Cents | null;
  frais: Value;
  statut: 'hypothese' | 'confirme_notaire';
}

export interface Flux extends EventBase {
  type: 'depense' | 'recette';
  label: string;
  montant: Cents | null;
}

export type SimEvent = DonationImmo | DonBancaire | Vente | Cession | Flux;

export interface Legs {
  id: string;
  beneficiaire: Donee;
  montant: Cents | null;
  actif: boolean;
  /** Imputation des dons antérieurs sur le legs, seulement si une clause est confirmée. */
  imputation: 'aucune' | 'imputation_confirmee';
  droitsACharge: 'legataire' | 'heritier';
}

/**
 * auto : profil en vigueur à la date ; au-delà, « projection non disponible ».
 * constant2026 : contrefactuel explicite (barème actuel figé).
 * decret2024 : texte voté le 05/12/2024, applicable aux décès dès 2028 (non encore en vigueur).
 * annonce2026 : hypothèse personnalisée inspirée du communiqué du 12/10/2026.
 * manuel : montants de droits de succession saisis à la main.
 */
export type RulesMode = 'auto' | 'constant2026' | 'decret2024' | 'annonce2026' | 'manuel';
export type TriState = 'inconnu' | 'appliquer' | 'ne_pas_appliquer';

export interface ResultSnapshot {
  savedAt: ISODate;
  ruleIds: string[];
  fiscalTotal: Cents | null;
  label: string;
}

export interface Scenario {
  id: string;
  name: string;
  templateId: string;
  deathDate: ISODate | null;
  /** Valeur de la maison au décès ; null → hérite de l'hypothèse. */
  valeurMaisonDeces: Cents | null;
  rulesMode: RulesMode;
  reserveProgressivite: TriState;
  /** Abattement pour un légataire non héritier légal (ex. petit-fils) : non par défaut. */
  abattementLegataire: 'non' | 'oui_confirme';
  manualDeathTax: Partial<Record<PersonId, Cents | null>>;
  events: SimEvent[];
  legs: Legs[];
  snapshot: ResultSnapshot | null;
  notes: string;
}

export interface AppState {
  schemaVersion: 1;
  situation: Situation;
  scenarios: Scenario[];
  selectedIds: string[];
  activeId: string | null;
}
