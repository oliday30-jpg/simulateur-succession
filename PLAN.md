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

- [ ] **T1 — Test réel sur iPhone** (manuel, aucune dépendance)
  Installer sur l'écran d'accueil ; vérifier : affichage plein écran et encoche, saisie « 170 000,50 », onglets,
  mode avion (hors connexion), « Exporter » → Enregistrer dans Fichiers → iCloud Drive, puis « Importer ».
  Noter les problèmes ici ; chacun devient une tâche.
- [ ] **T2 — Mettre à jour le workflow GitHub Actions** (aucune dépendance)
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
- [ ] **T10 — Assurances du fils prédécédé** (bloc « Succession du fils prédécédé »)
  Case « assurance groupe / vie versée à la bénéficiaire » (montant + « taxée en droits de succession ? » oui / non / à confirmer → fourchette).
  Capital hors succession civile (les dettes ne s'y imputent pas), ajouté à la part taxable de la bénéficiaire (art. 8 C. succ., à confirmer) ;
  si elle renonce, elle garde l'assurance et paie les droits sur ce capital ; plancher art. 68 limité à la part renoncée.
  « Autres biens nets » négatifs saisissables ; avertissement « succession déficitaire » : en cas de renonciation, père et fils survivant héritent des dettes
  (bénéfice d'inventaire). Questions ajoutées à la fiche notaire. Tests à partir de calculs écrits à la main.
- [ ] **T8 — Script `npm run dev:reseau`** (optionnel, proposé mais non confirmé) : `vite --host` pour le Wi-Fi local.

## Idées en attente (non décidées)

- **Accès iPhone « pour toutes mes applications »** depuis l'extérieur : stratégie générale à définir appli par appli
  (GitHub Pages si les données peuvent rester sur l'appareil ; pages privées claude.ai ou réseau privé type Tailscale s'il faut synchroniser des données).
  Attention : le PC est un poste professionnel (Windows Enterprise) → pas de VPN ni de serveur exposé sans accord du service informatique.
- **Synchronisation PC ↔ iPhone** du simulateur (aujourd'hui : export/import manuel).
- Modéliser plus tard (hors périmètre actuel) : exemption enfants < 21 ans, réductions pour enfants à charge, forfaits 2028 (dettes 1 500 €, funérailles 5 000 €), cumul de donations immobilières, plus-value de vente, droits sur cession/rachat, donations hors ligne directe.
- Côté compte GitHub (à faire par l'utilisateur) : activer « Keep my email addresses private » et « Block command line pushes that expose my email » ; vérifier l'adresse de secours ajoutée.
