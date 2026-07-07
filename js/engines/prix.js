/**
 * Moteur 3 — Estimation prix (fourchette indicative, non contractuelle).
 *
 * Grille réelle Savelys : prix fonction de la puissance de déperdition (kW),
 * interpolée linéairement par morceaux entre les points connus, + supplément
 * fixe si chauffage + eau chaude sanitaire (ECS).
 * Fourchette affichée = prix central ± 8 %.
 */

import {
  PRIX_PAR_DEPERDITION,
  SUPPLEMENT_ECS,
  MAJORATION_POSE_IDF,
  PRIX_FOURCHETTE,
} from "../constants.js";

/**
 * Interpolation linéaire par morceaux sur une table de points {depKw, prix}
 * triée par depKw croissant. Clampe en dehors des bornes (retient la valeur
 * du point extrême le plus proche).
 */
export function interpolerPrix(depKw, points = PRIX_PAR_DEPERDITION) {
  const x = Number(depKw) || 0;
  if (x <= points[0].depKw) return points[0].prix;
  const last = points[points.length - 1];
  if (x >= last.depKw) return last.prix;

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (x >= a.depKw && x <= b.depKw) {
      const t = (x - a.depKw) / (b.depKw - a.depKw);
      return a.prix + t * (b.prix - a.prix);
    }
  }
  return last.prix;
}

/**
 * @param {{ pDeperditionKW:number, avecEcs:boolean, idf?:boolean }} input
 *   idf : logement en Île-de-France → majoration de pose (main-d'œuvre plus chère,
 *   étude 2026 : facteur ≥ 1,35 sur la main-d'œuvre francilienne).
 * @returns {{ prixCentral:number, fourchette:[number,number] }}
 */
export function estimerPrix({ pDeperditionKW, avecEcs, idf = false }) {
  const base = interpolerPrix(pDeperditionKW, PRIX_PAR_DEPERDITION);
  const prixCentral =
    base + (avecEcs ? SUPPLEMENT_ECS : 0) + (idf ? MAJORATION_POSE_IDF : 0);

  return {
    prixCentral,
    fourchette: [
      prixCentral * (1 - PRIX_FOURCHETTE),
      prixCentral * (1 + PRIX_FOURCHETTE),
    ],
  };
}
