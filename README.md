# OrderFlow

A full-stack order and inventory platform: customers browse a catalogue and place orders; admins manage stock, move orders through a lifecycle and watch live sales analytics.

**Stack:** MongoDB (Mongoose) · Express · React 18 (Vite) · Node 20 · TypeScript end to end · Socket.IO · Docker · GitHub Actions

> **Honest status:** this code was written without being able to run `npm install` or MongoDB in the authoring environment. Source files were syntax-checked, and the order state machine was run on its own, but the full test suite has **not** been executed yet. The first CI run on GitHub is the first real test. Fix whatever it reports, then trust it.

## Features

- **Auth:** short-lived JWT access token (kept in memory) plus a rotating refresh token in an httpOnly cookie. Refresh tokens are stored hashed. Re-using an old one revokes all of the user's sessions (theft detection).
- **Roles:** customer and admin, enforced on the server (RBAC middleware) and mirrored in the UI.
- **Catalogue:** search, category, price and stock filters, sorting, pagination. Admin CRUD with soft delete.
- **Orders without overselling:** stock is reserved with an atomic `findOneAndUpdate({ stock: { $gte: qty } })`, with rollback if any line fails. A test fires 8 parallel orders at stock of 3 and expects exactly 3 to succeed.
- **Idempotent checkout:** an `Idempotency-Key` header (partial unique index) makes retries return the same order instead of a duplicate.
- **Order state machine:** `pending → paid → shipped → delivered`, plus `cancelled` (restores stock exactly once). Transitions are compare-and-swap, so two admins cannot race.
- **Real time:** Socket.IO with JWT handshake auth. Customers see their order change status live; admins get new-order alerts and a live dashboard.
- **Analytics:** MongoDB aggregation pipelines (revenue per day, status breakdown, top products, low stock) shown with Recharts.
- **Security basics:** helmet, CORS with credentials, rate limiting, Zod validation on every input, bcrypt, a generic login error (no account enumeration). Money is stored as integer minor units, never floats.

## Run with Docker

```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build
# open http://localhost:8080
```

The Docker database starts empty. To get demo data, use the local setup below (the seed script needs dev tooling that the slim production image leaves out).

## Run locally

Needs Node 20+ and a MongoDB on `localhost:27017`.

```bash
# terminal 1: API
cd server
cp .env.example .env      # then set JWT_SECRET
npm install
npm run seed              # demo data. Dev logins: admin@orderflow.dev / Password123!
npm run dev

# terminal 2: web app
cd client
npm install
npm run dev               # http://localhost:5173
```

## Tests

```bash
cd server && npm test     # integration tests against a real MongoDB (database name must contain "test")
cd client && npm test     # cart reducer unit tests
```

The server tests wipe their collections, so they refuse to run unless the database name contains `test`.

## Project layout

```
server/src
  models/      Mongoose schemas (User, Product, Order, RefreshToken)
  routes/      auth, products, orders, analytics
  services/    orderService: stock reservation, state changes
  domain/      pure order state machine
  middleware/  auth, RBAC, validation, error handling
  realtime.ts  Socket.IO setup
client/src
  api/         axios client with silent token refresh
  auth/ cart/ realtime/   React contexts
  pages/       shop, cart, orders, admin pages, dashboard
```

## Design decisions worth discussing

- **Why not MongoDB transactions?** They need a replica set. Atomic conditional updates plus rollback give the same no-oversell guarantee on a single node and are easy to test.
- **Why keep the access token in memory?** A token in `localStorage` can be stolen by any XSS. In memory it disappears on refresh, and the httpOnly cookie silently gets a new one.
- **Why a 10 second reuse window on refresh tokens?** Two browser tabs can refresh at the same moment; without a grace window the second one would look like token theft.
- **Known limits:** payment is simulated, there is no email, and the Socket.IO server is single-instance (scaling out needs the Redis adapter).
