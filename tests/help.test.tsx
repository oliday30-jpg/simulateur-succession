import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { HELP } from '../src/ui/help';
import { etatSansContrats } from './sansContrats';

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

  it('assurance du fils survivant : aide propre pour « taxée ? » et aide du tableau de comparaison', async () => {
    const user = userEvent.setup();
    render(<App initial={etatSansContrats()} />);
    await user.click(screen.getByRole('tab', { name: 'Succession du fils prédécédé' }));
    await user.selectOptions(screen.getByLabelText(/^Une assurance groupe \/ vie est-elle versée au fils survivant/), 'oui');
    // La case « taxée ? » du fils survivant a sa propre aide (barème entre frères et sœurs), pas celle de la bénéficiaire.
    await user.click(screen.getByRole('button', { name: /Aide : Assurance du fils survivant \(frère du fils prédécédé\) soumise/ }));
    const p1 = screen.getByRole('dialog', { name: /Aide : Assurance du fils survivant \(frère du fils prédécédé\) soumise/ });
    expect(p1.textContent).toMatch(/frères et sœurs/);
    expect(p1.textContent).not.toMatch(/part de maison/);
    await user.keyboard('{Escape}');
    // Le tableau n'apparaît qu'avec un montant ; son bouton « ? » utilise des intitulés de tableau.
    expect(screen.queryByRole('button', { name: /Aide : Garder ou transmettre/ })).toBeNull();
    const card = screen.getByRole('region', { name: /Succession du fils prédécédé : droits/ });
    const grp = within(card).getByRole('group', { name: /^Assurance groupe \/ vie versée au fils survivant/ });
    await user.type(within(grp).getByLabelText('Montant'), '20000');
    await user.tab();
    await user.click(screen.getByRole('button', { name: /Aide : Garder ou transmettre/ }));
    const p2 = screen.getByRole('dialog', { name: /Aide : Garder ou transmettre/ });
    expect(within(p2).getByText('Ce que montre le tableau')).toBeTruthy();
    expect(within(p2).getByText('Comment le lire')).toBeTruthy();
    expect(within(p2).queryByText('Quoi mettre')).toBeNull();
    expect(p2.textContent).toMatch(/cinq ans/);
  });

  it('toute case indispensable de l’onglet de la succession du fils prédécédé a un bouton « ? »', async () => {
    const user = userEvent.setup();
    const { container } = render(<App initial={etatSansContrats()} />);
    await user.click(screen.getByRole('tab', { name: 'Succession du fils prédécédé' }));
    for (const l of [/^Une assurance groupe \/ vie est-elle versée à la bénéficiaire/, /^Une assurance groupe \/ vie est-elle versée au fils survivant/]) await user.selectOptions(screen.getByLabelText(l), 'possible');
    // 7 cases de base + les 2 montants d'assurance
    const essentials = [...container.querySelectorAll('.field.essentiel')];
    expect(essentials.length).toBe(9);
    for (const f of essentials) {
      const group = f.closest('.value-field') ?? f;
      expect(group.querySelector('button.help-btn'), f.textContent ?? '').not.toBeNull();
    }
  });

  it('toute case indispensable de l’onglet Situation a un bouton « ? »', () => {
    const { container } = render(<App initial={etatSansContrats()} />);
    const essentials = [...container.querySelectorAll('.field.essentiel')];
    expect(essentials.length).toBeGreaterThan(0);
    for (const f of essentials) {
      const group = f.closest('.value-field') ?? f;
      expect(group.querySelector('button.help-btn'), f.textContent ?? '').not.toBeNull();
    }
  });

  it('le bouton ouvre une fenêtre flottante hors de la case, fermée par « Fermer », Échap ou un toucher ailleurs', async () => {
    const user = userEvent.setup();
    render(<App initial={etatSansContrats()} />);
    const btn = screen.getByRole('button', { name: /Aide : Répartition issue de la succession/ });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    await user.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('dialog', { name: /Aide : Répartition/ });
    // rendue directement dans <body> : rien n'est inséré dans la case, le tableau ne bouge pas
    expect(panel.parentElement).toBe(document.body);
    expect(btn.closest('.field')!.contains(panel)).toBe(false);
    expect(within(panel).getByText('Où le trouver')).toBeTruthy();
    expect(within(panel).getByText(/Acte de notoriété de 2005/)).toBeTruthy();
    await user.click(within(panel).getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(btn);
    await user.click(btn);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(btn);
    await user.click(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
    // un second toucher sur « ? » referme aussi
    await user.click(btn);
    await user.click(btn);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
