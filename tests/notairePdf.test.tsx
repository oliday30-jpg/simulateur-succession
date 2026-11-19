import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { defaultState } from '../src/model/sample';

/**
 * T19 — « Créer le PDF » dans l'onglet « Questions pour le notaire » (même générateur que T18).
 * Attendu : fichier PDF sans prénoms par défaut (case « Inclure les noms »), cases ☐ rendues « [ ] »,
 * tableau de synthèse repris, boutons et textes d'aide exclus ; l'écran garde l'affichage des prénoms.
 */
describe('PDF de la fiche « Questions pour le notaire »', () => {
  let captured: Blob | null = null;
  beforeEach(() => {
    captured = null;
    localStorage.clear();
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return 'blob:local'; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  const bytesOf = (b: Blob) => new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(Array.from(new Uint8Array(r.result as ArrayBuffer), (c) => String.fromCharCode(c)).join(''));
    r.readAsArrayBuffer(b);
  });

  it('prénoms exclus par défaut, inclus si la case est cochée', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    await user.type(screen.getByLabelText('Prénom — Père'), 'Marcel');
    await user.click(screen.getByRole('tab', { name: 'Questions pour le notaire' }));

    await user.click(screen.getByRole('button', { name: 'Créer le PDF' }));
    expect(captured).not.toBeNull();
    expect(captured!.type).toBe('application/pdf');
    let pdf = await bytesOf(captured!);
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    // Titre en WinAnsi : à = \340 ; cases ☐ → « [ ] ».
    expect(pdf).toContain('(Questions \\340 valider avec le notaire)');
    expect(pdf).toContain('[ ]');
    expect(pdf).toContain('Synth\\350se des variantes compar\\351es');
    expect(pdf).toContain('Quasi-usufruit du p\\350re');
    expect(pdf).not.toContain('Marcel');
    expect(pdf).not.toMatch(/Cr\\351er le PDF|Imprimer \(ordinateur\)|Sur iPhone/);
    expect(pdf).toContain('Simulation indicative, \\340 valider par le notaire');
    expect(screen.getByRole('status').textContent).toMatch(/PDF téléchargé/);

    // À l'écran, la fiche garde les prénoms (affichage habituel), avant et après le PDF.
    const fiche = screen.getByRole('article', { name: 'Questions à valider avec le notaire' });
    expect(within(fiche).getAllByText(/Marcel/).length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText('Inclure les noms affichés à l’impression'));
    await user.click(screen.getByRole('button', { name: 'Créer le PDF' }));
    pdf = await bytesOf(captured!);
    expect(pdf).toContain('Quasi-usufruit de Marcel');
  });
});
