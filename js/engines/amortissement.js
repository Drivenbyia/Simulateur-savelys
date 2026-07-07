/**
 * Moteur 4 — Économies & amortissement (méthode PacCloser, reprise fidèlement).
 *
 * Comparaison « TOUT COMPRIS » des deux scénarios, jamais l'énergie brute seule :
 *   avant : facture énergie (conso × prix + abonnement) + entretien chaudière
 *   après : élec PAC (chauffage/SCOP + ECS/COP_ECS) + surcoût abonnement + entretien PAC
 * L'ECS est toujours isolée du chauffage (COP_ECS = 2,5, eau ~55 °C, moins favorable
 * que le SCOP chauffage). Projection 10 ans avec inflation par énergie, provision de
 * pannes croissante avec l'âge de la chaudière et remplacement forcé à 20 ans.
 */

import {
  ENERGIES,
  PCI_FIOUL,
  PRIX_ELEC,
  ELEC_INFLATION,
  ELEC_ABO_SUPP,
  COP_ECS,
  ENTRETIEN_PAC,
  ENTRETIEN_CHAUDIERE,
  PRIX_FIOUL_NORMALISE_LITRE,
  DUREE_VIE_CHAUDIERE,
  AGE_CHAUDIERE,
  provisionPannes,
  SCOP,
  PCS_PCI_RATIO,
  CORRECTION_PCI_GAZ_DEFAUT,
  PROJECTION_ANNEES,
} from "../constants.js";

/** Coût annuel de l'énergie actuelle (énergie seule + abonnement). */
export function coutEnergieActuelle(energie, conso) {
  const e = ENERGIES[energie] || ENERGIES.gaz;
  const kwh = energie === "fioul" ? (Number(conso) || 0) * PCI_FIOUL : Number(conso) || 0;
  return kwh * e.prixKwh + e.abonnement;
}

/**
 * @param {{
 *   eChaufKwh:number, eEcsKwh:number, emetteurKey:string,
 *   energieActuelle:"gaz"|"fioul", consoReelle:number, typeChaudiereKey:string,
 *   avecEcs:boolean, prixCentral:number, aidesTotales:number
 * }} input
 *   eChaufKwh / eEcsKwh : chaleur UTILE annuelle (chauffage / ECS), en kWh.
 *   consoReelle : conso achetée (kWh gaz ou litres fioul) — facture si connue,
 *   sinon reconstituée par l'appelant.
 */
export function calculerAmortissement({
  eChaufKwh,
  eEcsKwh,
  emetteurKey,
  energieActuelle,
  consoReelle,
  typeChaudiereKey = "standard",
  avecEcs = true,
  prixCentral,
  aidesTotales,
}) {
  const energie = ENERGIES[energieActuelle] || ENERGIES.gaz;
  const scop = SCOP[emetteurKey] ?? SCOP.radiateurs_BT;
  const heatDemand = Number(eChaufKwh) || 0; // kWh utiles chauffage
  const ecsUseful = avecEcs ? Number(eEcsKwh) || 0 : 0;

  // --- Scénario "rester sur l'énergie actuelle" : facture tout compris (billEff).
  const billEff = coutEnergieActuelle(energieActuelle, consoReelle);

  // --- Scénario PAC : chauffage au SCOP, ECS au COP_ECS, + surcoût d'abonnement.
  const consoPacElec = scop > 0 ? heatDemand / scop + ecsUseful / COP_ECS : 0;
  const pacAnnualCost = consoPacElec * PRIX_ELEC + ELEC_ABO_SUPP;

  // --- Économie annuelle "tout compris" (énergie + entretien des deux côtés).
  const economieAn = billEff + ENTRETIEN_CHAUDIERE - (pacAnnualCost + ENTRETIEN_PAC);

  // --- Reste à charge et délai de retour.
  const resteACharge = Math.max((Number(prixCentral) || 0) - (Number(aidesTotales) || 0), 0);
  const amortissementAns = economieAn > 0 ? resteACharge / economieAn : null;

  // --- Vieillissement de la chaudière actuelle (provision pannes + fin de vie).
  const age = AGE_CHAUDIERE[typeChaudiereKey] ?? AGE_CHAUDIERE.standard;
  const restant = DUREE_VIE_CHAUDIERE - age;
  const anRemplacement = restant <= 0 ? 1 : restant <= PROJECTION_ANNEES ? restant : null;

  // Facture annuelle avec une chaudière NEUVE (même énergie) — sert après le
  // remplacement forcé. Reconstitution de la conso achetée depuis la chaleur utile.
  const convPCI =
    energieActuelle === "gaz" && CORRECTION_PCI_GAZ_DEFAUT ? PCS_PCI_RATIO : 1;
  const newBillAnnual =
    ((heatDemand + ecsUseful) / energie.rendementNeuf / convPCI) * energie.prixKwh +
    energie.abonnement;

  // --- Projection 10 ans : coût CUMULÉ de chaque scénario (PacCloser §13).
  const projection = [];
  let cumActuel = 0;
  let cumPac = resteACharge; // l'investissement initial part du reste à charge
  for (let annee = 1; annee <= PROJECTION_ANNEES; annee++) {
    const infl = (1 + energie.inflation) ** (annee - 1);
    const inflElec = (1 + ELEC_INFLATION) ** (annee - 1);

    let coutActuelAn =
      anRemplacement != null && annee > anRemplacement
        ? newBillAnnual * infl // chaudière neuve déjà en place
        : billEff * infl + provisionPannes(age + annee - 1);
    if (annee === anRemplacement) coutActuelAn += energie.prixChaudiereNeuve;
    coutActuelAn += ENTRETIEN_CHAUDIERE * infl;

    cumActuel += coutActuelAn;
    cumPac += (pacAnnualCost + ENTRETIEN_PAC) * inflElec;

    projection.push({
      annee,
      cumActuel: Math.round(cumActuel),
      cumPac: Math.round(cumPac),
    });
  }

  // --- Point de croisement (rentabilité avec inflation), interpolé intra-année.
  let crossover = null;
  let prev = { cumActuel: 0, cumPac: resteACharge };
  for (const p of projection) {
    if (p.cumPac <= p.cumActuel) {
      const dG = p.cumActuel - prev.cumActuel;
      const dP = p.cumPac - prev.cumPac;
      const d = dG - dP;
      crossover = d > 0.01 ? p.annee - 1 + (prev.cumPac - prev.cumActuel) / d : p.annee;
      break;
    }
    prev = p;
  }
  const last = projection[projection.length - 1];
  const diff10 = last.cumActuel - last.cumPac; // écart cumulé à 10 ans

  // --- Scénario prudent fioul : économie recalculée à prix normalisé (1,15 €/L).
  let economieFioulNormalise = null;
  if (energieActuelle === "fioul") {
    const kwhBase = (Number(consoReelle) || 0) * PCI_FIOUL;
    const billNorm = kwhBase * (PRIX_FIOUL_NORMALISE_LITRE / PCI_FIOUL);
    economieFioulNormalise =
      billNorm + ENTRETIEN_CHAUDIERE - (pacAnnualCost + ENTRETIEN_PAC);
  }

  return {
    scop,
    copEcs: COP_ECS,
    consoPacElec,
    coutActuel: billEff,
    coutFutur: pacAnnualCost,
    economieAn,
    resteACharge,
    amortissementAns,
    projection,
    crossover,
    diff10,
    anRemplacement,
    economieFioulNormalise,
  };
}
