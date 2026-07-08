/**
 * Moteur 3 — Estimation prix (fourchette indicative, non contractuelle).
 *
 * Modèle de l'étude de prix 2026 : prix moyen national du matériel PAC air/eau Duo
 * + accessoires + main-d'œuvre de pose régionalisée, additionnés en HT puis TVA 5,5 %.
 * La fourchette client = somme des bornes basses → somme des bornes hautes.
 *
 * La puissance retenue pour le tarif est la puissance COMMERCIALE (nominale) de
 * chauffage, qui intègre déjà le déclassement au froid (Moteur 2) — une PAC plus
 * puissante (zone froide) coûte donc plus cher, comme sur le terrain.
 */

import { PRIX_ETUDE } from "../constants.js";

/**
 * @param {{ puissanceKW:number, emetteurKey:string, idf?:boolean }} input
 *   puissanceKW : puissance commerciale de chauffage (6/8/11/14/16) issue du Moteur 2.
 * @returns {{ prixCentral:number, fourchette:[number,number], puissanceKW:number }}
 */
export function estimerPrix({ puissanceKW, emetteurKey, idf = false }) {
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
