import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { defaultState } from '../src/model/sample';
import { readBlobText } from '../src/persistence/io';
import { formatDate, localToday } from '../src/util/dates';

/**
 * T15 — PDF de l'onglet « Succession du fils prédécédé » pour un destinataire :
 * en-tête (destinataire, date du jour), prénoms masqués par défaut, cases vides en « non renseigné »,
 * destinataire jamais enregistré ni exporté.
 */
describe('PDF de l’onglet « Succession du fils prédécédé »', () => {
  let captured: Blob | null = null;
  beforeEach(() => {
    captured = null;
    localStorage.clear();
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return 'blob:local'; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('date du jour locale (et non UTC)', () => {
    // 31/12/2026 à 23 h 30, heure de l'appareil : le jour reste le 31 quel que soit le fuseau.
    expect(localToday(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
    expect(localToday(new Date(2027, 0, 1, 0, 15))).toBe('2027-01-01');
  });

  it('aperçu : en-tête, prénoms au choix, cases en texte, impression', async () => {
    const user = userEvent.setup();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    render(<App initial={defaultState()} />);
    await user.type(screen.getByLabelText('Prénom — Fils prédécédé'), 'Pierre');
    await user.click(screen.getByRole('tab', { name: 'Succession de Pierre' }));

    await user.click(screen.getByRole('button', { name: 'Préparer le PDF de cet onglet' }));
    await user.type(screen.getByLabelText('Préparé pour (facultatif)'), 'Madame X');

    const doc = screen.getByRole('article', { name: 'Aperçu du document' });
    const head = within(doc).getByTestId('entete-pdf');
    expect(head.textContent).toContain('Préparé pour : Madame X');
    expect(head.textContent).toContain(`Document établi le ${formatDate(localToday())}`);
    expect(head.textContent).toContain('à valider par le notaire');

    // Prénoms masqués par défaut dans le document (l'onglet garde son libellé à l'écran).
    expect(doc.textContent).not.toContain('Pierre');
    expect(head.textContent).toContain('Succession du fils prédécédé');
    await user.click(screen.getByLabelText('Afficher les prénoms dans ce PDF'));
    expect(within(doc).getByTestId('entete-pdf').textContent).toContain('Succession de Pierre');

    // Aucune case de saisie dans le document ; cases vides lisibles ; ni aide ni repère « indispensable ».
    expect(within(doc).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(doc).queryAllByRole('combobox')).toHaveLength(0);
    expect(within(doc).getAllByText('non renseigné').length).toBeGreaterThan(0);
    expect(within(doc).queryByText(/Indispensable/)).toBeNull();
    expect(within(doc).queryAllByRole('button')).toHaveLength(0);

    // Données de la situation du père reprises, à vérifier avant l'envoi.
    expect(screen.getByText(/À vérifier : données de la situation/).closest('div')!.textContent).toMatch(/1\/6 \(16,67\s%\) en nue-propriété/);

    await user.click(screen.getByRole('button', { name: 'Imprimer / enregistrer en PDF' }));
    expect(print).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Revenir à la saisie' }));
    expect(screen.queryByRole('article', { name: 'Aperçu du document' })).toBeNull();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
  });

  it('le destinataire n’est ni enregistré ni exporté', async () => {
    const user = userEvent.setup();
    render(<App />); // stockage local actif
    await user.click(screen.getByRole('tab', { name: 'Succession du fils prédécédé' }));
    await user.click(screen.getByRole('button', { name: 'Préparer le PDF de cet onglet' }));
    await user.type(screen.getByLabelText('Préparé pour (facultatif)'), 'Destinataire-Témoin');
    expect(screen.getByTestId('entete-pdf').textContent).toContain('Destinataire-Témoin');

    const stored = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? '').join('\n');
    expect(stored).not.toContain('Destinataire-Témoin');

    await user.click(screen.getByRole('button', { name: 'Exporter (JSON versionné)' }));
    expect(captured).not.toBeNull();
    expect(await readBlobText(captured!)).not.toContain('Destinataire-Témoin');
  });
});
