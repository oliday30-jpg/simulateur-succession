import { describe, expect, it } from 'vitest';
import { deNom, renameText, whoLabel } from '../src/ui/naming';

const N = { pere: 'Marcel', fils: 'Olivier', petitFils: 'Lucas', filsPredecede: 'Pierre', beneficiaire: 'Anne' };

describe('Prénoms à la place des rôles (affichage)', () => {
  it('sans prénom, le texte est inchangé', () => {
    expect(renameText('Trésorerie du père', {})).toBe('Trésorerie du père');
    expect(renameText('Trésorerie du père', { pere: '   ' })).toBe('Trésorerie du père');
  });
  it('élision et contractions françaises', () => {
    expect(deNom('Marcel')).toBe('de Marcel');
    expect(deNom('Olivier')).toBe('d’Olivier');
    expect(renameText('Trésorerie du père après événements', N)).toBe('Trésorerie de Marcel après événements');
    expect(renameText('Réserve d’usufruit au profit du père', N)).toBe('Réserve d’usufruit au profit de Marcel');
    expect(renameText('ce qui reste au père', N)).toBe('ce qui reste à Marcel');
    // « ce fils » ne doit pas donner « ce Olivier ».
    expect(renameText('la succession de ce fils', N)).not.toContain('ce ');
    expect(renameText('Net reçu — fils survivant', N)).toBe('Net reçu — Olivier');
    expect(renameText('droits du petit-fils', N)).toBe('droits de Lucas');
    expect(renameText('Pour le fils : droits', N)).toBe('Pour Olivier : droits');
  });
  it('libellés des titulaires (droits sur la maison)', () => {
    expect(renameText('2/3 (66,67 %) PP Père ; 1/6 (16,67 %) NP Fils survivant / US Père', N))
      .toBe('2/3 (66,67 %) PP Marcel ; 1/6 (16,67 %) NP Olivier / US Marcel');
    expect(renameText('NP Titulaire de la part du fils prédécédé (à déterminer)', N)).toBe('NP Titulaire de la part de Pierre (à déterminer)');
    expect(renameText('Bénéficiaire de la part du fils prédécédé (sous réserve)', N)).toBe('Anne');
  });
  it('« fils » ne touche ni « petit-fils » ni « fils prédécédé », et les mots proches restent intacts', () => {
    expect(renameText('Petit-fils, fils prédécédé, fils', { fils: 'Olivier' })).toBe('Petit-fils, fils prédécédé, Olivier');
    expect(renameText('repère, pères, filsx', N)).toBe('repère, pères, filsx');
    // Un pluriel ne devient jamais un seul prénom (bug « chaque Olivier »).
    expect(renameText('chaque fils 1/6 en NP ; les deux fils ; Les fils', N)).toBe('chaque fils 1/6 en NP ; les deux fils ; Les fils');
    expect(renameText('père 2/3 PP + usufruit sur 1/3 ; fils survivant 1/6 en NP ; fils prédécédé 1/6 en NP', N))
      .toBe('Marcel 2/3 PP + usufruit sur 1/3 ; Olivier 1/6 en NP ; Pierre 1/6 en NP');
  });
  it('whoLabel', () => {
    expect(whoLabel('pere', N)).toBe('Marcel');
    expect(whoLabel('pere', {})).toBe('Père');
    expect(whoLabel('quart', N)).toBe('Titulaire de la part de Pierre (à déterminer)');
    expect(whoLabel('succession', N)).toBe('Succession');
  });
  it('assurance du fils survivant : le lien « frère » reste lisible avec les prénoms', () => {
    // Attendu écrit à la main : « au fils survivant » → « à Olivier », « du fils prédécédé » → « de Pierre ».
    expect(renameText('Assurance groupe / vie versée au fils survivant (frère du fils prédécédé)', N))
      .toBe('Assurance groupe / vie versée à Olivier (frère de Pierre)');
    expect(renameText('Le fils survivant est l’autre enfant du père, frère du fils prédécédé (pas un enfant de celui-ci).', N))
      .toBe('Olivier est l’autre enfant de Marcel, frère de Pierre (pas un enfant de celui-ci).');
  });
});
