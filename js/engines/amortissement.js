/**
 * Moteur 4 — Amortissement (logique reprise de PacCloser).
 *
 * Compare le coût énergétique actuel (gaz/fioul) au coût futur avec la PAC (via SCOP
 * dépendant de l'émetteur), en déduit l'économie annuelle, le reste à charge après
 * aides, le temps d'amortissement et une projection cumulée sur 10 ans.
 */

import {
  PRIX_GAZ_CHAUFFAGE,
  PRIX_FIOUL_LITRE,
  PRIX_ELEC,
  SCOP,
  PROJECTION_ANNEES,
} from "../constants.js";

/** Coût annuel de l'énergie actuelle à partir de la conso réelle saisie. */
export function coutEnergieActuelle(energie, conso) {
  const v = Number(conso) || 0;
  // gaz : conso en kWh ; fioul : conso en litres.
  return energie === "fioul" ? v * PRIX_FIOUL_LITRE : v * PRIX_GAZ_CHAUFFAGE;
}

/**
 * @param {{
 *   eChaufKwh:number, eEcsKwh:number, emetteurKey:string,
 *   energieActuelle:"gaz"|"fioul", consoReelle:number,
 *   prixCentral:number, aidesTotales:number
 * }} input
 */
export function calculerAmortissement({
  eChaufKwh,
  eEcsKwh,
  emetteurKey,
  energieActuelle,
  consoReelle,
  prixCentral,
  aidesTotales,
}) {
  const besoinUtileTotal = (Number(eChaufKwh) || 0) + (Number(eEcsKwh) || 0); // kWh utiles
  const scop = SCOP[emetteurKey] ?? SCOP.radiateurs_BT;

  const consoPacElec = scop > 0 ? besoinUtileTotal / scop : 0; // kWh élec
  const coutFutur = consoPacElec * PRIX_ELEC;
  const coutActuel = coutEnergieActuelle(energieActuelle, consoReelle);
  const economieAn = coutActuel - coutFutur;

  const resteACharge = Math.max((Number(prixCentral) || 0) - (Number(aidesTotales) || 0), 0);
  const amortissementAns = economieAn > 0 ? resteACharge / economieAn : null;

  // Projection cumulée : chaque année, économie qui vient réduire le reste à charge net.
  const projection = [];
  let cumul = -resteACharge;
  for (let annee = 1; annee <= PROJECTION_ANNEES; annee++) {
    cumul += economieAn;
    projection.push({ annee, cumul: Math.round(cumul) });
  }

  return {
    scop,
    consoPacElec,
    coutActuel,
    coutFutur,
    economieAn,
    resteACharge,
    amortissementAns,
    projection,
  };
}
