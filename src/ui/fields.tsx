import { useEffect, useId, useState, type ReactNode } from 'react';
import { centsToInput, parseEUR, type Cents } from '../util/money';
import { formatDate, parseUserDate, type ISODate } from '../util/dates';
import { formatFrac, parseFrac, type Frac } from '../util/fraction';
import type { Certainty, Value } from '../model/types';
import { useT } from './display';

/** Champ indispensable à l'estimation : `filled` indique s'il est déjà renseigné. */
export interface Need { essential?: boolean; filled?: boolean }
interface FieldShell extends Need { label: string; hint?: string; error?: string | null; id: string; children: ReactNode; className?: string; keepRoles?: boolean }

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

/** Les libellés et aides affichent les prénoms à la place des rôles (sauf `keepRoles`). */
export function Shell({ label, hint, error, id, children, className, keepRoles, essential, filled }: FieldShell) {
  const tr = useT();
  const t = keepRoles ? (x: string) => x : tr;
  return (
    <div className={`field ${className ?? ''} ${error ? 'has-error' : ''} ${needClass({ essential, filled })}`}>
      {essential && <NeedBadge filled={!!filled} />}
      <label htmlFor={id}>{t(label)}</label>
      {children}
      {hint && <small id={`${id}-hint`} className="hint">{t(hint)}</small>}
      {error && <small id={`${id}-err`} className="error" role="alert">⚠ {error}</small>}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string | null) =>
  [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;

export function MoneyField({ label, value, onChange, hint, allowNegative = false, required = false, className, essential }: { label: string; value: Cents | null; onChange: (v: Cents | null) => void; hint?: string; allowNegative?: boolean; required?: boolean; className?: string; essential?: boolean }) {
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
    <Shell label={label} hint={hint ?? (value === null ? 'Non renseigné (≠ 0)' : undefined)} error={error} id={id} className={className} essential={essential} filled={value !== null}>
      <div className="money">
        <input id={id} inputMode="decimal" autoComplete="off" value={text} placeholder="non renseigné"
          aria-invalid={!!error} aria-describedby={describedBy(id, hint ?? (value === null ? 'x' : undefined), error)}
          onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
        <span aria-hidden="true">€</span>
      </div>
    </Shell>
  );
}

export function DateField({ label, value, onChange, hint, allowEmpty = true, essential }: { label: string; value: ISODate | null; onChange: (v: ISODate | null) => void; hint?: string; allowEmpty?: boolean; essential?: boolean }) {
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
    <Shell label={label} hint={hint ?? 'jj/mm/aaaa'} error={error} id={id} essential={essential} filled={value !== null}>
      <input id={id} inputMode="numeric" autoComplete="off" placeholder="jj/mm/aaaa" value={text}
        aria-invalid={!!error} aria-describedby={describedBy(id, 'x', error)}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </Shell>
  );
}

export function FracField({ label, value, onChange, hint, essential }: { label: string; value: Frac | null; onChange: (v: Frac | null) => void; hint?: string; essential?: boolean }) {
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
    <Shell label={label} hint={hint ?? (value ? formatFrac(value) : 'Non renseigné')} error={error} id={id} essential={essential} filled={value !== null && value.n > 0}>
      <input id={id} autoComplete="off" value={text} placeholder="ex. 1/2 ou 15 %" aria-invalid={!!error}
        aria-describedby={describedBy(id, 'x', error)}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
    </Shell>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, hint, essential, filled = true }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][]; hint?: string } & Need) {
  const t = useT();
  const id = useId();
  return (
    <Shell label={label} hint={hint} id={id} essential={essential} filled={filled}>
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

export function CheckField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId();
  const t = useT();
  return (
    <div className="field check">
      <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
      <label htmlFor={id}>{t(label)}</label>
      {hint && <small id={`${id}-hint`} className="hint">{t(hint)}</small>}
    </div>
  );
}

export const CERTAINTY_LABEL: Record<Certainty, string> = { approx: '≈ Approximatif', manuel: '✎ Saisi manuellement', verifie: '✓ Vérifié' };

/** Montant + degré de fiabilité + provenance. */
export function ValueField({ label, value, onChange, hint, essential }: { label: string; value: Value; onChange: (v: Value) => void; hint?: string; essential?: boolean }) {
  const t = useT();
  return (
    <fieldset className={`value-field ${essential ? 'essentiel-groupe' : ''}`}>
      <legend>{t(label)}</legend>
      <MoneyField label="Montant" value={value.cents} onChange={(c) => onChange({ ...value, cents: c })} hint={hint} essential={essential} />
      <SelectField label="Fiabilité" value={value.certainty} onChange={(c) => onChange({ ...value, certainty: c })}
        options={Object.entries(CERTAINTY_LABEL) as [Certainty, string][]} />
      <TextField label="Provenance" value={value.source} onChange={(s) => onChange({ ...value, source: s })} />
      {value.note && <small className="hint">{value.note}</small>}
    </fieldset>
  );
}
