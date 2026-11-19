import { euros, type Cents } from '../util/money';
import { cmpISO, type ISODate } from '../util/dates';
import type { RulesMode } from '../model/types';

export type RuleStatus = 'en_vigueur' | 'vote_non_en_vigueur' | 'annonce' | 'personnalise' | 'contrefactuel';

export const STATUS_LABEL: Record<RuleStatus, string> = {
  en_vigueur: 'En vigueur',
  vote_non_en_vigueur: 'Voté, pas encore en vigueur',
  annonce: 'Annoncé (non publié)',
  personnalise: 'Hypothèse personnalisée',
  contrefactuel: 'Contrefactuel (barème figé)',
};

/** Tranche : jusqu'à `upTo` (inclus, en centimes ; null = sans limite) au taux `bp` (points de base). */
export interface Bracket { upTo: Cents | null; bp: number }

export interface RuleSource { titre: string; url: string; article?: string; consulte: ISODate; dateEffet?: string; constat: string }

export const CONSULTATION = '2026-11-17';

export const SOURCES = {
  spfSuccession: {
    titre: 'SPF Finances — Payer les droits de succession (Bruxelles / Wallonie)',
    url: 'https://fin.belgium.be/fr/particuliers/famille/deces/droits-succession/bruxelles-wallonie/calcul-paiement',
    consulte: CONSULTATION,
    constat: 'Barème ligne directe 3/4/5/7/10/14/18/24/30 % ; taux réduit logement 1/2/5/12/24/30 % ; exemption 12 500 € + 12 500 € si part nette ≤ 125 000 € ; pas de règle d’empilement logement/reste écrite ; pas de réserve de progressivité mentionnée.',
  },
  spfDonations: {
    titre: 'SPF Finances — Donations',
    url: 'https://fin.belgium.be/fr/particuliers/autres-services/donations',
    consulte: CONSULTATION,
    constat: 'Wallonie : donation mobilière ligne directe 3,3 % ; immobilière 3/9/18/27 % (tranches 150 000 / 250 000 / 450 000) ; rappel des dons non enregistrés si décès dans les cinq ans, trois ans pour les dons faits avant le 01/01/2022. Aucune règle de cumul ni date d’effet indiquée.',
  },
  decret2024: {
    titre: 'Décret wallon du 5 décembre 2024 portant réforme de la fiscalité wallonne (M.B. 13/12/2024)',
    url: 'https://wallex.wallonie.be/eli/loi-decret/2024/12/05/2024011274',
    article: 'art. 3 (CDS 48), 5 (CDS 54), 7 (CDS 60ter), 21 (CDE 131), 30 (entrée en vigueur)',
    consulte: CONSULTATION,
    dateEffet: 'Décès à partir du 01/01/2028 (art. 2 à 7) ; actes de donation immobilière à partir du 01/01/2028 (art. 21)',
    constat: 'Nouveau barème succession 3/4/5/7/9/12/15 % ; logement 1/2/5/7/12/15 % ; exemption 25 000 € pour l’héritier en ligne directe « appelé légalement à la succession » ; donation immobilière 3/6/10/14 %. Ne contient ni rappel 3→5 ans ni réserve de progressivité.',
  },
  annonce2026: {
    titre: 'Gouvernement wallon — communiqué du 12/10/2026 « Trajectoire budgétaire 2027-2029 »',
    url: 'https://wallonie.be/fr/acteurs-et-institutions/wallonie/gouvernement-de-wallonie/communiques-presse/2026-10-12',
    consulte: CONSULTATION,
    dateEffet: 'Annoncé pour le 01/01/2028 — texte juridique non identifié',
    constat: 'Annonce (lue partiellement via résumé) : exonération des 75 000 premiers euros de la part nette de chaque bénéficiaire dès 2028, au-delà « aux taux actuels » ; maintien de la baisse des droits de donation votée en 2024. Pas d’information sur logement, legs, délais ni réserve de progressivité.',
  },
  spfTarifsAutres: {
    titre: 'SPF Finances — Payer les droits de succession (Wallonie) : taux par lien de parenté',
    url: 'https://fin.belgium.be/fr/particuliers/famille/deces/droits-succession/bruxelles-wallonie/calcul-paiement',
    consulte: '2026-11-18',
    constat: 'Un seul barème « entre conjoints, cohabitants légaux et héritiers en ligne directe ». Frères et sœurs : 20 % jusqu’à 12 500 €, 25 % jusqu’à 25 000 €, 35 % jusqu’à 75 000 €, 50 % jusqu’à 175 000 €, 65 % au-delà. Exemption de la première tranche de 12 500 € pour « le conjoint, cohabitant légal ou héritier en ligne directe » ; supplément de 12 500 € (part nette ≤ 125 000 €) formulé pour « l’héritier en ligne directe » seulement. Aucun abattement pour les frères et sœurs. Rien sur la renonciation ni sur l’évaluation de la nue-propriété.',
  },
  spfTarifsNonParents: {
    titre: 'SPF Finances — Payer les droits de succession (Wallonie) : taux « entre autres personnes »',
    url: 'https://fin.belgium.be/fr/particuliers/famille/deces/droits-succession/bruxelles-wallonie/calcul-paiement',
    consulte: '2026-11-19',
    constat: 'Entre autres personnes : 30 % jusqu’à 12 500 €, 35 % jusqu’à 25 000 €, 60 % jusqu’à 75 000 €, 80 % au-delà (cumuls 3 750 / 8 125 / 38 125 / 118 125 €). Rien sur les assurances-vie (art. 8) dans la partie lue mot à mot.',
  },
  spfDonationsAutres: {
    titre: 'SPF Finances — Donations (Région wallonne, biens mobiliers)',
    url: 'https://fin.belgium.be/fr/particuliers/autres-services/donations',
    consulte: '2026-11-19',
    constat: 'Biens mobiliers : 3,3 % en ligne directe, entre époux et cohabitants légaux ; 5,5 % « entre toutes les autres personnes ». Don manuel ou bancaire non enregistré : aucun droit de donation, mais droits de succession si le donateur décède dans les cinq ans (trois ans pour les dons non enregistrés avant le 01/01/2022).',
  },
  notaire: {
    titre: 'Notaire.be — Usufruit et nue-propriété',
    url: 'https://www.notaire.be/usufruit-et-nue-propriete',
    consulte: CONSULTATION,
    constat: 'Valeur de l’usufruit fixée d’un commun accord ou, à défaut, par le juge selon les tables de conversion ; extinction au décès de l’usufruitier sans frais ni droits de succession ; la page ne traite pas de la répartition du prix de vente.',
  },
} satisfies Record<string, RuleSource>;

const b = (upTo: number | null, pct: number): Bracket => ({ upTo: upTo === null ? null : euros(upTo), bp: Math.round(pct * 100) });

export interface SuccessionProfile {
  id: string;
  label: string;
  statut: RuleStatus;
  /** Décès couverts. */
  validFrom: ISODate | null;
  validTo: ISODate | null;
  ordinaire: Bracket[];
  logement: Bracket[] | null;
  /** Exemption en ligne directe (imputée sur les tranches les plus basses). */
  abattement: { base: Cents; supplement: { seuilPartNette: Cents; montant: Cents } | null; supplementStatut: 'verifie' | 'a_confirmer'; reserveHeritierLegal: 'oui' | 'a_confirmer' };
  /** Exonération annoncée par bénéficiaire (remplace l'abattement dans l'hypothèse « annonce »). */
  exonerationBeneficiaire: Cents | null;
  /** Rappel des donations mobilières non enregistrées. */
  rappel: { ans: number; ansAvant: number; avantDate: ISODate };
  /** Réserve de progressivité immobilière : non trouvée dans les sources consultées. */
  reserveProgressivite: { statut: 'non_verifie'; ans: number };
  sources: RuleSource[];
  notes: string[];
  postesCouverts: string[];
}

export interface DonationProfile {
  id: string;
  label: string;
  statut: RuleStatus;
  /** Actes couverts. */
  validFrom: ISODate | null;
  validTo: ISODate | null;
  mobilierBp: number;
  /** Donation mobilière entre toutes les autres personnes (hors ligne directe, époux, cohabitants légaux). */
  mobilierAutresBp: number;
  immobilier: Bracket[];
  cumul: 'non_verifie';
  sources: RuleSource[];
  notes: string[];
}

const ORDINAIRE_ACTUEL = [b(12500, 3), b(25000, 4), b(50000, 5), b(100000, 7), b(150000, 10), b(200000, 14), b(250000, 18), b(500000, 24), b(null, 30)];
const LOGEMENT_ACTUEL = [b(25000, 1), b(50000, 2), b(175000, 5), b(250000, 12), b(500000, 24), b(null, 30)];

export const SUCC_ACTUEL: SuccessionProfile = {
  id: 'WAL-SUCC-ACTUEL',
  label: 'Wallonie — droits de succession, profil en vigueur (barème actuel)',
  statut: 'en_vigueur',
  validFrom: null,
  validTo: '2027-12-31',
  ordinaire: ORDINAIRE_ACTUEL,
  logement: LOGEMENT_ACTUEL,
  abattement: { base: euros(12500), supplement: { seuilPartNette: euros(125000), montant: euros(12500) }, supplementStatut: 'verifie', reserveHeritierLegal: 'a_confirmer' },
  exonerationBeneficiaire: null,
  rappel: { ans: 5, ansAvant: 3, avantDate: '2022-01-01' },
  reserveProgressivite: { statut: 'non_verifie', ans: 3 },
  sources: [SOURCES.spfSuccession, SOURCES.spfDonations, SOURCES.decret2024],
  notes: [
    'Fin de validité au 31/12/2027 déduite de l’art. 30 du décret du 05/12/2024 (nouveau barème pour les décès dès le 01/01/2028).',
    'Le texte consolidé du Code wallon des droits de succession (art. 54, 60ter, 66bis, 66ter) n’a pas pu être lu : le PDF de 2019 était illisible.',
    'Empilement logement / reste : le reste de la part est placé dans le barème ordinaire au-dessus de la part logement (cohérent avec le repère de 38 425 €, mais non écrit sur la page SPF consultée).',
    'Exemption supplémentaire pour enfants de moins de 21 ans et réduction pour enfants à charge : non modélisées (sans objet dans le cas d’exemple).',
  ],
  postesCouverts: ['succession ligne directe', 'logement familial (taux réduit)', 'exemption art. 54', 'rappel des dons mobiliers non enregistrés', 'legs à un descendant'],
};

export const SUCC_DECRET_2024: SuccessionProfile = {
  id: 'WAL-SUCC-2028-DECRET',
  label: 'Wallonie — barème du décret du 05/12/2024 (décès dès 2028)',
  statut: 'vote_non_en_vigueur',
  validFrom: '2028-01-01',
  validTo: null,
  ordinaire: [b(12500, 3), b(25000, 4), b(150000, 5), b(200000, 7), b(250000, 9), b(500000, 12), b(null, 15)],
  logement: [b(25000, 1), b(50000, 2), b(175000, 5), b(250000, 7), b(500000, 12), b(null, 15)],
  abattement: { base: euros(25000), supplement: null, supplementStatut: 'a_confirmer', reserveHeritierLegal: 'oui' },
  exonerationBeneficiaire: null,
  rappel: { ans: 5, ansAvant: 3, avantDate: '2022-01-01' },
  reserveProgressivite: { statut: 'non_verifie', ans: 3 },
  sources: [SOURCES.decret2024, SOURCES.annonce2026],
  notes: [
    'Texte voté et publié, mais le communiqué du 12/10/2026 annonce une autre réforme pour la même date : ce profil peut être modifié avant d’entrer en vigueur.',
    'Forfaits de dettes (1 500 €) et de frais funéraires (5 000 €) de l’art. 27ter nouveau : non appliqués automatiquement.',
    'Maintien éventuel d’un supplément d’exemption pour les parts ≤ 125 000 € : non lisible dans le texte modificatif, à confirmer.',
  ],
  postesCouverts: ['succession ligne directe', 'logement familial', 'exemption art. 54 nouveau'],
};

export const SUCC_ANNONCE_2026: SuccessionProfile = {
  ...SUCC_ACTUEL,
  id: 'HYP-SUCC-ANNONCE-2026',
  label: 'Hypothèse personnalisée inspirée du communiqué du 12/10/2026',
  statut: 'annonce',
  validFrom: '2028-01-01',
  validTo: null,
  abattement: { base: 0, supplement: null, supplementStatut: 'a_confirmer', reserveHeritierLegal: 'a_confirmer' },
  exonerationBeneficiaire: euros(75000),
  sources: [SOURCES.annonce2026],
  notes: [
    'ANNONCE, PAS UNE RÈGLE : 75 000 € exonérés sur la part nette de chaque bénéficiaire, barème actuel au-delà.',
    'Interaction avec le logement familial, les legs, les donations et l’exemption actuelle : non vérifiée. Ici, l’exonération remplace l’exemption de 12 500 € et le taux réduit logement est conservé — choix arbitraire de modélisation.',
  ],
  postesCouverts: ['projection indicative'],
};

export const SUCC_CONSTANT_2026: SuccessionProfile = {
  ...SUCC_ACTUEL,
  id: 'CF-SUCC-CONSTANT-2026',
  label: 'Comparaison à barème 2026 constant (contrefactuel)',
  statut: 'contrefactuel',
  validFrom: null,
  validTo: null,
  notes: ['CONTREFACTUEL : barème actuel appliqué quelle que soit la date du décès. Ce n’est pas une prédiction du droit applicable après 2027.', ...SUCC_ACTUEL.notes],
};

/** Succession entre frères et sœurs (profil en vigueur) : pas d'exemption art. 54, pas de taux réduit logement. */
export const SUCC_FRERES_SOEURS: SuccessionProfile = {
  ...SUCC_ACTUEL,
  id: 'WAL-SUCC-FRERES-SOEURS',
  label: 'Wallonie — droits de succession entre frères et sœurs (barème actuel)',
  ordinaire: [b(12500, 20), b(25000, 25), b(75000, 35), b(175000, 50), b(null, 65)],
  logement: null,
  abattement: { base: 0, supplement: null, supplementStatut: 'verifie', reserveHeritierLegal: 'a_confirmer' },
  sources: [SOURCES.spfTarifsAutres],
  notes: ['Barème lu sur la page SPF Finances le 18/11/2026 ; aucun abattement prévu entre frères et sœurs.'],
  postesCouverts: ['succession entre frères et sœurs'],
};

/** Succession entre personnes non parentes (profil en vigueur) : rappel d'un don non enregistré fait à une belle-sœur, par ex. */
export const SUCC_AUTRES_PERSONNES: SuccessionProfile = {
  ...SUCC_ACTUEL,
  id: 'WAL-SUCC-AUTRES-PERSONNES',
  label: 'Wallonie — droits de succession entre autres personnes (barème actuel)',
  ordinaire: [b(12500, 30), b(25000, 35), b(75000, 60), b(null, 80)],
  logement: null,
  abattement: { base: 0, supplement: null, supplementStatut: 'verifie', reserveHeritierLegal: 'a_confirmer' },
  sources: [SOURCES.spfTarifsNonParents],
  notes: ['Barème lu sur la page SPF Finances le 19/11/2026 ; aucune exemption entre personnes non parentes.'],
  postesCouverts: ['succession entre personnes non parentes'],
};

export const DON_ACTUEL: DonationProfile = {
  id: 'WAL-DON-ACTUEL',
  label: 'Wallonie — droits de donation, profil en vigueur',
  statut: 'en_vigueur',
  validFrom: null,
  validTo: '2027-12-31',
  mobilierBp: 330,
  mobilierAutresBp: 550,
  immobilier: [b(150000, 3), b(250000, 9), b(450000, 18), b(null, 27)],
  cumul: 'non_verifie',
  sources: [SOURCES.spfDonations, SOURCES.spfDonationsAutres, SOURCES.decret2024],
  notes: ['Cumul de donations immobilières successives entre les mêmes parties : règle non trouvée dans les sources consultées, à vérifier.', 'Base d’une donation avec réserve d’usufruit : valeur de la pleine propriété du lot donné (pratique à confirmer par le notaire).'],
};

export const DON_2028: DonationProfile = {
  ...DON_ACTUEL,
  id: 'WAL-DON-2028-DECRET',
  label: 'Wallonie — donation immobilière, décret du 05/12/2024 (actes dès 2028)',
  statut: 'vote_non_en_vigueur',
  validFrom: '2028-01-01',
  validTo: null,
  immobilier: [b(150000, 3), b(250000, 6), b(450000, 10), b(null, 14)],
  sources: [SOURCES.decret2024, SOURCES.annonce2026],
  notes: ['Voté le 05/12/2024 (art. 21, CDE art. 131) ; le communiqué du 12/10/2026 annonce son maintien. Taux mobiliers 3,3 % et 5,5 % supposés inchangés (non visés par le décret).', ...DON_ACTUEL.notes],
};

export const DON_CONSTANT_2026: DonationProfile = { ...DON_ACTUEL, id: 'CF-DON-CONSTANT-2026', statut: 'contrefactuel', validTo: null, label: 'Donation à barème 2026 constant (contrefactuel)' };

export const ALL_PROFILES = [SUCC_ACTUEL, SUCC_FRERES_SOEURS, SUCC_AUTRES_PERSONNES, SUCC_DECRET_2024, SUCC_ANNONCE_2026, SUCC_CONSTANT_2026, DON_ACTUEL, DON_2028, DON_CONSTANT_2026];

export const REFORM_DATE = '2028-01-01';

export type SuccessionResolution =
  | { ok: true; profile: SuccessionProfile; warnings: string[] }
  | { ok: false; reason: string };

/** Choix du profil successoral selon la date de décès et le mode retenu. */
export function resolveSuccession(deathDate: ISODate, mode: RulesMode): SuccessionResolution {
  const after = cmpISO(deathDate, REFORM_DATE) >= 0;
  switch (mode) {
    case 'constant2026':
      return { ok: true, profile: SUCC_CONSTANT_2026, warnings: after ? ['Barème 2026 appliqué à un décès postérieur à 2027 : contrefactuel, pas une prédiction.'] : [] };
    case 'decret2024':
      if (!after) return { ok: true, profile: SUCC_ACTUEL, warnings: ['Décès avant 2028 : le profil en vigueur s’applique (le décret 2024 ne vise que les décès dès 2028).'] };
      return { ok: true, profile: SUCC_DECRET_2024, warnings: ['Profil voté mais pas encore en vigueur ; une réforme différente est annoncée pour 2028.'] };
    case 'annonce2026':
      if (!after) return { ok: true, profile: SUCC_ACTUEL, warnings: ['Décès avant 2028 : le profil en vigueur s’applique.'] };
      return { ok: true, profile: SUCC_ANNONCE_2026, warnings: ['Hypothèse personnalisée fondée sur une annonce : pas une règle applicable.'] };
    case 'manuel':
      return { ok: false, reason: 'Mode manuel : droits de succession saisis à la main.' };
    case 'auto':
    default:
      if (!after) return { ok: true, profile: SUCC_ACTUEL, warnings: [] };
      return { ok: false, reason: 'Projection non disponible : pour un décès dès le 01/01/2028, le barème voté en 2024 et la réforme annoncée le 12/10/2026 ne permettent pas de déterminer la règle applicable. Choisissez explicitement un profil (contrefactuel, décret 2024, hypothèse) ou saisissez les montants.' };
  }
}

export function resolveDonation(actDate: ISODate, mode: RulesMode): { profile: DonationProfile; warnings: string[] } {
  if (mode === 'constant2026') return { profile: DON_CONSTANT_2026, warnings: cmpISO(actDate, REFORM_DATE) >= 0 ? ['Acte postérieur à 2027 au barème 2026 : contrefactuel.'] : [] };
  if (cmpISO(actDate, REFORM_DATE) >= 0) return { profile: DON_2028, warnings: ['Acte dès 2028 : barème immobilier voté en 2024, pas encore en vigueur aujourd’hui.'] };
  return { profile: DON_ACTUEL, warnings: [] };
}
