/**
 * Constantes énergie & paramètres moteurs — Simulateur PAC Savelys.
 *
 * ⚠️ RÈGLE : rien n'est codé en dur dans les formules des moteurs.
 * Tout paramètre susceptible de bouger est centralisé ici et DATÉ (MAJ_TARIFS).
 * Sources : méthode économies PacCloser (tables §0) + étude de prix PAC 2026.
 */

export const MAJ_TARIFS = "2026-07";

/**
 * Table de référence par énergie (méthode PacCloser §0) :
 * prix €/kWh TTC, abonnement/location fixe €/an, inflation annuelle par défaut,
 * rendement d'une chaudière NEUVE (pour le scénario "remplacer la chaudière"),
 * prix indicatif d'une chaudière neuve posée (éditable).
 */
export const ENERGIES = {
  gaz: {
    prixKwh: 0.12766,
    abonnement: 359.63,
    inflation: 0.05,
    rendementNeuf: 0.92,
    prixChaudiereNeuve: 4500,
    unite: "kWh", // saisie directe en kWh
    pci: 1,
  },
  fioul: {
    prixKwh: 0.141, // = 1,41 €/L à 10 kWh/L
    abonnement: 0,
    inflation: 0.04,
    rendementNeuf: 0.9,
    prixChaudiereNeuve: 8500,
    unite: "L", // litres
    pci: 10, // kWh/L
  },
  propane: {
    prixKwh: 0.1865,
    abonnement: 120,
    inflation: 0.05,
    rendementNeuf: 0.92,
    prixChaudiereNeuve: 5000,
    unite: "kg", // kilos (citerne)
    pci: 12.87, // kWh/kg
  },
};

export const PCI_FIOUL = ENERGIES.fioul.pci; // 10 kWh/L
export const PRIX_FIOUL_LITRE = ENERGIES.fioul.prixKwh * PCI_FIOUL; // 1,41 €/L
/** PCI (kWh par unité physique saisie) selon l'énergie. */
export function pciEnergie(energie) {
  return ENERGIES[energie]?.pci ?? 1;
}

/* --- Électricité (PAC) --- */
export const PRIX_ELEC = 0.194; // €/kWh TTC (TRV)
export const ELEC_INFLATION = 0.025; // inflation élec par défaut (2,5 %/an)
export const ELEC_ABO_SUPP = 80; // €/an — hausse d'abonnement (kVA) fréquente avec une PAC
export const COP_ECS = 2.5; // COP de production ECS par la PAC (eau à ~55 °C)

/* --- Entretien annuel (comparaison "tout compris", PacCloser §8) --- */
export const ENTRETIEN_PAC = 180; // €/an (PAC air/eau)
export const ENTRETIEN_CHAUDIERE = 150; // €/an (gaz/fioul)

/* --- Scénario prudent fioul (anti-volatilité, PacCloser §16) --- */
export const PRIX_FIOUL_NORMALISE_LITRE = 1.15; // €/L de référence figé

/* --- Vieillissement chaudière (PacCloser §11-12) --- */
export const DUREE_VIE_CHAUDIERE = 20; // ans — remplacement forcé au-delà
/** Âge représentatif selon le type déclaré (sert au provisionnement pannes). */
export const AGE_CHAUDIERE = { condensation: 5, standard: 15, ancienne: 22 };
/** Provision annuelle de pannes selon l'âge de la chaudière. */
export function provisionPannes(age) {
  if (age >= 15) return 250;
  if (age >= 10) return 100;
  return 0;
}

/* --- Thermique --- */
export const T_INT = 20; // consigne intérieure °C par défaut (méthode PacCloser)
export const HAUTEUR_SOUS_PLAFOND_DEFAUT = 2.5; // m (norme française usuelle)

/** Énergie utile ECS (kWh/an) en fonction du nombre d'occupants. */
export function E_ECS_UTILE(nbPersonnes) {
  return 1000 + 600 * Math.max(0, nbPersonnes || 0);
}

/* --- Rendements chaudière ACTUELLE (méthode PacCloser : type × combustible) --- */
export const RENDEMENTS_CHAUDIERE = {
  condensation: { gaz: 0.92, fioul: 0.9, propane: 0.92 }, // < 10 ans
  standard: { gaz: 0.85, fioul: 0.83, propane: 0.85 }, // 10–20 ans
  ancienne: { gaz: 0.78, fioul: 0.78, propane: 0.78 }, // > 20 ans / pré-2000
};

/** Rendement chaudière selon type + combustible. */
export function rendementChaudiere(typeKey, energie) {
  return RENDEMENTS_CHAUDIERE[typeKey]?.[energie] ?? 0.85;
}

/* --- Correction PCS → PCI (gaz uniquement) — biais prudent PacCloser --- */
export const PCS_PCI_RATIO = 1 / 1.11; // PCI = PCS / 1,11
export const CORRECTION_PCI_GAZ_DEFAUT = true;

/**
 * Coefficient G de déperdition globale (W/m³·K) par période de construction —
 * Moteur 1 voie B, méthode volumique (P = G × V × ΔT) de l'étude de prix 2026
 * (matrice RT 1974 → RE 2020).
 * Fourchette [bas, haut] par époque : haut = état d'origine (aucun travaux),
 * bas = logement largement rénové (rejoint le niveau d'une époque plus récente).
 */
export const G_RANGE = {
  avant_1974: [1.05, 2.15], // aucune isolation d'origine (DPE F-G)
  de_1974_1988: [0.9, 1.45], // RT 1974 / RT 1982
  de_1989_2000: [0.8, 1.05], // RT 1988
  de_2001_2012: [0.62, 0.82], // RT 2000 / RT 2005
  rt2012: [0.4, 0.55], // 2013–2021, BBC
  re2020: [0.22, 0.3], // après 2022
};

/**
 * Poids de chaque poste d'isolation dans les déperditions (répartition ADEME,
 * normalisée pour que "tout rénové" atteigne le bas de fourchette). Somme = 1.
 * ADEME : toiture 25–30 % · murs ~20–25 % · fenêtres 10–15 % · plancher 7–10 %.
 */
export const POIDS_ISOLATION = {
  toiture_combles: 0.39,
  murs: 0.32,
  fenetres: 0.18,
  plancher_bas: 0.11,
};

/* --- Dimensionnement PAC — Moteur 2 --- */
export const COEF_DIM = 0.9; // ∈ [0.80, 1.00] ; l'appoint élec couvre les pointes
export const PUISSANCES_COMMERCIALES = [6, 8, 11, 14, 16]; // kW (puissances nominales à +7°C)

/**
 * Déclassement de la PAC air/eau au froid : la puissance NOMINALE est mesurée à
 * +7°C (EN 14511). À la température de base, la PAC fournit moins (ex. terrain :
 * une 6 kW nominale ≈ 4 kW à −5°C → facteur ≈ 0,66). On modélise une perte
 * linéaire par °C sous +7°C, avec un plancher (au-delà, l'appoint électrique prend
 * le relais). Il faut donc surdimensionner la puissance nominale pour couvrir la
 * déperdition à la température de base — ce qui impacte aussi le prix.
 */
export const T_REF_PAC = 7; // °C — point de mesure de la puissance nominale
export const PAC_DERATING_PAR_C = 0.028; // perte de capacité par °C sous +7°C (~2,8 %/°C)
export const PAC_FACTOR_MIN = 0.5; // plancher de capacité au grand froid

/** Facteur de capacité de la PAC (part de la puissance nominale) à la T° de base. */
export function facteurCapacitePAC(tExtBase) {
  const t = Number.isFinite(tExtBase) ? tExtBase : T_REF_PAC;
  const drop = T_REF_PAC - t;
  return Math.min(1, Math.max(PAC_FACTOR_MIN, 1 - PAC_DERATING_PAR_C * drop));
}

/**
 * Supplément de puissance ECS (PAC "Duo") selon la taille du foyer — étude 2026 :
 * +1 kW (1-2 pers) · +1,5 à 2 kW (3-4 pers) · +2,5 à 3 kW (5 pers et plus).
 */
export function supplementEcsKw(nbPersonnes) {
  const n = Number(nbPersonnes) || 0;
  if (n <= 0) return 0;
  if (n <= 2) return 1;
  if (n <= 4) return 1.75;
  return 2.75;
}

/**
 * Prix — Moteur 3 : modèle issu de l'étude de prix 2026 (plus fiable qu'un forfait).
 * On additionne : matériel PAC air/eau Duo (chauffage + ECS, € HT) + accessoires
 * (pot à boue + ballon tampon) + main-d'œuvre de pose (régionalisée), puis TVA 5,5 %.
 * Chaque poste est une FOURCHETTE [bas, haut] → la fourchette de prix client en découle.
 *
 * Matériel par puissance PAC (chauffage) et par classe d'émetteur :
 *   - "bt" = basse/moyenne température (plancher, radiateurs BT)
 *   - "ht" = haute température (radiateurs fonte) → PAC HT plus chère
 */
export const PRIX_ETUDE = {
  materiel: {
    // puissance commerciale (kW) : { bt:[bas,haut], ht:[bas,haut] } — € HT, Duo (+ECS)
    6: { bt: [6000, 7500], ht: [7500, 9000] },
    8: { bt: [7500, 9500], ht: [9000, 11000] },
    11: { bt: [9000, 11000], ht: [11000, 13500] },
    14: { bt: [11000, 13500], ht: [13500, 16000] },
    16: { bt: [11000, 13500], ht: [13500, 16000] },
  },
  accessoires: [650, 1200], // pot à boue magnétique + ballon tampon, € HT
  poseProvince: [1500, 2500], // main-d'œuvre, € HT
  poseIdf: [3000, 5000], // Île-de-France (taux horaire ~×1,35), € HT
  tva: 1.055, // TVA 5,5 % (logement > 2 ans, artisan RGE)
};
export const DEPTS_IDF = new Set(["75", "77", "78", "91", "92", "93", "94", "95"]);

/* --- Amortissement — Moteur 4 --- */
/** SCOP nominal (constructeur) selon le type d'émetteur. */
export const SCOP = {
  plancher_BT: 4.0,
  radiateurs_BT: 3.5,
  radiateurs_fonte_HT: 2.9,
};
/**
 * Dégradation du SCOP en "SCOP saisonnier RÉEL" selon la zone climatique :
 * en zone froide la PAC passe plus de temps à basse T°/dégivrage → SCOP réel < nominal.
 * Calé sur l'outil terrain PacCloser (ex. fonte HT en H2 → ≈ 2,5). Prudent.
 */
export const SCOP_DERATING_ZONE = { H1: 0.82, H2: 0.86, H3: 0.94 };
export const PROJECTION_ANNEES = 10;

/* --- Divers --- */
export const ECART_AB_ALERTE = 0.3; // écart relatif A/B au-delà duquel on avertit
