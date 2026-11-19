/**
 * Dates CIVILES « AAAA-MM-JJ ». Aucun objet Date/UTC n'est utilisé pour les délais légaux :
 * un délai de trois ou cinq ans est un délai en années civiles (date anniversaire),
 * jamais 1 095 ou 1 825 jours.
 */
export type ISODate = string;

export interface Civil { y: number; m: number; d: number }

export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) =>
  [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

export function parseISO(s: string | null | undefined): Civil | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}
export const isValidISO = (s: string | null | undefined) => parseISO(s) !== null;
export const toISO = (c: Civil): ISODate =>
  `${String(c.y).padStart(4, '0')}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;

/** Comparaison lexicographique valable pour le format ISO. */
export const cmpISO = (a: ISODate, b: ISODate) => (a < b ? -1 : a > b ? 1 : 0);

export function addDays(s: ISODate, n: number): ISODate {
  const c = parseISO(s);
  if (!c) throw new Error(`Date invalide ${s}`);
  let { y, m, d } = c;
  d += n;
  while (d > daysInMonth(y, m)) { d -= daysInMonth(y, m); m++; if (m > 12) { m = 1; y++; } }
  while (d < 1) { m--; if (m < 1) { m = 12; y--; } d += daysInMonth(y, m); }
  return toISO({ y, m, d });
}

/**
 * Date anniversaire après n années. Pour un 29 février vers une année non bissextile,
 * la règle légale n'est pas documentée dans les sources consultées : on renvoie le 28 février
 * ET on signale l'ambiguïté.
 */
export function addYears(s: ISODate, n: number): { date: ISODate; ambiguous: boolean } {
  const c = parseISO(s);
  if (!c) throw new Error(`Date invalide ${s}`);
  const y = c.y + n;
  if (c.m === 2 && c.d === 29 && !isLeap(y)) return { date: toISO({ y, m: 2, d: 28 }), ambiguous: true };
  return { date: toISO({ y, m: c.m, d: c.d }), ambiguous: false };
}

export type PeriodStatus = 'dans_le_delai' | 'hors_delai' | 'a_confirmer';

/**
 * Le décès survient-il « dans les n ans qui suivent » l'acte ?
 *  - décès avant la date anniversaire → dans le délai ;
 *  - décès après la date anniversaire → hors délai ;
 *  - décès LE JOUR anniversaire, ou anniversaire ambigu (29/02 → 28/02 ou 01/03) → « à confirmer ».
 */
export function withinYears(act: ISODate, death: ISODate, n: number): { status: PeriodStatus; anniversary: ISODate; reason?: string } {
  const { date: ann, ambiguous } = addYears(act, n);
  if (cmpISO(death, act) < 0) return { status: 'hors_delai', anniversary: ann, reason: 'Décès antérieur à l’acte' };
  if (ambiguous && (death === ann || death === addDays(ann, 1)))
    return { status: 'a_confirmer', anniversary: ann, reason: 'Acte un 29 février : jour exact de fin du délai non documenté' };
  if (death === ann) return { status: 'a_confirmer', anniversary: ann, reason: 'Décès le jour anniversaire exact : bascule à confirmer' };
  return { status: cmpISO(death, ann) < 0 ? 'dans_le_delai' : 'hors_delai', anniversary: ann };
}

/** Date du jour dans le fuseau de l'appareil (et non en UTC comme `toISOString`). */
export function localToday(d: Date = new Date()): ISODate {
  return toISO({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
}

export function formatDate(s: ISODate | null | undefined): string {
  const c = parseISO(s);
  if (!c) return 'date non renseignée';
  return `${String(c.d).padStart(2, '0')}/${String(c.m).padStart(2, '0')}/${c.y}`;
}

/** Saisie « jj/mm/aaaa » ou ISO → ISO. */
export function parseUserDate(input: string): ISODate | null {
  const s = input.trim();
  if (isValidISO(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (!m) return null;
  const iso = toISO({ y: +m[3], m: +m[2], d: +m[1] });
  return isValidISO(iso) ? iso : null;
}
