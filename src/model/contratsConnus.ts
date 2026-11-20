import type { SuccessionFilsPredecede } from './types';

/**
 * Contrats d'assurance du fils prédécédé connus au 20/11/2026 (situation de base, modifiable dans l'onglet
 * « Succession du fils prédécédé »). Montants indicatifs : à remplacer par les décomptes des assureurs.
 * Aucun nom de personne : uniquement des rôles.
 */
export const CONTRATS_CONNUS = (): Pick<SuccessionFilsPredecede,
  'assuranceExiste' | 'assurance' | 'assuranceFilsExiste' | 'assuranceFils' | 'epargnePensionExiste' | 'epargnePension' | 'epargnePensionBeneficiaire'> => ({
  assuranceExiste: 'oui',
  assurance: {
    cents: 200_000_00, certainty: 'approx', source: 'Assurance groupe Ethias',
    note: 'Montant exact inconnu (hypothèse 200 000 €). Versement annoncé comme accepté ; modalités à connaître (décompte, retenues).',
  },
  assuranceFilsExiste: 'oui',
  assuranceFils: { cents: 15_000_00, certainty: 'approx', source: 'Assurance groupe Beobank', note: 'Montant indicatif, à confirmer par l’assureur.' },
  epargnePensionExiste: 'oui',
  epargnePension: {
    cents: 50_000_00, certainty: 'approx', source: 'Épargne-pension AXA',
    note: NOTE_EPARGNE_PENSION,
  },
  epargnePensionBeneficiaire: 'beneficiaire',
});

export const NOTE_EPARGNE_PENSION = 'Bénéficiaire désignée : la cohabitante. L’assureur refuserait le versement (exclusion du suicide, information du 19/11/2026) : réponse écrite et sort de la réserve à obtenir.';
/** Note publiée le 20/11/2026 (commit fddcf5e), avant de savoir que la cohabitante est la bénéficiaire désignée. */
export const NOTE_EPARGNE_PENSION_V1 = 'Non versée à la cohabitante : l’assureur refuserait le versement (exclusion du suicide, information du 19/11/2026). Réponse écrite, clause bénéficiaire et sort de la réserve à obtenir.';
