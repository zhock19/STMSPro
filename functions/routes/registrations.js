const express = require("express");
const { db, COLLECTIONS, nextId, logAudit, pushAnnouncement } = require("../lib/db");

const router = express.Router();
const col = () => db.collection(COLLECTIONS.registrations);

function stripPassword(reg) {
  if (!reg) return reg;
  const { password, ...rest } = reg;
  return rest;
}

// GET /api/registrations — list, optional ?role=Player|Coach|Official&status=Pending|Approved|Rejected
// Never returns the password field.
router.get("/", async (req, res) => {
  let ref = col();
  if (req.query.role) ref = ref.where("role", "==", req.query.role);
  if (req.query.status) ref = ref.where("status", "==", req.query.status);
  const snap = await ref.get();
  res.json(snap.docs.map((d) => stripPassword(d.data())));
});

// POST /api/registrations — submit a new registration (mirrors registerSubmit())
router.post("/", async (req, res) => {
  const { role, name, email, phone, team, sport, photo, password } = req.body;
  if (!role || !name || !email) {
    return res.status(400).json({ error: "role, name, and email are required" });
  }
  const id = await nextId(COLLECTIONS.registrations);
  const record = {
    id, role, name, email, phone: phone || "",
    team: role === "Official" ? "—" : (team || "—"),
    sport: role === "Official" ? "—" : (sport || "Basketball"),
    status: "Pending",
    date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    photo: photo || null,
  };
  if ((role === "Coach" || role === "Official") && password) record.password = password;
  await col().doc(String(id)).set(record);

  await pushAnnouncement({
    t: `🆕 New ${role} Registration: ${name}`,
    d: `${name} submitted a ${role} registration and is awaiting admin approval.`,
    forAdmin: true,
  });
  await logAudit("Registration Submitted", `${name} submitted a ${role} registration.`, name);

  res.status(201).json(stripPassword(record));
});

// PATCH /api/registrations/:id/approve — approve, and for Coach/Official also
// provision their login account (mirrors the admin "Approve" action).
router.patch("/:id/approve", async (req, res) => {
  const ref = col().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Registration not found" });
  const reg = doc.data();

  await ref.set({ status: "Approved" }, { merge: true });

  if (reg.role === "Coach" && reg.password) {
    await db.collection(COLLECTIONS.coachAccounts).doc(reg.email).set({
      email: reg.email, name: reg.name, password: reg.password, team: null,
    }, { merge: true });
  } else if (reg.role === "Official" && reg.password) {
    await db.collection(COLLECTIONS.officialAccounts).doc(reg.email).set({
      email: reg.email, name: reg.name, password: reg.password,
    }, { merge: true });
  }

  await logAudit("Registration Approved", `${reg.name} (${reg.role}) approved.`, req.body?.actor || "Administrator");
  const updated = await ref.get();
  res.json(stripPassword(updated.data()));
});

// PATCH /api/registrations/:id/reject
router.patch("/:id/reject", async (req, res) => {
  const ref = col().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Registration not found" });
  const reg = doc.data();
  await ref.set({ status: "Rejected" }, { merge: true });
  await logAudit("Registration Rejected", `${reg.name} (${reg.role}) rejected.`, req.body?.actor || "Administrator");
  const updated = await ref.get();
  res.json(stripPassword(updated.data()));
});

// DELETE /api/registrations/:id — deletes the registration AND revokes any
// linked Coach/Official login account (mirrors deleteRegistration() in gwapo.html).
router.delete("/:id", async (req, res) => {
  const ref = col().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Registration not found" });
  const reg = doc.data();

  let accountRevoked = false;
  if (reg.role === "Coach") {
    const acctRef = db.collection(COLLECTIONS.coachAccounts).doc(reg.email);
    if ((await acctRef.get()).exists) { await acctRef.delete(); accountRevoked = true; }
  } else if (reg.role === "Official") {
    const acctRef = db.collection(COLLECTIONS.officialAccounts).doc(reg.email);
    if ((await acctRef.get()).exists) { await acctRef.delete(); accountRevoked = true; }
  }

  await ref.delete();
  await logAudit(
    "Registration Deleted",
    `${reg.name} (${reg.role}) registration deleted.${accountRevoked ? " Their login account was also revoked." : ""}`,
    req.body?.actor || req.query.actor || "Administrator"
  );

  res.json({ deleted: true, id: reg.id, accountRevoked });
});

module.exports = router;
