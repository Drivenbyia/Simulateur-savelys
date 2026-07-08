/**
 * Moteur 2 — Dimensionnement PAC (déclassement au froid pris en compte).
 *
 * La puissance NOMINALE d'une PAC est donnée à +7°C. À la température de base de la
 * région, la PAC déclasse (ex. 6 kW nominale ≈ 4 kW à −5°C). Il faut donc une PAC
 * dont la capacité DÉCLASSÉE à la T° de base couvre la déperdition :
 *   nominal_requis = (déperdition × COEF_DIM) / facteur_capacité(T_base)
 * En dessous de 100 % de couverture, l'appoint électrique intégré couvre les pointes.
 *
 * Si la PAC assure l'ECS ("Duo"), on ajoute un supplément forfaitaire de puissance
 * selon la taille du foyer (étude 2026).
 */

import {
  COEF_DIM,
  PUISSANCES_COMMERCIALES,
  supplementEcsKw,
  facteurCapacitePAC,
} from "../constants.js";

/** Puissance commerciale la plus proche (arrondi au plus près, pas systématiquement au-dessus). */
export function nearestCommerciale(pkW) {
  const v = Number(pkW) || 0;
  return PUISSANCES_COMMERCIALES.reduce(
    (best, p) => (Math.abs(p - v) < Math.abs(best - v) ? p : best),
    PUISSANCES_COMMERCIALES[0]
  );
}

/** Ancienne API (arrondi au-dessus) — conservée pour compat. */
export function mapPuissanceCommerciale(pkW) {
  const sup = PUISSANCES_COMMERCIALES.find((p) => p >= pkW);
  return sup != null ? sup : PUISSANCES_COMMERCIALES[PUISSANCES_COMMERCIALES.length - 1];
}

/**
 * @param {number} pDeperditionKW
 * @param {{ avecEcs?:boolean, nbPersonnes?:number, tExtBase?:number, emetteurKey?:string }} [options]
 * @returns {{
 *   factor:number, pChauffageNominalKW:number, pPacKW:number,
 *   pCommercialeChauffageKW:number, pCommercialeKW:number, suppEcsKW:number
 * }}
 */
export function dimensionnerPAC(
  pDeperditionKW,
  { avecEcs = false, nbPersonnes = 0, tExtBase = -7, emetteurKey = "radiateurs_BT" } = {}
) {
  const factor = facteurCapacitePAC(tExtBase, emetteurKey);
  const pBesoinTbase = (Number(pDeperditionKW) || 0) * COEF_DIM; // kW à fournir à T_base
  const pChauffageNominalKW = factor > 0 ? pBesoinTbase / factor : pBesoinTbase; // nominal +7°C
  const suppEcsKW = avecEcs ? supplementEcsKw(nbPersonnes) : 0;
  const pPacKW = pChauffageNominalKW + suppEcsKW;

  // Prix : plus petite puissance dont la capacité déclassée couvre le CHAUFFAGE.
  const pCommercialeChauffageKW = mapPuissanceCommerciale(pChauffageNominalKW);
  // Affichage : on tient compte de l'ECS mais sans faire sauter un palier entier
  // pour un simple ballon (Duo à priorité ECS) → arrondi au plus proche, borné ≥ chauffage.
  const pCommercialeKW = Math.max(pCommercialeChauffageKW, nearestCommerciale(pPacKW));

  return { factor, pChauffageNominalKW, pPacKW, pCommercialeChauffageKW, pCommercialeKW, suppEcsKW };
}
