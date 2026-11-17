import { euros } from '../util/money';
import { frac } from '../util/fraction';
import { lotsForRepartition } from '../domain/devolution';
import type { AppState, Scenario, Situation, Value, SimEvent, Legs } from './types';

const v = (e: number | null, certainty: Value['certainty'], source: string, note?: string): Value => ({
  cents: e === null ? null : euros(e),
  certainty,
  source,
  note,
});

/** Cas familial de démonstration : rôles anonymes, hypothèses modifiables, pas un titre de propriété. */
export function sampleSituation(): Situation {
  return {
    region: 'wallonie',
    persons: [
      { id: 'pere', role: 'Père', lien: 'Défunt simulé (donateur)', heritierLegal: 'non' },
      { id: 'fils', role: 'Fils survivant', lien: 'Enfant', heritierLegal: 'presume' },
      { id: 'filsPredecede', role: 'Fils prédécédé', lien: 'Enfant décédé le 07/10/2026', heritierLegal: 'non' },
      { id: 'beneficiaire', role: 'Bénéficiaire potentielle de la part du fils prédécédé', lien: 'Cohabitante légale du fils prédécédé', heritierLegal: 'non' },
      { id: 'petitFils', role: 'Petit-fils', lien: 'Petit-enfant (légataire ou donataire possible)', heritierLegal: 'non' },
    ],
    house: {
      label: 'Maison familiale (Gembloux)',
      occupationDepuis: 1974,
      valeurAncienne: v(250000, 'approx', 'Ancienne estimation'),
      valeurHypothese: v(300000, 'approx', 'Hypothèse de travail'),
      valeurExpertise: v(null, 'verifie', 'Expertise à commander'),
      valeurDecesFilsPredecede: v(null, 'approx', 'À confirmer (valeur au 07/10/2026)'),
      dateDecesFilsPredecede: '2026-10-07',
      sourceValeurCourante: 'hypothese',
      lots: lotsForRepartition('acte2005_reduction'),
      quartResolution: 'inconnu',
      quartPersonnalise: { holder: 'beneficiaire', note: '' },
      logementEligibilite: 'hypothese_eligible',
      logementSituation: 'conserve',
    },
    postes: [
      { id: 'P1', label: 'Comptes et placements (rendez-vous)', kind: 'compte', value: v(170000, 'approx', 'Rendez-vous', 'Estimation antérieure : 175 000 €'), liquide: true, deductible: 'non', payePar: 'pere' },
      { id: 'P2', label: 'Frais funéraires (si admissibles)', kind: 'frais_funeraires', value: v(null, 'approx', 'À estimer'), liquide: true, deductible: 'a_confirmer', payePar: 'succession' },
    ],
    creance: {
      nominal: v(15000, 'approx', 'Prêt au fils prédécédé'),
      remboursements: [euros(250), euros(250), euros(250), euros(250)],
      recouvre: v(null, 'approx', 'Selon liquidation de la succession du fils prédécédé'),
      traitementFiscal: 'a_confirmer',
      inclusion: 'exclue',
      dejaEncaisse: false,
      dateRecouvrement: null,
    },
    bilanMode: 'A',
    soldeAuDecesB: v(null, 'manuel', 'Solde au décès déjà net des flux'),
    budget: {
      pensionMensuelle: v(null, 'approx', ''),
      depensesMensuelles: v(null, 'approx', ''),
      soinsMensuels: v(null, 'approx', ''),
      reserveMinimale: v(null, 'manuel', ''),
      travaux: v(null, 'approx', ''),
      prixRelogement: v(null, 'approx', ''),
      dureeMois: null,
    },
    horsPerimetre: {
      changementRegion: false,
      indivisionLitigieuse: false,
      chargesParticulieres: false,
      decesDonataireAvantDonateur: false,
      plusValueCession: false,
    },
  };
}

let counter = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

export const DEFAULT_DEATH_DATE = '2027-11-30';
export const DEFAULT_ACT_DATE = '2026-12-15';

const baseScenario = (templateId: string, name: string): Scenario => ({
  id: newId('S'),
  name,
  templateId,
  deathDate: DEFAULT_DEATH_DATE,
  valeurMaisonDeces: null,
  rulesMode: 'auto',
  reserveProgressivite: 'inconnu',
  abattementLegataire: 'non',
  manualDeathTax: {},
  events: [],
  legs: [],
  snapshot: null,
  notes: '',
});

const blank = (certainty: Value['certainty'] = 'approx'): Value => ({ cents: null, certainty, source: '' });

export const mkDonBancaire = (montant: number, enregistre: boolean, donataire: 'fils' | 'petitFils' = 'fils', date = DEFAULT_ACT_DATE): SimEvent => ({
  id: newId('E'), type: 'don_bancaire', date, order: 0, montant: euros(montant), donataire,
  statut: enregistre ? 'enregistrement_confirme' : 'realise_non_enregistre',
  dateEnregistrement: enregistre ? date : null, droitsPayesPar: 'pere', fraisEnregistrement: { cents: 0, certainty: 'manuel', source: 'Enregistrement bancaire sans notaire (à confirmer)' },
});

export const mkDonationImmo = (date = DEFAULT_ACT_DATE): SimEvent => ({
  id: newId('E'), type: 'donation_immobiliere', date, order: 0, fraction: frac(1, 2), donataire: 'fils', reserveUsufruit: true,
  valeurBien: null, fraisActe: blank(), droitsPayesPar: 'fils', fraisPayesPar: 'fils',
});

export const mkVente = (date: string): SimEvent => ({
  id: newId('E'), type: 'vente', date, order: 1, prix: null, frais: blank(), fraisRepartition: 'prorata', mode: 'coefficient',
  coefUsufruit: null, coefParLot: {}, montantsSaisis: {}, accordsConfirmes: false,
});

export const mkFlux = (type: 'depense' | 'recette', date: string): SimEvent => ({
  id: newId('E'), type, date, order: 0, label: type === 'depense' ? 'Dépense' : 'Recette', montant: null,
});

export const mkCession = (date: string): SimEvent => ({
  id: newId('E'), type: 'cession_quote_part', date, order: 0, lotId: 'L3', de: 'quart', vers: 'fils', prix: null, frais: blank(), statut: 'hypothese',
});

export const mkLegs = (montant: number): Legs => ({
  id: newId('G'), beneficiaire: 'petitFils', montant: euros(montant), actif: true, imputation: 'aucune', droitsACharge: 'legataire',
});

export interface Template { id: string; label: string; description: string; build: () => Scenario }

export const TEMPLATES: Template[] = [
  { id: 'reference', label: 'Référence sans donation', description: 'Situation inchangée jusqu’au décès simulé.', build: () => baseScenario('reference', 'Référence sans donation') },
  ...([10000, 20000] as const).flatMap((m) => [
    { id: `don${m / 1000}k_enr`, label: `Don bancaire ${m / 1000} 000 € enregistré`, description: 'Droit de donation mobilière payé aujourd’hui ; exempté de rappel si l’enregistrement est confirmé.',
      build: () => ({ ...baseScenario(`don${m / 1000}k_enr`, `Don ${m / 1000} 000 € enregistré`), events: [mkDonBancaire(m, true)] }) },
    { id: `don${m / 1000}k_nenr`, label: `Don bancaire ${m / 1000} 000 € non enregistré`, description: 'Aucun droit immédiat ; rappel aux droits de succession si décès dans le délai.',
      build: () => ({ ...baseScenario(`don${m / 1000}k_nenr`, `Don ${m / 1000} 000 € non enregistré`), events: [mkDonBancaire(m, false)] }) },
  ]),
  ...([20000, 25000] as const).map((m) => ({
    id: `legs${m / 1000}k`, label: `Legs ${m / 1000} 000 € au petit-fils`, description: 'Disposition au décès (pas une sortie du vivant).',
    build: () => ({ ...baseScenario(`legs${m / 1000}k`, `Legs ${m / 1000} 000 € au petit-fils`), legs: [mkLegs(m)] }),
  })),
  { id: 'donation_immo', label: 'Donation immobilière avec usufruit', description: 'Le père donne 1/2 de la maison en nue-propriété au fils et se réserve l’usufruit.',
    build: () => ({ ...baseScenario('donation_immo', 'Donation de la moitié (réserve d’usufruit)'), events: [mkDonationImmo()] }) },
  { id: 'vente_actuelle', label: 'Vente avec droits actuels', description: 'Vente de toute la maison, répartition du prix selon les lots actuels.',
    build: () => ({ ...baseScenario('vente_actuelle', 'Vente (droits actuels)'), events: [mkVente('2027-03-01')] }) },
  { id: 'vente_apres_donation', label: 'Vente après donation', description: 'Donation de la moitié puis vente : le père ne perçoit plus que la valeur de son usufruit.',
    build: () => ({ ...baseScenario('vente_apres_donation', 'Vente après donation'), events: [mkDonationImmo(), mkVente('2027-06-01')] }) },
  { id: 'vente_puis_don', label: 'Vente puis don bancaire', description: 'Vente puis don bancaire enregistré de 20 000 € au fils.',
    build: () => {
      const s = baseScenario('vente_puis_don', 'Vente puis don bancaire');
      const d = mkDonBancaire(20000, true, 'fils', '2027-04-01');
      return { ...s, events: [mkVente('2027-03-01'), d] };
    } },
  { id: 'mixte', label: 'Scénario mixte', description: 'Donation de la moitié + don 10 000 € enregistré au petit-fils + legs 20 000 € (risque de double versement signalé).',
    build: () => ({ ...baseScenario('mixte', 'Mixte'), events: [mkDonationImmo(), mkDonBancaire(10000, true, 'petitFils')], legs: [mkLegs(20000)] }) },
];

export function defaultState(): AppState {
  const ref = TEMPLATES[0].build();
  const don = TEMPLATES.find((t) => t.id === 'don10k_enr')!.build();
  const immo = TEMPLATES.find((t) => t.id === 'donation_immo')!.build();
  return { schemaVersion: 1, situation: sampleSituation(), scenarios: [ref, don, immo], selectedIds: [ref.id, don.id, immo.id], activeId: immo.id };
}
