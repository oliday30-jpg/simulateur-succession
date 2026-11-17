import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { defaultState } from '../src/model/sample';
import { readBlobText } from '../src/persistence/io';

/**
 * Parcours : modifier valeur maison et épargne, dupliquer, ajouter une donation,
 * comparer des dates, exporter puis réimporter, retrouver le détail.
 */
describe('parcours interface', () => {
  let captured: Blob | null = null;
  beforeEach(() => {
    captured = null;
    vi.stubGlobal('confirm', () => true);
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return 'blob:local'; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('de la saisie à l’export/import et au détail', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);

    // 1. Valeur de la maison et épargne
    const hyp = screen.getByRole('group', { name: 'Hypothèse de travail' });
    const hv = within(hyp).getByLabelText('Montant');
    await user.clear(hv);
    await user.type(hv, '250 000');
    await user.tab();
    const compte = screen.getByRole('group', { name: /Compte — Comptes et placements/ });
    const sv = within(compte).getByLabelText('Montant');
    await user.clear(sv);
    await user.type(sv, '175 000,50');
    await user.tab();
    expect(sv).toHaveProperty('value', '175 000,50');
    expect(screen.getByText(/Valeur utilisée par défaut/).textContent).toMatch(/250.000/);

    // saisie invalide : erreur près du champ, valeur conservée
    await user.clear(sv);
    await user.type(sv, 'abc');
    await user.tab();
    expect(within(compte).getByRole('alert').textContent).toMatch(/Montant invalide/);
    await user.clear(sv);
    await user.type(sv, '175000,50');
    await user.tab();

    // 2. Dupliquer la référence et y ajouter une donation
    await user.click(screen.getByRole('tab', { name: 'Scénarios' }));
    const list = screen.getByRole('heading', { name: 'Mes variantes' }).parentElement!;
    await user.click(within(list).getAllByRole('button', { name: 'Dupliquer' })[0]);
    expect(screen.getByRole('heading', { name: /Variante : Référence sans donation \(copie\)/ })).toBeTruthy();
    const nameInput = screen.getByLabelText('Nom de la variante');
    await user.clear(nameInput);
    await user.type(nameInput, 'Ma donation');
    await user.click(screen.getByRole('button', { name: '+ Donation immobilière' }));
    expect(screen.getAllByText(/Donation immobilière 1\/2/).length).toBeGreaterThan(0);

    // 3. Dates : préréglage juste après les 3 ans
    await user.click(screen.getByRole('button', { name: /3 ans \+ 1 jour/ }));
    expect(screen.getByLabelText('Décès simulé du père')).toHaveProperty('value', '16/12/2029');

    // 4. Comparaison
    await user.click(screen.getByRole('tab', { name: 'Comparaison' }));
    const table = screen.getByRole('table', { name: /Comparaison des variantes/ });
    expect(within(table).getByRole('columnheader', { name: 'Ma donation' })).toBeTruthy();
    expect(screen.getByText(/n’ont pas la même base/)).toBeTruthy();
    expect(screen.getByRole('table', { name: /date de décès × variante/ })).toBeTruthy();

    // 5. Export puis réimport
    await user.click(screen.getByRole('button', { name: 'Exporter (JSON versionné)' }));
    expect(captured).not.toBeNull();
    const text = await readBlobText(captured!);
    expect(text).toContain('Ma donation');
    await user.click(screen.getByRole('button', { name: 'Recharger l’exemple' }));
    await user.click(screen.getByRole('tab', { name: 'Scénarios' }));
    expect(screen.queryByText(/Comparer « Ma donation »/)).toBeNull();
    await user.upload(screen.getByTestId('import-input'), new File([text], 'simulation.json', { type: 'application/json' }));
    await waitFor(() => expect(screen.getByText(/Import réussi/)).toBeTruthy());
    expect(screen.getByText(/Comparer « Ma donation »/)).toBeTruthy();

    // 6. Détail retrouvé : base 125 000 € → 3 750 € de droits
    await user.click(screen.getByRole('tab', { name: 'Détail fiscal' }));
    await user.selectOptions(screen.getByLabelText('Variante'), 'Ma donation');
    const summary = screen.getByText(/Donation immobilière du 15\/12\/2026 — droits d’enregistrement/);
    const details = summary.closest('details')!;
    expect(details.textContent).toMatch(/125.000,00/);
    expect(details.textContent).toMatch(/3.750,00/);
    expect(details.textContent).toMatch(/WAL-DON-ACTUEL/);
  });

  it('sélection de la répartition de la succession de la mère', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    const sel = screen.getByLabelText(/Répartition issue de la succession de la mère/) as HTMLSelectElement;
    expect(sel.value).toBe('acte2005_reduction');
    expect(screen.getByText(/^Résumé :/).textContent).toMatch(/Père — PP 2\/3/);
    await user.selectOptions(sel, 'legale_moitie');
    expect(screen.getByText(/^Résumé :/).textContent).toMatch(/Père — PP 1\/2 /);
    await user.selectOptions(sel, 'donation_survie_integrale');
    expect(screen.getByText(/^Résumé :/).textContent).toMatch(/Père — PP 100/);
    expect(screen.getByText(/^Résumé :/).textContent).not.toMatch(/Fils survivant/);
  });

  it('onglets utilisables au clavier', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    screen.getByRole('tab', { name: 'Situation et sources' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Scénarios' })).toHaveProperty('ariaSelected', 'true');
  });
});
