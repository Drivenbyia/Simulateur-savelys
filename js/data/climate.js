/**
 * Zones climatiques françaises — DJU (base 18) et température extérieure de base.
 *
 * Valeurs représentatives alignées sur la table PacCloser (sous-zones RT2012) :
 *   H1 ≈ H1a (−7 / 2580) · H2 ≈ H2b (−5 / 2200) · H3 (−3 / 1480).
 * Défaut PacCloser si zone inconnue : tbase −5 °C, DJU 2000.
 *
 * ℹ️ Le mapping fin des 96 départements → sous-zone RT2012 (H1a…H3) est disponible
 *    côté PacCloser et pourra être intégré pour affiner (cf. échange).
 */

export const ZONES_CLIMATIQUES = {
  H1: {
    libelle: "H1 — Nord / Est / montagne",
    dju: 2580, // base 18 (représentatif H1a)
    tExtBase: -7, // °C
  },
  H2: {
    libelle: "H2 — Ouest / Sud-Ouest",
    dju: 2200, // représentatif H2b
    tExtBase: -5,
  },
  H3: {
    libelle: "H3 — littoral méditerranéen",
    dju: 1480,
    tExtBase: -3,
  },
};

/** Valeurs climatiques par défaut (PacCloser) si aucune zone n'est résolue. */
export const CLIMAT_DEFAUT = { libelle: "Climat par défaut", dju: 2000, tExtBase: -5 };

export function getZone(codeZone) {
  return ZONES_CLIMATIQUES[codeZone] || null;
}
