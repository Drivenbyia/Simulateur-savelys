/**
 * Tests unitaires des 5 moteurs de calcul (node --test, sans dépendance).
 * Lancer : `npm test`  ou  `node --test`
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { getZoneFromPostal, getTbaseFromPostal } from "../js/data/postal-zones.js";
import { getZone, zoneCoarse } from "../js/data/climate.js";
import {
  calculerDeperditions,
  deperditionsVoieA,
  deperditionsVoieB,
  consoEnKwh,
  setbackRatio,
  coefG,
} from "../js/engines/deperditions.js";
import { dimensionnerPAC, mapPuissanceCommerciale } from "../js/engines/dimensionnement.js";
import { estimerPrix, interpolerPrix } from "../js/engines/prix.js";
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

test("T_base départementale (étude 2026)", () => {
  assert.equal(getTbaseFromPostal("24000"), -5); // Dordogne
  assert.equal(getTbaseFromPostal("67000"), -15); // Bas-Rhin (bien plus froid que la sous-zone)
  assert.equal(getTbaseFromPostal("20000"), -2); // Corse
  assert.equal(getTbaseFromPostal("abc"), null);
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

test("coefG : fourchette G glissée selon les travaux (étude 2026)", () => {
  // avant_1974 = [1.05, 2.15] : aucun travaux → 2.15 (origine) ; tout rénové → 1.05
  assert.equal(coefG("avant_1974", {}), 2.15);
  assert.ok(
    approx(
      coefG("avant_1974", { toiture_combles: true, murs: true, fenetres: true, plancher_bas: true }),
      1.05,
      1e-9
    )
  );
  // toiture seule (poids 0.39) → 2.15 − 1.10×0.39 = 1.721
  assert.ok(approx(coefG("avant_1974", { toiture_combles: true }), 1.721, 0.001));
  assert.equal(coefG("re2020", {}), 0.3);
});

test("voie B volumique : P = G × V × ΔT / 1000", () => {
  const zone = getZone("H1a"); // dju 2580, tExtBase -7 → ΔT = 27
  const b = deperditionsVoieB({
    surface: 100,
    hauteur: 2.5,
    epoqueKey: "avant_1974", // aucun travaux → G 2.15
    ecsUtileKwh: 0,
    dju: zone.dju,
    tExtBase: zone.tExtBase,
    tInt: 20,
  });
  // 2.15 × 250 m³ × 27 K / 1000 = 14.51 kW
  assert.ok(approx(b.pDeperditionKW, 14.51, 0.02), `attendu ~14.51, obtenu ${b.pDeperditionKW}`);
  assert.ok(b.usefulHeatKwh > 0);

  // Avec travaux → déperdition plus faible ; climat plus doux → plus faible aussi
  const bRenove = deperditionsVoieB({
    surface: 100, hauteur: 2.5, epoqueKey: "avant_1974",
    travaux: { toiture_combles: true, murs: true },
    ecsUtileKwh: 0, dju: zone.dju, tExtBase: zone.tExtBase, tInt: 20,
  });
  assert.ok(bRenove.pDeperditionKW < b.pDeperditionKW);

  const bDoux = deperditionsVoieB({
    surface: 100, hauteur: 2.5, epoqueKey: "avant_1974",
    ecsUtileKwh: 0, dju: 1480, tExtBase: -2, tInt: 20, // H3 littoral
  });
  assert.ok(bDoux.pDeperditionKW < b.pDeperditionKW);
});

test("croisement A/B : on retient A et on lève l'avertissement si écart > 30 %", () => {
  const zone = getZone("H1a");
  const res = calculerDeperditions({
    energie: "gaz",
    conso: 20000,
    typeChaudiereKey: "condensation",
    ecsUtileKwh: 0,
    surface: 300, // volontairement grand → voie B très supérieure à A
    epoqueKey: "avant_1974",
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

test("dimensionnement : supplément ECS selon la taille du foyer (étude 2026)", () => {
  const sans = dimensionnerPAC(10, { avecEcs: false, nbPersonnes: 4 });
  const avec = dimensionnerPAC(10, { avecEcs: true, nbPersonnes: 4 });
  assert.equal(sans.suppEcsKW, 0);
  assert.equal(avec.suppEcsKW, 1.75); // foyer 3-4 personnes
  assert.ok(approx(avec.pPacKW, 10.75, 0.001)); // 10×0.9 + 1.75
  assert.equal(dimensionnerPAC(10, { avecEcs: true, nbPersonnes: 6 }).suppEcsKW, 2.75);
  assert.equal(dimensionnerPAC(10, { avecEcs: true, nbPersonnes: 2 }).suppEcsKW, 1);
});

/* --- Moteur 3 : prix (grille réelle Savelys, interpolation par morceaux) --- */
test("prix : points connus 4/8/15 kW, chauffage seul", () => {
  assert.equal(interpolerPrix(4), 11000);
  assert.equal(interpolerPrix(8), 15000);
  assert.equal(interpolerPrix(15), 17000);
});

test("prix : interpolation par morceaux entre les points", () => {
  // Segment [4,8] : pente 1000 €/kW → 6 kW = 11000 + 2*1000 = 13000
  assert.ok(approx(interpolerPrix(6), 13000, 0.01), `6kW: ${interpolerPrix(6)}`);
  // Segment [8,15] : pente (17000-15000)/7 ≈ 285.71 €/kW → 11 kW = 15000 + 3*285.71
  assert.ok(approx(interpolerPrix(11), 15857.14, 0.1), `11kW: ${interpolerPrix(11)}`);
});

test("prix : clamp en dehors de [4,15] kW", () => {
  assert.equal(interpolerPrix(2), 11000);
  assert.equal(interpolerPrix(20), 17000);
});

test("estimerPrix : ECS ajoute le supplément fixe, fourchette encadre le central", () => {
  const seul = estimerPrix({ pDeperditionKW: 8, avecEcs: false });
  assert.equal(seul.prixCentral, 15000);
  assert.ok(approx(seul.fourchette[0], 13800, 0.01));
  assert.ok(approx(seul.fourchette[1], 16200, 0.01));

  const avecEcs = estimerPrix({ pDeperditionKW: 8, avecEcs: true });
  assert.equal(avecEcs.prixCentral, 17000); // +2000€ ECS
});

test("estimerPrix : majoration de pose Île-de-France", () => {
  const idf = estimerPrix({ pDeperditionKW: 8, avecEcs: false, idf: true });
  assert.equal(idf.prixCentral, 16200); // 15000 + 1200 de main-d'œuvre francilienne
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

test("aides : profil explicite prioritaire sur le RFR", () => {
  const a = calculerAides({
    profil: "jaune", // choisi directement par l'utilisateur (carte tranche)
    rfr: 20000, // serait "bleu" si déduit → doit être ignoré
    nbPersonnes: 2, energieActuelle: "gaz", prixCentral: 12000,
    zone: "H2", surface: 120,
  });
  assert.equal(a.profil, "jaune");
  assert.equal(a.mpr, 4000); // MPR jaune
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

/* --- Moteur 4 : économies & amortissement (méthode PacCloser) --- */
test("coût énergie actuelle : tables PacCloser (prix + abonnement)", () => {
  // Fioul : 2000 L × 10 kWh/L × 0,141 €/kWh (= 1,41 €/L), pas d'abonnement.
  assert.ok(approx(coutEnergieActuelle("fioul", 2000), 2820, 0.01));
  // Gaz : 20 000 kWh × 0,12766 + abonnement 359,63.
  assert.ok(approx(coutEnergieActuelle("gaz", 20000), 2912.83, 0.01));
});

test("économies : cas réel 1600 L fioul (celui signalé comme trop optimiste)", () => {
  // Chaleur utile issue de la voie A : chaudière fioul standard (0.83), 3 pers ECS.
  const r = calculerAmortissement({
    eChaufKwh: 10480, // (16000 − 2800/0.83) × 0.83
    eEcsKwh: 2800,
    emetteurKey: "radiateurs_BT",
    energieActuelle: "fioul",
    consoReelle: 1600, // litres
    typeChaudiereKey: "standard",
    avecEcs: true,
    prixCentral: 15000,
    aidesTotales: 3000,
  });
  // Facture actuelle : 1600 L × 1,41 = 2256 €/an.
  assert.ok(approx(r.coutActuel, 2256, 0.5), `coutActuel ${r.coutActuel}`);
  // PAC : 10480/3.5 + 2800/2.5 = 4114 kWh élec × 0,194 + 80 € abo ≈ 878 €/an.
  assert.ok(approx(r.coutFutur, 878.2, 1), `coutFutur ${r.coutFutur}`);
  // Économie "tout compris" ≈ 1 348 €/an — et non ~2 300 € comme avant correction.
  assert.ok(r.economieAn > 1300 && r.economieAn < 1400, `économie ${r.economieAn}`);
  // Payback honnête : 12 000 / 1 348 ≈ 8,9 ans.
  assert.ok(r.amortissementAns > 8 && r.amortissementAns < 10, `amort ${r.amortissementAns}`);
  // Scénario prudent fioul à 1,15 €/L : économie plus basse mais positive.
  assert.ok(r.economieFioulNormalise > 800 && r.economieFioulNormalise < r.economieAn);
  // Chaudière standard (~15 ans) → remplacement forcé en année 5 dans la projection.
  assert.equal(r.anRemplacement, 5);
});

test("reste à charge et amortissement en fourchette (comme le prix)", () => {
  const r = calculerAmortissement({
    eChaufKwh: 16000, eEcsKwh: 3400, emetteurKey: "radiateurs_BT",
    energieActuelle: "fioul", consoReelle: 2500, typeChaudiereKey: "standard",
    avecEcs: true, prixCentral: 17000, prixFourchette: [15640, 18360], aidesTotales: 8000,
  });
  // reste = fourchette prix − aides
  assert.deepEqual(r.resteAChargeFourchette.map(Math.round), [7640, 10360]);
  assert.equal(r.resteAChargeFourchette[0] < r.resteACharge, true);
  assert.equal(r.resteACharge < r.resteAChargeFourchette[1], true);
  // amortissement : borne basse (prix bas) < borne haute (prix haut)
  assert.ok(r.amortissementFourchette[0] < r.amortissementFourchette[1]);
});

test("projection 10 ans : deux scénarios cumulés + point de croisement", () => {
  const r = calculerAmortissement({
    eChaufKwh: 16000,
    eEcsKwh: 3400,
    emetteurKey: "radiateurs_BT",
    energieActuelle: "gaz",
    consoReelle: 20000,
    typeChaudiereKey: "ancienne", // > 20 ans → remplacement dès l'année 1
    avecEcs: true,
    prixCentral: 17000,
    aidesTotales: 10800,
  });
  assert.equal(r.projection.length, 10);
  assert.equal(r.anRemplacement, 1);
  const last = r.projection[9];
  assert.ok(last.cumActuel > 0 && last.cumPac > 0);
  // Vieille chaudière + grosses aides → la PAC croise dans la fenêtre de 10 ans.
  assert.ok(r.crossover != null && r.crossover <= 10, `crossover ${r.crossover}`);
  assert.ok(r.diff10 > 0, `diff10 ${r.diff10}`);
  // Le cumul "rester" inclut le remplacement forcé (4 500 € gaz) dès l'année 1.
  assert.ok(r.projection[0].cumActuel > 4500);
});
