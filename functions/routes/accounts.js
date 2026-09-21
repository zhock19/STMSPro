const express = require("express");
const { db, COLLECTIONS } = require("../lib/db");

const router = express.Router();

function stripPassword(acct) {
  if (!acct) return acct;
  const { password, ...rest } = acct;
  return rest;
}

// POST /api/accounts/coach/login  { email, password }
router.post("/coach/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  const doc = await db.collection(COLLECTIONS.coachAccounts).doc(email).get();
  if (!doc.exists || doc.data().password !== password) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  res.json(stripPassword(doc.data()));
});

// POST /api/accounts/official/login  { email, password }
router.post("/official/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  const doc = await db.collection(COLLECTIONS.officialAccounts).doc(email).get();
  if (!doc.exists || doc.data().password !== password) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  res.json(stripPassword(doc.data()));
});

// GET /api/accounts/officials — list officials (e.g. for the "Assign Official" dropdown), no passwords
router.get("/officials", async (req, res) => {
  const snap = await db.collection(COLLECTIONS.officialAccounts).get();
  res.json(snap.docs.map((d) => stripPassword(d.data())));
});

module.exports = router;
