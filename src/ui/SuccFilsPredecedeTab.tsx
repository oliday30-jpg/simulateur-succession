import type { Situation } from '../model/types';
import { HOLDER_LABEL, quartLabel, resolveLots, summarize } from '../domain/rights';
import type { HolderId } from '../model/types';
import { SelectField, TextField, ValueField } from './fields';
import { T, useWho } from './display';
import { formatFrac } from '../util/fraction';
import { SuccFilsPredecedeCard } from './SuccFilsPredecedeCard';

type Upd = (fn: (s: Situation) => void) => void;
const HOLDERS: [HolderId, string][] = (Object.keys(HOLDER_LABEL) as HolderId[]).map((h) => [h, HOLDER_LABEL[h]]);

/**
 * Onglet séparé pour la succession du fils prédécédé (dossier ouvert, distinct de la situation du père) :
 * option de la bénéficiaire, valeur de la maison au décès, puis hypothèses, assurances, dettes et droits.
 */
export function SuccFilsPredecedeTab({ s, update }: { s: Situation; update: Upd }) {
  const who = useWho();
  return (
    <div className="stack">
      <section className="card" aria-labelledby="h-sfp-option">
        <h2 id="h-sfp-option"><T>Part du fils prédécédé dans la maison du père</T></h2>
        <p className="muted"><T>Ce dossier est distinct de la situation du père. L’option retenue ici modifie seulement qui détient la part du fils prédécédé (nue-propriété) dans les calculs des autres onglets.</T></p>
        <div className="grid">
          <SelectField label="Part du fils prédécédé (nue-propriété)" help="quartResolution" value={s.house.quartResolution} onChange={(v) => update((d) => { d.house.quartResolution = v; })}
            options={(['inconnu', 'beneficiaire_conserve', 'renonciation', 'personnalise'] as const).map((r) => [r, quartLabel(r)])}
            hint="Les droits des deux options sont estimés ci-dessous." />
          {s.house.quartResolution === 'personnalise' && (
            <>
              <SelectField label="Titulaire validé par le notaire" value={s.house.quartPersonnalise.holder} onChange={(v) => update((d) => { d.house.quartPersonnalise.holder = v; })} options={HOLDERS} />
              <TextField label="Fondement (cession, renonciation…)" value={s.house.quartPersonnalise.note} onChange={(v) => update((d) => { d.house.quartPersonnalise.note = v; })} />
            </>
          )}
          <ValueField label="Valeur de la maison du père au 07/10/2026 (décès du fils prédécédé)" help="valeurDecesFilsPredecede" value={s.house.valeurDecesFilsPredecede} onChange={(v) => update((d) => { d.house.valeurDecesFilsPredecede = v; })} hint="Champ distinct — dossier de succession ouvert" />
        </div>
        {s.house.quartResolution !== 'inconnu' && (
          <p className="small">Après l’option retenue : {summarize(resolveLots(s.house.lots, s.house)).map((h) => `${who(h.holder)} — ${[h.pp.n ? `PP ${formatFrac(h.pp)}` : '', h.np.n ? `NP ${formatFrac(h.np)}` : '', h.us.n ? `US ${formatFrac(h.us)}` : ''].filter(Boolean).join(', ')}`).join(' ; ')}</p>
        )}
      </section>

      <SuccFilsPredecedeCard s={s} update={update} />
    </div>
  );
}
