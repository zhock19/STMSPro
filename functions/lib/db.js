const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const COLLECTIONS = {
  tournaments: "tournaments",
  teams: "teams",
  schedule: "schedule",
  standings: "standings",
  registrations: "registrations",
  announcements: "announcements",
  auditLog: "auditLog",
  coachAccounts: "coachAccounts",
  officialAccounts: "officialAccounts",
};

/** Next numeric id for a collection keyed by numeric `id` field (mirrors the
 *  gwapo.html *IdCounter pattern — counts up from the current max). */
async function nextId(collectionName) {
  const snap = await db.collection(collectionName).get();
  let max = 0;
  snap.forEach((doc) => {
    const id = Number(doc.data().id);
    if (Number.isFinite(id) && id > max) max = id;
  });
  return max + 1;
}

/** Append one entry to the auditLog collection — mirrors logAudit() in gwapo.html. */
async function logAudit(action, details, actor) {
  const id = await nextId(COLLECTIONS.auditLog);
  await db.collection(COLLECTIONS.auditLog).doc(String(id)).set({
    id,
    action,
    details,
    actor: actor || "API",
    when: new Date().toISOString(),
  });
}

/** Push one announcement — mirrors announcements.unshift(...) in gwapo.html. */
async function pushAnnouncement(fields) {
  const id = await nextId(COLLECTIONS.announcements);
  await db.collection(COLLECTIONS.announcements).doc(String(id)).set({
    id,
    ...fields,
  });
}

module.exports = { admin, db, COLLECTIONS, nextId, logAudit, pushAnnouncement };
