/**
 * Moteur 3 — Estimation prix (fourchette indicative, non contractuelle).
 *
 * Modèle de l'étude de prix 2026 (plus fiable qu'un forfait) : prix moyen national
 * du matériel PAC air/eau Duo + accessoires + main-d'œuvre de pose régionalisée,
 * additionnés en HT puis TVA 5,5 %. La fourchette client = somme des bornes
 * basses → somme des bornes hautes de chaque poste.
 */

import { PRIX_ETUDE, COEF_DIM, PUISSANCES_COMMERCIALES } from "../constants.js";

/** Puissance commerciale (kW) retenue pour le CHAUFFAGE à partir de la déperdition. */
export function puissanceCommercialeChauffage(pDeperditionKW) {
  const p = (Number(pDeperditionKW) || 0) * COEF_DIM;
  return PUISSANCES_COMMERCIALES.find((x) => x >= p) ?? PUISSANCES_COMMERCIALES.at(-1);
}

/**
 * @param {{ pDeperditionKW:number, emetteurKey:string, idf?:boolean }} input
 * @returns {{ prixCentral:number, fourchette:[number,number], puissanceKW:number }}
 */
export function estimerPrix({ pDeperditionKW, emetteurKey, idf = false }) {
  const puissanceKW = puissanceCommercialeChauffage(pDeperditionKW);
  const mat = PRIX_ETUDE.materiel[puissanceKW] || PRIX_ETUDE.materiel[11];
  const classe = emetteurKey === "radiateurs_fonte_HT" ? "ht" : "bt";
  const materiel = mat[classe];
  const pose = idf ? PRIX_ETUDE.poseIdf : PRIX_ETUDE.poseProvince;
  const acc = PRIX_ETUDE.accessoires;

  // Somme HT bornes basses / hautes, puis TVA 5,5 %.
  const htBas = materiel[0] + acc[0] + pose[0];
  const htHaut = materiel[1] + acc[1] + pose[1];
  const fourchette = [htBas * PRIX_ETUDE.tva, htHaut * PRIX_ETUDE.tva];
  const prixCentral = (fourchette[0] + fourchette[1]) / 2;

  return { prixCentral, fourchette, puissanceKW };
}
