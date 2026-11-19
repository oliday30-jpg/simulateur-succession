# PLAN.md — Simulateur succession Wallonie

Règle : une tâche à la fois ; terminée + testée → proposer un commit → cocher avec une note → rappeler `/clear`.
Détails de la session de création : [docs/session-2026-11-17.md](docs/session-2026-11-17.md).

## Terminé

- [x] **Noyau** : situation de référence, don bancaire, donation immobilière, comparaison avant/après délai.
  _17/11/2026 — commit 86654c9. Repères 38 425 / 13 050 / 17 550 / 875 / 33 300 / 330 / 660 / 4 500 € reproduits._
- [x] **Vente, legs, budget, exports** : ventilation exacte (coefficient d'usufruit saisi, grille fictive sinon), legs + risque de double versement, budget/réserve, export/import JSON versionné (zod + migration v0), CSV, fiche notaire imprimable.
  _17/11/2026 — commit 86654c9._
- [x] **Interface 5 onglets**, accessible et responsive (vérifiée à 1280 px et 390 px, sans défilement horizontal).
  _17/11/2026 — correction du débordement dû au champ d'import masqué (`.sr-only`)._
- [x] **Tests** : 74 tests (unitaires + parcours interface), build OK, aucune URL chargée dans le bundle.
- [x] **PWA iPhone** : manifeste, icônes, hors connexion (service worker), export via la feuille de partage, rappel de sauvegarde, marges d'encoche.
  _17/11/2026 — hors connexion vérifié en servant le site depuis un sous-dossier puis en coupant le serveur._
- [x] **Git + GitHub Pages** : dépôt public `oliday30-jpg/simulateur-succession`, e-mail noreply local, branche `main`, push, Pages activé, déploiement réussi.
  _17/11/2026 — https://oliday30-jpg.github.io/simulateur-succession/_
- [x] **Répartition selon l'acte de notoriété de 2005** (succession de la mère) + sélecteur de préréglage
  (acte 2005 avec réduction = défaut ; donation de survie non réduite ; ancienne hypothèse 1/2 + 1/4 + 1/4 ; personnalisée).
  _17/11/2026 — commit 12b9597. 80 tests + build OK ; déploiement GitHub Pages vert. Référence 2027 : 47 675 € (contre 38 425 € avec l'ancienne hypothèse).
  Sur l'iPhone, les données déjà enregistrées gardent l'ancienne répartition : choisir le préréglage dans l'onglet Situation._
- [x] **Prénoms à la place des rôles** (« Père » → « Marcel », « du père » → « de Marcel », part du fils prédécédé → « Titulaire de la part de Pierre ») dans tous les onglets.
  Affichage seulement (`src/ui/naming.ts`) : moteur, CSV et exports restent anonymes ; impression sans prénoms sauf case cochée (onglet Notaire).
  _17/11/2026 — commit 89d735a. 86 tests + build OK. Poussé ; déploiement GitHub Pages vert._
- [x] **Piste à étudier en priorité** (onglet Comparaison) : classement prudent (économie minimale vs référence alignée, frais connus déduits)
  des variantes + modèles non créés ; écarte celles qui entament la réserve du père ou ont un point bloquant ; vigilances affichées.
  _17/11/2026 — commit ce9199a. 94 tests + build OK. Poussé ; déploiement vert._
- [x] **Onglet « Rapport simple »** (après Situation) : synthèse en langage courant pour un non-spécialiste — l'essentiel, qui possède quoi,
  si on ne fait rien, 3 meilleures options (explication, chiffres, vigilances), conseils « en bon père de famille », prochaines étapes, lexique. Imprimable.
  _17/11/2026 — commit ae0ec6f. 95 tests + build OK. Poussé ; déploiement GitHub Pages vert._
- [x] **T9 — Option successorale de la bénéficiaire** (succession du fils prédécédé) : option « renonciation » (père 1/4 → consolidation en PP, fils 3/4 en NP) ;
  bloc « Succession du fils prédécédé » (onglet Situation) : testament, descendants, résidence commune, autres biens nets, base de la NP (fourchette PP / coefficient),
  supplément d'exemption de la cohabitante ; droits estimés des deux options (cohabitante = barème ligne directe ; frère = barème frères et sœurs, source SPF lue le 18/11/2026 ;
  plancher art. 68 à confirmer), hypothèse prudente toujours chiffrée, montants du notaire prioritaires ; questions ajoutées à la fiche notaire.
  _18/11/2026 — commit « T9 ». 109 tests + build OK (vérifiés sur une copie isolée du travail en cours « donation sur mesure / cases indispensables », non inclus).
  Cas d'exemple : acceptation 1 250 … 1 750 € ; renonciation ≈ 10 000 €._
- [x] **Cases indispensables à l'estimation** (onglets Situation et Scénarios) : champs dont l'absence rend le moteur « bloquant »
  en jaune « ★ Indispensable — à remplir », en vert « ✓ Indispensable — renseigné » (texte + couleur) ; légende avec le nombre de cases restantes.
  Liste dans `src/ui/essentials.ts` (valeur de maison retenue, lots, avoirs, solde mode B, créance si incluse, date de décès, montants des dons/flux/legs actifs, fraction donnée, coefficient de vente, droits manuels).
  _18/11/2026 — commit 0d4eb99. 112 tests + build OK sur une copie isolée (sans la « donation sur mesure » en cours, non incluse). Poussé._
- [x] **Tâche A — Aide « ? » par case** (onglets Situation, Scénarios, bloc « Succession du fils prédécédé ») : panneau déplié au toucher
  (quoi mettre, où le trouver, exemple, si la case reste vide, fiabilité) ; textes centralisés dans `src/ui/help.ts` (rôles → prénoms à l'affichage) ; masqué à l'impression.
  Tests : chaque entrée complète, chaque case indispensable a son « ? », ouverture / fermeture.
  _18/11/2026 — commit 81e0893 (avec l'alignement des cases et le passage automatique à l'acte de 2005, faits dans une session parallèle). 119 tests + build OK. Poussé._
  Suggestions suivantes (non décidées) : D — noter les réponses du notaire sous chaque question ; E — frise des dates clés ; B — liste des documents à rassembler ;
  H — questions pour la banque ; F — 3 options côte à côte imprimables ; I — courbe de la réserve du père ; J — mode présentation.

## Tâche en cours

Aucune tâche de code en cours. La session s'est arrêtée après la mise en ligne réussie
(déploiement GitHub Actions n° 44107890452 vert, site vérifié dans Chrome).
**Prochaine action, côté utilisateur** : ouvrir le site dans Safari sur l'iPhone → Partager → « Sur l'écran d'accueil » (tâche T1).

## À faire (tâches testables et commitables)

- [x] **T1 — Test réel sur iPhone** (manuel, aucune dépendance)
  _19/11/2026 — test manuel par l'utilisateur sur la version en ligne (commit 82482a0) : installation sur l'écran d'accueil, plein écran et encoche, onglets, saisie « 170 000,50 », aide, mode avion, export vers iCloud Drive puis import → tout OK, aucun problème relevé._
  Installer sur l'écran d'accueil ; vérifier : affichage plein écran et encoche, saisie « 170 000,50 », onglets,
  mode avion (hors connexion), « Exporter » → Enregistrer dans Fichiers → iCloud Drive, puis « Importer ».
  Noter les problèmes ici ; chacun devient une tâche.
- [x] **T2 — Mettre à jour le workflow GitHub Actions** (aucune dépendance)
  _19/11/2026 — commit cea090e. checkout v7, setup-node v7, configure-pages v6, upload-pages-artifact v5, deploy-pages v5 (toutes Node 24 ; `dist/` sans fichier caché). 139 tests + build OK. Poussé : déploiement vert sans avertissement, site en ligne (HTTP 200). `ubuntu-latest` conservé (plus d'avertissement)._
  Avertissements : actions sur Node 20 obsolète (checkout@v4, configure-pages@v5, setup-node@v4, upload-artifact@v4) ; `ubuntu-latest` passe à Ubuntu 26.
  Vérifier les versions récentes des actions, mettre à jour, pousser (accord requis), contrôler un déploiement vert sans avertissement.
- [ ] **T3 — Cache du service worker lié à la version** (après T1 de préférence)
  `CACHE = 'simulateur-v1'` n'est jamais changé : les anciens fichiers `assets/*` s'accumulent. Générer le nom de cache au build
  (ou purger les assets absents de l'`index.html` courant) ; tester mise à jour + hors connexion.
- [ ] **T4 — Versionner le script des icônes** (aucune dépendance)
  Le script PIL n'existe que dans `docs/session-2026-11-17.md` → l'ajouter en `scripts/icons.py`, documenter dans le README.
- [ ] **T5 — Petites corrections** (indépendantes, une par commit)
  - [ ] Date de l'instantané « Figer ce résultat » en date locale (actuellement UTC via `toISOString`).
  - [ ] Budget : clarifier « prix de relogement » (ponctuel vs mensuel × durée) dans l'interface et le calcul.
  - [ ] Champ « Payé par » des dettes/frais : utilisé par l'interface mais ignoré par le moteur (toujours « succession ») → l'appliquer ou le retirer.
  - [ ] Matrice de sensibilité : ne modifie que le premier poste « compte » ; gérer plusieurs comptes/titres.
  - [ ] Ajouter un lot crée une quote-part 0 (invalide jusqu'à saisie) → proposer la quote-part restante.
- [ ] **T6 — zod 4** (indépendante) : migrer `src/persistence/schema.ts`, relancer tous les tests (corrige GHSA-mrhx-c7xc-m3w5).
- [ ] **T7 — Intégrer les réponses du notaire** (dépend du rendez-vous)
  Mettre à jour `src/tax/rules.ts` (statuts, notes, sources) et les réglages par défaut ; ajouter un test par règle validée.
  Questions : voir la fiche « Questions pour le notaire » et `docs/session-2026-11-17.md` § « Points à valider ».
- [x] **T10 — Assurances du fils prédécédé** (bloc « Succession du fils prédécédé »)
  Case « assurance groupe / vie versée à la bénéficiaire » (montant + « taxée en droits de succession ? » oui / non / à confirmer → fourchette).
  Capital hors succession civile (les dettes ne s'y imputent pas), ajouté à la part taxable de la bénéficiaire (art. 8 C. succ., à confirmer) ;
  si elle renonce, elle garde l'assurance et paie les droits sur ce capital ; plancher art. 68 limité à la part renoncée.
  « Autres biens nets » négatifs saisissables ; avertissement « succession déficitaire » : en cas de renonciation, père et fils survivant héritent des dettes
  (bénéfice d'inventaire). Questions ajoutées à la fiche notaire. Tests à partir de calculs écrits à la main.
  _18/11/2026 — commit cc74cc1. 127 tests + build OK. Poussé._
- [x] **T11 — Suites de la déclaration de succession de la mère (projet 2005)**
  _18/11/2026 — commit 9ef0c87. 128 tests + build OK. Textes seulement (moteur inchangé) : note du préréglage acte 2005 avec la source cadastre ;
  4 questions ajoutées à la fiche notaire (déclaration enregistrée, créance de restitution, autres immeubles, terre agricole) ;
  « Autres biens nets » du fils prédécédé : créance de restitution + quotes-parts d'autres immeubles. Poussé._
  Le projet de déclaration confirme : maison détenue pour **1/2 par chaque époux** ; séparation de biens ; donation de survie réductible ;
  « en cas de demande en réduction » : conjoint 1/3 PP + 2/3 US, chaque fils 1/3 NP → répartition `acte2005_reduction` inchangée.
  Points nouveaux à intégrer (fiche notaire + bloc « Succession du fils prédécédé ») :
  - **Quasi-usufruit** du père sur les avoirs bancaires de la mère (sa moitié des comptes ≈ 7 200 € + titres non chiffrés) :
    à son décès, chaque fils (ou la succession du fils prédécédé) aurait une **créance de restitution** ≈ 1/3 de ces avoirs
    (dette déductible dans la succession du père ; actif dans celle du fils prédécédé). À confirmer par le notaire.
  - **Autres immeubles** reçus par la mère en nue-propriété (une quote-part d'une maison et d'une terre agricole, usufruit d'une aïeule) :
    sort actuel inconnu (usufruit éteint ? biens vendus ?) ; une part peut se trouver dans la succession du fils prédécédé (« autres biens »).
    Le projet indique « 1/6 » en titre et « 1/16 » dans le texte pour la maison : incohérence à vérifier sur l'acte signé.
  - La déclaration est « purement fiscale sans effets civils » et ce n'est qu'un projet : demander la **version enregistrée** et une preuve que la réduction a bien été demandée.
  - L'**acte de notoriété** (24/06/2005, enregistré le 29/06/2005) est lui aussi **conditionnel** (« en cas de demande en réduction »).
    **Confirmé le 18/11/2026 par MyMinfin (cadastre)** : père PP 4/6 + usufruit 2/6, chaque fils NP 1/6 → préréglage `acte2005_reduction`
    = situation enregistrée (le cadastre n'est pas un titre de propriété, mais il reprend la déclaration enregistrée). Afficher cette source dans la note du préréglage.
    Le fils prédécédé y figure encore (mise à jour après la déclaration de sa succession).
  - La **terre agricole** de la succession de la mère (654 m², revenu cadastral 4 €, 17 copropriétaires) figure dans MyMinfin.
    Part de la mère : 1/24 (usufruit de l'aïeule éteint). Cadastre : père NP 10/720 (= 1/72) ; chaque fils PP 1/72 + usufruit 1/144.
    Attendu selon l'acte 2005 : père PP 1/72 + usufruit 1/36 ; chaque fils NP 1/72 → **inscription inversée ou autre origine** (à demander au notaire).
    Valeur de la part de chaque fils : quelques dizaines à quelques centaines d'euros → négligeable dans les calculs ;
    à mentionner seulement dans la succession du fils prédécédé. L'autre maison n'y figure pas (vendue ?).
- [x] **T14 — Onglet séparé « Succession du fils prédécédé »** (2e onglet ; libellé avec le prénom s'il est saisi)
  Option de la bénéficiaire (part en nue-propriété), valeur de la maison au décès et tout le bloc (testament, biens et dettes, assurances, droits)
  déplacés hors de l'onglet Situation, qui ne garde qu'une ligne de renvoi (option retenue + répartition résultante). Format des données inchangé.
  _19/11/2026 — commit faff785. 139 tests + build OK. Poussé._
  Prévu ensuite : saisie des réponses de la bénéficiaire (comptes, dettes détaillées, assurances, délais, bénéfice d'inventaire) — questionnaire préparé en session.
- [ ] **T16 — Onglet « Succession du fils prédécédé » plus clair et personnalisable** (demande du 19/11/2026)
  Étapes numérotées (1 part de maison · 2 famille et testament · 3 biens et dettes · 4 assurances · 5 règles fiscales à confirmer · 6 résultats) ;
  cases indispensables jaune / vert + légende (`sfpNeeds` dans `src/ui/essentials.ts`) ; question « l'assurance existe-t-elle ? »
  (Je ne sais pas / Non / Peut-être = calcul avec et sans / Oui) pour chaque assurance : montant et options affichés seulement si elle existe ;
  données déjà enregistrées : existence déduite du montant (> 0 → oui, 0 → non, vide → je ne sais pas). Fiche notaire adaptée.
  _Terminée, testée (147 tests + build OK), commit à faire._
- [ ] **T8 — Script `npm run dev:reseau`** (optionnel, proposé mais non confirmé) : `vite --host` pour le Wi-Fi local.
- [ ] **T12 — Repères de coefficient d'usufruit selon l'âge** (onglet Scénarios, bloc Vente ; aucune dépendance)
  Saisie facultative de la date de naissance de l'usufruitier (stockée localement, exclue des exports par défaut) et de la date de vente prévue.
  Afficher, **à titre de repère seulement** (le coefficient reste une valeur convenue, jamais appliqué automatiquement) :
  - barème fiscal art. 47 C. enr. (revenu 4 % × multiplicateur selon l'âge, ex. 75–80 ans → 16 %, > 80 ans → 8 %) — règle versionnée avec source et date de consultation, à vérifier avant d'écrire le test ;
  - estimation « espérance de vie » : 1 − (1 + i)^−n (taux i saisi, n issu d'une table Statbel citée) — fourchette, pas un total ;
  - alerte quand un anniversaire de changement de tranche tombe près de la date de vente (convention : jour anniversaire → « à confirmer ») ;
  - bouton « utiliser ce repère » qui recopie la valeur dans le champ coefficient (action explicite de l'utilisateur).
  Tests : calculs indépendants en commentaire (ex. né le 01/07/1950, vente le 01/07/2028 → 78 ans → 16 % ; vente le 02/07/2030 → 8 %).
- [x] **T13 — Assurance versée au fils survivant et transmission à la bénéficiaire** (bloc « Succession du fils prédécédé »)
  _19/11/2026 — commit 822f4ba. 137 tests + build OK. Poussé._
  Nouvelle donnée (19/11/2026) : une petite assurance groupe du fils prédécédé désigne **le fils survivant** ; un autre contrat
  (capital pension) serait refusé par l'assureur (exclusion suicide) ; dettes ≈ la moitié de l'assurance de la bénéficiaire.
  Cases : capital versé au fils survivant, « taxé ? » (oui / non / à confirmer → fourchette), bénéficiaire suivant si le fils renonce au bénéfice.
  Moteur : capital taxé au barème frères et sœurs dans le chef du fils (art. 8, à confirmer) — seul si la bénéficiaire accepte, ajouté à ses 3/4 si elle renonce.
  Comparaison « garder / don bancaire non enregistré (risque de rappel 5 ans au barème entre non-parents) / donation enregistrée 5,5 % /
  renonciation au bénéfice (seulement si la clause désigne ensuite la bénéficiaire ; sinon le capital peut tomber dans la succession) ».
  Règles : barème « entre autres personnes » 30/35/60/80 % et donation mobilière « autres personnes » 5,5 % (SPF, consultés le 19/11/2026).
  Fiche notaire : clause bénéficiaire, retenues, renonciation au bénéfice, attendre l'option successorale de la bénéficiaire, contrat refusé (clause suicide, réserve).
- [ ] **T15 — Bouton « PDF de cet onglet pour le destinataire »** (onglet « Succession du fils prédécédé » ; dépend de T14)
  But : envoyer à la bénéficiaire (ou à une autre personne) **uniquement** cet onglet, sans l'export JSON ni les autres onglets.
  - Bouton en haut de l'onglet (masqué à l'impression) : saisie facultative du destinataire (texte libre, non stocké ni exporté) et choix
    « afficher les prénoms » propre à cette impression (indépendant de la case de l'onglet « Questions pour le notaire »), puis `window.print()`.
  - En-tête imprimé : titre de l'onglet, « Préparé pour : … » si renseigné, date du jour jj/mm/aaaa, mention « indicatif, à valider par le notaire ».
  - Aperçu avant impression : liste des données de la situation du père reprises dans l'onglet (valeur de la maison au décès, part 1/6 NP…)
    pour que l'utilisateur vérifie ce qu'il montre ; champs vides rendus lisibles (« non renseigné ») plutôt que des cases de saisie vides.
  - iPhone : texte d'aide « Partager → Imprimer → Partager (PDF) » ; aucune boîte `confirm()` avant l'impression.
  Tests : parcours interface (bouton présent, en-tête avec destinataire et date, prénoms masqués par défaut puis affichés si coché,
  destinataire absent du localStorage et de l'export JSON) ; vérification manuelle de l'aperçu d'impression à 390 px.

## Idées en attente (non décidées)

- **Accès iPhone « pour toutes mes applications »** depuis l'extérieur : stratégie générale à définir appli par appli
  (GitHub Pages si les données peuvent rester sur l'appareil ; pages privées claude.ai ou réseau privé type Tailscale s'il faut synchroniser des données).
  Attention : le PC est un poste professionnel (Windows Enterprise) → pas de VPN ni de serveur exposé sans accord du service informatique.
- **Synchronisation PC ↔ iPhone** du simulateur (aujourd'hui : export/import manuel).
- Modéliser plus tard (hors périmètre actuel) : exemption enfants < 21 ans, réductions pour enfants à charge, forfaits 2028 (dettes 1 500 €, funérailles 5 000 €), cumul de donations immobilières, plus-value de vente, droits sur cession/rachat, donations hors ligne directe.
- Côté compte GitHub (à faire par l'utilisateur) : activer « Keep my email addresses private » et « Block command line pushes that expose my email » ; vérifier l'adresse de secours ajoutée.
