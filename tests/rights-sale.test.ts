import { applyDeath, applyDonation, ppOf, resolveLots, summarize, validateLots } from '../src/domain/rights';
import { splitSale } from '../src/domain/sale';
import { sampleSituation, mkVente } from '../src/model/sample';
import type { Vente } from '../src/model/types';
import { euros } from '../src/util/money';
import { eq, frac } from '../src/util/fraction';

const lots = () => sampleSituation().house.lots;

describe('droits immobiliers par lots', () => {
  it('lots d’exemple : total 100 %, sans chevauchement', () => {
    expect(validateLots(lots())).toEqual([]);
  });
  it('détecte total ≠ 100 % et chevauchement', () => {
    const bad = [...lots(), { id: 'X', share: frac(1, 10), pp: 'fils' as const, np: 'fils' as const, us: 'pere' as const, origine: '' }];
    const msgs = validateLots(bad).map((i) => i.message).join(' | ');
    expect(msgs).toMatch(/chevauchement/);
    expect(msgs).toMatch(/au lieu de 100/);
  });
  it('usufruit + nue-propriété sur 100 % ne font pas 200 %', () => {
    const s = summarize(lots());
    const pere = s.find((x) => x.holder === 'pere')!;
    expect(eq(pere.pp, frac(1, 2))).toBe(true);
    expect(eq(pere.us, frac(1, 2))).toBe(true);
  });
  it('donation de la moitié avec réserve d’usufruit, puis extinction au décès', () => {
    const r = applyDonation(lots(), 'pere', 'fils', frac(1, 2), true, 'D1');
    expect(r.error).toBeUndefined();
    expect(validateLots(r.lots)).toEqual([]);
    expect(ppOf(r.lots, 'pere').n).toBe(0);
    const d = applyDeath(resolveLots(r.lots, { quartResolution: 'beneficiaire_conserve', quartPersonnalise: { holder: 'beneficiaire', note: '' } }), 'pere', 'fils');
    expect(d.inheritedPP.n).toBe(0); // le lot donné n'entre pas dans la masse
    expect(eq(ppOf(d.lots, 'fils'), frac(3, 4))).toBe(true);
    expect(eq(ppOf(d.lots, 'beneficiaire'), frac(1, 4))).toBe(true);
  });
  it('sans donation : 75 % fils / 25 % bénéficiaire, le quart déjà détenu n’est pas hérité', () => {
    const d = applyDeath(resolveLots(lots(), { quartResolution: 'beneficiaire_conserve', quartPersonnalise: { holder: 'beneficiaire', note: '' } }), 'pere', 'fils');
    expect(eq(d.inheritedPP, frac(1, 2))).toBe(true);
    expect(eq(ppOf(d.lots, 'fils'), frac(3, 4))).toBe(true);
  });
  it('quart inconnu reste inconnu', () => {
    const d = applyDeath(resolveLots(lots(), { quartResolution: 'inconnu', quartPersonnalise: { holder: 'beneficiaire', note: '' } }), 'pere', 'fils');
    expect(eq(ppOf(d.lots, 'quart'), frac(1, 4))).toBe(true);
  });
  it('refuse de donner plus que la pleine propriété du père', () => {
    expect(applyDonation(lots(), 'pere', 'fils', frac(3, 4), true, 'D').error).toMatch(/ne détient que/);
  });
  it('donation partielle (1/4) : lot scindé', () => {
    const r = applyDonation(lots(), 'pere', 'fils', frac(1, 4), true, 'D');
    expect(validateLots(r.lots)).toEqual([]);
    expect(eq(ppOf(r.lots, 'pere'), frac(1, 4))).toBe(true);
  });
});

describe('ventilation d’une vente (contrôle arithmétique, coefficient FICTIF 15 %)', () => {
  const v = (coef: number | null): Vente => ({ ...(mkVente('2027-03-01') as Vente), coefUsufruit: coef === null ? null : frac(coef, 100), frais: { cents: 0, certainty: 'manuel', source: '' }, accordsConfirmes: true });
  it('avant donation : père = 150 000 + 22 500', () => {
    const r = splitSale(lots(), v(15), euros(300000));
    expect(r.status).toBe('calcule');
    expect(r.byHolder.pere).toBe(euros(172500));
    expect(r.byHolder.fils).toBe(euros(63750));
    expect(r.byHolder.quart).toBe(euros(63750));
    expect(Object.values(r.byHolder).reduce((a, b) => a + b!, 0)).toBe(euros(300000));
  });
  it('après donation de la moitié : père = 45 000 ; écart 127 500', () => {
    const after = applyDonation(lots(), 'pere', 'fils', frac(1, 2), true, 'D').lots;
    const r = splitSale(after, v(15), euros(300000));
    expect(r.byHolder.pere).toBe(euros(45000));
    expect(euros(172500) - r.byHolder.pere!).toBe(euros(127500));
    expect(Object.values(r.byHolder).reduce((a, b) => a + b!, 0)).toBe(euros(300000));
  });
  it('avec frais au prorata, la somme retrouve le prix net au centime près', () => {
    const r = splitSale(lots(), { ...v(17), frais: { cents: 1234567, certainty: 'manuel', source: '' } }, 30000001);
    expect(Object.values(r.byHolder).reduce((a, b) => a + b!, 0)).toBe(30000001 - 1234567);
  });
  it('coefficient non renseigné : pas de résultat précis, grille fictive', () => {
    const r = splitSale(lots(), v(null), euros(300000));
    expect(r.status).toBe('non_disponible');
    expect(r.byHolder).toEqual({});
    expect(r.sensitivity?.length).toBeGreaterThan(0);
    expect(r.warnings.join(' ')).toMatch(/FICTIVE/);
  });
  it('mode montants saisis : contrôle de cohérence', () => {
    const r = splitSale(lots(), { ...v(null), mode: 'montants_saisis', montantsSaisis: { pere: euros(100000), fils: euros(100000), quart: euros(99000) } }, euros(300000));
    expect(r.status).toBe('non_disponible');
    expect(r.reasons.join(' ')).toMatch(/totalisent/);
  });
});
