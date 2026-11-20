import { defaultState } from '../src/model/sample';
import type { AppState, Situation } from '../src/model/types';

/**
 * Remet les contrats d'assurance du fils prédécédé à « je ne sais pas encore » (montants vides) :
 * repères historiques calculés sans assurance, avant l'ajout des contrats connus (20/11/2026).
 */
export function sansContrats<T extends Situation>(s: T): T {
  const o = s.succFilsPredecede;
  o.assuranceExiste = 'inconnu'; o.assurance.cents = null;
  o.assuranceFilsExiste = 'inconnu'; o.assuranceFils.cents = null;
  o.epargnePensionExiste = 'inconnu'; o.epargnePension.cents = null;
  return s;
}

export const etatSansContrats = (): AppState => { const st = defaultState(); sansContrats(st.situation); return st; };
