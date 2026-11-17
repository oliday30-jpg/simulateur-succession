import { allocate, applyRateBp, centsToInput, euros, formatEUR, parseEUR } from '../src/util/money';
import { addYears, formatDate, parseUserDate, withinYears } from '../src/util/dates';
import { frac, mulCents, parseFrac } from '../src/util/fraction';

describe('montants (centimes entiers)', () => {
  it('saisie belge « 170 000,50 » et variantes', () => {
    expect(parseEUR('170 000,50')).toEqual({ ok: true, value: 17000050 });
    expect(parseEUR('170.000,50')).toEqual({ ok: true, value: 17000050 });
    expect(parseEUR('170000.5')).toEqual({ ok: true, value: 17000050 });
    expect(parseEUR('170.000')).toEqual({ ok: true, value: 17000000 });
    expect(parseEUR('170 000 €')).toEqual({ ok: true, value: 17000000 });
    expect(parseEUR('0')).toEqual({ ok: true, value: 0 });
  });
  it('« non renseigné » n’est pas 0', () => {
    expect(parseEUR('')).toEqual({ ok: true, value: null });
    expect(formatEUR(null)).toBe('non renseigné');
  });
  it('rejette les montants invalides', () => {
    expect(parseEUR('abc').ok).toBe(false);
    expect(parseEUR('12,345').ok).toBe(false);
    expect(parseEUR('1,2,3').ok).toBe(false);
  });
  it('affiche en EUR fr-BE', () => {
    expect(formatEUR(euros(38425))).toMatch(/38.425,00.€/);
    expect(centsToInput(17000050)).toBe('170 000,50');
  });
  it('taux en points de base, arrondi demi vers le haut', () => {
    expect(applyRateBp(euros(10000), 330)).toBe(euros(330));
    expect(applyRateBp(euros(20000), 330)).toBe(euros(660));
    expect(applyRateBp(15, 330)).toBe(0); // 0,495 centime → 0
    expect(applyRateBp(16, 330)).toBe(1); // 0,528 → 1
  });
  it('répartition exacte (plus fort reste)', () => {
    const parts = allocate(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });
});

describe('fractions', () => {
  it('saisie et produit', () => {
    expect(parseFrac('1/4')).toEqual(frac(1, 4));
    expect(parseFrac('15 %')).toEqual(frac(3, 20));
    expect(parseFrac('12,5')).toEqual(frac(1, 8));
    expect(mulCents(euros(300000), frac(1, 2))).toBe(euros(150000));
  });
});

describe('dates civiles et délais en années', () => {
  it('anniversaire simple, jamais 1 095 jours', () => {
    expect(addYears('2026-12-15', 3).date).toBe('2029-12-15');
    // 2028 est bissextile : 1 095 jours après le 15/12/2026 tomberait le 14/12/2029
    expect(withinYears('2026-12-15', '2029-12-14', 3).status).toBe('dans_le_delai');
    expect(withinYears('2026-12-15', '2029-12-15', 3).status).toBe('a_confirmer');
    expect(withinYears('2026-12-15', '2029-12-16', 3).status).toBe('hors_delai');
  });
  it('cinq ans, jours voisins', () => {
    expect(withinYears('2026-12-15', '2031-12-14', 5).status).toBe('dans_le_delai');
    expect(withinYears('2026-12-15', '2031-12-15', 5).status).toBe('a_confirmer');
    expect(withinYears('2026-12-15', '2031-12-16', 5).status).toBe('hors_delai');
  });
  it('29 février → ambiguïté signalée', () => {
    const r = addYears('2028-02-29', 3);
    expect(r).toEqual({ date: '2031-02-28', ambiguous: true });
    expect(withinYears('2028-02-29', '2031-02-28', 3).status).toBe('a_confirmer');
    expect(withinYears('2028-02-29', '2031-03-01', 3).status).toBe('a_confirmer');
    expect(withinYears('2028-02-29', '2031-02-27', 3).status).toBe('dans_le_delai');
    expect(withinYears('2028-02-29', '2031-03-02', 3).status).toBe('hors_delai');
    expect(addYears('2028-02-29', 4)).toEqual({ date: '2032-02-29', ambiguous: false });
  });
  it('format jj/mm/aaaa', () => {
    expect(formatDate('2026-10-07')).toBe('07/10/2026');
    expect(parseUserDate('07/10/2026')).toBe('2026-10-07');
    expect(parseUserDate('31/02/2026')).toBeNull();
  });
});
