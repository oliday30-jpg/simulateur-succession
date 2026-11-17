import type { HolderId, Lot, QuartResolution, House } from '../model/types';
import { add, cmp, eq, isZero, ONE, sub, sum, ZERO, type Frac } from '../util/fraction';

export const HOLDER_LABEL: Record<HolderId, string> = {
  pere: 'Père',
  fils: 'Fils survivant',
  beneficiaire: 'Bénéficiaire du quart (sous réserve)',
  petitFils: 'Petit-fils',
  quart: 'Titulaire du quart du fils prédécédé (à déterminer)',
};

export interface LotIssue { lotId?: string; message: string }

/** Contrôle : chaque lot est soit PP, soit NP+US ; fractions > 0 ; total exactement 100 %. */
export function validateLots(lots: Lot[]): LotIssue[] {
  const issues: LotIssue[] = [];
  const ids = new Set<string>();
  for (const l of lots) {
    if (ids.has(l.id)) issues.push({ lotId: l.id, message: `Identifiant de lot dupliqué : ${l.id}` });
    ids.add(l.id);
    if (l.share.n <= 0) issues.push({ lotId: l.id, message: `Le lot ${l.id} doit avoir une quote-part positive` });
    const isPP = !!l.pp;
    const isDem = !!l.np || !!l.us;
    if (isPP && isDem) issues.push({ lotId: l.id, message: `Le lot ${l.id} mélange pleine propriété et démembrement (chevauchement)` });
    if (!isPP && !(l.np && l.us)) issues.push({ lotId: l.id, message: `Le lot ${l.id} doit avoir un plein propriétaire, ou un nu-propriétaire ET un usufruitier` });
  }
  const total = sum(lots.map((l) => l.share));
  if (!eq(total, ONE)) issues.push({ message: `Le total des lots vaut ${total.n}/${total.d} au lieu de 100 % (ni chevauchement ni lacune admis)` });
  return issues;
}

/** Résout le titulaire « quart » selon l'état du dossier de la succession du fils prédécédé. */
export function resolveHolder(h: HolderId, house: Pick<House, 'quartResolution' | 'quartPersonnalise'>): HolderId {
  if (h !== 'quart') return h;
  if (house.quartResolution === 'beneficiaire_conserve') return 'beneficiaire';
  if (house.quartResolution === 'personnalise') return house.quartPersonnalise.holder;
  return 'quart';
}

export function resolveLots(lots: Lot[], house: Pick<House, 'quartResolution' | 'quartPersonnalise'>): Lot[] {
  return lots.map((l) => ({
    ...l,
    pp: l.pp && resolveHolder(l.pp, house),
    np: l.np && resolveHolder(l.np, house),
    us: l.us && resolveHolder(l.us, house),
  }));
}

export const quartLabel = (r: QuartResolution) =>
  r === 'inconnu' ? 'inconnu (succession du fils prédécédé ouverte)' : r === 'beneficiaire_conserve' ? 'recueilli et conservé par la bénéficiaire (hypothèse)' : 'répartition personnalisée validée par le notaire';

export interface HolderSummary { holder: HolderId; pp: Frac; np: Frac; us: Frac }

/** Résumé par titulaire. Attention : pp + np + us ne s'additionnent PAS en valeur (NP et US portent sur la même quote-part). */
export function summarize(lots: Lot[]): HolderSummary[] {
  const map = new Map<HolderId, HolderSummary>();
  const get = (h: HolderId) => {
    if (!map.has(h)) map.set(h, { holder: h, pp: ZERO, np: ZERO, us: ZERO });
    return map.get(h)!;
  };
  for (const l of lots) {
    if (l.pp) get(l.pp).pp = add(get(l.pp).pp, l.share);
    if (l.np) get(l.np).np = add(get(l.np).np, l.share);
    if (l.us) get(l.us).us = add(get(l.us).us, l.share);
  }
  return [...map.values()];
}

export const ppOf = (lots: Lot[], h: HolderId) => sum(lots.filter((l) => l.pp === h).map((l) => l.share));

/**
 * Donation d'une fraction de la maison prélevée sur la PLEINE PROPRIÉTÉ du donateur.
 * Avec réserve d'usufruit : le lot donné devient NP donataire / US donateur. L'usufruit réservé
 * ne porte que sur le lot donné.
 */
export function applyDonation(lots: Lot[], donor: HolderId, donee: HolderId, fraction: Frac, reserveUsufruit: boolean, tag: string): { lots: Lot[]; error?: string } {
  const available = ppOf(lots, donor);
  if (fraction.n <= 0) return { lots, error: 'La fraction donnée doit être positive' };
  if (cmp(fraction, available) > 0)
    return { lots, error: `Le donateur ne détient que ${available.n}/${available.d} en pleine propriété ; impossible de donner ${fraction.n}/${fraction.d}` };
  let remaining = fraction;
  const out: Lot[] = [];
  for (const l of lots) {
    if (l.pp !== donor || isZero(remaining)) { out.push(l); continue; }
    const take = cmp(l.share, remaining) <= 0 ? l.share : remaining;
    remaining = sub(remaining, take);
    const kept = sub(l.share, take);
    if (!isZero(kept)) out.push({ ...l, share: kept });
    out.push(reserveUsufruit
      ? { id: `${l.id}-${tag}`, share: take, np: donee, us: donor, origine: `Donation ${tag} (réserve d’usufruit)` }
      : { id: `${l.id}-${tag}`, share: take, pp: donee, origine: `Donation ${tag}` });
  }
  return { lots: out };
}

/**
 * Décès de `deceased` : l'usufruit s'éteint (le nu-propriétaire devient plein propriétaire ;
 * aucun droit de succession sur cette extinction), et ses lots en PP sont transmis à `heir`.
 * Renvoie aussi la fraction en PP qui entre réellement dans la masse successorale.
 */
export function applyDeath(lots: Lot[], deceased: HolderId, heir: HolderId): { lots: Lot[]; inheritedPP: Frac; extinguished: Frac } {
  let inheritedPP = ZERO;
  let extinguished = ZERO;
  const out = lots.map((l): Lot => {
    if (l.us === deceased && l.np) { extinguished = add(extinguished, l.share); return { id: l.id, share: l.share, pp: l.np, origine: `${l.origine} → extinction de l’usufruit` }; }
    if (l.pp === deceased) { inheritedPP = add(inheritedPP, l.share); return { ...l, pp: heir, origine: `${l.origine} → succession` }; }
    return l;
  });
  return { lots: mergeLots(out), inheritedPP, extinguished };
}

/** Cession d'un lot (ou de la part d'un titulaire sur ce lot) — seulement si confirmée. */
export function applyCession(lots: Lot[], lotId: string, from: HolderId, to: HolderId): { lots: Lot[]; error?: string } {
  const lot = lots.find((l) => l.id === lotId);
  if (!lot) return { lots, error: `Lot ${lotId} introuvable` };
  if (lot.pp !== from && lot.np !== from && lot.us !== from) return { lots, error: `Le cédant ne détient aucun droit sur le lot ${lotId}` };
  return {
    lots: lots.map((l) => l.id !== lotId ? l : {
      ...l,
      pp: l.pp === from ? to : l.pp,
      np: l.np === from ? to : l.np,
      us: l.us === from ? to : l.us,
      origine: `${l.origine} → cession`,
    }),
  };
}

/** Fusionne les lots PP d'un même titulaire pour l'affichage. */
export function mergeLots(lots: Lot[]): Lot[] {
  const out: Lot[] = [];
  for (const l of lots) {
    const same = out.find((o) => o.pp && o.pp === l.pp && !o.np && !l.np);
    if (same) { same.share = add(same.share, l.share); same.origine = `${same.origine} + ${l.origine}`; }
    else out.push({ ...l });
  }
  return out;
}

