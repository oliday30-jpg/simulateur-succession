import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { centsToInput, parseEUR, type Cents } from '../util/money';
import { formatDate, parseUserDate, type ISODate } from '../util/dates';
import { formatFrac, parseFrac, type Frac } from '../util/fraction';
import type { Certainty, Value } from '../model/types';
import { useT } from './display';
import { HELP, type HelpKey } from './help';

/** Champ indispensable à l'estimation : `filled` indique s'il est déjà renseigné. */
export interface Need { essential?: boolean; filled?: boolean }
interface FieldShell extends Need { label: string; hint?: string; help?: HelpKey; error?: string | null; id: string; children: ReactNode; className?: string; keepRoles?: boolean }

/** Mention écrite (jamais la couleur seule) d'un champ indispensable. */
export function NeedBadge({ filled }: { filled: boolean }) {
  return filled
    ? <span className="need-badge">✓ Indispensable — renseigné</span>
    : <span className="need-badge">★ Indispensable — à remplir</span>;
}
/** Légende des cases indispensables, en tête des onglets de saisie. */
export function NeedLegend({ missing }: { missing: number }) {
  return (
    <p className="need-legend" role="note">
      Cases indispensables pour qu’une estimation puisse se faire :{' '}
      <span className="sw a-remplir">★ jaune = à remplir</span>{' '}
      <span className="sw rempli">✓ vert = renseignée</span>.{' '}
      {missing === 0 ? <strong>✓ Toutes les cases indispensables de cet onglet sont remplies.</strong> : <strong>★ Encore {missing} case{missing > 1 ? 's' : ''} indispensable{missing > 1 ? 's' : ''} à remplir.</strong>}
      {' '}Les autres cases affinent le résultat mais ne le bloquent pas.
    </p>
  );
}
const needClass = ({ essential, filled }: Need) => (essential ? `essentiel ${filled ? 'rempli' : 'a-remplir'}` : '');

/**
 * Bouton « ? » et panneau d'aide d'une case : ce qu'il faut mettre, où le trouver, exemple, effet d'une case vide.
 * Fenêtre ouverte au toucher (pas de bulle au survol, inutilisable sur iPhone).
 */
export function useHelp(key: HelpKey | undefined, label: string) {
  const t = useT();
  const id = useId();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  if (!key) return { button: null, panel: null };
  const h: { quoi: string; ou: string; exemple?: string; siVide: string; certitude?: string } = HELP[key];
  const name = `Aide : ${t(label)}`;
  const button = (
    <button ref={btnRef} type="button" className="help-btn" aria-expanded={open} aria-haspopup="dialog"
      aria-controls={open ? `${id}-aide` : undefined} aria-label={name} title="Aide" onClick={() => setOpen((o) => !o)}>?</button>
  );
  const close = (refocus: boolean) => { setOpen(false); if (refocus) btnRef.current?.focus(); };
  const panel = open ? (
    <HelpPopover id={`${id}-aide`} name={name} anchor={btnRef} onClose={close}>
      <dl>
        <dt>Quoi mettre</dt><dd>{t(h.quoi)}</dd>
        <dt>Où le trouver</dt><dd>{t(h.ou)}</dd>
        {h.exemple && <><dt>Exemple</dt><dd>{t(h.exemple)}</dd></>}
        <dt>Si la case reste vide</dt><dd>{t(h.siVide)}</dd>
        {h.certitude && <><dt>Fiabilité</dt><dd>{t(h.certitude)}</dd></>}
      </dl>
    </HelpPopover>
  ) : null;
  return { button, panel };
}

/**
 * Petite fenêtre d'aide flottante, rendue dans <body> : elle ne décale ni la case ni le tableau.
 * Placée sous le bouton « ? » (au-dessus s'il manque de place), toujours gardée dans l'écran.
 * Se ferme par « Fermer », Échap, un toucher à l'extérieur, un défilement de la page ou un redimensionnement.
 */
function HelpPopover({ id, name, anchor, onClose, children }: { id: string; name: string; anchor: RefObject<HTMLButtonElement>; onClose: (refocus: boolean) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect();
    const el = ref.current;
    if (!a || !el) return;
    const vw = window.innerWidth || 390, vh = window.innerHeight || 800, m = 8;
    const width = Math.min(340, vw - 2 * m);
    const left = Math.max(m, Math.min(a.left - 12, vw - width - m));
    const hgt = el.offsetHeight;
    const below = a.bottom + 6;
    const top = below + hgt > vh - m && a.top - 6 - hgt >= m ? a.top - 6 - hgt : Math.max(m, Math.min(below, vh - m - hgt));
    setPos({ top, left, width });
    el.focus({ preventScroll: true });
  }, [anchor]);
  useEffect(() => {
    const inside = (n: EventTarget | null) => !!n && (ref.current?.contains(n as Node) || anchor.current?.contains(n as Node));
    const outside = (e: Event) => { if (!inside(e.target)) closeRef.current(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(true); };
    const scroll = (e: Event) => { if (!ref.current?.contains(e.target as Node)) closeRef.current(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', scroll);
    };
  }, [anchor]);
  return createPortal(
    <div ref={ref} id={id} className="help-pop" role="dialog" aria-label={name} tabIndex={-1} style={pos}>
      <div className="help-pop-head">
        <strong>{name}</strong>
        <button type="button" className="link" onClick={() => closeRef.current(true)}>Fermer</button>
      </div>
      {children}
    </div>,
    document.body,
  );
}

/** Les libellés et aides affichent les prénoms à la place des rôles (sauf `keepRoles`). */
export function Shell({ label, hint, help, error, id, children, className, keepRoles, essential, filled }: FieldShell) {
  const tr = useT();
  const { button, panel } = useHelp(help, label);
  const t = keepRoles ? (x: string) => x : tr;
  return (
    <div className={`field ${className ?? ''} ${error ? 'has-error' : ''} ${needClass({ essential, filled })}`}>
      {/* Trois zones (en-tête, case, aide) : dans une grille, elles s'alignent d'une colonne à l'autre (subgrid). */}
      <div className="field-head">
        {essential && <NeedBadge filled={!!filled} />}
        <span className="label-row"><label htmlFor={id}>{t(label)}</label>{button}</span>
      </div>
      <div className="field-ctl">{children}</div>
      <div className="field-foot">
        {hint && <small id={`${id}-hint`} className="hint">{t(hint)}</small>}
        {error && <small id={`${id}-err`} className="error" role="alert">⚠ {error}</small>}
        {panel}
      </div>
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string | null) =>
  [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;

export function MoneyField({ label, value, onChange, hint, help, allowNegative = false, required = false, className, essential }: { label: string; value: Cents | null; onChange: (v: Cents | null) => void; hint?: string; help?: HelpKey; allowNegative?: boolean; required?: boolean; className?: string; essential?: boolean }) {
  const id = useId();
  const [text, setText] = useState(centsToInput(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(centsToInput(value)); }, [value]);
  const commit = () => {
    const r = parseEUR(text);
    if (!r.ok) { setError(r.error); return; }
    if (r.value !== null && r.value < 0 && !allowNegative) { setError('Montant négatif non admis ici'); return; }
    if (r.value === null && required) { setError('Champ requis pour ce calcul'); }
    else setError(null);
    if (r.value !== value) onChange(r.value);
    setText(centsToInput(r.value));
  };
  return (
    <Shell label={label} hint={hint ?? (value === null ? 'Non renseigné (≠ 0)' : undefined)} help={help} error={error} id={id} className={className} essential={essential} filled={value !== null}>
      <div className="money">
        <input id={id} inputMode="decimal" autoComplete="off" value={text} placeholder="non renseigné"
          aria-invalid={!!error} aria-describedby={describedBy(id, hint ?? (value === null ? 'x' : undefined), error)}
          onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
        <span aria-hidden="true">€</span>
      </div>
    </Shell>
  );
}

export function DateField({ label, value, onChange, hint, help, allowEmpty = true, essential }: { label: string; value: ISODate | null; onChange: (v: ISODate | null) => void; hint?: string; help?: HelpKey; allowEmpty?: boolean; essential?: boolean }) {
  const id = useId();
  const [text, setText] = useState(value ? formatDate(value) : '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(value ? formatDate(value) : ''); }, [value]);
  const commit = () => {
    if (text.trim() === '') { if (allowEmpty) { setError(null); if (value !== null) onChange(null); } else setError('Date requise'); return; }
    const iso = parseUserDate(text);
    if (!iso) { setError('Date invalide : format jj/mm/aaaa'); return; }
    setError(null);
    if (iso !== value) onChange(iso);
    setText(formatDate(iso));
  };
  return (
    <Shell label={label} hint={hint ?? 'jj/mm/aaaa'} help={help} error={error} id={id} essential={essential} filled={value !== null}>
      <input id={id} inputMode="numeric" autoComplete="off" placeholder="jj/mm/aaaa" value={text}
        aria-invalid={!!error} aria-describedby={describedBy(id, 'x', error)}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </Shell>
  );
}

export function FracField({ label, value, onChange, hint, help, essential }: { label: string; value: Frac | null; onChange: (v: Frac | null) => void; hint?: string; help?: HelpKey; essential?: boolean }) {
  const id = useId();
  const show = (f: Frac | null) => (f ? (f.d === 100 || 100 % f.d === 0 ? String(Math.round((f.n / f.d) * 10000) / 100).replace('.', ',') + ' %' : `${f.n}/${f.d}`) : '');
  const [text, setText] = useState(show(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setText(show(value)); }, [value]);
  const commit = () => {
    if (text.trim() === '') { setError(null); onChange(null); return; }
    const f = parseFrac(text);
    if (!f || f.n > f.d) { setError('Saisir une fraction (1/4) ou un pourcentage entre 0 et 100'); return; }
    setError(null);
    onChange(f);
  };
  return (
    <Shell label={label} hint={hint ?? (value ? formatFrac(value) : 'Non renseigné')} help={help} error={error} id={id} essential={essential} filled={value !== null && value.n > 0}>
      <input id={id} autoComplete="off" value={text} placeholder="ex. 1/2 ou 15 %" aria-invalid={!!error}
        aria-describedby={describedBy(id, 'x', error)}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </Shell>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, hint, help, essential, filled = true }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][]; hint?: string; help?: HelpKey } & Need) {
  const t = useT();
  const id = useId();
  return (
    <Shell label={label} hint={hint} help={help} id={id} essential={essential} filled={filled}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} aria-describedby={hint ? `${id}-hint` : undefined}>
        {options.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
      </select>
    </Shell>
  );
}

export function TextField({ label, value, onChange, hint, keepRoles }: { label: string; value: string; onChange: (v: string) => void; hint?: string; keepRoles?: boolean }) {
  const id = useId();
  return (
    <Shell label={label} hint={hint} id={id} keepRoles={keepRoles}>
      <input id={id} value={value} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
    </Shell>
  );
}

export function CheckField({ label, checked, onChange, hint, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; help?: HelpKey }) {
  const id = useId();
  const t = useT();
  const { button, panel } = useHelp(help, label);
  return (
    <div className="field check">
      <div className="field-head" aria-hidden="true" />
      <div className="field-ctl">
        <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
        <label htmlFor={id}>{t(label)}</label>
        {button}
      </div>
      <div className="field-foot">{hint && <small id={`${id}-hint`} className="hint">{t(hint)}</small>}{panel}</div>
    </div>
  );
}

export const CERTAINTY_LABEL: Record<Certainty, string> = { approx: '≈ Approximatif', manuel: '✎ Saisi manuellement', verifie: '✓ Vérifié' };

/** Montant + degré de fiabilité + provenance. */
export function ValueField({ label, value, onChange, hint, help, essential }: { label: string; value: Value; onChange: (v: Value) => void; hint?: string; help?: HelpKey; essential?: boolean }) {
  const t = useT();
  const { button, panel } = useHelp(help, label);
  const titleId = useId();
  // Groupe ARIA plutôt que <fieldset> : Chrome n'aligne pas le contenu d'un fieldset sur la grille parente (subgrid).
  return (
    <div role="group" aria-labelledby={titleId} className={`value-field ${essential ? 'essentiel-groupe' : ''}`}>
      <div className="value-head">
        <span className="label-row"><span id={titleId} className="value-title">{t(label)}</span>{button}</span>
        {panel}
      </div>
      <MoneyField label="Montant" value={value.cents} onChange={(c) => onChange({ ...value, cents: c })} hint={hint} essential={essential} />
      <SelectField label="Fiabilité" help="fiabilite" value={value.certainty} onChange={(c) => onChange({ ...value, certainty: c })}
        options={Object.entries(CERTAINTY_LABEL) as [Certainty, string][]} />
      <TextField label="Provenance" value={value.source} onChange={(s) => onChange({ ...value, source: s })} />
      {value.note && <small className="hint value-note">{value.note}</small>}
    </div>
  );
}
