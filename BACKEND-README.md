# STMS Pro — Firebase Backend

## Ano ang binago
- **Tinanggal** ang lumang `backend/` folder (Express + PostgreSQL). Hindi ito
  ginagamit ng `gwapo.html` kahit kailan — ang app ay direktang kumokonekta sa
  **Firebase Firestore** gamit ang client SDK (tingnan ang `initFirestore()` sa
  `gwapo.html`), kaya patay na code lang yung Postgres backend.
- **Bagong backend**: Firebase Cloud Functions (Node.js + Express) sa ilalim ng
  `functions/`, kasama ang `firebase.json`, `.firebaserc`, `firestore.rules`,
  at `firestore.indexes.json` sa root — ito na ang tamang "backend for
  Firebase" na setup (hindi Postgres).

## Paano i-deploy
```bash
npm install -g firebase-tools      # kung wala pa
firebase login
cd STMSpro
firebase use --add                 # piliin ang "stms-pro" project
cd functions && npm install && cd ..
firebase deploy --only functions,firestore:rules,firestore:indexes
```
Pwede ring subukan muna lokal bago i-deploy:
```bash
cd functions && npm install
firebase emulators:start --only functions,firestore
```

## Structure
```
STMSpro/
├── firebase.json          ← config: functions, firestore rules, hosting rewrite (/api/** → function)
├── .firebaserc             ← project alias → "stms-pro"
├── firestore.rules         ← security rules (see security note below)
├── firestore.indexes.json
├── gwapo.html               ← frontend (unchanged — still works as-is via Firestore SDK)
└── functions/
    ├── package.json
    ├── index.js             ← Express app, mounted as the "api" Cloud Function
    ├── lib/db.js             ← Firestore + id-counter + audit-log helpers
    └── routes/
        ├── tournaments.js
        ├── registrations.js  ← approve/reject/delete (delete also revokes coach/official login)
        ├── teams.js           ← create, roster add/remove, approve, join tournament
        ├── players.js         ← Search Players endpoint
        ├── accounts.js        ← coach/official login (never returns the password field)
        └── misc.js            ← schedule, standings, announcements, audit-log
```

## API endpoints (base URL after deploy: `https://<region>-stms-pro.cloudfunctions.net/api`,
## or `/api/...` on Firebase Hosting once deployed)

| Method | Path | Description |
|---|---|---|
| GET | `/tournaments` | List tournaments (`?status=`) |
| POST | `/tournaments` | Create tournament + notify coaches |
| PATCH | `/tournaments/:id` | Update fields (status, regOpen, assignedOfficial, ...) |
| DELETE | `/tournaments/:id` | Delete + detach linked teams |
| GET | `/registrations` | List (`?role=`, `?status=`) — password never returned |
| POST | `/registrations` | Submit new registration |
| PATCH | `/registrations/:id/approve` | Approve; provisions Coach/Official login account |
| PATCH | `/registrations/:id/reject` | Reject |
| DELETE | `/registrations/:id` | Delete + revoke linked login account if any |
| GET | `/teams` | List (`?tournament=`, `?coach=`) |
| POST | `/teams` | Coach creates a team |
| POST | `/teams/:id/players` | Add a registered+approved player to roster |
| DELETE | `/teams/:id/players/:name` | Remove player from roster |
| PATCH | `/teams/:id` | Update (e.g. approve a tournament join) |
| POST | `/teams/:id/join` | Request to join a tournament (→ Pending) |
| DELETE | `/teams/:id` | Delete team |
| GET | `/players` | Search Players (`?q=`, `?sport=`, `?available=true`) |
| DELETE | `/players/:registrationId` | Admin/official removes a player registration |
| POST | `/accounts/coach/login` | `{email, password}` → account (no password field) |
| POST | `/accounts/official/login` | `{email, password}` → account |
| GET | `/accounts/officials` | List officials (for admin's assignment dropdown) |
| GET/POST | `/schedule` | List / add a match |
| PATCH, DELETE | `/schedule/:id` | Update / remove a match |
| GET, PATCH | `/standings`, `/standings/:id` | Read / update standings |
| GET, POST | `/announcements` | Read / post announcements |
| GET | `/audit-log` | Read audit trail |

## ⚠️ Security note
`gwapo.html` currently has **no Firebase Authentication** — it reads/writes
Firestore directly from the browser, and "login" is just a client-side
password check. To keep the app working exactly as it does today,
`firestore.rules` was left **open** (matches current behavior), and
`coachAccounts` / `officialAccounts` still store **plaintext passwords** that
are technically world-readable straight from Firestore.

The new `/api/accounts/*/login` endpoints above never leak the password
field and are ready to use, but wiring the frontend to call them (instead of
reading `coachAccounts`/`officialAccounts` directly) is a separate frontend
change — say the word kung gusto mo gawin yun susunod, kasama ang paglipat sa
Firebase Authentication at pag-lock down ng `firestore.rules`.
