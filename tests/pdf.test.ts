import { normalize, PdfDoc, textWidth, wrap } from '../src/print/pdf';
import { elementToPdf } from '../src/print/domToPdf';

/** Octets → chaîne (un octet = un caractère), pour lire le PDF brut. */
const raw = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

describe('générateur PDF (T18)', () => {
  it('largeur Helvetica : calcul à la main', () => {
    // B 667 + o 556 + n 556 + j 222 + o 556 + u 556 + r 333 = 3 446 millièmes → 34,46 pt à 10 pt.
    expect(textWidth('Bonjour', 'R', 10)).toBeCloseTo(34.46, 5);
    // « é » a la largeur de « e » (556) : 5,56 pt à 10 pt.
    expect(textWidth('é', 'R', 10)).toBeCloseTo(5.56, 5);
  });

  it('retour à la ligne au mot', () => {
    // « aaa » = 3 × 556 = 1 668 → 16,68 pt ; « aaa bbb » ≈ 36,14 pt > 20 pt : deux lignes.
    expect(wrap('aaa bbb', 'R', 10, 20)).toEqual(['aaa', 'bbb']);
    expect(wrap('aaa bbb', 'R', 10, 40)).toEqual(['aaa bbb']);
    expect(wrap('un\ndeux', 'R', 10, 400)).toEqual(['un', 'deux']);
  });

  it('symboles absents de WinAnsi remplacés', () => {
    expect(normalize('✓ ≈ 5 € → ★')).toBe('OK ~ 5 € -> *');
    expect(normalize('ア')).toBe('?');
  });

  it('accents, €, apostrophe typographique et parenthèses encodés', () => {
    const d = new PdfDoc();
    d.paragraph('Été : 5 € (l’usufruit)');
    const s = raw(d.build());
    // É = 0xC9 = \311 ; é = \351 ; € = 0x80 = \200 ; ’ = 0x92 = \222 ; parenthèses échappées.
    expect(s).toContain('(\\311t\\351 : 5 \\200 \\(l\\222usufruit\\))');
    expect(s).toContain('/Encoding /WinAnsiEncoding');
  });

  it('structure : en-tête, table xref exacte, plusieurs pages, pied de page', () => {
    const d = new PdfDoc();
    for (let i = 0; i < 120; i++) d.paragraph(`Ligne ${i}`);
    const s = raw(d.build((p, n) => `pied ${p}/${n}`));
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    // 120 lignes de 13 pt ≈ 1 560 pt, plus de 700 pt utiles par page : au moins 3 pages.
    const count = Number(/\/Count (\d+)/.exec(s)![1]);
    expect(count).toBeGreaterThanOrEqual(3);
    expect(s).toContain(`(pied ${count}/${count})`);
    // Chaque entrée de la table xref pointe sur « id 0 obj ».
    const xrefAt = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const entries = s.slice(xrefAt).split('\n').slice(3).filter((l) => / n $/.test(l));
    entries.forEach((l, i) => { const want = `${i + 1} 0 obj\n`; const at = Number(l.slice(0, 10)); expect(s.slice(at, at + want.length)).toBe(want); });
    // Longueur déclarée de chaque flux = longueur réelle.
    for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(s.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
    }
  });

  it('DOM → PDF : titres, liste, tableau ; boutons, icônes et textes masqués ignorés', () => {
    const el = document.createElement('article');
    el.innerHTML = `
      <h2>Titre</h2>
      <p>Texte <strong>gras</strong> suivi.</p>
      <button>Bouton caché</button>
      <p class="no-print">Pas imprimé</p>
      <ul><li><span aria-hidden="true">✓</span> Point un</li></ul>
      <table><caption class="sr-only">Légende cachée</caption><thead><tr><th>Personne</th><th>Droits</th></tr></thead>
        <tbody><tr><th>Père<div class="small">barème</div></th><td>1 250,00 €</td></tr></tbody></table>`;
    const s = raw(elementToPdf(el, 'Indicatif'));
    expect(s).toContain('(Titre)');
    expect(s).toContain('(Texte gras suivi.)');
    expect(s).toContain('(Point un)');
    expect(s).toContain('(P\\350re)');
    expect(s).toContain('(bar\\350me)');
    expect(s).toContain('(1 250,00 \\200)');
    expect(s).not.toMatch(/Bouton cach|Pas imprim|gende cach|\(OK\)/);
    expect(s).toContain('(Indicatif \\227 page 1/1)');
  });
});
