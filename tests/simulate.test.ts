import { simulate, alignedReference } from '../src/engine/simulate';
import { sampleSituation, TEMPLATES, mkDonBancaire, mkDonationImmo, mkLegs, mkVente } from '../src/model/sample';
import type { Scenario, Situation, Vente, DonBancaire } from '../src/model/types';
import { euros } from '../src/util/money';
import { frac } from '../src/util/fraction';

const E = euros;
const tpl = (id: string): Scenario => TEMPLATES.find((t) => t.id === id)!.build();
const sit = (f?: (s: Situation) => void) => { const s = sampleSituation(); f?.(s); return s; };

describe('référence sans donation', () => {
  it('décès 2027 : 38 425 € (logement éligible par hypothèse)', () => {
    const r = simulate(sit(), tpl('reference'));
    expect(r.death.profile?.id).toBe('WAL-SUCC-ACTUEL');
    expect(r.totals.fiscalDeath.value).toBe(E(38425));
    expect(r.totals.fiscalToday.value).toBe(0);
    expect(r.pending.join(' ')).toMatch(/HYPOTHÈSE/);
  });
  it('logement non éligible : tout au barème ordinaire', () => {
    // 320 000 : 26 625 + 70 000 × 24 % = 43 425 ; −375
    const r = simulate(sit((s) => { s.house.logementEligibilite = 'non_eligible'; }), tpl('reference'));
    expect(r.totals.fiscalDeath.value).toBe(E(43050));
  });
  it('éligibilité inconnue : fourchette, jamais un total final', () => {
    const r = simulate(sit((s) => { s.house.logementEligibilite = 'inconnu'; }), tpl('reference'));
    expect(r.totals.fiscalDeath.value).toBeNull();
    expect(r.totals.fiscalDeath.lo).toBe(E(38425));
    expect(r.totals.fiscalDeath.hi).toBe(E(43050));
    expect(r.totals.fiscalDeath.status).toBe('a_confirmer');
  });
  it('décès après 2027 en mode auto : projection non disponible', () => {
    const r = simulate(sit(), { ...tpl('reference'), deathDate: '2028-01-01' });
    expect(r.totals.fiscalDeath.status).toBe('non_disponible');
    expect(r.ruleIds).toContain('PROJECTION-NON-DISPONIBLE');
  });
});

describe('don bancaire', () => {
  it('Q1 : don enregistré 10 000 € — coût 330 €, reste au père 159 670 €', () => {
    const r = simulate(sit(), tpl('don10k_enr'));
    expect(r.totals.fiscalToday.value).toBe(E(330));
    expect(r.cash.afterEvents).toBe(E(170000 - 10000 - 330));
  });
  it('Q1 : 20 000 € enregistré — 660 €', () => {
    expect(simulate(sit(), tpl('don20k_enr')).totals.fiscalToday.value).toBe(E(660));
  });
  it('Q2 : non enregistré, décès dans les 5 ans → rappel sur la part du fils', () => {
    const r = simulate(sit(), tpl('don10k_nenr'));
    expect(r.totals.fiscalToday.value).toBe(0);
    const row = r.death.rows.find((x) => x.id === 'fils')!;
    expect(row.input.rappel).toBe(E(10000));
    // masse 160 000 € + 10 000 rappelés = même base que la référence : 38 425 €
    expect(r.totals.fiscalDeath.value).toBe(E(38425));
    // le don rappelé ne revient pas dans les liquidités
    expect(r.cash.atDeath).toBe(E(160000));
  });
  it('Q2 : non enregistré, décès après 5 ans (contrefactuel) → pas de rappel', () => {
    const sc = { ...tpl('don10k_nenr'), deathDate: '2031-12-16', rulesMode: 'constant2026' as const };
    const r = simulate(sit(), sc);
    expect(r.death.rows.find((x) => x.id === 'fils')!.input.rappel).toBe(0);
    // 150 000 logement + 160 000 : 5 750 + 50 000 × 14 % + 50 000 × 18 % + 60 000 × 24 % − 125
    expect(r.totals.fiscalDeath.value).toBe(E(5750 + 7000 + 9000 + 14400 - 125));
  });
  it('décès le jour anniversaire des 5 ans → à confirmer (fourchette)', () => {
    const r = simulate(sit(), { ...tpl('don10k_nenr'), deathDate: '2031-12-15', rulesMode: 'constant2026' });
    expect(r.totals.fiscalDeath.status).toBe('a_confirmer');
    expect(r.totals.fiscalDeath.value).toBeNull();
  });
  it('enregistrement seulement prévu : coût calculé, exemption à prouver', () => {
    const sc = tpl('don10k_enr');
    (sc.events[0] as DonBancaire).statut = 'prevu';
    const r = simulate(sit(), sc);
    expect(r.totals.fiscalToday.value).toBe(E(330));
    expect(r.pending.join(' ')).toMatch(/preuve d’enregistrement/);
  });
  it('enregistrement daté après le décès → effet à confirmer', () => {
    const sc = tpl('don10k_enr');
    (sc.events[0] as DonBancaire).dateEnregistrement = '2028-01-15';
    const r = simulate(sit(), sc);
    expect(r.totals.fiscalDeath.status).toBe('a_confirmer');
  });
  it('don de 0 € et montant non renseigné', () => {
    const sc0 = { ...tpl('reference'), events: [mkDonBancaire(0, true)] };
    expect(simulate(sit(), sc0).totals.fiscalToday.value).toBe(0);
    const scN = { ...tpl('reference'), events: [{ ...mkDonBancaire(10, true), montant: null } as DonBancaire] };
    const r = simulate(sit(), scN);
    expect(r.cash.afterEvents).toBeNull();
    expect(r.issues.some((i) => i.level === 'bloquant')).toBe(true);
  });
});

describe('donation immobilière avec réserve d’usufruit', () => {
  it('Q3 : coût de l’acte 4 500 € hors frais, frais d’acte non renseignés ≠ 0', () => {
    const r = simulate(sit(), tpl('donation_immo'));
    expect(r.totals.fiscalToday.value).toBe(E(4500));
    expect(r.totals.fraisNonFiscaux.value).toBeNull();
    expect(r.totals.totalFraisCompris.value).toBeNull();
  });
  it('Q3 : décès dans les 3 ans, réserve inconnue → fourchette 13 050 … sous-total 32 800', () => {
    const r = simulate(sit(), tpl('donation_immo'));
    const d = r.totals.fiscalDeath;
    expect(d.value).toBeNull();
    expect(d.lo).toBe(E(13050));
    expect(d.hi).toBe(E(32800));
  });
  it('Q3 : décès après la période (contrefactuel 2026) → 13 050 + 4 500 = 17 550 €', () => {
    const r = simulate(sit(), { ...tpl('donation_immo'), deathDate: '2030-06-01', rulesMode: 'constant2026' });
    expect(r.totals.fiscalDeath.value).toBe(E(13050));
    expect(r.totals.fiscalTotal.value).toBe(E(17550));
  });
  it('après extinction : 75 % fils / 25 % bénéficiaire si le quart est conservé', () => {
    const r = simulate(sit((s) => { s.house.quartResolution = 'beneficiaire_conserve'; }), tpl('donation_immo'));
    const fils = r.lotsApresDeces!.filter((l) => l.pp === 'fils').reduce((a, l) => a + l.share.n / l.share.d, 0);
    expect(fils).toBeCloseTo(0.75);
  });
});

describe('legs au petit-fils', () => {
  it('Q5 : legs 25 000 € → 875 € à sa charge, 33 300 € au total', () => {
    const r = simulate(sit(), tpl('legs25k'));
    expect(r.death.rows.find((x) => x.id === 'petitFils')!.droits.value).toBe(E(875));
    expect(r.totals.fiscalDeath.value).toBe(E(33300));
    const pf = r.beneficiaries.find((b) => b.id === 'petitFils')!;
    expect(pf.net.value).toBe(E(25000 - 875));
  });
  it('don + legs sans clause → risque de double versement, legs non annulé', () => {
    const sc = { ...tpl('reference'), events: [mkDonBancaire(10000, true, 'petitFils')], legs: [mkLegs(20000)] };
    const r = simulate(sit(), sc);
    expect(r.pending.join(' ')).toMatch(/double versement/);
    expect(r.estate.legsTotal).toBe(E(20000));
  });
  it('imputation confirmée : legs réduit du don', () => {
    const l = { ...mkLegs(20000), imputation: 'imputation_confirmee' as const };
    const r = simulate(sit(), { ...tpl('reference'), events: [mkDonBancaire(10000, true, 'petitFils')], legs: [l] });
    expect(r.estate.legsTotal).toBe(E(10000));
  });
});

describe('vente', () => {
  const withCoef = (sc: Scenario, pct: number) => ({ ...sc, events: sc.events.map((e) => (e.type === 'vente' ? { ...e, coefUsufruit: frac(pct, 100), frais: { cents: 0, certainty: 'manuel' as const, source: '' }, accordsConfirmes: true } : e)) });
  it('Q4 : sans coefficient, pas de ventilation ni de trésorerie précise', () => {
    const r = simulate(sit(), tpl('vente_actuelle'));
    expect(r.sale?.status).toBe('non_disponible');
    expect(r.cash.afterEvents).toBeNull();
    // les coûts indépendants restent disponibles
    expect(r.totals.fiscalToday.value).toBe(0);
  });
  it('Q4 : avant / après donation avec coefficient fictif 15 %', () => {
    const a = simulate(sit(), withCoef(tpl('vente_actuelle'), 15));
    const b = simulate(sit(), withCoef(tpl('vente_apres_donation'), 15));
    expect(a.sale!.byHolder.pere).toBe(E(172500));
    expect(b.sale!.byHolder.pere).toBe(E(45000));
    expect(a.cash.afterEvents).toBe(E(170000 + 172500));
  });
  it('vente puis don : cohérence de caisse', () => {
    const r = simulate(sit(), withCoef(tpl('vente_puis_don'), 15));
    expect(r.cash.afterEvents).toBe(E(170000 + 172500 - 20000 - 660));
    // plus de maison au décès : pas de taux réduit logement
    expect(r.death.rows.find((x) => x.id === 'fils')!.input.partLogement).toBe(0);
  });
});

describe('créance et modes de bilan', () => {
  it('créance exclue par défaut ; solde indicatif 14 000 € non ajouté', () => {
    const r = simulate(sit(), tpl('reference'));
    expect(r.estate.masse).toBe(E(320000));
  });
  it('créance recouvrée déjà encaissée : pas de double comptage', () => {
    const r = simulate(sit((s) => { s.creance.inclusion = 'montant_recouvre'; s.creance.recouvre.cents = E(14000); s.creance.dejaEncaisse = true; }), tpl('reference'));
    expect(r.estate.masse).toBe(E(320000));
    const r2 = simulate(sit((s) => { s.creance.inclusion = 'montant_recouvre'; s.creance.recouvre.cents = E(14000); }), tpl('reference'));
    expect(r2.estate.masse).toBe(E(334000));
  });
  it('mode B : les donations ne sont pas retirées une seconde fois', () => {
    const r = simulate(sit((s) => { s.bilanMode = 'B'; s.soldeAuDecesB.cents = E(150000); }), tpl('don10k_enr'));
    expect(r.cash.atDeath).toBe(E(150000));
    expect(r.estate.masse).toBe(E(300000));
  });
});

describe('champs inconnus : blocage limité aux résultats dépendants', () => {
  it('valeur maison inconnue : don bancaire toujours chiffré, succession indisponible', () => {
    const s = sit((x) => { x.house.valeurHypothese.cents = null; });
    const r = simulate(s, tpl('don10k_enr'));
    expect(r.totals.fiscalToday.value).toBe(E(330));
    expect(r.cash.afterEvents).toBe(E(159670));
    expect(r.totals.fiscalDeath.value).toBeNull();
  });
});

describe('comparaison alignée et changement de barème', () => {
  it('la référence alignée reprend date et mode de la variante', () => {
    const v = { ...tpl('donation_immo'), deathDate: '2030-06-01', rulesMode: 'constant2026' as const };
    const ref = alignedReference(v);
    expect(ref.deathDate).toBe(v.deathDate);
    expect(ref.rulesMode).toBe(v.rulesMode);
    expect(ref.events).toEqual([]);
  });
  it('bascule visible au 01/01/2028 sans écraser l’instantané enregistré', () => {
    const sc: Scenario = { ...tpl('reference'), snapshot: { savedAt: '2026-11-17', ruleIds: ['WAL-SUCC-ACTUEL'], fiscalTotal: E(38425), label: 'figé' } };
    const before = simulate(sit(), { ...sc, deathDate: '2027-12-31' });
    const after = simulate(sit(), { ...sc, deathDate: '2028-01-01', rulesMode: 'decret2024' });
    expect(before.ruleIds).toContain('WAL-SUCC-ACTUEL');
    expect(after.ruleIds).toContain('WAL-SUCC-2028-DECRET');
    expect(sc.snapshot!.ruleIds).toEqual(['WAL-SUCC-ACTUEL']);
    expect(sc.snapshot!.fiscalTotal).toBe(E(38425));
  });
  it('deux événements à la même date sans ordre → ambiguïté signalée', () => {
    const v = mkVente('2026-12-15') as Vente;
    const sc = { ...tpl('reference'), events: [mkDonationImmo('2026-12-15'), { ...v, order: 0 }] };
    const r = simulate(sit(), sc);
    expect(r.pending.join(' ')).toMatch(/sans ordre explicite/);
  });
});
