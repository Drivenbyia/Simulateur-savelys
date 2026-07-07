/**
 * Moteur 3 — Estimation prix (fourchette indicative, non contractuelle).
 *
 * Logique : plus de puissance → prix plus haut ; radiateurs fonte (haute
 * température) → PAC HT plus chère → haut de fourchette.
 * Fourchette affichée = prix central ± 8 %.
 */

import {
  PRIX_BASE,
  PRIX_P_MIN,
  PRIX_P_MAX,
  W_PUISS,
  W_EMET,
  EMETTEUR_FACTOR,
  PRIX_FOURCHETTE,
} from "../constants.js";

function clamp(x, min, max) {
  return Math.min(Math.max(x, min), max);
}

/**
 * @param {{ pPacKW:number, avecEcs:boolean, emetteurKey:string }} input
 * @returns {{ prixCentral:number, fourchette:[number,number], position:number }}
 */
export function estimerPrix({ pPacKW, avecEcs, emetteurKey }) {
  const base = avecEcs ? PRIX_BASE.avec_ecs : PRIX_BASE.sans_ecs;

  const puissNorm = clamp(
    ((Number(pPacKW) || 0) - PRIX_P_MIN) / (PRIX_P_MAX - PRIX_P_MIN),
    0,
    1
  );
  const emetteurFactor = EMETTEUR_FACTOR[emetteurKey] ?? 0.4;

  const position = W_PUISS * puissNorm + W_EMET * emetteurFactor;
  const prixCentral = base.low + position * (base.high - base.low);

  return {
    prixCentral,
    fourchette: [
      prixCentral * (1 - PRIX_FOURCHETTE),
      prixCentral * (1 + PRIX_FOURCHETTE),
    ],
    position,
  };
}
