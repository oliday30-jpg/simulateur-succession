import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { defaultState, sampleSituation, mkDonBancaire, mkLegs } from '../src/model/sample';
import { countMissing, scenarioNeeds, sfpNeeds, situationNeeds } from '../src/ui/essentials';
import type { Scenario } from '../src/model/types';
import { etatSansContrats, sansContrats } from './sansContrats';

/**
 * Cases indispensables = celles dont l'absence rend le moteur « bloquant ».
 * Cas d'exemple : maison (hypothèse renseignée), lots de l'acte 2005 cohérents,
 * mode A, un poste « compte » renseigné, créance exclue → rien ne manque.
 */
describe('cases indispensables', () => {
  it('situation d’exemple : toutes renseignées ; vider l’avoir ou la valeur retenue en fait manquer une', () => {
    const s = sansContrats(sampleSituation());
    expect(countMissing(situationNeeds(s))).toBe(0);
    const compte = s.postes.find((p) => p.kind === 'compte')!;
    compte.value.cents = null;
    expect(countMissing(situationNeeds(s))).toBe(1);
    // l'expertise devient la valeur retenue alors qu'elle est vide → 2 manquantes
    s.house.sourceValeurCourante = 'expertise';
    s.house.valeurExpertise.cents = null;
    expect(countMissing(situationNeeds(s))).toBe(2);
    // créance incluse au montant recouvré, non saisi → 3
    s.creance.inclusion = 'montant_recouvre';
    s.creance.recouvre.cents = null;
    expect(countMissing(situationNeeds(s))).toBe(3);
  });

  it('variante : date de décès, montant du don et du legs actifs', () => {
    const sc = { ...defaultState().scenarios[0], deathDate: null, events: [mkDonBancaire(10000, true)], legs: [mkLegs(20000)], rulesMode: 'auto' } as Scenario;
    const don = sc.events[0];
    if (don.type === 'don_bancaire') don.montant = null;
    sc.legs[0].montant = null;
    // décès vide + don vide + legs vide = 3
    expect(countMissing(scenarioNeeds(sc))).toBe(3);
    sc.legs[0].actif = false; // un legs désactivé n'est plus indispensable
    sc.deathDate = '2027-11-30';
    expect(countMissing(scenarioNeeds(sc))).toBe(1);
  });

  /**
   * Succession du fils prédécédé, données par défaut : valeur au décès, testament, descendants,
   * résidence, autres biens, existence des deux assurances = 7 cases à remplir.
   * Une assurance « peut-être » ajoute son montant ; « non » le retire ; base « nue-propriété » ajoute le coefficient.
   */
  it('succession du fils prédécédé : cases selon la situation', () => {
    const s = sansContrats(sampleSituation());
    expect(countMissing(sfpNeeds(s))).toBe(7);
    s.succFilsPredecede.assuranceExiste = 'possible';
    expect(countMissing(sfpNeeds(s))).toBe(7); // existence renseignée (−1), montant demandé (+1)
    s.succFilsPredecede.assuranceFilsExiste = 'non';
    expect(countMissing(sfpNeeds(s))).toBe(6);
    s.succFilsPredecede.baseNP = 'nue_propriete';
    expect(countMissing(sfpNeeds(s))).toBe(7);
    s.succFilsPredecede.testament = 'legs_beneficiaire';
    s.succFilsPredecede.descendants = 'aucun';
    s.succFilsPredecede.residenceCommune = 'non';
    s.succFilsPredecede.autresBiensNets.cents = 0;
    s.succFilsPredecede.assurance.cents = 1000000;
    s.succFilsPredecede.coefNP = { n: 60, d: 100 };
    s.house.valeurDecesFilsPredecede.cents = 30000000;
    expect(countMissing(sfpNeeds(s))).toBe(0);
  });

  it('succession du fils prédécédé : légende, cases jaunes et montant d’assurance affiché seulement si le contrat existe', async () => {
    const user = userEvent.setup();
    render(<App initial={etatSansContrats()} />);
    await user.click(screen.getByRole('tab', { name: 'Succession du fils prédécédé' }));
    expect(screen.getByText(/Encore 7 cases indispensables à remplir/)).toBeTruthy();
    const q = screen.getByLabelText(/^Une assurance groupe \/ vie est-elle versée à la bénéficiaire/);
    expect(q.closest('.field')!.className).toMatch(/essentiel a-remplir/);
    expect(screen.queryByRole('group', { name: /^Assurance groupe \/ vie versée à la bénéficiaire/ })).toBeNull();
    await user.selectOptions(q, 'non');
    expect(q.closest('.field')!.className).toMatch(/essentiel rempli/);
    expect(screen.getByText(/Encore 6 cases indispensables à remplir/)).toBeTruthy();
    await user.selectOptions(q, 'oui');
    expect(screen.getByRole('group', { name: /^Assurance groupe \/ vie versée à la bénéficiaire/ })).toBeTruthy();
    expect(screen.getByText(/Encore 7 cases indispensables à remplir/)).toBeTruthy();
  });

  it('interface : légende et case jaune « à remplir » qui passe au vert', async () => {
    const user = userEvent.setup();
    render(<App initial={etatSansContrats()} />);
    expect(screen.getByText(/Toutes les cases indispensables de cet onglet sont remplies/)).toBeTruthy();
    const compte = screen.getByRole('group', { name: /Compte — Comptes et placements/ });
    const input = within(compte).getByLabelText('Montant');
    const field = input.closest('.field')!;
    expect(field.className).toMatch(/essentiel rempli/);
    expect(within(field as HTMLElement).getByText(/Indispensable — renseigné/)).toBeTruthy();
    await user.clear(input);
    await user.tab();
    expect(field.className).toMatch(/essentiel a-remplir/);
    expect(within(field as HTMLElement).getByText(/Indispensable — à remplir/)).toBeTruthy();
    expect(screen.getByText(/Encore 1 case indispensable à remplir/)).toBeTruthy();
  });
});
