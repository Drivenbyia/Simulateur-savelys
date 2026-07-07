/**
 * Moteur 2 — Dimensionnement PAC.
 *
 * P_PAC = P_deperdition × COEF_DIM (défaut 0.90). En dessous de 100 %, l'appoint
 * électrique intégré couvre les pointes de grand froid (évite le surdimensionnement).
 * On mappe ensuite sur une puissance commerciale proche pour l'affichage.
 *
 * L'ECS n'influe pas sur le pic de puissance (dimensionné sur le chauffage) —
 * elle est gérée au Moteur 3 (prix / ballon).
 */

import { COEF_DIM, PUISSANCES_COMMERCIALES } from "../constants.js";

/** Puissance commerciale la plus proche >= besoin (sinon la plus grande dispo). */
export function mapPuissanceCommerciale(pkW) {
  const sup = PUISSANCES_COMMERCIALES.find((p) => p >= pkW);
  return sup != null ? sup : PUISSANCES_COMMERCIALES[PUISSANCES_COMMERCIALES.length - 1];
}

/**
 * @param {number} pDeperditionKW
 * @returns {{ pPacKW:number, pCommercialeKW:number }}
 */
export function dimensionnerPAC(pDeperditionKW) {
  const pPacKW = (Number(pDeperditionKW) || 0) * COEF_DIM;
  return {
    pPacKW,
    pCommercialeKW: mapPuissanceCommerciale(pPacKW),
  };
}
