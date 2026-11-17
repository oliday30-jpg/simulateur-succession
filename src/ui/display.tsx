import { createContext, useContext, type ReactNode } from 'react';
import type { Num, NumStatus } from '../engine/num';
import type { Issue } from '../engine/simulate';
import { formatEUR, type Cents } from '../util/money';
import type { HolderId, PersonId } from '../model/types';
import { renameText, whoLabel } from './naming';
import type { SliceDetail } from '../tax/brackets';
import { formatBp } from '../util/money';

/** Noms affichés (navigateur uniquement). */
export const NamesContext = createContext<{ names: Record<string, string>; show: boolean }>({ names: {}, show: true });

/** Libellé d'une personne : son prénom s'il est saisi (et affichable), sinon son rôle. */
export function useWho() {
  const { names, show } = useContext(NamesContext);
  return (id: PersonId | HolderId | 'succession'): string => whoLabel(id, show ? names : {});
}

/** Texte avec les prénoms à la place des rôles (« Trésorerie du père » → « Trésorerie de Marcel »). */
export function useT() {
  const { names, show } = useContext(NamesContext);
  return (text: string): string => (show ? renameText(text, names) : text);
}

/** Prénoms affichables (vide à l'impression si les noms sont exclus). */
export function useNames(): Record<string, string> {
  const { names, show } = useContext(NamesContext);
  return show ? names : {};
}

/** Composant pour les textes statiques : <T>Budget du père</T>. */
export function T({ children }: { children: string }) {
  return <>{useT()(children)}</>;
}

export const STATUS_TEXT: Record<NumStatus, { icon: string; text: string }> = {
  calcule: { icon: '✓', text: 'calculé (indicatif)' },
  manuel: { icon: '✎', text: 'saisi manuellement' },
  a_confirmer: { icon: '?', text: 'à confirmer' },
  partiel: { icon: '◐', text: 'partiel' },
  non_disponible: { icon: '—', text: 'non disponible' },
};

export function StatusBadge({ status }: { status: NumStatus }) {
  const s = STATUS_TEXT[status];
  return <span className={`badge st-${status}`}><span aria-hidden="true">{s.icon}</span> {s.text}</span>;
}

/** Affiche un résultat : jamais un total final s'il est partiel ou à confirmer. */
export function NumView({ n, showStatus = true }: { n: Num; showStatus?: boolean }) {
  let main: ReactNode;
  if (n.value !== null) main = <strong>{formatEUR(n.value)}</strong>;
  else if (n.lo !== undefined && n.hi !== undefined) main = <span>entre {formatEUR(n.lo)} et {formatEUR(n.hi)}</span>;
  else if (n.hi !== undefined) main = <span>au plus {formatEUR(n.hi)} (sous-total)</span>;
  else if (n.lo !== undefined) main = <span>au moins {formatEUR(n.lo)} (incomplet)</span>;
  else main = <span>non disponible</span>;
  return <span className="num">{main}{showStatus && n.status !== 'calcule' && <> <StatusBadge status={n.status} /></>}</span>;
}

export function Money({ c }: { c: Cents | null | undefined }) {
  return <span className={c === null || c === undefined ? 'na' : ''}>{formatEUR(c ?? null)}</span>;
}

export const ISSUE_TEXT: Record<Issue['level'], { icon: string; text: string }> = {
  bloquant: { icon: '⛔', text: 'Bloquant' },
  validation_requise: { icon: '⚖', text: 'Validation requise' },
  a_confirmer: { icon: '?', text: 'À confirmer' },
  info: { icon: 'ℹ', text: 'Info' },
};

export function IssueList({ issues, max }: { issues: Issue[]; max?: number }) {
  const t = useT();
  const uniq = issues.filter((x, i) => issues.findIndex((y) => y.message === x.message) === i);
  const shown = max ? uniq.slice(0, max) : uniq;
  if (!uniq.length) return <p className="muted">Aucun point en suspens.</p>;
  return (
    <ul className="issues">
      {shown.map((i, k) => (
        <li key={k} className={`issue lv-${i.level}`}><span className="lv"><span aria-hidden="true">{ISSUE_TEXT[i.level].icon}</span> {ISSUE_TEXT[i.level].text} :</span> {t(i.message)}</li>
      ))}
      {max && uniq.length > max && <li className="muted">… et {uniq.length - max} autre(s) — voir Détail fiscal.</li>}
    </ul>
  );
}

export function SliceTable({ slices, caption }: { slices: SliceDetail[]; caption: string }) {
  if (!slices.length) return null;
  return (
    <table className="slices">
      <caption>{caption}</caption>
      <thead><tr><th scope="col">Tranche</th><th scope="col">Taux</th><th scope="col">Base</th><th scope="col">Droits</th></tr></thead>
      <tbody>
        {slices.map((s, i) => (
          <tr key={i}><td>{formatEUR(s.from, { round: true })} → {formatEUR(s.to, { round: true })}</td><td>{formatBp(s.bp)}</td><td>{formatEUR(s.base)}</td><td>{formatEUR(Math.round(s.raw / 10000))}</td></tr>
        ))}
      </tbody>
    </table>
  );
}
