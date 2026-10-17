# Engineering Decisions

Five important decisions made while building this system, including trade-offs and what was intentionally deferred.

---

## 1. Work items as a workflow aggregate (not a chat log)

**Decision:** Model operational work as a first-class `WorkItem` aggregate with status, priority, assignee, team, version, comments, approval requests, and an append-only `WorkItemActivity` timeline.

**Why:** The brief describes requests that change ownership, need approval, and must remain auditable. Spreadsheets/chat lose “who owns this / what happened / why.” An aggregate with a state machine (`WorkflowEngine`) makes illegal transitions fail on the server, not only in the UI.

**Trade-off:** Less flexible than free-form tasks; richer than a simple ticket CRUD. Custom category-specific fields were deferred.

---

## 2. Authorization is resource-level and server-enforced

**Decision:** Team membership + roles (`MEMBER`, `LEAD`, `ADMIN`, `OBSERVER`) with sensitive teams/categories (Payments, Compliance). List queries filter visibility; object permissions gate writes; only LEAD/ADMIN can decide approvals.

**Why:** Hiding buttons is not enough. Non-members must not read sensitive items even via crafted API calls.

**Trade-off:** Persona-header auth (`X-Persona-User`) simulates multi-user demos without OIDC/SSO. Acceptable for the assessment; replace with real identity before production.

---

## 3. Concurrent correctness: claim locks + OCC versions + idempotency

**Decision:** Handle three failure modes deliberately:

1. **Claim race** — `select_for_update()` inside a transaction; loser gets `409 already_claimed`. On SQLite lock errors, retry and re-read so clients still get `409`, not `500`.
2. **Stale edits** — optimistic concurrency via `version` (and optional `If-Match`); mismatch → `409` with current state.
3. **Retried writes** — `X-Idempotency-Key` caches completed responses so double-clicks / retries do not duplicate work.

**Why:** The brief requires behaviour beyond CRUD when many people act at once.

**Trade-off:** OCC needs the client to send `version`. Pessimistic locking on every field update would be heavier and worse for UX.

---

## 4. Asynchronous side effects via transactional outbox

**Decision:** Primary mutations commit synchronously; secondary work (P0 escalation, assignment notify, approval alerts) is recorded in an `OutboxEvent` table in the same transaction, then processed by a worker/command (`process_outbox`) with retries and dead-letter after max failures.

**Why:** Keeps the API fast and consistent: if the business write rolls back, no orphan notification is emitted. Failures and duplicate processing are visible and recoverable.

**Trade-off:** Dispatch is simulated (logging) rather than wired to real notification providers. No distributed broker (Kafka/SQS) for the one-day scope.

---

## 5. What we intentionally did not build

**Decision:** Prefer a smaller system with coherent correctness over a wide incomplete surface area.

Deferred on purpose:

- Full SSO / RBAC admin UI
- Realtime websockets
- Full-text search engine
- Attachments, SLA clocks, on-call schedules
- Multi-region HA infrastructure

**Pagination, indexes, server-side metrics/filters** were included so the UI does not load the entire dataset into the browser — aligned with the expected scale of tens of thousands of active items.

---

## Summary of critical non-CRUD behaviours demonstrated

| Situation | Mechanism |
|-----------|-----------|
| Two users claim the same item | Row lock + `409 already_claimed` |
| Stale UI overwrite | OCC `version` → `409` |
| Duplicate submit / retry | Idempotency key cache |
| Illegal workflow / missing approval | `WorkflowEngine` guards |
| Sensitive data access | Query + object-level permissions |
| Async notify failure | Outbox retry → dead-letter |
