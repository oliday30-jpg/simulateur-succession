import { describe, expect, it } from 'vitest';
import { defaultState, sampleSituation } from '../src/model/sample';
import { stateSchema } from '../src/persistence/schema';
import { computeSuccFilsPredecede } from '../src/engine/succFilsPredecede';
import { euros as E } from '../src/util/money';

/** Contrats connus au 20/11/2026 : situation de base, et mise à jour unique des données enregistrées avant. */
describe('contrats d’assurance du fils prédécédé (situation de base)', () => {
  it('situation de base : 200 000 € à la bénéficiaire, 15 000 € au fils survivant, épargne-pension 50 000 € au bénéficiaire à établir', () => {
    const o = defaultState().situation.succFilsPredecede;
    expect(o.assuranceExiste).toBe('oui');
    expect(o.assurance).toMatchObject({ cents: E(200000), certainty: 'approx', source: 'Assurance groupe Ethias' });
    expect(o.assuranceFilsExiste).toBe('oui');
    expect(o.assuranceFils).toMatchObject({ cents: E(15000), source: 'Assurance groupe Beobank' });
    expect(o.epargnePensionExiste).toBe('oui');
    expect(o.epargnePension).toMatchObject({ cents: E(50000), source: 'Épargne-pension AXA' });
    expect(o.epargnePensionBeneficiaire).toBe('inconnu');
    // Modifiable : deux appels ne partagent pas les mêmes objets.
    defaultState().situation.succFilsPredecede.assurance.cents = 1;
    expect(defaultState().situation.succFilsPredecede.assurance.cents).toBe(E(200000));
  });

  /**
   * Calcul indépendant (décès 07/10/2026, barèmes 2026), maison 300 000 € → 1/6 = 50 000 € en pleine propriété,
   * testament pour la cohabitante, autres biens 0, assurances taxées, sans supplément d'exemption :
   *  - cohabitante (ligne directe) : 50 000 + 200 000 = 250 000 →
   *    375 + 500 + 1 250 + 3 500 + 5 000 + 7 000 + 9 000 = 26 625 ; exemption 12 500 € à 3 % (− 375) → 26 250 ;
   *  - fils survivant (frères et sœurs, sans exemption) : 15 000 → 12 500 × 20 % + 2 500 × 25 % = 2 500 + 625 = 3 125.
   *  L'épargne-pension (50 000 €) n'est pas comptée.
   */
  it('acceptation : 26 250 € pour la cohabitante + 3 125 € pour le fils survivant ; épargne-pension signalée, non comptée', () => {
    const s = sampleSituation();
    const o = s.succFilsPredecede;
    Object.assign(o, { testament: 'legs_beneficiaire', descendants: 'aucun', residenceCommune: 'non', baseNP: 'pleine_propriete', supplementCohabitant: 'ne_pas_appliquer', assuranceTaxee: 'oui', assuranceFilsTaxee: 'oui' });
    o.autresBiensNets.cents = 0;
    const r = computeSuccFilsPredecede(s);
    const [acc] = r.scenarios;
    expect(acc.rows.find((x) => x.id === 'beneficiaire')!.droits.value).toBe(E(26250));
    expect(acc.rows.find((x) => x.id === 'fils')!.droits.value).toBe(E(3125));
    expect(acc.total.value).toBe(E(29375));
    expect(r.avertissements.join(' ')).toMatch(/Épargne-pension \(50.000,00.€\) : bénéficiaire à établir.*non comptée/);
    o.epargnePensionBeneficiaire = 'heritiers';
    expect(computeSuccFilsPredecede(s).avertissements.join(' ')).toMatch(/héritiers légaux.*s’ajoute aux biens partagés/);
    o.epargnePensionExiste = 'non';
    expect(computeSuccFilsPredecede(s).avertissements.join(' ')).not.toMatch(/Épargne-pension/);
    expect(computeSuccFilsPredecede(s).scenarios[0].total.value).toBe(E(29375));
  });
});

describe('données enregistrées avant le 20/11/2026 (sans épargne-pension)', () => {
  const ancien = (f: (o: Record<string, unknown> & { assurance: { cents: number | null }; assuranceFils: { cents: number | null } }) => void) => {
    const st = defaultState() as unknown as { situation: { succFilsPredecede: Record<string, unknown> & { assurance: { cents: number | null }; assuranceFils: { cents: number | null } } } };
    const o = st.situation.succFilsPredecede;
    delete o.epargnePensionExiste; delete o.epargnePension; delete o.epargnePensionBeneficiaire;
    o.assuranceExiste = 'inconnu'; o.assurance.cents = null;
    o.assuranceFilsExiste = 'inconnu'; o.assuranceFils.cents = null;
    f(o);
    const p = stateSchema.safeParse(st);
    expect(p.success).toBe(true);
    return p.success ? p.data.situation.succFilsPredecede : null!;
  };

  it('contrats jamais renseignés : complétés avec les contrats connus', () => {
    const o = ancien(() => {});
    expect(o.assuranceExiste).toBe('oui');
    expect(o.assurance.cents).toBe(E(200000));
    expect(o.assuranceFils.cents).toBe(E(15000));
    expect(o.epargnePension.cents).toBe(E(50000));
    expect(o.epargnePensionBeneficiaire).toBe('inconnu');
  });

  it('contrats déjà renseignés par l’utilisateur : conservés (seule l’épargne-pension est ajoutée)', () => {
    const o = ancien((x) => { x.assuranceExiste = 'possible'; x.assurance.cents = E(180000); x.assuranceFilsExiste = 'non'; });
    expect(o.assuranceExiste).toBe('possible');
    expect(o.assurance.cents).toBe(E(180000));
    expect(o.assuranceFilsExiste).toBe('non');
    expect(o.assuranceFils.cents).toBeNull();
    expect(o.epargnePension.cents).toBe(E(50000));
  });

  it('données récentes (épargne-pension présente) : rien n’est modifié, même « je ne sais pas »', () => {
    const st = defaultState();
    const o = st.situation.succFilsPredecede;
    o.assuranceExiste = 'inconnu'; o.assurance.cents = null; o.epargnePensionExiste = 'non';
    const p = stateSchema.safeParse(st);
    expect(p.success && p.data.situation.succFilsPredecede.assuranceExiste).toBe('inconnu');
    expect(p.success && p.data.situation.succFilsPredecede.epargnePensionExiste).toBe('non');
  });
});
