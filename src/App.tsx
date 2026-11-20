import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import type { AppState, Situation } from './model/types';
import { defaultState } from './model/sample';
import { simulate, alignedReference, type SimResult } from './engine/simulate';
import { backupStatus, buildExport, clearStorage, EXPORT_WARNING, loadNames, markChanged, markExported, needsBackup, shareOrDownload, loadState, parseImport, readBlobText, saveNames, saveState, setStorageEnabled, storageEnabled, type Names } from './persistence/io';
import { NamesContext } from './ui/display';
import { SituationTab } from './ui/SituationTab';
import { ScenariosTab } from './ui/ScenariosTab';
import { ComparisonTab, type Row } from './ui/ComparisonTab';
import { DetailTab } from './ui/DetailTab';
import { NotaireTab } from './ui/NotaireTab';
import { RapportTab } from './ui/RapportTab';
import { SuccFilsPredecedeTab } from './ui/SuccFilsPredecedeTab';
import { BilanTab } from './ui/BilanTab';
import { renameText } from './ui/naming';
import { CheckField } from './ui/fields';

const TABS = [
  { id: 'situation', label: 'Situation et sources' },
  { id: 'succFilsPredecede', label: 'Succession du fils prédécédé' },
  { id: 'bilan', label: 'Point de situation (PDF)' },
  { id: 'rapport', label: 'Rapport simple' },
  { id: 'scenarios', label: 'Scénarios' },
  { id: 'comparaison', label: 'Comparaison' },
  { id: 'detail', label: 'Détail fiscal' },
  { id: 'notaire', label: 'Questions pour le notaire' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function App({ initial }: { initial?: AppState } = {}) {
  const [state, setState] = useState<AppState>(() => initial ?? loadState() ?? defaultState());
  const [names, setNames] = useState<Names>(() => (initial ? {} : loadNames()));
  const [tab, setTab] = useState<TabId>('situation');
  const [persist, setPersist] = useState<boolean>(() => !initial && storageEnabled());
  const [printNames, setPrintNames] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [exportNames, setExportNames] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [backup, setBackup] = useState(() => backupStatus());
  const fileRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => { if (persist) saveState(state); }, [state, persist]);
  useEffect(() => { if (persist) saveNames(names); }, [names, persist]);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  const touched = () => { if (persist) { markChanged(); setBackup(backupStatus()); } };
  const update = (fn: (s: AppState) => void) => { setState((prev) => { const next = structuredClone(prev); fn(next); return next; }); touched(); };
  const updateSituation = (fn: (s: Situation) => void) => update((s) => fn(s.situation));

  const results = useMemo(() => {
    const m = new Map<string, SimResult>();
    for (const sc of state.scenarios) m.set(sc.id, simulate(state.situation, sc));
    return m;
  }, [state]);
  const allRows: Row[] = useMemo(() => state.scenarios.map((sc) => ({ sc, res: results.get(sc.id)!, ref: simulate(state.situation, alignedReference(sc)) })), [state, results]);
  const rows = allRows.filter((r) => state.selectedIds.includes(r.sc.id));

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const n = TABS.length;
    let j = -1;
    if (e.key === 'ArrowRight') j = (i + 1) % n;
    if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = n - 1;
    if (j >= 0) { e.preventDefault(); setTab(TABS[j].id); tabRefs.current[j]?.focus(); }
  };

  const doExport = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const how = await shareOrDownload(`simulation-${today}.json`, JSON.stringify(buildExport(state, today, exportNames ? names : undefined), null, 2), 'application/json');
    if (how === 'annule') return;
    if (persist) { markExported(); setBackup(backupStatus()); }
    setMsg(how === 'partage' ? 'Sauvegarde transmise (choisissez « Enregistrer dans Fichiers » → iCloud Drive).' : 'Sauvegarde téléchargée.');
  };
  const doImport = async (f: File) => {
    const text = await readBlobText(f);
    const r = parseImport(text);
    if (!r.ok) { setMsg(`Import refusé : ${r.error}`); return; }
    setState(r.state);
    if (r.names) setNames(r.names);
    if (persist) { markExported(); setBackup(backupStatus()); }
    setMsg(`Import réussi${r.note ? ` — ${r.note}` : ''} : ${r.state.scenarios.length} variante(s).`);
  };

  return (
    <NamesContext.Provider value={{ names, show: !printing || printNames }}>
      <header className="app-header no-print-bg">
        <h1>Simulateur familial — succession et donations (Wallonie)</h1>
        <p className="disclaimer"><strong>Outil local d’aide à la discussion.</strong> Aucune donnée ne quitte cet appareil. Les résultats sont indicatifs, ne constituent ni un avis juridique ni un devis, et doivent être validés par le notaire.</p>
      </header>
      <nav className="tabs no-print" role="tablist" aria-label="Sections">
        {TABS.map((t, i) => (
          <button key={t.id} ref={(el) => { tabRefs.current[i] = el; }} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}>{renameText(t.label, names)}</button>
        ))}
      </nav>
      <main id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>
        {persist && needsBackup(backup) && (
          <p className="backup-hint no-print" role="status">
            <span aria-hidden="true">💾</span> Modifications non sauvegardées{backup.lastExport ? ` depuis le ${new Date(backup.lastExport).toLocaleDateString('fr-BE')}` : ''}.{' '}
            <button type="button" className="link" onClick={() => void doExport()}>Sauvegarder maintenant</button>
          </p>
        )}
        {msg && <p className="banner" role="status">{msg} <button type="button" className="link" onClick={() => setMsg(null)}>Fermer</button></p>}
        {tab === 'situation' && <SituationTab s={state.situation} update={updateSituation} names={names} setName={(id, n) => { setNames((p) => ({ ...p, [id]: n })); touched(); }} />}
        {tab === 'succFilsPredecede' && <SuccFilsPredecedeTab s={state.situation} update={updateSituation} />}
        {tab === 'bilan' && <BilanTab state={state} />}
        {tab === 'rapport' &&<RapportTab state={state} />}
        {tab === 'scenarios' && <ScenariosTab state={state} update={update} results={results} />}
        {tab === 'comparaison' && <ComparisonTab state={state} rows={rows} />}
        {tab === 'detail' && <DetailTab rows={rows} allRows={allRows} />}
        {tab === 'notaire' && <NotaireTab state={state} rows={rows} showNames={printNames} setShowNames={setPrintNames} />}
      </main>
      <footer className="card no-print" aria-labelledby="h-data">
        <h2 id="h-data">Données et confidentialité</h2>
        <CheckField label="Mémoriser dans ce navigateur (stockage local)" checked={persist} onChange={(v) => { setPersist(v); setStorageEnabled(v); setMsg(v ? 'Mémorisation activée.' : 'Mémorisation désactivée et stockage local effacé.'); }} hint="Désactiver efface immédiatement les données mémorisées." />
        <div className="row">
          <button type="button" onClick={() => { clearStorage(); setMsg('Stockage local effacé (la page en cours reste affichée).'); }}>Effacer le stockage local</button>
          <button type="button" onClick={() => { if (confirm('Revenir au cas d’exemple anonyme ? Les variantes actuelles seront remplacées.')) { setState(defaultState()); setMsg('Cas d’exemple rechargé.'); } }}>Recharger l’exemple</button>
        </div>
        <div className="row">
          <CheckField label="Inclure les noms affichés dans l’export" checked={exportNames} onChange={setExportNames} />
          <button type="button" onClick={() => void doExport()}>Exporter (JSON versionné)</button>
          <button type="button" onClick={() => fileRef.current?.click()}>Importer un JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" aria-label="Fichier JSON à importer" data-testid="import-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
        </div>
        <p className="small">⚠ {EXPORT_WARNING}</p>
        <p className="muted small">Dernière sauvegarde : {backup.lastExport ? new Date(backup.lastExport).toLocaleString('fr-BE') : 'aucune'}. Sur iPhone, enregistrez-la dans iCloud Drive pour pouvoir la réimporter sur un autre appareil.</p>
        <p className="muted small">Pas de télémétrie, pas de script externe, pas de réseau. Les exports contiennent les montants : conservez-les en lieu sûr.</p>
      </footer>
    </NamesContext.Provider>
  );
}
