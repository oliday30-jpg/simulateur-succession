import { buildExport, comparisonCsv, parseImport } from '../src/persistence/io';
import { defaultState } from '../src/model/sample';
import { simulate, alignedReference } from '../src/engine/simulate';

describe('export / import JSON versionné', () => {
  it('aller-retour sans perte', () => {
    const st = defaultState();
    const json = JSON.stringify(buildExport(st, '2026-11-17'));
    const r = parseImport(json);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toEqual(st);
  });
  it('noms exclus par défaut, inclus sur demande', () => {
    const st = defaultState();
    expect(JSON.stringify(buildExport(st, '2026-11-17'))).not.toContain('"noms":');
    const r = parseImport(JSON.stringify(buildExport(st, '2026-11-17', { fils: 'X' })));
    expect(r.ok && r.names).toEqual({ fils: 'X' });
  });
  it('rejette un fichier non conforme, étranger ou d’une version future', () => {
    expect(parseImport('pas du json').ok).toBe(false);
    expect(parseImport('x'.repeat(2_000_001)).ok).toBe(false);
    expect(parseImport(JSON.stringify({ app: 'autre' })).ok).toBe(false);
    const st = buildExport(defaultState(), '2026-11-17');
    expect(parseImport(JSON.stringify({ ...st, schemaVersion: 99 })).ok).toBe(false);
    const broken = structuredClone(st) as unknown as { state: { situation: { house: { valeurHypothese: { cents: unknown } } } } };
    broken.state.situation.house.valeurHypothese.cents = 300000.5;
    const r = parseImport(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/valeurHypothese/);
  });
  it('migration v0 (euros décimaux) → v1 (centimes)', () => {
    const r = parseImport(JSON.stringify({ app: 'simulateur-succession-wallonie', houseValue: 275000, savings: 160000.5 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.situation.house.valeurHypothese.cents).toBe(27500000);
      expect(r.state.situation.postes[0].value.cents).toBe(16000050);
      expect(r.note).toMatch(/migré/);
    }
  });
});

describe('export CSV', () => {
  it('contient les montants et les statuts, séparateur « ; »', () => {
    const st = defaultState();
    const rows = st.scenarios.map((sc) => ({ sc, res: simulate(st.situation, sc), ref: simulate(st.situation, alignedReference(sc)) }));
    const csv = comparisonCsv(rows);
    expect(csv.split('\r\n')).toHaveLength(4);
    expect(csv).toContain('47675,00'); // référence par défaut (acte 2005), voir simulate.test.ts
    expect(csv).toContain('330,00');
    expect(csv).toContain('a_confirmer');
  });
});

describe('rappel de sauvegarde', () => {
  it('signale les modifications postérieures à la dernière sauvegarde', async () => {
    const { needsBackup } = await import('../src/persistence/io');
    expect(needsBackup({ lastExport: null, lastChange: null })).toBe(false);
    expect(needsBackup({ lastExport: null, lastChange: 10 })).toBe(true);
    expect(needsBackup({ lastExport: 20, lastChange: 10 })).toBe(false);
    expect(needsBackup({ lastExport: 20, lastChange: 30 })).toBe(true);
  });
});
