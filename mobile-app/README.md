# GKC Collection - mobile app (Expo)

Offline-first mobile client for the Daily Collection system. Same roles and screens as the web app
(Collector / Owner / Admin), English + Marathi.

## How offline works
- Every collection, amount edit and delete is written to a local SQLite database (one file per user)
  and queued in an **outbox**. The app never waits for the network.
- The sync engine pushes the outbox (`POST /api/sync/push`) and then pulls fresh customers, entries and
  permissions (`GET /api/sync/pull`). It runs on reconnect, when the app comes to the foreground, after
  each save while online, every minute while something is waiting, and from the **Sync now** button.
- Entries carry a client generated id, so a retried upload can never create duplicates.
- Rejected items (e.g. a date the owner has not approved) stay on the phone as **failed** with Retry / Discard.
- Adding / editing customers, permission requests, user management and exports need a connection.
- Tokens issued to the app last 90 days and are refreshed whenever the phone is online.

## Run
```bash
npm install
cp .env.example .env     # optional, the server URL can also be set inside the app
npx expo start
```
Backend: `cd ../backend && npm run dev` (port 5000).
