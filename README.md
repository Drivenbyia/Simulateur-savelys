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

Le **Moteur 1** reprend fidèlement la méthode « garde-fou » de PacCloser (pipeline DJU
en 10 étapes : conso → ECS → correction PCS/PCI gaz → rendement chaudière → appoint
bois → setback nocturne → puissance à la température de base). La **grille CEE** est
la grille réelle Savelys (par zone × surface × profil).

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
  8 sous-zones RT2012 (H1a…H3) et mapping complet des 96 départements
  métropolitains, d'après la table de dimensionnement PacCloser.
- **Design system** (`styles/main.css`) : vert Savelys confirmé `#265B2F`
  (source : savelys.fr).

## ⚠️ Données à valider avant mise en production

- **Constantes énergie** (`js/constants.js`, `MAJ_TARIFS`) : prix gaz/fioul/élec.
- **Barème CEE / Coup de pouce** (`js/data/aides-baremes.js`) : barème réel du
  partenaire obligé Savelys.
- **Cible d'intégration du lead** (`js/ui/lead.js`) : Salesforce Web-to-Lead,
  à brancher quand l'`oid`/endpoint de l'org sera fourni.

## Points ouverts

1. Mapping départemental fin RT2012 (source PacCloser).
2. Vrais prix Savelys par puissance → calage des poids du Moteur 3.
3. Destination technique du lead (agence / CRM).
4. Hex + police Savelys.
