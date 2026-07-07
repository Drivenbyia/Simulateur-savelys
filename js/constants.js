/**
 * Constantes énergie & paramètres moteurs — Simulateur PAC Savelys.
 *
 * ⚠️ RÈGLE : rien n'est codé en dur dans les formules des moteurs.
 * Tout paramètre susceptible de bouger est centralisé ici et DATÉ (MAJ_TARIFS).
 * Repères juillet 2026 — à réactualiser régulièrement.
 */

export const MAJ_TARIFS = "2026-07";

/* --- Prix de l'énergie (€ TTC) --- */
export const PRIX_GAZ_CHAUFFAGE = 0.128; // €/kWh (prix repère CRE, profil chauffage)
export const PRIX_FIOUL_LITRE = 1.8; // €/L (≈ 0,18 €/kWh brut)
export const PCI_FIOUL = 10; // kWh/L (pouvoir calorifique inférieur du fioul)
export const PRIX_ELEC = 0.19; // €/kWh (TRV base, ordre de grandeur)

/* --- Thermique --- */
export const T_INT = 20; // consigne intérieure °C par défaut (méthode PacCloser)

/** Énergie utile ECS (kWh/an) en fonction du nombre d'occupants. */
export function E_ECS_UTILE(nbPersonnes) {
  return 1000 + 600 * Math.max(0, nbPersonnes || 0);
}

/* --- Rendements chaudière (méthode PacCloser : type × combustible) --- */
export const RENDEMENTS_CHAUDIERE = {
  condensation: { gaz: 0.92, fioul: 0.9 }, // < 10 ans
  standard: { gaz: 0.85, fioul: 0.83 }, // 10–20 ans
  ancienne: { gaz: 0.78, fioul: 0.78 }, // > 20 ans / pré-2000
};

/** Rendement chaudière selon type + combustible. */
export function rendementChaudiere(typeKey, energie) {
  return RENDEMENTS_CHAUDIERE[typeKey]?.[energie] ?? 0.85;
}

/* --- Correction PCS → PCI (gaz uniquement) — biais prudent PacCloser --- */
export const PCS_PCI_RATIO = 1 / 1.11; // PCI = PCS / 1,11
export const CORRECTION_PCI_GAZ_DEFAUT = true;

/* --- Ratios de déperdition par époque / isolation (W/m²) — Moteur 1 voie B --- */
export const RATIOS_W_M2 = {
  avant_1975: 115, // non isolé (fourchette cahier 100–130)
  de_1975_2000: 85, // isolation partielle (70–100)
  rt2005: 60, // 2000–2012 (50–70)
  rt2012: 40, // RT2012 et + (30–50)
};

/* --- Dimensionnement PAC — Moteur 2 --- */
export const COEF_DIM = 0.9; // ∈ [0.80, 1.00] ; l'appoint élec couvre les pointes
export const PUISSANCES_COMMERCIALES = [6, 8, 11, 14, 16]; // kW

/**
 * Prix — Moteur 3 (€ TTC, pose comprise) : grille réelle Savelys.
 * Fonction de la puissance de DÉPERDITION (kW), pas de la puissance commerciale.
 * Relation non linéaire (pente 4→8 kW plus forte que 8→15 kW) → interpolation
 * linéaire par morceaux sur ces points, clampée en dehors de [4,15] kW.
 * Le type d'émetteur n'influence plus le prix (décision utilisateur) ; il reste
 * utilisé pour le SCOP (Moteur 4).
 */
export const PRIX_PAR_DEPERDITION = [
  { depKw: 4, prix: 11000 },
  { depKw: 8, prix: 15000 },
  { depKw: 15, prix: 17000 },
];
export const SUPPLEMENT_ECS = 2000; // € ajoutés si chauffage + eau chaude sanitaire
export const PRIX_FOURCHETTE = 0.08; // ±8 % autour du prix central

/* --- Amortissement — Moteur 4 --- */
/** SCOP saisonnier selon le type d'émetteur (les radiateurs fonte HT le dégradent). */
export const SCOP = {
  plancher_BT: 4.0,
  radiateurs_BT: 3.5,
  radiateurs_fonte_HT: 2.9,
};
export const PROJECTION_ANNEES = 10;

/* --- Divers --- */
export const HAUTEUR_SOUS_PLAFOND_DEFAUT = 2.5; // m (non utilisé par voie A/B mais dispo)
export const ECART_AB_ALERTE = 0.3; // écart relatif A/B au-delà duquel on avertit
