/**
 * Zones climatiques françaises (sous-zones RT2012) — DJU (base 18) et température
 * extérieure de base, d'après la table de dimensionnement PacCloser.
 *
 * Valeurs "plaine" — à majorer en altitude (déperdition plus élevée).
 * Défaut si département inconnu : tbase −5 °C, DJU 2000.
 */

export const ZONES_CLIMATIQUES = {
  H1a: { libelle: "H1a", dju: 2580, tExtBase: -7 },
  H1b: { libelle: "H1b", dju: 2730, tExtBase: -10 },
  H1c: { libelle: "H1c", dju: 2570, tExtBase: -8 },
  H2a: { libelle: "H2a", dju: 2180, tExtBase: -4 },
  H2b: { libelle: "H2b", dju: 2200, tExtBase: -5 },
  H2c: { libelle: "H2c", dju: 2000, tExtBase: -5 },
  H2d: { libelle: "H2d", dju: 2080, tExtBase: -6 },
  H3: { libelle: "H3", dju: 1480, tExtBase: -3 },
};

/** Valeurs climatiques par défaut (PacCloser) si aucune zone n'est résolue. */
export const CLIMAT_DEFAUT = { libelle: "Climat par défaut", dju: 2000, tExtBase: -5 };

/**
 * ⚠️ RÉSERVE — Modèle de besoin FROID (climatisation), hors périmètre actuel
 * (simulateur orienté chauffage). Conservé pour un module clim futur.
 * Source : coefficients_thermiques.md §2–3.
 * Froid en W/m³ (volume) selon le coef G d'isolation, puis × coef climatique zone.
 */
export const FROID_W_M3 = [
  { gMax: 0.35, ratio: 30 }, // RE2020 / RT2012
  { gMax: 0.8, ratio: 40 }, // RT2005
  { gMax: 1.2, ratio: 45 }, // années 90
  { gMax: 1.6, ratio: 50 },
  { gMax: Infinity, ratio: 60 }, // avant 1974
];
export const FROID_COEF_ZONE = { A: 0.85, C: 0.85, D: 0.85, B: 1, E: 1, F: 1, G: 1.1, I: 1.1, H: 1.25 };

export function getZone(codeZone) {
  return ZONES_CLIMATIQUES[codeZone] || null;
}

/**
 * Zone climatique "grossière" (H1 / H2 / H3) à partir d'une sous-zone RT2012.
 * Utilisée par la grille CEE Savelys, qui raisonne en 3 zones.
 */
export function zoneCoarse(subzone) {
  const s = String(subzone || "");
  if (s.startsWith("H1")) return "H1";
  if (s.startsWith("H2")) return "H2";
  if (s.startsWith("H3")) return "H3";
  return null;
}
