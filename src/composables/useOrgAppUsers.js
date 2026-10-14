// Utilisateurs de l'app mobile de l'event parmi les MEMBRES des organisateurs,
// inscrits ou non. Source : organization(id).members -> contact.apps
// (cf. fetchOrganizationMembersWithApps). Complete useViewerMembers.mobileAppUsers
// (viewers live/replay non inscrits) : un membre non inscrit qui a seulement
// ouvert l'app (programme, exposants...) sans regarder de video est desormais
// visible.
//
// Ne retourne que les NON inscrits : un membre dont le contact (ou l'email) est
// porte par un delegue de l'event est deja compte par computeStats via
// delegate.contact.apps.
//
// Lifte dans StatisticsView (comme useViewerMembers). Chargement unique a
// l'arrivee de la config (organisateurs + mobileApplicationId), pas d'auto-refresh
// (lastUsed bouge peu, et la liste des membres est volumineuse).

import { ref, computed, readonly, watch } from "vue";
import { fetchOrganizationMembersWithApps } from "@/api/graphql.js";
import { toEpochMs } from "@/utils/parisTime.js";
import { debug } from "@/utils/debug.js";

const normEmail = (v) => String(v || "").trim().toLowerCase();

export function useOrgAppUsers({ isReady, getOrganizerIds, getMobileAppId, getDelegates }) {
  const loading = ref(false);
  const error = ref(null);
  const progress = ref({ loaded: 0, total: 0 });
  // contactId -> { contact, membership } (membres ayant au moins une app)
  const membersWithApps = ref(new Map());
  const loadedKey = ref("");

  async function load(orgIds, appId) {
    const key = `${orgIds.join(",")}|${appId}`;
    if (loading.value || loadedKey.value === key) return;
    loading.value = true;
    error.value = null;
    progress.value = { loaded: 0, total: 0 };
    const next = new Map();
    try {
      let base = 0;
      for (const orgId of orgIds) {
        const items = await fetchOrganizationMembersWithApps(orgId, {
          onProgress: (p) => { progress.value = { loaded: base + p.loaded, total: base + p.total }; },
        });
        base += items.length;
        for (const { contact, membership } of items) {
          if (!contact?.id || !(contact.apps || []).length) continue;
          if (!next.has(contact.id)) next.set(contact.id, { contact, membership });
        }
      }
      membersWithApps.value = next;
      loadedKey.value = key;
      debug.log(`[OrgAppUsers] ${base} membres lus, ${next.size} avec au moins une app.`);
    } catch (e) {
      error.value = e?.message || String(e);
      console.warn("[OrgAppUsers] Échec de lecture des membres / apps :", error.value);
    } finally {
      loading.value = false;
    }
  }

  watch(
    () => [isReady(), (getOrganizerIds() || []).join(","), getMobileAppId()],
    ([ready, orgs, appId]) => {
      if (ready && orgs && appId) load(orgs.split(","), appId);
    },
    { immediate: true },
  );

  // Contacts et emails deja portes par un delegue de l'event (= inscrits).
  const registeredKeys = computed(() => {
    const contactIds = new Set();
    const emails = new Set();
    for (const d of getDelegates() || []) {
      if (d.contactId) contactIds.add(d.contactId);
      for (const v of [d.email, ...(d.contact?.emailAddresses || []).map((x) => x?.value)]) {
        const e = normEmail(v);
        if (e) emails.add(e);
      }
    }
    return { contactIds, emails };
  });

  // Membres NON inscrits ayant utilise l'app de l'event (toutes dates ; la borne
  // < 3 mois est appliquee par les consommateurs). Meme forme que
  // useViewerMembers.mobileAppUsersAll.
  const users = computed(() => {
    const appId = getMobileAppId();
    if (!appId) return [];
    const { contactIds, emails } = registeredKeys.value;
    const out = [];
    for (const { contact: c, membership: m } of membersWithApps.value.values()) {
      if (contactIds.has(c.id)) continue;
      // Email commun avec un delegue = inscrit sous un autre contact (doublon,
      // changement d'email) -> deja compte cote inscrits.
      const email = c.email?.value || c.emailAddresses?.[0]?.value || "";
      const allEmails = [c.email?.value, ...(c.emailAddresses || []).map((x) => x?.value)].map(normEmail).filter(Boolean);
      if (allEmails.some((e) => emails.has(e))) continue;
      const app = (c.apps || []).find((a) => a?.id === appId && a.lastUsed);
      const lastUsedMs = app ? toEpochMs(app.lastUsed) : null;
      if (!lastUsedMs) continue;
      out.push({
        contactId: c.id,
        status: m && !m.expired ? "member" : "formerMember",
        givenName: c.givenName || "",
        familyName: c.familyName || "",
        title: c.honorificPrefix || "",
        email,
        countryCode: c.address?.countryCode || "",
        externalIds: c.externalIds || [],
        lastUsed: app.lastUsed,
        lastUsedMs,
        version: app.version || "",
        platform: app.platform || "",
        source: "members",
      });
    }
    return out;
  });

  return {
    users,
    loading: readonly(loading),
    error: readonly(error),
    progress: readonly(progress),
  };
}
