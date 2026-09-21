const express = require("express");
const { db, COLLECTIONS, nextId, logAudit, pushAnnouncement } = require("../lib/db");

const router = express.Router();
const col = () => db.collection(COLLECTIONS.tournaments);

// GET /api/tournaments — list all, or ?status=Upcoming|Ongoing|Completed
router.get("/", async (req, res) => {
  let ref = col();
  if (req.query.status) ref = ref.where("status", "==", req.query.status);
  const snap = await ref.get();
  res.json(snap.docs.map((d) => d.data()));
});

// GET /api/tournaments/:id
router.get("/:id", async (req, res) => {
  const doc = await col().doc(req.params.id).get();
  if (!doc.exists) return res.status(404).json({ error: "Tournament not found" });
  res.json(doc.data());
});

// POST /api/tournaments — create + notify coaches (mirrors generateTourney())
router.post("/", async (req, res) => {
  const { name, sport, teams, venue, dates, format, startDate } = req.body;
  if (!name || !venue || !dates || !teams) {
    return res.status(400).json({ error: "name, venue, dates, and teams (slot count) are required" });
  }
  const id = await nextId(COLLECTIONS.tournaments);
  const record = {
    id, name, sport: sport || "Basketball", teams: Number(teams),
    venue, dates, format: format || "Round Robin",
    status: "Upcoming", regOpen: true, published: true, assignedOfficial: null,
  };
  await col().doc(String(id)).set(record);

  await pushAnnouncement({
    t: `📢 New Tournament Open for Registration: ${name}`,
    d: `${sport || ""} · ${format || "Round Robin"} · ${dates} at ${venue}. Registration is now open.`,
    forCoaches: true,
  });
  await logAudit("Tournament Created", `"${name}" created (${sport || ""} · ${format || "Round Robin"}).`, req.body.actor || "Administrator");

  res.status(201).json(record);
});

// PATCH /api/tournaments/:id — partial update (status, regOpen, published, assignedOfficial, ...)
router.patch("/:id", async (req, res) => {
  const ref = col().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Tournament not found" });
  await ref.set(req.body, { merge: true });
  const updated = await ref.get();
  res.json(updated.data());
});

// DELETE /api/tournaments/:id — also detaches any teams linked to it (mirrors deleteTournament())
router.delete("/:id", async (req, res) => {
  const ref = col().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Tournament not found" });
  const t = doc.data();

  const linkedTeamsSnap = await db.collection(COLLECTIONS.teams).where("tournament", "==", t.name).get();
  const batch = db.batch();
  linkedTeamsSnap.forEach((teamDoc) => {
    batch.update(teamDoc.ref, { tournament: "—", status: "Approved", eligibility: "Eligible" });
  });
  batch.delete(ref);
  await batch.commit();

  await logAudit("Tournament Deleted", `"${t.name}" deleted.`, req.body?.actor || req.query.actor || "Administrator");
  res.json({ deleted: true, id: t.id });
});

module.exports = router;
