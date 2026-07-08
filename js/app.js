/**
 * app.js — orchestration du simulateur PAC Savelys.
 * Câble : constants + data + engines (calcul) → ui (rendu/tunnel/lead).
 * Aucun build : chargé en <script type="module"> par index.html.
 */

import {
  rendementChaudiere,
  pciEnergie,
  ENERGIES,
  T_INT,
  E_ECS_UTILE,
  HAUTEUR_SOUS_PLAFOND_DEFAUT,
  DEPTS_IDF,
  factureAnnuelleToConso,
} from "./constants.js";
import { getZone, CLIMAT_DEFAUT, zoneCoarse } from "./data/climate.js";
import { getZoneFromPostal, getTbaseFromPostal } from "./data/postal-zones.js";
import { PROFIL_LABELS } from "./data/aides-baremes.js";
import { calculerDeperditions } from "./engines/deperditions.js";
import { dimensionnerPAC } from "./engines/dimensionnement.js";
import { estimerPrix } from "./engines/prix.js";
import { calculerAides, seuilsPourFoyer } from "./engines/aides.js";
import { calculerAmortissement } from "./engines/amortissement.js";
import { STEPS, TOTAL_STEPS, renderProgress, validateStep } from "./ui/tunnel.js";
import {
  renderPreResultat,
  renderResultatFinal,
  renderDatation,
  fmtEuro,
  fmtEuroRange,
} from "./ui/render.js";
import { renderLeadForm, validateLead, buildLeadPayload, envoyerLead } from "./ui/lead.js";

/* ------------------------------------------------------------------ état --- */
const state = {
  step: 1,
  leadSubmitted: false,
  estimation: { methode: "conso" }, // "conso" (recommandé) | "logement"
  logement: {
    type: "maison",
    surface: 100,
    hauteur: HAUTEUR_SOUS_PLAFOND_DEFAUT,
    codePostal: "",
    epoqueKey: "de_1989_2000",
    travaux: { toiture_combles: false, murs: false, fenetres: false, plancher_bas: false },
  },
  chauffage: { energie: "gaz", typeChaudiereKey: "standard", conso: "", consoUnite: "quantite" },
  besoins: { avecEcs: true, emetteurKey: "radiateurs_BT", nbOccupants: 3 },
  // nbPersonnes recopie nbOccupants tant que l'utilisateur ne l'a pas ajusté
  // explicitement (foyerTouched) — évite de « repartir à 3 » à l'étape Aides.
  aides: { region: "hors_idf", nbPersonnes: 3, profil: null, foyerTouched: false },
  lead: { prenom: "", nom: "", canal: "email", email: "", tel: "", codePostal: "", consent: false },
};

// Listes d'options : [valeur, titre, sous-titre?].
const TYPES_CHAUDIERE = [
  ["condensation", "Condensation", "moins de 10 ans"],
  ["standard", "Standard", "10 à 20 ans"],
  ["ancienne", "Ancienne", "plus de 20 ans"],
];
// Périodes de construction (matrice G de l'étude 2026, RT 1974 → RE 2020).
const EPOQUES = [
  ["avant_1974", "Avant 1974", "aucune isolation d'origine"],
  ["de_1974_1988", "1974 – 1988", "premières réglementations (RT 1974/1982)"],
  ["de_1989_2000", "1989 – 2000", "RT 1988"],
  ["de_2001_2012", "2001 – 2012", "RT 2000 / RT 2005"],
  ["rt2012", "2013 – 2021", "RT 2012 / BBC"],
  ["re2020", "Après 2022", "RE 2020"],
];
const EMETTEURS = [
  ["plancher_BT", "Plancher chauffant", "basse température"],
  ["radiateurs_BT", "Radiateurs basse température", "récents / acier"],
  ["radiateurs_fonte_HT", "Radiateurs fonte", "haute température"],
];
const TRAVAUX = [
  ["toiture_combles", "Toiture / combles", "🏠"],
  ["murs", "Isolation des murs", "🧱"],
  ["fenetres", "Fenêtres / double vitrage", "🪟"],
  ["plancher_bas", "Plancher bas", "⬇️"],
];
const METHODES = [
  ["conso", "Par ma consommation", "⭐ le plus précis"],
  ["logement", "Par mon logement", "si je ne connais pas ma conso"],
];

/**
 * Consommation saisie par l'utilisateur, ramenée à l'unité physique attendue
 * par les moteurs (kWh gaz / litres fioul / kg propane), quelle que soit la
 * façon dont elle a été saisie (quantité, facture annuelle ou mensualité).
 */
function consoNativeUnite() {
  const { energie, conso, consoUnite } = state.chauffage;
  const montant = Number(conso) || 0;
  if (!montant) return 0;
  if (consoUnite === "annuel") return factureAnnuelleToConso(energie, montant);
  if (consoUnite === "mensuel") return factureAnnuelleToConso(energie, montant * 12);
  return montant;
}

/* ------------------------------------------------------------- calcul --- */
function compute() {
  const zoneCode = getZoneFromPostal(state.logement.codePostal);
  const zone = zoneCode ? getZone(zoneCode) : CLIMAT_DEFAUT;
  // T_base départementale (plus fine que la sous-zone) quand disponible.
  const tExtBase = getTbaseFromPostal(state.logement.codePostal) ?? zone.tExtBase;
  const idf = DEPTS_IDF.has(String(state.logement.codePostal || "").slice(0, 2));
  const ecsUtileKwh = state.besoins.avecEcs ? E_ECS_UTILE(state.besoins.nbOccupants) : 0;

  // Voie de calcul selon la méthode choisie par l'utilisateur.
  const depInput = {
    energie: state.chauffage.energie,
    typeChaudiereKey: state.chauffage.typeChaudiereKey,
    ecsUtileKwh,
    surface: state.logement.surface,
    hauteur: state.logement.hauteur,
    dju: zone.dju,
    tExtBase,
    tInt: T_INT,
  };
  if (state.estimation.methode === "conso") {
    depInput.conso = consoNativeUnite(); // voie A (facture)
  } else {
    depInput.epoqueKey = state.logement.epoqueKey; // voie B (logement + travaux)
    depInput.travaux = state.logement.travaux;
  }
  const dep = calculerDeperditions(depInput);

  const dim = dimensionnerPAC(dep.pDeperditionKW, {
    avecEcs: state.besoins.avecEcs,
    nbPersonnes: state.besoins.nbOccupants,
    tExtBase, // déclassement de la PAC à la température de base
    emetteurKey: state.besoins.emetteurKey, // + selon la T° d'eau de l'émetteur
  });
  const prix = estimerPrix({
    puissanceKW: dim.pCommercialeChauffageKW,
    emetteurKey: state.besoins.emetteurKey,
    idf,
  });

  const aides = calculerAides({
    profil: state.aides.profil,
    nbPersonnes: state.aides.nbPersonnes,
    region: state.aides.region,
    energieActuelle: state.chauffage.energie,
    prixCentral: prix.prixCentral,
    zone: zoneCoarse(zoneCode), // grille CEE en zones grossières H1/H2/H3
    surface: state.logement.surface,
  });

  // Conso réelle pour l'amortissement : la facture si dispo, sinon estimée.
  let consoReelle = consoNativeUnite();
  if (!(consoReelle > 0)) {
    const rendement = rendementChaudiere(state.chauffage.typeChaudiereKey, state.chauffage.energie);
    const finaleKwh = (dep.eChaufKwh + dep.eEcsKwh) / rendement;
    consoReelle = finaleKwh / pciEnergie(state.chauffage.energie); // → unité de l'énergie
  }

  const amort = calculerAmortissement({
    eChaufKwh: dep.eChaufKwh,
    eEcsKwh: dep.eEcsKwh,
    emetteurKey: state.besoins.emetteurKey,
    energieActuelle: state.chauffage.energie,
    consoReelle,
    typeChaudiereKey: state.chauffage.typeChaudiereKey,
    avecEcs: state.besoins.avecEcs,
    zone: zoneCoarse(zoneCode) || "H2",
    prixCentral: prix.prixCentral,
    prixFourchette: prix.fourchette,
    aidesTotales: aides.aidesTotales,
  });

  return { zone, zoneCode, tExtBase, dep, dim, prix, aides, amort };
}

/* ---------------------------------------------------------- templates --- */
/** Cartes radio (une seule sélection). options = [valeur, titre, sous-titre?]. */
function optionCards(name, bind, options, selected, { rerender = false } = {}) {
  const items = options
    .map(
      ([v, titre, sous]) => `
      <label class="opt-card">
        <input type="radio" name="${name}" data-bind="${bind}" value="${v}"
          ${v === selected ? "checked" : ""} ${rerender ? "data-rerender" : ""} />
        <span class="opt-card__body">
          <span class="opt-card__title">${titre}</span>
          ${sous ? `<span class="opt-card__sub">${sous}</span>` : ""}
        </span>
      </label>`
    )
    .join("");
  return `<div class="option-cards">${items}</div>`;
}

/** Cartes à cocher (multi-sélection) pour les travaux d'isolation. */
function travauxCards(travaux) {
  const items = TRAVAUX.map(
    ([k, titre, icon]) => `
      <label class="opt-card opt-card--check">
        <input type="checkbox" data-bind="logement.travaux.${k}" ${travaux[k] ? "checked" : ""} />
        <span class="opt-card__body"><span class="opt-card__title">${icon} ${titre}</span></span>
      </label>`
  ).join("");
  return `<div class="option-cards">${items}</div>`;
}

/** Cartes de tranche de revenu (profil couleur ANAH), seuils adaptés au foyer. */
function profilCards() {
  const s = seuilsPourFoyer(state.aides.nbPersonnes, state.aides.region);
  const rows = [
    ["bleu", `moins de ${fmtEuro(s.bleu)}`],
    ["jaune", `${fmtEuro(s.bleu)} à ${fmtEuro(s.jaune)}`],
    ["violet", `${fmtEuro(s.jaune)} à ${fmtEuro(s.violet)}`],
    ["rose", `plus de ${fmtEuro(s.violet)}`],
  ];
  const items = rows
    .map(
      ([p, range]) => `
      <label class="opt-card opt-card--profil">
        <input type="radio" name="profil" data-bind="aides.profil" value="${p}"
          ${state.aides.profil === p ? "checked" : ""} />
        <span class="opt-card__body">
          <span class="opt-card__title"><span class="dot badge--${p}"></span> ${PROFIL_LABELS[p]}</span>
          <span class="opt-card__sub">Revenu fiscal de référence ${range}</span>
        </span>
      </label>`
    )
    .join("");
  return `<div class="option-cards profil-cards">${items}</div>`;
}

function stepLogement() {
  const zoneCode = getZoneFromPostal(state.logement.codePostal);
  return `
    <fieldset class="field">
      <legend>Type de logement</legend>
      <div class="segmented">
        <label><input type="radio" name="type" data-bind="logement.type" value="maison" ${state.logement.type === "maison" ? "checked" : ""}/> Maison</label>
        <label><input type="radio" name="type" data-bind="logement.type" value="appartement" ${state.logement.type === "appartement" ? "checked" : ""}/> Appartement</label>
      </div>
    </fieldset>

    <label class="field">
      <span>Surface chauffée : <strong id="surface-val">${state.logement.surface} m²</strong></span>
      <input type="range" min="30" max="300" step="5" data-bind="logement.surface" data-type="number" data-live="#surface-val" data-unit=" m²" value="${state.logement.surface}" />
    </label>

    <label class="field">
      <span>Hauteur sous plafond : <strong id="hauteur-val">${state.logement.hauteur} m</strong></span>
      <input type="range" min="2.2" max="3.5" step="0.1" data-bind="logement.hauteur" data-type="number" data-live="#hauteur-val" data-unit=" m" value="${state.logement.hauteur}" />
    </label>

    <label class="field">
      <span>Code postal</span>
      <input type="text" inputmode="numeric" maxlength="5" pattern="\\d{5}" data-bind="logement.codePostal" data-rerender value="${state.logement.codePostal}" placeholder="ex. 24000" />
      <small class="hint">${zoneCode ? `Zone climatique détectée : <strong>${zoneCode}</strong>` : "Détermine votre zone climatique."}</small>
    </label>
  `;
}

const UNITE_CONSO = { gaz: "kWh", fioul: "litres", propane: "kg" };
const PLACEHOLDER_CONSO = { gaz: "ex. 18000", fioul: "ex. 2000", propane: "ex. 1500" };
const PLACEHOLDER_FACTURE_ANNUELLE = { gaz: "ex. 1600", fioul: "ex. 2200", propane: "ex. 2400" };
const PLACEHOLDER_MENSUALITE = { gaz: "ex. 130", fioul: "ex. 185", propane: "ex. 200" };
const LABEL_ENERGIE = { gaz: "Gaz de ville", fioul: "Fioul", propane: "Propane (citerne)" };
const MODES_SAISIE_CONSO = [
  ["quantite", "Quantité", null], // libellé précis calculé selon l'énergie
  ["annuel", "Facture annuelle", "en €, abonnement inclus"],
  ["mensuel", "Mensualité", "en €, ce que je paye chaque mois"],
];

function stepChauffage() {
  const e = state.chauffage.energie;
  const m = state.estimation.methode;
  const unite = state.chauffage.consoUnite || "quantite";

  const modesOptions = MODES_SAISIE_CONSO.map(([v, titre, sous]) =>
    v === "quantite" ? [v, `En ${UNITE_CONSO[e]}`, "si je connais ma consommation exacte"] : [v, titre, sous]
  );

  let champLabel, placeholder, champHint;
  if (unite === "annuel") {
    champLabel = `Montant de votre facture annuelle de ${LABEL_ENERGIE[e].toLowerCase()} (€)`;
    placeholder = PLACEHOLDER_FACTURE_ANNUELLE[e];
    champHint = "💡 Montant total payé sur les 12 derniers mois, abonnement compris.";
  } else if (unite === "mensuel") {
    champLabel = `Mensualité payée pour ${LABEL_ENERGIE[e].toLowerCase()} (€/mois)`;
    placeholder = PLACEHOLDER_MENSUALITE[e];
    champHint = "💡 Nous multiplions par 12 pour estimer votre consommation annuelle.";
  } else {
    champLabel = `Consommation annuelle de ${LABEL_ENERGIE[e].toLowerCase()} (${UNITE_CONSO[e]})`;
    placeholder = PLACEHOLDER_CONSO[e];
    champHint = "💡 Elle figure sur votre facture annuelle — c'est la méthode la plus fiable.";
  }

  const blocConso = `
    <span class="field-label">Type / âge de la chaudière</span>
    ${optionCards("chaudiere", "chauffage.typeChaudiereKey", TYPES_CHAUDIERE, state.chauffage.typeChaudiereKey)}
    <span class="field-label">Comment connaissez-vous votre consommation&nbsp;?</span>
    ${optionCards("consoUnite", "chauffage.consoUnite", modesOptions, unite, { rerender: true })}
    <label class="field">
      <span>${champLabel}</span>
      <input type="number" min="0" step="${unite === "quantite" ? "10" : "1"}" inputmode="numeric" data-bind="chauffage.conso" value="${state.chauffage.conso}" placeholder="${placeholder}" />
      <small class="hint">${champHint}</small>
    </label>`;

  const blocLogement = `
    <span class="field-label">Année de construction</span>
    ${optionCards("epoque", "logement.epoqueKey", EPOQUES, state.logement.epoqueKey)}
    <span class="field-label">Travaux d'isolation déjà réalisés <em>(optionnel)</em></span>
    ${travauxCards(state.logement.travaux)}
    <small class="hint">Chaque poste amélioré réduit les déperditions estimées.</small>`;

  return `
    <fieldset class="field">
      <legend>Énergie actuelle</legend>
      <div class="segmented">
        <label><input type="radio" name="energie" data-bind="chauffage.energie" data-rerender value="gaz" ${e === "gaz" ? "checked" : ""}/> Gaz de ville</label>
        <label><input type="radio" name="energie" data-bind="chauffage.energie" data-rerender value="fioul" ${e === "fioul" ? "checked" : ""}/> Fioul</label>
        <label><input type="radio" name="energie" data-bind="chauffage.energie" data-rerender value="propane" ${e === "propane" ? "checked" : ""}/> Propane</label>
      </div>
    </fieldset>

    <span class="field-label">Comment souhaitez-vous estimer vos besoins&nbsp;?</span>
    ${optionCards("methode", "estimation.methode", METHODES, m, { rerender: true })}

    ${m === "conso" ? blocConso : blocLogement}
  `;
}

function stepBesoins() {
  const b = state.besoins;
  const ecsSub = b.avecEcs
    ? "La PAC assurera le chauffage <strong>et</strong> l'eau chaude ; votre consommation actuelle est donc répartie entre les deux usages."
    : "Chauffage seul : votre eau chaude est produite par un autre équipement (ballon électrique, etc.), la consommation saisie ne sert qu'au chauffage.";
  return `
    <span class="field-label">Type d'émetteurs</span>
    ${optionCards("emetteur", "besoins.emetteurKey", EMETTEURS, b.emetteurKey)}

    <span class="field-label">Eau chaude sanitaire</span>
    <label class="opt-card opt-card--check">
      <input type="checkbox" data-bind="besoins.avecEcs" data-rerender ${b.avecEcs ? "checked" : ""} />
      <span class="opt-card__body">
        <span class="opt-card__title">🚿 Mon chauffage produit aussi l'eau chaude sanitaire</span>
        <span class="opt-card__sub">${ecsSub}</span>
      </span>
    </label>

    <label class="field">
      <span>Nombre d'occupants : <strong id="occ-val">${b.nbOccupants}</strong></span>
      <input type="range" min="1" max="8" step="1" data-bind="besoins.nbOccupants" data-type="number" data-live="#occ-val" value="${b.nbOccupants}" />
      <small class="hint">${b.avecEcs ? "Sert à estimer le volume d'eau chaude." : "Sert à adapter les seuils d'aides à votre foyer."}</small>
    </label>
  `;
}

function stepPreResultat(results) {
  return `
    <p class="lead-in">Voici une première estimation, <strong>sans engagement</strong> :</p>
    ${renderPreResultat(results)}
    <p class="note">Débloquez le <strong>montant de vos aides</strong> et votre <strong>amortissement</strong> à l'étape suivante.</p>
  `;
}

function stepAides() {
  const a = state.aides;
  return `
    <p class="lead-in">Sélectionnez votre tranche de revenu — les seuils s'adaptent à votre foyer.</p>
    <fieldset class="field">
      <legend>Localisation</legend>
      <div class="segmented">
        <label><input type="radio" name="region" data-bind="aides.region" data-rerender value="hors_idf" ${a.region === "hors_idf" ? "checked" : ""}/> Hors Île-de-France</label>
        <label><input type="radio" name="region" data-bind="aides.region" data-rerender value="idf" ${a.region === "idf" ? "checked" : ""}/> Île-de-France</label>
      </div>
    </fieldset>

    <label class="field">
      <span>Personnes au foyer : <strong id="foyer-val">${a.nbPersonnes}</strong></span>
      <input type="range" min="1" max="8" step="1" data-bind="aides.nbPersonnes" data-type="number" data-live="#foyer-val" data-rerender value="${a.nbPersonnes}" />
    </label>

    <span class="field-label">Votre tranche de revenu fiscal de référence (RFR)</span>
    ${profilCards()}
    <small class="hint">Le RFR figure sur votre avis d'imposition. Choix indicatif, ajustable en rendez-vous.</small>
  `;
}

function stepLead(results) {
  if (state.leadSubmitted) {
    return `
      <div class="confirm">✅ Merci ${escapeHtml(state.lead.prenom)} ! Un conseiller Savelys vous recontactera.</div>
      ${renderResultatFinal(results)}
      <a class="btn btn--primary btn--block" href="https://www.savelys.fr" target="_blank" rel="noopener">Je prends rendez-vous</a>
      <p class="note">Devis gratuit et sans engagement.</p>
    `;
  }
  return `
    <div class="teaser">
      <p>Votre estimation est prête. Vos aides potentielles sur une base de
      <strong>${fmtEuroRange(results.prix.fourchette)}</strong> :</p>
      <div class="teaser__blur">Aides · Reste à charge · Amortissement</div>
    </div>
    ${renderLeadForm(state)}
  `;
}

/* --------------------------------------------------------- navigation --- */
function renderNav(step) {
  const back = step > 1 && !(step === 6 && state.leadSubmitted)
    ? `<button type="button" class="btn btn--ghost" data-nav="prev">← Précédent</button>`
    : `<span></span>`;
  let next = "";
  if (step < 4) next = `<button type="button" class="btn btn--primary" data-nav="next">Suivant →</button>`;
  else if (step === 4) next = `<button type="button" class="btn btn--primary" data-nav="next">Voir mes aides →</button>`;
  else if (step === 5) next = `<button type="button" class="btn btn--primary" data-nav="next">Voir mon résultat →</button>`;
  // step 6 : pas de "next" (le formulaire lead gère la soumission).
  return `<div class="nav">${back}${next}</div>`;
}

function renderStep() {
  const step = state.step;
  const meta = STEPS[step - 1];
  const needsResults = step === 4 || step === 6;
  const results = needsResults ? compute() : null;

  let body = "";
  if (step === 1) body = stepLogement();
  else if (step === 2) body = stepChauffage();
  else if (step === 3) body = stepBesoins();
  else if (step === 4) body = stepPreResultat(results);
  else if (step === 5) body = stepAides();
  else if (step === 6) body = stepLead(results);

  root.innerHTML = `
    ${renderProgress(step)}
    <section class="card step" aria-labelledby="step-title">
      <h2 id="step-title" class="step__title">${meta.titre}</h2>
      <p class="step__count">Étape ${step} sur ${TOTAL_STEPS}</p>
      ${body}
      ${renderNav(step)}
      <p id="step-error" class="note note--error" hidden></p>
    </section>
    <p class="datation">${renderDatation()}</p>
  `;

  if (!needsResults) root.querySelector("input, button")?.focus?.({ preventScroll: true });
  if (step === 6 && !state.leadSubmitted) wireLeadForm(results);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ----------------------------------------------------- liaison champs --- */
function setByPath(obj, path, value) {
  const parts = path.split(".");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
}

function coerce(t) {
  if (t.type === "checkbox") return t.checked;
  if (t.dataset.type === "bool") return t.value === "true";
  if (t.dataset.type === "number" || t.type === "number" || t.type === "range")
    return t.value === "" ? "" : Number(t.value);
  return t.value;
}

function onFieldEvent(e) {
  const t = e.target;
  if (!t.dataset || !t.dataset.bind) return;
  setByPath(state, t.dataset.bind, coerce(t));

  // Changer l'unité de saisie rend l'ancienne valeur ambiguë (ex. "18000" en
  // kWh vs en €) : on vide le champ pour éviter une conversion erronée.
  if (t.dataset.bind === "chauffage.consoUnite") state.chauffage.conso = "";

  // Le foyer (étape Aides) suit le nombre d'occupants saisi à l'étape Besoins
  // tant que l'utilisateur ne l'a pas ajusté séparément — sinon la valeur
  // « repartait à 3 » et n'était pas conservée d'une étape à l'autre.
  if (t.dataset.bind === "aides.nbPersonnes") state.aides.foyerTouched = true;
  if (t.dataset.bind === "besoins.nbOccupants" && !state.aides.foyerTouched) {
    state.aides.nbPersonnes = state.besoins.nbOccupants;
  }

  if (t.dataset.live) {
    const target = root.querySelector(t.dataset.live);
    if (target) target.textContent = `${t.value}${t.dataset.unit || ""}`;
  }
  // Re-render différé : évite de détacher le DOM en plein clic (blur d'un champ
  // texte → 'change' → re-render pendant que l'utilisateur clique sur « Suivant »).
  if (t.dataset.rerender !== undefined && e.type === "change") setTimeout(renderStep, 0);
}

function showStepError(msg) {
  const box = root.querySelector("#step-error");
  if (!box) return;
  box.textContent = msg;
  box.hidden = false;
}

function onNav(e) {
  const btn = e.target.closest("[data-nav]");
  if (!btn) return;
  const dir = btn.dataset.nav;
  if (dir === "prev") {
    state.step = Math.max(1, state.step - 1);
    renderStep();
    return;
  }
  const check = validateStep(state.step, state);
  if (!check.ok) return showStepError(check.message);
  state.step = Math.min(TOTAL_STEPS, state.step + 1);
  renderStep();
}

function wireLeadForm(results) {
  const form = root.querySelector("#lead-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const check = validateLead(state);
    const err = form.querySelector("#lead-error");
    if (!check.ok) {
      err.textContent = check.message;
      err.hidden = false;
      return;
    }
    err.hidden = true;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Envoi…";
    const payload = buildLeadPayload(state, results);
    await envoyerLead(payload);
    state.leadSubmitted = true;
    renderStep();
  });
}

/* -------------------------------------------------------- RGPD modal --- */
function wireRgpd() {
  document.addEventListener("click", (e) => {
    const open = e.target.closest('[data-open="rgpd"]');
    if (open) {
      e.preventDefault();
      document.getElementById("rgpd-modal")?.removeAttribute("hidden");
    }
    if (e.target.closest("[data-close-rgpd]")) {
      document.getElementById("rgpd-modal")?.setAttribute("hidden", "");
    }
  });
}

/* ---------------------------------------------------------- utils/boot --- */
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const root = document.getElementById("tunnel");
root.addEventListener("input", onFieldEvent);
root.addEventListener("change", onFieldEvent);
root.addEventListener("click", onNav);
wireRgpd();
renderStep();

// PWA : enregistrement du service worker (sans bloquer si indisponible).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
