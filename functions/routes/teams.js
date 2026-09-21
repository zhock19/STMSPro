const express = require("express");
const { db, COLLECTIONS, nextId, logAudit, pushAnnouncement } = require("../lib/db");

const router = express.Router();
const col = () => db.collection(COLLECTIONS.teams);
const regCol = () => db.collection(COLLECTIONS.registrations);

// GET /api/teams — list, optional ?tournament=Name&coach=Coach+Name
router.get("/", async (req, res) => {
  let ref = col();
  if (req.query.tournament) ref = ref.where("tournament", "==", req.query.tournament);
  if (req.query.coach) ref = ref.where("coach", "==", req.query.coach);
  const snap = await ref.get();
  res.json(snap.docs.map((d) => d.data()));
});

// POST /api/teams — a coach creates their team (mirrors createMyTeam())
router.post("/", async (req, res) => {
  const { name, sport, coach, coachEmail } = req.body;
  if (!name || !coach) return res.status(400).json({ error: "name and coach are required" });

  const existing = await col().where("name", "==", name).get();
  if (!existing.empty) return res.status(409).json({ error: "A team with that name already exists" });

  const id = await nextId(COLLECTIONS.teams);
  const record = {
    id, name, sport: sport || "Basketball", coach,
    tournament: "—", status: "Approved", eligibility: "Eligible", players: [],
  };
  await col().doc(String(id)).set(record);

  if (coachEmail) {
    await db.collection(COLLECTIONS.coachAccounts).doc(coachEmail).set({ team: name }, { merge: true });
  }
  await logAudit("Team Created", `${coach} created team "${name}" (${sport || "Basketball"}).`, coach);
  res.status(201).json(record);
});

// POST /api/teams/:id/players — add a registered + approved player to the roster.
// Only requirement is "registered and admin-approved, and not already rostered
// anywhere" — matches the fix applied in gwapo.html (no sport-matching gate).
router.post("/:id/players", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Player name is required" });

  const ref = col().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Team not found" });
  const team = doc.data();

  const regSnap = await regCol().where("role", "==", "Player").where("status", "==", "Approved").where("name", "==", name).get();
  if (regSnap.empty) return res.status(400).json({ error: "That name isn't a registered, approved player" });

  const allTeamsSnap = await col().get();
  const alreadyRostered = allTeamsSnap.docs.some((d) => (d.data().players || []).includes(name));
  if (alreadyRostered) return res.status(409).json({ error: "That player is already on a roster" });

  const players = [...(team.players || []), name];
  await ref.update({ players });
  res.json({ ...team, players });
});

// DELETE /api/teams/:id/players/:name
router.delete("/:id/players/:name", async (req, res) => {
  const ref = col().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Team not found" });
  const team = doc.data();
  const players = (team.players || []).filter((p) => p !== req.params.name);
  await ref.update({ players });
  res.json({ ...team, players });
});

// PATCH /api/teams/:id — e.g. { "status": "Approved" } to approve a pending tournament join
router.patch("/:id", async (req, res) => {
  const ref = col().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Team not found" });
  const before = doc.data();
  await ref.set(req.body, { merge: true });
  const after = (await ref.get()).data();

  if (req.body.status === "Approved" && before.status !== "Approved") {
    await logAudit("Team Approved", `"${after.name}" approved for ${after.tournament}.`, req.body.actor || "Administrator");
    await pushAnnouncement({
      t: `✅ ${after.name} is confirmed for ${after.tournament}`,
      d: "Your registration has been approved by the admin. Your team is now eligible to compete.",
      forCoach: after.coach,
    });
  }
  res.json(after);
});

// POST /api/teams/:id/join — request to join a tournament (mirrors registerTeamForTournament())
router.post("/:id/join", async (req, res) => {
  const { tournamentId } = req.body;
  const teamRef = col().doc(req.params.id);
  const teamDoc = await teamRef.get();
  if (!teamDoc.exists) return res.status(404).json({ error: "Team not found" });
  const team = teamDoc.data();

  const tDoc = await db.collection(COLLECTIONS.tournaments).doc(String(tournamentId)).get();
  if (!tDoc.exists) return res.status(404).json({ error: "Tournament not found" });
  const t = tDoc.data();

  if (!t.published) return res.status(400).json({ error: "Tournament is not yet published" });
  if (!t.regOpen) return res.status(400).json({ error: "Registration for this tournament is closed" });

  const approvedSnap = await col().where("tournament", "==", t.name).where("status", "==", "Approved").get();
  if (approvedSnap.size >= t.teams) return res.status(400).json({ error: "Tournament is already full" });

  await teamRef.set({ tournament: t.name, status: "Pending", eligibility: "Under Review" }, { merge: true });
  await logAudit("Team Registration Requested", `${team.name} requested to join "${t.name}" — awaiting admin approval.`, team.coach);
  await pushAnnouncement({
    t: "🔔 New Team Registration Awaiting Approval",
    d: `${team.name} (Coach ${team.coach || ""}) requested to join "${t.name}".`,
    forAdmin: true,
  });

  const updated = (await teamRef.get()).data();
  res.json(updated);
});

// DELETE /api/teams/:id
router.delete("/:id", async (req, res) => {
  const ref = col().doc(req.params.id);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Team not found" });
  const t = doc.data();
  await ref.delete();
  await logAudit("Team Deleted", `"${t.name}" deleted.`, req.body?.actor || req.query.actor || "Administrator");
  res.json({ deleted: true, id: t.id });
});

module.exports = router;
