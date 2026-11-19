/**
 * Conversion d'un aperçu affiché (DOM) en PDF texte (T18) : titres, paragraphes, listes, cases en lecture seule, tableaux.
 * Ignore ce qui n'est pas destiné à l'impression : boutons, `.no-print`, `.sr-only`, icônes `aria-hidden`.
 */
import { PdfDoc } from './pdf';

const BLOCK = new Set(['DIV', 'P', 'UL', 'OL', 'LI', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'DETAILS', 'SUMMARY', 'DL', 'DT', 'DD', 'SMALL', 'FIGURE']);

function skipped(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'TEMPLATE', 'CAPTION'].includes(el.tagName)) return true;
  const c = el.classList;
  return c.contains('no-print') || c.contains('sr-only') || c.contains('help-pop');
}

/** Texte visible d'un élément ; les sous-blocs sont séparés par un retour à la ligne. */
export function visibleText(el: Element): string {
  let out = '';
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3) out += n.textContent ?? '';
    else if (n.nodeType === 1) {
      const e = n as Element;
      if (skipped(e)) continue;
      const t = visibleText(e);
      // Statut (« partiel », « à confirmer »…) : entre parenthèses, l'icône n'étant pas reprise.
      if (e.classList.contains('badge')) { out += ` (${t.trim()})`; continue; }
      out += BLOCK.has(e.tagName) && e.tagName !== 'SMALL' ? `\n${t}\n` : t;
    }
  }
  return out;
}

const clean = (s: string) => s.split('\n').map((l) => l.replace(/[ \t\r]+/g, ' ').trim()).filter(Boolean).join('\n');

function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some((c) => !skipped(c) && (BLOCK.has(c.tagName) || hasBlockChild(c)));
}

function styleOf(el: Element): { font: 'R' | 'B'; size: number; grey: number } {
  const bold = el.matches('dt, strong, b, label, th') || !!el.querySelector('.ro-label, .value-title') || el.matches('.ro-label, .value-title');
  const small = el.matches('small, .small, .hint, .muted') || !!el.closest('.field-foot, small, .small');
  const muted = el.matches('.muted, .hint') || !!el.closest('.muted, .hint, .field-foot');
  return { font: bold ? 'B' : 'R', size: small ? 8.5 : 10, grey: muted ? 0.3 : 0 };
}

function walk(el: Element, doc: PdfDoc, indent: number) {
  if (skipped(el)) return;
  const tag = el.tagName;
  if (/^H[1-6]$/.test(tag) || tag === 'SUMMARY') {
    const t = clean(visibleText(el));
    const size = tag === 'H1' || tag === 'H2' ? 14 : tag === 'H3' ? 11.5 : 10;
    // Garder le titre avec le début de la suite (≈ en-tête de tableau + une ligne).
    doc.ensure(size * 1.3 + 90);
    doc.paragraph(t, { font: 'B', size, indent, before: tag === 'H2' ? 10 : 6, after: 3 });
    return;
  }
  if (tag === 'TABLE') {
    const rows = Array.from((el as HTMLTableElement).rows).map((r) => ({
      header: r.parentElement?.tagName === 'THEAD',
      cells: Array.from(r.cells).map((c) => clean(visibleText(c))),
    }));
    if (rows.length) doc.table(rows, { indent });
    return;
  }
  if (tag === 'UL' || tag === 'OL') {
    Array.from(el.children).forEach((li, i) => {
      if (skipped(li)) return;
      const nested = Array.from(li.children).filter((c) => c.tagName === 'UL' || c.tagName === 'OL' || c.tagName === 'TABLE' || c.tagName === 'DETAILS');
      const own = Array.from(li.childNodes).filter((n) => !(n.nodeType === 1 && nested.includes(n as Element)));
      const wrapEl = document.createElement('div');
      own.forEach((n) => wrapEl.appendChild(n.cloneNode(true)));
      const t = clean(visibleText(wrapEl));
      const st = styleOf(li);
      if (t) doc.paragraph(t, { ...st, font: 'R', indent: indent + 14, bullet: tag === 'OL' ? `${i + 1}.` : '•' });
      nested.forEach((c) => walk(c, doc, indent + 14));
    });
    doc.y -= 3;
    return;
  }
  if (!hasBlockChild(el)) {
    const t = clean(visibleText(el));
    if (t) doc.paragraph(t, { ...styleOf(el), indent });
    return;
  }
  // Conteneur : texte direct éventuel, puis enfants.
  const blockLike = el.matches('.card, section, article, header, .field, .value-field, details, .donnees-reprises');
  if (blockLike) doc.y -= 4;
  let inline = '';
  const flush = () => { const t = clean(inline); if (t) doc.paragraph(t, { ...styleOf(el), indent }); inline = ''; };
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3) { inline += n.textContent ?? ''; continue; }
    if (n.nodeType !== 1) continue;
    const c = n as Element;
    if (skipped(c)) continue;
    if (BLOCK.has(c.tagName) || hasBlockChild(c)) { flush(); walk(c, doc, indent); }
    else inline += visibleText(c);
  }
  flush();
}

/** PDF d'un élément affiché, avec pied de page sur chaque page. */
export function elementToPdf(root: Element, footer: string): Uint8Array {
  const doc = new PdfDoc();
  walk(root, doc, 0);
  return doc.build((p, n) => `${footer} — page ${p}/${n}`);
}
