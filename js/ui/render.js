/**
 * Helpers d'affichage et rendu des cartes de résultats.
 * Aucune logique métier ici : uniquement de la mise en forme.
 */

import { MAJ_TARIFS } from "../constants.js";
import { BAREME_DATE } from "../data/aides-baremes.js";

/* --- Formatteurs --- */
const eur0 = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export const fmtEuro = (n) => eur0.format(Math.round(Number(n) || 0));
export const fmtEuroRange = ([a, b]) => `${fmtEuro(a)} – ${fmtEuro(b)}`;
export const fmtKw = (n) => `${nf1.format(Number(n) || 0)} kW`;
export const fmtKwh = (n) => `${nf0.format(Number(n) || 0)} kWh`;
export const fmtAns = (n) =>
  n == null ? "—" : `${nf1.format(n)} an${n >= 2 ? "s" : ""}`;

/** Petit helper de création d'élément depuis une chaîne HTML. */
export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* --- Pré-résultat (Étape 4, ouvert / anonyme) --- */
export function renderPreResultat(r) {
  const avert = r.dep.avertissement
    ? `<p class="note note--warn">⚠️ Écart notable entre l'estimation par facture et par surface : estimation à affiner lors de la visite technique.</p>`
    : "";
  return `
    <div class="result-grid">
      <div class="stat">
        <span class="stat__label">Déperditions estimées</span>
        <span class="stat__value">${fmtKw(r.dep.pDeperditionKW)}</span>
        <span class="stat__hint">Méthode ${r.dep.methode === "A" ? "facture" : "surface"}</span>
      </div>
      <div class="stat">
        <span class="stat__label">Puissance PAC recommandée</span>
        <span class="stat__value">${r.dim.pCommercialeKW} kW</span>
        <span class="stat__hint">calcul ${fmtKw(r.dim.pPacKW)}</span>
      </div>
      <div class="stat stat--accent">
        <span class="stat__label">Budget estimatif (pose comprise)</span>
        <span class="stat__value">${fmtEuroRange(r.prix.fourchette)}</span>
        <span class="stat__hint">Estimation non contractuelle</span>
      </div>
    </div>
    ${avert}
  `;
}

/* --- Badge profil ANAH --- */
export function renderProfilBadge(aides) {
  return `<span class="badge badge--${aides.profil}">${aides.profilLabel}</span>`;
}

/* --- Résultat final (Étape 6, après le gate) --- */
export function renderResultatFinal(r) {
  const a = r.aides;
  const m = r.amort;
  const ecrete = a.ecrete
    ? `<span class="stat__hint">plafonné (écrêtement — reste à charge min. ${Math.round(a.resteMin * 100)} %)</span>`
    : "";

  const lignesAides = [
    ["MaPrimeRénov' (par geste)", a.mpr],
    ["CEE — Coup de pouce chauffage", a.cee],
    a.bonusFioul ? ["Bonus dépose cuve fioul", a.bonusFioul] : null,
  ]
    .filter(Boolean)
    .map(([k, v]) => `<li><span>${k}</span><span>${fmtEuro(v)}</span></li>`)
    .join("");

  return `
    <div class="result-final">
      <div class="result-head">
        <span>Profil d'aides</span> ${renderProfilBadge(a)}
      </div>

      <ul class="breakdown">
        ${lignesAides}
        <li class="breakdown__total"><span>Total des aides estimées</span><span>${fmtEuro(a.aidesTotales)}</span></li>
      </ul>
      ${ecrete}

      <div class="result-grid">
        <div class="stat">
          <span class="stat__label">Reste à charge estimé</span>
          <span class="stat__value">${fmtEuro(m.resteACharge)}</span>
          <span class="stat__hint">après aides</span>
        </div>
        <div class="stat stat--success">
          <span class="stat__label">Économies annuelles</span>
          <span class="stat__value">${fmtEuro(m.economieAn)}<span class="stat__unit">/an</span></span>
          <span class="stat__hint">vs énergie actuelle</span>
        </div>
        <div class="stat stat--accent">
          <span class="stat__label">Amortissement</span>
          <span class="stat__value">${fmtAns(m.amortissementAns)}</span>
          <span class="stat__hint">SCOP ${nf1.format(m.scop)}</span>
        </div>
      </div>

      ${renderProjection(m.projection)}
    </div>
  `;
}

/** Mini-graphe SVG de la projection cumulée sur 10 ans (économies − reste à charge). */
export function renderProjection(projection) {
  if (!projection || !projection.length) return "";
  const w = 320;
  const h = 120;
  const pad = 8;
  const xs = projection.map((p) => p.annee);
  const ys = projection.map((p) => p.cumul);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const spanY = maxY - minY || 1;
  const x = (a) => pad + ((a - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (w - 2 * pad);
  const y = (v) => h - pad - ((v - minY) / spanY) * (h - 2 * pad);
  const zeroY = y(0);
  const pts = projection.map((p) => `${x(p.annee).toFixed(1)},${y(p.cumul).toFixed(1)}`).join(" ");
  const breakEven = projection.find((p) => p.cumul >= 0);

  return `
    <figure class="projection">
      <figcaption>Projection cumulée sur 10 ans</figcaption>
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Courbe de rentabilité cumulée">
        <line x1="${pad}" y1="${zeroY}" x2="${w - pad}" y2="${zeroY}" class="axis" />
        <polyline points="${pts}" class="curve" fill="none" />
        ${breakEven ? `<circle cx="${x(breakEven.annee).toFixed(1)}" cy="${zeroY}" r="4" class="dot" />` : ""}
      </svg>
      <p class="note">${breakEven ? `Rentable dès l'année ${breakEven.annee}.` : "Rentabilité au-delà de 10 ans."}</p>
    </figure>
  `;
}

/** Pied de page daté (tarifs & barèmes). */
export function renderDatation() {
  return `Tarifs énergie : ${MAJ_TARIFS} · Barèmes aides : ${BAREME_DATE}.`;
}
