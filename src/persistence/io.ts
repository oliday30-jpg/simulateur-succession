import type { AppState, Scenario } from '../model/types';
import { formatDate } from '../util/dates';
import { defaultState } from '../model/sample';
import { APP_ID, exportSchema, migrate, migrateV0, SCHEMA_VERSION, stateSchema, type ExportFile } from './schema';
import type { SimResult } from '../engine/simulate';
import type { Num } from '../engine/num';

const KEY_STATE = 'sim-succession:state';
const KEY_NAMES = 'sim-succession:noms';
const KEY_ENABLED = 'sim-succession:stockage-actif';

/** Accès protégé au stockage local (navigation privée, stockage bloqué...). */
function ls(): Storage | null {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function storageEnabled(): boolean {
  try { return ls()?.getItem(KEY_ENABLED) !== 'non'; } catch { return false; }
}

export function setStorageEnabled(on: boolean) {
  try {
    const s = ls(); if (!s) return;
    s.setItem(KEY_ENABLED, on ? 'oui' : 'non');
    if (!on) { s.removeItem(KEY_STATE); s.removeItem(KEY_NAMES); }
  } catch { /* stockage indisponible */ }
}

export function clearStorage() {
  try { const s = ls(); s?.removeItem(KEY_STATE); s?.removeItem(KEY_NAMES); } catch { /* ignore */ }
}

export function loadState(): AppState | null {
  if (!storageEnabled()) return null;
  try {
    const raw = ls()?.getItem(KEY_STATE);
    if (!raw) return null;
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as AppState) : null;
  } catch { return null; }
}

export function saveState(st: AppState) {
  if (!storageEnabled()) return;
  try { ls()?.setItem(KEY_STATE, JSON.stringify(st)); } catch { /* quota ou blocage */ }
}

export type Names = Record<string, string>;
export function loadNames(): Names {
  if (!storageEnabled()) return {};
  try { return JSON.parse(ls()?.getItem(KEY_NAMES) ?? '{}') as Names; } catch { return {}; }
}
export function saveNames(n: Names) {
  if (!storageEnabled()) return;
  try { ls()?.setItem(KEY_NAMES, JSON.stringify(n)); } catch { /* ignore */ }
}

export const EXPORT_WARNING = 'Ce fichier contient les montants de la simulation. Il ne contient les noms que si vous l’avez demandé. Ne le partagez qu’avec des personnes de confiance.';

export function buildExport(st: AppState, today: string, names?: Names): ExportFile {
  return { app: APP_ID, schemaVersion: SCHEMA_VERSION, exportedAt: today, avertissement: EXPORT_WARNING, ...(names && Object.keys(names).length ? { noms: names } : {}), state: st };
}

export function parseImport(text: string): { ok: true; state: AppState; names?: Names; note?: string } | { ok: false; error: string } {
  if (text.length > 2_000_000) return { ok: false, error: 'Fichier trop volumineux (> 2 Mo) pour une simulation.' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'JSON illisible.' }; }
  const m = migrate(raw);
  if (!m.ok) {
    const r = raw as Record<string, unknown>;
    if (r && r.app === APP_ID && (r.schemaVersion === undefined || r.schemaVersion === 0))
      return { ok: true, state: migrateV0(defaultState(), r as { houseValue?: number; savings?: number }), note: 'Fichier v0 migré vers la version 1.' };
    return { ok: false, error: m.error };
  }
  const p = exportSchema.safeParse(m.data);
  if (!p.success) {
    const first = p.error.issues[0];
    return { ok: false, error: `Fichier non conforme au schéma : ${first.path.join('.')} — ${first.message}` };
  }
  const ids = new Set(p.data.state.scenarios.map((s) => s.id));
  if (ids.size !== p.data.state.scenarios.length) return { ok: false, error: 'Identifiants de scénarios dupliqués.' };
  return { ok: true, state: p.data.state as AppState, names: p.data.noms };
}

const numCsv = (n: Num) => {
  const e = (c: number) => (c / 100).toFixed(2).replace('.', ',');
  if (n.value !== null) return e(n.value);
  if (n.lo !== undefined && n.hi !== undefined) return `${e(n.lo)} à ${e(n.hi)}`;
  if (n.hi !== undefined) return `≤ ${e(n.hi)}`;
  return '';
};
const csvCell = (s: string) => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

/** Export CSV (séparateur « ; » pour Excel fr-BE). Contient des montants. */
export function comparisonCsv(rows: { sc: Scenario; res: SimResult; ref: SimResult }[]): string {
  const header = ['Scénario', 'Date décès', 'Règles', 'Coût aujourd’hui (fiscal)', 'Droits au décès', 'Statut droits décès', 'Total fiscal', 'Frais non fiscaux', 'Total frais compris', 'Trésorerie du père après événements', 'Écart total fiscal vs référence', 'Points en suspens'];
  const lines = [header.map(csvCell).join(';')];
  for (const { sc, res, ref } of rows) {
    const d = res.totals.fiscalTotal.value !== null && ref.totals.fiscalTotal.value !== null ? res.totals.fiscalTotal.value - ref.totals.fiscalTotal.value : null;
    lines.push([
      res.name, sc.deathDate ? formatDate(sc.deathDate) : 'non simulé', res.ruleIds.join(' + '),
      numCsv(res.totals.fiscalToday), numCsv(res.totals.fiscalDeath), res.totals.fiscalDeath.status, numCsv(res.totals.fiscalTotal),
      numCsv(res.totals.fraisNonFiscaux), numCsv(res.totals.totalFraisCompris),
      res.cash.afterEvents === null ? '' : (res.cash.afterEvents / 100).toFixed(2).replace('.', ','),
      d === null ? '' : (d / 100).toFixed(2).replace('.', ','),
      String(res.pending.length),
    ].map((x) => csvCell(String(x))).join(';'));
  }
  return '﻿' + lines.join('\r\n');
}

const KEY_LAST_EXPORT = 'sim-succession:derniere-sauvegarde';
const KEY_LAST_CHANGE = 'sim-succession:derniere-modification';

/** Horodatages (ms) de la dernière sauvegarde exportée et de la dernière modification. */
export function backupStatus(): { lastExport: number | null; lastChange: number | null } {
  try {
    const s = ls();
    const n = (k: string) => { const v = Number(s?.getItem(k)); return Number.isFinite(v) && v > 0 ? v : null; };
    return { lastExport: n(KEY_LAST_EXPORT), lastChange: n(KEY_LAST_CHANGE) };
  } catch { return { lastExport: null, lastChange: null }; }
}
export function markChanged(now = Date.now()) { try { if (storageEnabled()) ls()?.setItem(KEY_LAST_CHANGE, String(now)); } catch { /* ignore */ } }
export function markExported(now = Date.now()) { try { if (storageEnabled()) ls()?.setItem(KEY_LAST_EXPORT, String(now)); } catch { /* ignore */ } }

/** Rappel : modifications postérieures à la dernière sauvegarde (ou aucune sauvegarde). */
export function needsBackup(st: { lastExport: number | null; lastChange: number | null }): boolean {
  return st.lastChange !== null && (st.lastExport === null || st.lastChange > st.lastExport);
}

/**
 * Sur iPhone : feuille de partage (« Enregistrer dans Fichiers », iCloud Drive…).
 * Ailleurs : téléchargement local. Aucun envoi réseau dans les deux cas.
 */
export async function shareOrDownload(filename: string, content: string, mime: string): Promise<'partage' | 'telechargement' | 'annule'> {
  try {
    const file = new File([content], filename, { type: mime });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return 'partage';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'annule';
  }
  download(filename, content, mime);
  return 'telechargement';
}

/** Lecture d'un fichier/Blob local (FileReader : compatible anciens navigateurs). */
export function readBlobText(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsText(b, 'utf-8');
  });
}

/** Téléchargement local (Blob) : aucun transfert réseau. */
export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
