# CLAUDE.md — Simulateur familial de succession et donations (Wallonie)

Contexte permanent du projet. À lire au début de chaque session, avec [PLAN.md](PLAN.md).
Historique détaillé : [docs/session-2026-11-17.md](docs/session-2026-11-17.md).

## Règles de travail (demandées par l'utilisateur)

1. **Une seule tâche de PLAN.md à la fois.**
2. Quand une tâche est terminée **et testée** (`npm test` + `npm run build`) :
   proposer un commit (message clair) → attendre l'accord → cocher la tâche dans PLAN.md avec une note
   (date, commit, vérifications) → rappeler à l'utilisateur de faire `/clear`.
3. **Jamais de commit ni de push sans accord explicite.** Le push publie le site public (voir « Publication »).
   L'utilisateur a voulu être prévenu *avant* tout commit.
4. Répondre en **français**. L'utilisateur utilise principalement son **iPhone** pour l'application.
5. Ne jamais commiter de données réelles (noms, montants de la famille) : exemples anonymes uniquement.

## Objectif

Outil local et privé pour comparer, avant le rendez-vous chez le notaire, donation / vente / maintien de la situation :
ce que le père conserve, ce que chacun reçoit, ce qui est payé, quand, et quelles hypothèses expliquent les écarts.
Aucune démarche juridique, fiscale ou financière réelle. Résultats indicatifs, à valider par le notaire.

Cas d'exemple (rôles anonymes) : maison à Gembloux (hypothèse 300 000 €, ancienne estimation 250 000 €) ;
père 50 % pleine propriété + usufruit sur 50 % ; fils survivant 25 % en nue-propriété ; quart du fils prédécédé
(décédé le 07/10/2026) en succession ouverte (bénéficiaire potentielle : sa cohabitante légale, jamais certaine par défaut) ;
avoirs du père ≈ 170 000 € ; créance de 15 000 € moins 4 × 250 € (exclue par défaut) ; petit-fils (legs ou don possible).

## Technologies

- Vite 5.4.10 · React 18.3.1 · TypeScript 5.6.3 · zod 3.23.8 · Vitest 2.1.4 · jsdom · Testing Library.
- Node 24 en local (Node 22 sur GitHub Actions). Aucune dépendance réseau à l'exécution.
- PWA : `public/manifest.webmanifest`, `public/sw.js` (hors connexion), icônes PNG générées avec Python/PIL.

## Commandes

```
npm install · npm run dev (http://127.0.0.1:5173) · npm test · npm run build · npm run preview (4173)
npm run dev -- --host      # accès depuis l'iPhone sur le même Wi-Fi (expose sur le réseau local)
```

## Structure

| Chemin | Rôle |
|---|---|
| `src/util/` | `money.ts` (centimes, saisie fr-BE), `fraction.ts` (rationnels), `dates.ts` (dates civiles, délais en années) |
| `src/model/` | `types.ts`, `sample.ts` (cas anonyme + modèles de scénarios `TEMPLATES`) |
| `src/domain/` | `rights.ts` (lots PP / NP+US, donation, extinction d'usufruit, cession), `sale.ts` (ventilation de vente) |
| `src/tax/` | `rules.ts` (profils versionnés + sources), `brackets.ts`, `succession.ts`, `donation.ts` |
| `src/cash/budget.ts` | réserve du père, déficit mensuel, durée sans rendement |
| `src/engine/` | `simulate.ts` (moteur pur), `num.ts` (résultats avec statut / fourchette) |
| `src/persistence/` | `schema.ts` (zod + migrations), `io.ts` (localStorage, export JSON/CSV, partage iOS, rappel de sauvegarde) |
| `src/ui/` | onglets : Situation, Scénarios, Comparaison, Détail fiscal, Questions pour le notaire |
| `tests/` | 74 tests (calculs indépendants + parcours interface) |
| `.github/workflows/deploy.yml` | tests + build puis publication GitHub Pages sur push `main` |

## Conventions (ne pas casser)

- **Montants en centimes entiers** ; taux en points de base ; produit exact par tranche, **un seul arrondi** au centime (demi vers le haut) ; répartitions au plus fort reste (la somme retrouve le total).
- **Dates civiles ISO** ; délais en années anniversaires, jamais 1 095 / 1 825 jours ; jour anniversaire et 29 février → « à confirmer ».
- **`null` = non renseigné ≠ 0** ; une inconnue ne bloque que les résultats dépendants.
- **Jamais de total final si partiel ou non vérifié** : `Num` avec `value: null` + `lo`/`hi` + statut.
- **Règles fiscales versionnées** (`id`, statut, validité, sources avec date de consultation, notes). Une annonce n'est jamais une règle applicable. Ne pas ajuster les formules pour reproduire un repère si les sources disent autre chose : documenter l'écart.
- Statuts affichés en texte + icône, jamais par la couleur seule. Interface en français, EUR fr-BE, dates jj/mm/aaaa.
- Confidentialité : pas de télémétrie, pas de CDN, CSP stricte injectée **au build seulement** (`vite.config.ts`, `connect-src 'none'`). Noms affichés uniquement dans le navigateur, exclus des exports et impressions par défaut.
- Tests : partir de calculs indépendants écrits en commentaire, pas du résultat du code.

## Décisions importantes (et pourquoi)

- **Réserve de progressivité immobilière** : introuvable dans les sources consultées → fourchette par défaut (13 050 € … sous-total 32 800 € avant exemption), imputation de l'exemption non calculée.
- **Décès ≥ 01/01/2028** : mode auto = « projection non disponible » (décret 05/12/2024 voté + réforme annoncée le 12/10/2026 non publiée). Profils explicites : `constant2026` (contrefactuel), `decret2024`, `annonce2026` (hypothèse), `manuel`.
- **Rappel des dons non enregistrés** : 5 ans (3 ans pour les dons avant 01/01/2022), source SPF — pas le décret 2024.
- **Exemption art. 54** : 12 500 € + 12 500 € si part nette ≤ 125 000 € ; imputée sur les tranches les plus basses ; non appliquée au petit-fils légataire par défaut.
- **Logement familial** : part logement au taux réduit, reste placé au-dessus dans le barème ordinaire (cohérent avec le repère 38 425 €, non écrit dans la source SPF). Éligibilité = hypothèse par défaut.
- **Variantes d'hypothèses** non tranchées → toutes les combinaisons sont calculées (fourchette) ; le détail montre l'hypothèse prudente.
- **Référence alignée** : chaque variante est comparée à une référence recalculée à sa date, ses règles et sa valeur.
- **Hébergement : GitHub Pages (solution « C »)** plutôt que pages claude.ai ou Tailscale : l'utilisateur utilise surtout l'iPhone ; les données restent sur l'appareil ; gratuit. Prix : pas de synchronisation PC ↔ iPhone (export/import JSON via iCloud Drive).
- **Export sans `confirm()`** : sur iOS, une boîte de dialogue avant `navigator.share` fait perdre l'activation utilisateur → avertissement affiché en texte.
- **Lecture de fichiers via `FileReader`** (pas `Blob.text()`) : compatibilité jsdom et anciens Safari.
- **zod 3 conservé** malgré l'avis GHSA-mrhx-c7xc-m3w5 (corrigé seulement en v4) : import plafonné à 2 Mo, fichiers choisis par l'utilisateur.

## Publication

- Dépôt public : https://github.com/oliday30-jpg/simulateur-succession — site : **https://oliday30-jpg.github.io/simulateur-succession/**
- Pages en mode « GitHub Actions » (activé via `gh api -X POST repos/oliday30-jpg/simulateur-succession/pages -f build_type=workflow`).
- Identité Git **locale à ce dépôt** : `user.email = 314188066+oliday30-jpg@users.noreply.github.com` (ne jamais commiter avec l'adresse personnelle : dépôt public).
- Push (après accord) : `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push` (gh connecté au compte `oliday30-jpg`, scopes repo + workflow) ; sans modifier la config Git globale.
