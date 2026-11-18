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
    const sel = screen.getByLabelText(/^Répartition issue de la succession de la mère/) as HTMLSelectElement;
    expect(sel.value).toBe('acte2005_reduction');
    expect(screen.getByText(/^Résumé :/).textContent).toMatch(/Père — PP 2\/3/);
    // L'ancienne hypothèse 1/2 + 1/4 + 1/4 n'est plus proposée : l'acte de 2005 est la situation réelle.
    expect([...sel.options].map((o) => o.value)).not.toContain('legale_moitie');
    await user.selectOptions(sel, 'donation_survie_integrale');
    expect(screen.getByText(/^Résumé :/).textContent).toMatch(/Père — PP 100/);
    expect(screen.getByText(/^Résumé :/).textContent).not.toMatch(/Fils survivant/);
  });

  it('succession du fils prédécédé : renonciation retenue, partage des lots et droits comparés', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    const card = screen.getByRole('region', { name: /Succession du fils prédécédé : droits/ });
    // Valeurs par défaut : hypothèse prudente chiffrée (50 000 € en PP, sans supplément) → 1 750 € si elle accepte
    const acc = within(card).getByRole('article', { name: /accepte le legs/ });
    expect(acc.textContent).toMatch(/1.750,00.€/);
    await user.selectOptions(screen.getByLabelText(/^Part du fils prédécédé \(nue-propriété\)/), 'renonciation');
    const ren = within(card).getByRole('article', { name: /renonce/ });
    expect(ren.textContent).toMatch(/option retenue/);
    expect(ren.textContent).toMatch(/10.000,00.€/); // 37 500 € entre frères et sœurs
    expect(screen.getByText(/^Après l’option retenue :/).textContent).toMatch(/Père — PP 17\/24/);
  });

  it('les prénoms saisis remplacent les rôles dans la simulation', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    await user.type(screen.getByLabelText('Prénom — Père'), 'Marcel');
    await user.type(screen.getByLabelText('Prénom — Fils survivant'), 'Olivier');
    await user.type(screen.getByLabelText('Prénom — Fils prédécédé'), 'Pierre');
    // Le champ de saisie garde le rôle ; le reste de l'écran prend le prénom.
    expect(screen.getByRole('heading', { name: 'Budget de Marcel (facultatif)' })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: 'Comparaison' }));
    const table = screen.getByRole('table', { name: /Comparaison des variantes/ });
    expect(within(table).getByRole('rowheader', { name: /Trésorerie de Marcel après événements/ })).toBeTruthy();
    expect(within(table).getByRole('rowheader', { name: /Net reçu — Olivier/ })).toBeTruthy();
    expect(table.textContent).toMatch(/PP Marcel ; 1\/6 \(16,67\s%\) NP Olivier \/ US Marcel/); // espace insécable avant %
    expect(table.textContent).toContain('Titulaire de la part de Pierre (à déterminer)');
    expect(table.textContent).not.toMatch(/Père|Fils survivant/);
  });

  it('piste à étudier en priorité affichée en tête de la comparaison', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    await user.click(screen.getByRole('tab', { name: 'Comparaison' }));
    const card = screen.getByRole('heading', { name: 'Piste à étudier en priorité' }).parentElement!;
    // Variantes + modèles : le scénario mixte (donation + don + legs) arrive en tête dans l'exemple.
    expect(within(card).getByRole('status').textContent).toMatch(/Mixte \(modèle\).*économie estimée : entre/);
    expect(card.textContent).toMatch(/pas un conseil/);
  });

  it('onglets utilisables au clavier', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    screen.getByRole('tab', { name: 'Situation et sources' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Rapport simple' })).toHaveProperty('ariaSelected', 'true');
  });

  it('rapport simple : chiffres de la référence, piste, conseils et prénoms', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    await user.type(screen.getByLabelText('Prénom — Père'), 'Marcel');
    await user.click(screen.getByRole('tab', { name: 'Rapport simple' }));
    const art = screen.getByRole('article');
    // Référence de l'exemple (acte 2005, maison 300 000 €, épargne 170 000 €) : 47 675 € de droits.
    expect(art.textContent).toMatch(/la famille paiera environ 47.675,00.€/);
    expect(art.textContent).toMatch(/Marcel est pleinement propriétaire de deux tiers de la maison \(environ 200.000.€\)/);
    expect(art.textContent).toMatch(/Option 1 : Mixte/);
    expect(art.textContent).toMatch(/les besoins de Marcel passent en premier/);
    expect(art.textContent).toMatch(/Usufruit/);
  });
  it('donation sur mesure : montant libre et bénéficiaire au choix', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    await user.click(screen.getByRole('tab', { name: 'Scénarios' }));
    // Les modèles à montant figé ne sont plus proposés en un clic.
    expect(screen.queryByRole('button', { name: /Don bancaire 10 000/ })).toBeNull();
    const box = screen.getByRole('heading', { name: 'Donation sur mesure' }).parentElement!;
    const create = within(box).getByRole('button', { name: 'Créer la variante' });
    expect(create).toHaveProperty('disabled', true);
    await user.type(within(box).getByRole('group', { name: /Ligne 1/ }).querySelector('input')!, '12 500');
    await user.tab();
    await user.click(within(box).getByRole('button', { name: /Autre bénéficiaire/ }));
    const l2 = within(box).getByRole('group', { name: /Ligne 2/ });
    expect(within(l2).getByLabelText('Bénéficiaire')).toHaveProperty('value', 'petitFils');
    await user.type(within(l2).getByLabelText('Montant'), '3 000');
    await user.tab();
    expect(within(box).getByRole('status').textContent).toMatch(/12.500,00.€ → Fils survivant ; 3.000,00.€ → Petit-fils/);
    await user.click(create);
    expect(screen.getByRole('heading', { name: /Variante : Don enregistré 12.500,00.€ au fils survivant \+ Don enregistré 3.000,00.€ au petit-fils/ })).toBeTruthy();
    // 12 500 × 3,3 % + 3 000 × 3,3 % = 412,50 + 99 = 511,50 €
    expect(screen.getByText('Coût fiscal aujourd’hui').nextElementSibling!.textContent).toMatch(/511,50/);
  });
});
