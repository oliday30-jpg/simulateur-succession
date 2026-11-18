import { computeSuccFilsPredecede, ecartRenonciation } from '../src/engine/succFilsPredecede';
import { resolveLots, summarize, validateLots } from '../src/domain/rights';
import { lotsForRepartition } from '../src/domain/devolution';
import { sampleSituation, defaultState } from '../src/model/sample';
import { stateSchema } from '../src/persistence/schema';
import { simulate } from '../src/engine/simulate';
import { TEMPLATES } from '../src/model/sample';
import { progressive } from '../src/tax/brackets';
import { SUCC_FRERES_SOEURS } from '../src/tax/rules';
import { euros } from '../src/util/money';
import { frac } from '../src/util/fraction';
import type { Situation } from '../src/model/types';

const E = euros;

/**
 * Cas anonyme : maison 300 000 € (hypothèse), acte 2005 → part du fils prédécédé = 1/6 en NP
 * (usufruit du père) = 50 000 € en pleine propriété. Testament en faveur de la cohabitante légale,
 * pas de descendant, maison non affectée à la résidence commune.
 */
const sit = (f: (s: Situation) => void = () => {}): Situation => {
  const s = sampleSituation();
  s.succFilsPredecede.testament = 'legs_beneficiaire';
  s.succFilsPredecede.descendants = 'aucun';
  s.succFilsPredecede.residenceCommune = 'non';
  s.succFilsPredecede.autresBiensNets.cents = 0;
  f(s);
  return s;
};

describe('barème entre frères et sœurs (SPF, consulté le 18/11/2026)', () => {
  it('cumuls de la page SPF', () => {
    expect(progressive(SUCC_FRERES_SOEURS.ordinaire, E(12500))).toBe(E(2500));   // 12 500 × 20 %
    expect(progressive(SUCC_FRERES_SOEURS.ordinaire, E(25000))).toBe(E(5625));   // + 12 500 × 25 %
    expect(progressive(SUCC_FRERES_SOEURS.ordinaire, E(75000))).toBe(E(23125));  // + 50 000 × 35 %
    expect(progressive(SUCC_FRERES_SOEURS.ordinaire, E(175000))).toBe(E(73125)); // + 100 000 × 50 %
  });
});

describe('renonciation : partage des lots', () => {
  it('1/6 en NP → 1/24 en PP au père (consolidation) et 1/8 en NP au fils', () => {
    const lots = resolveLots(lotsForRepartition('acte2005_reduction'), { quartResolution: 'renonciation', quartPersonnalise: { holder: 'beneficiaire', note: '' } });
    expect(validateLots(lots)).toEqual([]);
    const pere = lots.find((l) => l.id === 'L3-pere')!;
    expect(pere.share).toEqual(frac(1, 24));
    expect(pere.pp).toBe('pere');
    const fils = lots.find((l) => l.id === 'L3-fils')!;
    expect(fils.share).toEqual(frac(1, 8));
    expect([fils.np, fils.us]).toEqual(['fils', 'pere']);
    // Père : 2/3 + 1/24 = 17/24 en PP ; usufruit 1/6 + 1/8 = 7/24
    const p = summarize(lots).find((h) => h.holder === 'pere')!;
    expect(p.pp).toEqual(frac(17, 24));
    expect(p.us).toEqual(frac(7, 24));
  });
  it('la succession du père en tient compte (aucun titulaire « à déterminer »)', () => {
    const r = simulate(sit((s) => { s.house.quartResolution = 'renonciation'; }), TEMPLATES[0].build());
    expect(r.issues.some((i) => i.level === 'bloquant')).toBe(false);
    expect(r.lotsInitial.some((l) => l.np === 'quart' || l.pp === 'quart')).toBe(false);
  });
});

describe('droits de la succession du fils prédécédé', () => {
  it('base pleine propriété, autres biens 0 : acceptation 1 250 … 1 750 €, renonciation 10 000 €', () => {
    const r = computeSuccFilsPredecede(sit((s) => { s.succFilsPredecede.baseNP = 'pleine_propriete'; }));
    expect(r.partPP).toBe(E(50000));
    const [acc, ren] = r.scenarios;
    // Cohabitante, 50 000 € au barème ligne directe : 375 + 500 + 25 000 × 5 % = 2 125
    //  - exemption 12 500 € (1re tranche, 3 %) : − 375 → 1 750
    //  - + supplément 12 500 € (2e tranche, 4 %) : − 500 → 1 250
    expect(acc.total).toMatchObject({ value: null, lo: E(1250), hi: E(1750), status: 'a_confirmer' });
    expect(acc.totalPrudent).toBe(E(1750));
    // Père 1/4 = 12 500 € : 375 − 375 = 0. Fils 3/4 = 37 500 € entre frères : 2 500 + 3 125 + 12 500 × 35 % = 10 000
    expect(ren.rows.find((x) => x.id === 'pere')!.droits.value).toBe(0);
    expect(ren.rows.find((x) => x.id === 'fils')!.droits.value).toBe(E(10000));
    expect(ren.total.value).toBe(E(10000));
    expect(ren.plancherApplique).toBe(false);
    expect(ecartRenonciation(r)).toMatch(/entre 8.250,00.€ et 8.750,00.€/);
  });

  it('fourchette pleine propriété / nue-propriété à 60 %', () => {
    const r = computeSuccFilsPredecede(sit((s) => { s.succFilsPredecede.coefNP = frac(60, 100); }));
    expect(r.partNP).toBe(E(30000));
    const [acc, ren] = r.scenarios;
    // NP 30 000 : 375 + 500 + 5 000 × 5 % = 1 125 ; avec supplément − 875 → 250 ; sans − 375 → 750.
    expect(acc.total).toMatchObject({ lo: E(250), hi: E(1750) });
    // Fils 22 500 : 2 500 + 10 000 × 25 % = 5 000 ; père 7 500 : 225 − 225 = 0.
    expect(ren.total).toMatchObject({ lo: E(5000), hi: E(10000) });
  });

  it('coefficient inconnu : seul un maximum est affiché, l’hypothèse prudente reste chiffrée', () => {
    const r = computeSuccFilsPredecede(sit());
    const [acc] = r.scenarios;
    expect(acc.total).toMatchObject({ value: null, hi: E(1750), lo: undefined });
    expect(acc.totalPrudent).toBe(E(1750));
  });

  it('autres biens non renseignés : minimum seulement (statut partiel)', () => {
    const r = computeSuccFilsPredecede(sit((s) => { s.succFilsPredecede.autresBiensNets.cents = null; s.succFilsPredecede.baseNP = 'pleine_propriete'; }));
    expect(r.scenarios[1].total).toMatchObject({ value: null, lo: E(10000), hi: undefined, status: 'partiel' });
    expect(r.avertissements.join(' ')).toMatch(/minimum/);
  });

  it('autres biens 20 000 € : progressivité sur 70 000 €', () => {
    const r = computeSuccFilsPredecede(sit((s) => { s.succFilsPredecede.autresBiensNets.cents = E(20000); s.succFilsPredecede.baseNP = 'pleine_propriete'; s.succFilsPredecede.supplementCohabitant = 'appliquer'; }));
    // Cohabitante 70 000 : 375 + 500 + 1 250 + 20 000 × 7 % = 3 525 ; exemption 25 000 € → − 875 = 2 650
    expect(r.scenarios[0].total.value).toBe(E(2650));
    // Fils 52 500 : 2 500 + 3 125 + 27 500 × 35 % = 15 250 ; père 17 500 : 375 + 200 = 575 − 575 = 0
    expect(r.scenarios[1].total.value).toBe(E(15250));
  });

  it('montants du notaire prioritaires', () => {
    const r = computeSuccFilsPredecede(sit((s) => { s.succFilsPredecede.droitsNotaire = { beneficiaire: E(1500), pere: E(100), fils: E(9000) }; }));
    expect(r.scenarios[0].total).toMatchObject({ value: E(1500), status: 'manuel' });
    expect(r.scenarios[1].total).toMatchObject({ value: E(9100), status: 'manuel' });
  });

  it('cas non couverts', () => {
    expect(computeSuccFilsPredecede(sit((s) => { s.succFilsPredecede.testament = 'aucun'; })).scenarios[0].disponible).toBe(false);
    expect(computeSuccFilsPredecede(sit((s) => { s.succFilsPredecede.descendants = 'oui'; })).scenarios[1].disponible).toBe(false);
    expect(computeSuccFilsPredecede(sit((s) => { s.succFilsPredecede.residenceCommune = 'oui'; })).scenarios.every((x) => !x.disponible)).toBe(true);
  });

  it('valeur au décès du fils prédécédé utilisée si renseignée', () => {
    const r = computeSuccFilsPredecede(sit((s) => { s.house.valeurDecesFilsPredecede.cents = E(240000); }));
    expect(r.partPP).toBe(E(40000)); // 240 000 / 6
  });

  it('option retenue reconnue', () => {
    const r = computeSuccFilsPredecede(sit((s) => { s.house.quartResolution = 'renonciation'; }));
    expect(r.scenarios.map((x) => x.retenu)).toEqual([false, true]);
  });
});

describe('données enregistrées avant l’ajout', () => {
  it('un état sans « succFilsPredecede » reste lisible (valeurs par défaut)', () => {
    const st = defaultState() as unknown as { situation: Record<string, unknown> };
    delete st.situation.succFilsPredecede;
    const p = stateSchema.safeParse(st);
    expect(p.success).toBe(true);
    if (p.success) expect(p.data.situation.succFilsPredecede.testament).toBe('inconnu');
  });
});
