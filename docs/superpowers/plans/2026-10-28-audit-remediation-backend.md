# Dental SaaS Backend Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every backend finding from the audit report — Critical/High/Medium/Low across performance, scalability, availability, reliability, and security — without breaking the Angular frontend that consumes this API.

**Architecture:** Express 5.3 + Mongoose modular app (`src/modules/<ctx>/{application,domain,infrastructure,presentation}` + `src/shared`). Fixes stay inside existing layers: workflow/atomicity in the orders module, hardening in `config`/`middleware`/`auth`, query cost in repositories/services, new frontend-facing endpoints as ordinary validated routes.

**Tech Stack:** Node.js, Express 5.3, Mongoose 8, Zod, jsonwebtoken, argon2, vitest.

**Spec:** `D:\programming code\VS Project\Dental SaaS Web Application\PROJECT-ISSUES-REPORT.md` (the audit report; finding IDs like `BE-REL-01` are the requirement keys). Task text below embeds the binding details, so the report is reference, not a dependency.

## Global Constraints

- No new runtime dependencies (no Redis, no BullMQ, no job queue — see Rulings).
- Every request input validated with Zod `.strict()`; every query tenant-scoped exactly as existing repositories do.
- Auth/capability checks must never be weakened; `requireAuthenticated` + `requireAnyCapability` stay on every route.
- Typecheck gate: `npx tsc -p tsconfig.build.json --noEmit` exits 0 after every task.
- Test gate: `npx vitest run` — all previously passing tests stay passing; each task adds/updates tests described in its steps.
- Conventional commit messages (repo history style: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`).
- Frontend compatibility: existing response shapes (`{ data: ... }` via `api-response.ts`) and route paths stay stable; only additive changes unless a task explicitly says otherwise.
- Do not modify the frontend repository — it has its own plan.

## Review Focus

1. **Concurrent order writers** — two simultaneous status PATCHes must result in exactly one success and one 409; never two applied transitions (Task 2).
2. **Tenant isolation on every new endpoint** (Task 13 bulk/metrics/count routes) — a token from tenant A must never read tenant B rows, including via bulk id lists.
3. **Fail-open rate limiter** (Task 6) — storage errors must fail open with a log, but a *valid* limiter must still block after the threshold; fail-open must not mean "never limits".
4. **Aggregation rewrites** (Tasks 11, 12) — output must match the previous in-memory computations for the same data; existing report tests and shape must hold.
5. **Auth flows after hardening** (Task 7) — login → refresh → logout → password change must keep working with the Angular client: cookie flags, secret-missing startup behavior, tokenVersion revocation.

---

### Task 1: Workflow transition matrix matches the documented contract

**Finding:** BE-REL-02 (Critical) — `src/modules/orders/application/order-workflow.ts` permits near-any transition (`New → Completed`, `Completed → New`) while `docs/api-contract.md` §5 documents `New → Review → Design → Production → QC → Ready → Completed`.

**Files:**
- Modify: `src/modules/orders/application/order-workflow.ts`
- Test: `src/modules/orders/application/order-workflow.test.ts` (extend)

**Interfaces:**
- Produces: `ALLOWED_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>>` (or equivalent map) and the existing exported transition-validation function with the same signature it has today — Task 2 consumes the predecessor list.

- [ ] **Step 1: Write failing tests** in `order-workflow.test.ts`
  - For every documented edge assert accepted: `New→Review`, `Review→Design`, `Design→Production`, `Production→QC`, `QC→Ready`, `Ready→Completed`.
  - Assert rejected (must throw/return invalid per existing convention): `New→Completed`, `New→QC`, `Completed→New`, `QC→Design`, plus a self-transition `Review→Review`.
  - Assert the matrix has exactly the 7 documented statuses as keys (no phantom/missing status).
- [ ] **Step 2: Run** `npx vitest run src/modules/orders/application/order-workflow.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** an explicit allowed-transitions map in `order-workflow.ts` replacing the permissive logic; validation consults the map. Keep the module's existing exported API shape (Task 2 depends on it).
- [ ] **Step 4: Run** the same vitest command — expect PASS.
- [ ] **Step 5: Typecheck** `npx tsc -p tsconfig.build.json --noEmit` — exit 0.
- [ ] **Step 6: Commit** `fix(orders): enforce documented workflow transition matrix`

### Task 2: Atomic status transitions (race-free)

**Finding:** BE-REL-01 (Critical) — `orders-service.ts:74-76` validates against a pre-read status; `mongoose-orders-repository.ts:92-98` `findOneAndUpdate({ _id, tenantId }, ...)` does not re-assert status, and shared schema options set `versionKey: false`.

**Files:**
- Modify: `src/modules/orders/application/orders-service.ts`
- Modify: `src/modules/orders/infrastructure/mongoose-orders-repository.ts`
- Modify: `src/modules/orders/domain/orders-repository.ts` (signature if needed)
- Test: `src/modules/orders/application/orders-service.scope.test.ts` or new `orders-service.transitions.test.ts`

**Interfaces:**
- Consumes: predecessor lists from Task 1's map.
- Produces: repository update method accepts the set of allowed predecessor statuses (e.g. `updateStatus(id, tenantId, next, allowedPredecessors)` or a status-precondition option) and signals "precondition failed" distinctly from "not found"; service maps precondition failure to HTTP 409 (use the existing `DomainError`/error-mapping convention).

- [ ] **Step 1: Write failing test** — simulate the race: call the service's status-update twice concurrently for the same order where the second transition is only valid from the *old* status; assert exactly one succeeds and the other receives a 409-class error, and final status equals the winner's. (Unit level: assert the repository filter includes the status precondition and that a `null` update result maps to 409, if a live-Mongo race test is impractical.)
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** — include `status: { $in: allowedPredecessors }` in the `findOneAndUpdate` filter; `null` result ⇒ distinguish 409 (status changed) from 404 (missing id) — read current status only to produce the 409 message. Do not re-enable `versionKey` repo-wide (would break every existing update).
- [ ] **Step 4: Run** test — PASS; run full `npx vitest run` — no regressions.
- [ ] **Step 5: Typecheck** — exit 0.
- [ ] **Step 6: Commit** `fix(orders): make status transitions atomic with status-precondition updates`

### Task 3: Run update validators on every update path

**Finding:** BE-REL-04 (High) — only billing's repository sets `runValidators: true`; patient/doctor/order/case/etc. `findOneAndUpdate` calls bypass schema validation on PATCH.

**Files:**
- Modify: every repository/service performing `findOneAndUpdate`/`updateMany` — at minimum `mongoose-patient-repository.ts`, `mongoose-doctor-repository.ts`, `mongoose-orders-repository.ts`, `mongoose-clinic-repository.ts`, `mongoose-user-repository.ts`, cases/change-requests/documents/billing/notifications services (grep for `findOneAndUpdate` and `updateMany` under `src/`).
- Test: one representative test per touched module is NOT required — add a single test proving an invalid enum PATCH is rejected (patients or orders).

**Interfaces:**
- Produces: unchanged public API; only update options gain `runValidators: true` and `context: 'query'`.

- [ ] **Step 1: Write failing test** — PATCH a patient (or order) with a value outside a schema enum/required field via the service layer; assert it is rejected the same way `create` rejects it.
- [ ] **Step 2: Run** — expect FAIL (update succeeds today).
- [ ] **Step 3: Grep** `findOneAndUpdate|updateMany` under `src/`; add `runValidators: true, context: 'query'` to each (excluding the auth rate-limit model if it intentionally uses atomic upserts — note any exclusions in the report).
- [ ] **Step 4: Run** test — PASS; full `npx vitest run` — no regressions (watch for tests that relied on invalid updates succeeding; fix the *test* only if it asserted the buggy behavior, and say so).
- [ ] **Step 5: Typecheck** — exit 0.
- [ ] **Step 6: Commit** `fix: run mongoose update validators on all update paths`

### Task 4: Single-node replica set in compose + backup runbook

**Finding:** BE-REL-03 (High) — `deleteOrderWithSubOrders`/`replaceSubOrders` call `runInTransaction` but `docker-compose.yml` runs standalone `mongo:7` → "Transaction numbers are only allowed on a replica set member" → 500s. BE-AVAIL-03 (Medium) — no backups documented.

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker/mongo-init.js` (or equivalent init script) for `rs.initiate()`
- Modify: `docs/dev-runbook.md` (backup/restore section)

**Interfaces:**
- Produces: compose stack where `mongod` runs as single-node replica set `rs0`; app connects unchanged (connection string may gain `?replicaSet=rs0` — if so, update `src/config/env.ts` default and `.env.example`).

- [ ] **Step 1: Implement** — configure the mongo service with `command: --replSet rs0` (plus keyfile or `--bind_ip_all` as needed), an init mechanism that runs `rs.initiate()` once (healthcheck-gated one-shot service or entrypoint script), and a `healthcheck` for the app. Do not publish `27017` to the host (covered again in Task 18 — coordinate: keep the port unpublished here).
- [ ] **Step 2: Verify** — `docker compose up -d`, wait healthy, `docker compose exec mongo mongosh --eval "rs.status().ok"` returns `1`. If Docker is unavailable in this environment, say so in the report and verify by config review only (note it as unverified).
- [ ] **Step 3: Run** `npx vitest run` — no regressions; typecheck — exit 0.
- [ ] **Step 4: Add** a "Backup & restore" section to `docs/dev-runbook.md`: `mongodump`/`mongorestore` commands for the compose service, cadence recommendation, and a restore drill checklist.
- [ ] **Step 5: Commit** `fix(infra): run mongodb as single-node replica set; document backups`

### Task 5: Health endpoint liveness/readiness with MongoDB check

**Finding:** BE-AVAIL-01 (High) + BE-REL-05 (Medium) — `runtime-health-provider.ts` returns uptime/timestamp only; no DB readiness; `server.ts` connects once with no retry.

**Files:**
- Modify: `src/modules/health/infrastructure/runtime-health-provider.ts`
- Modify: `src/modules/health/domain/health-snapshot.ts`, `src/modules/health/application/get-health-snapshot.ts`, `src/modules/health/presentation/health.routes.ts` / `health.controller.ts`
- Test: new `src/modules/health/...health.test.ts`

**Interfaces:**
- Produces: `GET /api/v1/health/live` → 200 always (process up); `GET /api/v1/health/ready` → 200 when `mongoose.connection.readyState === 1` (plus `db.admin().ping()`), 503 otherwise with the existing response envelope; existing `GET /api/v1/health` keeps working (treat as readiness for backward compatibility).

- [ ] **Step 1: Write failing tests** — ready returns 503 when connection state ≠ 1 (mock/stub the connection), 200 when 1; live returns 200 regardless.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** provider + routes; add a bounded reconnect/retry around initial `mongoose.connect` in `server.ts` (e.g. 10 attempts, exponential backoff, then exit non-zero) — keep the existing graceful-shutdown behavior.
- [ ] **Step 4: Run** — PASS; full vitest — no regressions; typecheck — 0.
- [ ] **Step 5: Commit** `feat(health): liveness/readiness probes with mongodb check`

### Task 6: Rate limiting hardening (refresh/logout/password, fail-open, IP keying)

**Finding:** BE-SEC-01 (High) — only `/api/auth/login` is rate-limited (`app.ts:49`); BE-SEC-02 (High) — `auth-rate-limit.ts:31,57-58` turns Mongo errors into 500 on login (fails closed); BE-SEC-03 (Medium) — limiter skipped when body lacks valid `tenantId`+email; `TRUST_PROXY_HOPS` default 0; `retry-after` reports full window. BE-AVAIL-02 (High) — DB blip takes login down with 500s.

**Files:**
- Modify: `src/middleware/auth-rate-limit.ts`
- Modify: `src/app.ts`
- Modify: `src/config/env.ts` (only if proxy/limiter settings need clearer defaults)
- Test: new `src/middleware/auth-rate-limit.test.ts`

**Interfaces:**
- Produces: `authRateLimit` mounted on `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/password`; limiter keys by client IP for **every** request regardless of body shape (tenant+email remains an additional dimension where present); on limiter-store error → log + `next()` (fail open); `retry-after` = seconds until the record's `expiresAt`.

- [ ] **Step 1: Write failing tests** — (a) N+1th login attempt within window → 429 with correct `retry-after`; (b) store throwing → request proceeds (fail open); (c) body without `tenantId` still counted against the IP bucket; (d) refresh endpoint also limited.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per Interfaces; ensure `trust proxy` guidance is documented in `.env.example` comment for `TRUST_PROXY_HOPS`.
- [ ] **Step 4: Run** — PASS; full vitest — no regressions; typecheck — 0.
- [ ] **Step 5: Commit** `fix(auth): rate-limit all auth endpoints, fail open on store errors, key by ip`

### Task 7: Auth token/session hardening

**Findings:** BE-SEC-04 (cookie flags default weak non-prod), BE-SEC-05 (hardcoded secret fallbacks in `env.ts:4-5`), BE-SEC-06 (`jwt.verify` no `algorithms` pin), BE-SEC-07/BE-REL-08 (`logout` swallows errors), BE-REL-07 (revocation + tokenVersion bump not transactional), X-9 (seed ships `ChangeMe123!` for all accounts).

**Files:**
- Modify: `src/config/env.ts`, `src/modules/auth/application/token-service.ts`, `src/modules/auth/application/auth-service.ts`, `src/scripts/seed-dev.ts`, `.env.example`
- Test: extend `src/modules/auth/application/authorization-policy.test.ts` or new `auth-service.test.ts`

**Interfaces:**
- Produces: no secret fallbacks — startup **throws** if `JWT_SECRET`-class vars are missing unless `NODE_ENV=development` **and** explicit `ALLOW_DEV_SECRETS=true`; `jwt.verify(..., { algorithms: ['HS256'], issuer, audience })`; refresh cookie defaults `secure: true`, `sameSite: 'strict'` (explicit env opt-out only); `logout` logs and rethrows as a mapped error (503 on revocation failure); revocation + `tokenVersion` bump run in one transaction (Task 4 makes transactions work) with a documented non-transactional fallback if the transaction throws `Transaction numbers...`; seed refuses `NODE_ENV=production`.

- [ ] **Step 1: Write failing tests** — verify pins `algorithms` (spy/mock rejecting `none`/RS256); missing secret in test env → startup/config load throws; logout surfaces revocation failure.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** all Interface items; update `.env.example` with the new required vars and `ALLOW_DEV_SECRETS` documentation.
- [ ] **Step 4: Run** — PASS; full vitest — no regressions; typecheck — 0. Confirm dev login still works locally (run seed + login integration test if Mongo available; otherwise note unverified).
- [ ] **Step 5: Commit** `fix(auth): pin jwt algorithms, remove secret fallbacks, harden cookies and logout`

### Task 8: Server timeouts and shutdown tuning

**Finding:** BE-AVAIL-05 (Low/Medium) — no `requestTimeout`/`keepAliveTimeout`/`headersTimeout`; no Mongoose `serverSelectionTimeoutMS`/`socketTimeoutMS`.

**Files:**
- Modify: `src/server.ts`, `src/shared/infrastructure/persistence/mongoose/index.ts`, `src/config/env.ts` (add optional env knobs with defaults)
- Test: config default test (light)

- [ ] **Step 1: Implement** — `keepAliveTimeout` 65_000, `headersTimeout` 66_000, `requestTimeout` 30_000 (documented as env-overridable); Mongoose `serverSelectionTimeoutMS: 5000`, `socketTimeoutMS: 45000`; log the forced-exit reason in the shutdown timer.
- [ ] **Step 2: Run** full vitest — no regressions; typecheck — 0.
- [ ] **Step 3: Commit** `feat(server): configurable request/keepalive and mongoose timeouts`

### Task 9: Indexes, parallel list queries, anchored search

**Findings:** BE-PERF-04 (High) — orders lack `{ tenantId: 1, createdAt: -1 }`; sub-orders lack `{ tenantId: 1, orderId: 1, createdAt: -1 }`. BE-PERF-06 (Medium) — billing/documents/change-requests run `countDocuments` then `find` sequentially. BE-PERF-05 (Medium) — unanchored `/search/i` regex prevents index use.

**Files:**
- Modify: `src/shared/infrastructure/persistence/mongoose/models/order.model.ts`, `sub-order.model.ts` (+ any model whose default list sort is unindexed — audit `sort(` in repositories)
- Modify: `src/modules/billing/application/billing-service.ts`, `src/modules/documents/application/documents-service.ts`, `src/modules/change-requests/application/change-requests-service.ts`
- Modify: list services performing `new RegExp(search, 'i')` (grep `escapeRegExp` usages) → anchor as `^` + escaped term
- Test: index existence test (schema `.index()` assertions), `Promise.all` behavior via existing service tests, search-anchor test (prefix matches, mid-string does not)

- [ ] **Step 1: Write failing tests** — schema indexes include the two compound indexes; `escapeRegExp(search)` builds `^…` anchored pattern (assert mid-string no longer matches); a list service test proving count+find still both executed (existing tests suffice if present — add only what's missing).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** — add indexes; switch the three sequential list endpoints to `await Promise.all([count, find])`; anchor search with `^` (document the behavior change — mid-string search now requires prefix — in `docs/api-contract.md` search parameter description).
- [ ] **Step 4: Run** — PASS; full vitest — no regressions; typecheck — 0.
- [ ] **Step 5: Commit** `perf: compound indexes, parallel list queries, prefix-anchored search`

### Task 10: Cache auth/scope lookups; batch name references

**Findings:** BE-PERF-02 (High) — `auth.middleware.ts:21-28` full user lookup + `http-utils.ts:198-227` scope/doctor resolution = 2-3 extra queries per request. BE-PERF-03 (High) — `orders-service.ts:351-354` `getNameReferences([order])` per entity (~5 queries per read).

**Files:**
- Modify: `src/modules/auth/presentation/auth.middleware.ts`, `src/shared/presentation/http/http-utils.ts`
- Modify: `src/modules/orders/application/orders-service.ts` (batching in DTO serialization for lists)
- Create: `src/shared/application/short-ttl-cache.ts` (small in-process LRU/TTL, no dependency)
- Test: new cache unit test + batching test

**Interfaces:**
- Produces: `getAuthenticatedUserCached(userId)` — TTL 60s in-process cache, invalidated on `tokenVersion`/role change paths (password change, user update); `getNameReferences(entities: T[])` accepts arrays and resolves each reference collection once via `$in`, used by list DTO paths; single-entity path reuses the same batched helper with a 1-element array.

- [ ] **Step 1: Write failing tests** — cache returns same user within TTL and refetches after invalidation; `getNameReferences` for N entities issues at most 1 query per reference collection (mock/spy repository).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per Interfaces; ensure cache cannot leak across tenants (key includes userId which is globally unique — assert in test).
- [ ] **Step 4: Run** — PASS; full vitest — no regressions; typecheck — 0.
- [ ] **Step 5: Commit** `perf(auth): short-ttl user cache and batched name references`

### Task 11: Reports rewritten as aggregation pipelines

**Finding:** BE-PERF-01 (Critical) — `reports-service.ts` loads whole collections in `getDashboardVolume` (~40-43), `getTeamPerformance` (~411-414), `getSubOrderReport` (~532-562), `getReportingSeedData` (~637-655).

**Files:**
- Modify: `src/modules/reports/application/reports-service.ts` (split into per-report helper files if it exceeds ~400 lines after the change — addresses BE-SCAL-06 for this file)
- Test: `src/modules/reports/...` new aggregation tests with fixed fixtures

**Interfaces:**
- Produces: identical response shapes for `getDashboardVolume`, `getTeamPerformance`, `getSubOrderReport`, `getReportingSeedData` — no route or frontend-visible change; each implemented with `$group`/`$facet`/`$lookup` executed by MongoDB, tenant filter applied in the pipeline's first `$match`.

- [ ] **Step 1: Write failing-by-design tests** — for each of the four methods, seed an in-memory fixture set (small, deterministic) and assert exact metric values, proving the aggregation equals the documented formula (compute expected by hand in the test).
- [ ] **Step 2: Run** — FAIL (old implementation may pass shape tests but fail query-count assertions — add an assertion that no `find()` without aggregation is used where feasible; at minimum assert values).
- [ ] **Step 3: Implement** the four pipelines; keep tenant scoping as the first `$match`; preserve null/empty-collection behavior (zeros, empty arrays — not nulls).
- [ ] **Step 4: Run** — PASS; full vitest — no regressions; typecheck — 0.
- [ ] **Step 5: Commit** `perf(reports): compute metrics with aggregation pipelines`

### Task 12: Settings/scan-center aggregations + HTTP caching headers

**Findings:** BE-PERF-07 (Medium) — `settings.routes.ts:144-150` and `scan-center-repository.ts:126-132` load all tenant orders for counts. BE-PERF-08 (Medium) — no `Cache-Control`/ETag anywhere.

**Files:**
- Modify: `src/modules/settings/presentation/settings.routes.ts`, `src/modules/scan-centers/infrastructure/mongoose-scan-center-repository.ts`
- Modify: reference-data routes (settings, health-ish, role/capability lists if any) to emit `Cache-Control: private, max-age=60` + weak ETag from payload hash
- Test: aggregation value test + header assertions

- [ ] **Step 1: Write failing tests** — scan-center counts match fixture via `$group`; a reference-data response carries `Cache-Control` and `ETag`; a changed payload yields a different ETag.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** `$group` by `scanCenterId` (counts) replacing full loads; add a tiny `setReferenceCacheHeaders(res, payload)` helper in `shared/presentation/http/` used by settings + similar reference routes. Do NOT add caching headers to mutable user data lists.
- [ ] **Step 4: Run** — PASS; full vitest — no regressions; typecheck — 0.
- [ ] **Step 5: Commit** `perf: aggregated scan-center counts and reference-data caching headers`

### Task 13: Bulk/metrics/count endpoints + server-generated order numbers

**Findings (frontend blockers):** FE-PERF-01 (bulk sub-orders), FE-PERF-03 (dashboard metrics), FE-PERF-02 (order counts per patient/doctor), FE-REL-05 (server-side order numbers).

**Files:**
- Modify: `src/modules/orders/presentation/orders.routes.ts` (+ controller/service as split), `src/modules/orders/application/orders-service.ts`
- Create: `src/modules/dashboard/...` or add to reports/health-adjacent module — prefer a small `dashboard` presentation route file under `src/modules/` following existing module conventions
- Modify: `src/modules/index.ts` (module registration), `src/docs/openapi.ts` (document new routes)
- Test: new route tests incl. tenant isolation

**Interfaces (exact contracts the frontend plan consumes):**
1. `GET /api/v1/sub-orders?orderId=id1,id2,...` — validated: ≤200 unique ObjectIds, tenant-scoped; returns `{ data: SubOrderJson[] }` (same item shape as the existing per-order endpoint).
2. `GET /api/v1/dashboard/metrics` — returns `{ data: { orders: {total, byStatus: Record<string, number>}, subOrders: {total}, patients: {total}, doctors: {total}, changeRequests: {total}, appointments: {total, last30d}, scanFiles: {total, last30d}, generatedAt: ISOstring } }` — all counts via aggregation, tenant-scoped. (Replaces frontend hardcoded trends — no fake percentages: only real counts/deltas computable from data.)
3. `GET /api/v1/orders/counts?patientIds=a,b,c&doctorIds=d,e,f` — ≤200 ids per param; returns `{ data: { patientCounts: Record<id, number>, doctorCounts: Record<id, number> } }`, tenant-scoped.
4. Order numbers: `orders-service` create assigns `orderNumber` server-side (`DL-` + monotonic/sufficiently-unique scheme — read existing `orderNumber` usage/tests first and keep the `DL-` format); requests may still send one but server value wins; document in openapi.

- [ ] **Step 1: Write failing tests** — for each endpoint: happy path shape, validation rejection (bad id, >200 ids, missing auth/capability), **cross-tenant isolation** (token A + ids from tenant B → empty/filtered results, never B's data); order-number assigned when absent, server value overrides client-supplied.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per contracts; register capability requirements consistent with the sibling list routes (same capabilities as reading sub-orders/orders/dashboard).
- [ ] **Step 4: Run** — PASS; full vitest — no regressions; typecheck — 0.
- [ ] **Step 5: Update** `docs/api-contract.md` + `src/docs/openapi.ts` for the four additions.
- [ ] **Step 6: Commit** `feat(api): bulk sub-orders, dashboard metrics, order counts, server order numbers`

### Task 14: Centralized role/scope helpers (dedupe tenant-isolation logic)

**Findings:** X-3 (Medium) + BE-SEC-10 (Low) — role-alias tables duplicated (`authorization-policy.ts:148-154` ↔ `http-utils.ts:260-266`); `buildOrderOwnershipFilter` duplicated in `mongoose-orders-repository.ts` and `documents-service.ts` with similar ad-hoc filters in billing/cases/reports.

**Files:**
- Create: `src/shared/application/normalize-role.ts` (or under existing shared location), `src/shared/application/scope-filter.ts`
- Modify: `authorization-policy.ts`, `http-utils.ts`, and every module with a duplicated ownership-filter builder (grep `ownershipFilter|buildOrderOwnership|scopeFilter`)
- Test: new `normalize-role.test.ts`, `scope-filter.test.ts`

- [ ] **Step 1: Write failing tests** — `normalizeRole` produces identical outputs to both current tables for every alias present in either (enumerate them in the test); `buildScopeFilter` output equals the current `buildOrderOwnershipFilter` output for admin/staff/doctor scopes (golden tests copied from current behavior).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** helpers; switch both call sites (and other duplicated builders) to them; delete the duplicates. Behavior must be byte-identical — this is a pure refactor.
- [ ] **Step 4: Run** — PASS; full vitest — no regressions (scope tests are the safety net); typecheck — 0.
- [ ] **Step 5: Commit** `refactor: centralize role normalization and scope-filter builders`

### Task 15: Error taxonomy unification

**Finding:** BE-REL-06 (Medium) — orders raise `DomainError`, billing/documents/users raise `ApplicationError` with ad-hoc codes; `mapErrorToHttp` can fall through to a degraded path for unmapped codes.

**Files:**
- Modify: `src/shared/presentation/http/error-mapping.ts` (exhaustive default → 500 with logged code, never undefined-branch)
- Modify: modules raising ad-hoc errors (grep `ApplicationError` usages) to standard codes
- Test: `error-mapping` tests incl. unknown-code default

- [ ] **Step 1: Write failing tests** — unknown error code maps to a safe 500 with generic message (no internals leaked); each standardized error code maps to its documented status (404/409/422/403...).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** default branch + standardize ad-hoc codes to the closed union; keep response bodies unchanged where the frontend already matches on them (grep frontend-facing docs).
- [ ] **Step 4: Run** — PASS; full vitest — no regressions; typecheck — 0.
- [ ] **Step 5: Commit** `fix(errors): exhaustive error mapping and unified error codes`

### Task 16: Cursor pagination (opt-in)

**Finding:** BE-SCAL-01 (Medium) — skip/limit only; deep pages degrade.

**Files:**
- Modify: `src/shared/application/contracts/pagination.ts` + repositories for orders, notifications, patients (the large lists)
- Test: pagination contract tests

**Interfaces:**
- Produces: list routes accept optional `cursor` (opaque, base64 of `{ createdAt, id }`) + `limit`; when present, response adds `data.nextCursor: string | null` and ignores `page`; `page`/`skip` behavior unchanged for the Angular client (additive only).

- [ ] **Step 1: Write failing tests** — cursor walk over 3 pages returns every record exactly once in stable order; invalid cursor → 400; `page` path unchanged.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** encode/decode helpers + repository `findAfter` variants for the three lists; document in api-contract.
- [ ] **Step 4: Run** — PASS; full vitest — no regressions; typecheck — 0.
- [ ] **Step 5: Commit** `feat(pagination): opt-in cursor pagination for large lists`

### Task 17: Typed model exports (kill `Model<any>`)

**Finding:** BE-SCAL-05 (Low) — all 15 model exports are `Model<any>`; `no-explicit-any` disabled for the models dir.

**Files:**
- Modify: `src/shared/infrastructure/persistence/mongoose/models/*.ts` (all), `src/shared/infrastructure/persistence/mongoose/models/index.ts`
- Modify: `eslint.config.mjs` (re-enable `no-explicit-any` for models)
- Modify: repository typings as needed to satisfy the stronger types

- [ ] **Step 1: Implement** — type each export (`model<OrderDocument>('Order', schema) as Model<OrderDocument>` pattern); fix any type errors this surfaces in repositories (that is the point — record each fix).
- [ ] **Step 2: Run** typecheck — exit 0 (this task's gate is typecheck, since `Model<any>` hid errors behind tests that can't see them); full vitest — no regressions.
- [ ] **Step 3: Commit** `refactor(models): replace Model<any> with typed model exports`

### Task 18: Docker and repo hygiene

**Findings:** BE-SCAL-03 (Medium) — compose lacks `restart`, resource limits, publishes `27017`, no app healthcheck; Dockerfile runs as root, no `HEALTHCHECK`; no `.dockerignore`. X-4 (Medium) — `build.log`/`lint.log`/`typecheck.log` tracked; `.gitignore` only 4 lines.

**Files:**
- Modify: `docker-compose.yml`, `Dockerfile`, `.gitignore`
- Create: `.dockerignore`
- Modify: none for logs (removal via git)

- [ ] **Step 1: Implement** — `.dockerignore` (`.git`, `.env*` except `.env.example`, `*.log`, `node_modules`, `coverage`, `docs`, `postman`); Dockerfile: non-root `USER node`, `HEALTHCHECK` hitting `/api/v1/health/live`; compose: remove host `27017` publish, `restart: unless-stopped`, `deploy.resources.limits` (or `mem_limit`/`cpus` for non-swarm), app healthcheck; `.gitignore`: add `*.log`, `.env.*`, `coverage/`, `*.tsbuildinfo`, `!.env.example`.
- [ ] **Step 2: Remove tracked logs** — `git rm --cached build.log lint.log typecheck.log` (keep files on disk ignored, or delete them — your choice, note it).
- [ ] **Step 3: Verify** — `docker compose config` valid; typecheck + vitest unaffected (no src changes).
- [ ] **Step 4: Commit** `chore: docker hardening, dockerignore, untrack build logs` (two commits acceptable: chore + infra).

### Task 19: Docs/contract sync, docs gating, CSP/SRI

**Findings:** X-2 (High) — api-contract documents nonexistent routes (`POST /orders/{id}/workflow-transitions`, sub-order detail/forms/scans/activity-notes endpoints) and wrong roles (`ops`/`billing`/`support`); X-7 — Postman seed accounts mismatch `seed-dev.ts`; X-8 — undocumented `/api/order` legacy rewrite; BE-SEC-08 (Low) — unauthenticated `/api/docs`; BE-SEC-09 (Low) — no CSP, Swagger CDN without SRI.

**Files:**
- Modify: `docs/api-contract.md`, `postman/Dental-SaaS-API.postman_collection.json`, `src/app.ts`, `src/docs/openapi.routes.ts`, `src/docs/openapi.ts`, `src/middleware/security-headers.ts`, `src/config/env.ts` (`DOCS_ENABLED` flag)

**Ruling (X-2):** the workflow-transitions route and sub-order detail endpoints are NOT implemented — do not build them here (frontend does not call them); correct the contract to match reality and mark the strict workflow now enforced by Task 1.

- [ ] **Step 1: Implement** — rewrite api-contract §5 workflow to the Task-1 matrix; delete/mark-unimplemented the nonexistent endpoints; fix role list to `admin/staff/manager/doctor/technician`; document legacy `/api/order` alias with sunset note; align Postman collection variables to `seed-dev.ts` accounts (`dev-admin@example.test` / `ChangeMe123!`); gate `/api/docs` + `/api/openapi.json` behind `DOCS_ENABLED=true` (default: enabled only when `NODE_ENV !== 'production'`); add `Content-Security-Policy` baseline to `security-headers.ts` (at minimum `default-src 'self'`; docs page may need a nonce/`'unsafe-inline'` for Swagger — scope it to the docs route if so) and add `integrity`+`crossorigin` to the Swagger CDN tags (compute real SRI hashes) or self-host the assets.
- [ ] **Step 2: Verify** — `npx vitest run` green; docs route behavior tests (flag off → 404) added; typecheck 0.
- [ ] **Step 3: Commit** `docs: sync contract with implementation; gate docs; add csp and sri`

### Task 20: Auth and isolation test suite

**Finding:** BE-REL-09 (Medium) — zero tests for the auth flow (login/refresh/password), no per-module tenant-scope isolation integration tests, no report-correctness tests beyond Task 11's.

**Files:**
- Create: `src/tests/auth.integration.test.ts`, `src/tests/tenant-isolation.integration.test.ts`
- Extend: `src/tests/api.integration.test.ts` only if shared helpers live there

**Interfaces:**
- Consumes: existing `src/tests/setup-env.ts` helpers; the endpoints from Task 13.

- [ ] **Step 1: Write tests** — auth: login success/failure, rate-limit 429 (with limiter store stubbed), refresh rotation (old refresh rejected after use), logout revocation, password change revokes sessions, missing-secret startup throw (Task 7 behaviors); isolation: for 3 resources (orders, patients, documents) create rows in two tenants, assert tenant-A token never sees tenant-B rows in list, detail-by-id, update, delete, and the Task-13 bulk endpoints.
- [ ] **Step 2: Run** `npx vitest run` — all pass (these tests may drive small fixes; if a test reveals a real isolation bug, fix it in the module and note it — that is in scope).
- [ ] **Step 3: Typecheck** — 0.
- [ ] **Step 4: Commit** `test: auth flow and tenant isolation coverage`

---

## Rulings (recorded at plan time)

- **BE-SCAL-02 (job queue) — deferred with rationale:** Tasks 11/12 move report work into DB-side aggregations (milliseconds), removing the stated need for precomputation; adding Redis/BullMQ violates Global Constraint "no new runtime dependencies". Revisit after load testing. *If wrong: re-add a queue when aggregation latency is proven insufficient.*
- **BE-SCAL-06 (god-file splits) — partial:** reports-service split folded into Task 11 (only while rewriting); `seed-dev.ts`/`openapi.ts` splits deferred (test/fixture files — low churn cost). *If wrong: merge friction shows up in later PRs.*
- **BE-PERF-05 (search) — prefix-anchoring chosen over Atlas Search** (no Atlas available); behavior change documented in Task 9. *If wrong: users lose mid-string search; revert anchor.*
- **X-2 (missing endpoints) — contract corrected, endpoints not built** (frontend does not call them). *If wrong: future consumers discover the gap in the contract's "unimplemented" notes.*
- **Replica set instead of transaction fallback (Task 4):** compose-level fix makes transactions work everywhere the repo's own compose runs; a code fallback for standalone Mongo is not built. *If wrong: anyone on standalone Mongo gets a clear transaction error — document in runbook.*
- **BE-SCAL-04 (rate limiter Mongo writes) — no change:** the finding itself judges the current two-upserts-per-attempt acceptable and cross-instance correct; Redis migration is a dependency violation (Global Constraint). *If wrong: login write load grows — revisit with Task 10's cache patterns.*
