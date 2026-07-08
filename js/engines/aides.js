/**
 * Moteur 5 — Aides (barèmes 2026, à vérifier officiellement).
 *
 * Enchaînement : profil couleur ANAH (seuils RFR / nb personnes / localisation)
 * → MaPrimeRénov' par geste + CEE + bonus dépose cuve fioul → écrêtement (reste
 * à charge minimum obligatoire).
 */

import {
  SEUILS_RFR,
  DEPENSE_ELIGIBLE_PLAFOND,
  MPR_PAR_GESTE,
  CEE_SAVELYS,
  CEE_SURFACE_SEUIL,
  BONUS_DEPOSE_FIOUL,
  RESTE_A_CHARGE_MIN,
  PROFIL_LABELS,
} from "../data/aides-baremes.js";

/** Seuils RFR (bleu/jaune/violet) pour un foyer donné, avec extension au-delà de 5 pers. */
export function seuilsPourFoyer(nbPersonnes, region = "hors_idf") {
  const table = SEUILS_RFR[region] || SEUILS_RFR.hors_idf;
  const n = Math.max(1, Math.round(Number(nbPersonnes) || 1));
  if (n <= 5) return { bleu: table[n].bleu, jaune: table[n].jaune, violet: table[n].violet };

  const extra = n - 5;
  const sup = table.parPersonneSup;
  return {
    bleu: table[5].bleu + extra * sup.bleu,
    jaune: table[5].jaune + extra * sup.jaune,
    violet: table[5].violet + extra * sup.violet,
  };
}

/** Classe un foyer en profil couleur ANAH d'après son RFR. */
export function determinerProfil(rfr, nbPersonnes, region = "hors_idf") {
  const s = seuilsPourFoyer(nbPersonnes, region);
  const r = Number(rfr) || 0;
  if (r <= s.bleu) return "bleu";
  if (r <= s.jaune) return "jaune";
  if (r <= s.violet) return "violet";
  return "rose";
}

/**
 * Montant CEE Savelys selon zone climatique, surface et profil.
 *
 * PRUDENCE (consigne terrain) : on annonce toujours le CEE le plus BAS, pour que
 * ce soit une bonne surprise en rendez-vous. La surface détermine si le client
 * PEUT prétendre à la tranche haute (> 90 m²), mais le montant annoncé retient
 * la plus petite valeur possible (tranche « petite »). Passer `prudent = false`
 * pour obtenir le montant réel selon la surface.
 */
export function ceeSavelys(zone, surface, profil, prudent = true) {
  const grille = CEE_SAVELYS[zone];
  if (!grille) return 0;
  const classe = profil === "bleu" ? "tres_modeste" : "autres";
  if (prudent) return Math.min(grille.grande[classe], grille.petite[classe]);
  const tranche = (Number(surface) || 0) > CEE_SURFACE_SEUIL ? "grande" : "petite";
  return grille[tranche][classe];
}

/**
 * Calcule le total des aides après écrêtement.
 * `profil` peut être fourni directement (l'utilisateur choisit sa tranche couleur) ;
 * sinon il est déduit du RFR via `determinerProfil` (rétro-compatible).
 * @param {{
 *   profil?:"bleu"|"jaune"|"violet"|"rose", rfr?:number, nbPersonnes:number,
 *   region?:"hors_idf"|"idf", energieActuelle:"gaz"|"fioul", prixCentral:number,
 *   zone:"H1"|"H2"|"H3", surface:number
 * }} input
 */
export function calculerAides({
  profil: profilExplicite,
  rfr,
  nbPersonnes,
  region = "hors_idf",
  energieActuelle,
  prixCentral,
  zone,
  surface,
}) {
  const profil = profilExplicite || determinerProfil(rfr, nbPersonnes, region);

  const mpr = MPR_PAR_GESTE[profil];
  const cee = ceeSavelys(zone, surface, profil);
  const bonusFioul = energieActuelle === "fioul" ? BONUS_DEPOSE_FIOUL[profil] : 0;

  const depenseEligible = Math.min(Number(prixCentral) || 0, DEPENSE_ELIGIBLE_PLAFOND);
  const resteMin = RESTE_A_CHARGE_MIN[profil];
  const plafondEcretement = (1 - resteMin) * depenseEligible;

  const aidesBrutes = mpr + cee + bonusFioul;
  const aidesTotales = Math.min(aidesBrutes, plafondEcretement);
  const ecrete = aidesBrutes > plafondEcretement;

  return {
    profil,
    profilLabel: PROFIL_LABELS[profil],
    seuils: seuilsPourFoyer(nbPersonnes, region),
    mpr,
    cee,
    bonusFioul,
    depenseEligible,
    resteMin,
    plafondEcretement,
    aidesBrutes,
    aidesTotales,
    ecrete,
  };
}
