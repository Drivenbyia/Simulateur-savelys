/**
 * Tests unitaires des 5 moteurs de calcul (node --test, sans dépendance).
 * Lancer : `npm test`  ou  `node --test`
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { getZoneFromPostal } from "../js/data/postal-zones.js";
import { getZone, zoneCoarse } from "../js/data/climate.js";
import {
  calculerDeperditions,
  deperditionsVoieA,
  deperditionsVoieB,
  consoEnKwh,
  setbackRatio,
} from "../js/engines/deperditions.js";
import { dimensionnerPAC, mapPuissanceCommerciale } from "../js/engines/dimensionnement.js";
import { estimerPrix } from "../js/engines/prix.js";
import { determinerProfil, calculerAides, seuilsPourFoyer } from "../js/engines/aides.js";
import { calculerAmortissement, coutEnergieActuelle } from "../js/engines/amortissement.js";

const approx = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

/* --- Zones climatiques --- */
test("code postal → zone climatique", () => {
  assert.equal(getZoneFromPostal("24000"), "H2c"); // Dordogne
  assert.equal(getZoneFromPostal("47000"), "H2c"); // Lot-et-Garonne
  assert.equal(getZoneFromPostal("13000"), "H3"); // Marseille
  assert.equal(getZoneFromPostal("20000"), "H3"); // Corse
  assert.equal(getZoneFromPostal("75001"), "H1a"); // Paris
  assert.equal(getZoneFromPostal("abc"), null);
  assert.equal(getZoneFromPostal("123"), null);
});

test("zoneCoarse : sous-zone RT2012 → zone grossière H1/H2/H3", () => {
  assert.equal(zoneCoarse("H2c"), "H2");
  assert.equal(zoneCoarse("H1a"), "H1");
  assert.equal(zoneCoarse("H3"), "H3");
});

/* --- Moteur 1 : déperditions --- */
test("conso fioul convertie en kWh via PCI", () => {
  assert.equal(consoEnKwh("fioul", 2000), 20000); // 2000 L × 10 kWh/L
  assert.equal(consoEnKwh("gaz", 20000), 20000);
});

test("voie A (garde-fou PacCloser) : gaz standard avec correction PCI", () => {
  const zone = getZone("H1a"); // dju 2580, tExtBase -7
  const a = deperditionsVoieA({
    energie: "gaz",
    conso: 20000,
    typeChaudiereKey: "standard", // gaz 0.85
    ecsUtileKwh: 0,
    dju: zone.dju,
    tExtBase: zone.tExtBase,
    tInt: 20,
  });
  // usefulHeat = 20000 × (1/1.11) × 0.85 ; pDep = usefulHeat × 27 / (2580×24)
  assert.ok(approx(a.pDeperditionKW, 6.68, 0.05), `pDep ${a.pDeperditionKW}`);

  const sansPci = deperditionsVoieA({
    energie: "gaz", conso: 20000, typeChaudiereKey: "standard", ecsUtileKwh: 0,
    dju: zone.dju, tExtBase: zone.tExtBase, tInt: 20, correctionPci: false,
  });
  assert.ok(sansPci.pDeperditionKW > a.pDeperditionKW); // sans correction → +~10 %
});

test("setbackRatio : réduit sous 1 avec un réduit nocturne", () => {
  assert.equal(setbackRatio({}, 27), 1);
  const r = setbackRatio({ heuresNuit: 8, tempJour: 20, tempNuit: 18 }, 27);
  assert.ok(r < 1 && r >= 0.5, `ratio ${r}`);
});

test("voie B : surface × ratio / 1000", () => {
  const zone = getZone("H1a");
  const b = deperditionsVoieB({
    surface: 100,
    epoqueKey: "avant_1975", // ratio 115
    ecsUtileKwh: 0,
    dju: zone.dju,
    tExtBase: zone.tExtBase,
    tInt: 20,
  });
  assert.ok(approx(b.pDeperditionKW, 11.5), `attendu ~11.5, obtenu ${b.pDeperditionKW}`);
  assert.ok(b.usefulHeatKwh > 0);
});

test("croisement A/B : on retient A et on lève l'avertissement si écart > 30 %", () => {
  const zone = getZone("H1a");
  const res = calculerDeperditions({
    energie: "gaz",
    conso: 20000,
    typeChaudiereKey: "condensation",
    ecsUtileKwh: 0,
    surface: 300, // volontairement grand → voie B très supérieure à A
    epoqueKey: "avant_1975",
    dju: zone.dju,
    tExtBase: zone.tExtBase,
    tInt: 20,
  });
  assert.equal(res.methode, "A");
  assert.ok(res.voieA && res.voieB);
  assert.equal(res.avertissement, true);
  assert.equal(res.coherence, "incoherent");
});

/* --- Moteur 2 : dimensionnement --- */
test("dimensionnement PAC et mapping puissance commerciale", () => {
  const d = dimensionnerPAC(11.5);
  assert.ok(approx(d.pPacKW, 10.35), `pPac ${d.pPacKW}`);
  assert.equal(d.pCommercialeKW, 11);
  assert.equal(mapPuissanceCommerciale(20), 16); // au-delà du max → plus grande dispo
});

/* --- Moteur 3 : prix --- */
test("estimation prix : fonte HT + ECS → haut de fourchette", () => {
  const p = estimerPrix({ pPacKW: 10.35, avecEcs: true, emetteurKey: "radiateurs_fonte_HT" });
  assert.ok(approx(p.prixCentral, 18221.25, 1), `prixCentral ${p.prixCentral}`);
  assert.ok(p.fourchette[0] < p.prixCentral && p.prixCentral < p.fourchette[1]);

  const bas = estimerPrix({ pPacKW: 6, avecEcs: false, emetteurKey: "plancher_BT" });
  assert.ok(bas.prixCentral < p.prixCentral); // plancher BT sans ECS toujours moins cher
});

/* --- Moteur 5 : aides --- */
test("profil ANAH selon RFR (2 pers, hors IDF)", () => {
  const s = seuilsPourFoyer(2, "hors_idf");
  assert.equal(s.bleu, 25393);
  assert.equal(determinerProfil(20000, 2), "bleu");
  assert.equal(determinerProfil(30000, 2), "jaune");
  assert.equal(determinerProfil(40000, 2), "violet");
  assert.equal(determinerProfil(60000, 2), "rose");
});

test("aides + écrêtement (profil bleu, fioul, H1, >90 m²)", () => {
  const a = calculerAides({
    rfr: 20000,
    nbPersonnes: 2,
    energieActuelle: "fioul",
    prixCentral: 18221.25,
    zone: "H1",
    surface: 100, // > 90 → tranche "grande"
  });
  assert.equal(a.profil, "bleu");
  assert.equal(a.mpr, 5000);
  assert.equal(a.cee, 7272); // H1 grande très modeste
  assert.equal(a.bonusFioul, 1200);
  assert.equal(a.aidesBrutes, 13472);
  assert.equal(a.depenseEligible, 12000); // plafonné
  assert.ok(approx(a.plafondEcretement, 10800, 1));
  assert.equal(a.aidesTotales, 10800); // écrêté
  assert.equal(a.ecrete, true);
});

test("CEE Savelys : très modeste ≠ autres, et tranche de surface", () => {
  const petiteAutres = calculerAides({
    rfr: 40000, nbPersonnes: 2, energieActuelle: "gaz", prixCentral: 12000,
    zone: "H2", surface: 80, // ≤ 90 → "petite", profil violet → "autres"
  });
  assert.equal(petiteAutres.profil, "violet");
  assert.equal(petiteAutres.cee, 2386); // H2 petite autres

  const grandeModeste = calculerAides({
    rfr: 20000, nbPersonnes: 2, energieActuelle: "gaz", prixCentral: 12000,
    zone: "H2", surface: 120, // > 90 → "grande", profil bleu → tres_modeste
  });
  assert.equal(grandeModeste.cee, 6060); // H2 grande très modeste
});

test("profil rose : MPR nul et pas de bonus fioul", () => {
  const a = calculerAides({
    rfr: 90000,
    nbPersonnes: 2,
    energieActuelle: "fioul",
    prixCentral: 18000,
    zone: "H1",
    surface: 100,
  });
  assert.equal(a.profil, "rose");
  assert.equal(a.mpr, 0);
  assert.equal(a.bonusFioul, 0);
  assert.equal(a.cee, 4915); // H1 grande autres
});

/* --- Moteur 4 : amortissement --- */
test("coût énergie actuelle", () => {
  assert.ok(approx(coutEnergieActuelle("fioul", 2000), 3600, 0.01));
  assert.ok(approx(coutEnergieActuelle("gaz", 20000), 2560, 0.01));
});

test("amortissement : économie positive et durée cohérente", () => {
  const r = calculerAmortissement({
    eChaufKwh: 16000,
    eEcsKwh: 3400,
    emetteurKey: "radiateurs_BT",
    energieActuelle: "gaz",
    consoReelle: 20000,
    prixCentral: 18221.25,
    aidesTotales: 10800,
  });
  assert.ok(r.economieAn > 0, `économie ${r.economieAn}`);
  assert.ok(approx(r.resteACharge, 7421.25, 1));
  assert.ok(r.amortissementAns > 3 && r.amortissementAns < 8, `amort ${r.amortissementAns}`);
  assert.equal(r.projection.length, 10);
  assert.ok(r.projection[9].cumul > 0); // rentable avant 10 ans
});
