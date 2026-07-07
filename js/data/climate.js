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
