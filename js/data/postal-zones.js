/**
 * Correspondance code postal → sous-zone climatique RT2012 (H1a…H3)
 * et température extérieure de base par département.
 *
 * Zone : mapping des 96 départements métropolitains fourni par PacCloser
 * (valeurs "plaine"). T_base : table départementale de l'étude de prix 2026
 * (valeurs au niveau de la mer, 0–200 m — l'altitude n'est pas corrigée ici,
 * cf. README ; en montagne l'estimation est à affiner en visite).
 * La Corse (codes postaux 20xxx) est traitée à part → H3.
 * Département absent → null (le calcul retombe sur CLIMAT_DEFAUT).
 */

export const DEPT_TO_ZONE = {
  "01": "H1c", "02": "H1a", "03": "H1c", "04": "H2d", "05": "H1c",
  "06": "H3", "07": "H2d", "08": "H1b", "09": "H2c", "10": "H1b",
  "11": "H3", "12": "H2c", "13": "H3", "14": "H2a", "15": "H1c",
  "16": "H2b", "17": "H2b", "18": "H2b", "19": "H1c",
  "2A": "H3", "2B": "H3",
  "21": "H1b", "22": "H2a", "23": "H1c", "24": "H2c", "25": "H1b",
  "26": "H2d", "27": "H1a", "28": "H1a", "29": "H2a", "30": "H3",
  "31": "H2c", "32": "H2c", "33": "H2c", "34": "H3", "35": "H2a",
  "36": "H2b", "37": "H2b", "38": "H1c", "39": "H1b", "40": "H2c",
  "41": "H2b", "42": "H1c", "43": "H1c", "44": "H2b", "45": "H2b",
  "46": "H2c", "47": "H2c", "48": "H1c", "49": "H2b", "50": "H2a",
  "51": "H1a", "52": "H1b", "53": "H2b", "54": "H1b", "55": "H1b",
  "56": "H2a", "57": "H1b", "58": "H1b", "59": "H1a", "60": "H1a",
  "61": "H1a", "62": "H1a", "63": "H1c", "64": "H2c", "65": "H2c",
  "66": "H3", "67": "H1b", "68": "H1b", "69": "H1c", "70": "H1b",
  "71": "H1c", "72": "H2b", "73": "H1c", "74": "H1c", "75": "H1a",
  "76": "H1a", "77": "H1a", "78": "H1a", "79": "H2b", "80": "H1a",
  "81": "H2c", "82": "H2c", "83": "H3", "84": "H2d", "85": "H2b",
  "86": "H2b", "87": "H1c", "88": "H1b", "89": "H1b", "90": "H1b",
  "91": "H1a", "92": "H1a", "93": "H1a", "94": "H1a", "95": "H1a",
};

/**
 * Température extérieure de base par département (°C, niveau de la mer) —
 * table de l'étude de prix 2026. Les fourchettes de la source sont ramenées à
 * une valeur médiane (ex. 06 « −2 à −6 » → −4 ; 25 « −10 à −12 » → −11).
 */
export const DEPT_TBASE = {
  "01": -10, "02": -7, "03": -8, "04": -8, "05": -10,
  "06": -4, "07": -6, "08": -10, "09": -5, "10": -10,
  "11": -5, "12": -8, "13": -5, "14": -7, "15": -8,
  "16": -5, "17": -5, "18": -7, "19": -8,
  "2A": -2, "2B": -2,
  "21": -10, "22": -4, "23": -8, "24": -5, "25": -11,
  "26": -6, "27": -7, "28": -7, "29": -4, "30": -5,
  "31": -5, "32": -5, "33": -5, "34": -5, "35": -4,
  "36": -7, "37": -7, "38": -10, "39": -10, "40": -5,
  "41": -7, "42": -10, "43": -10, "44": -5, "45": -7,
  "46": -5, "47": -5, "48": -8, "49": -7, "50": -4,
  "51": -10, "52": -12, "53": -7, "54": -15, "55": -12,
  "56": -4, "57": -15, "58": -10, "59": -9, "60": -7,
  "61": -7, "62": -9, "63": -8, "64": -5, "65": -5,
  "66": -5, "67": -15, "68": -15, "69": -10, "70": -12,
  "71": -10, "72": -7, "73": -10, "74": -10, "75": -5,
  "76": -7, "77": -7, "78": -7, "79": -7, "80": -9,
  "81": -5, "82": -5, "83": -5, "84": -6, "85": -5,
  "86": -7, "87": -8, "88": -15, "89": -10, "90": -15,
  "91": -7, "92": -7, "93": -7, "94": -7, "95": -7,
};

/** Extrait le code département d'un code postal (gère la Corse 2A/2B → "20"). */
function deptFromPostal(codePostal) {
  const cp = String(codePostal || "").trim();
  if (!/^\d{5}$/.test(cp)) return null;
  return cp.slice(0, 2);
}

/**
 * @param {string} codePostal - code postal français (5 chiffres, ex. "24000").
 * @returns {string|null} sous-zone RT2012 (ex. "H2c"), ou null si invalide/inconnu.
 */
export function getZoneFromPostal(codePostal) {
  const dept = deptFromPostal(codePostal);
  if (!dept) return null;

  // Corse (2A / 2B) : codes postaux 20xxx → climat méditerranéen.
  if (dept === "20") return "H3";

  return DEPT_TO_ZONE[dept] || null;
}

/**
 * Température de base départementale (plus fine que celle de la sous-zone).
 * @returns {number|null} °C, ou null si code postal invalide/département inconnu.
 */
export function getTbaseFromPostal(codePostal) {
  const dept = deptFromPostal(codePostal);
  if (!dept) return null;
  if (dept === "20") return DEPT_TBASE["2A"];
  return DEPT_TBASE[dept] ?? null;
}
