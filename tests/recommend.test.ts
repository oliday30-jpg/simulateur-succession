import { describe, expect, it } from 'vitest';
import { defaultState, TEMPLATES } from '../src/model/sample';
import { simulate, alignedReference } from '../src/engine/simulate';
import { recommend } from '../src/engine/recommend';
import { euros } from '../src/util/money';
import type { Scenario } from '../src/model/types';

const st = defaultState();
const row = (sc: Scenario, s = st.situation) => ({ sc, res: simulate(s, sc), ref: simulate(s, alignedReference(sc)) });
const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!.build();

describe('Piste à étudier en priorité (classement prudent)', () => {
  it('dons enregistrés : économies exactes, la plus grande économie certaine passe devant', () => {
    // Repères (comparaison) : don 10 000 € enregistré → 330 € payés, droits au décès −2 479,20 € → économie 2 149,20 €.
    // Don 20 000 € : 660 € payés, économie 2 × 2 149,20 = 4 298,40 € (mêmes tranches à 24 %… 25 %).
    const r = recommend([row(tpl('don10k_enr')), row(tpl('don20k_enr')), row(tpl('reference'))]);
    expect(r.ranked.map((c) => c.sc.templateId)).toEqual(['don20k_enr', 'don10k_enr']); // la référence n'est pas candidate
    expect(r.ranked[1].saveMin).toBe(214920);
    expect(r.ranked[0].saveMin).toBe(429840);
    expect(r.piste?.sc.templateId).toBe('don20k_enr');
    expect(r.economieCertaine).toBe(true);
    expect(r.robuste).toBe(true);
  });

  it('fourchette : on classe sur l’économie MINIMALE, et la robustesse est refusée si les fourchettes se chevauchent', () => {
    // Donation de la moitié : économie entre 4 625 € et 23 450 € (repère comparaison), frais d'acte non renseignés.
    // Don 20 000 € enregistré : 4 298,40 € certains → la donation passe devant (4 625 > 4 298,40)…
    const r = recommend([row(tpl('donation_immo')), row(tpl('don20k_enr'))]);
    expect(r.piste?.sc.templateId).toBe('donation_immo');
    expect([r.piste!.saveMin, r.piste!.saveMax]).toEqual([462500, 2345000]);
    expect(r.piste!.fraisConnus).toBe(false);
    expect(r.piste!.cautions.join(' ')).toMatch(/devis/);
    // …et reste devant quelle que soit l'hypothèse puisque 4 625 ≥ 4 298,40.
    expect(r.robuste).toBe(true);
  });

  it('des frais d’acte connus réduisent l’économie et peuvent inverser le classement', () => {
    const immo = tpl('donation_immo');
    const ev = immo.events.find((e) => e.type === 'donation_immobiliere')!;
    if (ev.type === 'donation_immobiliere') ev.fraisActe.cents = euros(2000);
    // 4 625 − 2 000 = 2 625 € minimum < 4 298,40 € du don de 20 000 € ; maximum 23 450 − 2 000 = 21 450 €.
    const r = recommend([row(immo), row(tpl('don20k_enr'))]);
    const c = r.ranked.find((x) => x.sc.templateId === 'donation_immo')!;
    expect([c.saveMin, c.saveMax]).toEqual([262500, 2145000]);
    expect(r.piste?.sc.templateId).toBe('don20k_enr');
    expect(r.robuste).toBe(false); // la donation pourrait économiser davantage
  });

  it('don non enregistré décédé dans les 5 ans : aucune économie, jamais proposé', () => {
    const r = recommend([row(tpl('don10k_nenr'))]);
    expect(r.ranked[0].saveMax).toBe(0);
    expect(r.piste).toBeNull();
  });

  it('une variante qui entame la réserve minimale du père est écartée, avec la raison', () => {
    const s2 = structuredClone(st.situation);
    s2.budget.reserveMinimale.cents = euros(165000); // trésorerie après don de 20 000 € enregistré : 149 340 € < 165 000 €
    const r = recommend([row(tpl('don20k_enr'), s2), row(tpl('don10k_enr'), s2)]);
    expect(r.ranked[0].blockers.join(' ')).toMatch(/réserve minimale/);
    expect(r.meilleureEcartee?.sc.templateId).toBe('don20k_enr');
  });

  it('décès après 2027 en mode automatique : non classé, raison explicite', () => {
    const r = recommend([row({ ...tpl('don10k_enr'), deathDate: '2028-06-01' })]);
    expect(r.ranked).toHaveLength(0);
    expect(r.unranked[0].reason).toMatch(/après 2027/);
  });

  it('legs au petit-fils : signalé comme changement de bénéficiaire', () => {
    const r = recommend([row(tpl('legs25k'))]);
    expect(r.ranked[0].cautions.join(' ')).toMatch(/petit-fils au lieu du fils/);
  });
});
