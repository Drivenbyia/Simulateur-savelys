/**
 * app.js — orchestration du simulateur PAC Savelys.
 * Câble : constants + data + engines (calcul) → ui (rendu/tunnel/lead).
 * Aucun build : chargé en <script type="module"> par index.html.
 */

import { rendementChaudiere, PCI_FIOUL, T_INT, E_ECS_UTILE } from "./constants.js";
import { getZone, CLIMAT_DEFAUT, zoneCoarse } from "./data/climate.js";
import { getZoneFromPostal } from "./data/postal-zones.js";
import { calculerDeperditions } from "./engines/deperditions.js";
import { dimensionnerPAC } from "./engines/dimensionnement.js";
import { estimerPrix } from "./engines/prix.js";
import { calculerAides } from "./engines/aides.js";
import { calculerAmortissement } from "./engines/amortissement.js";
import { STEPS, TOTAL_STEPS, renderProgress, validateStep } from "./ui/tunnel.js";
import {
  renderPreResultat,
  renderResultatFinal,
  renderDatation,
  fmtEuroRange,
} from "./ui/render.js";
import { renderLeadForm, validateLead, buildLeadPayload, envoyerLead } from "./ui/lead.js";

/* ------------------------------------------------------------------ état --- */
const state = {
  step: 1,
  leadSubmitted: false,
  logement: { type: "maison", surface: 100, codePostal: "", epoqueKey: "de_1975_2000" },
  chauffage: { energie: "gaz", typeChaudiereKey: "standard", conso: "" },
  besoins: { avecEcs: true, emetteurKey: "radiateurs_BT", nbOccupants: 3 },
  aides: { region: "hors_idf", nbPersonnes: 3, rfr: "" },
  lead: { prenom: "", nom: "", canal: "email", email: "", tel: "", codePostal: "", consent: false },
};

// Type / âge de la chaudière (méthode PacCloser : rendement croisé type × combustible).
const TYPES_CHAUDIERE = [
  ["condensation", "Condensation (moins de 10 ans)"],
  ["standard", "Standard (10 à 20 ans)"],
  ["ancienne", "Ancienne (plus de 20 ans)"],
];

const EPOQUES = [
  ["avant_1975", "Avant 1975 (non isolé)"],
  ["de_1975_2000", "1975 – 2000 (isolation partielle)"],
  ["rt2005", "2000 – 2012 (RT2005)"],
  ["rt2012", "Après 2012 (RT2012 et +)"],
];

const EMETTEURS = [
  ["plancher_BT", "Plancher chauffant"],
  ["radiateurs_BT", "Radiateurs basse température"],
  ["radiateurs_fonte_HT", "Radiateurs fonte (haute température)"],
];

/* ------------------------------------------------------- normalisation --- */
function normalize() {
  if (!state.aides.rfr && state.aides.nbPersonnes == null) state.aides.nbPersonnes = state.besoins.nbOccupants;
}

/* ------------------------------------------------------------- calcul --- */
function compute() {
  normalize();
  const zoneCode = getZoneFromPostal(state.logement.codePostal);
  const zone = zoneCode ? getZone(zoneCode) : CLIMAT_DEFAUT;
  const ecsUtileKwh = state.besoins.avecEcs ? E_ECS_UTILE(state.besoins.nbOccupants) : 0;

  const dep = calculerDeperditions({
    energie: state.chauffage.energie,
    conso: state.chauffage.conso,
    typeChaudiereKey: state.chauffage.typeChaudiereKey,
    ecsUtileKwh,
    surface: state.logement.surface,
    epoqueKey: state.logement.epoqueKey,
    dju: zone.dju,
    tExtBase: zone.tExtBase,
    tInt: T_INT,
  });

  const dim = dimensionnerPAC(dep.pDeperditionKW);
  const prix = estimerPrix({
    pPacKW: dim.pPacKW,
    avecEcs: state.besoins.avecEcs,
    emetteurKey: state.besoins.emetteurKey,
  });

  const aides = calculerAides({
    rfr: state.aides.rfr,
    nbPersonnes: state.aides.nbPersonnes,
    region: state.aides.region,
    energieActuelle: state.chauffage.energie,
    prixCentral: prix.prixCentral,
    zone: zoneCoarse(zoneCode), // grille CEE en zones grossières H1/H2/H3
    surface: state.logement.surface,
  });

  // Conso réelle pour l'amortissement : la facture si dispo, sinon estimée.
  let consoReelle = Number(state.chauffage.conso) || 0;
  if (!(consoReelle > 0)) {
    const rendement = rendementChaudiere(state.chauffage.typeChaudiereKey, state.chauffage.energie);
    const finaleKwh = (dep.eChaufKwh + dep.eEcsKwh) / rendement;
    consoReelle = state.chauffage.energie === "fioul" ? finaleKwh / PCI_FIOUL : finaleKwh;
  }

  const amort = calculerAmortissement({
    eChaufKwh: dep.eChaufKwh,
    eEcsKwh: dep.eEcsKwh,
    emetteurKey: state.besoins.emetteurKey,
    energieActuelle: state.chauffage.energie,
    consoReelle,
    prixCentral: prix.prixCentral,
    aidesTotales: aides.aidesTotales,
  });

  return { zone, zoneCode, dep, dim, prix, aides, amort };
}

/* ---------------------------------------------------------- templates --- */
const opt = (list, sel) =>
  list.map(([v, l]) => `<option value="${v}" ${v === sel ? "selected" : ""}>${l}</option>`).join("");

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
      <span>Code postal</span>
      <input type="text" inputmode="numeric" maxlength="5" pattern="\\d{5}" data-bind="logement.codePostal" data-rerender value="${state.logement.codePostal}" placeholder="ex. 24000" />
      <small class="hint">${zoneCode ? `Zone climatique détectée : <strong>${zoneCode}</strong>` : "Détermine votre zone climatique."}</small>
    </label>

    <label class="field">
      <span>Année de construction / isolation</span>
      <select data-bind="logement.epoqueKey">${opt(EPOQUES, state.logement.epoqueKey)}</select>
    </label>
  `;
}

function stepChauffage() {
  const e = state.chauffage.energie;
  const consoLabel = e === "fioul" ? "Consommation annuelle de fioul (litres)" : "Consommation annuelle de gaz (kWh)";
  return `
    <fieldset class="field">
      <legend>Énergie actuelle</legend>
      <div class="segmented">
        <label><input type="radio" name="energie" data-bind="chauffage.energie" data-rerender value="gaz" ${e === "gaz" ? "checked" : ""}/> Gaz</label>
        <label><input type="radio" name="energie" data-bind="chauffage.energie" data-rerender value="fioul" ${e === "fioul" ? "checked" : ""}/> Fioul</label>
      </div>
    </fieldset>

    <label class="field">
      <span>Type / âge de la chaudière</span>
      <select data-bind="chauffage.typeChaudiereKey">${opt(TYPES_CHAUDIERE, state.chauffage.typeChaudiereKey)}</select>
    </label>

    <label class="field">
      <span>${consoLabel} <em>(optionnel)</em></span>
      <input type="number" min="0" step="100" data-bind="chauffage.conso" value="${state.chauffage.conso}" placeholder="ex. 18000" />
      <small class="hint">💡 Renseignez votre conso pour une estimation plus précise — elle figure sur votre facture.</small>
    </label>
  `;
}

function stepBesoins() {
  const b = state.besoins;
  return `
    <fieldset class="field">
      <legend>Que doit couvrir la pompe à chaleur&nbsp;?</legend>
      <div class="segmented">
        <label><input type="radio" name="ecs" data-bind="besoins.avecEcs" data-type="bool" value="false" ${!b.avecEcs ? "checked" : ""}/> Chauffage seul</label>
        <label><input type="radio" name="ecs" data-bind="besoins.avecEcs" data-type="bool" value="true" ${b.avecEcs ? "checked" : ""}/> Chauffage + eau chaude</label>
      </div>
    </fieldset>

    <label class="field">
      <span>Type d'émetteurs</span>
      <select data-bind="besoins.emetteurKey">${opt(EMETTEURS, b.emetteurKey)}</select>
    </label>

    <label class="field">
      <span>Nombre d'occupants : <strong id="occ-val">${b.nbOccupants}</strong></span>
      <input type="range" min="1" max="8" step="1" data-bind="besoins.nbOccupants" data-type="number" data-live="#occ-val" value="${b.nbOccupants}" />
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
    <p class="lead-in">Estimez vos aides (MaPrimeRénov', CEE, bonus fioul).</p>
    <label class="field">
      <span>Localisation</span>
      <select data-bind="aides.region">
        <option value="hors_idf" ${a.region === "hors_idf" ? "selected" : ""}>Hors Île-de-France</option>
        <option value="idf" ${a.region === "idf" ? "selected" : ""}>Île-de-France</option>
      </select>
    </label>
    <label class="field">
      <span>Personnes au foyer : <strong id="foyer-val">${a.nbPersonnes}</strong></span>
      <input type="range" min="1" max="8" step="1" data-bind="aides.nbPersonnes" data-type="number" data-live="#foyer-val" value="${a.nbPersonnes}" />
    </label>
    <label class="field">
      <span>Revenu fiscal de référence (€)</span>
      <input type="number" min="0" step="100" data-bind="aides.rfr" value="${a.rfr}" placeholder="ex. 28000" />
      <small class="hint">Ligne « Revenu fiscal de référence » de votre dernier avis d'imposition.</small>
    </label>
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
  normalize();
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

  // Focus premier champ pour l'accessibilité (hors étapes résultat).
  if (!needsResults) root.querySelector("input, select, button")?.focus?.({ preventScroll: true });
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

  if (t.dataset.live) {
    const target = root.querySelector(t.dataset.live);
    if (target) target.textContent = `${t.value}${t.dataset.unit || ""}`;
  }
  if (t.dataset.rerender && e.type === "change") renderStep();
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
