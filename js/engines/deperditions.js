/**
 * Moteur 1 — Déperditions / besoin thermique.
 *
 * Voie A = méthode « garde-fou » PacCloser (DJU), reprise fidèlement (étapes 1→10) :
 * consommation annuelle → séparation ECS → correction PCS/PCI (gaz) → rendement
 * chaudière → correction appoint bois → setback nocturne → puissance de déperdition
 * à la température extérieure de base.
 * Voie B = secours par ratio surface (cahier) quand aucune conso n'est disponible.
 * Si A et B disponibles → on retient A ; croisement < 15 % cohérent, 15–30 % à vérifier,
 * > 30 % incohérence probable.
 *
 * Fonction PURE : aucune dépendance au DOM.
 */

import {
  PCI_FIOUL,
  RATIOS_W_M2_RANGE,
  POIDS_ISOLATION,
  T_INT,
  rendementChaudiere,
  PCS_PCI_RATIO,
  CORRECTION_PCI_GAZ_DEFAUT,
  ECART_AB_ALERTE,
} from "../constants.js";

/**
 * Ratio de déperdition (W/m²) pour une époque, glissé dans sa fourchette [bas,haut]
 * selon les travaux d'isolation déclarés. Aucun travaux → haut (pire cas) ;
 * tous les postes → bas. `travaux` = { fenetres, murs, toiture_combles, plancher_bas }.
 */
export function ratioIsolation(epoqueKey, travaux = {}) {
  const range = RATIOS_W_M2_RANGE[epoqueKey];
  if (!range) return 0;
  const [bas, haut] = range;
  let part = 0;
  for (const poste in POIDS_ISOLATION) {
    if (travaux[poste]) part += POIDS_ISOLATION[poste];
  }
  part = Math.min(1, part);
  return haut - (haut - bas) * part;
}

/** Consommation saisie convertie en kWh d'énergie achetée (kwhBase). */
export function consoEnKwh(energie, conso) {
  const v = Number(conso) || 0;
  return energie === "fioul" ? v * PCI_FIOUL : v; // fioul en litres, gaz déjà en kWh
}

/** Ratio de correction régime nocturne (setback). ≤ 1 → gonfle la déperdition. */
export function setbackRatio({ heuresNuit = 0, tempJour, tempNuit } = {}, deltaT) {
  const dSetback = Math.max(0, (Number(tempJour) || 0) - (Number(tempNuit) || 0));
  if (heuresNuit > 0 && dSetback > 0 && deltaT > 0) {
    return Math.max(0.5, 1 - (heuresNuit * dSetback) / (24 * deltaT));
  }
  return 1;
}

/**
 * Voie A — garde-fou PacCloser par la facture.
 * @returns {{ pDeperditionKW:number, usefulHeatKwh:number, eEcsUtileKwh:number,
 *             heatDemandRawKwh:number }}
 */
export function deperditionsVoieA({
  energie, // "gaz" | "fioul"
  conso, // kWh (gaz) ou litres (fioul)
  typeChaudiereKey, // "condensation" | "standard" | "ancienne"
  ecsUtileKwh = 0, // énergie utile ECS estimée (kWh/an), 0 si non couverte
  dju,
  tExtBase,
  tInt = T_INT,
  appointPct = 0, // part du besoin couverte par un appoint bois (0 = aucun)
  correctionPci = CORRECTION_PCI_GAZ_DEFAUT,
  setback = null, // { heuresNuit, tempJour, tempNuit }
}) {
  // Étape 1 — conso en kWh achetés.
  const kwhBase = consoEnKwh(energie, conso);

  // Étape 4 — rendement chaudière (type × combustible).
  const currentEff = rendementChaudiere(typeChaudiereKey, energie);

  // Étape 3 — correction PCS→PCI (gaz uniquement).
  const convPCI = energie === "gaz" && correctionPci ? PCS_PCI_RATIO : 1;

  // Étape 2 — ECS en énergie ACHETÉE (fuel), plafonnée à la conso totale.
  const ecsKwhFuel = Math.min(currentEff > 0 ? ecsUtileKwh / currentEff : 0, kwhBase);
  const kwhChauffage = Math.max(0, kwhBase - ecsKwhFuel);

  // Étape 5 — chaleur utile mesurée (avant correction appoint).
  const heatDemandRawKwh = kwhChauffage * convPCI * currentEff;

  // Étape 6 — correction appoint bois / cheminée.
  const appointActive = appointPct > 0 && appointPct < 1;
  const kwhTotalNoWood = appointActive
    ? kwhChauffage / (1 - appointPct) + ecsKwhFuel
    : kwhBase;

  // Étape 7 — chaleur utile finale servant au dimensionnement.
  const kwhChauffageSizing = Math.max(0, kwhTotalNoWood - ecsKwhFuel);
  const usefulHeatKwh = kwhChauffageSizing * convPCI * currentEff;

  // Étapes 8–10 — climat, setback, puissance de déperdition.
  const deltaT = tInt - tExtBase;
  const ratio = setbackRatio(setback || {}, deltaT);
  const pDeperditionKW =
    deltaT > 0 ? (usefulHeatKwh * deltaT) / (dju * 24) / ratio : 0;

  return {
    pDeperditionKW,
    usefulHeatKwh,
    eEcsUtileKwh: ecsUtileKwh,
    heatDemandRawKwh,
  };
}

/**
 * Voie B — secours par ratio surface.
 * On dérive aussi un besoin de chauffage annuel (kWh utiles) à partir des DJU,
 * pour que le Moteur 4 (amortissement) dispose d'une énergie même sans facture.
 */
export function deperditionsVoieB({
  surface,
  epoqueKey,
  travaux = {},
  ecsUtileKwh = 0,
  dju,
  tExtBase,
  tInt = T_INT,
}) {
  const ratio = ratioIsolation(epoqueKey, travaux); // W/m², glissé selon les travaux
  const pDeperditionKW = ((Number(surface) || 0) * ratio) / 1000;

  const deltaT = tInt - tExtBase;
  // Inverse de la formule PacCloser : usefulHeat = P × DJU × 24 / ΔT.
  const usefulHeatKwh = deltaT > 0 ? (pDeperditionKW * dju * 24) / deltaT : 0;

  return { pDeperditionKW, usefulHeatKwh, eEcsUtileKwh: ecsUtileKwh, ratio };
}

/** Niveau de cohérence du croisement A/B (seuils PacCloser). */
function coherenceLabel(ecart) {
  if (ecart == null) return null;
  if (ecart < 0.15) return "coherent";
  if (ecart <= ECART_AB_ALERTE) return "a_verifier";
  return "incoherent";
}

/**
 * Point d'entrée du moteur : choisit et croise les voies.
 * @returns {{
 *   pDeperditionKW:number, methode:"A"|"B", ecartAB:number|null, coherence:string|null,
 *   avertissement:boolean, eChaufKwh:number, eEcsKwh:number,
 *   voieA:object|null, voieB:object|null
 * }}
 */
export function calculerDeperditions(input) {
  const hasConso = Number(input.conso) > 0 && !!input.typeChaudiereKey;
  const hasSurface = Number(input.surface) > 0 && !!input.epoqueKey;

  const voieB = hasSurface ? deperditionsVoieB(input) : null;
  const voieA = hasConso ? deperditionsVoieA(input) : null;

  if (voieA && voieB) {
    const a = voieA.pDeperditionKW;
    const b = voieB.pDeperditionKW;
    const ecartAB = a > 0 ? Math.abs(a - b) / a : null;
    return {
      pDeperditionKW: a, // on retient A
      methode: "A",
      ecartAB,
      coherence: coherenceLabel(ecartAB),
      avertissement: ecartAB != null && ecartAB > ECART_AB_ALERTE,
      eChaufKwh: voieA.usefulHeatKwh,
      eEcsKwh: voieA.eEcsUtileKwh,
      voieA,
      voieB,
    };
  }

  if (voieA) {
    return {
      pDeperditionKW: voieA.pDeperditionKW,
      methode: "A",
      ecartAB: null,
      coherence: null,
      avertissement: false,
      eChaufKwh: voieA.usefulHeatKwh,
      eEcsKwh: voieA.eEcsUtileKwh,
      voieA,
      voieB: null,
    };
  }

  if (voieB) {
    return {
      pDeperditionKW: voieB.pDeperditionKW,
      methode: "B",
      ecartAB: null,
      coherence: null,
      avertissement: false,
      eChaufKwh: voieB.usefulHeatKwh,
      eEcsKwh: voieB.eEcsUtileKwh,
      voieA: null,
      voieB,
    };
  }

  return {
    pDeperditionKW: 0,
    methode: "B",
    ecartAB: null,
    coherence: null,
    avertissement: false,
    eChaufKwh: 0,
    eEcsKwh: 0,
    voieA: null,
    voieB: null,
  };
}
