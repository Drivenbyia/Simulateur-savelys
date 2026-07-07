/**
 * Navigation du tunnel : métadonnées d'étapes, barre de progression et
 * validation des saisies avant de passer à l'étape suivante.
 */

import { getZoneFromPostal } from "../data/postal-zones.js";

export const STEPS = [
  { id: 1, key: "logement", titre: "Votre logement" },
  { id: 2, key: "chauffage", titre: "Votre chauffage actuel" },
  { id: 3, key: "besoins", titre: "Vos besoins" },
  { id: 4, key: "preresultat", titre: "Votre estimation" },
  { id: 5, key: "aides", titre: "Vos aides" },
  { id: 6, key: "lead", titre: "Votre résultat" },
];

export const TOTAL_STEPS = STEPS.length;

export function renderProgress(step) {
  const pct = Math.round((step / TOTAL_STEPS) * 100);
  const puces = STEPS.map(
    (s) => `<li class="${s.id < step ? "done" : s.id === step ? "current" : ""}">${s.id}</li>`
  ).join("");
  return `
    <div class="progress" role="progressbar" aria-valuemin="1" aria-valuemax="${TOTAL_STEPS}" aria-valuenow="${step}">
      <div class="progress__bar"><span style="width:${pct}%"></span></div>
      <ol class="progress__steps">${puces}</ol>
    </div>
  `;
}

/**
 * Valide une étape de saisie. @returns {{ok:boolean, message?:string}}
 * (Le formulaire lead a sa propre validation dans lead.js.)
 */
export function validateStep(step, state) {
  switch (step) {
    case 1: {
      const { surface, codePostal } = state.logement;
      if (!(Number(surface) > 0)) return { ok: false, message: "Indiquez la surface chauffée." };
      if (!getZoneFromPostal(codePostal))
        return { ok: false, message: "Indiquez un code postal valide (5 chiffres)." };
      return { ok: true };
    }
    case 2: {
      if (!state.chauffage.energie) return { ok: false, message: "Choisissez votre énergie actuelle." };
      if (state.estimation.methode === "conso") {
        if (!(Number(state.chauffage.conso) > 0))
          return { ok: false, message: "Indiquez votre consommation annuelle (ou estimez par le logement)." };
      } else if (!state.logement.epoqueKey) {
        return { ok: false, message: "Choisissez l'année de construction." };
      }
      return { ok: true };
    }
    case 3: {
      if (!state.besoins.emetteurKey) return { ok: false, message: "Choisissez votre type d'émetteurs." };
      if (!(Number(state.besoins.nbOccupants) > 0))
        return { ok: false, message: "Indiquez le nombre d'occupants." };
      return { ok: true };
    }
    case 5: {
      if (!(Number(state.aides.nbPersonnes) > 0))
        return { ok: false, message: "Indiquez le nombre de personnes au foyer." };
      if (!state.aides.profil)
        return { ok: false, message: "Sélectionnez votre tranche de revenu." };
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}
