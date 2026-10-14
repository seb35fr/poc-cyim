import { ref, computed, readonly, watch } from "vue";
import { fetchContactsByAccountIds } from "@/api/graphql.js";
import { getKeycloakIds, getRpps } from "@/utils/viewerJoin.js";
import { toEpochMs } from "@/utils/parisTime.js";
import { debug } from "@/utils/debug.js";

// Viewers live/replay NON inscrits mais MEMBRES de l'organisateur de l'event.
//
// Cas metier (ex. JFR) : l'acces au replay (et au live) est inclus dans les
// droits d'un membre a jour de cotisation — il peut consulter sans etre inscrit
// au congres, donc sans delegue. Sans traitement, ces viewers tombent en
// "non rapproche" et sont absents du Total participants.
//
// Principe : pour chaque user_id ES (= compte Keycloak) qui ne matche AUCUN
// delegue, on resout le contact (`contactByAccountId`) + son adhesion a chaque
// organisateur de l'event (`membership(organizationId, includeFormer: true)`).
// Un contact dont l'adhesion couvre la periode de consultation (ou est encore
// active aujourd'hui) devient un "pseudo-delegue" membre (`isMemberViewer`),
// injecte UNIQUEMENT dans les populations de jointure viewers (Live / Replay /
// Total participants / exports de presence) — jamais dans les stats registration.
//
// Statuts d'un viewer non rapproche :
//   - relinked      : en fait un DELEGUE de l'event, dont le compte Keycloak est
//                     porte par un AUTRE contact (doublon) -> rattache au delegue
//   - member        : contact + adhesion active a la consultation -> compte
//   - formerMember  : adhesion a l'organisateur mais expiree avant la consultation
//   - contact       : contact trouve, aucune adhesion a l'organisateur
//   - notFound      : aucun contact pour ce compte Keycloak
//
// Rattachement "relinked" - cause : doublons de contacts cote service contacts.
// Avant la MR contacts `feature/contact-dedup` (V. Gouleau, non mergee au
// 2026-10-13), l'upsert d'un compte Keycloak cherchait le contact existant par
// l'ADRESSE email de type ACCOUNT, pas par l'id de compte. Quand l'email du
// compte ne correspondait a aucun email ACCOUNT existant (email change dans
// Keycloak, ou email deja present sur le contact du delegue comme email
// secondaire), un 2e contact etait cree avec le compte Keycloak -> le contact du
// delegue ne porte pas ce compte, la jointure echoue. La MR evite les futurs
// doublons mais ne nettoie pas l'existant : on rattache donc cote client, par
// ordre de fiabilite : contactId identique, puis email (ES user_email ou emails
// du contact resolu) present sur le delegue, puis RPPS, puis NOM.
//
// 2e cause (confirmee sur JFR Radiologie 2026) : changement d'email du delegue
// cote registration. Le hook pre("save") de registration/models/delegate.ts remet
// `contactId = null` des que l'email change (CHOIX DE SECURITE delibere : ne
// jamais reattribuer un compte Keycloak sur un changement d'email fait par le
// support -> risque de prise de compte) -> le delegue est rattache a un
// NOUVEAU contact (nouvel email, nouveau compte) ; l'ancien contact garde le
// compte Keycloak utilise pour regarder le replay. Aucun identifiant commun ne
// subsiste (l'index ES n'a que user_id/email/nom issus de Keycloak) : seul le nom
// relie les deux. Rattachement par nom => methode "name" (probable), accepte
// UNIQUEMENT si le nom normalise est porte par UN SEUL delegue de l'event
// (homonymes -> pas de rattachement).
//
// Cache par accountId (instance du composable) : un refresh ne re-resout que
// les nouveaux viewers. Instancie dans StatisticsView (lifted), comme useLive.
const normEmail = (v) => {
  const e = String(v || "").trim().toLowerCase();
  return e && e !== "-" && e.includes("@") ? e : "";
};

// Nom normalise pour le rattachement : minuscules, sans accents ni ponctuation,
// espaces simples, mots tries (insensible a l'ordre prenom/nom).
const normName = (v) => {
  const words = String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.length >= 2 ? words.sort().join(" ") : "";
};

export function useViewerMembers({ isReady, getHits, getDelegates, getOrganizerIds, getMobileAppId = () => null }) {
  const loading = ref(false);
  const progress = ref({ loaded: 0, total: 0 });
  const error = ref(null);
  // accountId -> { contact, memberships } | null (cf. fetchContactsByAccountIds)
  const resolved = ref(new Map());

  // Fenetre de consultation par compte Keycloak (min/max epoch ms), toutes vues
  // live + replay confondues. Sert a juger l'adhesion "a la date de consultation".
  const viewWindows = computed(() => {
    const map = new Map();
    for (const h of getHits() || []) {
      const s = h?._source || {};
      const id = s.user_id || s.user_identity_id;
      if (!id) continue;
      const ms = toEpochMs(s.timestamp || s["@timestamp"] || s.session_end || s.session_start);
      const w = map.get(id) || { first: null, last: null };
      if (Number.isFinite(ms)) {
        if (w.first == null || ms < w.first) w.first = ms;
        if (w.last == null || ms > w.last) w.last = ms;
      }
      map.set(id, w);
    }
    return map;
  });

  // Comptes Keycloak connus cote delegues (meme regle que viewerJoin).
  const delegateKcIds = computed(() => {
    const set = new Set();
    for (const d of getDelegates() || []) for (const id of getKeycloakIds(d)) set.add(id);
    return set;
  });
  // Index des delegues pour le rattachement des doublons de contacts.
  const delegateIndex = computed(() => {
    const byContactId = new Map();
    const byEmail = new Map();
    const byRpps = new Map();
    // nom normalise -> delegue, ou null si plusieurs delegues le portent (homonymes).
    const byName = new Map();
    const setOnce = (map, key, d) => { if (key && !map.has(key)) map.set(key, d); };
    for (const d of getDelegates() || []) {
      setOnce(byContactId, d.contactId, d);
      setOnce(byEmail, normEmail(d.email), d);
      for (const e of d.contact?.emailAddresses || []) setOnce(byEmail, normEmail(e?.value), d);
      setOnce(byRpps, getRpps(d), d);
      const name = normName(`${d.givenName || ""} ${d.familyName || ""}`);
      if (name) byName.set(name, byName.has(name) && byName.get(name)?.id !== d.id ? null : d);
    }
    return { byContactId, byEmail, byRpps, byName };
  });

  // Emails vus dans l'index ES (user_email) par compte Keycloak.
  const esEmails = computed(() => {
    const map = new Map();
    for (const h of getHits() || []) {
      const s = h?._source || {};
      const id = s.user_id || s.user_identity_id;
      const email = normEmail(s.user_email);
      if (!id || !email) continue;
      if (!map.has(id)) map.set(id, new Set());
      map.get(id).add(email);
    }
    return map;
  });

  // Noms vus dans l'index ES par compte Keycloak. user_fullName est de la forme
  // "prenom nom (user_id)" (cf. stats_vod_views.sql) -> suffixe retire.
  const esNames = computed(() => {
    const map = new Map();
    for (const h of getHits() || []) {
      const s = h?._source || {};
      const id = s.user_id || s.user_identity_id;
      const raw = s.user_fullName || [s.user_firstName, s.user_lastName].filter(Boolean).join(" ");
      const name = normName(String(raw || "").replace(/\s*\([^)]*\)\s*$/, ""));
      if (!id || !name) continue;
      if (!map.has(id)) map.set(id, new Set());
      map.get(id).add(name);
    }
    return map;
  });

  // Delegue correspondant a un viewer non rapproche, ou null. Retourne
  // { delegate, method } (method = contactId | esEmail | contactEmail | rpps).
  function findDelegateFor(kcId, contact) {
    const idx = delegateIndex.value;
    if (contact?.id && idx.byContactId.has(contact.id)) return { delegate: idx.byContactId.get(contact.id), method: "contactId" };
    for (const e of esEmails.value.get(kcId) || []) {
      if (idx.byEmail.has(e)) return { delegate: idx.byEmail.get(e), method: "esEmail" };
    }
    for (const e of contact?.emailAddresses || []) {
      const k = normEmail(e?.value);
      if (k && idx.byEmail.has(k)) return { delegate: idx.byEmail.get(k), method: "contactEmail" };
    }
    const rpps = (contact?.externalIds || []).find((x) => String(x?.type).toUpperCase() === "RPPS")?.value;
    if (rpps && idx.byRpps.has(rpps)) return { delegate: idx.byRpps.get(rpps), method: "rpps" };
    // Dernier recours : nom (contact resolu, sinon ES), unique parmi les delegues.
    const names = new Set(esNames.value.get(kcId) || []);
    const contactName = normName(`${contact?.givenName || ""} ${contact?.familyName || ""}`);
    if (contactName) names.add(contactName);
    for (const n of names) {
      const d = idx.byName.get(n);
      if (d) return { delegate: d, method: "name" };
    }
    return null;
  }

  const unmatchedIds = computed(() => {
    const out = [];
    for (const id of viewWindows.value.keys()) if (!delegateKcIds.value.has(id)) out.push(id);
    return out;
  });

  function isActiveForViews(m, w) {
    if (!m) return false;
    if (m.expired === false) return true;
    if (!w || w.first == null) return false;
    const start = m.start ? toEpochMs(m.start) : null;
    const end = m.end ? toEpochMs(m.end) : null;
    return (start == null || start <= w.last) && (end == null || end >= w.first);
  }

  // kcId -> { status, delegate? (pseudo-delegue si member, alias si relinked), membership? }
  const classification = computed(() => {
    const out = new Map();
    const pseudoByContact = new Map();
    // Alias de delegues rattaches : copie superficielle du delegue (MEME id) qui
    // porte en plus le(s) compte(s) Keycloak du doublon -> viewerJoin l'indexe
    // sous ce compte ; la dedup par delegate.id evite tout double comptage.
    const aliasByDelegate = new Map();
    const relink = (kcId, match, contactId) => {
      const d = match.delegate;
      let alias = aliasByDelegate.get(d.id);
      if (!alias) {
        alias = {
          ...d,
          isViewerAlias: true,
          contact: { ...(d.contact || {}), emailAddresses: [] },
        };
        aliasByDelegate.set(d.id, alias);
      }
      alias.contact.emailAddresses.push({ value: d.email || "", source: { id: kcId, type: "ACCOUNT" } });
      out.set(kcId, { status: "relinked", method: match.method, contactId: contactId || "", delegate: alias });
    };
    for (const kcId of unmatchedIds.value) {
      const r = resolved.value.get(kcId);
      // Rattachement par email ES possible avant meme la resolution du contact.
      const match = findDelegateFor(kcId, r?.contact || null);
      if (match) { relink(kcId, match, r?.contact?.id); continue; }
      if (!resolved.value.has(kcId)) continue; // pas (encore) resolu
      if (!r?.contact) { out.set(kcId, { status: "notFound" }); continue; }
      const c = r.contact;
      if (!r.memberships.length) { out.set(kcId, { status: "contact", contactId: c.id }); continue; }
      const w = viewWindows.value.get(kcId);
      const active = r.memberships.find((m) => isActiveForViews(m, w));
      if (!active) { out.set(kcId, { status: "formerMember", contactId: c.id, membership: r.memberships[0] }); continue; }

      // Un contact peut avoir plusieurs comptes Keycloak : un seul pseudo-delegue
      // (meme id) indexe sous chacun de ses comptes.
      let pseudo = pseudoByContact.get(c.id);
      if (!pseudo) {
        const email = c.email?.value || "";
        pseudo = {
          id: `member:${c.id}`,
          isMemberViewer: true,
          status: "member",
          contactId: c.id,
          givenName: c.givenName || "",
          familyName: c.familyName || "",
          title: c.honorificPrefix || "",
          email,
          company: "",
          occupation: "",
          jobTitle: "",
          qualification: "",
          practiceModes: [],
          categories: [],
          registrations: [],
          badges: [],
          checkedInDate: null,
          primaryAddress: c.address
            ? {
                countryCode: c.address.countryCode || null,
                city: c.address.city || null,
                zipCode: c.address.postalCode || null,
                country: { code: c.address.countryCode || null },
              }
            : null,
          membership: {
            type: active.type || "",
            start: active.start || null,
            end: active.end || null,
            organizationId: active.organization?.id || null,
          },
          contact: { externalIds: c.externalIds || [], emailAddresses: [] },
        };
        pseudoByContact.set(c.id, pseudo);
      }
      // source ACCOUNT = compte Keycloak du viewer -> la jointure viewerJoin /
      // buildSessionAttendance (emailAddresses[].source.id) le retrouve.
      pseudo.contact.emailAddresses.push({ value: pseudo.email, source: { id: kcId, type: "ACCOUNT" } });
      out.set(kcId, { status: "member", contactId: c.id, delegate: pseudo, membership: active });
    }
    return { byKcId: out, members: [...pseudoByContact.values()], aliases: [...aliasByDelegate.values()] };
  });

  // Alias des delegues rattaches (doublons de contacts) - a concatener aux
  // delegues pour toute jointure viewers, filtres comme leur delegue (badge).
  const aliasDelegates = computed(() => classification.value.aliases);

  // Pseudo-delegues membres (1 par contact) — a concatener aux delegues pour
  // toute jointure viewers.
  const memberDelegates = computed(() => classification.value.members);

  // Compteurs par statut (en comptes Keycloak distincts) pour la transparence UI.
  const counts = computed(() => {
    const c = { relinked: 0, relinkedByName: 0, member: 0, formerMember: 0, contact: 0, notFound: 0, pending: 0, members: 0 };
    for (const id of unmatchedIds.value) {
      const e = classification.value.byKcId.get(id);
      if (!e) c.pending++;
      else c[e.status]++;
      if (e?.method === "name") c.relinkedByName++;
    }
    c.members = memberDelegates.value.length; // contacts distincts
    return c;
  });

  let running = false;
  let rerun = false;
  async function resolveMissing() {
    if (!isReady()) return;
    if (running) { rerun = true; return; }
    const orgIds = getOrganizerIds() || [];
    const missing = unmatchedIds.value.filter((id) => !resolved.value.has(id));
    if (missing.length === 0) return;
    running = true;
    loading.value = true;
    error.value = null;
    progress.value = { loaded: 0, total: missing.length };
    try {
      const res = await fetchContactsByAccountIds(missing, orgIds, {
        onProgress: (p) => { progress.value = p; },
      });
      const next = new Map(resolved.value);
      for (const [k, v] of res) next.set(k, v);
      resolved.value = next;
      debug.log(
        `[ViewerMembers] ${missing.length} viewers non rapprochés résolus ` +
          `(${orgIds.length} organisateur(s)) :`,
        counts.value,
      );
    } catch (e) {
      error.value = e?.message || String(e);
      console.warn("[ViewerMembers] Échec de résolution des contacts :", error.value);
    } finally {
      running = false;
      loading.value = false;
      if (rerun) { rerun = false; resolveMissing(); }
    }
  }

  // Relance a chaque changement de population (chargement initial, refresh,
  // config organisateurs arrivee). Seuls les comptes non encore resolus partent.
  watch(
    () => [isReady(), unmatchedIds.value.length, (getOrganizerIds() || []).join(",")],
    ([ready], prev) => {
      // Si la liste d'organisateurs change, les adhesions deja resolues ne sont
      // plus valides -> on vide le cache.
      if (prev && prev[2] !== (getOrganizerIds() || []).join(",")) resolved.value = new Map();
      if (ready) resolveMissing();
    },
    { immediate: true },
  );

  // Utilisateurs de l'app mobile de l'event NON inscrits : parmi les viewers
  // live/replay sans delegue (hors rattaches a un delegue en doublon, deja
  // couverts par leur delegue), ceux dont le contact resolu a une entree
  // `apps` = mobileApplicationId avec lastUsed < 3 mois (meme regle que le KPI
  // inscrits de computeStats). Dedoublonne par contact. MINIMUM : un
  // utilisateur de l'app qui n'a consulte ni live ni replay reste invisible
  // (aucune requete ne liste les utilisateurs d'une app).
  // mobileAppUsersAll : toute utilisation connue (sans borne de date, pour
  // l'export « toutes dates ») ; mobileAppUsers : < 3 mois (KPI).
  const mobileAppUsersAll = computed(() => {
    const appId = getMobileAppId();
    if (!appId) return [];
    const byContact = new Map();
    for (const kcId of unmatchedIds.value) {
      const status = classification.value.byKcId.get(kcId)?.status;
      if (!status || status === "relinked") continue;
      const c = resolved.value.get(kcId)?.contact;
      if (!c?.id || byContact.has(c.id)) continue;
      const app = (c.apps || []).find((a) => a?.id === appId && a.lastUsed);
      const lastUsedMs = app ? toEpochMs(app.lastUsed) : null;
      if (!lastUsedMs) continue;
      byContact.set(c.id, {
        kcId,
        contactId: c.id,
        status, // member | formerMember | contact
        givenName: c.givenName || "",
        familyName: c.familyName || "",
        title: c.honorificPrefix || "",
        email: c.email?.value || c.emailAddresses?.[0]?.value || "",
        countryCode: c.address?.countryCode || "",
        externalIds: c.externalIds || [],
        lastUsed: app.lastUsed,
        lastUsedMs,
        version: app.version || "",
        platform: app.platform || "",
      });
    }
    return [...byContact.values()];
  });
  const mobileAppUsers = computed(() => {
    const since = new Date();
    since.setMonth(since.getMonth() - 3);
    return mobileAppUsersAll.value.filter((u) => u.lastUsedMs >= since.getTime());
  });

  return {
    mobileAppUsers,
    mobileAppUsersAll,
    loading: readonly(loading),
    progress: readonly(progress),
    error: readonly(error),
    memberDelegates,
    aliasDelegates,
    classification,
    counts,
  };
}
