import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { defaultState, sampleSituation } from '../src/model/sample';
import { computeSuccFilsPredecede, type NetKey } from '../src/engine/succFilsPredecede';
import { euros as E } from '../src/util/money';
import type { Situation } from '../src/model/types';

/**
 * T22 — Ce que la bénéficiaire (cohabitante légale) garde au final selon son option.
 *
 * Calculs indépendants (décès 07/10/2026, barème « conjoints, cohabitants légaux et ligne directe » 2026),
 * maison 300 000 € → 1/6 = 50 000 € en pleine propriété, assurance 200 000 € taxée, sans supplément d'exemption,
 * exemption de 12 500 € imputée à 3 % (− 375 €) :
 *  - 200 000 € seuls : 375 + 500 + 1 250 + 3 500 + 5 000 + 7 000 = 17 625 − 375 = 17 250 ;
 *  - 250 000 € : 17 625 + 50 000 × 18 % = 26 625 − 375 = 26 250 ;
 *  - 280 000 € : 26 625 + 30 000 × 24 % (tranche 250 000 … 500 000 €) = 33 825 − 375 = 33 450.
 *
 * Net = assurance − droits ± (biens − dettes) :
 *  - autres biens 0 : pure = BI = 200 000 − 26 250 + 50 000 = 223 750 ; renonciation = 200 000 − 17 250 = 182 750 ;
 *  - autres biens + 30 000 : pure = BI = 200 000 − 33 450 + 80 000 = 246 550 ;
 *  - autres biens − 120 000 (solde − 70 000, part taxable 0) : pure = 200 000 − 17 250 − 70 000 = 112 750 ;
 *    BI = 200 000 − 17 250 + 0 = 182 750 (= renonciation).
 */
const base = (autres: number | null): Situation => {
  const s = sampleSituation();
  Object.assign(s.succFilsPredecede, { testament: 'legs_beneficiaire', descendants: 'aucun', residenceCommune: 'non', baseNP: 'pleine_propriete', supplementCohabitant: 'ne_pas_appliquer', assuranceTaxee: 'oui', assuranceFilsTaxee: 'oui' });
  s.succFilsPredecede.autresBiensNets.cents = autres === null ? null : E(autres);
  return s;
};
const cas = (s: Situation, k: NetKey) => computeSuccFilsPredecede(s).net!.cases.find((c) => c.key === k)!;

describe('net final de la bénéficiaire selon son option', () => {
  it('autres biens nets à 0 € : acceptation 223 750 €, renonciation 182 750 €', () => {
    const s = base(0);
    const pure = cas(s, 'pure');
    expect(pure.assurance.value).toBe(E(200000));
    expect(pure.droits.value).toBe(E(26250));
    expect(pure.solde.value).toBe(E(50000));
    expect(pure.partMaison).toBe(E(50000));
    expect(pure.net.value).toBe(E(223750));
    expect(cas(s, 'inventaire').net.value).toBe(E(223750));
    const ren = cas(s, 'renonciation');
    expect(ren.droits.value).toBe(E(17250));
    expect(ren.solde.value).toBe(0);
    expect(ren.net.value).toBe(E(182750));
  });

  it('autres biens + 30 000 € : 246 550 € en acceptant', () => {
    const s = base(30000);
    expect(cas(s, 'pure').net.value).toBe(E(246550));
    expect(cas(s, 'inventaire').net.value).toBe(E(246550));
  });

  it('succession déficitaire (− 120 000 €) : 112 750 € en acceptant purement et simplement, 182 750 € sous bénéfice d’inventaire ou en renonçant', () => {
    const s = base(-120000);
    const pure = cas(s, 'pure');
    expect(pure.solde.value).toBe(E(-70000));
    expect(pure.net.value).toBe(E(112750));
    expect(pure.notes.join(' ')).toMatch(/paierait 70.000,00.€ de dettes/);
    const inv = cas(s, 'inventaire');
    expect(inv.solde.value).toBe(0);
    expect(inv.partMaison).toBe(0);
    expect(inv.net.value).toBe(E(182750));
    expect(cas(s, 'renonciation').net.value).toBe(E(182750));
  });

  it('dettes non renseignées : acceptation pure inconnue, bénéfice d’inventaire au moins 182 750 €', () => {
    const s = base(null);
    const pure = cas(s, 'pure');
    expect(pure.net.value).toBeNull();
    expect(pure.net.status).toBe('partiel');
    expect(pure.notes.join(' ')).toMatch(/Avec des autres biens nets à 0 € : 223.750,00.€/);
    const inv = cas(s, 'inventaire');
    expect(inv.net).toMatchObject({ value: null, lo: E(182750), status: 'partiel' });
    expect(cas(s, 'renonciation').net.value).toBe(E(182750));
  });

  it('assurance seulement « peut-être » : fourchette 0 … 182 750 € en renonçant ; taxation à confirmer : 182 750 … 200 000 €', () => {
    const s = base(0);
    s.succFilsPredecede.assuranceExiste = 'possible';
    const ren = cas(s, 'renonciation');
    expect(ren.net).toMatchObject({ value: null, lo: 0, hi: E(182750) });
    expect(ren.netPrudent).toBe(E(182750));
    s.succFilsPredecede.assuranceExiste = 'oui';
    s.succFilsPredecede.assuranceTaxee = 'inconnu';
    expect(cas(s, 'renonciation').net).toMatchObject({ value: null, lo: E(182750), hi: E(200000) });
    // Les droits de l'onglet ne changent pas avec la variante « reçue mais non taxée ».
    expect(computeSuccFilsPredecede(s).scenarios[1].rows.find((r) => r.id === 'beneficiaire')!.droits).toMatchObject({ lo: 0, hi: E(17250) });
  });

  it('base de la nue-propriété à confirmer sans coefficient : acceptation « au moins », renonciation fourchette complète', () => {
    const s = base(0);
    Object.assign(s.succFilsPredecede, { baseNP: 'a_confirmer', coefNP: null, assuranceTaxee: 'inconnu' });
    expect(cas(s, 'pure').net).toMatchObject({ value: null, lo: E(223750), hi: undefined, status: 'partiel' });
    // Renonciation : 200 000 − 17 250 (taxée) … 200 000 (non taxée), indépendant de la base de la nue-propriété.
    expect(cas(s, 'renonciation').net).toMatchObject({ value: null, lo: E(182750), hi: E(200000), status: 'a_confirmer' });
  });

  it('sans testament : seule la renonciation est calculée ; épargne-pension signalée, non comptée', () => {
    const s = base(0);
    s.succFilsPredecede.testament = 'aucun';
    const r = computeSuccFilsPredecede(s).net!;
    expect(r.cases.find((c) => c.key === 'pure')!.disponible).toBe(false);
    expect(r.cases.find((c) => c.key === 'renonciation')!.net.value).toBe(E(182750));
    expect(r.epargnePension).toBe(E(50000));
  });
});

describe('affichage dans l’onglet', () => {
  beforeEach(() => localStorage.clear());
  it('trois options affichées avec le net final', async () => {
    const user = userEvent.setup();
    const st = defaultState();
    Object.assign(st.situation.succFilsPredecede, { testament: 'legs_beneficiaire', descendants: 'aucun', residenceCommune: 'non', baseNP: 'pleine_propriete', supplementCohabitant: 'ne_pas_appliquer', assuranceTaxee: 'oui' });
    st.situation.succFilsPredecede.autresBiensNets.cents = 0;
    render(<App initial={st} />);
    await user.click(screen.getByRole('tab', { name: /Succession du fils prédécédé/ }));
    const bloc = screen.getByRole('heading', { name: /garderait au final/ }).closest('section')!;
    const pure = within(bloc).getByRole('article', { name: 'Elle accepte purement et simplement' });
    expect(within(pure).getByText('= Net au final').closest('tr')!.textContent).toMatch(/223.750,00.€/);
    expect(within(bloc).getByRole('article', { name: 'Elle accepte sous bénéfice d’inventaire' })).toBeTruthy();
    expect(within(within(bloc).getByRole('article', { name: 'Elle renonce à la succession' }).querySelector('tfoot')! as HTMLElement).getByText(/182.750,00.€/)).toBeTruthy();
    expect(bloc.textContent).toMatch(/Épargne-pension de 50.000,00.€.*non comptée/);
    expect(bloc.textContent).toMatch(/lui transmet son assurance de 15.000,00.€/);
  });
});
