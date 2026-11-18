import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { defaultState } from '../src/model/sample';
import { HELP } from '../src/ui/help';

/**
 * Aide « ? » : chaque entrée répond au minimum à « quoi », « où » et « si vide » ;
 * chaque case indispensable affichée a son bouton d'aide ; le bouton ouvre et ferme le panneau.
 */
describe('aide des cases', () => {
  it('chaque entrée d’aide est complète', () => {
    for (const [k, h] of Object.entries(HELP)) {
      expect(h.quoi.length, k).toBeGreaterThan(20);
      expect(h.ou.length, k).toBeGreaterThan(10);
      expect(h.siVide.length, k).toBeGreaterThan(10);
    }
  });

  it('toute case indispensable de l’onglet Situation a un bouton « ? »', () => {
    const { container } = render(<App initial={defaultState()} />);
    const essentials = [...container.querySelectorAll('.field.essentiel')];
    expect(essentials.length).toBeGreaterThan(0);
    for (const f of essentials) {
      const group = f.closest('.value-field') ?? f;
      expect(group.querySelector('button.help-btn'), f.textContent ?? '').not.toBeNull();
    }
  });

  it('le bouton ouvre et ferme le panneau, avec les prénoms', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    const btn = screen.getByRole('button', { name: /Aide : Répartition issue de la succession/ });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    await user.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('note', { name: /Aide : Répartition/ });
    expect(within(panel).getByText('Où le trouver')).toBeTruthy();
    expect(within(panel).getByText(/Acte de notoriété de 2005/)).toBeTruthy();
    await user.click(within(panel).getByRole('button', { name: 'Fermer l’aide' }));
    expect(screen.queryByRole('note', { name: /Aide : Répartition/ })).toBeNull();
  });
});
