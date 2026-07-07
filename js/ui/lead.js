/**
 * Étape 6 — Gate & captation du lead (RGPD).
 *
 * Le montant des aides / reste à charge / amortissement n'est révélé qu'APRÈS
 * saisie des coordonnées + consentement explicite. Anonyme avant ce point.
 *
 * Version MVP : l'envoi est SIMULÉ (log console + confirmation). Un seul point
 * d'accroche `envoyerLead()` à rebrancher plus tard (Formspree / Netlify Forms / CRM).
 */

export function renderLeadForm(state) {
  const l = state.lead;
  return `
    <form id="lead-form" class="lead" novalidate>
      <p class="lead__hook">🔒 Dernière étape pour découvrir <strong>vos aides, votre reste à charge
      et votre temps d'amortissement</strong>.</p>

      <div class="field-row">
        <label class="field">
          <span>Prénom</span>
          <input type="text" data-bind="lead.prenom" value="${esc(l.prenom)}" autocomplete="given-name" required />
        </label>
        <label class="field">
          <span>Nom</span>
          <input type="text" data-bind="lead.nom" value="${esc(l.nom)}" autocomplete="family-name" required />
        </label>
      </div>

      <fieldset class="field">
        <legend>Comment souhaitez-vous recevoir votre estimation&nbsp;?</legend>
        <div class="segmented">
          <label><input type="radio" name="canal" data-bind="lead.canal" value="email" ${l.canal === "email" ? "checked" : ""} data-rerender /> Par e-mail</label>
          <label><input type="radio" name="canal" data-bind="lead.canal" value="rappel" ${l.canal === "rappel" ? "checked" : ""} data-rerender /> Être rappelé</label>
        </div>
      </fieldset>

      ${
        l.canal === "rappel"
          ? `<label class="field"><span>Téléphone</span>
               <input type="tel" data-bind="lead.tel" value="${esc(l.tel)}" autocomplete="tel" inputmode="tel" required /></label>`
          : `<label class="field"><span>E-mail</span>
               <input type="email" data-bind="lead.email" value="${esc(l.email)}" autocomplete="email" inputmode="email" required /></label>`
      }

      <label class="field">
        <span>Code postal</span>
        <input type="text" data-bind="lead.codePostal" value="${esc(l.codePostal)}" inputmode="numeric" pattern="\\d{5}" maxlength="5" required />
      </label>

      <label class="consent">
        <input type="checkbox" data-bind="lead.consent" data-type="bool" ${l.consent ? "checked" : ""} required />
        <span>J'accepte d'être recontacté(e) par Savelys au sujet de mon projet de pompe à chaleur.
        <a href="#rgpd" data-open="rgpd">En savoir plus (RGPD)</a>.</span>
      </label>

      <p id="lead-error" class="note note--error" hidden></p>

      <button type="submit" class="btn btn--primary btn--block">Voir mes aides &amp; mon estimation</button>
      <p class="note lead__legal">Devis gratuit et sans engagement. Aucune donnée n'est revendue.</p>
    </form>
  `;
}

/** Valide le formulaire lead. @returns {{ok:boolean, message?:string}} */
export function validateLead(state) {
  const l = state.lead;
  if (!l.prenom?.trim() || !l.nom?.trim()) {
    return { ok: false, message: "Merci d'indiquer votre prénom et votre nom." };
  }
  if (l.canal === "rappel") {
    if (!/^[+0-9 .()-]{6,}$/.test(l.tel || "")) {
      return { ok: false, message: "Merci d'indiquer un numéro de téléphone valide." };
    }
  } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.email || "")) {
    return { ok: false, message: "Merci d'indiquer une adresse e-mail valide." };
  }
  if (!/^\d{5}$/.test(l.codePostal || "")) {
    return { ok: false, message: "Merci d'indiquer un code postal valide (5 chiffres)." };
  }
  if (!l.consent) {
    return { ok: false, message: "Le consentement est nécessaire pour être recontacté(e)." };
  }
  return { ok: true };
}

/** Construit l'objet lead complet (config technique + résultats + contact). */
export function buildLeadPayload(state, results) {
  return {
    horodatage: new Date().toISOString(),
    contact: {
      prenom: state.lead.prenom,
      nom: state.lead.nom,
      canal: state.lead.canal,
      email: state.lead.canal === "email" ? state.lead.email : null,
      telephone: state.lead.canal === "rappel" ? state.lead.tel : null,
      codePostal: state.lead.codePostal,
      consentement: true,
    },
    logement: { ...state.logement },
    chauffage: { ...state.chauffage },
    besoins: { ...state.besoins },
    aides: { ...state.aides },
    resultats: {
      zone: results.zone?.libelle,
      deperditions_kW: round(results.dep.pDeperditionKW, 2),
      puissance_PAC_kW: results.dim.pCommercialeKW,
      prix_central: round(results.prix.prixCentral),
      fourchette: results.prix.fourchette.map((n) => round(n)),
      profil_ANAH: results.aides.profil,
      aides_totales: round(results.aides.aidesTotales),
      reste_a_charge: round(results.amort.resteACharge),
      economie_annuelle: round(results.amort.economieAn),
      amortissement_ans: results.amort.amortissementAns
        ? round(results.amort.amortissementAns, 1)
        : null,
    },
  };
}

/**
 * "Envoi" du lead — SIMULÉ pour le MVP.
 * Point unique à rebrancher plus tard vers Formspree / Netlify Forms / CRM.
 */
export async function envoyerLead(payload) {
  // eslint-disable-next-line no-console
  console.info("[LEAD SIMULÉ] à transmettre à Savelys :", payload);
  await new Promise((r) => setTimeout(r, 350)); // simule la latence réseau
  return { ok: true };
}

/* --- utils --- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function round(n, d = 0) {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
}
