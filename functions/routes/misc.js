const express = require("express");
const { db, COLLECTIONS, nextId, logAudit } = require("../lib/db");

const router = express.Router();

/* ---------------- Schedule ---------------- */
const scheduleCol = () => db.collection(COLLECTIONS.schedule);

router.get("/schedule", async (req, res) => {
  const snap = await scheduleCol().get();
  res.json(snap.docs.map((d) => d.data()));
});

router.post("/schedule", async (req, res) => {
  const { time, a, b, venue, status } = req.body;
  if (!time || !a || !b || !venue) return res.status(400).json({ error: "time, a, b, and venue are required" });
  const id = await nextId(COLLECTIONS.schedule);
  const record = { id, time, a, b, venue, status: status || "upcoming" };
  await scheduleCol().doc(String(id)).set(record);
  await logAudit("Match Added", `${a} vs ${b} scheduled at ${venue} (${time}).`, req.body.actor || "Administrator");
  res.status(201).json(record);
});

router.patch("/schedule/:id", async (req, res) => {
  const ref = scheduleCol().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Match not found" });
  await ref.set(req.body, { merge: true });
  res.json((await ref.get()).data());
});

router.delete("/schedule/:id", async (req, res) => {
  const ref = scheduleCol().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Match not found" });
  await ref.delete();
  res.json({ deleted: true, id: req.params.id });
});

/* ---------------- Standings ---------------- */
const standingsCol = () => db.collection(COLLECTIONS.standings);

router.get("/standings", async (req, res) => {
  const snap = await standingsCol().get();
  res.json(snap.docs.map((d) => d.data()));
});

router.patch("/standings/:id", async (req, res) => {
  const ref = standingsCol().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Standing not found" });
  await ref.set(req.body, { merge: true });
  res.json((await ref.get()).data());
});

/* ---------------- Announcements ---------------- */
const announceCol = () => db.collection(COLLECTIONS.announcements);

router.get("/announcements", async (req, res) => {
  const snap = await announceCol().get();
  const list = snap.docs.map((d) => d.data()).sort((a, b) => (b.id || 0) - (a.id || 0));
  res.json(list);
});

router.post("/announcements", async (req, res) => {
  const { t, d, forAdmin, forCoach, forCoaches } = req.body;
  if (!t || !d) return res.status(400).json({ error: "t (title) and d (detail) are required" });
  const id = await nextId(COLLECTIONS.announcements);
  const record = { id, t, d, forAdmin: !!forAdmin, forCoach: forCoach || null, forCoaches: !!forCoaches };
  await announceCol().doc(String(id)).set(record);
  res.status(201).json(record);
});

/* ---------------- Audit Log (read-only via API) ---------------- */
const auditCol = () => db.collection(COLLECTIONS.auditLog);

router.get("/audit-log", async (req, res) => {
  const snap = await auditCol().get();
  const list = snap.docs.map((d) => d.data()).sort((a, b) => (b.id || 0) - (a.id || 0));
  res.json(list);
});

module.exports = router;
