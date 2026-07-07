/**
 * Moteur 2 — Dimensionnement PAC.
 *
 * P_PAC = P_deperdition × COEF_DIM (défaut 0.90). En dessous de 100 %, l'appoint
 * électrique intégré couvre les pointes de grand froid (évite le surdimensionnement,
 * qui ferait cycler le compresseur et chuter l'efficacité de 15–25 %).
 *
 * Si la PAC assure aussi l'ECS ("Duo", ballon à > 50 °C), l'étude 2026 impose un
 * supplément forfaitaire de puissance selon la taille du foyer (+1 à +2,75 kW).
 * On mappe ensuite sur une puissance commerciale proche pour l'affichage.
 */

import { COEF_DIM, PUISSANCES_COMMERCIALES, supplementEcsKw } from "../constants.js";

/** Puissance commerciale la plus proche >= besoin (sinon la plus grande dispo). */
export function mapPuissanceCommerciale(pkW) {
  const sup = PUISSANCES_COMMERCIALES.find((p) => p >= pkW);
  return sup != null ? sup : PUISSANCES_COMMERCIALES[PUISSANCES_COMMERCIALES.length - 1];
}

/**
 * @param {number} pDeperditionKW
 * @param {{ avecEcs?:boolean, nbPersonnes?:number }} [options]
 * @returns {{ pPacKW:number, pCommercialeKW:number, suppEcsKW:number }}
 */
export function dimensionnerPAC(pDeperditionKW, { avecEcs = false, nbPersonnes = 0 } = {}) {
  const suppEcsKW = avecEcs ? supplementEcsKw(nbPersonnes) : 0;
  const pPacKW = (Number(pDeperditionKW) || 0) * COEF_DIM + suppEcsKW;
  return {
    pPacKW,
    pCommercialeKW: mapPuissanceCommerciale(pPacKW),
    suppEcsKW,
  };
}
