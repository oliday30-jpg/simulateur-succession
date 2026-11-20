import { computeSuccFilsPredecede, ecartRenonciation } from '../src/engine/succFilsPredecede';
import { resolveLots, summarize, validateLots } from '../src/domain/rights';
import { lotsForRepartition } from '../src/domain/devolution';
import { sampleSituation, defaultState } from '../src/model/sample';
import { stateSchema } from '../src/persistence/schema';
import { simulate } from '../src/engine/simulate';
import { TEMPLATES } from '../src/model/sample';
import { progressive } from '../src/tax/brackets';
import { DON_ACTUEL, SUCC_AUTRES_PERSONNES, SUCC_FRERES_SOEURS } from '../src/tax/rules';
import { euros } from '../src/util/money';
import { frac } from '../src/util/fraction';
import type { Situation } from '../src/model/types';
import { sansContrats } from './sansContrats';

const E = euros;

/**
 * Cas anonyme : maison 300 000 € (hypothèse), acte 2005 → part du fils prédécédé = 1/6 en NP
 * (usufruit du père) = 50 000 € en pleine propriété. Testament en faveur de la cohabitante légale,
 * pas de descendant, maison non affectée à la résidence commune.
 */
const sit = (f: (s: Situation) => void = () => {}): Situation => {
  const s = sansContrats(sampleSituation());
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

/**
 * Barème ligne directe (cohabitante légale), cumuls à la main :
 *  12 500 → 375 ; 25 000 → 875 ; 50 000 → 2 125 ; 100 000 → 5 625 ; 150 000 → 10 625 ;
 *  200 000 → 17 625 ; 250 000 → 26 625 ; puis 24 % jusqu'à 500 000.
 *  - 300 000 € (assurance seule) : 26 625 + 50 000 × 24 % = 38 625 ; exemption 12 500 € à 3 % (− 375) → 38 250.
 *  - 350 000 € (assurance + part de maison 50 000) : 26 625 + 100 000 × 24 % = 50 625 − 375 → 50 250.
 *    Part > 125 000 € : pas d'exemption supplémentaire, même si elle était admise.
 */
describe('assurance groupe / vie versée à la bénéficiaire', () => {
  const avecAssurance = (taxee: 'oui' | 'non' | 'inconnu', f: (s: Situation) => void = () => {}) => sit((s) => {
    s.succFilsPredecede.baseNP = 'pleine_propriete';
    s.succFilsPredecede.assuranceExiste = 'oui';
    s.succFilsPredecede.assurance.cents = E(300000);
    s.succFilsPredecede.assuranceTaxee = taxee;
    f(s);
  });

  it('acceptation : part de maison taxée au-dessus de l’assurance (24 %) et supplément perdu', () => {
    const r = computeSuccFilsPredecede(avecAssurance('oui'));
    const [acc] = r.scenarios;
    // supplément « à confirmer » : sans effet, part 350 000 > 125 000 → valeur unique
    expect(acc.total).toMatchObject({ value: E(50250) });
    expect(acc.rows[0].part.value).toBe(E(350000));
    // Coût de la part de maison : 50 250 − 38 250 = 12 000 = 50 000 × 24 % (contre 1 250 … 1 750 sans assurance)
  });

  it('renonciation : elle garde l’assurance et paie 38 250 € ; plancher art. 68 sur la part renoncée', () => {
    const r = computeSuccFilsPredecede(avecAssurance('oui'));
    const [, ren] = r.scenarios;
    expect(ren.rows.map((x) => x.id)).toEqual(['beneficiaire', 'pere', 'fils']);
    expect(ren.rows[0].droits.value).toBe(E(38250));
    // Héritiers : père 12 500 → 0 ; fils 37 500 → 10 000. Part renoncée : 50 250 − 38 250 = 12 000 > 10 000 → plancher.
    expect(ren.plancherApplique).toBe(true);
    expect(ren.total.value).toBe(E(12000 + 38250));
    expect(ren.totalPrudent).toBe(E(50250));
    expect(ecartRenonciation(r)).toMatch(/coûte 0,00.€/);
  });

  it('taxation à confirmer : fourchette avec / sans assurance, hypothèse prudente avec', () => {
    const r = computeSuccFilsPredecede(avecAssurance('inconnu', (s) => { s.succFilsPredecede.supplementCohabitant = 'ne_pas_appliquer'; }));
    const [acc, ren] = r.scenarios;
    // Sans assurance : 50 000 → 2 125 − 375 = 1 750 ; avec : 50 250
    expect(acc.total).toMatchObject({ value: null, lo: E(1750), hi: E(50250), status: 'a_confirmer' });
    expect(acc.totalPrudent).toBe(E(50250));
    // Renonciation : sans assurance 10 000 (pas de plancher : 1 750 < 10 000) ; avec 50 250
    expect(ren.total).toMatchObject({ lo: E(10000), hi: E(50250) });
    expect(acc.notes.join(' ')).toMatch(/art\. 8/);
  });

  it('assurance non taxée : résultats d’origine', () => {
    const r = computeSuccFilsPredecede(avecAssurance('non'));
    expect(r.scenarios[0].total).toMatchObject({ lo: E(1250), hi: E(1750) });
    expect(r.scenarios[1].rows.map((x) => x.id)).toEqual(['pere', 'fils']);
    expect(r.scenarios[1].total.value).toBe(E(10000));
  });

  it('succession déficitaire : passif non couvert signalé, rien de taxable dans la succession', () => {
    const r = computeSuccFilsPredecede(avecAssurance('oui', (s) => { s.succFilsPredecede.autresBiensNets.cents = E(-60000); }));
    // 50 000 − 60 000 = − 10 000 : part de succession 0 ; les dettes ne s'imputent pas sur l'assurance
    expect(r.avertissements.join(' ')).toMatch(/déficitaire.*10.000,00.€/);
    const [acc, ren] = r.scenarios;
    expect(acc.total.value).toBe(E(38250));
    expect(ren.total.value).toBe(E(38250)); // héritiers 0, part renoncée 0, assurance 38 250
    expect(ren.notes.join(' ')).toMatch(/bénéfice d’inventaire/);
  });

  it('existence non vérifiée : avertissement ; contrat existant sans montant : autre avertissement', () => {
    expect(computeSuccFilsPredecede(sit()).avertissements.join(' ')).toMatch(/Existence d’une assurance .* à vérifier/);
    const r = computeSuccFilsPredecede(avecAssurance('oui', (s) => { s.succFilsPredecede.assurance.cents = null; }));
    expect(r.avertissements.join(' ')).toMatch(/montant non renseigné/);
  });

  // Sans assurance (part 50 000 € seule) : 1 250 … 1 750 € selon l'exemption supplémentaire (prudente 1 750) ;
  // avec : 50 250 € (part > 125 000 € : pas de supplément).
  it('« pas d’assurance » : montant ignoré même s’il reste saisi', () => {
    const r = computeSuccFilsPredecede(avecAssurance('oui', (s) => { s.succFilsPredecede.assuranceExiste = 'non'; }));
    expect([r.scenarios[0].total.lo, r.scenarios[0].total.hi, r.scenarios[0].totalPrudent]).toEqual([E(1250), E(1750), E(1750)]);
    expect(r.avertissements.join(' ')).not.toMatch(/assurance/i);
  });

  it('« peut-être » : fourchette avec et sans le capital, même si sa taxation est confirmée ; prudente avec', () => {
    const r = computeSuccFilsPredecede(avecAssurance('oui', (s) => { s.succFilsPredecede.assuranceExiste = 'possible'; }));
    const acc = r.scenarios[0];
    expect(acc.total.lo).toBe(E(1250));
    expect(acc.total.hi).toBe(E(50250));
    expect(acc.totalPrudent).toBe(E(50250));
    expect(acc.notes.join(' ')).toMatch(/existence du contrat incertaine/);
  });
});

describe('barème entre autres personnes et donation mobilière (SPF, consultés le 19/11/2026)', () => {
  it('cumuls de la page SPF et taux 5,5 %', () => {
    expect(progressive(SUCC_AUTRES_PERSONNES.ordinaire, E(12500))).toBe(E(3750));   // 12 500 × 30 %
    expect(progressive(SUCC_AUTRES_PERSONNES.ordinaire, E(25000))).toBe(E(8125));   // + 12 500 × 35 %
    expect(progressive(SUCC_AUTRES_PERSONNES.ordinaire, E(75000))).toBe(E(38125));  // + 50 000 × 60 %
    expect(progressive(SUCC_AUTRES_PERSONNES.ordinaire, E(175000))).toBe(E(118125)); // + 100 000 × 80 %
    expect(DON_ACTUEL.mobilierAutresBp).toBe(550);
  });
});

/**
 * Assurance au profit du fils survivant (calculs à la main) — cas : part de maison 50 000 € en PP,
 * autres biens 0, assurance de la bénéficiaire 300 000 € taxée, assurance du fils 20 000 € taxée.
 *
 * Elle accepte (contexte par défaut) :
 *  - fils, 20 000 € seuls, barème frères et sœurs : 12 500 × 20 % + 7 500 × 25 % = 2 500 + 1 875 = 4 375 ;
 *    total des droits 50 250 + 4 375 = 54 625.
 *  - don bancaire : net 15 625 ; rappel (entre autres personnes) 12 500 × 30 % + 3 125 × 35 % = 3 750 + 1 093,75 = 4 843,75.
 *  - donation enregistrée : 15 625 × 5,5 % = 859,375 → 859,38 ; droits 5 234,38 ; reçu 14 765,62.
 *  - renonciation au bénéfice (clause → bénéficiaire) : sa base 350 000 € est dans la tranche 250 000–500 000 à 24 % :
 *    20 000 × 24 % = 4 800 ; reçu 15 200.
 * Elle renonce :
 *  - fils : 37 500 + 20 000 = 57 500 → 2 500 + 3 125 + 32 500 × 35 % = 17 000 ; père 12 500 → 0 ;
 *    part des héritiers sur la part renoncée 17 000 − 4 375 = 12 625 > 12 000 (renonçante) → pas de plancher ;
 *    total 0 + 17 000 + 38 250 = 55 250.
 *  - capital marginal du fils : 17 000 − 10 000 = 7 000 (20 000 × 35 %) ; net 13 000 ; donation 715 ;
 *    rappel 3 750 + 500 × 35 % = 3 925 ; renonciation au bénéfice : base 300 000 → 4 800.
 */
describe('assurance versée au fils survivant', () => {
  const avecFils = (f: (s: Situation) => void = () => {}) => sit((s) => {
    const o = s.succFilsPredecede;
    o.baseNP = 'pleine_propriete';
    o.assuranceExiste = 'oui';
    o.assurance.cents = E(300000);
    o.assuranceTaxee = 'oui';
    o.assuranceFilsExiste = 'oui';
    o.assuranceFils.cents = E(20000);
    o.assuranceFilsTaxee = 'oui';
    o.assuranceFilsSuivant = 'beneficiaire';
    f(s);
  });
  const opt = (r: ReturnType<typeof computeSuccFilsPredecede>, key: string) => r.transmission!.options.find((o) => o.key === key)!;

  it('elle accepte : capital taxé seul dans le chef du fils, ajouté au total', () => {
    const r = computeSuccFilsPredecede(avecFils());
    const [acc] = r.scenarios;
    expect(acc.rows.map((x) => x.id)).toEqual(['beneficiaire', 'fils']);
    expect(acc.rows[1].droits.value).toBe(E(4375));
    expect(acc.total.value).toBe(E(54625));
    expect(acc.totalPrudent).toBe(E(54625));
  });

  it('elle accepte : comparaison des façons de transmettre', () => {
    const r = computeSuccFilsPredecede(avecFils());
    expect(r.transmission!.contexte).toBe('acceptation');
    expect(opt(r, 'garder')).toMatchObject({ droits: { value: E(4375) }, recu: { value: 0 } });
    const don = opt(r, 'don_bancaire');
    expect(don).toMatchObject({ droits: { value: E(4375) }, recu: { value: E(15625) } });
    expect(don.risque!.value).toBe(484375);
    expect(opt(r, 'donation_enregistree')).toMatchObject({ droits: { value: 523438 }, recu: { value: 1476562 } });
    expect(opt(r, 'renonciation_benefice')).toMatchObject({ disponible: true, droits: { value: E(4800) }, recu: { value: E(15200) } });
  });

  it('elle renonce : capital ajouté aux 3/4 du fils, droits marginaux, plancher sur la part renoncée seulement', () => {
    const r = computeSuccFilsPredecede(avecFils((s) => { s.house.quartResolution = 'renonciation'; }));
    const [, ren] = r.scenarios;
    expect(ren.rows.find((x) => x.id === 'fils')!.droits.value).toBe(E(17000));
    expect(ren.rows.find((x) => x.id === 'fils')!.part.value).toBe(E(57500));
    expect(ren.plancherApplique).toBe(false);
    expect(ren.total.value).toBe(E(55250));
    expect(ren.totalPrudent).toBe(E(55250));
    expect(r.transmission!.contexte).toBe('renonciation');
    expect(opt(r, 'garder').droits.value).toBe(E(7000));
    expect(opt(r, 'don_bancaire')).toMatchObject({ recu: { value: E(13000) }, risque: { value: E(3925) } });
    expect(opt(r, 'donation_enregistree')).toMatchObject({ droits: { value: E(7715) }, recu: { value: E(12285) } });
    expect(opt(r, 'renonciation_benefice').droits.value).toBe(E(4800));
  });

  it('taxation à confirmer : fourchette 0 … 4 375 €, hypothèse prudente taxée', () => {
    const r = computeSuccFilsPredecede(avecFils((s) => { s.succFilsPredecede.assuranceFilsTaxee = 'inconnu'; }));
    expect(opt(r, 'garder').droits).toMatchObject({ value: null, lo: 0, hi: E(4375), status: 'a_confirmer' });
    expect(opt(r, 'garder').droitsPrudent).toBe(E(4375));
    expect(r.scenarios[0].total).toMatchObject({ lo: E(50250), hi: E(54625) });
  });

  it('clause sans bénéficiaire suivant : renonciation au bénéfice non chiffrée (le capital tomberait dans la succession)', () => {
    const r = computeSuccFilsPredecede(avecFils((s) => { s.succFilsPredecede.assuranceFilsSuivant = 'succession'; }));
    const o = opt(r, 'renonciation_benefice');
    expect(o.disponible).toBe(false);
    expect(o.raison).toMatch(/payer les dettes/);
  });

  // « Peut-être » : 0 … 4 375 € pour le fils ; acceptation 50 250 … 54 625 € ; tableau affiché avec une réserve.
  it('« peut-être » : fourchette avec / sans, comparaison affichée avec une réserve', () => {
    const r = computeSuccFilsPredecede(avecFils((s) => { s.succFilsPredecede.assuranceFilsExiste = 'possible'; }));
    expect(r.scenarios[0].total.lo).toBe(E(50250));
    expect(r.scenarios[0].total.hi).toBe(E(54625));
    expect(r.transmission!.notes.join(' ')).toMatch(/Existence du contrat incertaine/);
  });

  it('« pas d’assurance » ou « je ne sais pas » : rien compté, pas de comparaison', () => {
    for (const e of ['non', 'inconnu'] as const) {
      const r = computeSuccFilsPredecede(avecFils((s) => { s.succFilsPredecede.assuranceFilsExiste = e; }));
      expect(r.transmission, e).toBeNull();
      expect(r.scenarios[0].total.value, e).toBe(E(50250));
    }
  });

  it('non renseignée : aucun changement, pas de comparaison', () => {
    const r = computeSuccFilsPredecede(avecFils((s) => { s.succFilsPredecede.assuranceFils.cents = null; }));
    expect(r.transmission).toBeNull();
    expect(r.scenarios[0].rows.map((x) => x.id)).toEqual(['beneficiaire']);
    expect(r.scenarios[0].total.value).toBe(E(50250));
  });
});

describe('données enregistrées avant l’ajout', () => {
  it('un état sans les cases d’assurance du fils survivant reste lisible', () => {
    const st = defaultState() as unknown as { situation: { succFilsPredecede: Record<string, unknown> } };
    delete st.situation.succFilsPredecede.assuranceFils;
    delete st.situation.succFilsPredecede.assuranceFilsTaxee;
    delete st.situation.succFilsPredecede.assuranceFilsSuivant;
    const p = stateSchema.safeParse(st);
    expect(p.success).toBe(true);
    if (p.success) {
      expect(p.data.situation.succFilsPredecede.assuranceFils.cents).toBeNull();
      expect(p.data.situation.succFilsPredecede.assuranceFilsSuivant).toBe('inconnu');
    }
  });

  it('un état sans « existe ? » : déduit du montant (> 0 → oui, 0 → non, vide → je ne sais pas)', () => {
    const st = defaultState() as unknown as { situation: { succFilsPredecede: Record<string, unknown> & { assurance: { cents: number | null }; assuranceFils: { cents: number | null } } } };
    const o = st.situation.succFilsPredecede;
    delete o.assuranceExiste;
    delete o.assuranceFilsExiste;
    o.assurance.cents = E(300000);
    o.assuranceFils.cents = 0;
    const p = stateSchema.safeParse(st);
    expect(p.success).toBe(true);
    if (p.success) {
      expect(p.data.situation.succFilsPredecede.assuranceExiste).toBe('oui');
      expect(p.data.situation.succFilsPredecede.assuranceFilsExiste).toBe('non');
    }
    o.assurance.cents = null;
    const q = stateSchema.safeParse(st);
    expect(q.success && q.data.situation.succFilsPredecede.assuranceExiste).toBe('inconnu');
  });

  it('un état sans les cases d’assurance reste lisible (non renseignée, à confirmer)', () => {
    const st = defaultState() as unknown as { situation: { succFilsPredecede: Record<string, unknown> } };
    delete st.situation.succFilsPredecede.assurance;
    delete st.situation.succFilsPredecede.assuranceTaxee;
    const p = stateSchema.safeParse(st);
    expect(p.success).toBe(true);
    if (p.success) {
      expect(p.data.situation.succFilsPredecede.assurance.cents).toBeNull();
      expect(p.data.situation.succFilsPredecede.assuranceTaxee).toBe('inconnu');
    }
  });

  it('un état sans « succFilsPredecede » reste lisible (valeurs par défaut)', () => {
    const st = defaultState() as unknown as { situation: Record<string, unknown> };
    delete st.situation.succFilsPredecede;
    const p = stateSchema.safeParse(st);
    expect(p.success).toBe(true);
    if (p.success) expect(p.data.situation.succFilsPredecede.testament).toBe('inconnu');
  });
});
