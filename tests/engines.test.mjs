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
import { estimerPrix, puissanceCommercialeChauffage } from "../js/engines/prix.js";
import { determinerProfil, calculerAides, seuilsPourFoyer, ceeSavelys } from "../js/engines/aides.js";
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

/* --- Moteur 3 : prix (modèle étude 2026 : matériel + accessoires + pose, TVA 5,5 %) --- */
test("prix : puissance de chauffage retenue depuis la déperdition", () => {
  assert.equal(puissanceCommercialeChauffage(11.5), 11); // 11.5×0.9=10.35 → 11 kW
  assert.equal(puissanceCommercialeChauffage(5), 6);
  assert.equal(puissanceCommercialeChauffage(20), 16);
});

test("prix : cas de référence (11,5 kW, fonte HT, province) ≈ 16 000 € TTC central", () => {
  const p = estimerPrix({ pDeperditionKW: 11.5, emetteurKey: "radiateurs_fonte_HT" });
  assert.equal(p.puissanceKW, 11);
  // HT 11 kW : matériel 11000-13500 + acc 650-1200 + pose 1500-2500, ×1,055
  assert.ok(approx(p.fourchette[0], 13873, 1), `bas ${p.fourchette[0]}`);
  assert.ok(approx(p.fourchette[1], 18147, 1), `haut ${p.fourchette[1]}`);
  assert.ok(approx(p.prixCentral, 16010, 1), `central ${p.prixCentral}`);
});

test("prix : émetteur BT moins cher que fonte HT ; IDF plus cher que province", () => {
  const bt = estimerPrix({ pDeperditionKW: 11.5, emetteurKey: "radiateurs_BT" });
  const ht = estimerPrix({ pDeperditionKW: 11.5, emetteurKey: "radiateurs_fonte_HT" });
  assert.ok(bt.prixCentral < ht.prixCentral);

  const prov = estimerPrix({ pDeperditionKW: 8, emetteurKey: "radiateurs_BT" });
  const idf = estimerPrix({ pDeperditionKW: 8, emetteurKey: "radiateurs_BT", idf: true });
  assert.ok(idf.prixCentral > prov.prixCentral);
  assert.ok(idf.fourchette[0] < idf.fourchette[1]);
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

test("CEE prudent : on annonce toujours la valeur la plus basse (tranche petite)", () => {
  // Même à grande surface (> 90 m²), le CEE annoncé retient la tranche basse.
  const bleuH1 = ceeSavelys("H1", 150, "bleu"); // prudent par défaut
  assert.equal(bleuH1, 4237); // H1 "petite" très modeste (et non 7272)
  // Le montant réel selon surface reste accessible via prudent=false.
  assert.equal(ceeSavelys("H1", 150, "bleu", false), 7272); // H1 "grande" très modeste
  // Distinction très modeste ≠ autres conservée.
  assert.equal(ceeSavelys("H2", 80, "violet"), 2386); // H2 petite autres
  assert.equal(ceeSavelys("H2", 120, "violet"), 2386); // prudent : reste petite
});

test("aides + écrêtement (profil bleu, fioul, CEE prudent)", () => {
  const a = calculerAides({
    rfr: 20000,
    nbPersonnes: 2,
    energieActuelle: "fioul",
    prixCentral: 10000, // dépense éligible 10 000 → plafond bleu 9 000
    zone: "H1",
    surface: 150,
  });
  assert.equal(a.profil, "bleu");
  assert.equal(a.mpr, 5000);
  assert.equal(a.cee, 4237); // CEE prudent (petite), pas 7272
  assert.equal(a.bonusFioul, 1200);
  assert.equal(a.aidesBrutes, 10437);
  assert.equal(a.depenseEligible, 10000);
  assert.ok(approx(a.plafondEcretement, 9000, 1));
  assert.equal(a.aidesTotales, 9000); // écrêté à 90 % de la dépense éligible
  assert.equal(a.ecrete, true);
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
  assert.equal(a.cee, 2864); // H1 "petite" autres (CEE prudent)
});

/* --- Moteur 4 : économies & amortissement (méthode PacCloser) --- */
test("coût énergie actuelle : tables PacCloser (prix + abonnement)", () => {
  // Fioul : 2000 L × 10 kWh/L × 0,141 €/kWh (= 1,41 €/L), pas d'abonnement.
  assert.ok(approx(coutEnergieActuelle("fioul", 2000), 2820, 0.01));
  // Gaz : 20 000 kWh × 0,12766 + abonnement 359,63.
  assert.ok(approx(coutEnergieActuelle("gaz", 20000), 2912.83, 0.01));
  // Propane : 1500 kg × 12,87 kWh × 0,1865 + abonnement 120.
  assert.ok(approx(coutEnergieActuelle("propane", 1500), 3720.53, 0.5), coutEnergieActuelle("propane", 1500));
});

test("propane : conversion kg → kWh (PCI 12,87)", () => {
  assert.ok(approx(consoEnKwh("propane", 1000), 12870, 0.01));
  assert.equal(consoEnKwh("gaz", 15000), 15000);
});

test("économies : SCOP saisonnier réel dégradé par zone (aligné outil terrain)", () => {
  // 3000 L fioul, chaudière standard, radiateurs fonte HT, zone H2 → SCOP réel ≈ 2,5.
  const r = calculerAmortissement({
    eChaufKwh: 22100, eEcsKwh: 2800, emetteurKey: "radiateurs_fonte_HT",
    energieActuelle: "fioul", consoReelle: 3000, typeChaudiereKey: "standard",
    avecEcs: true, zone: "H2", prixCentral: 16000, aidesTotales: 8095,
  });
  // SCOP nominal 2,9 × 0,86 (H2) ≈ 2,5 comme le rapport PacCloser de référence.
  assert.ok(approx(r.scop, 2.494, 0.01), `scop ${r.scop}`);
  assert.ok(approx(r.coutActuel, 4230, 0.5), `coutActuel ${r.coutActuel}`);
  // Économie ≈ 2 160 €/an (référence terrain : 2 188) — plus prudent qu'avant (2 424).
  assert.ok(r.economieAn > 2050 && r.economieAn < 2280, `économie ${r.economieAn}`);
  assert.ok(r.economieFioulNormalise < r.economieAn);
});

test("économies : cas 1600 L fioul (prudent, SCOP réel)", () => {
  const r = calculerAmortissement({
    eChaufKwh: 10480, eEcsKwh: 2800, emetteurKey: "radiateurs_BT",
    energieActuelle: "fioul", consoReelle: 1600, typeChaudiereKey: "standard",
    avecEcs: true, zone: "H2", prixCentral: 15000, aidesTotales: 3000,
  });
  assert.ok(approx(r.coutActuel, 2256, 0.5), `coutActuel ${r.coutActuel}`);
  // SCOP réel 3,5×0,86 ≈ 3,01 → économie ≈ 1 250 €/an (plus prudent que 1 348).
  assert.ok(r.economieAn > 1150 && r.economieAn < 1330, `économie ${r.economieAn}`);
  assert.ok(r.amortissementAns > 9 && r.amortissementAns < 11, `amort ${r.amortissementAns}`);
  assert.equal(r.anRemplacement, 5); // chaudière standard (~15 ans)
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
