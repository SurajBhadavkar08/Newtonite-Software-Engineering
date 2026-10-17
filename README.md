# Newtonite — Operations Under Pressure

Internal web app for coordinating operational work items (incidents, approvals, investigations) across teams — with server-enforced authorization, concurrency-safe claims/updates, workflow rules, activity history, and asynchronous side-effect processing.

## Stack

| Layer | Choice |
|-------|--------|
| Backend | Django 5 + Django REST Framework |
| Frontend | React 19 + Vite + Tailwind CSS |
| Database | SQLite (WAL) by default; PostgreSQL-ready |
| Auth (demo) | Persona header `X-Persona-User` for multi-role simulation |

## Quick start

### Prerequisites

- Python 3.10+
- Node.js 18+

### 1. Backend

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate

# macOS / Linux
# source venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py seed_data
python manage.py runserver 8000
```

API: `http://127.0.0.1:8000/api/`

### 2. Frontend (separate terminal)

```bash
cd frontend
npm install
npm run dev
```

UI: `http://127.0.0.1:5173/`  
Vite proxies `/api` → `http://127.0.0.1:8000`.

### 3. Optional: process outbox events

Secondary work (notifications / escalations) is written to an outbox table. Process a batch:

```bash
cd backend
python manage.py process_outbox
```

Or use **Outbox → Process batch** in the UI.

## Demo personas

Switch users from the navbar. Password for all seeded users: `password123`.

| Username | Role highlight |
|----------|----------------|
| `rachel_green` | Superuser / Ops admin |
| `david_kim` | Engineering lead |
| `marcus_vance` | Engineering member |
| `sarah_chen` | Payments & Fraud lead (sensitive) |
| `elena_rostova` | Compliance lead (sensitive) |
| `alex_kumar` | Support member + Payments observer |

## What to try

1. **Dashboard** — scopes (Needs Attention, P0/P1, Pending Approval), search, filters, metrics.
2. **Work item detail** — claim, workflow transitions, comments, approval decide (leads only).
3. **Persona switch** — as `david_kim`, sensitive Payment/Compliance items are hidden.
4. **Concurrency Lab** — simultaneous claim race, stale OCC update, idempotent retry.
5. **Outbox** — pending async events; process a batch and watch status change.

## Automated tests

```bash
cd backend
python -m pytest tests/ -v
```

Coverage focuses on dangerous behaviours: authorization, optimistic locking, claim races, idempotency, workflow guards, and outbox retry/dead-letter.

## Documentation

- [ENGINEERING_DECISIONS.md](./ENGINEERING_DECISIONS.md) — key trade-offs and architecture choices
- Known limitations are listed below

## Known limitations

- **Demo auth only** — `X-Persona-User` is for assessment/demo; not production identity.
- **SQLite default** — fine for local demo; concurrent write contention is mitigated (retries + 409), but PostgreSQL is preferred at scale.
- **Outbox dispatch is simulated** — events are logged/processed locally; no real pager/email/webhook providers.
- **No realtime push** — clients refresh on action / navigation (no WebSockets).
- **Search is `icontains`** — adequate for tens of thousands of rows with indexes; not a full-text search engine.
- **No file attachments / SLA timers / on-call calendars** — intentionally out of scope for a one-day build.
- **Seed data is small** — designed to demonstrate behaviour, not load-test volume.

## Project layout

```
backend/                 Django project (apps: core, work_items, concurrency, outbox)
frontend/                React SPA
ENGINEERING_DECISIONS.md Architecture trade-offs
README.md                This file
```
