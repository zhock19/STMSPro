const express = require("express");
const { db, COLLECTIONS, logAudit } = require("../lib/db");

const router = express.Router();
const regCol = () => db.collection(COLLECTIONS.registrations);
const teamsCol = () => db.collection(COLLECTIONS.teams);

// GET /api/players — Search Players screen data.
// Optional: ?q=name/team/sport text filter, ?sport=Basketball, ?available=true
// (available=true excludes anyone already on a team's roster — same rule as
// gwapo.html's availableRegisteredPlayers()).
router.get("/", async (req, res) => {
  let ref = regCol().where("role", "==", "Player").where("status", "==", "Approved");
  if (req.query.sport && req.query.sport !== "all") ref = ref.where("sport", "==", req.query.sport);
  const snap = await ref.get();
  let players = snap.docs.map((d) => d.data());

  if (req.query.available === "true") {
    const teamsSnap = await teamsCol().get();
    const rostered = new Set();
    teamsSnap.forEach((d) => (d.data().players || []).forEach((p) => rostered.add(p)));
    players = players.filter((p) => !rostered.has(p.name));
  }

  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    players = players.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.team || "").toLowerCase().includes(q) ||
        (p.sport || "").toLowerCase().includes(q)
    );
  }

  res.json(players.map(({ password, ...rest }) => rest));
});

// DELETE /api/players/:registrationId — admin/official removing a player
// straight from the Search Players screen (mirrors deletePlayerFromSearch()).
router.delete("/:registrationId", async (req, res) => {
  const ref = regCol().doc(req.params.registrationId);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Player registration not found" });
  const reg = doc.data();
  if (reg.role !== "Player") return res.status(400).json({ error: "This endpoint only deletes Player registrations" });
  await ref.delete();
  await logAudit("Registration Deleted", `${reg.name} (Player) registration deleted.`, req.body?.actor || req.query.actor || "Administrator");
  res.json({ deleted: true, id: reg.id });
});

module.exports = router;
