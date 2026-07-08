# Simulateur PAC Savelys

Simulateur public (web / PWA) d'aide à la décision pour le passage à une **pompe à
chaleur air/eau** — génération de leads pour Savelys (Engie Home Service).
L'utilisateur estime en ~2 minutes : puissance PAC, budget indicatif, aides
(MaPrimeRénov' / CEE / bonus fioul) et amortissement, puis laisse ses coordonnées.

Outil **public et self-service** (à ne pas confondre avec PacCloser, interne). Entrées
simples, tolérant aux trous, orienté crochet commercial — pas un bureau d'études.

## Stack

HTML + CSS + **JavaScript vanilla en ES modules**, sans build step. PWA-ready
(manifest + service worker). Déployable tel quel sur Netlify.

## Lancer en local

```bash
npm start          # sert le dossier sur http://localhost:8080 (npx serve)
# ou tout autre serveur statique, ex. : python3 -m http.server 8080
```

Ouvrir `http://localhost:8080`. (Les ES modules et le service worker nécessitent un
serveur HTTP — ne pas ouvrir `index.html` en `file://`.)

## Tests

```bash
npm test           # node --test : tests unitaires des 5 moteurs de calcul
```

## Architecture

Séparation stricte **constants → engines (fonctions pures) → ui** :

```
js/constants.js          Tarifs énergie + paramètres moteurs (datés, éditables)
js/data/                 climate (DJU/zones) · postal-zones · aides-baremes (ANAH/CEE)
js/engines/              5 moteurs purs et testables
  deperditions.js        Moteur 1 — garde-fou DJU (méthode PacCloser)
  dimensionnement.js     Moteur 2 — puissance PAC
  prix.js                Moteur 3 — fourchette de prix
  amortissement.js       Moteur 4 — économies / ROI (logique PacCloser)
  aides.js               Moteur 5 — profil ANAH + MPR + CEE Savelys + écrêtement
js/ui/                   tunnel (navigation) · render (résultats) · lead (gate RGPD)
js/app.js                Orchestration
```

Le **Moteur 1** reprend fidèlement la méthode « garde-fou » de PacCloser (pipeline DJU) ;
sa voie « logement » utilise la méthode volumique de l'étude 2026 (P = G × V × ΔT,
coefficient G par période RT 1974 → RE 2020, glissé selon les travaux d'isolation ADEME).
Énergies gérées : **gaz de ville, fioul, propane** (tables PacCloser §0).

Le **Moteur 2 (dimensionnement)** tient compte du **déclassement au froid** : la puissance
nominale d'une PAC est donnée à +7°C ; à la température de base régionale elle chute
(~2,8 %/°C, ex. capacité 66 % à −5°C). La puissance nominale requise est donc
`déperdition × 0,9 / facteur(T_base)`, + supplément ECS. Une même déperdition impose donc
une PAC plus puissante (et plus chère) en zone froide — comme sur le terrain.

Le **Moteur 3 (prix)** applique le modèle de l'étude 2026 : matériel PAC air/eau Duo +
accessoires (pot à boue, ballon tampon) + main-d'œuvre régionalisée (majoration IDF),
en HT puis TVA 5,5 % → **fourchette** bas/haut. L'émetteur (BT vs fonte HT) et la puissance
influent sur le matériel.

Le **Moteur 4 (économies)** reprend PacCloser : comparaison **tout compris** (énergie +
abonnements + entretien 150/180 €/an), **SCOP saisonnier réel** (SCOP nominal dégradé par
zone climatique, ex. fonte HT en H2 ≈ 2,5), ECS au COP 2,5, surcoût abonnement élec +80 €/an,
projection 10 ans à deux scénarios (inflation, provision de pannes, remplacement chaudière à
20 ans), point de croisement, scénario prudent fioul à 1,15 €/L.

**Prudence commerciale** : le **CEE annoncé est toujours le plus bas** (tranche basse), et le
reste à charge / amortissement sont présentés en **fourchette** — pour ne jamais sur-promettre
et garder du positif en rendez-vous. La grille CEE reste la grille réelle Savelys.

## Captation du lead (RGPD)

Le parcours reste **anonyme** jusqu'à la révélation des aides. Le montant des aides /
reste à charge / amortissement n'apparaît qu'**après** saisie des coordonnées + case
de consentement explicite. L'envoi est **simulé** pour l'instant (log console + objet
lead complet) — un seul point à rebrancher : `envoyerLead()` dans `js/ui/lead.js`
(Formspree / Netlify Forms / CRM).

## Données confirmées (itération 2)

- **Seuils RFR ANAH** (`js/data/aides-baremes.js`) : barème officiel ANAH au
  1er janvier 2026 (brochure officielle « Les aides financières en 2026 »),
  IDF + hors-IDF (la table `hors_idf` couvre aussi l'Outre-mer).
- **Zones climatiques / DJU** (`js/data/climate.js`, `js/data/postal-zones.js`) :
  8 sous-zones RT2012 (H1a…H3), mapping des 96 départements (PacCloser) et
  **température de base par département** (étude 2026, valeurs 0–200 m).
- **Tables énergie & économies** (`js/constants.js`) : prix/abonnements/inflations
  par énergie, COP ECS, entretiens, vieillissement chaudière — méthode PacCloser.
- **Design system** (`styles/main.css`) : vert Savelys confirmé `#265B2F`,
  police Urbanist, logo officiel (sources : savelys.fr).

## ⚠️ Données à valider avant mise en production

- **Constantes énergie** (`js/constants.js`, `MAJ_TARIFS`) : les prix bougent
  chaque mois — réactualiser prix gaz/fioul/élec avant diffusion.
- **Barème CEE / Coup de pouce** (`js/data/aides-baremes.js`) : barème réel du
  partenaire obligé Savelys.
- **Cible d'intégration du lead** (`js/ui/lead.js`) : Salesforce Web-to-Lead,
  à brancher quand l'`oid`/endpoint de l'org sera fourni.

## Limites connues (assumées pour un outil public)

- **Altitude non corrigée** : les T_base départementales sont des valeurs 0–200 m ;
  en altitude la déperdition réelle est plus élevée (−1 à −2 °C par 200 m, cf. étude
  2026) — l'estimation est à affiner en visite technique.
- **Appoint bois / setback nocturne** : gérés par PacCloser (outil conseiller),
  volontairement non exposés dans le tunnel grand public.
