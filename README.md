# Simulateur familial — succession et donations (Wallonie)

Outil **local et privé** pour comparer, avant un rendez-vous chez le notaire, les conséquences d'une donation, d'une vente ou du maintien de la situation : ce que le père conserve, ce que chacun reçoit, ce qui est payé, quand, et quelles hypothèses expliquent les écarts.

> ⚠️ Résultats **indicatifs**. Ce n'est ni un avis juridique, ni un devis, ni une déclaration. Aucune démarche réelle n'est effectuée. Toutes les règles et valeurs doivent être validées par le notaire.

## Installation et commandes

Prérequis : Node.js 20 ou plus récent (testé avec Node 24).

```bash
npm install        # installe les dépendances
npm run dev        # serveur de développement : http://127.0.0.1:5173
npm test           # tests unitaires + parcours interface (Vitest, jsdom)
npm run build      # vérification TypeScript + build de production dans dist/
npm run preview    # sert dist/ sur http://127.0.0.1:4173
```

Dans VS Code : *Terminal → Exécuter la tâche…* propose « Démarrer le simulateur », « Tests » et « Build » (`.vscode/tasks.json`). Ouvrez ensuite l'adresse affichée dans le navigateur. Sur iPhone, l'interface est adaptée aux petits écrans ; le serveur n'écoute que sur `127.0.0.1` (pas d'exposition au réseau local).

## Utilisation sur iPhone (GitHub Pages)

Le workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) publie l'application à chaque envoi sur la branche `main`, uniquement si les tests et le build réussissent. **Seul le code est publié**, avec l'exemple anonyme. Vos saisies restent dans le navigateur de chaque appareil.

Mise en place (une seule fois) :
1. Créez un dépôt sur GitHub. Il doit être public pour GitHub Pages gratuit ; la page reste publique même avec un dépôt privé payant.
2. Envoyez le code sur la branche `main`.
3. Dans le dépôt, ouvrez *Settings → Pages → Build and deployment → Source* et choisissez **GitHub Actions**.
4. L'adresse sera `https://<votre-compte>.github.io/<nom-du-dépôt>/`.

Sur l'iPhone :
- **Ajoutez l'appli à l'écran d'accueil** : dans Safari, *Partager → Sur l'écran d'accueil*. Lancez-la toujours depuis cette icône. Safari peut effacer les données d'un site visité dans un onglet normal après 7 jours sans visite. Les données de l'icône sont séparées de celles de l'onglet Safari.
- **N'utilisez pas la navigation privée** : rien n'y est conservé.
- **Hors connexion** : après la première ouverture, l'appli fonctionne sans réseau.
- **Sauvegarde** : *Exporter (JSON)* ouvre la feuille de partage ; choisissez *Enregistrer dans Fichiers → iCloud Drive*. Un rappel discret s'affiche quand des modifications n'ont pas été sauvegardées. *Importer* restaure une sauvegarde, sur l'iPhone comme sur le PC.

## Confidentialité

- Pas de télémétrie, pas de CDN, pas de requête réseau. Au build, une politique CSP interdit toute connexion (`connect-src 'none'`).
- Les données d'exemple utilisent des **rôles anonymes**. Les noms éventuels restent dans le navigateur ; ils ne sont **ni exportés ni imprimés par défaut**.
- La mémorisation locale (`localStorage`) se désactive dans le pied de page ; la désactiver l'efface.
- Les exports JSON/CSV contiennent les montants : `.gitignore` exclut `simulation-*.json`, `comparaison-*.csv` et `exports/`.

## Architecture

| Dossier | Rôle |
|---|---|
| `src/util` | Centimes entiers, fractions exactes, dates civiles (sans UTC) |
| `src/model` | Types, cas d'exemple anonyme, modèles de scénarios |
| `src/domain/rights.ts` | Lots fractionnaires (PP ou NP/US), donation, extinction d'usufruit, cession |
| `src/domain/sale.ts` | Ventilation exacte du prix d'une vente |
| `src/tax` | Catalogue **versionné** des règles (statut, validité, sources), barèmes, calculs |
| `src/cash/budget.ts` | Réserve du père, déficit mensuel, durée indicative sans rendement |
| `src/engine` | Simulation pure : chronologie, masse, droits, fourchettes d'hypothèses |
| `src/persistence` | Schéma zod, migrations, stockage local, export JSON/CSV |
| `src/ui` | Interface React (5 onglets) |

**Arrondis** : montants en centimes entiers ; taux en points de base ; produit exact par tranche, puis **un seul arrondi** au centime (demi vers le haut). Les répartitions utilisent le plus fort reste : la somme des parts retrouve exactement le total.

**Dates** : dates civiles ISO, délais en années anniversaires (jamais 1 095 / 1 825 jours). Un décès le jour anniversaire, ou un acte un 29 février, donne « à confirmer ».

**Inconnues** : « non renseigné » n'est jamais 0. Une valeur manquante ne bloque que les résultats qui en dépendent. Une règle non vérifiée produit une **fourchette** marquée « à confirmer », jamais un total final.

## Sources consultées (17/11/2026) et constats

| Source | Constat utilisé |
|---|---|
| [SPF Finances — droits de succession](https://fin.belgium.be/fr/particuliers/famille/deces/droits-succession/bruxelles-wallonie/calcul-paiement) | Barème ligne directe 3/4/5/7/10/14/18/24/30 % ; logement familial 1/2/5/12/24/30 % ; exemption 12 500 € + 12 500 € si part nette ≤ 125 000 € |
| [SPF Finances — donations](https://fin.belgium.be/fr/particuliers/autres-services/donations) | Mobilier 3,3 % ; immobilier 3/9/18/27 % ; rappel des dons non enregistrés : 5 ans (3 ans pour les dons faits avant le 01/01/2022) |
| [Décret wallon du 05/12/2024](https://wallex.wallonie.be/eli/loi-decret/2024/12/05/2024011274) | Décès **dès le 01/01/2028** : succession 3/4/5/7/9/12/15 %, logement 1/2/5/7/12/15 %, exemption 25 000 € pour l'héritier « appelé légalement » ; donations immobilières dès 2028 : 3/6/10/14 % |
| [Communiqué wallon du 12/10/2026](https://wallonie.be/fr/acteurs-et-institutions/wallonie/gouvernement-de-wallonie/communiques-presse/2026-10-12) | **Annonce** (lue partiellement) : 75 000 € exonérés par bénéficiaire dès 2028 — traitée comme hypothèse, jamais comme règle |
| [Notaire.be — usufruit](https://www.notaire.be/usufruit-et-nue-propriete) | Valeur de l'usufruit convenue ou fixée par le juge ; extinction au décès sans droits de succession |

Le PDF du Code wallon de 2019 était illisible ; le texte consolidé des articles 54, 60ter, 66bis et 66ter n'a pas pu être lu.

## Repères recoupés (barème actuel, hors frais)

| Cas | Résultat | Statut |
|---|---|---|
| Référence (150 000 € logement éligible + 170 000 €) | 38 425 € | ✓ reproduit |
| 170 000 € seuls | 13 050 € | ✓ |
| Donation de la moitié puis décès après 3 ans | 4 500 € + 13 050 € = 17 550 € | ✓ (barème 2026 constant, contrefactuel) |
| Legs de 25 000 € au petit-fils | 875 € à sa charge ; total 33 300 € | ✓ (sans exemption pour le petit-fils) |
| Réserve de progressivité | Sous-total 32 800 € avant exemption, montant final à confirmer | règle **non trouvée** dans les sources |
| Vente avec coefficient fictif de 15 % | Père 172 500 € avant donation, 45 000 € après (écart 127 500 €) | ✓ |

## Limites et points à faire valider

- **Réserve de progressivité immobilière** : absente des sources consultées → fourchette par défaut, imputation de l'exemption non calculée.
- **Logement familial** : l'empilement « logement puis reste » est cohérent avec le repère de 38 425 €, mais n'est pas écrit dans la source SPF. L'éligibilité est une hypothèse par défaut.
- **Décès dès 2028** : en mode automatique, la projection est « non disponible ». Les profils « décret 2024 », « annonce 2026 » et « barème 2026 constant » doivent être choisis explicitement et restent étiquetés.
- Non modélisés : exemption pour enfants de moins de 21 ans, réductions pour enfants à charge, forfaits de dettes et de frais funéraires de 2028, cumul de donations immobilières successives, plus-value de vente, fiscalité des cessions/rachats, dévolution de la succession du fils prédécédé, donations hors ligne directe.
- Le coefficient d'usufruit d'une vente est toujours **saisi** (valeur convenue) : il n'est jamais déduit de l'âge.
