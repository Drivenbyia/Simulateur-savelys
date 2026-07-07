/**
 * Correspondance code postal → zone climatique (H1 / H2 / H3).
 *
 * On mappe par département (2 premiers chiffres du code postal). La Corse (20x)
 * est traitée à part. Tout département non listé en H2/H3 retombe en H1.
 *
 * ⚠️ Zonage PROVISOIRE et simplifié (3 zones). À réaligner sur la table exacte
 * du Toshiba V17 (source de vérité) — cf. cahier §2.
 */

// Littoral méditerranéen — zone la plus douce.
const DEPTS_H3 = new Set(["06", "11", "13", "30", "34", "66", "83"]);

// Façade atlantique + Sud-Ouest (dont Dordogne 24 et Lot-et-Garonne 47, cf. cahier).
const DEPTS_H2 = new Set([
  "14", "16", "17", "22", "24", "27", "29", "33", "35", "40",
  "44", "47", "50", "53", "56", "61", "64", "72", "76", "79",
  "85", "86",
]);

/**
 * @param {string} codePostal - code postal français (5 chiffres, ex. "24000").
 * @returns {"H1"|"H2"|"H3"|null} code de zone, ou null si code postal invalide.
 */
export function getZoneFromPostal(codePostal) {
  const cp = String(codePostal || "").trim();
  if (!/^\d{5}$/.test(cp)) return null;

  // Corse (2A / 2B) : codes postaux 20xxx → climat méditerranéen.
  if (cp.startsWith("20")) return "H3";

  const dept = cp.slice(0, 2);
  if (DEPTS_H3.has(dept)) return "H3";
  if (DEPTS_H2.has(dept)) return "H2";
  return "H1";
}
