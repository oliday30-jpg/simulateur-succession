/**
 * Aide des cases importantes (bouton « ? » à côté du libellé).
 * Chaque entrée répond aux mêmes questions : quoi mettre, où trouver l'information,
 * un exemple, ce qui se passe si la case reste vide, et quand la marquer comme vérifiée.
 * Les rôles (« le père », « le fils »…) sont remplacés par les prénoms à l'affichage.
 * Textes indicatifs : ils ne remplacent pas l'avis du notaire.
 */
export interface HelpEntry {
  /** Ce que la case doit contenir. */
  quoi: string;
  /** Où trouver l'information (document, interlocuteur). */
  ou: string;
  /** Exemple de saisie (facultatif). */
  exemple?: string;
  /** Conséquence d'une case vide (non renseigné ≠ 0). */
  siVide: string;
  /** Quand la marquer « vérifié » ou ce qui reste incertain (facultatif). */
  certitude?: string;
  /** Intitulés propres (aide d'un tableau plutôt que d'une case). */
  titres?: { quoi?: string; ou?: string; siVide?: string };
}

const VIDE_BLOQUE = 'Les résultats qui en dépendent sont bloqués (« ⛔ Bloquant ») : une case vide n’est jamais comptée comme 0.';
const VIDE_FOURCHETTE = 'Le calcul continue avec une fourchette ou une hypothèse prudente, signalée « à confirmer ».';

export const HELP = {
  valeurMaison: {
    quoi: 'La valeur vénale de toute la maison (100 %), c’est-à-dire le prix qu’un acheteur paierait aujourd’hui, pas seulement la part du père.',
    ou: 'Estimation écrite d’un notaire ou d’un agent immobilier ; à défaut, prix de vente de maisons comparables du quartier. Le revenu cadastral n’est pas une valeur vénale.',
    exemple: '300 000',
    siVide: 'Si c’est la valeur choisie « par défaut » : ' + VIDE_BLOQUE,
    certitude: 'Marquer « ✓ Vérifié » seulement avec une estimation écrite. Une valeur trop basse dans une déclaration ou un acte peut entraîner une amende : la valeur doit être réaliste.',
  },
  valeurDecesFilsPredecede: {
    quoi: 'La valeur de toute la maison du père (le bien entier, pas seulement la part du fils prédécédé), estimée au jour du décès du fils prédécédé (07/10/2026). Elle sert à chiffrer la part du fils prédécédé dans sa succession ; c’est une valeur distincte de celle retenue pour la donation, la vente ou le décès du père.',
    ou: 'Le notaire chargé de la succession du fils prédécédé la fixe ou la demande pour la déclaration de succession.',
    siVide: 'La valeur utilisée par défaut sert à sa place, avec une mention « à confirmer ».',
  },
  sourceValeur: {
    quoi: 'Laquelle des valeurs saisies au-dessus est utilisée pour la donation, la vente et le décès simulés.',
    ou: 'Choix personnel : prendre l’expertise dès qu’elle existe.',
    siVide: 'Toujours rempli. La case choisie devient indispensable (jaune si vide).',
  },
  repartition: {
    quoi: 'Qui possède quoi dans la maison aujourd’hui : pleine propriété (PP), ou nue-propriété (NP) d’un côté et usufruit (US) de l’autre.',
    ou: 'Acte de notoriété de 2005 (succession de la mère), contrat de mariage (séparation de biens) et MyMinfin → « Mes biens immobiliers » (cadastre : reprend la déclaration enregistrée, sans valeur de titre). Demander au notaire de confirmer les fractions.',
    exemple: 'Acte 2005 : père 2/3 en PP + usufruit sur 1/3 ; fils survivant 1/6 en NP ; part du fils prédécédé 1/6 en NP.',
    siVide: 'Si les lots ne font pas 100 % ou se chevauchent : ' + VIDE_BLOQUE,
    certitude: 'Une fois l’acte relu par le notaire, le préréglage peut être considéré comme confirmé.',
  },
  quartResolution: {
    quoi: 'Ce que devient la part (nue-propriété) du fils prédécédé : gardée par sa bénéficiaire si elle accepte, ou revenant au père et au fils survivant si elle renonce.',
    ou: 'Notaire de la succession du fils prédécédé ; décision de la bénéficiaire (acceptation ou renonciation).',
    siVide: '« Inconnu » : cette part reste au nom de la succession ouverte ; les deux options sont chiffrées dans cet onglet pour comparaison.',
  },
  logementEligibilite: {
    quoi: 'Si la part de la maison recueillie au décès du père peut bénéficier du taux réduit « logement familial ».',
    ou: 'Question à poser au notaire : conditions d’occupation au décès et situation de chaque héritier.',
    siVide: '« Inconnu » : le calcul donne une fourchette (avec et sans taux réduit).',
    certitude: 'Habiter la maison depuis longtemps ne suffit pas : seul le notaire peut confirmer.',
  },
  bilanMode: {
    quoi: 'La façon de saisir l’argent du père. A : on part des soldes actuels et le simulateur applique les dons, dépenses et recettes. B : on saisit directement le solde prévu au décès.',
    ou: 'Choix personnel. A est plus simple quand on connaît les extraits de compte d’aujourd’hui.',
    siVide: 'Toujours rempli. En mode B, le solde au décès devient indispensable.',
  },
  soldeB: {
    quoi: 'L’argent du père au jour du décès simulé, après tous les dons et flux de la variante.',
    ou: 'Estimation personnelle ou de la banque à partir de l’épargne et du budget mensuel.',
    siVide: VIDE_BLOQUE,
  },
  posteAvoir: {
    quoi: 'Le solde de ce compte ou la valeur de ces placements, à une même date pour tous les postes.',
    ou: 'Dernier extrait de compte ou relevé de portefeuille ; l’application de la banque ; le relevé annuel au 31/12.',
    exemple: '170 000,50 (virgule pour les cents ; les espaces sont acceptés)',
    siVide: VIDE_BLOQUE,
    certitude: '« ✓ Vérifié » avec un extrait daté ; noter la date dans « Provenance ».',
  },
  posteCharge: {
    quoi: 'Le montant de la dette ou des frais (funérailles, autres frais réels) à déduire.',
    ou: 'Contrat de prêt, facture ou devis des pompes funèbres.',
    siVide: 'Le poste est ignoré dans le calcul, avec un avertissement.',
  },
  fiabilite: {
    quoi: 'Le degré de confiance dans le montant : approximatif, saisi à la main, ou vérifié sur un document.',
    ou: 'Choisir « ✓ Vérifié » seulement si un document daté le prouve.',
    siVide: 'Toujours rempli (« ≈ Approximatif » par défaut).',
  },
  creanceNominal: {
    quoi: 'Le montant prêté par le père au fils prédécédé, avant remboursements.',
    ou: 'Virements bancaires, reconnaissance de dette ; le notaire de la succession du fils prédécédé.',
    exemple: '15 000',
    siVide: 'Si la créance est prise au « solde nominal » : ' + VIDE_BLOQUE,
  },
  creanceRecouvre: {
    quoi: 'Ce que le père récupérera réellement sur cette créance (souvent moins que le nominal si la succession est modeste).',
    ou: 'Notaire de la succession du fils prédécédé (état de l’actif et du passif).',
    siVide: 'Si la créance est prise au « montant recouvré » : ' + VIDE_BLOQUE,
  },
  creanceInclusion: {
    quoi: 'Si la créance est comptée dans le patrimoine du père, et comment.',
    ou: 'Par défaut « Exclue » : prudent tant que le notaire n’a pas confirmé ce qui sera récupéré.',
    siVide: 'Toujours rempli.',
  },
  budgetMensuel: {
    quoi: 'Les rentrées et dépenses mensuelles du père, pour savoir combien de temps sa réserve tient sans rendement.',
    ou: 'Extraits de compte des 12 derniers mois (moyenne), attestation de pension, factures de la maison de repos ou des soins.',
    siVide: 'La durée de la réserve n’est pas calculée ; le reste des résultats n’est pas touché.',
  },
  reserveMinimale: {
    quoi: 'La somme que le père veut toujours garder pour lui, quoi qu’il arrive (imprévus, soins, maison de repos).',
    ou: 'Décision du père ; la banque peut aider à estimer un coussin de sécurité.',
    exemple: '50 000',
    siVide: 'Aucun seuil n’est vérifié : la « piste à étudier » ne peut pas écarter les options qui entament la réserve.',
  },
  deathDate: {
    quoi: 'Une date de décès imaginaire du père, pour voir ce que coûterait la succession à ce moment-là. Ce n’est pas une prévision.',
    ou: 'Choix libre : tester plusieurs dates (avant et après 3 ou 5 ans après un don, avant et après le 01/01/2028).',
    exemple: '30/11/2027',
    siVide: 'Aucun calcul de succession : ' + VIDE_BLOQUE,
  },
  rulesMode: {
    quoi: 'Les règles fiscales utilisées pour le décès simulé.',
    ou: '« Automatique » suit les règles en vigueur à la date. Pour un décès après 2027, les règles futures ne sont pas certaines : choisir un profil explicite pour comparer.',
    siVide: 'Toujours rempli. En « manuel », les droits de succession deviennent indispensables.',
  },
  manualDeathTax: {
    quoi: 'Le montant des droits de succession calculé par le notaire pour cet héritier.',
    ou: 'Simulation écrite du notaire.',
    siVide: VIDE_BLOQUE,
  },
  reserveProgressivite: {
    quoi: 'Comment les biens donnés auparavant (donation de la maison) sont ajoutés pour fixer le taux des droits au décès.',
    ou: 'Question pour le notaire : la règle exacte n’a pas été trouvée dans les sources consultées.',
    siVide: VIDE_FOURCHETTE,
  },
  donMontant: {
    quoi: 'La somme d’argent donnée en une fois (virement).',
    ou: 'Décision du père ; vérifier avec la « réserve minimale » qu’il lui reste assez.',
    exemple: '20 000',
    siVide: VIDE_BLOQUE,
  },
  donStatut: {
    quoi: 'Si le don est enregistré (droit de donation payé maintenant, le don n’est plus rappelé au décès) ou non enregistré (pas de droit maintenant, mais rappel au décès dans les 5 ans, 3 ans pour les dons faits avant le 01/01/2022).',
    ou: 'Notaire (acte de don ou pacte adjoint) ; la banque pour la trace du virement (communication « don », date).',
    siVide: 'Toujours rempli.',
    certitude: 'Garder la preuve de la date du virement : elle fait démarrer le délai.',
  },
  fractionDonnee: {
    quoi: 'La part de toute la maison que le père donne, au plus ce qu’il possède en pleine propriété.',
    ou: 'Décision du père avec le notaire.',
    exemple: '1/2 ou 50 %',
    siVide: VIDE_BLOQUE,
  },
  reserveUsufruit: {
    quoi: 'Si le père garde l’usufruit de la part donnée : il continue d’habiter la maison (ou d’en percevoir le loyer) jusqu’à son décès.',
    ou: 'Clause de l’acte de donation, à décider avec le notaire.',
    siVide: 'Case à cocher (non cochée = donation en pleine propriété).',
  },
  valeurActe: {
    quoi: 'La valeur de toute la maison à la date de l’acte de donation ou de vente, si elle diffère de la valeur par défaut.',
    ou: 'Estimation retenue par le notaire pour l’acte.',
    siVide: 'La valeur utilisée par défaut (onglet Situation) est reprise.',
  },
  fraisActe: {
    quoi: 'Les frais de l’acte : honoraires, frais administratifs et TVA, hors droits de donation.',
    ou: 'Devis écrit du notaire.',
    siVide: 'Les frais sont comptés « à confirmer » et le classement des options ne peut pas les déduire.',
  },
  prixVente: {
    quoi: 'Le prix de vente de toute la maison.',
    ou: 'Offre reçue, estimation d’agent immobilier ou du notaire.',
    siVide: 'La valeur par défaut est utilisée, avec une mention « à confirmer ».',
  },
  coefUsufruit: {
    quoi: 'La part du prix qui revient à l’usufruitier (le père) pour les lots démembrés, convenue entre tous les titulaires.',
    ou: 'Accord écrit entre les titulaires, proposé par le notaire (dépend de l’âge de l’usufruitier).',
    exemple: '40 %',
    siVide: VIDE_BLOQUE,
  },
  fluxMontant: {
    quoi: 'Le montant de cette dépense ou recette ponctuelle (travaux, achat, rentrée d’argent).',
    ou: 'Devis, facture ou estimation.',
    siVide: VIDE_BLOQUE,
  },
  legsMontant: {
    quoi: 'La somme laissée par testament à ce légataire, payée au décès du père.',
    ou: 'Testament existant ou envisagé (à rédiger avec le notaire).',
    exemple: '20 000',
    siVide: 'Si le legs est actif : ' + VIDE_BLOQUE,
  },
  legsImputation: {
    quoi: 'Si le testament prévoit que les dons déjà reçus sont déduits du legs (pour éviter de donner deux fois).',
    ou: 'Clause du testament, à demander au notaire.',
    siVide: 'Toujours rempli. Sans clause confirmée, un risque de double versement est signalé.',
  },
  sfpTestament: {
    quoi: 'Si le fils prédécédé a laissé un testament, et en faveur de qui.',
    ou: 'Notaire de sa succession (recherche au registre central des testaments).',
    siVide: '« Inconnu » : les deux options sont chiffrées, sans certitude sur la bénéficiaire.',
  },
  sfpAutresBiens: {
    quoi: 'Ce que laisse le fils prédécédé en dehors de la maison de Gembloux (sa part de son propre logement, comptes, voiture…), moins ses dettes et frais, dont la dette envers le père. Y ajouter ce qu’il avait recueilli dans la succession de la mère hors maison : '
      + 'sa créance de restitution envers le père (quasi-usufruit sur les comptes et titres de la mère, environ 1/3 de ceux-ci, exigible au décès du père) '
      + 'et ses quotes-parts d’autres immeubles de la mère (souvent quelques centaines d’euros). Sans les assurances groupe / vie (case suivante). Montant négatif si les dettes dépassent ces biens.',
    ou: 'Notaire de sa succession ; extraits de ses comptes au jour du décès ; décompte du crédit (et de l’éventuelle assurance solde restant dû) ; déclaration enregistrée de la succession de la mère ; MyMinfin (cadastre) pour les immeubles.',
    exemple: '150 000 (moitié du logement) − 150 000 (dettes) + 10 000 (comptes) = 10 000 ; ou « -40 000 »',
    siVide: 'Le calcul suppose 0 € d’autres biens, avec une mention « à confirmer ».',
  },
  sfpAssurance: {
    quoi: 'Le capital décès des assurances groupe ou vie du fils prédécédé versé à la bénéficiaire désignée dans le contrat. Il ne fait pas partie de la succession : il ne sert pas à payer les dettes, et elle le garde même si elle renonce.',
    ou: 'Courrier de l’assureur ou de l’employeur (règlement du plan de pension) ; notaire de la succession.',
    exemple: '300 000',
    siVide: 'Non compté, avec un avertissement : si l’assurance existe, les droits de la bénéficiaire sont sous-estimés.',
    certitude: 'Préciser si le montant est brut ou net des retenues (INAMI, solidarité, impôt).',
  },
  sfpAssuranceTaxee: {
    quoi: 'Si ce capital est soumis aux droits de succession dans le chef de la bénéficiaire. Il s’ajoute alors à sa part et fait monter le taux appliqué à la maison.',
    ou: 'Question pour le notaire (art. 8 du Code des droits de succession, cas particulier des assurances groupe).',
    siVide: VIDE_FOURCHETTE,
  },
  sfpAssuranceFils: {
    quoi: 'Le capital d’une assurance groupe ou vie du fils prédécédé dont le fils survivant est le bénéficiaire désigné. Hors succession : les dettes ne s’y imputent pas. '
      + 'En principe taxé dans son chef au barème entre frères et sœurs (20 % à 65 %). Une fois versé, il peut le donner à qui il veut : le simulateur compare les façons de le transmettre.',
    ou: 'Courrier de l’assureur ou de l’employeur (règlement du plan de pension, clause bénéficiaire).',
    exemple: '20 000',
    siVide: 'Rien n’est compté et la comparaison « garder / transmettre » n’est pas affichée.',
    certitude: 'Préciser si le montant est brut ou net des retenues (INAMI, solidarité, impôt).',
  },
  sfpAssuranceFilsTaxee: {
    quoi: 'Si le capital d’assurance versé au fils survivant est soumis aux droits de succession dans son chef. Si oui, il paie le barème entre frères et sœurs (20 % jusqu’à 12 500 €, puis 25, 35, 50 et 65 %), sans exemption. '
      + 'Si la bénéficiaire renonce et qu’il hérite aussi des 3/4 de la succession, le capital s’ajoute à cette part et est taxé dans des tranches plus élevées.',
    ou: 'Question pour le notaire (art. 8 du Code des droits de succession, cas particulier des assurances groupe) ; l’assureur indique aussi les retenues faites avant le versement.',
    siVide: 'Toujours rempli. « À confirmer » : la fourchette couvre « taxé » et « non taxé » ; l’hypothèse prudente le compte comme taxé.',
  },
  sfpTransmission: {
    titres: { quoi: 'Ce que montre le tableau', ou: 'Comment le lire', siVide: 'Quand il n’apparaît pas' },
    quoi: 'Quatre façons de traiter le capital d’assurance du fils survivant : le garder, le donner à la bénéficiaire par simple virement, par une donation enregistrée (5,5 %), ou y renoncer pour qu’il aille directement à elle. '
      + '« Droits payés » : droits de succession du fils survivant sur ce capital, plus les droits de donation éventuels. « Reçu par la bénéficiaire » : ce qui lui arrive net. '
      + '« Hypothèse prudente » : les montants quand une règle n’est pas confirmée (capital compté comme taxé, base la plus haute).',
    ou: 'Une fourchette « entre … et … » signale une règle à confirmer. Le virement ne coûte rien tout de suite, mais la ligne « ⚠ Risque » chiffre les droits que la bénéficiaire paierait si le fils survivant décédait dans les cinq ans (barème entre non-parents, 30 % à 80 %). '
      + 'La renonciation n’est chiffrée que si la clause du contrat désigne ensuite la bénéficiaire ; elle doit intervenir avant d’accepter le capital. Les calculs suivent l’option de la bénéficiaire retenue dans « Part du fils prédécédé ». Montants indicatifs : à valider par le notaire avant toute démarche.',
    siVide: 'Le tableau n’apparaît que si le montant de l’assurance versée au fils survivant est saisi (plus de 0 €). La ligne « renonciation » reste non chiffrée tant que la clause bénéficiaire est inconnue.',
  },
  sfpAssuranceFilsSuivant: {
    quoi: 'Le bénéficiaire suivant prévu par le contrat si le fils survivant renonce au capital. Si c’est la bénéficiaire, renoncer peut éviter une double taxation ; si personne n’est prévu, le capital tombe dans la succession (et sert à payer les dettes).',
    ou: 'Clause bénéficiaire du contrat ou règlement du plan d’assurance groupe (à demander à l’assureur, par écrit).',
    siVide: '« Inconnu » : l’option « renonciation au bénéfice » n’est pas chiffrée.',
  },
  sfpBaseNP: {
    quoi: 'Sur quelle valeur se calculent les droits sur la nue-propriété héritée : la pleine propriété, ou la nue-propriété seule (avec un coefficient).',
    ou: 'Question pour le notaire.',
    siVide: VIDE_FOURCHETTE,
  },
  sfpCoefNP: {
    quoi: 'La valeur de la nue-propriété en pourcentage de la pleine propriété.',
    ou: 'Donné par le notaire (dépend de l’âge de l’usufruitier).',
    exemple: '60 %',
    siVide: VIDE_FOURCHETTE,
  },
  sfpDroitsNotaire: {
    quoi: 'Les droits de succession calculés par le notaire pour chaque option ; ils remplacent l’estimation du simulateur.',
    ou: 'Simulation ou déclaration de succession établie par le notaire.',
    siVide: 'L’estimation du simulateur est affichée.',
  },
} satisfies Record<string, HelpEntry>;

export type HelpKey = keyof typeof HELP;
