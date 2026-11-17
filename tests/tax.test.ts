import { progressive } from '../src/tax/brackets';
import { donationImmobiliere, donationMobiliere } from '../src/tax/donation';
import { computeBeneficiaryTax } from '../src/tax/succession';
import { DON_ACTUEL, DON_2028, resolveSuccession, SUCC_ACTUEL, SUCC_DECRET_2024 } from '../src/tax/rules';
import { euros } from '../src/util/money';

const E = euros;

describe('barèmes : limites de tranches', () => {
  it('succession ligne directe : tranches exactes', () => {
    expect(progressive(SUCC_ACTUEL.ordinaire, E(12500))).toBe(E(375));
    expect(progressive(SUCC_ACTUEL.ordinaire, E(12500.01))).toBe(E(375)); // 0,01 × 4 % = 0,0004 €
    expect(progressive(SUCC_ACTUEL.ordinaire, E(25000))).toBe(E(875));
    expect(progressive(SUCC_ACTUEL.ordinaire, E(150000))).toBe(E(10625));
    expect(progressive(SUCC_ACTUEL.ordinaire, E(500000))).toBe(E(86625));
    expect(progressive(SUCC_ACTUEL.ordinaire, 0)).toBe(0);
  });
  it('taux réduit logement : 150 000 € → 250 + 500 + 5 000', () => {
    expect(progressive(SUCC_ACTUEL.logement!, E(150000))).toBe(E(5750));
    expect(progressive(SUCC_ACTUEL.logement!, E(250000))).toBe(E(16000));
  });
});

describe('droits de donation', () => {
  it('mobilière enregistrée 3,3 %', () => {
    expect(donationMobiliere(DON_ACTUEL, E(10000))).toBe(E(330));
    expect(donationMobiliere(DON_ACTUEL, E(20000))).toBe(E(660));
    expect(donationMobiliere(DON_ACTUEL, 0)).toBe(0);
  });
  it('immobilière : moitié de 300 000 € → base 150 000 €, droits 4 500 €', () => {
    expect(donationImmobiliere(DON_ACTUEL, E(150000)).droits).toBe(E(4500));
    // 150 000 × 3 % + 100 000 × 9 % + 50 000 × 18 % = 4 500 + 9 000 + 9 000
    expect(donationImmobiliere(DON_ACTUEL, E(300000)).droits).toBe(E(22500));
    expect(donationImmobiliere(DON_ACTUEL, E(150000.01)).droits).toBe(E(4500)); // 0,01 × 9 %
  });
  it('barème immobilier voté pour les actes dès 2028', () => {
    // 150 000 × 3 % + 100 000 × 6 % + 50 000 × 10 %
    expect(donationImmobiliere(DON_2028, E(300000)).droits).toBe(E(15500));
  });
});

describe('succession par bénéficiaire — repères 2026 recoupés', () => {
  const base = { id: 'fils', rappel: 0, baseReserve: 0, abattementEligible: true };
  it('sans donation : 150 000 € logement éligible + 170 000 € → 38 425 €', () => {
    // logement 5 750 ; reste placé de 150 000 à 320 000 : 7 000 + 9 000 + 16 800 = 32 800 ;
    // part > 125 000 → exemption 12 500 € seulement, imputée sur la première tranche logement (1 %) : −125
    const r = computeBeneficiaryTax(SUCC_ACTUEL, { ...base, partLogement: E(150000), partAutre: E(170000) });
    expect(r.avantAbattement).toBe(E(38550));
    expect(r.droits).toBe(E(38425));
  });
  it('170 000 € seuls → 13 050 €', () => {
    // 375 + 500 + 1 250 + 3 500 + 5 000 + 2 800 = 13 425 ; −375 (12 500 × 3 %)
    const r = computeBeneficiaryTax(SUCC_ACTUEL, { ...base, partLogement: 0, partAutre: E(170000) });
    expect(r.droits).toBe(E(13050));
  });
  it('part nette ≤ 125 000 € : exemption portée à 25 000 €', () => {
    // 100 000 : 375 + 500 + 1 250 + 3 500 = 5 625 ; exemption 375 + 500 = 875 → 4 750
    const r = computeBeneficiaryTax(SUCC_ACTUEL, { ...base, partLogement: 0, partAutre: E(100000) });
    expect(r.droits).toBe(E(4750));
    const r2 = computeBeneficiaryTax(SUCC_ACTUEL, { ...base, partLogement: 0, partAutre: E(125000.01) });
    expect(r2.abattementMontant).toBe(E(12500));
  });
  it('legs 25 000 € au petit-fils sans exemption → 875 € ; total familial 33 300 €', () => {
    const pf = computeBeneficiaryTax(SUCC_ACTUEL, { id: 'petitFils', partLogement: 0, partAutre: E(25000), rappel: 0, baseReserve: 0, abattementEligible: false });
    expect(pf.droits).toBe(E(875));
    const fils = computeBeneficiaryTax(SUCC_ACTUEL, { ...base, partLogement: E(150000), partAutre: E(145000) });
    expect(fils.droits).toBe(E(32425));
    expect(pf.droits! + fils.droits!).toBe(E(33300));
  });
  it('réserve de progressivité : sous-total 32 800 € avant exemption, final à confirmer', () => {
    const r = computeBeneficiaryTax(SUCC_ACTUEL, { ...base, partLogement: 0, partAutre: E(170000), baseReserve: E(150000) });
    expect(r.avantAbattement).toBe(E(32800));
    expect(r.droits).toBeNull();
    expect(r.status).toBe('a_confirmer');
  });
  it('décret 2024 (dès 2028) : exemption 25 000 € sur le nouveau barème', () => {
    // 170 000 : 375 + 500 + 6 250 + 1 400 = 8 525 ; exemption 375 + 500 = 875 → 7 650
    const r = computeBeneficiaryTax(SUCC_DECRET_2024, { ...base, partLogement: 0, partAutre: E(170000) });
    expect(r.droits).toBe(E(7650));
  });
});

describe('choix du profil selon la date (date charnière visible)', () => {
  it('31/12/2027 → profil en vigueur ; 01/01/2028 → projection non disponible en mode auto', () => {
    const a = resolveSuccession('2027-12-31', 'auto');
    const b = resolveSuccession('2028-01-01', 'auto');
    expect(a.ok && a.profile.id).toBe('WAL-SUCC-ACTUEL');
    expect(b.ok).toBe(false);
  });
  it('contrefactuel explicite et décret 2024', () => {
    const c = resolveSuccession('2030-01-01', 'constant2026');
    expect(c.ok && c.profile.statut).toBe('contrefactuel');
    const d = resolveSuccession('2030-01-01', 'decret2024');
    expect(d.ok && d.profile.statut).toBe('vote_non_en_vigueur');
  });
});
