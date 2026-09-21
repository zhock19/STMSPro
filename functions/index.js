const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");

const tournamentsRoutes = require("./routes/tournaments");
const registrationsRoutes = require("./routes/registrations");
const teamsRoutes = require("./routes/teams");
const playersRoutes = require("./routes/players");
const accountsRoutes = require("./routes/accounts");
const miscRoutes = require("./routes/misc"); // schedule, standings, announcements, audit-log

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "STMS Pro backend is running!" });
});

app.use("/tournaments", tournamentsRoutes);
app.use("/registrations", registrationsRoutes);
app.use("/teams", teamsRoutes);
app.use("/players", playersRoutes);
app.use("/accounts", accountsRoutes);
app.use("/", miscRoutes); // /schedule, /standings, /announcements, /audit-log

app.use((req, res) => res.status(404).json({ error: "Not found" }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// Deployed at: https://<region>-stms-pro.cloudfunctions.net/api
// Also reachable at /api/** via Firebase Hosting rewrite (see firebase.json).
exports.api = onRequest({ region: "asia-southeast1" }, app);
