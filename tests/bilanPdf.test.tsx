import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { defaultState } from '../src/model/sample';
import { readBlobText } from '../src/persistence/io';
import { formatDate, localToday } from '../src/util/dates';

/**
 * T20 — « Point de situation (PDF) » : père d'abord (maison, répartition, épargne, budget), puis succession
 * du fils prédécédé et points ouverts ; prénoms masqués par défaut ; destinataire jamais enregistré.
 */
const bytesOf = (b: Blob) => new Promise<string>((res) => {
  const r = new FileReader();
  r.onload = () => res(Array.from(new Uint8Array(r.result as ArrayBuffer), (c) => String.fromCharCode(c)).join(''));
  r.readAsArrayBuffer(b);
});

describe('Point de situation à partager', () => {
  let captured: Blob | null = null;
  beforeEach(() => {
    captured = null;
    localStorage.clear();
    URL.createObjectURL = vi.fn((b: Blob) => { captured = b; return 'blob:local'; }) as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    HTMLAnchorElement.prototype.click = vi.fn();
  });

  it('contenu du cas d’exemple : maison, répartition, épargne, succession du fils prédécédé', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    await user.click(screen.getByRole('tab', { name: 'Point de situation (PDF)' }));
    const doc = screen.getByRole('article', { name: 'Point de situation' });
    const txt = doc.textContent!.replace(/\s/g, ' ');
    expect(within(doc).getByTestId('entete-bilan').textContent).toContain(`Document établi le ${formatDate(localToday())}`);
    // Ordre : le père d'abord, puis le fils prédécédé.
    expect(txt.indexOf('Partie 1 — Situation du père')).toBeLessThan(txt.indexOf('Partie 2 — Succession du fils prédécédé'));
    // Hypothèse 300 000 €, expertise inconnue.
    expect(txt).toMatch(/Hypothèse de travail300 000,00 €/);
    expect(txt).toMatch(/Expertisenon renseigné/);
    // Acte 2005 : père 2/3 PP (200 000 €) ; chaque fils 1/6 NP (50 000 €).
    expect(txt).toMatch(/2\/3 \(66,67 %\) en pleine propriété \+ usufruit sur 1\/3 \(33,33 %\)200 000,00 €/);
    expect(txt).toMatch(/1\/6 \(16,67 %\) en nue-propriété50 000,00 €/);
    // Épargne 170 000 € (un seul poste, connu) ; prêt 15 000 − 4 × 250 = 14 000 €.
    expect(txt).toContain('Total : 170 000,00 €');
    expect(txt).toContain('solde indicatif 14 000,00 €');
    // Points d'interrogation : cases vides listées.
    expect(txt).toMatch(/Informations à compléter : .*Réserve minimale à garder/);
    expect(txt).toMatch(/Informations à compléter : .*Testament/);
    expect(within(doc).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(doc).queryAllByRole('button')).toHaveLength(0);
  });

  it('contrats connus (20/11/2026) : assureurs, montants et épargne-pension non comptée ; montants modifiables', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    await user.click(screen.getByRole('tab', { name: 'Point de situation (PDF)' }));
    let txt = screen.getByRole('article', { name: 'Point de situation' }).textContent!.replace(/\s/g, ' ');
    expect(txt).toMatch(/au profit de la bénéficiaire : oui — montant 200 000,00 € \(Assurance groupe Ethias\)/);
    expect(txt).toMatch(/frère du fils prédécédé\) : oui — montant 15 000,00 € \(Assurance groupe Beobank\)/);
    expect(txt).toMatch(/Épargne-pension : oui — montant 50 000,00 € \(Épargne-pension AXA\) ; bénéficiaire : la bénéficiaire ; non comptée.*Bénéficiaire désignée : la cohabitante.*exclusion du suicide/);
    expect(txt).not.toMatch(/capital pension/);
    // Montant modifiable dans l'onglet de la succession du fils prédécédé.
    await user.click(screen.getByRole('tab', { name: 'Succession du fils prédécédé' }));
    const champ = within(screen.getByRole('group', { name: /^Épargne-pension \(capital au décès\)/ })).getByLabelText('Montant');
    await user.clear(champ);
    await user.type(champ, '45000');
    await user.tab();
    await user.click(screen.getByRole('tab', { name: 'Point de situation (PDF)' }));
    txt = screen.getByRole('article', { name: 'Point de situation' }).textContent!.replace(/\s/g, ' ');
    expect(txt).toMatch(/Épargne-pension : oui — montant 45 000,00 €/);
  });

  it('PDF : prénoms masqués par défaut, destinataire repris, prénoms sur demande', async () => {
    const user = userEvent.setup();
    render(<App initial={defaultState()} />);
    await user.type(screen.getByLabelText('Prénom — Père'), 'Marcel');
    await user.click(screen.getByRole('tab', { name: 'Point de situation (PDF)' }));
    await user.type(screen.getByLabelText('Préparé pour (facultatif)'), 'Madame X');
    await user.click(screen.getByRole('button', { name: 'Créer le PDF' }));
    expect(captured!.type).toBe('application/pdf');
    let pdf = await bytesOf(captured!);
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('(Pr\\351par\\351 pour : Madame X)');
    expect(pdf).not.toContain('Marcel');
    expect(pdf).not.toMatch(/Cr\\351er le PDF/);

    await user.click(screen.getByLabelText('Afficher les prénoms dans ce document'));
    await user.click(screen.getByRole('button', { name: 'Créer le PDF' }));
    pdf = await bytesOf(captured!);
    expect(pdf).toContain('Marcel');
  });

  it('le destinataire n’est ni enregistré ni exporté', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: 'Point de situation (PDF)' }));
    await user.type(screen.getByLabelText('Préparé pour (facultatif)'), 'Destinataire-Témoin');
    expect(screen.getByTestId('entete-bilan').textContent).toContain('Destinataire-Témoin');
    const stored = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? '').join('\n');
    expect(stored).not.toContain('Destinataire-Témoin');
    await user.click(screen.getByRole('button', { name: 'Exporter (JSON versionné)' }));
    expect(await readBlobText(captured!)).not.toContain('Destinataire-Témoin');
  });
});
