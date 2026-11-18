import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { defaultState, sampleSituation, mkDonBancaire, mkLegs } from '../src/model/sample';
import { countMissing, scenarioNeeds, situationNeeds } from '../src/ui/essentials';
import type { Scenario } from '../src/model/types';

/**
 * Cases indispensables = celles dont l'absence rend le moteur « bloquant ».
 * Cas d'exemple : maison (hypothèse renseignée), lots de l'acte 2005 cohérents,
 * mode A, un poste « compte » renseigné, créance exclue → rien ne manque.
 */
describe('cases indispensables', () => {
  it('situation d’exemple : toutes renseignées ; vider l’avoir ou la valeur retenue en fait manquer une', () => {
    const s = sampleSituation();
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

  it('interface : légende et case jaune « à remplir » qui passe au vert', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
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
