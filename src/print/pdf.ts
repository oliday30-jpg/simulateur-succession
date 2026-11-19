/**
 * Générateur PDF minimal, sans dépendance ni réseau (T18).
 * Polices standard Helvetica / Helvetica-Bold (non embarquées), encodage WinAnsi (accents français, €, « », ’).
 * Les caractères absents de WinAnsi (✓, ★, ≈, →…) sont remplacés par un équivalent simple.
 * Pages A4 (595 × 842 points), texte gauche, retour à la ligne au mot, tableaux simples.
 */

export type Font = 'R' | 'B';

// Largeurs Helvetica (AFM Adobe, millièmes de cadratin) pour les caractères 32 à 126.
const W_R = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const W_B = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

/** Unicode → octet WinAnsi pour les caractères hors Latin-1. */
const WIN: Record<string, number> = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99, 'Œ': 0x8c, 'œ': 0x9c, 'Ÿ': 0x9f };

/** Remplacements des symboles absents de WinAnsi. */
const SUBST: Record<string, string> = {
  '✓': 'OK', '✔': 'OK', '★': '*', '☐': '[ ]', '☑': '[x]', '≈': '~', '≠': '<>', '≤': '<=', '≥': '>=', '→': '->', '←': '<-', '−': '-',
  '⚠': '(!)', '⛔': '(!)', '⚖': '', 'ℹ': 'i', '◐': '~', '✎': '', '…': '...', ' ': ' ', ' ': ' ', ' ': ' ', '​': '',
};

/** Texte normalisé : symboles remplacés, caractères inconnus → « ? ». */
export function normalize(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch in SUBST) { out += SUBST[ch]; continue; }
    const c = ch.codePointAt(0)!;
    if (c === 0x0a || (c >= 0x20 && c <= 0x7e) || (c >= 0xa1 && c <= 0xff) || ch in WIN) out += ch;
    else if (c === 0x09) out += ' ';
    else out += '?';
  }
  return out;
}

/** Largeur d'un caractère (millièmes). Lettres accentuées : largeur de la lettre de base. */
function charWidth(ch: string, font: Font): number {
  const W = font === 'B' ? W_B : W_R;
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return W[c - 32];
  const base = ch.normalize('NFD')[0];
  if (base !== ch && base.charCodeAt(0) >= 32 && base.charCodeAt(0) <= 126) return W[base.charCodeAt(0) - 32];
  if (ch === '—' || ch === '…') return 1000;
  if (ch === '’' || ch === '‘') return font === 'B' ? 278 : 222;
  if (ch === '•') return 350;
  if (ch === '°') return 400;
  if (ch === 'œ' ) return 944;
  if (ch === 'Œ') return 1000;
  return 556; // «, », €, –, ×… et défaut
}

/** Largeur d'un texte (déjà normalisé) en points. */
export function textWidth(text: string, font: Font, size: number): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, font);
  return (w * size) / 1000;
}

/** Découpe en lignes tenant dans `width` (retours à la ligne explicites conservés, mots trop longs coupés). */
export function wrap(text: string, font: Font, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of normalize(text).split('\n')) {
    const words = para.split(/ +/).filter(Boolean);
    let cur = '';
    for (let w of words) {
      const cand = cur ? `${cur} ${w}` : w;
      if (textWidth(cand, font, size) <= width) { cur = cand; continue; }
      if (cur) lines.push(cur);
      cur = '';
      while (textWidth(w, font, size) > width) {
        let i = 1;
        while (i < w.length && textWidth(w.slice(0, i + 1), font, size) <= width) i++;
        lines.push(w.slice(0, i));
        w = w.slice(i);
      }
      cur = w;
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

/** Chaîne PDF littérale encodée en WinAnsi (une « lettre » JS = un octet). */
function pdfString(text: string): string {
  let out = '(';
  for (const ch of text) {
    const code = WIN[ch] ?? ch.charCodeAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else if (code < 0x20 || code > 0x7e) out += '\\' + code.toString(8).padStart(3, '0');
    else out += ch;
  }
  return out + ')';
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

export const PAGE = { w: 595, h: 842, margin: 50 };

/** Document en cours de construction : une liste d'opérations par page. */
export class PdfDoc {
  pages: string[][] = [[]];
  y = PAGE.h - PAGE.margin;
  readonly bottom = PAGE.margin + 24; // place du pied de page

  get width() { return PAGE.w - 2 * PAGE.margin; }

  newPage() { this.pages.push([]); this.y = PAGE.h - PAGE.margin; }
  /** Nouvelle page si la hauteur demandée ne tient plus. */
  ensure(h: number) { if (this.y - h < this.bottom) this.newPage(); }

  text(x: number, y: number, s: string, font: Font, size: number, grey = 0) {
    this.pages[this.pages.length - 1].push(`BT /${font === 'B' ? 'F2' : 'F1'} ${fmt(size)} Tf ${fmt(grey)} g ${fmt(x)} ${fmt(y)} Td ${pdfString(s)} Tj ET`);
  }
  line(x1: number, y1: number, x2: number, y2: number, grey = 0.6) {
    this.pages[this.pages.length - 1].push(`${fmt(grey)} G 0.5 w ${fmt(x1)} ${fmt(y1)} m ${fmt(x2)} ${fmt(y2)} l S`);
  }

  /** Paragraphe avec retour à la ligne ; `indent` décale le bloc, `bullet` s'affiche devant la première ligne. */
  paragraph(text: string, o: { font?: Font; size?: number; grey?: number; indent?: number; bullet?: string; before?: number; after?: number } = {}) {
    const font = o.font ?? 'R', size = o.size ?? 10, lead = size * 1.3, indent = o.indent ?? 0;
    const x = PAGE.margin + indent;
    const lines = wrap(text, font, size, this.width - indent);
    if (!lines.length) return;
    this.y -= o.before ?? 0;
    lines.forEach((l, i) => {
      this.ensure(lead);
      this.y -= lead;
      if (i === 0 && o.bullet) this.text(x - 10, this.y + size * 0.25, o.bullet, 'R', size, o.grey ?? 0);
      this.text(x, this.y + size * 0.25, l, font, size, o.grey ?? 0);
    });
    this.y -= o.after ?? 2;
  }

  /** Tableau : colonnes de largeur fixe (première plus large), cellules avec retour à la ligne. */
  table(rows: { cells: string[]; header?: boolean }[], o: { size?: number; indent?: number } = {}) {
    const n = Math.max(...rows.map((r) => r.cells.length), 1);
    const size = o.size ?? 8.5, lead = size * 1.3, pad = 3;
    const x0 = PAGE.margin + (o.indent ?? 0), total = this.width - (o.indent ?? 0);
    const first = n >= 3 ? total * 0.34 : total / n;
    const cols = Array.from({ length: n }, (_, i) => (i === 0 ? first : (total - first) / Math.max(n - 1, 1)));
    // Cellule → lignes avec leur police : en-tête en gras ; première colonne : premier paragraphe en gras, la suite (précisions) en normal.
    const cellLines = (r: { cells: string[]; header?: boolean }) => cols.map((w, i) => {
      const txt = r.cells[i] ?? '';
      if (r.header) return wrap(txt, 'B', size, w - 2 * pad).map((l) => ({ l, f: 'B' as Font }));
      if (i > 0) return wrap(txt, 'R', size, w - 2 * pad).map((l) => ({ l, f: 'R' as Font }));
      const [head, ...rest] = txt.split('\n');
      return [...wrap(head, 'B', size, w - 2 * pad).map((l) => ({ l, f: 'B' as Font })), ...wrap(rest.join('\n'), 'R', size, w - 2 * pad).map((l) => ({ l, f: 'R' as Font }))];
    });
    const heightOf = (cl: { l: string }[][]) => Math.max(...cl.map((l) => l.length), 1) * lead + 2 * pad;
    // L'en-tête ne reste jamais seul en bas de page : il part avec la première ligne.
    const firstTwo = rows.slice(0, 2).reduce((h, r) => h + heightOf(cellLines(r)), 0);
    this.ensure(firstTwo + 4);
    this.y -= 4;
    for (const r of rows) {
      const cl = cellLines(r);
      const h = heightOf(cl);
      this.ensure(h);
      let x = x0;
      cl.forEach((ls, i) => {
        ls.forEach(({ l, f }, k) => this.text(x + pad, this.y - pad - (k + 1) * lead + size * 0.25, l, f, size));
        x += cols[i];
      });
      this.y -= h;
      this.line(x0, this.y, x0 + total, this.y, r.header ? 0.2 : 0.7);
    }
    this.y -= 6;
  }

  /** Assemble le fichier : pied de page sur chaque page (`footer(n, total)`), table des références croisées exacte. */
  build(footer?: (page: number, total: number) => string): Uint8Array {
    const total = this.pages.length;
    const objs: string[] = [];
    // 1 catalogue, 2 arbre des pages, 3–4 polices, puis (page, contenu) par page.
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    const kids: string[] = [];
    this.pages.forEach((ops, i) => {
      const pageId = 5 + 2 * i, contentId = pageId + 1;
      const all = [...ops];
      if (footer) {
        const f = normalize(footer(i + 1, total));
        all.push(`BT /F1 8 Tf 0.35 g ${PAGE.margin} ${PAGE.margin - 10} Td ${pdfString(f)} Tj ET`);
      }
      const stream = all.join('\n');
      objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objs[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
      kids.push(`${pageId} 0 R`);
    });
    objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${total} >>`;

    let out = '%PDF-1.4\n%âãÏÓ\n';
    const offsets: number[] = [];
    for (let id = 1; id < objs.length; id++) {
      offsets[id] = out.length;
      out += `${id} 0 obj\n${objs[id]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objs.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    // Toutes les « lettres » sont < 256 (chaînes encodées en octal) : un caractère = un octet.
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
