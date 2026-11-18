import type { Lot } from '../model/types';
import { eq, frac } from '../util/fraction';

/**
 * Répartition de la maison issue de la succession de la mère (décès en 2005).
 *
 * Hypothèse commune : époux mariés sous séparation de biens, maison détenue pour moitié par chacun.
 * La part de la mère (1/2 de la maison) est dévolue selon l'acte de notoriété :
 * - donation de survie au conjoint (quotité la plus étendue), réductible vu les deux enfants ;
 * - « en cas de demande en réduction » : conjoint 1/3 en pleine propriété + 2/3 en usufruit,
 *   chaque fils 1/3 indivis en nue-propriété.
 *
 * Calcul indépendant (acte 2005, avec réduction) :
 *   père PP = 1/2 (moitié propre) + 1/3 × 1/2 = 1/2 + 1/6 = 2/3
 *   chaque fils NP = 1/3 × 1/2 = 1/6, usufruit du père sur ces 2 × 1/6 = 1/3
 *   total = 2/3 + 1/6 + 1/6 = 1
 */
export type RepartitionMere = 'acte2005_reduction' | 'donation_survie_integrale' | 'legale_moitie' | 'personnalisee';

export const REPARTITION_LABEL: Record<RepartitionMere, string> = {
  acte2005_reduction: 'Acte de 2005, réduction demandée : père 2/3 PP + usufruit sur 1/3 ; fils survivant 1/6 en NP ; fils prédécédé 1/6 en NP',
  donation_survie_integrale: 'Donation de survie sans réduction : père 100 % en pleine propriété',
  legale_moitie: 'Ancienne hypothèse : père 1/2 PP + usufruit sur 1/2 ; fils survivant 1/4 en NP ; fils prédécédé 1/4 en NP',
  personnalisee: 'Personnalisée (lots saisis dans le tableau)',
};

export const REPARTITION_NOTE: Record<RepartitionMere, string> = {
  acte2005_reduction: 'Acte de notoriété du 24/06/2005 : donation de survie réduite (art. 913 ancien C. civ.) — la mère laisse 1/3 PP + 2/3 US au conjoint, 1/3 NP au fils survivant et 1/3 NP au fils prédécédé. '
    + 'Situation reprise par le cadastre (MyMinfin, consulté le 18/11/2026 : père PP 4/6 + usufruit 2/6, chaque fils NP 1/6) ; le cadastre n’est pas un titre de propriété mais reprend la déclaration enregistrée.',
  donation_survie_integrale: 'Si aucun enfant n’a demandé la réduction, la donation de survie attribue au père toute la part de la mère : ni le fils survivant ni le fils prédécédé ne détiennent rien aujourd’hui. Le cadastre (consulté le 18/11/2026) indique au contraire que la réduction a été appliquée.',
  legale_moitie: 'Hypothèse utilisée avant la lecture de l’acte (usufruit sur toute la moitié de la mère).',
  personnalisee: 'Répartition modifiée à la main : vérifier qu’elle correspond aux titres.',
};

export function lotsForRepartition(r: Exclude<RepartitionMere, 'personnalisee'>): Lot[] {
  switch (r) {
    case 'acte2005_reduction':
      return [
        { id: 'L1', share: frac(2, 3), pp: 'pere', origine: 'Moitié propre du père + 1/3 en PP de la moitié de la mère (acte 2005)' },
        { id: 'L2', share: frac(1, 6), np: 'fils', us: 'pere', origine: 'Succession de la mère (acte 2005) : 1/3 en NP du fils survivant' },
        { id: 'L3', share: frac(1, 6), np: 'quart', us: 'pere', origine: 'Succession de la mère (acte 2005) : 1/3 en NP du fils prédécédé — succession ouverte' },
      ];
    case 'donation_survie_integrale':
      return [
        { id: 'L1', share: frac(1, 1), pp: 'pere', origine: 'Moitié propre du père + moitié de la mère (donation de survie non réduite)' },
      ];
    case 'legale_moitie':
      return [
        { id: 'L1', share: frac(1, 2), pp: 'pere', origine: 'Moitié du père (pleine propriété)' },
        { id: 'L2', share: frac(1, 4), np: 'fils', us: 'pere', origine: 'Succession de la mère : nue-propriété du fils survivant' },
        { id: 'L3', share: frac(1, 4), np: 'quart', us: 'pere', origine: 'Nue-propriété du fils prédécédé — succession ouverte' },
      ];
  }
}

const sameLots = (a: Lot[], b: Lot[]) =>
  a.length === b.length && a.every((l, i) => eq(l.share, b[i].share) && l.pp === b[i].pp && l.np === b[i].np && l.us === b[i].us);

/** Reconnaît le préréglage correspondant aux lots saisis (sinon « personnalisée »). */
export function detectRepartition(lots: Lot[]): RepartitionMere {
  for (const r of ['acte2005_reduction', 'donation_survie_integrale', 'legale_moitie'] as const) {
    if (sameLots(lots, lotsForRepartition(r))) return r;
  }
  return 'personnalisee';
}

/**
 * Préréglages proposés dans l'interface. L'ancienne hypothèse (1/2 + 1/4 + 1/4) n'est plus proposée :
 * la situation réelle est celle de l'acte de notoriété de 2005. Elle reste disponible pour les tests de repères.
 */
export const REPARTITIONS_PROPOSEES: RepartitionMere[] = ['acte2005_reduction', 'donation_survie_integrale', 'personnalisee'];

/**
 * Données enregistrées avant la lecture de l'acte : si les lots sont exactement ceux de l'ancienne hypothèse,
 * ils sont remplacés par la répartition de l'acte de 2005. Toute autre répartition (personnalisée…) est conservée.
 */
export function migrerAncienneRepartition(lots: Lot[]): { lots: Lot[]; migre: boolean } {
  return detectRepartition(lots) === 'legale_moitie'
    ? { lots: lotsForRepartition('acte2005_reduction'), migre: true }
    : { lots, migre: false };
}
