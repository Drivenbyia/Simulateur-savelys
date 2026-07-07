/**
 * Barèmes des aides — Simulateur PAC Savelys (repères 2026).
 *
 * ⚠️ ANTI-HALLUCINATION : ces barèmes sont susceptibles d'évoluer. Ils doivent être
 * VÉRIFIÉS sur les sources officielles avant mise en production :
 *   - Seuils RFR ANAH : https://france-renov.gouv.fr/bareme
 *   - CEE / Coup de pouce : barème réel du partenaire obligé Savelys.
 * Table RFR ci-dessous = barème publié 2026 (cohérent avec l'ancre du cahier :
 * Bleu / 2 pers / hors-IDF = 25 393 €).
 */

export const BAREME_DATE = "2026";

/**
 * Plafonds de RFR par nombre de personnes et par profil couleur ANAH.
 * Valeurs = plafond HAUT de chaque catégorie (RFR ≤ seuil ⇒ dans la catégorie).
 * Au-delà du seuil "violet" ⇒ profil "rose" (supérieurs).
 */
export const SEUILS_RFR = {
  hors_idf: {
    // nbPersonnes: { bleu, jaune, violet }
    1: { bleu: 17363, jaune: 22259, violet: 31185 },
    2: { bleu: 25393, jaune: 32553, violet: 45842 },
    3: { bleu: 30540, jaune: 39148, violet: 55196 },
    4: { bleu: 35676, jaune: 45735, violet: 64550 },
    5: { bleu: 40835, jaune: 52348, violet: 73907 },
    parPersonneSup: { bleu: 5151, jaune: 6598, violet: 9357 },
  },
  idf: {
    1: { bleu: 24031, jaune: 29253, violet: 40851 },
    2: { bleu: 35270, jaune: 42933, violet: 60051 },
    3: { bleu: 42357, jaune: 51564, violet: 71846 },
    4: { bleu: 49455, jaune: 60208, violet: 84562 },
    5: { bleu: 56580, jaune: 68877, violet: 96817 },
    parPersonneSup: { bleu: 7116, jaune: 8663, violet: 12257 },
  },
};

/** Plafond de dépense éligible MaPrimeRénov' par geste pour une PAC air/eau. */
export const DEPENSE_ELIGIBLE_PLAFOND = 12000; // €

/** MaPrimeRénov' par geste — PAC air/eau (€). Rose = non éligible parcours par geste. */
export const MPR_PAR_GESTE = {
  bleu: 5000,
  jaune: 4000,
  violet: 3000,
  rose: 0,
};

/**
 * CEE — grille réelle Savelys (remplacement chaudière gaz/fioul → PAC air/eau).
 * Dépend de : zone climatique × tranche de surface × profil.
 *  - Tranche "grande"  : surface > 90 m² (PAC ETAS > 139 %).
 *  - Tranche "petite"  : surface ≤ 90 m² (PAC ETAS < 140 %).
 *  - "tres_modeste" = profil Bleu ; "autres" = Jaune / Violet / Rose (même montant).
 */
export const CEE_SURFACE_SEUIL = 90; // m² : surface > seuil ⇒ tranche "grande"
export const CEE_SAVELYS = {
  H1: {
    grande: { tres_modeste: 7272, autres: 4915 },
    petite: { tres_modeste: 4237, autres: 2864 },
  },
  H2: {
    grande: { tres_modeste: 6060, autres: 4095 },
    petite: { tres_modeste: 3532, autres: 2386 },
  },
  H3: {
    grande: { tres_modeste: 4242, autres: 2866 },
    petite: { tres_modeste: 2472, autres: 1670 },
  },
};

/** Bonus dépose cuve fioul (si énergie actuelle = fioul), en plus (€). */
export const BONUS_DEPOSE_FIOUL = {
  bleu: 1200,
  jaune: 800,
  violet: 400,
  rose: 0,
};

/** Écrêtement : reste à charge minimum obligatoire (part de la dépense éligible). */
export const RESTE_A_CHARGE_MIN = {
  bleu: 0.1,
  jaune: 0.25,
  violet: 0.4,
  rose: 0.6,
};

export const PROFIL_LABELS = {
  bleu: "Bleu — très modestes",
  jaune: "Jaune — modestes",
  violet: "Violet — intermédiaires",
  rose: "Rose — supérieurs",
};
